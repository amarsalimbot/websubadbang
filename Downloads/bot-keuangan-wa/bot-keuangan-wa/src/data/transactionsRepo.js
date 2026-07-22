'use strict';

const crypto = require('crypto');
const { getSheet } = require('./sheetsClient');
const { normalizeCategory } = require('../categories/catalog');

function newId() {
  return crypto.randomBytes(6).toString('hex');
}

function rowToTx(row) {
  return {
    id: row.get('id'),
    date: row.get('tanggal'),
    type: row.get('jenis'),
    amount: Number(row.get('nominal')) || 0,
    category: row.get('kategori'),
    wallet: row.get('dompet'),
    note: row.get('keterangan'),
    owner: row.get('nomor'),
    _row: row,
  };
}

async function addTransaction({ owner, date, type, amount, category, wallet, note }) {
  const sheet = await getSheet('Transaksi');
  const id = newId();
  await sheet.addRow({
    id,
    tanggal: new Date(date).toISOString(),
    jenis: type,
    nominal: amount,
    kategori: normalizeCategory(category),
    dompet: wallet || 'tunai',
    keterangan: note || '',
    nomor: owner,
  });
  return { id, owner, date, type, amount, category: normalizeCategory(category), wallet: wallet || 'tunai', note };
}

async function listByOwner(owner, { from, to } = {}) {
  const sheet = await getSheet('Transaksi');
  const rows = await sheet.getRows();
  return rows
    .filter((r) => r.get('nomor') === owner)
    .map(rowToTx)
    .filter((tx) => {
      if (!from && !to) return true;
      const d = new Date(tx.date).getTime();
      if (from && d < new Date(from).getTime()) return false;
      if (to && d > new Date(to).getTime()) return false;
      return true;
    })
    .sort((a, b) => new Date(b.date) - new Date(a.date));
}

async function listAllOwners() {
  const sheet = await getSheet('Transaksi');
  const rows = await sheet.getRows();
  return [...new Set(rows.map((r) => r.get('nomor')).filter(Boolean))];
}

async function getById(owner, id) {
  const all = await listByOwner(owner);
  return all.find((t) => t.id === id) || null;
}

async function updateTransaction(owner, id, patch) {
  const tx = await getById(owner, id);
  if (!tx) return null;
  const row = tx._row;
  if (patch.date !== undefined) row.set('tanggal', new Date(patch.date).toISOString());
  if (patch.type !== undefined) row.set('jenis', patch.type);
  if (patch.amount !== undefined) row.set('nominal', patch.amount);
  if (patch.category !== undefined) row.set('kategori', normalizeCategory(patch.category));
  if (patch.wallet !== undefined) row.set('dompet', patch.wallet);
  if (patch.note !== undefined) row.set('keterangan', patch.note);
  await row.save();
  return rowToTx(row);
}

async function deleteTransaction(owner, id) {
  const tx = await getById(owner, id);
  if (!tx) return false;
  await tx._row.delete();
  return true;
}

async function deleteLast(owner) {
  const all = await listByOwner(owner);
  if (!all.length) return null;
  const last = all[0]; // sudah terurut terbaru dulu
  await last._row.delete();
  return last;
}

/** Rekalkulasi saldo per dompet (F-6.10): pemasukan menambah, pengeluaran mengurangi. */
async function computeWalletBalances(owner) {
  const txs = await listByOwner(owner);
  const balances = new Map();
  for (const tx of txs) {
    const current = balances.get(tx.wallet) || 0;
    const delta = tx.type === 'pemasukan' ? tx.amount : -tx.amount;
    balances.set(tx.wallet, current + delta);
  }
  return [...balances.entries()].map(([wallet, balance]) => ({ wallet, balance }));
}

async function deleteAllForOwner(owner) {
  const sheet = await getSheet('Transaksi');
  const rows = await sheet.getRows();
  const mine = rows.filter((r) => r.get('nomor') === owner);
  for (const row of mine.reverse()) {
    await row.delete();
  }
  return mine.length;
}

module.exports = {
  addTransaction,
  listByOwner,
  listAllOwners,
  getById,
  updateTransaction,
  deleteTransaction,
  deleteLast,
  computeWalletBalances,
  deleteAllForOwner,
};
