'use strict';

const { env } = require('../config/env');

let OpenAI;
try {
  // Lazy require agar bot tetap bisa start walau paket belum terpasang saat dev awal.
  OpenAI = require('openai');
} catch {
  OpenAI = null;
}

let client = null;
function getClient() {
  if (!env.OPENAI_API_KEY) return null;
  if (!client && OpenAI) client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  return client;
}

const SYSTEM_PROMPT = `Kamu adalah mesin parsing transaksi keuangan pribadi berbahasa Indonesia.
Balas HANYA dengan JSON valid, tanpa markdown, format:
{"amount": number, "type": "pemasukan"|"pengeluaran", "category": string, "wallet": string|null, "note": string}
Nominal informal seperti 25k, 100rb, 1.5jt harus dikonversi ke angka penuh.`;

async function parseTransaction(text) {
  const c = getClient();
  if (!c) throw new Error('OPENAI_NOT_CONFIGURED');

  const models = env.OPENAI_MODELS.length ? env.OPENAI_MODELS : [env.OPENAI_MODEL];
  let lastErr;
  for (const model of models) {
    try {
      const resp = await c.chat.completions.create({
        model,
        temperature: 0,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: text },
        ],
        response_format: { type: 'json_object' },
      });
      const content = resp.choices?.[0]?.message?.content || '{}';
      const parsed = JSON.parse(content);
      return { ...parsed, source: `openai:${model}` };
    } catch (err) {
      lastErr = err;
      // lanjut coba model fallback berikutnya dalam daftar OPENAI_MODELS
    }
  }
  throw lastErr;
}

/** Dipakai untuk command "ai [pertanyaan]" dan insight (analisis/tips/prediksi). */
async function chat(promptMessages, { jsonMode = false } = {}) {
  const c = getClient();
  if (!c) throw new Error('OPENAI_NOT_CONFIGURED');
  const resp = await c.chat.completions.create({
    model: env.OPENAI_MODEL,
    temperature: 0.4,
    messages: promptMessages,
    ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
  });
  return resp.choices?.[0]?.message?.content || '';
}

function isConfigured() {
  return Boolean(env.OPENAI_API_KEY && OpenAI);
}

module.exports = { parseTransaction, chat, isConfigured };
