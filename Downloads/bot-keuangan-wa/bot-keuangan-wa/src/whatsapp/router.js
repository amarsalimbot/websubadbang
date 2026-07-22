'use strict';

const logger = require('../utils/logger');
const { buildMainMenu, unknownCommand } = require('./formatter');
const { STATUS } = require('../utils/emoji');

const transactionService = require('../features/transactionService');
const budgetService = require('../features/budgetService');
const reportService = require('../features/reportService');
const exportExcel = require('../features/exportExcel');
const insightService = require('../features/insightService');
const asciiChart = require('../features/asciiChart');
const binanceService = require('../features/binanceService');
const txRepo = require('../data/transactionsRepo');
const userRepo = require('../data/userRepo');
const orchestrator = require('../ai/orchestrator');
const { createDashboardToken, buildShortLink } = require('../utils/signedToken');
const { env } = require('../config/env');

function isSuperAdmin(owner) {
  return env.SUPER_ADMIN_NUMBERS.includes(owner);
}

/**
 * Menentukan handler berdasarkan teks masuk. Urutan penting: perintah
 * eksplisit dicek dulu (lebih spesifik), baru fallback ke pencatatan
 * transaksi natural (F-1.1) sebagai default paling umum dipakai.
 */
async function route(owner, rawText) {
  const text = (rawText || '').trim();
  const lower = text.toLowerCase();

  try {
    if (!text) return { text: unknownCommand() };

    if (['menu', 'help', 'bantuan', 'mulai', 'start'].includes(lower)) {
      return { text: buildMainMenu() };
    }

    if (/^(laporan|riwayat)\b/i.test(lower)) {
      const phrase = lower.replace(/^(laporan|riwayat)\b/i, '').trim();
      const pages = await reportService.buildPeriodReport(owner, phrase);
      return { pages };
    }

    if (/^export\b/i.test(lower)) {
      const phrase = lower.replace(/^export\b/i, '').trim();
      const { filepath, filename, label } = await exportExcel.exportPeriod(owner, phrase);
      return {
        text: `${STATUS.export} Laporan *${label}* siap diunduh.`,
        file: { path: filepath, filename },
      };
    }

    if (lower === 'budget') {
      return { text: await budgetService.buildBudgetTable(owner) };
    }

    if (/^set budget\b/i.test(lower)) {
      const rest = text.replace(/^set budget\b/i, '').trim();
      const match = rest.match(/^(.+?)\s+([\d.,]+\s*(?:jt|juta|rb|ribu|k|m)?|\d+)$/i);
      if (!match) {
        return { text: `${STATUS.question} Format: "set budget makan 1500000" atau "set budget kopi 300k"` };
      }
      const { extractPrimaryAmount } = require('../utils/money');
      const amount = extractPrimaryAmount(match[2]);
      return { text: await budgetService.setBudget(owner, match[1].trim(), amount ? amount.value : Number(match[2])) };
    }

    if (lower === 'analisis') {
      return { text: await insightService.buildAnalysis(owner) };
    }

    if (lower === 'tips') {
      return { text: await insightService.buildTips(owner) };
    }

    if (lower === 'prediksi') {
      return { text: await insightService.buildPrediction(owner) };
    }

    if (lower === 'grafik' || /^grafik\b/i.test(lower)) {
      return { text: await asciiChart.buildMonthlyCategoryChart(owner) };
    }

    if (lower === 'tren') {
      return { text: await asciiChart.buildWeeklyTrend(owner) };
    }

    if (/^ai\b/i.test(lower) && lower !== 'ai') {
      const question = text.replace(/^ai\b/i, '').trim();
      return { text: await insightService.answerQuestion(owner, question) };
    }

    if (lower === 'status ai') {
      const s = orchestrator.status();
      return {
        text: [
          `${STATUS.robot} *Status Provider AI*`,
          '',
          `OpenAI: ${s.openai.configured ? (s.openai.open ? `${STATUS.warning} cooldown (${s.openai.cooldownRemainingSeconds}s)` : `${STATUS.success} aktif`) : `${STATUS.info} tidak dikonfigurasi`}`,
          `Gemini: ${s.gemini.configured ? (s.gemini.open ? `${STATUS.warning} cooldown (${s.gemini.cooldownRemainingSeconds}s)` : `${STATUS.success} aktif`) : `${STATUS.info} tidak dikonfigurasi`}`,
          `Parser lokal: ${STATUS.success} selalu tersedia sebagai jaring pengaman`,
        ].join('\n'),
      };
    }

    if (lower === 'saldo binance' || lower === 'portofolio crypto' || lower === 'binance') {
      return { text: await binanceService.buildBalanceMessage(owner) };
    }

    if (lower === 'dashboard') {
      const token = createDashboardToken(owner, { superAdmin: isSuperAdmin(owner) });
      const link = buildShortLink(token);
      return {
        text: [
          `${STATUS.link} *Dashboard Pribadi Kamu*`,
          '',
          link,
          '',
          `${STATUS.lock} Tautan ini pribadi dan berlaku ${env.DASHBOARD_LINK_DAYS} hari. Jangan dibagikan ke orang lain.`,
        ].join('\n'),
      };
    }

    if (lower === 'hapus terakhir' || lower === 'batalkan' || lower === 'undo') {
      const deleted = await txRepo.deleteLast(owner);
      if (!deleted) return { text: `${STATUS.info} Tidak ada transaksi untuk dihapus.` };
      const { formatRupiah } = require('../utils/money');
      return {
        text: `${STATUS.trash} Transaksi terakhir dihapus: ${deleted.note || deleted.category} — ${formatRupiah(deleted.amount)}`,
      };
    }

    if (/^pengingat (on|off)$/i.test(lower)) {
      const on = /on$/i.test(lower);
      await userRepo.setReminder(owner, on);
      return { text: `${on ? STATUS.bell : STATUS.bellOff} Pengingat harian ${on ? 'diaktifkan' : 'dimatikan'}.` };
    }

    // Default: perlakukan sebagai pencatatan transaksi natural (F-1.1)
    const result = await transactionService.recordFromNaturalText(owner, text);
    return { text: result.replyText };
  } catch (err) {
    logger.error({ err: err.message, owner, text }, 'Router gagal memproses pesan');
    return {
      text: `${STATUS.error} Ada gangguan saat memproses pesanmu. Coba lagi sebentar lagi ya.`,
    };
  }
}

module.exports = { route };
