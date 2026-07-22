'use strict';

const { verifyDashboardToken } = require('../../utils/signedToken');
const txRepo = require('../../data/transactionsRepo');
const budgetService = require('../../features/budgetService');
const reportService = require('../../features/reportService');
const insightService = require('../../features/insightService');
const binanceService = require('../../features/binanceService');
const { validate } = require('../../config/env');
const { all: allCategories } = require('../../categories/catalog');

function auth(url) {
  const token = url.searchParams.get('token');
  return verifyDashboardToken(token);
}

async function handle(req, res, url, { sendJson }) {
  const segments = url.pathname.replace(/^\/api\//, '').split('/').filter(Boolean);
  const [resource, ...rest] = segments;

  if (resource === 'env-check') {
    const verified = auth(url);
    if (!verified.valid || !verified.superAdmin) return sendJson(res, 403, { error: 'FORBIDDEN' });
    return sendJson(res, 200, { issues: validate() });
  }

  const verified = auth(url);
  if (!verified.valid) return sendJson(res, 401, { error: verified.reason });
  const owner = verified.owner;

  if (resource === 'categories') {
    return sendJson(res, 200, { categories: allCategories() });
  }

  if (resource === 'summary') {
    const [balances, usage, radar] = await Promise.all([
      txRepo.computeWalletBalances(owner),
      budgetService.computeUsage(owner),
      insightService.buildSmartRadar(owner),
    ]);
    const { from, to } = budgetService.currentMonthRange();
    const txs = await txRepo.listByOwner(owner, { from, to });
    const { summarize } = reportService;
    const stats = summarize(txs);
    return sendJson(res, 200, {
      balances,
      budgets: usage,
      radar,
      stats,
      score: insightService.healthScore(radar, stats),
    });
  }

  if (resource === 'transactions') {
    if (req.method === 'DELETE' || (req.method === 'POST' && rest[0] === 'delete')) {
      const id = req.body?.id || url.searchParams.get('id');
      const ok = await txRepo.deleteTransaction(owner, id);
      return sendJson(res, ok ? 200 : 404, { ok });
    }
    if (req.method === 'POST') {
      const { date, type, amount, category, wallet, note } = req.body || {};
      const tx = await txRepo.addTransaction({
        owner,
        date: date ? new Date(date) : new Date(),
        type: type === 'pemasukan' ? 'pemasukan' : 'pengeluaran',
        amount: Number(amount) || 0,
        category,
        wallet: wallet || 'tunai',
        note,
      });
      return sendJson(res, 201, { transaction: tx });
    }
    const from = url.searchParams.get('from');
    const to = url.searchParams.get('to');
    const txs = await txRepo.listByOwner(owner, { from, to });
    return sendJson(res, 200, { transactions: txs.map(({ _row, ...t }) => t) });
  }

  if (resource === 'report') {
    const phrase = url.searchParams.get('period') || '';
    const pages = await reportService.buildPeriodReport(owner, phrase);
    return sendJson(res, 200, { pages });
  }

  if (resource === 'binance') {
    const message = await binanceService.buildBalanceMessage(owner);
    const snap = await binanceService.getAccountSnapshot(owner);
    return sendJson(res, 200, { message, snapshot: snap });
  }

  return sendJson(res, 404, { error: 'UNKNOWN_ENDPOINT' });
}

module.exports = { handle };
