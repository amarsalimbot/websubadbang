'use strict';

const { getSheet } = require('./sheetsClient');

async function getOrCreatePref(owner) {
  const sheet = await getSheet('Preferensi');
  const rows = await sheet.getRows();
  let row = rows.find((r) => r.get('nomor') === owner);
  if (!row) {
    row = await sheet.addRow({ nomor: owner, pengingat: 'on', dashboard_token_hash: '' });
  }
  return row;
}

async function setReminder(owner, enabled) {
  const row = await getOrCreatePref(owner);
  row.set('pengingat', enabled ? 'on' : 'off');
  await row.save();
  return enabled;
}

async function isReminderOn(owner) {
  const row = await getOrCreatePref(owner);
  return (row.get('pengingat') || 'on') === 'on';
}

async function listAllOwners() {
  const sheet = await getSheet('Preferensi');
  const rows = await sheet.getRows();
  return rows.map((r) => r.get('nomor')).filter(Boolean);
}

module.exports = { getOrCreatePref, setReminder, isReminderOn, listAllOwners };
