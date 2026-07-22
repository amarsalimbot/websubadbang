'use strict';

/**
 * Katalog kategori pusat (F-1.3, F-1.4, F-4.1).
 * `group` dipakai untuk analitik komposisi kebutuhan-vs-keinginan (F-6.8).
 * `defaultBudget` = 0 berarti tidak ada budget default (mis. pemasukan).
 */
const CATALOG = [
  { id: 'makanan', label: 'Makanan & Minum', group: 'kebutuhan', type: 'pengeluaran', defaultBudget: 1_500_000,
    aliases: ['makan', 'makan siang', 'makan malam', 'sarapan', 'nasi', 'kuliner'],
    keywords: ['makan', 'nasi', 'ayam', 'bakso', 'mie', 'sate', 'warteg', 'restoran', 'resto', 'gofood', 'grabfood'] },
  { id: 'jajan', label: 'Jajan & Snack', group: 'keinginan', type: 'pengeluaran', defaultBudget: 300_000,
    aliases: ['snack', 'cemilan', 'jajanan'],
    keywords: ['snack', 'chiki', 'gorengan', 'cemilan', 'jajan'] },
  { id: 'kopi', label: 'Kopi & Minuman', group: 'keinginan', type: 'pengeluaran', defaultBudget: 300_000,
    aliases: ['ngopi', 'kopi susu', 'boba'],
    keywords: ['kopi', 'starbucks', 'kopken', 'janji jiwa', 'boba', 'teh'] },
  { id: 'transportasi', label: 'Transportasi', group: 'kebutuhan', type: 'pengeluaran', defaultBudget: 500_000,
    aliases: ['ojek', 'ojol', 'grab', 'gocar', 'transport'],
    keywords: ['gojek', 'grab', 'ojek', 'taxi', 'taksi', 'busway', 'krl', 'mrt', 'tol', 'parkir'] },
  { id: 'bensin', label: 'Bahan Bakar', group: 'kebutuhan', type: 'pengeluaran', defaultBudget: 500_000,
    aliases: ['bbm', 'pertalite', 'pertamax', 'solar'],
    keywords: ['bensin', 'bbm', 'pertalite', 'pertamax', 'solar', 'spbu'] },
  { id: 'belanja', label: 'Belanja', group: 'keinginan', type: 'pengeluaran', defaultBudget: 500_000,
    aliases: ['shopping', 'online shop'],
    keywords: ['belanja', 'shopee', 'tokopedia', 'baju', 'sepatu', 'tas'] },
  { id: 'groceries', label: 'Groceries / Kebutuhan Rumah', group: 'kebutuhan', type: 'pengeluaran', defaultBudget: 800_000,
    aliases: ['belanja bulanan', 'kebutuhan dapur'],
    keywords: ['indomaret', 'alfamart', 'supermarket', 'pasar', 'sayur', 'beras'] },
  { id: 'tagihan', label: 'Tagihan Umum', group: 'kebutuhan', type: 'pengeluaran', defaultBudget: 500_000,
    aliases: ['bill', 'cicilan'],
    keywords: ['tagihan', 'cicilan', 'kredit'] },
  { id: 'listrik', label: 'Listrik', group: 'kebutuhan', type: 'pengeluaran', defaultBudget: 300_000,
    aliases: ['pln', 'token listrik'],
    keywords: ['listrik', 'pln', 'token'] },
  { id: 'air', label: 'Air (PDAM)', group: 'kebutuhan', type: 'pengeluaran', defaultBudget: 150_000,
    aliases: ['pdam'], keywords: ['air', 'pdam'] },
  { id: 'internet', label: 'Internet & TV', group: 'kebutuhan', type: 'pengeluaran', defaultBudget: 400_000,
    aliases: ['wifi', 'indihome'], keywords: ['wifi', 'internet', 'indihome', 'firstmedia'] },
  { id: 'pulsa', label: 'Pulsa & Paket Data', group: 'kebutuhan', type: 'pengeluaran', defaultBudget: 150_000,
    aliases: ['paket data', 'kuota'], keywords: ['pulsa', 'kuota', 'paket data'] },
  { id: 'hiburan', label: 'Hiburan', group: 'keinginan', type: 'pengeluaran', defaultBudget: 300_000,
    aliases: ['nonton', 'bioskop'], keywords: ['netflix', 'bioskop', 'nonton', 'game', 'konser'] },
  { id: 'langganan', label: 'Langganan Digital', group: 'keinginan', type: 'pengeluaran', defaultBudget: 200_000,
    aliases: ['subscription'], keywords: ['spotify', 'netflix', 'youtube premium', 'icloud', 'langganan'] },
  { id: 'kesehatan', label: 'Kesehatan', group: 'kebutuhan', type: 'pengeluaran', defaultBudget: 400_000,
    aliases: ['obat', 'dokter', 'rumah sakit'], keywords: ['obat', 'dokter', 'apotek', 'rs', 'vitamin'] },
  { id: 'olahraga', label: 'Olahraga & Gym', group: 'kebutuhan', type: 'pengeluaran', defaultBudget: 300_000,
    aliases: ['gym', 'fitness'], keywords: ['gym', 'fitness', 'yoga', 'renang'] },
  { id: 'pendidikan', label: 'Pendidikan', group: 'kebutuhan', type: 'pengeluaran', defaultBudget: 500_000,
    aliases: ['kursus', 'sekolah', 'spp'], keywords: ['sekolah', 'kursus', 'buku', 'spp', 'kuliah'] },
  { id: 'hadiah', label: 'Hadiah', group: 'keinginan', type: 'pengeluaran', defaultBudget: 200_000,
    aliases: ['kado'], keywords: ['hadiah', 'kado'] },
  { id: 'donasi', label: 'Donasi & Zakat', group: 'kewajiban', type: 'pengeluaran', defaultBudget: 200_000,
    aliases: ['sedekah', 'zakat', 'infaq'], keywords: ['donasi', 'sedekah', 'zakat', 'infaq'] },
  { id: 'investasi', label: 'Investasi', group: 'tabungan', type: 'pengeluaran', defaultBudget: 0,
    aliases: ['saham', 'reksadana', 'crypto', 'kripto'], keywords: ['saham', 'reksadana', 'crypto', 'kripto', 'emas'] },
  { id: 'tabungan', label: 'Tabungan', group: 'tabungan', type: 'pengeluaran', defaultBudget: 0,
    aliases: ['nabung'], keywords: ['nabung', 'tabungan'] },
  { id: 'gaji', label: 'Gaji', group: 'pemasukan', type: 'pemasukan', defaultBudget: 0,
    aliases: ['gajian', 'salary'], keywords: ['gaji', 'gajian', 'payroll'] },
  { id: 'bonus', label: 'Bonus & THR', group: 'pemasukan', type: 'pemasukan', defaultBudget: 0,
    aliases: ['thr', 'insentif'], keywords: ['bonus', 'thr', 'insentif'] },
  { id: 'freelance', label: 'Freelance / Proyek', group: 'pemasukan', type: 'pemasukan', defaultBudget: 0,
    aliases: ['project', 'proyek'], keywords: ['freelance', 'proyek', 'project', 'klien'] },
  { id: 'keluarga', label: 'Keluarga', group: 'kebutuhan', type: 'pengeluaran', defaultBudget: 300_000,
    aliases: [], keywords: ['ortu', 'orang tua', 'keluarga'] },
  { id: 'anak', label: 'Anak', group: 'kebutuhan', type: 'pengeluaran', defaultBudget: 500_000,
    aliases: [], keywords: ['anak', 'popok', 'susu bayi', 'mainan anak'] },
  { id: 'kecantikan', label: 'Kecantikan & Perawatan', group: 'keinginan', type: 'pengeluaran', defaultBudget: 200_000,
    aliases: ['skincare', 'salon'], keywords: ['skincare', 'salon', 'facial', 'spa'] },
  { id: 'rumah', label: 'Rumah Tangga', group: 'kebutuhan', type: 'pengeluaran', defaultBudget: 500_000,
    aliases: ['sewa', 'kontrakan'], keywords: ['sewa', 'kontrakan', 'kos', 'perbaikan rumah'] },
  { id: 'liburan', label: 'Liburan & Travel', group: 'keinginan', type: 'pengeluaran', defaultBudget: 500_000,
    aliases: ['travel', 'trip'], keywords: ['tiket', 'hotel', 'liburan', 'travel', 'trip'] },
  { id: 'asuransi', label: 'Asuransi', group: 'kebutuhan', type: 'pengeluaran', defaultBudget: 300_000,
    aliases: [], keywords: ['asuransi', 'premi', 'bpjs'] },
  { id: 'utang', label: 'Bayar Utang', group: 'kewajiban', type: 'pengeluaran', defaultBudget: 0,
    aliases: ['cicilan utang', 'bayar utang'], keywords: ['utang', 'hutang', 'cicilan'] },
  { id: 'piutang', label: 'Terima Piutang', group: 'pemasukan', type: 'pemasukan', defaultBudget: 0,
    aliases: [], keywords: ['piutang', 'bayar utang teman'] },
  { id: 'pajak', label: 'Pajak', group: 'kewajiban', type: 'pengeluaran', defaultBudget: 0,
    aliases: [], keywords: ['pajak', 'pbb', 'stnk', 'pph'] },
  { id: 'hewan', label: 'Hewan Peliharaan', group: 'keinginan', type: 'pengeluaran', defaultBudget: 200_000,
    aliases: ['petshop'], keywords: ['kucing', 'anjing', 'petshop', 'pakan hewan'] },
  { id: 'rokok', label: 'Rokok', group: 'keinginan', type: 'pengeluaran', defaultBudget: 300_000,
    aliases: [], keywords: ['rokok', 'vape'] },
  { id: 'lainnya', label: 'Lainnya', group: 'lainnya', type: 'pengeluaran', defaultBudget: 200_000,
    aliases: ['lain-lain', 'misc'], keywords: [] },
];

