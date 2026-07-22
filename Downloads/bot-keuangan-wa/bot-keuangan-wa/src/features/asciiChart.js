'use strict';

const txRepo = require('../data/transactionsRepo');
const { formatCompact } = require('../utils/money');
const { STATUS, categoryEmoji } = require('../utils/emoji');

const BAR_BLOCKS = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];

function sparkline(values) {
  const max = Math.max(...values, 1);
  return values.map((v) => BAR_BLOCKS[Math.min(BAR_BLOCKS.length - 1, Math.floor((v / max) * (BAR_BLOCKS.length - 1)))]).join('');
}

/** Command "grafik bulan ini": grafik ASCII pengeluaran per kategori. */
async function buildMonthlyCategoryChart(owner) {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
  const txs = await txRepo.listByOwner(owner, { from, to });

  const byCategory = new Map();
  for (const t of txs) {
    if (t.type !== 'pengeluaran') continue;
    byCategory.set(t.category, (byCategory.get(t.category) || 0) + t.amount);
  }
  const sorted = [...byCategory.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  if (!sorted.length) return `${STATUS.info} Belum ada pengeluaran bulan ini untuk digrafikkan.`;

  const max = sorted[0][1];
  const lines = [`${STATUS.chart} *Grafik Pengeluaran Bulan Ini*`, ''];
  for (const [cat, val] of sorted) {
    const width = Math.max(1, Math.round((val / max) * 20));
    lines.push(`${categoryEmoji(cat)} ${cat.padEnd(14)} ${'█'.repeat(width)} ${formatCompact(val)}`);
  }
  return lines.join('\n');
}

/** Command "tren": visualisasi ASCII arus kas 7 hari terakhir. */
async function buildWeeklyTrend(owner) {
  const now = new Date();
  const from = new Date(now);
  from.setDate(from.getDate() - 6);
  const txs = await txRepo.listByOwner(owner, { from, to: now });

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(from);
    d.setDate(d.getDate() + i);
    return d.toISOString().slice(0, 10);
  });

  const expensePerDay = new Map(days.map((d) => [d, 0]));
  for (const t of txs) {
    if (t.type !== 'pengeluaran') continue;
    const key = new Date(t.date).toISOString().slice(0, 10);
    if (expensePerDay.has(key)) expensePerDay.set(key, expensePerDay.get(key) + t.amount);
  }

  const values = days.map((d) => expensePerDay.get(d));
  const chart = sparkline(values);
  const busiest = days[values.indexOf(Math.max(...values))];

  const lines = [
    `${STATUS.chartUp} *Tren 7 Hari Terakhir*`,
    '',
    chart,
    ...days.map((d, i) => `${d.slice(5)}: ${formatCompact(values[i])}`),
    '',
    `${STATUS.fire} Hari tersibuk: ${busiest}`,
  ];
  return lines.join('\n');
}

module.exports = { buildMonthlyCategoryChart, buildWeeklyTrend };
