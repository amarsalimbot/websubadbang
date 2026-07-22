'use strict';

const logger = require('../utils/logger');
const userRepo = require('../data/userRepo');
const txRepo = require('../data/transactionsRepo');
const { formatRupiah } = require('../utils/money');
const { STATUS, greetingEmoji } = require('../utils/emoji');

const REMINDER_HOUR = 20; // 20:00 waktu server — dapat disesuaikan lewat env di iterasi berikutnya
let lastSentDateKey = null;

async function buildDailySummary(owner) {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const txs = await txRepo.listByOwner(owner, { from, to: now });
  const expense = txs.filter((t) => t.type === 'pengeluaran').reduce((s, t) => s + t.amount, 0);
  const income = txs.filter((t) => t.type === 'pemasukan').reduce((s, t) => s + t.amount, 0);

  if (!txs.length) {
    return `${greetingEmoji()} *Pengingat Harian*\n\nBelum ada transaksi tercatat hari ini. Jangan lupa catat pengeluaranmu ya ${STATUS.pin}`;
  }

  return [
    `${greetingEmoji()} *Ringkasan Hari Ini*`,
    '',
    `${STATUS.money} Pemasukan: ${formatRupiah(income)}`,
    `${STATUS.money} Pengeluaran: ${formatRupiah(expense)}`,
    `${STATUS.book} ${txs.length} transaksi tercatat hari ini`,
  ].join('\n');
}

function dateKey(d) {
  return d.toISOString().slice(0, 10);
}

/** Dipanggil tiap menit oleh index.js; hanya benar-benar mengirim sekali per hari pada REMINDER_HOUR. */
async function tick(sock) {
  const now = new Date();
  const key = dateKey(now);
  if (now.getHours() !== REMINDER_HOUR || lastSentDateKey === key) return;
  lastSentDateKey = key;

  try {
    const owners = await userRepo.listAllOwners();
    for (const owner of owners) {
      const enabled = await userRepo.isReminderOn(owner);
      if (!enabled) continue;
      const text = await buildDailySummary(owner);
      await sock.sendMessage(`${owner}@s.whatsapp.net`, { text });
    }
    logger.info({ count: owners.length }, 'Pengingat harian terkirim');
  } catch (err) {
    logger.error({ err: err.message }, 'Gagal mengirim pengingat harian');
  }
}

function schedule(sock) {
  setInterval(() => tick(sock), 60_000);
  logger.info({ hour: REMINDER_HOUR }, 'Penjadwal pengingat harian aktif');
}

module.exports = { schedule, buildDailySummary };
