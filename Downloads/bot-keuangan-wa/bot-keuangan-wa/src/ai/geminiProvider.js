'use strict';

const { env } = require('../config/env');

let GoogleGenAI;
try {
  ({ GoogleGenAI } = require('@google/genai'));
} catch {
  GoogleGenAI = null;
}

let client = null;
function getClient() {
  if (!env.GEMINI_API_KEY) return null;
  if (!client && GoogleGenAI) client = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
  return client;
}

const SYSTEM_PROMPT = `Kamu adalah mesin parsing transaksi keuangan pribadi berbahasa Indonesia.
Balas HANYA dengan JSON valid, tanpa markdown, format:
{"amount": number, "type": "pemasukan"|"pengeluaran", "category": string, "wallet": string|null, "note": string}
Nominal informal seperti 25k, 100rb, 1.5jt harus dikonversi ke angka penuh.`;

function extractJson(text) {
  const cleaned = String(text).replace(/```json|```/g, '').trim();
  return JSON.parse(cleaned);
}

async function parseTransaction(text) {
  const c = getClient();
  if (!c) throw new Error('GEMINI_NOT_CONFIGURED');

  const models = env.GEMINI_MODELS.length ? env.GEMINI_MODELS : ['gemini-1.5-flash'];
  let lastErr;
  for (const model of models) {
    try {
      const resp = await c.models.generateContent({
        model,
        contents: `${SYSTEM_PROMPT}\n\nPesan pengguna: "${text}"`,
      });
      const raw = resp.text ?? resp.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}';
      const parsed = extractJson(raw);
      return { ...parsed, source: `gemini:${model}` };
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}

async function chat(promptText) {
  const c = getClient();
  if (!c) throw new Error('GEMINI_NOT_CONFIGURED');
  const model = env.GEMINI_MODELS[0] || 'gemini-1.5-flash';
  const resp = await c.models.generateContent({ model, contents: promptText });
  return resp.text ?? resp.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
}

function isConfigured() {
  return Boolean(env.GEMINI_API_KEY && GoogleGenAI);
}

module.exports = { parseTransaction, chat, isConfigured };
