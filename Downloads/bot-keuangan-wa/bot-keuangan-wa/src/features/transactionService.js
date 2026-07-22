'use strict';

const orchestrator = require('../ai/orchestrator');
const txRepo = require('../data/transactionsRepo');
const budgetService = require('./budgetService');
const { formatRupiah } = require('../utils/money');
const { categoryEmoji, walletEmoji, typeEmoji, STATUS } = require('../utils/emoji');
const { get: getCategory } = require('../categories/catalog');

/**
 * Alur pencatatan transaksi natural (12.1 di PRD, F-1.1–F-1.7).
 * Mengembalikan { transaction, replyText, budgetAlert } — replyText sudah
 * berisi emoji kontekstual siap dikirim ke WhatsApp.
 */
async function recordFromNaturalText(owner, text) {
  const parsed = await orchestrator.parseTransaction(text);

  if (!parsed.amount || parsed.amount <= 0) {
    return {
      transaction: null,
      replyText:
        `${STATUS.question} Aku belum menemukan nominalnya nih. Coba tulis seperti "beli kopi 25k" atau "gajian 5jt" ya.`,
    };
  }

  const tx = await txRepo.addTransaction({
    owner,
    date: parsed.date,
    type: parsed.type,
    amount: parsed.amount,
    category: parsed.category,
    wallet: parsed.wallet || 'tunai',
    note: parsed.note,
  });

  const balances = await txRepo.computeWalletBalances(owner);
  const walletBalance = balances.find((b) => b.wallet === tx.wallet)?.balance ?? 0;
  const cat = getCategory(tx.category);

  let budgetAlert = null;
  if (tx.type === 'pengeluaran') {
    budgetAlert = await budgetService.checkThresholdAfterTransaction(owner, tx.category);
  }

  const lines = [
    `${typeEmoji(tx.type)} *${tx.type === 'pemasukan' ? 'Pemasukan' : 'Pengeluaran'} tercatat* ${STATUS.saved}`,
    '',
    `${categoryEmoji(tx.category)} Kategori: ${cat.label}`,
    `${STATUS.money} Nominal: ${formatRupiah(tx.amount)}`,
    `${walletEmoji(tx.wallet)} Dompet: ${tx.wallet}`,
    tx.note ? `📝 Catatan: ${tx.note}` : null,
    '',
    `${walletEmoji(tx.wallet)} Saldo ${tx.wallet} sekarang: *${formatRupiah(walletBalance)}*`,
    parsed.source === 'local-parser'
      ? `${STATUS.info} _Dicatat via parser lokal (AI sedang tidak tersedia)_`
      : null,
  ].filter(Boolean);

  if (budgetAlert) lines.push('', budgetAlert.message);

  return { transaction: tx, replyText: lines.join('\n'), budgetAlert };
}

module.exports = { recordFromNaturalText };
