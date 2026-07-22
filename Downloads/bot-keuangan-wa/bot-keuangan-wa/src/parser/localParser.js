'use strict';

const { extractPrimaryAmount } = require('../utils/money');
const { detectCategoryFromText } = require('../categories/catalog');

const INCOME_KEYWORDS = [
  'gajian', 'gaji', 'terima', 'dapat', 'masuk', 'bonus', 'thr', 'transfer masuk',
  'dibayar', 'cair', 'untung', 'profit', 'jual', 'refund', 'freelance', 'proyek', 'komisi',
];

const EXPENSE_KEYWORDS = [
  'beli', 'bayar', 'belanja', 'jajan', 'makan', 'isi', 'top up', 'topup', 'keluar', 'transfer keluar',
];

const WALLET_PATTERNS = [
  { id: 'tunai', re: /\b(tunai|cash)\b/i },
  { id: 'gopay', re: /\bgopay\b/i },
  { id: 'ovo', re: /\bovo\b/i },
  { id: 'dana', re: /\bdana\b/i },
  { id: 'shopeepay', re: /\bshopee\s?pay\b/i },
  { id: 'bca', re: /\bbca\b/i },
  { id: 'bri', re: /\bbri\b/i },
  { id: 'bni', re: /\bbni\b/i },
  { id: 'mandiri', re: /\bmandiri\b/i },
  { id: 'kartu kredit', re: /\b(kartu kredit|kredit card|kk)\b/i },
];

const RELATIVE_DATE_PATTERNS = [
  { re: /\bhari ini\b/i, offsetDays: 0 },
  { re: /\bkemarin\b/i, offsetDays: -1 },
  { re: /\bkemarin lusa\b/i, offsetDays: -2 },
  { re: /\bbesok\b/i, offsetDays: 1 },
];

function detectType(text) {
  const lower = text.toLowerCase();
  const incomeHit = INCOME_KEYWORDS.some((kw) => lower.includes(kw));
  const expenseHit = EXPENSE_KEYWORDS.some((kw) => lower.includes(kw));
  if (incomeHit && !expenseHit) return 'pemasukan';
  if (expenseHit && !incomeHit) return 'pengeluaran';
  // Default: kalimat transaksi harian tanpa keyword eksplisit paling sering pengeluaran.
  return incomeHit ? 'pemasukan' : 'pengeluaran';
}

function detectWallet(text) {
  for (const { id, re } of WALLET_PATTERNS) {
    if (re.test(text)) return id;
  }
  return null; // biarkan kosong -> dompet default pengguna dipakai di layer transactionService
}

function detectDate(text) {
  const now = new Date();
  for (const { re, offsetDays } of RELATIVE_DATE_PATTERNS) {
    if (re.test(text)) {
      const d = new Date(now);
      d.setDate(d.getDate() + offsetDays);
      return d;
    }
  }
  // format tanggal eksplisit dd/mm atau dd-mm(-yyyy)
  const explicit = text.match(/\b(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?\b/);
  if (explicit) {
    const [, dd, mm, yy] = explicit;
    const year = yy ? (yy.length === 2 ? 2000 + Number(yy) : Number(yy)) : now.getFullYear();
    const d = new Date(year, Number(mm) - 1, Number(dd));
    if (!Number.isNaN(d.getTime())) return d;
  }
  return now;
}

/**
 * Parser utama (F-1.1 s.d. F-1.5) dipakai sebagai fallback ketika seluruh
 * provider AI gagal atau tidak dikonfigurasi (F-1.6, F-3.3).
 * Selalu mengembalikan hasil terbaik yang bisa didapat — tidak pernah null,
 * agar pencatatan dasar tetap berjalan.
 */
function parseTransaction(text) {
  const amount = extractPrimaryAmount(text);
  const type = detectType(text);
  const category = detectCategoryFromText(text);
  const wallet = detectWallet(text);
  const date = detectDate(text);

  return {
    ok: Boolean(amount),
    source: 'local-parser',
    amount: amount ? amount.value : 0,
    type,
    category,
    wallet,
    date,
    note: text.trim(),
    confidence: amount ? (amount.raw.length > 1 ? 0.7 : 0.5) : 0,
  };
}

module.exports = { parseTransaction, detectType, detectWallet, detectDate };
