import fs from 'fs/promises';
import path from 'path';
import { cleanStoredHash, isValidPasswordHash } from './security';

const DEFAULT_KEY = process.env.SETTINGS_KEY || 'sub_administrasi_auth';

export function redisConfigured() {
  return Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
}

async function redisCommand(parts) {
  const base = process.env.UPSTASH_REDIS_REST_URL.replace(/\/$/, '');
  const response = await fetch(base, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(parts),
    cache: 'no-store'
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `Redis HTTP ${response.status}`);
  }
  return data.result;
}

async function localStorePath() {
  const directory = path.join(process.cwd(), '.data');
  await fs.mkdir(directory, { recursive: true });
  return path.join(directory, 'auth.json');
}

function readHashFromEnv() {
  if (process.env.ADMIN_PASSWORD_HASH_B64) {
    try {
      return Buffer.from(process.env.ADMIN_PASSWORD_HASH_B64, 'base64').toString('utf8').trim();
    } catch {}
  }
  return cleanStoredHash(process.env.ADMIN_PASSWORD_HASH || '');
}

function envAuthSettings() {
  return {
    username: process.env.ADMIN_USERNAME || 'admin',
    passwordHash: readHashFromEnv()
  };
}

function hasUsableAuthSettings(value) {
  return Boolean(value && value.username && isValidPasswordHash(value.passwordHash));
}

export async function getAuthSettings() {
  if (redisConfigured()) {
    const value = await redisCommand(['get', DEFAULT_KEY]);
    if (value) {
      try {
        const parsed = JSON.parse(value);
        if (hasUsableAuthSettings(parsed)) return parsed;
      } catch {
        if (hasUsableAuthSettings(value)) return value;
      }
    }
  }

  if (process.env.NODE_ENV !== 'production') {
    try {
      const raw = await fs.readFile(await localStorePath(), 'utf8');
      const parsed = JSON.parse(raw);
      if (hasUsableAuthSettings(parsed)) return parsed;
    } catch {}
  }

  return envAuthSettings();
}


const FOLDER_LOGO_KEY = process.env.FOLDER_LOGO_SETTINGS_KEY || 'sub_administrasi_folder_logos';

async function localLogoStorePath() {
  const directory = path.join(process.cwd(), '.data');
  await fs.mkdir(directory, { recursive: true });
  return path.join(directory, 'folder-logos.json');
}

function normalizeFolderLogoPayload(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const result = {};
  for (const [folderId, entry] of Object.entries(value)) {
    if (!folderId || !entry) continue;
    const folderName = String(entry.folderName || '').trim();
    const logoDataUrl = String(entry.logoDataUrl || '').trim();
    if (!logoDataUrl.startsWith('data:image/')) continue;
    result[folderId] = {
      folderName,
      logoName: String(entry.logoName || 'logo-folder.webp').trim().slice(0, 160),
      logoDataUrl,
      updatedAt: entry.updatedAt || new Date().toISOString()
    };
  }
  return result;
}

export async function getFolderLogos() {
  if (redisConfigured()) {
    const value = await redisCommand(['get', FOLDER_LOGO_KEY]);
    if (value) {
      try {
        return normalizeFolderLogoPayload(JSON.parse(value));
      } catch {}
    }
  }

  if (process.env.NODE_ENV !== 'production') {
    try {
      const raw = await fs.readFile(await localLogoStorePath(), 'utf8');
      return normalizeFolderLogoPayload(JSON.parse(raw));
    } catch {}
  }

  return {};
}

export async function saveFolderLogos(logos) {
  const normalized = normalizeFolderLogoPayload(logos);
  const payload = JSON.stringify(normalized);

  if (redisConfigured()) {
    await redisCommand(['set', FOLDER_LOGO_KEY, payload]);
    return { persisted: true, backend: 'redis' };
  }

  if (process.env.NODE_ENV !== 'production') {
    await fs.writeFile(await localLogoStorePath(), payload, 'utf8');
    return { persisted: true, backend: 'local' };
  }

  const error = new Error('Penyimpanan logo folder online belum aktif. Isi UPSTASH_REDIS_REST_URL dan UPSTASH_REDIS_REST_TOKEN di Vercel agar logo tampil di semua device.');
  error.status = 501;
  throw error;
}

