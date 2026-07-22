'use strict';

require('dotenv').config();

function bool(val, def = false) {
  if (val === undefined || val === null || val === '') return def;
  return ['1', 'true', 'yes', 'on'].includes(String(val).toLowerCase());
}

function num(val, def) {
  const n = Number(val);
  return Number.isFinite(n) ? n : def;
}

function csv(val) {
  return (val || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

const env = {
  // Wajib
  SPREADSHEET_ID: process.env.SPREADSHEET_ID || '',
  WHATSAPP_PHONE_NUMBER: process.env.WHATSAPP_PHONE_NUMBER || '',

  GOOGLE_SERVICE_ACCOUNT_JSON: process.env.GOOGLE_SERVICE_ACCOUNT_JSON || '',
  GOOGLE_SERVICE_ACCOUNT_JSON_BASE64: process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64 || '',
  GOOGLE_CLIENT_EMAIL: process.env.GOOGLE_CLIENT_EMAIL || '',
  GOOGLE_PRIVATE_KEY: (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),

  // AI
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || process.env.CHATGPT_API_KEY || '',
  OPENAI_MODEL: process.env.OPENAI_MODEL || 'gpt-4o-mini',
  OPENAI_MODELS: csv(process.env.OPENAI_MODELS || process.env.OPENAI_MODEL || 'gpt-4o-mini'),

  GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
  GEMINI_MODELS: csv(process.env.GEMINI_MODELS || 'gemini-1.5-flash,gemini-1.5-pro'),

  AI_QUOTA_COOLDOWN_MINUTES: num(process.env.AI_QUOTA_COOLDOWN_MINUTES, 360),
  AI_RATE_LIMIT_COOLDOWN_MINUTES: num(process.env.AI_RATE_LIMIT_COOLDOWN_MINUTES, 2),

  // Dashboard
  DASHBOARD_SECRET: process.env.DASHBOARD_SECRET || 'dev-only-insecure-secret-change-me',
  DASHBOARD_BASE_URL:
    process.env.DASHBOARD_BASE_URL ||
    process.env.PUBLIC_BASE_URL ||
    process.env.APP_URL ||
    (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : '') ||
    'http://localhost:7860',
  DASHBOARD_LINK_DAYS: num(process.env.DASHBOARD_LINK_DAYS, 30),
  SUPER_ADMIN_NUMBERS: csv(process.env.SUPER_ADMIN_NUMBERS),
  PORT: num(process.env.PORT, 7860),

  // Binance
  BINANCE_BALANCE_NUMBER: process.env.BINANCE_BALANCE_NUMBER || '33827179200526',
  BINANCE_CACHE_SECONDS: num(process.env.BINANCE_CACHE_SECONDS, 5),
  BINANCE_PRICE_CACHE_SECONDS: num(process.env.BINANCE_PRICE_CACHE_SECONDS, 2),
  BINANCE_TOP_ASSETS_LIMIT: num(process.env.BINANCE_TOP_ASSETS_LIMIT, 10),
  BINANCE_MIN_ASSET_USDT: num(process.env.BINANCE_MIN_ASSET_USDT, 1),
  BINANCE_USDT_IDR_MODE: process.env.BINANCE_USDT_IDR_MODE || 'auto',
  BINANCE_USDT_IDR_SYMBOL: process.env.BINANCE_USDT_IDR_SYMBOL || 'USDTIDR',
  BINANCE_USDT_IDR_RATE: num(process.env.BINANCE_USDT_IDR_RATE, 16300),
  BINANCE_IDR_RATE_CACHE_SECONDS: num(process.env.BINANCE_IDR_RATE_CACHE_SECONDS, 30),
  BINANCE_BASE_URL: process.env.BINANCE_BASE_URL || 'https://api.binance.com',
};

function binanceCredentialsFor(number) {
  const key = process.env[`BINANCE_API_KEY_${number}`] || '';
  const secret = process.env[`BINANCE_API_SECRET_${number}`] || '';
  return { apiKey: key, apiSecret: secret };
}

/** Validasi ringan dipakai oleh /api/env-check dan log startup. */
function validate() {
  const issues = [];
  if (!env.SPREADSHEET_ID) issues.push('SPREADSHEET_ID belum diisi');
  if (!env.WHATSAPP_PHONE_NUMBER) issues.push('WHATSAPP_PHONE_NUMBER belum diisi');
  const hasServiceAccount =
    env.GOOGLE_SERVICE_ACCOUNT_JSON ||
    env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64 ||
    (env.GOOGLE_CLIENT_EMAIL && env.GOOGLE_PRIVATE_KEY);
  if (!hasServiceAccount) issues.push('Kredensial Google Service Account belum lengkap');
  if (!env.OPENAI_API_KEY && !env.GEMINI_API_KEY) {
    issues.push('Tidak ada API key AI — bot berjalan mode parser lokal saja (bukan error, tapi perlu disadari)');
  }
  if (env.DASHBOARD_SECRET.startsWith('dev-only')) {
    issues.push('DASHBOARD_SECRET masih memakai nilai default — ganti sebelum produksi');
  }
  return issues;
}

module.exports = { env, bool, num, csv, binanceCredentialsFor, validate };
