'use strict';

const txRepo = require('../data/transactionsRepo');
const budgetRepo = require('../data/budgetRepo');
const { formatRupiah } = require('../utils/money');
const { categoryEmoji, budgetLevelEmoji, STATUS } = require('../utils/emoji');

function currentMonthRange() {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
  return { from, to };
}

async function computeUsage(owner) {
  const { from, to } = currentMonthRange();
  const [budgets, txs] = await Promise.all([budgetRepo.listByOwner(owner), txRepo.listByOwner(owner, { from, to })]);

  const spentByCategory = new Map();
  for (const tx of txs) {
    if (tx.type !== 'pengeluaran') continue;
    spentByCategory.set(tx.category, (spentByCategory.get(tx.category) || 0) + tx.amount);
  }

  return budgets.map((b) => {
    const used = spentByCategory.get(b.category) || 0;
    const percent = b.limit > 0 ? Math.round((used / b.limit) * 100) : 0;
    return { ...b, used, percent };
  });
}

/** F-4.4: command "budget" — tabel monitoring seluruh kategori berbudget. */
async function buildBudgetTable(owner) {
  const usage = await computeUsage(owner);
  if (!usage.length) {
    return `${STATUS.info} Belum ada kategori dengan budget. Atur dulu dengan "set budget makan 1500000".`;
  }

  const lines = [`${STATUS.chart} *Monitoring Budget Bulan Ini*`, ''];
  for (const u of usage.sort((a, b) => b.percent - a.percent)) {
    const bar = renderBar(u.percent);
    lines.push(
      `${budgetLevelEmoji(u.percent)} ${categoryEmoji(u.category)} *${u.label}*`,
      `${bar} ${u.percent}%`,
      `   ${formatRupiah(u.used)} / ${formatRupiah(u.limit)}`,
      ''
    );
  }
  return lines.join('\n').trim();
}

function renderBar(percent, width = 12) {
  const filled = Math.min(width, Math.round((Math.min(percent, 100) / 100) * width));
  return '▓'.repeat(filled) + '░'.repeat(width - filled);
}

/** F-4.2: command "set budget [kategori] [nominal]". */
async function setBudget(owner, category, amount) {
  const result = await budgetRepo.setBudget(owner, category, amount);
  return `${STATUS.success} Budget *${result.label}* diatur ke ${formatRupiah(result.limit)} per bulan.`;
}

/**
 * F-4.3: dipanggil setelah transaksi pengeluaran baru tersimpan — mengecek
 * apakah kategori terkait baru saja melewati ambang 85% atau 100%.
 */
async function checkThresholdAfterTransaction(owner, category) {
  const usage = await computeUsage(owner);
  const item = usage.find((u) => u.category === category);
  if (!item || item.limit <= 0) return null;

  if (item.percent >= 100) {
    return {
      level: 'danger',
      message: `${STATUS.danger} *Budget ${item.label} sudah 100%+!* Terpakai ${formatRupiah(item.used)} dari ${formatRupiah(item.limit)}. Pertimbangkan rem pengeluaran kategori ini bulan ini.`,
    };
  }
  if (item.percent >= 85) {
    return {
      level: 'warning',
      message: `${STATUS.warning} *Budget ${item.label} sudah ${item.percent}%.* Sisa ${formatRupiah(item.limit - item.used)} untuk sisa bulan ini.`,
    };
  }
  return null;
}

module.exports = { computeUsage, buildBudgetTable, setBudget, checkThresholdAfterTransaction, currentMonthRange };
