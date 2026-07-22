'use strict';

const crypto = require('crypto');
const { env } = require('../config/env');

function base64url(input) {
  return Buffer.from(input).toString('base64url');
}

function sign(payloadObj) {
  const payload = base64url(JSON.stringify(payloadObj));
  const sig = crypto.createHmac('sha256', env.DASHBOARD_SECRET).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

/**
 * Membuat token akses dashboard pribadi (F-6.1): berisi nomor pemilik,
 * flag super-admin, dan masa berlaku (default DASHBOARD_LINK_DAYS).
 */
function createDashboardToken(owner, { superAdmin = false, days = env.DASHBOARD_LINK_DAYS } = {}) {
  const now = Date.now();
  const payload = {
    sub: owner,
    admin: superAdmin,
    iat: now,
    exp: now + days * 24 * 60 * 60 * 1000,
  };
  return sign(payload);
}

function verifyDashboardToken(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) {
    return { valid: false, reason: 'FORMAT_INVALID' };
  }
  const [payload, sig] = token.split('.');
  const expectedSig = crypto.createHmac('sha256', env.DASHBOARD_SECRET).update(payload).digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return { valid: false, reason: 'SIGNATURE_INVALID' };
  }
  let data;
  try {
    data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    return { valid: false, reason: 'PAYLOAD_INVALID' };
  }
  if (Date.now() > data.exp) return { valid: false, reason: 'EXPIRED' };
  return { valid: true, owner: data.sub, superAdmin: Boolean(data.admin), expiresAt: data.exp };
}

/** Membentuk tautan pendek /d/<token> siap dikirim via WhatsApp (F-1.2, F-6.1). */
function buildShortLink(token) {
  return `${env.DASHBOARD_BASE_URL.replace(/\/$/, '')}/d/${token}`;
}

module.exports = { createDashboardToken, verifyDashboardToken, buildShortLink };
