const config = require("./config");
const logger = require("./logger");
const { sleep } = require("./utils");

const cache = new Map(); // key -> { at, data }
let binanceBlockedUntil = 0;
let binanceErrorUntil = 0;
let bybitErrorUntil = 0;
let coingeckoRateLimitedUntil = 0;

function getFreshCache(key, maxAgeMs) {
    const entry = cache.get(key);
    if (entry && Date.now() - entry.at <= maxAgeMs) return entry.data;
    return null;
}

function getStaleCache(key) {
    const entry = cache.get(key);
    return entry ? entry.data : null;
}

function setCache(key, data) {
    cache.set(key, { at: Date.now(), data });
}

function clearSymbolCache(symbol) {
    for (const key of cache.keys()) {
        if (key.includes(symbol)) cache.delete(key);
    }
}

function clearAllCache() {
    cache.clear();
    binanceBlockedUntil = 0;
    binanceErrorUntil = 0;
    bybitErrorUntil = 0;
    coingeckoRateLimitedUntil = 0;
}

async function fetchJson(url, timeoutMs = 15000, extraHeaders = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(url, { signal: controller.signal, headers: { Accept: "application/json", ...extraHeaders } });
        const text = await res.text();
        let data;
        try { data = text ? JSON.parse(text) : null; } catch (_) { data = text; }
        if (!res.ok) {
            const err = new Error(`HTTP ${res.status} ${typeof data === "string" ? data.slice(0, 200) : data?.msg || ""}`);
            err.status = res.status;
            err.body = data;
            throw err;
        }
        return data;
    } finally {
        clearTimeout(timer);
    }
}

function isRestrictedError(err) {
    return err?.status === 451 || /restricted location/i.test(String(err?.message || ""));
}

function isTemporaryBinanceError(err) {
    if (!err) return false;
    if (err.status === 429 || err.status >= 500) return true;
    const msg = String(err.message || "").toLowerCase();
    return msg.includes("timeout") || msg.includes("network") || msg.includes("fetch failed") || msg.includes("abort");
}

function isRateLimitError(err) {
    return err?.status === 429 || /rate limit/i.test(String(err?.message || ""));
}

function binanceUsable() {
    return Date.now() > binanceBlockedUntil && Date.now() > binanceErrorUntil && config.market.provider !== "coingecko";
}

function bybitUsable() {
    return Date.now() > bybitErrorUntil && config.market.provider !== "coingecko" && config.market.provider !== "binance";
}

function coingeckoUsable() {
    return Date.now() > coingeckoRateLimitedUntil && config.market.provider !== "binance";
}

async function fetchBinanceJson(pathname, params = {}) {
    const query = new URLSearchParams(params).toString();
    let lastErr = null;
    for (const base of config.market.binanceBases) {
        try {
            const headers = config.market.binanceApiKey ? { "X-MBX-APIKEY": config.market.binanceApiKey } : {};
            return await fetchJson(`${base}${pathname}${query ? `?${query}` : ""}`, 15000, headers);
        } catch (err) {
            lastErr = err;
            if (isRestrictedError(err)) continue; // coba base lain dulu
            if (isTemporaryBinanceError(err)) continue;
            throw err;
        }
    }
    throw lastErr || new Error("Semua endpoint Binance gagal");
}

async function fetchBybitJson(pathname, params = {}) {
    const query = new URLSearchParams(params).toString();
    return fetchJson(`${config.market.bybitBase}${pathname}${query ? `?${query}` : ""}`, 15000);
}

async function fetchCoinGeckoJson(pathname, params = {}) {
    const base = config.market.coingeckoApiType === "pro" ? "https://pro-api.coingecko.com/api/v3" : "https://api.coingecko.com/api/v3";
    const query = new URLSearchParams(params).toString();
    const headerName = config.market.coingeckoApiType === "pro" ? "x-cg-pro-api-key" : "x-cg-demo-api-key";
    const headers = config.market.coingeckoApiKey ? { [headerName]: config.market.coingeckoApiKey } : {};
    return fetchJson(`${base}${pathname}${query ? `?${query}` : ""}`, 15000, headers);
}

function mapBinanceTicker(data, symbol, source = "Binance") {
    return {
        symbol,
        source,
        price: Number(data.lastPrice),
        changePct: Number(data.priceChangePercent),
        high24h: Number(data.highPrice),
        low24h: Number(data.lowPrice),
        volume: Number(data.volume),
        at: Date.now()
    };
}