export async function saveAuthSettings(settings) {
  const payload = JSON.stringify({
    username: String(settings.username || '').trim(),
    passwordHash: cleanStoredHash(settings.passwordHash)
  });

  if (redisConfigured()) {
    await redisCommand(['set', DEFAULT_KEY, payload]);
    return { persisted: true, backend: 'redis' };
  }

  if (process.env.NODE_ENV !== 'production') {
    await fs.writeFile(await localStorePath(), payload, 'utf8');
    return { persisted: true, backend: 'local' };
  }

  const error = new Error('Penyimpanan settings belum aktif. Isi UPSTASH_REDIS_REST_URL dan UPSTASH_REDIS_REST_TOKEN di Vercel.');
  error.status = 501;
  throw error;
}

const BOT_SETTINGS_KEY = process.env.BOT_SETTINGS_KEY || 'sub_administrasi_whatsapp_bot_settings';
const BOT_USERS_KEY = process.env.BOT_USERS_KEY || 'sub_administrasi_whatsapp_bot_users';
const BOT_LOGS_KEY = process.env.BOT_LOGS_KEY || 'sub_administrasi_whatsapp_bot_logs';
const BOT_STATE_KEY = process.env.BOT_STATE_KEY || 'sub_administrasi_whatsapp_bot_state';
const BOT_TEMP_KEY = process.env.BOT_TEMP_KEY || 'sub_administrasi_whatsapp_bot_temp_files';
const MAX_BOT_LOGS = Math.max(50, Number(process.env.BOT_LOG_LIMIT || 300));

async function localJsonPath(fileName) {
  const directory = path.join(process.cwd(), '.data');
  await fs.mkdir(directory, { recursive: true });
  return path.join(directory, fileName);
}

async function readJsonStore(key, localFileName, fallback) {
  if (redisConfigured()) {
    const value = await redisCommand(['get', key]);
    if (value) {
      try {
        return JSON.parse(value);
      } catch {}
    }
  }

  if (process.env.NODE_ENV !== 'production') {
    try {
      const raw = await fs.readFile(await localJsonPath(localFileName), 'utf8');
      return JSON.parse(raw);
    } catch {}
  }

  return typeof fallback === 'function' ? fallback() : fallback;
}

async function writeJsonStore(key, localFileName, value) {
  const payload = JSON.stringify(value || null);
  if (redisConfigured()) {
    await redisCommand(['set', key, payload]);
    return { persisted: true, backend: 'redis' };
  }

  if (process.env.NODE_ENV !== 'production') {
    await fs.writeFile(await localJsonPath(localFileName), payload, 'utf8');
    return { persisted: true, backend: 'local' };
  }

  const error = new Error('Penyimpanan data WhatsApp Bot belum aktif. Isi UPSTASH_REDIS_REST_URL dan UPSTASH_REDIS_REST_TOKEN di Vercel.');
  error.status = 501;
  throw error;
}

export function normalizeWhatsAppNumber(value = '') {
  let text = String(value || '').trim().replace(/^whatsapp:/i, '').replace(/[^0-9+]/g, '');
  if (text.startsWith('+')) text = text.slice(1);
  text = text.replace(/\D/g, '');
  if (text.startsWith('0')) text = `62${text.slice(1)}`;
  return text;
}

