'use strict';

/**
 * Semua emoji yang dipakai bot dipusatkan di sini agar konsisten dan mudah
 * disesuaikan. Prinsip: emoji mendukung pemahaman (jenis transaksi, status,
 * kategori, level risiko) — bukan sekadar hiasan acak.
 */

const CATEGORY_EMOJI = {
  makanan: '🍽️',
  jajan: '🍟',
  kopi: '☕',
  transportasi: '🚗',
  bensin: '⛽',
  belanja: '🛍️',
  groceries: '🛒',
  tagihan: '🧾',
  listrik: '💡',
  air: '🚰',
  internet: '📶',
  pulsa: '📱',
  hiburan: '🎬',
  langganan: '🔁',
  kesehatan: '💊',
  olahraga: '🏋️',
  pendidikan: '📚',
  hadiah: '🎁',
  donasi: '🤲',
  investasi: '📈',
  tabungan: '🏦',
  gaji: '💼',
  bonus: '🎉',
  freelance: '💻',
  keluarga: '👨‍👩‍👧',
  anak: '🧒',
  kecantikan: '💄',
  rumah: '🏠',
  liburan: '🧳',
  asuransi: '🛡️',
  utang: '📉',
  piutang: '📗',
  pajak: '🏛️',
  hewan: '🐾',
  rokok: '🚬',
  lainnya: '📦',
};

const WALLET_EMOJI = {
  tunai: '💵',
  cash: '💵',
  ewallet: '📲',
  'e-wallet': '📲',
  gopay: '📲',
  ovo: '📲',
  dana: '📲',
  shopeepay: '📲',
  bank: '🏦',
  rekening: '🏦',
  bca: '🏦',
  bri: '🏦',
  bni: '🏦',
  mandiri: '🏦',
  kartu: '💳',
  'kartu kredit': '💳',
  default: '👛',
};

const STATUS = {
  success: '✅',
  saved: '💾',
  error: '⚠️',
  info: 'ℹ️',
  warning: '🟠',
  danger: '🔴',
  safe: '🟢',
  loading: '⏳',
  lock: '🔒',
  link: '🔗',
  search: '🔍',
  fire: '🔥',
  sparkle: '✨',
  robot: '🤖',
  chart: '📊',
  chartUp: '📈',
  chartDown: '📉',
  money: '💰',
  wallet: '👛',
  calendar: '📅',
  bulb: '💡',
  target: '🎯',
  trophy: '🏆',
  bell: '🔔',
  bellOff: '🔕',
  trash: '🗑️',
  undo: '↩️',
  admin: '🛡️',
  crown: '👑',
  crypto: '🪙',
  rocket: '🚀',
  gear: '⚙️',
  book: '📖',
  wave: '👋',
  question: '❓',
  export: '📤',
  clip: '📎',
  check: '☑️',
  pin: '📌',
};

function categoryEmoji(category) {
  if (!category) return CATEGORY_EMOJI.lainnya;
  const key = String(category).toLowerCase().trim();
  return CATEGORY_EMOJI[key] || CATEGORY_EMOJI.lainnya;
}

function walletEmoji(wallet) {
  if (!wallet) return WALLET_EMOJI.default;
  const key = String(wallet).toLowerCase().trim();
  return WALLET_EMOJI[key] || WALLET_EMOJI.default;
}

/** Emoji jenis transaksi: pemasukan naik hijau, pengeluaran turun merah. */
function typeEmoji(type) {
  return type === 'pemasukan' ? '🟢⬆️' : '🔴⬇️';
}

/** Emoji berdasar persentase pemakaian budget — dipakai notifikasi ambang batas. */
function budgetLevelEmoji(percent) {
  if (percent >= 100) return STATUS.danger;
  if (percent >= 85) return STATUS.warning;
  if (percent >= 60) return '🟡';
  return STATUS.safe;
}

/** Sapaan sesuai jam lokal (Asia/Jakarta) — dipakai reminder & menu. */
function greetingEmoji(date = new Date()) {
  const hour = date.getHours();
  if (hour < 10) return '🌤️';
  if (hour < 15) return '☀️';
  if (hour < 18) return '🌇';
  return '🌙';
}

module.exports = {
  CATEGORY_EMOJI,
  WALLET_EMOJI,
  STATUS,
  categoryEmoji,
  walletEmoji,
  typeEmoji,
  budgetLevelEmoji,
  greetingEmoji,
};
