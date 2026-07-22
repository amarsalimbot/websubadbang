'use strict';

const crypto = require('crypto');
const { env, binanceCredentialsFor } = require('../config/env');
const { formatRupiah, formatCompact } = require('../utils/money');
const { STATUS } = require('../utils/emoji');
const logger = require('../utils/logger');

const cache = {
  account: { data: null, at: 0 },
  prices: { data: null, at: 0 },
  usdtIdr: { data: null, at: 0 },
};

function sign(query, secret) {
  return crypto.createHmac('sha256', secret).update(query).digest('hex');
}

async function binanceFetch(pathname, { signed = false, apiKey, apiSecret } = {}) {
  const params = new URLSearchParams();
  if (signed) {
    params.set('timestamp', Date.now().toString());
    params.set('recvWindow', '5000');
  }
  let url = `${env.BINANCE_BASE_URL}${pathname}`;
  const headers = {};
  if (signed) {
    const query = params.toString();
    const signature = sign(query, apiSecret);
    url += `?${query}&signature=${signature}`;
    headers['X-MBX-APIKEY'] = apiKey;
  } else if ([...params.keys()].length) {
    url += `?${params.toString()}`;
  }

  const resp = await fetch(url, { headers });
  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new Error(`Binance API error ${resp.status}: ${body}`);
  }
  return resp.json();
}

/** F-5.3: apakah nomor ini diizinkan mengakses fitur Binance (fitur khusus satu nomor). */
function isAuthorized(number) {
  return number === env.BINANCE_BALANCE_NUMBER;
}

async function getUsdtIdrRate() {
  if (env.BINANCE_USDT_IDR_MODE === 'fixed') return env.BINANCE_USDT_IDR_RATE;

  const now = Date.now();
  if (cache.usdtIdr.data && now - cache.usdtIdr.at < env.BINANCE_IDR_RATE_CACHE_SECONDS * 1000) {
    return cache.usdtIdr.data;
  }
  try {
    const data = await binanceFetch(`/api/v3/ticker/price?symbol=${env.BINANCE_USDT_IDR_SYMBOL}`);
    const rate = Number(data.price) || env.BINANCE_USDT_IDR_RATE;
    cache.usdtIdr = { data: rate, at: now };
    return rate;
  } catch (err) {
    logger.warn({ err: err.message }, 'Gagal ambil kurs USDT/IDR, pakai fallback env');
    return env.BINANCE_USDT_IDR_RATE;
  }
}

async function getPrices() {
  const now = Date.now();
  if (cache.prices.data && now - cache.prices.at < env.BINANCE_PRICE_CACHE_SECONDS * 1000) {
    return cache.prices.data;
  }
  const data = await binanceFetch('/api/v3/ticker/price');
  const map = new Map(data.map((d) => [d.symbol, Number(d.price)]));
  cache.prices = { data: map, at: now };
  return map;
}

async function getAccountSnapshot(number) {
  if (!isAuthorized(number)) {
    return { authorized: false };
  }
  const { apiKey, apiSecret } = binanceCredentialsFor(number);
  if (!apiKey || !apiSecret) {
    return { authorized: true, configured: false };
  }

  const now = Date.now();
  if (cache.account.data && now - cache.account.at < env.BINANCE_CACHE_SECONDS * 1000) {
    return { authorized: true, configured: true, ...cache.account.data };
  }

  const [account, prices, usdtIdr] = await Promise.all([
    binanceFetch('/api/v3/account', { signed: true, apiKey, apiSecret }),
    getPrices(),
    getUsdtIdrRate(),
  ]);

  const assets = (account.balances || [])
    .map((b) => ({ asset: b.asset, amount: Number(b.free) + Number(b.locked) }))
    .filter((b) => b.amount > 0)
    .map((b) => {
      let usdtValue;
      if (b.asset === 'USDT') usdtValue = b.amount;
      else {
        const price = prices.get(`${b.asset}USDT`);
        usdtValue = price ? b.amount * price : 0;
      }
      return { ...b, usdtValue, idrValue: usdtValue * usdtIdr };
    })
    .filter((b) => b.usdtValue >= env.BINANCE_MIN_ASSET_USDT)
    .sort((a, b) => b.usdtValue - a.usdtValue)
    .slice(0, env.BINANCE_TOP_ASSETS_LIMIT);

  const totalUsdt = assets.reduce((s, a) => s + a.usdtValue, 0);
  const totalIdr = totalUsdt * usdtIdr;

  const result = { assets, totalUsdt, totalIdr, usdtIdr };
  cache.account = { data: result, at: now };
  return { authorized: true, configured: true, ...result };
}

/** Command "saldo binance" / "portofolio crypto" (F-5.1, F-5.2). */
async function buildBalanceMessage(number) {
  const snap = await getAccountSnapshot(number);
  if (!snap.authorized) {
    return `${STATUS.lock} Fitur portofolio crypto hanya aktif untuk nomor yang terdaftar khusus.`;
  }
  if (!snap.configured) {
    return `${STATUS.warning} Kredensial Binance API belum diatur untuk nomor ini di environment.`;
  }
  if (!snap.assets.length) {
    return `${STATUS.info} Tidak ada aset dengan nilai signifikan di akun Binance ini.`;
  }

  const lines = [
    `${STATUS.crypto} *Portofolio Binance*`,
    '',
    ...snap.assets.map(
      (a) => `${STATUS.crypto} ${a.asset}: ${a.amount.toLocaleString('id-ID', { maximumFractionDigits: 6 })} (~${formatCompact(a.usdtValue)} USDT)`
    ),
    '',
    `${STATUS.money} Total: ${snap.totalUsdt.toFixed(2)} USDT (~${formatRupiah(Math.round(snap.totalIdr))})`,
    `${STATUS.chart} Kurs USDT/IDR dipakai: ${formatRupiah(Math.round(snap.usdtIdr))}`,
  ];
  return lines.join('\n');
}

module.exports = { isAuthorized, getAccountSnapshot, buildBalanceMessage, getUsdtIdrRate, getPrices };
