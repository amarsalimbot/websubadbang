const path = require("path");

function bool(value, def) {
    if (value === undefined || value === null || value === "") return def;
    return String(value).toLowerCase() === "true";
}

function num(value, def, min = -Infinity, max = Infinity) {
    const n = Number(value);
    if (!Number.isFinite(n)) return def;
    return Math.min(max, Math.max(min, n));
}

function list(value, def) {
    if (!value) return def;
    return String(value)
        .split(",")
        .map(v => v.trim().toUpperCase())
        .filter(Boolean);
}

const ROOT_DIR = path.join(__dirname, "..");
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(ROOT_DIR, "data"));

// Master daftar koin yang didukung. Watchlist default bisa dipersempit lewat
// WATCHLIST_SYMBOLS, dan setiap user tetap bisa punya watchlist sendiri.
const ASSET_CATALOG = [
    { asset: "BTC", symbol: "BTCUSDT", name: "Bitcoin", coingeckoId: "bitcoin" },
    { asset: "ETH", symbol: "ETHUSDT", name: "Ethereum", coingeckoId: "ethereum" },
    { asset: "BNB", symbol: "BNBUSDT", name: "BNB", coingeckoId: "binancecoin" },
    { asset: "SOL", symbol: "SOLUSDT", name: "Solana", coingeckoId: "solana" },
    { asset: "XRP", symbol: "XRPUSDT", name: "XRP", coingeckoId: "ripple" },
    { asset: "ADA", symbol: "ADAUSDT", name: "Cardano", coingeckoId: "cardano" },
    { asset: "DOGE", symbol: "DOGEUSDT", name: "Dogecoin", coingeckoId: "dogecoin" },
    { asset: "AVAX", symbol: "AVAXUSDT", name: "Avalanche", coingeckoId: "avalanche-2" },
    { asset: "LINK", symbol: "LINKUSDT", name: "Chainlink", coingeckoId: "chainlink" },
    { asset: "TON", symbol: "TONUSDT", name: "Toncoin", coingeckoId: "the-open-network" },
    { asset: "PAXG", symbol: "PAXGUSDT", name: "PAX Gold", coingeckoId: "pax-gold" },
    { asset: "XAUT", symbol: "XAUTUSDT", name: "Tether Gold", coingeckoId: "tether-gold" }
];

const watchlistSymbols = list(process.env.WATCHLIST_SYMBOLS, ["BTC", "ETH", "BNB", "SOL", "XRP", "PAXG", "XAUT"]);

