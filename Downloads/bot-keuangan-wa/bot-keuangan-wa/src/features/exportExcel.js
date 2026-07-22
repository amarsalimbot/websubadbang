'use strict';

const path = require('path');
const fs = require('fs');
const ExcelJS = require('exceljs');
const txRepo = require('../data/transactionsRepo');
const { resolvePeriod, summarize } = require('./reportService');

const EXPORT_DIR = path.join(process.cwd(), 'exports');

function ensureExportDir() {
  if (!fs.existsSync(EXPORT_DIR)) fs.mkdirSync(EXPORT_DIR, { recursive: true });
}

function styleHeaderRow(row) {
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2E7D32' } };
    cell.alignment = { vertical: 'middle', horizontal: 'left' };
  });
}

/**
 * F-2.6: menghasilkan file .xlsx berisi sheet Ringkasan, Diagram Kategori,
 * Saldo Dompet, Diagram Tren, dan Transaksi.
 * Catatan: grafik native Excel tidak didukung stabil oleh library exceljs,
 * sehingga "Diagram Kategori" dan "Diagram Tren" disajikan sebagai tabel
 * data + bar chart berbasis karakter yang tetap terbaca tanpa perlu Excel
 * mengaktifkan macro/plugin tambahan.
 */
async function exportPeriod(owner, phrase) {
  const period = resolvePeriod(phrase);
  const txs = await txRepo.listByOwner(owner, { from: period.from, to: period.to });
  const balances = await txRepo.computeWalletBalances(owner);
  const stats = summarize(txs);

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Bot Keuangan WA';
  wb.created = new Date();

  // --- Sheet 1: Ringkasan ---
  const ringkasan = wb.addWorksheet('Ringkasan');
  ringkasan.columns = [{ width: 28 }, { width: 22 }];
  ringkasan.addRow(['Laporan Periode', period.label]);
  ringkasan.addRow(['Jumlah Transaksi', stats.count]);
  ringkasan.addRow(['Total Pemasukan', stats.income]);
  ringkasan.addRow(['Total Pengeluaran', stats.expense]);
  ringkasan.addRow(['Selisih (Net)', stats.net]);
  ringkasan.addRow(['Rata-rata Pengeluaran', Math.round(stats.avgExpense)]);
  ringkasan.addRow(['Transaksi Terbesar', stats.biggest ? stats.biggest.amount : 0]);
  ringkasan.getColumn(2).numFmt = '#,##0';
  ringkasan.getRow(1).font = { bold: true, size: 13 };

  // --- Sheet 2: Diagram Kategori ---
  const catSheet = wb.addWorksheet('Diagram Kategori');
  const headerCat = catSheet.addRow(['Kategori', 'Total Pengeluaran', 'Persentase', 'Grafik']);
  styleHeaderRow(headerCat);
  catSheet.columns = [{ width: 22 }, { width: 18 }, { width: 12 }, { width: 40 }];
  const totalExpense = stats.expense || 1;
  for (const [cat, val] of stats.topCategories) {
    const pct = Math.round((val / totalExpense) * 100);
    catSheet.addRow([cat, val, `${pct}%`, '█'.repeat(Math.max(1, Math.round(pct / 4)))]);
  }
  catSheet.getColumn(2).numFmt = '#,##0';

  // --- Sheet 3: Saldo Dompet ---
  const walletSheet = wb.addWorksheet('Saldo Dompet');
  const headerWallet = walletSheet.addRow(['Dompet', 'Saldo']);
  styleHeaderRow(headerWallet);
  walletSheet.columns = [{ width: 22 }, { width: 18 }];
  for (const b of balances) walletSheet.addRow([b.wallet, b.balance]);
  walletSheet.getColumn(2).numFmt = '#,##0';

  // --- Sheet 4: Diagram Tren (harian dalam periode) ---
  const trendSheet = wb.addWorksheet('Diagram Tren');
  const headerTrend = trendSheet.addRow(['Tanggal', 'Pemasukan', 'Pengeluaran', 'Arus Kas Bersih']);
  styleHeaderRow(headerTrend);
  trendSheet.columns = [{ width: 14 }, { width: 16 }, { width: 16 }, { width: 16 }];
  const byDay = new Map();
  for (const t of txs) {
    const key = new Date(t.date).toISOString().slice(0, 10);
    const cur = byDay.get(key) || { income: 0, expense: 0 };
    if (t.type === 'pemasukan') cur.income += t.amount;
    else cur.expense += t.amount;
    byDay.set(key, cur);
  }
  for (const [date, v] of [...byDay.entries()].sort()) {
    trendSheet.addRow([date, v.income, v.expense, v.income - v.expense]);
  }
  trendSheet.getColumn(2).numFmt = '#,##0';
  trendSheet.getColumn(3).numFmt = '#,##0';
  trendSheet.getColumn(4).numFmt = '#,##0';

  // --- Sheet 5: Transaksi lengkap ---
  const txSheet = wb.addWorksheet('Transaksi');
  const headerTx = txSheet.addRow(['Tanggal', 'Jenis', 'Nominal', 'Kategori', 'Dompet', 'Keterangan']);
  styleHeaderRow(headerTx);
  txSheet.columns = [{ width: 14 }, { width: 14 }, { width: 16 }, { width: 18 }, { width: 14 }, { width: 40 }];
  for (const t of txs) {
    txSheet.addRow([
      new Date(t.date).toISOString().slice(0, 10),
      t.type,
      t.amount,
      t.category,
      t.wallet,
      t.note || '',
    ]);
  }
  txSheet.getColumn(3).numFmt = '#,##0';

  ensureExportDir();
  const filename = `laporan_${owner}_${period.label.replace(/\s+/g, '_')}_${Date.now()}.xlsx`;
  const filepath = path.join(EXPORT_DIR, filename);
  await wb.xlsx.writeFile(filepath);
  return { filepath, filename, label: period.label };
}

module.exports = { exportPeriod };
