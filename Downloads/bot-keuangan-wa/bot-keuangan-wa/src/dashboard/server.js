'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const logger = require('../utils/logger');
const { env, validate } = require('../config/env');
const { verifyDashboardToken } = require('../utils/signedToken');
const api = require('./routes/api');

const PUBLIC_DIR = path.join(process.cwd(), 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, headers);
  res.end(body);
}

function sendJson(res, status, obj) {
  send(res, status, JSON.stringify(obj), { 'Content-Type': 'application/json; charset=utf-8' });
}

function serveStatic(res, filePath) {
  fs.readFile(filePath, (err, data) => {
    if (err) return sendJson(res, 404, { error: 'NOT_FOUND' });
    const ext = path.extname(filePath);
    send(res, 200, data, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
  });
}

async function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => (data += chunk));
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

function createServer() {
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host}`);

      // Tautan pribadi: /d/<token> -> redirect ke SPA dengan token di query
      if (url.pathname.startsWith('/d/')) {
        const token = url.pathname.slice(3);
        const verified = verifyDashboardToken(token);
        if (!verified.valid) {
          return send(res, 401, `<h1>Tautan tidak valid atau kedaluwarsa (${verified.reason})</h1>`, {
            'Content-Type': 'text/html; charset=utf-8',
          });
        }
        return serveStatic(res, path.join(PUBLIC_DIR, 'index.html'));
      }

      if (url.pathname.startsWith('/api/')) {
        req.body = req.method === 'POST' ? JSON.parse((await readBody(req)) || '{}') : undefined;
        return api.handle(req, res, url, { sendJson });
      }

      if (url.pathname === '/health') {
        return sendJson(res, 200, { ok: true, issues: validate() });
      }

      // Static assets
      let filePath = path.join(PUBLIC_DIR, url.pathname === '/' ? 'index.html' : url.pathname);
      if (!filePath.startsWith(PUBLIC_DIR)) return sendJson(res, 403, { error: 'FORBIDDEN' });
      if (!fs.existsSync(filePath)) filePath = path.join(PUBLIC_DIR, 'index.html');
      return serveStatic(res, filePath);
    } catch (err) {
      logger.error({ err: err.message }, 'Dashboard server error');
      return sendJson(res, 500, { error: 'INTERNAL_ERROR' });
    }
  });
}

function start() {
  const server = createServer();
  server.listen(env.PORT, () => {
    logger.info({ port: env.PORT }, 'Dashboard web berjalan');
  });
  return server;
}

module.exports = { start, createServer };
