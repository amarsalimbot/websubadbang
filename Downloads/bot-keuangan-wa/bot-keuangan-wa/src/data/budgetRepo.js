'use strict';

const { getSheet } = require('./sheetsClient');
const { normalizeCategory, get: getCategory, expenseCategories } = require('../categories/catalog');

async function listByOwner(owner) {
  const sheet = await getSheet('Budget');
  const rows = await sheet.getRows();
  const custom = new Map(
    rows
      .filter((r) => r.get('nomor') === owner)
      .map((r) => [normalizeCategory(r.get('kategori')), Number(r.get('nominal_batas')) || 0])
  );

  // F-4.1: kategori tanpa budget kustom tetap dapat nilai default agar selalu terpantau.
  return expenseCategories()
    .filter((c) => c.defaultBudget > 0 || custom.has(c.id))
    .map((c) => ({
      category: c.id,
      label: c.label,
      limit: custom.has(c.id) ? custom.get(c.id) : c.defaultBudget,
      isCustom: custom.has(c.id),
    }));
}

async function setBudget(owner, category, amount) {
  const catId = normalizeCategory(category);
  const sheet = await getSheet('Budget');
  const rows = await sheet.getRows();
  const existing = rows.find((r) => r.get('nomor') === owner && normalizeCategory(r.get('kategori')) === catId);
  if (existing) {
    existing.set('nominal_batas', amount);
    await existing.save();
  } else {
    await sheet.addRow({ kategori: catId, nominal_batas: amount, nomor: owner });
  }
  return { category: catId, label: getCategory(catId).label, limit: amount };
}

module.exports = { listByOwner, setBudget };
