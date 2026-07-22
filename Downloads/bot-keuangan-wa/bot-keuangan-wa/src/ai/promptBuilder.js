'use strict';

const { formatRupiah } = require('../utils/money');

/**
 * F-3.6: menyusun prompt kaya konteks (budget, saldo, perbandingan bulan lalu,
 * pacing pengeluaran, rencana aksi) agar jawaban AI lebih relevan & personal.
 */
function buildContextualPrompt(question, ctx = {}) {
  const {
    walletBalances = [],
    monthSpending = 0,
    lastMonthSpending = 0,
    budgets = [],
    dayOfMonth = new Date().getDate(),
    daysInMonth = 30,
  } = ctx;

  const pacingExpected = (lastMonthSpending / daysInMonth) * dayOfMonth;
  const pacingDelta = monthSpending - pacingExpected;

  const walletLines = walletBalances
    .map((w) => `- ${w.wallet}: ${formatRupiah(w.balance)}`)
    .join('\n') || '- (belum ada data dompet)';

  const budgetLines = budgets
    .map((b) => `- ${b.category}: terpakai ${formatRupiah(b.used)} dari ${formatRupiah(b.limit)} (${b.percent}%)`)
    .join('\n') || '- (belum ada budget diatur)';

  return `Kamu adalah asisten keuangan pribadi yang ramah, ringkas, dan berbasis data.
Konteks keuangan pengguna saat ini:

Saldo per dompet:
${walletLines}

Pengeluaran bulan ini: ${formatRupiah(monthSpending)}
Pengeluaran bulan lalu: ${formatRupiah(lastMonthSpending)}
Pacing (perkiraan wajar sampai hari ke-${dayOfMonth}): ${formatRupiah(pacingExpected)} (selisih ${pacingDelta >= 0 ? '+' : ''}${formatRupiah(pacingDelta)})

Status budget per kategori:
${budgetLines}

Pertanyaan pengguna: "${question}"

Jawab singkat (maksimal 5 kalimat), dalam Bahasa Indonesia, gunakan angka konkret dari konteks di atas bila relevan, dan tutup dengan satu saran aksi yang bisa langsung dilakukan hari ini.`;
}

module.exports = { buildContextualPrompt };
