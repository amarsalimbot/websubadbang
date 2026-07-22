'use strict';

const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
const { env } = require('../config/env');
const logger = require('../utils/logger');

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

function loadServiceAccountCredentials() {
  if (env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    return JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_JSON);
  }
  if (env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64) {
    const decoded = Buffer.from(env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64, 'base64').toString('utf8');
    return JSON.parse(decoded);
  }
  if (env.GOOGLE_CLIENT_EMAIL && env.GOOGLE_PRIVATE_KEY) {
    return { client_email: env.GOOGLE_CLIENT_EMAIL, private_key: env.GOOGLE_PRIVATE_KEY };
  }
  throw new Error(
    'Kredensial Google Service Account tidak ditemukan. Isi salah satu: GOOGLE_SERVICE_ACCOUNT_JSON, ' +
      'GOOGLE_SERVICE_ACCOUNT_JSON_BASE64, atau pasangan GOOGLE_CLIENT_EMAIL + GOOGLE_PRIVATE_KEY.'
  );
}

let docPromise = null;

const SHEET_SCHEMAS = {
  Transaksi: ['id', 'tanggal', 'jenis', 'nominal', 'kategori', 'dompet', 'keterangan', 'nomor'],
  Budget: ['kategori', 'nominal_batas', 'nomor'],
  Preferensi: ['nomor', 'pengingat', 'dashboard_token_hash'],
  Kategori: ['id', 'label', 'grup', 'jenis'],
};

async function ensureSheet(doc, title, headerValues) {
  let sheet = doc.sheetsByTitle[title];
  if (!sheet) {
    sheet = await doc.addSheet({ title, headerValues });
    logger.info({ title }, 'Sheet baru dibuat otomatis');
  }
  return sheet;
}

async function getDoc() {
  if (docPromise) return docPromise;

  docPromise = (async () => {
    const creds = loadServiceAccountCredentials();
    const jwt = new JWT({ email: creds.client_email, key: creds.private_key, scopes: SCOPES });
    const doc = new GoogleSpreadsheet(env.SPREADSHEET_ID, jwt);
    await doc.loadInfo();

    for (const [title, headers] of Object.entries(SHEET_SCHEMAS)) {
      await ensureSheet(doc, title, headers);
    }
    logger.info({ title: doc.title }, 'Terhubung ke Google Spreadsheet');
    return doc;
  })();

  return docPromise;
}

async function getSheet(title) {
  const doc = await getDoc();
  return doc.sheetsByTitle[title];
}

module.exports = { getDoc, getSheet, SHEET_SCHEMAS };