function defaultBotSettings() {
  return {
    enabled: false,
    defaultUploadFolderId: '',
    defaultUploadFolderName: '',
    maxDirectSendMb: Number(process.env.WHATSAPP_MAX_DIRECT_SEND_MB || 20),
    pageSize: Number(process.env.WHATSAPP_BOT_PAGE_SIZE || 20),
    notifyAdminNumber: normalizeWhatsAppNumber(process.env.WHATSAPP_ADMIN_NUMBER || ''),
    updatedAt: new Date().toISOString()
  };
}

function normalizeBotSettings(value = {}) {
  const defaults = defaultBotSettings();
  return {
    ...defaults,
    ...(value && typeof value === 'object' ? value : {}),
    enabled: Boolean(value?.enabled),
    maxDirectSendMb: Math.max(1, Number(value?.maxDirectSendMb || defaults.maxDirectSendMb || 20)),
    pageSize: Math.min(50, Math.max(5, Number(value?.pageSize || defaults.pageSize || 20))),
    defaultUploadFolderId: String(value?.defaultUploadFolderId || '').trim(),
    defaultUploadFolderName: String(value?.defaultUploadFolderName || '').trim(),
    notifyAdminNumber: normalizeWhatsAppNumber(value?.notifyAdminNumber || defaults.notifyAdminNumber || ''),
    updatedAt: value?.updatedAt || new Date().toISOString()
  };
}

function envBotUsers() {
  return String(process.env.WHATSAPP_ALLOWED_NUMBERS || '')
    .split(',')
    .map((item) => normalizeWhatsAppNumber(item))
    .filter(Boolean)
    .map((phone, index) => ({
      id: `env-${phone}`,
      name: `Pengguna ${index + 1}`,
      phone,
      role: 'User',
      active: true,
      folderIds: [],
      createdAt: new Date().toISOString(),
      source: 'env'
    }));
}

function normalizeBotUser(user = {}) {
  const phone = normalizeWhatsAppNumber(user.phone || user.nomor || user.number || '');
  return {
    id: String(user.id || phone || `user-${Date.now()}`).trim(),
    name: String(user.name || user.nama || 'Pengguna Bot').trim(),
    phone,
    role: String(user.role || 'User').trim() || 'User',
    active: user.active !== false,
    folderIds: Array.isArray(user.folderIds) ? user.folderIds.map((id) => String(id || '').trim()).filter(Boolean) : [],
    createdAt: user.createdAt || new Date().toISOString(),
    updatedAt: user.updatedAt || new Date().toISOString(),
    source: user.source || 'dashboard'
  };
}

function normalizeBotUsers(users) {
  const merged = [];
  const seen = new Set();
  const add = (user) => {
    const normalized = normalizeBotUser(user);
    if (!normalized.phone || seen.has(normalized.phone)) return;
    seen.add(normalized.phone);
    merged.push(normalized);
  };
  (Array.isArray(users) ? users : []).forEach(add);
  envBotUsers().forEach(add);
  return merged;
}

export async function getBotSettings() {
  return normalizeBotSettings(await readJsonStore(BOT_SETTINGS_KEY, 'whatsapp-bot-settings.json', defaultBotSettings));
}

export async function saveBotSettings(settings) {
  return writeJsonStore(BOT_SETTINGS_KEY, 'whatsapp-bot-settings.json', normalizeBotSettings({ ...settings, updatedAt: new Date().toISOString() }));
}

export async function getBotUsers() {
  return normalizeBotUsers(await readJsonStore(BOT_USERS_KEY, 'whatsapp-bot-users.json', []));
}

export async function saveBotUsers(users) {
  const dashboardUsers = normalizeBotUsers(users).filter((user) => user.source !== 'env');
  return writeJsonStore(BOT_USERS_KEY, 'whatsapp-bot-users.json', dashboardUsers);
}

export async function upsertBotUser(user) {
  const normalized = normalizeBotUser({ ...user, updatedAt: new Date().toISOString() });
  if (!normalized.phone) {
    const error = new Error('Nomor WhatsApp wajib diisi.');
    error.status = 400;
    throw error;
  }
  const users = (await getBotUsers()).filter((entry) => entry.phone !== normalized.phone || entry.source === 'env');
  users.push(normalized);
  await saveBotUsers(users);
  return normalized;
}

