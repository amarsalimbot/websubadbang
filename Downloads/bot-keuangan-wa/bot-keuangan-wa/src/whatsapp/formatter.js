'use strict';

const { STATUS, greetingEmoji } = require('../utils/emoji');

function greeting() {
  const hour = new Date().getHours();
  if (hour < 10) return 'Selamat pagi';
  if (hour < 15) return 'Selamat siang';
  if (hour < 18) return 'Selamat sore';
  return 'Selamat malam';
}

/** Menu utama (dikirim untuk "menu"/"help"/pesan pertama pengguna baru). */
function buildMainMenu() {
  return [
    `${greetingEmoji()} ${greeting()}! Aku *Asisten Keuangan* kamu ${STATUS.robot}`,
    '',
    `Catat transaksi langsung pakai kalimat natural, contoh:`,
    `_"beli kopi 25k", "gajian 5jt", "bayar listrik 300rb"_`,
    '',
    `${STATUS.book} *Perintah lain:*`,
    `${STATUS.chart} laporan [periode] — mis. "laporan bulan ini", "laporan Mei 2026"`,
    `${STATUS.export} export [periode] — unduh laporan Excel`,
    `${STATUS.target} budget — cek pemakaian budget bulan ini`,
    `${STATUS.gear} set budget [kategori] [nominal]`,
    `${STATUS.sparkle} analisis — analisis kesehatan keuangan bulan ini`,
    `${STATUS.bulb} tips — tips keuangan hari ini`,
    `${STATUS.chartUp} prediksi — proyeksi cashflow bulan ini`,
    `${STATUS.chart} grafik — grafik ASCII pengeluaran per kategori`,
    `${STATUS.chartUp} tren — tren arus kas 7 hari terakhir`,
    `${STATUS.robot} ai [pertanyaan] — tanya bebas ke asisten`,
    `${STATUS.crypto} saldo binance — portofolio crypto (khusus nomor tertentu)`,
    `${STATUS.link} dashboard — dapatkan tautan dashboard pribadi`,
    `${STATUS.undo} hapus terakhir — batalkan transaksi terakhir`,
    `${STATUS.bell} pengingat on/off — atur reminder harian`,
    '',
    `Ketik *menu* kapan saja untuk melihat daftar ini lagi ${STATUS.wave}`,
  ].join('\n');
}

function unknownCommand() {
  return `${STATUS.question} Aku belum paham maksudnya. Ketik *menu* untuk lihat daftar perintah, atau langsung tulis transaksimu seperti "beli nasi goreng 20k".`;
}

module.exports = { buildMainMenu, unknownCommand, greeting };
