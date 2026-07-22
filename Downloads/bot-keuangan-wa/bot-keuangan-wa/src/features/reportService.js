'use strict';

const txRepo = require('../data/transactionsRepo');
const { formatRupiah, formatCompact } = require('../utils/money');
const { categoryEmoji, STATUS, typeEmoji } = require('../utils/emoji');
const { paginate } = require('../utils/pagination');

const BULAN_ID = [
  'januari', 'februari', 'maret', 'april', 'mei', 'juni',
  'juli', 'agustus', 'september', 'oktober', 'november', 'desember',
];

/** Mengurai frasa periode Bahasa Indonesia menjadi rentang tanggal { from, to, label }. */
function resolvePeriod(phrase) {
  const now = new Date();
  const lower = (phrase || '').toLowerCase().trim();

  if (!lower || lower === 'semua' || lower === 'semua waktu') {
    return { from: new Date(2000, 0, 1), to: now, label: 'Semua Waktu' };
  }
  if (lower.includes('hari ini')) {
    const from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return { from, to: now, label: 'Hari Ini' };
  }
  if (lower.includes('minggu ini')) {
    const from = new Date(now);
    from.setDate(from.getDate() - 6);
    return { from, to: now, label: '7 Hari Terakhir' };
  }
  if (lower.includes('bulan lalu')) {
    const from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const to = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
    return { from, to, label: `${capitalize(BULAN_ID[from.getMonth()])} ${from.getFullYear()}` };
  }
  if (lower.includes('bulan ini')) {
    const from = new Date(now.getFullYear(), now.getMonth(), 1);
    const to = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    return { from, to, label: `${capitalize(BULAN_ID[from.getMonth()])} ${from.getFullYear()}` };
  }

  // "laporan Mei 2026" / "export Mei 2026"
  for (let i = 0; i < BULAN_ID.length; i++) {
    if (lower.includes(BULAN_ID[i])) {
      const yearMatch = lower.match(/\b(20\d{2})\b/);
      const year = yearMatch ? Number(yearMatch[1]) : now.getFullYear();
      const from = new Date(year, i, 1);
      const to = new Date(year, i + 1, 0, 23, 59, 59);
      return { from, to, label: `${capitalize(BULAN_ID[i])} ${year}` };
    }
  }

  // "laporan tahunan 2026" / "laporan 2026" / "export tahun 2026"
  const yearOnly = lower.match(/\b(20\d{2})\b/);
  if (yearOnly) {
    const year = Number(yearOnly[1]);
    return { from: new Date(year, 0, 1), to: new Date(year, 11, 31, 23, 59, 59), label: `Tahun ${year}`, yearly: true };
  }

  // Default: bulan berjalan
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
  return { from, to, label: `${capitalize(BULAN_ID[from.getMonth()])} ${from.getFullYear()}` };
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function summarize(txs) {
  const income = txs.filter((t) => t.type === 'pemasukan').reduce((s, t) => s + t.amount, 0);
  const expense = txs.filter((t) => t.type === 'pengeluaran').reduce((s, t) => s + t.amount, 0);
  const expenseTxs = txs.filter((t) => t.type === 'pengeluaran');
  const biggest = expenseTxs.reduce((max, t) => (t.amount > (max?.amount || 0) ? t : max), null);
  const avgExpense = expenseTxs.length ? expense / expenseTxs.length : 0;

  const byCategory = new Map();
  for (const t of expenseTxs) byCategory.set(t.category, (byCategory.get(t.category) || 0) + t.amount);
  const topCategories = [...byCategory.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);

  return { income, expense, net: income - expense, count: txs.length, biggest, avgExpense, topCategories };
}

/** F-2.1–F-2.3: laporan tabel WhatsApp untuk satu periode. */
async function buildPeriodReport(owner, phrase) {
  const period = resolvePeriod(phrase);
  const txs = await txRepo.listByOwner(owner, { from: period.from, to: period.to });
  const stats = summarize(txs);

  const header = [
    `${STATUS.chart} *Laporan ${period.label}*`,
    `${STATUS.calendar} ${txs.length} transaksi tercatat`,
    '',
  ];

  const summaryLines = [
    `${typeEmoji('pemasukan')} Pemasukan: ${formatRupiah(stats.income)}`,
    `${typeEmoji('pengeluaran')} Pengeluaran: ${formatRupiah(stats.expense)}`,
    `${STATUS.money} Selisih (net): ${formatRupiah(stats.net)}`,
    '',
  ];

  const insightLines = [`${STATUS.sparkle} *Sorotan*`];
  if (stats.biggest) {
    insightLines.push(
      `${categoryEmoji(stats.biggest.category)} Transaksi terbesar: ${formatRupiah(stats.biggest.amount)} (${stats.biggest.note || stats.biggest.category})`
    );
  }
  insightLines.push(`${STATUS.chart} Rata-rata pengeluaran/transaksi: ${formatRupiah(Math.round(stats.avgExpense))}`);
  if (stats.topCategories.length) {
    insightLines.push(`${STATUS.target} Top kategori: ` + stats.topCategories.map(([c, v]) => `${categoryEmoji(c)} ${c} (${formatCompact(v)})`).join(', '));
  }
  insightLines.push('');

  const tableLines = [`${STATUS.book} *Rincian Transaksi*`];
  for (const t of txs.slice(0, 200)) {
    const d = new Date(t.date);
    const tanggal = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
    tableLines.push(`${typeEmoji(t.type)} ${tanggal} ${categoryEmoji(t.category)} ${t.note || t.category} — ${formatRupiah(t.amount)}`);
  }
  if (!txs.length) tableLines.push('_(belum ada transaksi pada periode ini)_');

  const fullText = [...header, ...summaryLines, ...insightLines, ...tableLines].join('\n');
  return paginate(fullText, { label: 'Halaman' });
}

/** F-2.5: laporan tahunan — ringkasan 12 bulan + seluruh transaksi setahun. */
async function buildYearlyReport(owner, year) {
  const from = new Date(year, 0, 1);
  const to = new Date(year, 11, 31, 23, 59, 59);
  const txs = await txRepo.listByOwner(owner, { from, to });

  const perMonth = Array.from({ length: 12 }, (_, i) => ({ month: i, income: 0, expense: 0 }));
  for (const t of txs) {
    const m = new Date(t.date).getMonth();
    if (t.type === 'pemasukan') perMonth[m].income += t.amount;
    else perMonth[m].expense += t.amount;
  }

  let cumulativeSavings = 0;
  const monthLines = perMonth.map((m) => {
    cumulativeSavings += m.income - m.expense;
    return `${capitalize(BULAN_ID[m.month]).padEnd(10)} ${typeEmoji('pemasukan')}${formatCompact(m.income).padEnd(7)} ${typeEmoji('pengeluaran')}${formatCompact(m.expense).padEnd(7)} → Akumulasi: ${formatRupiah(cumulativeSavings)}`;
  });

  const stats = summarize(txs);
  const header = [
    `${STATUS.chart} *Laporan Tahunan ${year}*`,
    `${STATUS.calendar} Total ${txs.length} transaksi`,
    '',
    `${typeEmoji('pemasukan')} Total Pemasukan: ${formatRupiah(stats.income)}`,
    `${typeEmoji('pengeluaran')} Total Pengeluaran: ${formatRupiah(stats.expense)}`,
    `${STATUS.trophy} Saldo Penutupan/Tabungan Terakumulasi: ${formatRupiah(cumulativeSavings)}`,
    '',
    `${STATUS.book} *Ringkasan 12 Bulan*`,
    ...monthLines,
  ];

  return paginate(header.join('\n'), { label: 'Halaman' });
}

module.exports = { resolvePeriod, summarize, buildPeriodReport, buildYearlyReport, BULAN_ID };
