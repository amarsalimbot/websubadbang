'use strict';

const logger = require('../utils/logger');
const openai = require('./openaiProvider');
const gemini = require('./geminiProvider');
const localParser = require('../parser/localParser');
const { normalizeCategory } = require('../categories/catalog');
const { CircuitBreaker, classifyError } = require('./circuitBreaker');

const breakers = {
  openai: new CircuitBreaker('openai'),
  gemini: new CircuitBreaker('gemini'),
};

/**
 * F-1.1–F-1.6 & F-3.1–F-3.3: orkestrasi parsing transaksi dengan failover
 * otomatis OpenAI -> Gemini -> parser lokal. Fungsi ini TIDAK PERNAH throw;
 * selalu mengembalikan hasil (worst case dari parser lokal) agar pencatatan
 * dasar tidak pernah gagal total (ketahanan sistem, bagian 7).
 */
async function parseTransaction(text) {
  // 1) OpenAI
  if (openai.isConfigured() && !breakers.openai.isOpen()) {
    try {
      const result = await openai.parseTransaction(text);
      breakers.openai.reset();
      return finalize(result, text);
    } catch (err) {
      const kind = classifyError(err);
      logger.warn({ err: err.message, kind }, 'OpenAI parsing gagal, mencoba fallback');
      if (kind === 'quota' || kind === 'rate_limit') breakers.openai.trip(kind);
    }
  }

  // 2) Gemini (fallback otomatis)
  if (gemini.isConfigured() && !breakers.gemini.isOpen()) {
    try {
      const result = await gemini.parseTransaction(text);
      breakers.gemini.reset();
      return finalize(result, text);
    } catch (err) {
      const kind = classifyError(err);
      logger.warn({ err: err.message, kind }, 'Gemini parsing gagal, jatuh ke parser lokal');
      if (kind === 'quota' || kind === 'rate_limit') breakers.gemini.trip(kind);
    }
  }

  // 3) Parser lokal — jaring pengaman terakhir, selalu berhasil menghasilkan sesuatu.
  const local = localParser.parseTransaction(text);
  return finalize(local, text);
}

function finalize(raw, originalText) {
  return {
    amount: Math.round(Number(raw.amount) || 0),
    type: raw.type === 'pemasukan' ? 'pemasukan' : 'pengeluaran',
    category: normalizeCategory(raw.category),
    wallet: raw.wallet || null,
    note: raw.note || originalText,
    source: raw.source || 'local-parser',
    date: raw.date || new Date(),
  };
}

/** Command "ai [pertanyaan]" — tanya-jawab kontekstual (F-3.4). */
async function askContextual(question, financialContext) {
  const promptText = require('./promptBuilder').buildContextualPrompt(question, financialContext);

  if (openai.isConfigured() && !breakers.openai.isOpen()) {
    try {
      const answer = await openai.chat([{ role: 'user', content: promptText }]);
      breakers.openai.reset();
      return { answer, source: 'openai' };
    } catch (err) {
      if (['quota', 'rate_limit'].includes(classifyError(err))) breakers.openai.trip(classifyError(err));
    }
  }
  if (gemini.isConfigured() && !breakers.gemini.isOpen()) {
    try {
      const answer = await gemini.chat(promptText);
      breakers.gemini.reset();
      return { answer, source: 'gemini' };
    } catch (err) {
      if (['quota', 'rate_limit'].includes(classifyError(err))) breakers.gemini.trip(classifyError(err));
    }
  }
  return {
    answer:
      'Maaf, seluruh provider AI sedang tidak tersedia 🤖⚠️. Kamu tetap bisa pakai command "analisis", "budget", atau "laporan" untuk insight berbasis data lokal.',
    source: 'none',
  };
}

/** Command "status ai" (F-3.7). */
function status() {
  return {
    openai: { configured: openai.isConfigured(), ...breakers.openai.status() },
    gemini: { configured: gemini.isConfigured(), ...breakers.gemini.status() },
  };
}

module.exports = { parseTransaction, askContextual, status };
