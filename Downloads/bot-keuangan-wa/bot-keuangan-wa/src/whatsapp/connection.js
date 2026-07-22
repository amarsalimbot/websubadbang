'use strict';

const path = require('path');
const fs = require('fs');
const qrcode = require('qrcode-terminal');
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} = require('@whiskeysockets/baileys');
const logger = require('../utils/logger');
const { route } = require('./router');

const AUTH_DIR = path.join(process.cwd(), 'auth_session');

let sockRef = null;

async function sendReply(sock, jid, result) {
  if (result.pages) {
    for (const page of result.pages) {
      await sock.sendMessage(jid, { text: page });
    }
    return;
  }
  if (result.text) {
    await sock.sendMessage(jid, { text: result.text });
  }
  if (result.file) {
    const buffer = fs.readFileSync(result.file.path);
    await sock.sendMessage(jid, {
      document: buffer,
      fileName: result.file.filename,
      mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
  }
}

function extractOwnerNumber(jid) {
  return jid.split('@')[0];
}

function extractText(msg) {
  const m = msg.message;
  if (!m) return '';
  return (
    m.conversation ||
    m.extendedTextMessage?.text ||
    m.imageMessage?.caption ||
    m.videoMessage?.caption ||
    ''
  );
}

async function start() {
  if (!fs.existsSync(AUTH_DIR)) fs.mkdirSync(AUTH_DIR, { recursive: true });
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    logger: logger.child({ module: 'baileys' }),
    printQRInTerminal: false,
    browser: ['Bot Keuangan', 'Chrome', '2.1.0'],
  });

  sockRef = sock;
  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      logger.info('Scan QR berikut dengan WhatsApp untuk menghubungkan bot:');
      qrcode.generate(qr, { small: true });
    }

    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      logger.warn({ statusCode, shouldReconnect }, 'Koneksi WhatsApp terputus');
      if (shouldReconnect) start();
      else logger.error('Sesi logout — hapus folder auth_session dan scan ulang QR.');
    } else if (connection === 'open') {
      logger.info('Bot WhatsApp terhubung dan siap menerima pesan.');
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const msg of messages) {
      if (msg.key.fromMe) continue;
      if (msg.key.remoteJid?.endsWith('@g.us')) continue; // abaikan grup, bot bersifat personal
      const text = extractText(msg);
      if (!text) continue;

      const owner = extractOwnerNumber(msg.key.remoteJid);
      logger.info({ owner, text }, 'Pesan masuk');

      try {
        const result = await route(owner, text);
        await sendReply(sock, msg.key.remoteJid, result);
      } catch (err) {
        logger.error({ err: err.message, owner }, 'Gagal membalas pesan');
        await sock.sendMessage(msg.key.remoteJid, {
          text: '⚠️ Maaf, terjadi gangguan sementara. Coba kirim ulang pesanmu.',
        });
      }
    }
  });

  return sock;
}

function getSocket() {
  return sockRef;
}

module.exports = { start, getSocket };