const BY_ID = new Map(CATALOG.map((c) => [c.id, c]));

const ALIAS_INDEX = new Map();
for (const cat of CATALOG) {
  ALIAS_INDEX.set(cat.id, cat.id);
  for (const alias of cat.aliases) ALIAS_INDEX.set(alias.toLowerCase(), cat.id);
}

/** Migrasi kategori historis (F-1.4): nama lama → id kategori pusat saat ini. */
const LEGACY_MIGRATION = {
  food: 'makanan',
  makan: 'makanan',
  transport: 'transportasi',
  ojek: 'transportasi',
  shopping: 'belanja',
  gaji_bulanan: 'gaji',
  entertainment: 'hiburan',
  health: 'kesehatan',
  bill: 'tagihan',
  misc: 'lainnya',
};

function normalizeCategory(rawLabel) {
  if (!rawLabel) return 'lainnya';
  const key = String(rawLabel).toLowerCase().trim();
  if (ALIAS_INDEX.has(key)) return ALIAS_INDEX.get(key);
  if (LEGACY_MIGRATION[key]) return LEGACY_MIGRATION[key];
  // cocokkan sebagian (mis. "makan siang di kantor" -> makanan)
  for (const cat of CATALOG) {
    if (cat.keywords.some((kw) => key.includes(kw))) return cat.id;
  }
  return BY_ID.has(key) ? key : 'lainnya';
}

/** Deteksi kategori dari teks natural mentah (dipakai parser lokal). */
function detectCategoryFromText(text) {
  const lower = text.toLowerCase();
  let best = null;
  let bestScore = 0;
  for (const cat of CATALOG) {
    let score = 0;
    for (const kw of cat.keywords) if (lower.includes(kw)) score += kw.length;
    for (const alias of cat.aliases) if (lower.includes(alias)) score += alias.length;
    if (score > bestScore) {
      bestScore = score;
      best = cat.id;
    }
  }
  return best || 'lainnya';
}

function get(id) {
  return BY_ID.get(id) || BY_ID.get('lainnya');
}

function all() {
  return CATALOG;
}

function expenseCategories() {
  return CATALOG.filter((c) => c.type === 'pengeluaran');
}

module.exports = {
  CATALOG,
  normalizeCategory,
  detectCategoryFromText,
  get,
  all,
  expenseCategories,
};
