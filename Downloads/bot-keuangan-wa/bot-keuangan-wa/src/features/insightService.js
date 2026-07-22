'use strict';

const txRepo = require('../data/transactionsRepo');
const budgetService = require('./budgetService');
const orchestrator = require('../ai/orchestrator');
const { formatRupiah } = require('../utils/money');
const { STATUS, categoryEmoji, budgetLevelEmoji } = require('../utils/emoji');

function monthBounds(offsetMonths = 0) {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth() + offsetMonths, 1);
  const to = new Date(now.getFullYear(), now.getMonth() + offsetMonths + 1, 0, 23, 59, 59);
  return { from, to };
}

/** Smart Radar (F-6.5): fokus harian, level risiko, ritme belanja, transaksi terbesar. */
async function buildSmartRadar(owner) {
  const now = new Date();
  const { from, to } = monthBounds(0);
  const [txs, usage] = await Promise.all([txRepo.listByOwner(owner, { from, to }), budgetService.computeUsage(owner)]);

  const expense = txs.filter((t) => t.type === 'pengeluaran');
  const totalExpense = expense.reduce((s, t) => s + t.amount, 0);
  const dayOfMonth = now.getDate();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const dailyAvg = totalExpense / dayOfMonth;
  const projectedMonthEnd = dailyAvg * daysInMonth;

  const riskiest = usage.filter((u) => u.limit > 0).sort((a, b) => b.percent - a.percent)[0] || null;
  const dominantCategory = [...expense.reduce((map, t) => {
    map.set(t.category, (map.get(t.category) || 0) + t.amount);
    return map;
  }, new Map())].sort((a, b) => b[1] - a[1])[0] || null;

  const biggest = expense.reduce((max, t) => (t.amount > (max?.amount || 0) ? t : max), null);

  let riskLevel = 'aman';
  if (riskiest && riskiest.percent >= 100) riskLevel = 'tinggi';
  else if (riskiest && riskiest.percent >= 85) riskLevel = 'waspada';

  const focus =
    riskLevel === 'tinggi'
      ? `Kurangi pengeluaran kategori ${riskiest.label} sisa bulan ini — sudah melewati budget.`
      : riskLevel === 'waspada'
      ? `Perlambat pengeluaran ${riskiest.label}, tersisa ${formatRupiah(riskiest.limit - riskiest.used)}.`
      : dominantCategory
      ? `Pantau kategori ${dominantCategory[0]} yang paling dominan bulan ini.`
      : 'Belum ada pengeluaran signifikan bulan ini — pertahankan!';

  return {
    riskLevel,
    dailyAvg,
    projectedMonthEnd,
    dominantCategory,
    biggest,
    riskiestBudget: riskiest,
    focus,
  };
}

function healthScore(radar, stats) {
  let score = 100;
  if (radar.riskLevel === 'waspada') score -= 15;
  if (radar.riskLevel === 'tinggi') score -= 35;
  if (stats.net < 0) score -= 25;
  if (radar.projectedMonthEnd > (stats.income || radar.projectedMonthEnd)) score -= 10;
  return Math.max(0, Math.min(100, score));
}

