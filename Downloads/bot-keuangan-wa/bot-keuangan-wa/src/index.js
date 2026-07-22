'use strict';

const logger = require('./utils/logger');
const { validate } = require('./config/env');
const whatsapp = require('./whatsapp/connection');
const reminders = require('./whatsapp/reminders');
const dashboard = require('./dashboard/server');

async function main() {
  const issues = validate();
  if (issues.length) {
    logger.warn({ issues }, 'Beberapa konfigurasi belum lengkap — bot tetap dicoba jalan dengan fitur terbatas');
  }

  dashboard.start();

  const sock = await whatsapp.start();
  reminders.schedule(sock);

  logger.info('Bot Keuangan WA siap digunakan 🚀');
}

process.on('unhandledRejection', (err) => {
  logger.error({ err: err?.message || err }, 'Unhandled promise rejection');
});

main().catch((err) => {
  logger.error({ err: err.message }, 'Gagal menyalakan bot');
  process.exit(1);
});