async function getBinanceTicker(symbol) {
    const data = await fetchBinanceJson("/api/v3/ticker/24hr", { symbol });
    return mapBinanceTicker(data, symbol, "Binance");
}

async function getBybitTicker(symbol) {
    const data = await fetchBybitJson("/v5/market/tickers", { category: "spot", symbol });
    const row = data?.result?.list?.[0];
    if (!row) throw new Error("Bybit: simbol tidak ditemukan");
    const price = Number(row.lastPrice);
    const prev = Number(row.prevPrice24h) || price;
    return {
        symbol,
        source: "Bybit",
        price,
        changePct: prev ? ((price - prev) / prev) * 100 : 0,
        high24h: Number(row.highPrice24h),
        low24h: Number(row.lowPrice24h),
        volume: Number(row.volume24h),
        at: Date.now()
    };
}

async function getCoinGeckoTicker(asset) {
    const data = await fetchCoinGeckoJson("/coins/markets", {
        vs_currency: "usd",
        ids: asset.coingeckoId
    });
    const row = Array.isArray(data) ? data[0] : null;
    if (!row) throw new Error("CoinGecko: data tidak ditemukan");
    return {
        symbol: asset.symbol,
        source: "CoinGecko",
        price: Number(row.current_price),
        changePct: Number(row.price_change_percentage_24h || 0),
        high24h: Number(row.high_24h),
        low24h: Number(row.low_24h),
        volume: Number(row.total_volume),
        at: Date.now()
    };
}

/**
 * Ambil ticker dengan rantai fallback Binance -> Bybit -> CoinGecko.
 * options.force = true akan melewati cache fresh (tetap dipakai sebagai fallback bila semua provider gagal).
 */
async function getTicker(asset, options = {}) {
    const cacheKey = `ticker:${asset.symbol}`;
    if (!options.force) {
        const fresh = getFreshCache(cacheKey, config.market.tickerCacheMs);
        if (fresh) return fresh;
    }

    if (binanceUsable()) {
        try {
            const ticker = await getBinanceTicker(asset.symbol);
            setCache(cacheKey, ticker);
            return ticker;
        } catch (err) {
            if (isRestrictedError(err)) {
                binanceBlockedUntil = Date.now() + config.market.binanceRestrictedCooldownMs;
                logger.warn(`Binance restricted (451). Cooldown sampai ${new Date(binanceBlockedUntil).toISOString()}`);
            } else if (isTemporaryBinanceError(err)) {
                binanceErrorUntil = Date.now() + config.market.binanceErrorCooldownMs;
            }
        }
    }

    if (bybitUsable()) {
        try {
            const ticker = await getBybitTicker(asset.symbol);
            setCache(cacheKey, ticker);
            return ticker;
        } catch (err) {
            bybitErrorUntil = Date.now() + config.market.binanceErrorCooldownMs;
        }
    }

    if (coingeckoUsable()) {
        try {
            const ticker = await getCoinGeckoTicker(asset);
            setCache(cacheKey, ticker);
            return ticker;
        } catch (err) {
            if (isRateLimitError(err)) {
                coingeckoRateLimitedUntil = Date.now() + config.market.coingeckoRateCooldownMs;
            }
        }
    }

    const stale = getStaleCache(cacheKey);
    if (stale) return { ...stale, stale: true };
    throw new Error(`Semua provider market gagal untuk ${asset.symbol}`);
}

function intervalToMs(interval) {
    const unit = interval.slice(-1);
    const value = Number(interval.slice(0, -1));
    const map = { m: 60_000, h: 3_600_000, d: 86_400_000 };
    return value * (map[unit] || 60_000);
}

function mapBinanceKlines(raw) {
    return raw.map(k => ({
        time: k[0],
        open: Number(k[1]),
        high: Number(k[2]),
        low: Number(k[3]),
        close: Number(k[4]),
        volume: Number(k[5])
    }));
}

async function getBinanceKlines(symbol, interval, limit) {
    const raw = await fetchBinanceJson("/api/v3/klines", { symbol, interval, limit });
    return mapBinanceKlines(raw);
}