/** Command "analisis" (F-3.5): analisis AI bulanan berbasis data + narasi AI. */
async function buildAnalysis(owner) {
  const { from, to } = monthBounds(0);
  const { from: prevFrom, to: prevTo } = monthBounds(-1);
  const [txs, prevTxs, balances, usage, radar] = await Promise.all([
    txRepo.listByOwner(owner, { from, to }),
    txRepo.listByOwner(owner, { from: prevFrom, to: prevTo }),
    txRepo.computeWalletBalances(owner),
    budgetService.computeUsage(owner),
    buildSmartRadar(owner),
  ]);

  const { summarize } = require('./reportService');
  const stats = summarize(txs);
  const prevStats = summarize(prevTxs);
  const score = healthScore(radar, stats);
  const deltaVsLastMonth = stats.expense - prevStats.expense;

  const lines = [
    `${STATUS.sparkle} *Analisis Keuangan Bulan Ini*`,
    '',
    `${STATUS.trophy} Skor Kesehatan Keuangan: *${score}/100*`,
    `${budgetLevelEmoji(radar.riskiestBudget?.percent || 0)} Level Risiko: ${radar.riskLevel.toUpperCase()}`,
    `${STATUS.chart} Pengeluaran bulan ini: ${formatRupiah(stats.expense)} (${deltaVsLastMonth >= 0 ? '+' : ''}${formatRupiah(deltaVsLastMonth)} vs bulan lalu)`,
    `${STATUS.chartUp} Proyeksi akhir bulan (pacing saat ini): ${formatRupiah(Math.round(radar.projectedMonthEnd))}`,
    '',
    `${STATUS.target} *Fokus Aksi Hari Ini*`,
    radar.focus,
  ];

  try {
    const ai = await orchestrator.askContextual(
      'Berikan analisis singkat kondisi keuangan bulan ini dan satu rekomendasi konkret.',
      {
        walletBalances: balances,
        monthSpending: stats.expense,
        lastMonthSpending: prevStats.expense,
        budgets: usage.map((u) => ({ category: u.label, used: u.used, limit: u.limit, percent: u.percent })),
      }
    );
    if (ai.source !== 'none') {
      lines.push('', `${STATUS.robot} *Catatan AI*`, ai.answer);
    }
  } catch {
    // Diamkan — insight berbasis data lokal di atas tetap valid tanpa AI.
  }

  return lines.join('\n');
}

/** Command "tips" — tips keuangan harian singkat. */
async function buildTips(owner) {
  const radar = await buildSmartRadar(owner);
  const base = [
    `${STATUS.bulb} *Tips Keuangan Hari Ini*`,
    '',
    radar.focus,
  ];
  try {
    const ai = await orchestrator.askContextual('Berikan satu tips keuangan praktis untuk hari ini.', {});
    if (ai.source !== 'none') base.push('', `${STATUS.robot} ${ai.answer}`);
  } catch {
    /* fallback ke tips lokal saja */
  }
  return base.join('\n');
}

/** Command "prediksi" — prediksi cashflow bulan ini. */
async function buildPrediction(owner) {
  const radar = await buildSmartRadar(owner);
  const { from, to } = monthBounds(0);
  const txs = await txRepo.listByOwner(owner, { from, to });
  const { summarize } = require('./reportService');
  const stats = summarize(txs);
  const projectedNet = stats.income - radar.projectedMonthEnd;

  return [
    `${STATUS.chartUp} *Prediksi Cashflow Bulan Ini*`,
    '',
    `${STATUS.money} Rata-rata pengeluaran/hari: ${formatRupiah(Math.round(radar.dailyAvg))}`,
    `${STATUS.chart} Proyeksi total pengeluaran akhir bulan: ${formatRupiah(Math.round(radar.projectedMonthEnd))}`,
    `${projectedNet >= 0 ? STATUS.safe : STATUS.danger} Proyeksi saldo bersih akhir bulan: ${formatRupiah(Math.round(projectedNet))}`,
  ].join('\n');
}

/** Command "ai [pertanyaan]" (F-3.4). */
async function answerQuestion(owner, question) {
  const [balances, usage] = await Promise.all([txRepo.computeWalletBalances(owner), budgetService.computeUsage(owner)]);
  const { from, to } = monthBounds(0);
  const { from: prevFrom, to: prevTo } = monthBounds(-1);
  const [txs, prevTxs] = await Promise.all([
    txRepo.listByOwner(owner, { from, to }),
    txRepo.listByOwner(owner, { from: prevFrom, to: prevTo }),
  ]);
  const { summarize } = require('./reportService');
  const stats = summarize(txs);
  const prevStats = summarize(prevTxs);

  const result = await orchestrator.askContextual(question, {
    walletBalances: balances,
    monthSpending: stats.expense,
    lastMonthSpending: prevStats.expense,
    budgets: usage.map((u) => ({ category: u.label, used: u.used, limit: u.limit, percent: u.percent })),
  });
  return `${STATUS.robot} ${result.answer}`;
}

module.exports = { buildSmartRadar, buildAnalysis, buildTips, buildPrediction, answerQuestion, healthScore };