export async function deleteBotUser(phone) {
  const target = normalizeWhatsAppNumber(phone);
  const users = (await getBotUsers()).filter((entry) => entry.phone !== target || entry.source === 'env');
  await saveBotUsers(users);
  return { ok: true };
}

export async function findBotUser(phone) {
  const target = normalizeWhatsAppNumber(phone);
  const users = await getBotUsers();
  return users.find((user) => user.phone === target && user.active) || null;
}

export async function getBotLogs(limit = MAX_BOT_LOGS) {
  const logs = await readJsonStore(BOT_LOGS_KEY, 'whatsapp-bot-logs.json', []);
  return (Array.isArray(logs) ? logs : []).slice(0, Math.max(1, Number(limit || MAX_BOT_LOGS)));
}

export async function addBotLog(entry = {}) {
  const logs = await getBotLogs(MAX_BOT_LOGS);
  const row = {
    id: entry.id || `log-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    phone: normalizeWhatsAppNumber(entry.phone || ''),
    activity: String(entry.activity || entry.action || 'activity'),
    target: String(entry.target || entry.name || ''),
    status: entry.status || 'success',
    message: String(entry.message || ''),
    createdAt: entry.createdAt || new Date().toISOString()
  };
  const next = [row, ...logs].slice(0, MAX_BOT_LOGS);
  await writeJsonStore(BOT_LOGS_KEY, 'whatsapp-bot-logs.json', next);
  return row;
}

export async function clearBotLogs() {
  await writeJsonStore(BOT_LOGS_KEY, 'whatsapp-bot-logs.json', []);
  return { ok: true };
}

export async function getBotState() {
  const value = await readJsonStore(BOT_STATE_KEY, 'whatsapp-bot-state.json', {});
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

export async function saveBotState(state) {
  return writeJsonStore(BOT_STATE_KEY, 'whatsapp-bot-state.json', state && typeof state === 'object' ? state : {});
}

export async function getBotSession(phone) {
  const state = await getBotState();
  return state[normalizeWhatsAppNumber(phone)] || {};
}

export async function saveBotSession(phone, session) {
  const state = await getBotState();
  state[normalizeWhatsAppNumber(phone)] = { ...(session || {}), updatedAt: new Date().toISOString() };
  return saveBotState(state);
}

export async function clearBotSession(phone) {
  const state = await getBotState();
  delete state[normalizeWhatsAppNumber(phone)];
  return saveBotState(state);
}

export async function getPendingBotFiles() {
  const value = await readJsonStore(BOT_TEMP_KEY, 'whatsapp-bot-temp-files.json', {});
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

export async function savePendingBotFile(phone, file) {
  const pending = await getPendingBotFiles();
  pending[normalizeWhatsAppNumber(phone)] = { ...(file || {}), createdAt: new Date().toISOString(), expiresAt: Date.now() + 1000 * 60 * 60 * 6 };
  return writeJsonStore(BOT_TEMP_KEY, 'whatsapp-bot-temp-files.json', pending);
}

export async function getPendingBotFile(phone) {
  const pending = await getPendingBotFiles();
  const file = pending[normalizeWhatsAppNumber(phone)];
  if (!file) return null;
  if (file.expiresAt && Number(file.expiresAt) < Date.now()) {
    delete pending[normalizeWhatsAppNumber(phone)];
    await writeJsonStore(BOT_TEMP_KEY, 'whatsapp-bot-temp-files.json', pending);
    return null;
  }
  return file;
}

export async function clearPendingBotFile(phone) {
  const pending = await getPendingBotFiles();
  delete pending[normalizeWhatsAppNumber(phone)];
  return writeJsonStore(BOT_TEMP_KEY, 'whatsapp-bot-temp-files.json', pending);
}