async function getBybitKlines(symbol, interval, limit) {
    const map = { "1m": "1", "5m": "5", "15m": "15", "30m": "30", "1h": "60", "4h": "240", "1d": "D" };
    const data = await fetchBybitJson("/v5/market/kline", { category: "spot", symbol, interval: map[interval] || "15", limit });
    const rows = data?.result?.list || [];
    return rows.map(r => ({
        time: Number(r[0]),
        open: Number(r[1]),
        high: Number(r[2]),
        low: Number(r[3]),
        close: Number(r[4]),
        volume: Number(r[5])
    })).reverse();
}

async function getCoinGeckoKlines(asset, intervalMs, limit) {
    const days = Math.max(1, Math.ceil((intervalMs * limit) / 86_400_000));
    const data = await fetchCoinGeckoJson(`/coins/${asset.coingeckoId}/market_chart`, {
        vs_currency: "usd",
        days: Math.min(days, 365)
    });
    const prices = data?.prices || [];
    const bucketed = [];
    let bucketStart = null;
    let bucket = null;
    for (const [time, price] of prices) {
        const slot = Math.floor(time / intervalMs) * intervalMs;
        if (slot !== bucketStart) {
            if (bucket) bucketed.push(bucket);
            bucketStart = slot;
            bucket = { time: slot, open: price, high: price, low: price, close: price, volume: 0 };
        } else {
            bucket.high = Math.max(bucket.high, price);
            bucket.low = Math.min(bucket.low, price);
            bucket.close = price;
        }
    }
    if (bucket) bucketed.push(bucket);
    return bucketed.slice(-limit);
}

/**
 * Ambil candle dengan fallback Binance -> Bybit -> CoinGecko, lalu disinkronkan
 * dengan harga live terbaru pada candle terakhir supaya indikator tidak basi.
 */
async function getKlines(asset, interval = "15m", limit = 150, options = {}) {
    const cacheKey = `klines:${asset.symbol}:${interval}:${limit}`;
    if (!options.force) {
        const fresh = getFreshCache(cacheKey, config.market.candleCacheMs);
        if (fresh) return fresh;
    }

    let candles = null;
    if (binanceUsable()) {
        try {
            candles = await getBinanceKlines(asset.symbol, interval, limit);
        } catch (err) {
            if (isRestrictedError(err)) binanceBlockedUntil = Date.now() + config.market.binanceRestrictedCooldownMs;
            else if (isTemporaryBinanceError(err)) binanceErrorUntil = Date.now() + config.market.binanceErrorCooldownMs;
        }
    }
    if (!candles && bybitUsable()) {
        try {
            candles = await getBybitKlines(asset.symbol, interval, limit);
        } catch (err) {
            bybitErrorUntil = Date.now() + config.market.binanceErrorCooldownMs;
        }
    }
    if (!candles && coingeckoUsable()) {
        try {
            candles = await getCoinGeckoKlines(asset, intervalToMs(interval), limit);
        } catch (err) {
            if (isRateLimitError(err)) coingeckoRateLimitedUntil = Date.now() + config.market.coingeckoRateCooldownMs;
        }
    }

    if (!candles || candles.length < 10) {
        const stale = getStaleCache(cacheKey);
        if (stale) return stale;
        throw new Error(`Tidak ada data candle untuk ${asset.symbol}`);
    }

    setCache(cacheKey, candles);
    return candles;
}

/** Sinkronkan candle terakhir dengan ticker live (harga close dan high/low). */
function mergeLiveIntoCandles(candles, ticker) {
    if (!candles?.length || !ticker?.price) return candles;
    const merged = candles.slice();
    const last = { ...merged[merged.length - 1] };
    last.close = ticker.price;
    last.high = Math.max(last.high, ticker.price);
    last.low = Math.min(last.low, ticker.price);
    merged[merged.length - 1] = last;
    return merged;
}

function marketProviderLabel() {
    const labels = {
        auto: "AUTO (Binance -> Bybit -> CoinGecko)",
        binance: "BINANCE saja",
        bybit: "BYBIT saja",
        coingecko: "COINGECKO saja"
    };
    return labels[config.market.provider] || "AUTO";
}

function statusSnapshot() {
    return {
        provider: marketProviderLabel(),
        binanceBlockedUntil,
        binanceErrorUntil,
        bybitErrorUntil,
        coingeckoRateLimitedUntil,
        coingeckoActive: Boolean(config.market.coingeckoApiKey)
    };
}

module.exports = {
    getTicker,
    getKlines,
    mergeLiveIntoCandles,
    intervalToMs,
    clearSymbolCache,
    clearAllCache,
    marketProviderLabel,
    statusSnapshot,
    sleep
};
