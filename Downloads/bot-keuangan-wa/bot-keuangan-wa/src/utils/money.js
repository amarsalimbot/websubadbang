'use strict';

/**
 * Mengurai nominal uang informal Bahasa Indonesia menjadi angka.
 * Mendukung: 25k, 100rb, 1.5jt, 2 juta, 500ribu, 1jt500rb, angka penuh (25000).
 */

const UNIT_MULTIPLIER = [
  { re: /(\d+(?:[.,]\d+)?)\s*(?:jt|juta)(?![a-z])/gi, mul: 1_000_000 },
  { re: /(\d+(?:[.,]\d+)?)\s*(?:rb|ribu|k)(?![a-z])/gi, mul: 1_000 },
  { re: /(\d+(?:[.,]\d+)?)\s*(?:m|miliar|milyar)(?![a-z])/gi, mul: 1_000_000_000 },
];

function toNumber(str) {
  return parseFloat(String(str).replace(',', '.'));
}

/** Mengembalikan seluruh kandidat nominal yang ditemukan dalam teks, beserta posisinya. */
function findAmounts(text) {
  const found = [];
  const lower = text.toLowerCase();

  for (const { re, mul } of UNIT_MULTIPLIER) {
    re.lastIndex = 0;
    let match;
    while ((match = re.exec(lower))) {
      const value = Math.round(toNumber(match[1]) * mul);
      found.push({ value, index: match.index, raw: match[0] });
    }
  }

  // Gabungan seperti "1jt500rb" akan muncul sebagai dua match berdekatan; gabungkan bila index bertautan.
  found.sort((a, b) => a.index - b.index);
  const merged = [];
  for (const item of found) {
    const prev = merged[merged.length - 1];
    if (prev && item.index <= prev.index + prev.raw.length + 1) {
      prev.value += item.value;
      prev.raw += ` ${item.raw}`;
    } else {
      merged.push({ ...item });
    }
  }

  if (merged.length) return merged;

  // Fallback: angka penuh dengan minimal 3 digit (hindari menangkap tanggal/nomor kecil)
  const plainRe = /\b(\d{1,3}(?:[.,]\d{3})+|\d{4,})\b/g;
  let m;
  while ((m = plainRe.exec(lower))) {
    const value = Math.round(toNumber(m[1].replace(/[.,]/g, '')));
    if (value >= 100) found.push({ value, index: m.index, raw: m[0] });
  }
  return found;
}

/** Nominal utama (terbesar/pertama) yang relevan untuk sebuah transaksi. */
function extractPrimaryAmount(text) {
  const amounts = findAmounts(text);
  if (!amounts.length) return null;
  return amounts.reduce((max, a) => (a.value > max.value ? a : max), amounts[0]);
}

function formatRupiah(value) {
  const n = Math.round(Number(value) || 0);
  const sign = n < 0 ? '-' : '';
  return `${sign}Rp${Math.abs(n).toLocaleString('id-ID')}`;
}

function formatCompact(value) {
  const n = Number(value) || 0;
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}jt`;
  if (abs >= 1_000) return `${(n / 1_000).toFixed(0)}rb`;
  return String(n);
}

module.exports = { findAmounts, extractPrimaryAmount, formatRupiah, formatCompact };