const config = {
    rootDir: ROOT_DIR,
    dataDir: DATA_DIR,
    timezone: process.env.APP_TIMEZONE || "Asia/Makassar",
    port: num(process.env.PORT, 7860, 1, 65535),

    whatsappPhoneNumber: String(process.env.WHATSAPP_PHONE_NUMBER || "").replace(/\D/g, ""),
    whatsappAuthDir: path.resolve(process.env.WHATSAPP_AUTH_DIR || path.join(ROOT_DIR, "session")),
    waLogLevel: process.env.WA_LOG_LEVEL || "silent",
    allowSelfChat: bool(process.env.ALLOW_SELF_CHAT, true),
    messageDebug: bool(process.env.WA_MESSAGE_DEBUG, false),

    assetCatalog: ASSET_CATALOG,
    defaultWatchlist: ASSET_CATALOG.filter(a => watchlistSymbols.includes(a.asset)).length
        ? ASSET_CATALOG.filter(a => watchlistSymbols.includes(a.asset))
        : ASSET_CATALOG.slice(0, 7),

    newsFeeds: [
        "https://www.coindesk.com/arc/outboundfeeds/rss/",
        "https://cointelegraph.com/rss",
        "https://cryptonews.com/news/feed/"
    ],

    market: {
        provider: ["auto", "binance", "bybit", "coingecko"].includes(String(process.env.MARKET_DATA_PROVIDER || "auto").toLowerCase())
            ? String(process.env.MARKET_DATA_PROVIDER || "auto").toLowerCase()
            : "auto",
        binanceApiKey: process.env.BINANCE_API_KEY || "",
        binanceBases: String(process.env.BINANCE_API_BASES || "https://api.binance.com,https://data-api.binance.vision")
            .split(",").map(v => v.trim().replace(/\/+$/, "")).filter(Boolean),
        bybitBase: process.env.BYBIT_API_BASE || "https://api.bybit.com",
        coingeckoApiKey: process.env.COINGECKO_API_KEY || process.env.CG_API_KEY || "",
        coingeckoApiType: ["demo", "pro"].includes(String(process.env.COINGECKO_API_TYPE || "demo").toLowerCase())
            ? String(process.env.COINGECKO_API_TYPE || "demo").toLowerCase() : "demo",
        tickerCacheMs: num(process.env.TICKER_CACHE_SECONDS, 20, 5) * 1000,
        candleCacheMs: num(process.env.CANDLE_CACHE_MINUTES, 2, 1) * 60_000,
        forceRefreshOnRequest: bool(process.env.FORCE_REFRESH_ON_REQUEST, true),
        forceRefreshDedupMs: num(process.env.FORCE_REFRESH_DEDUP_SECONDS, 10, 3) * 1000,
        binanceRestrictedCooldownMs: num(process.env.BINANCE_RESTRICTED_COOLDOWN_MINUTES, 360, 5) * 60_000,
        binanceErrorCooldownMs: num(process.env.BINANCE_ERROR_COOLDOWN_SECONDS, 60, 5) * 1000,
        coingeckoRateCooldownMs: num(process.env.COINGECKO_RATE_COOLDOWN_MINUTES, 10, 2) * 60_000
    },

    monitor: {
        intervalMs: num(process.env.MONITOR_INTERVAL_SECONDS, 60, 30) * 1000,
        signalCooldownMs: num(process.env.SIGNAL_COOLDOWN_MINUTES, 45, 5) * 60_000,
        positionAlertCooldownMs: num(process.env.POSITION_ALERT_COOLDOWN_MINUTES, 15, 3) * 60_000,
        trailingPercent: num(process.env.POSITION_TRAILING_PERCENT, 1.5, 0.3, 10)
    },

    risk: {
        defaultRiskPercent: num(process.env.DEFAULT_RISK_PERCENT, 2, 0.25, 10),
        defaultMode: (process.env.DEFAULT_MODE || "trader").toLowerCase() === "investor" ? "investor" : "trader"
    },

    autoReport: {
        enabled: bool(process.env.AUTO_REPORT_ENABLED, true),
        mode: ["candle", "interval", "both"].includes(String(process.env.AUTO_REPORT_MODE || "candle").toLowerCase())
            ? String(process.env.AUTO_REPORT_MODE || "candle").toLowerCase() : "candle",
        intervalMinutes: num(process.env.AUTO_REPORT_INTERVAL_MINUTES, 60, 15),
        startDelayMs: num(process.env.AUTO_REPORT_START_DELAY_SECONDS, 90, 30) * 1000,
        traderCandleMinutes: num(process.env.TRADER_CANDLE_MINUTES, 15, 5),
        investorCandleMinutes: num(process.env.INVESTOR_CANDLE_MINUTES, 60, 15),
        candleReportDelayMs: num(process.env.CANDLE_REPORT_DELAY_SECONDS, 20, 5) * 1000
    },

    ai: {
        openaiKey: process.env.OPENAI_API_KEY || "",
        openaiModel: process.env.OPENAI_MODEL || "gpt-5.4-mini",
        openaiWhisperModel: process.env.OPENAI_WHISPER_MODEL || "whisper-1",
        geminiKey: process.env.GEMINI_API_KEY || "",
        geminiModel: process.env.GEMINI_MODEL || "gemini-2.5-flash",
        providerOrder: list(process.env.AI_PROVIDER_ORDER, ["OPENAI", "GEMINI"]).map(v => v.toLowerCase()),
        autoChat: bool(process.env.AI_AUTO_CHAT, true),
        timeoutMs: num(process.env.AI_TIMEOUT_SECONDS, 30, 5) * 1000,
        providerCooldownMs: num(process.env.AI_PROVIDER_COOLDOWN_MINUTES, 5, 1) * 60_000,
        historyTurns: num(process.env.AI_HISTORY_TURNS, 4, 1, 10),
        historyTtlMs: num(process.env.AI_HISTORY_TTL_MINUTES, 60, 5) * 60_000,
        maxOutputTokens: num(process.env.AI_MAX_OUTPUT_TOKENS, 1200, 300, 4000),
        maxOutputChars: num(process.env.AI_MAX_OUTPUT_CHARS, 3500, 1000, 12000),
        voiceNotesEnabled: bool(process.env.AI_VOICE_NOTES_ENABLED, true),
        chartImagesEnabled: bool(process.env.AI_CHART_IMAGES_ENABLED, true)
    },

    paperTrading: {
        startingBalance: num(process.env.PAPER_STARTING_BALANCE, 1000, 10),
        feePercent: num(process.env.PAPER_FEE_PERCENT, 0.1, 0, 5)
    },

    backtest: {
        maxCandles: num(process.env.BACKTEST_MAX_CANDLES, 1000, 100, 1500),
        defaultDays: num(process.env.BACKTEST_DEFAULT_DAYS, 30, 1, 365)
    },

    web: {
        enabled: bool(process.env.WEB_DASHBOARD_ENABLED, true),
        token: process.env.DASHBOARD_TOKEN || ""
    }
};

config.ownerJid = config.whatsappPhoneNumber ? `${config.whatsappPhoneNumber}@s.whatsapp.net` : "";

module.exports = config;
