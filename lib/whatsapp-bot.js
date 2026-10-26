import { getRootFolderName, sanitizeFileName } from './drive-common';
import { listFolder, uploadFile } from './drive-service';
import {
  addBotLog,
  clearBotSession,
  clearPendingBotFile,
  findBotUser,
  getBotSession,
  getBotSettings,
  getPendingBotFile,
  normalizeWhatsAppNumber,
  saveBotSession,
  savePendingBotFile
} from './store';
import {
  downloadWhatsAppMedia,
  sendWhatsAppDocument,
  sendWhatsAppText,
  whatsAppConfigured
} from './whatsapp-cloud';

export const BOT_HELP_TEXT = `Panduan WhatsApp Bot Google Drive\n\n/start - Memulai bot\n/help - Menampilkan perintah\n/folder - Melihat daftar folder utama\n/isi [nomor] - Membuka isi folder, contoh /isi 1 atau /isi 1.2\n/ambil [nomor] - Mengambil file dari folder aktif\n/cari [kata kunci] - Mencari file berdasarkan nama\n/ambil hasil [nomor] - Mengambil file dari hasil pencarian\n/simpan [nomor folder] - Menyimpan file yang dikirim ke folder tujuan\n/batal - Membatalkan proses terakhir\n/status - Melihat status bot dan Drive`;

function chunkText(text, max = 3700) {
  const value = String(text || '');
  if (value.length <= max) return [value];
  const chunks = [];
  let remaining = value;
  while (remaining.length > max) {
    let cut = remaining.lastIndexOf('\n', max);
    if (cut < max * 0.55) cut = max;
    chunks.push(remaining.slice(0, cut).trim());
    remaining = remaining.slice(cut).trim();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

function nowStamp() {
  return new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14);
}

function displayNumbered(title, rows, footer = '') {
  const body = rows.length ? rows.join('\n') : '- Tidak ada data.';
  return `${title}\n\n${body}${footer ? `\n\n${footer}` : ''}`;
}

function fileSizeMb(item = {}) {
  return Number(item.size || 0) / 1024 / 1024;
}

function cleanCommand(text = '') {
  return String(text || '').trim().replace(/\s+/g, ' ');
}

function roleCanAccessAll(role = '') {
  return ['super admin', 'superadmin', 'admin'].includes(String(role).trim().toLowerCase());
}

function canAccessFolder(user, folderId = '', parentFolderId = '') {
  if (!user) return false;
  if (roleCanAccessAll(user.role)) return true;
  if (!Array.isArray(user.folderIds) || user.folderIds.length === 0) return true;
  if (!folderId) return true;
  return user.folderIds.includes(folderId) || (parentFolderId && user.folderIds.includes(parentFolderId));
}

function filterItemsForUser(items, user, currentFolderId = '') {
  if (!Array.isArray(items)) return [];
  if (!user) return [];
  if (roleCanAccessAll(user.role) || !Array.isArray(user.folderIds) || user.folderIds.length === 0 || currentFolderId) return items;
  return items.filter((item) => item.type !== 'folder' || user.folderIds.includes(item.id));
}

async function getVisibleItems(user, folderId = '', pageSize = 20, currentFolderId = '') {
  if (!canAccessFolder(user, folderId, currentFolderId)) {
    const error = new Error('Anda tidak memiliki akses ke folder atau file ini.');
    error.status = 403;
    throw error;
  }
  const data = await listFolder({ folderId, pageSize, type: 'all' });
  const items = filterItemsForUser(data.items || [], user, folderId || currentFolderId);
  const folders = items.filter((item) => item.type === 'folder');
  const files = items.filter((item) => item.type !== 'folder');
  return { items, folders, files, folderId: data.folderId || folderId || '', nextPageToken: data.nextPageToken || '' };
}

function sessionBase(session = {}) {
  return {
    currentFolderId: session.currentFolderId || '',
    currentFolderName: session.currentFolderName || getRootFolderName(),
    currentParentFolderId: session.currentParentFolderId || '',
    folders: Array.isArray(session.folders) ? session.folders : [],
    files: Array.isArray(session.files) ? session.files : [],
    searchResults: Array.isArray(session.searchResults) ? session.searchResults : []
  };
}

function formatFolderReply(title, folders, files, nextHint = '') {
  const folderRows = folders.slice(0, 50).map((item, index) => `${index + 1}. 📁 ${item.name}`);
  const fileRows = files.slice(0, 50).map((item, index) => `${index + 1}. 📄 ${item.name}`);
  const parts = [title];
  parts.push('\nFolder:');
  parts.push(folderRows.length ? folderRows.join('\n') : '- Tidak ada folder.');
  parts.push('\nFile:');
  parts.push(fileRows.length ? fileRows.join('\n') : '- Tidak ada file.');
  parts.push(nextHint || 'Ketik /isi nomor folder untuk membuka subfolder. Ketik /ambil nomor file untuk mengambil file.');
  return parts.join('\n');
}

async function sendReplies(to, replies, options = {}) {
  const output = Array.isArray(replies) ? replies.filter(Boolean) : [replies].filter(Boolean);
  if (options.send === false || !to) return output;
  for (const reply of output) {
    for (const chunk of chunkText(reply)) {
      await sendWhatsAppText(to, chunk);
    }
  }
  return output;
}

async function requireActiveUser(from, settings) {
  const phone = normalizeWhatsAppNumber(from);
  const user = await findBotUser(phone);
  if (!settings.enabled) {
    await addBotLog({ phone, activity: 'bot_disabled', status: 'rejected', message: 'Bot nonaktif.' });
    return { phone, user: null, denied: 'Bot WhatsApp sedang nonaktif. Silakan hubungi admin.' };
  }
  if (!user) {
    await addBotLog({ phone, activity: 'unauthorized', status: 'rejected', message: 'Nomor belum terdaftar.' });
    return { phone, user: null, denied: 'Maaf, nomor Anda belum terdaftar untuk mengakses bot ini. Silakan hubungi admin.' };
  }
  if (String(user.role || '').trim().toLowerCase() === 'guest') {
    await addBotLog({ phone, activity: 'guest_rejected', status: 'rejected', message: 'Role Guest tidak memiliki akses.' });
    return { phone, user: null, denied: 'Anda belum memiliki akses ke folder atau file ini. Silakan hubungi admin.' };
  }
  return { phone, user, denied: '' };
}

async function openFolderBySegments({ user, phone, session, segments, settings }) {
  let parentFolderId = '';
  let folderId = '';
  let folderName = getRootFolderName();
  let folders = [];
  let files = [];

  for (const rawSegment of segments) {
    const index = Number(rawSegment) - 1;
    if (!Number.isInteger(index) || index < 0) throw new Error('Nomor folder tidak valid. Contoh: /isi 1 atau /isi 1.2');
    const data = await getVisibleItems(user, folderId, settings.pageSize, parentFolderId);
    folders = data.folders;
    const selected = folders[index];
    if (!selected || selected.type !== 'folder') throw new Error('Folder tidak ditemukan. Silakan cek kembali nomor folder.');
    parentFolderId = folderId;
    folderId = selected.id;
    folderName = selected.name;
  }

  const data = await getVisibleItems(user, folderId, settings.pageSize, parentFolderId);
  folders = data.folders;
  files = data.files;
  await saveBotSession(phone, {
    ...sessionBase(session),
    currentFolderId: folderId,
    currentFolderName: folderName,
    currentParentFolderId: parentFolderId,
    folders,
    files
  });
  return formatFolderReply(`Isi Folder: ${folderName}`, folders, files, 'Ketik /ambil nomor untuk mengambil file. Ketik /isi nomor untuk membuka subfolder.');
}

async function handleFolderCommand({ phone, user, settings }) {
  const data = await getVisibleItems(user, '', settings.pageSize, '');
  await saveBotSession(phone, {
    currentFolderId: '',
    currentFolderName: getRootFolderName(),
    currentParentFolderId: '',
    folders: data.folders,
    files: data.files,
    searchResults: []
  });
  await addBotLog({ phone, activity: 'folder_list', target: getRootFolderName(), status: 'success' });
  return displayNumbered(
    'Daftar Folder Google Drive:',
    data.folders.map((item, index) => `${index + 1}. ${item.name}`),
    'Ketik /isi 1 untuk melihat isi folder nomor 1.'
  );
}

async function handleIsiCommand({ phone, user, settings, session, arg }) {
  const value = String(arg || '').trim();
  if (!value) {
    const current = sessionBase(session);
    const data = await getVisibleItems(user, current.currentFolderId, settings.pageSize, current.currentParentFolderId);
    await saveBotSession(phone, { ...current, folders: data.folders, files: data.files });
    return formatFolderReply(`Isi Folder: ${current.currentFolderName || getRootFolderName()}`, data.folders, data.files);
  }

  const segments = value.split('.').map((item) => item.trim()).filter(Boolean);
  let reply;
  if (segments.length === 1) {
    const current = sessionBase(session);
    const index = Number(segments[0]) - 1;
    const sourceFolders = current.folders.length ? current.folders : (await getVisibleItems(user, current.currentFolderId, settings.pageSize, current.currentParentFolderId)).folders;
    const selected = sourceFolders[index];
    if (!selected) throw new Error('Folder tidak ditemukan. Silakan cek kembali nomor folder.');
    const data = await getVisibleItems(user, selected.id, settings.pageSize, current.currentFolderId);
    await saveBotSession(phone, {
      ...current,
      currentFolderId: selected.id,
      currentFolderName: selected.name,
      currentParentFolderId: current.currentFolderId || '',
      folders: data.folders,
      files: data.files
    });
    reply = formatFolderReply(`Isi Folder: ${selected.name}`, data.folders, data.files, 'Ketik /ambil nomor untuk mengambil file. Ketik /isi nomor untuk membuka subfolder.');
  } else {
    reply = await openFolderBySegments({ user, phone, session, segments, settings });
  }

  await addBotLog({ phone, activity: 'folder_open', target: value, status: 'success' });
  return reply;
}

async function collectSearchResults(user, keyword, settings) {
  const target = keyword.toLowerCase();
  const queue = [{ folderId: '', folderName: getRootFolderName(), parentFolderId: '', depth: 0 }];
  const results = [];
  const visited = new Set();
  const maxFolders = 40;
  const maxDepth = 4;

  while (queue.length && visited.size < maxFolders && results.length < 20) {
    const current = queue.shift();
    if (visited.has(current.folderId || 'root')) continue;
    visited.add(current.folderId || 'root');

    let data;
    try {
      data = await getVisibleItems(user, current.folderId, Math.max(settings.pageSize, 30), current.parentFolderId);
    } catch {
      continue;
    }

    data.files.forEach((file) => {
      if (file.name.toLowerCase().includes(target)) {
        results.push({ ...file, folderName: current.folderName, folderId: current.folderId });
      }
    });

    if (current.depth < maxDepth) {
      data.folders.forEach((folder) => queue.push({ folderId: folder.id, folderName: folder.name, parentFolderId: current.folderId, depth: current.depth + 1 }));
    }
  }
  return results;
}

async function handleSearchCommand({ phone, user, settings, session, arg }) {
  const keyword = String(arg || '').trim();
  if (!keyword) throw new Error('Kata kunci pencarian belum diisi. Contoh: /cari tender');
  const results = await collectSearchResults(user, keyword, settings);
  await saveBotSession(phone, { ...sessionBase(session), searchResults: results });
  await addBotLog({ phone, activity: 'file_search', target: keyword, status: 'success', message: `${results.length} hasil` });
  return displayNumbered(
    `Hasil pencarian untuk: ${keyword}`,
    results.map((item, index) => `${index + 1}. ${item.name}\n   Folder: ${item.folderName || '-'}`),
    results.length ? 'Ketik /ambil hasil 1 untuk mengambil file pertama.' : 'Coba kata kunci lain atau buka folder dengan /folder.'
  );
}

async function handleAmbilCommand({ phone, settings, session, arg, send }) {
  const value = String(arg || '').trim();
  let source = sessionBase(session).files;
  let indexText = value;

  if (value.toLowerCase().startsWith('hasil ')) {
    source = sessionBase(session).searchResults;
    indexText = value.slice(6).trim();
  }

  const index = Number(indexText) - 1;
  if (!Number.isInteger(index) || index < 0) throw new Error('Nomor file tidak valid. Contoh: /ambil 1 atau /ambil hasil 1');
  const file = source[index];
  if (!file || file.type === 'folder') throw new Error('File tidak ditemukan. Silakan pilih file dari daftar yang tersedia.');

  const sizeTooLarge = fileSizeMb(file) > Number(settings.maxDirectSendMb || 20);
  const fileLink = file.webContentLink || file.webViewLink;
  const viewLink = file.webViewLink || fileLink;
  await addBotLog({ phone, activity: 'file_send_request', target: file.name, status: 'success' });

  if (sizeTooLarge) {
    return `File terlalu besar untuk dikirim langsung. Bot mengirim link Google Drive sebagai alternatif.\n\n${file.name}\n${viewLink}`;
  }

  if (send !== false && whatsAppConfigured() && fileLink) {
    try {
      await sendWhatsAppDocument(phone, { link: fileLink, filename: file.name, caption: `File ditemukan: ${file.name}` });
      return `File ditemukan:\n${file.name}\n\nFile sedang dikirim ke WhatsApp.`;
    } catch (error) {
      await addBotLog({ phone, activity: 'file_send_error', target: file.name, status: 'failed', message: error.message });
      return `File ditemukan, tetapi pengiriman langsung gagal. Gunakan link Google Drive berikut:\n\n${file.name}\n${viewLink}\n\nDetail: ${error.message}`;
    }
  }

  return `File ditemukan:\n${file.name}\n\nLink Google Drive:\n${viewLink || fileLink || 'Link tidak tersedia.'}`;
}

function uploadChoicesFromSession(session, settings) {
  const current = sessionBase(session);
  const folders = current.folders || [];
  if (folders.length) return folders;
  return settings.defaultUploadFolderId ? [{ id: settings.defaultUploadFolderId, name: settings.defaultUploadFolderName || 'Folder default upload' }] : [];
}

async function resolveSaveFolderChoice({ user, session, settings, arg }) {
  const value = String(arg || '').trim();
  if (!value) {
    return settings.defaultUploadFolderId ? { id: settings.defaultUploadFolderId, name: settings.defaultUploadFolderName || 'Folder default upload' } : null;
  }

  const segments = value.split('.').map((item) => item.trim()).filter(Boolean);
  let choices = uploadChoicesFromSession(session, settings);
  let selectedFolder = null;
  let parentFolderId = sessionBase(session).currentFolderId || '';

  for (const segment of segments) {
    const index = Number(segment) - 1;
    if (!Number.isInteger(index) || index < 0) throw new Error('Nomor folder tujuan tidak valid. Contoh: /simpan 1 atau /simpan 1.2');
    selectedFolder = choices[index] || null;
    if (!selectedFolder) throw new Error('Folder tujuan tidak ditemukan. Silakan cek kembali nomor folder.');
    if (!canAccessFolder(user, selectedFolder.id, parentFolderId)) throw new Error('Anda tidak memiliki akses ke folder tujuan tersebut.');

    if (segment !== segments[segments.length - 1]) {
      const data = await getVisibleItems(user, selectedFolder.id, settings.pageSize, parentFolderId);
      choices = data.folders;
      parentFolderId = selectedFolder.id;
    }
  }

  return selectedFolder;
}

async function handleIncomingMedia({ phone, user, media, settings, session }) {
  const choices = uploadChoicesFromSession(session, settings);
  await savePendingBotFile(phone, media);
  await addBotLog({ phone, activity: 'file_received', target: media.fileName, status: 'waiting_folder' });
  const rows = choices.map((folder, index) => `${index + 1}. ${folder.name}`);
  const footer = choices.length
    ? 'Ketik /simpan 1 untuk menyimpan ke folder nomor 1. Buka folder lain dengan /folder lalu /isi sebelum memilih folder tujuan.'
    : 'Belum ada folder tujuan. Admin perlu mengatur folder default atau pengguna membuka daftar folder dengan /folder.';
  return displayNumbered('File diterima.\n\nPilih folder tujuan penyimpanan:', rows, footer);
}

async function handleSimpanCommand({ phone, user, settings, session, arg }) {
  const pending = await getPendingBotFile(phone);
  if (!pending) throw new Error('Tidak ada file yang menunggu penyimpanan. Kirim file/foto/dokumen ke bot terlebih dahulu.');

  const selectedFolder = await resolveSaveFolderChoice({ user, session, settings, arg });
  if (!selectedFolder) throw new Error('Folder tujuan belum dipilih. Ketik /folder lalu /isi untuk membuka folder tujuan, kemudian kirim /simpan nomor.');

  let downloaded;
  try {
    downloaded = await downloadWhatsAppMedia(pending.mediaId);
  } catch (error) {
    await addBotLog({ phone, activity: 'file_upload_download_failed', target: pending.fileName, status: 'failed', message: error.message });
    throw new Error(`File gagal diambil dari WhatsApp. Pastikan WHATSAPP_ACCESS_TOKEN benar. Detail: ${error.message}`);
  }

  const extension = pending.extension || '';
  const name = sanitizeFileName(pending.fileName || `WA-${nowStamp()}${extension}`);
  const uploaded = await uploadFile({
    folderId: selectedFolder.id,
    name,
    mimeType: pending.mimeType || downloaded.mimeType || 'application/octet-stream',
    buffer: downloaded.buffer,
    conflict: 'rename'
  });
  await clearPendingBotFile(phone);
  await addBotLog({ phone, activity: 'file_uploaded', target: uploaded.name || name, status: 'success', message: selectedFolder.name });
  return `File berhasil disimpan ke:\n${selectedFolder.name}\n\nNama file:\n${uploaded.name || name}`;
}

async function handleStatusCommand({ settings }) {
  let driveStatus = 'Terhubung';
  try {
    await listFolder({ folderId: '', pageSize: 1 });
  } catch (error) {
    driveStatus = `Bermasalah: ${error.message}`;
  }
  return `Status Bot\n\nWhatsApp Bot: ${settings.enabled ? 'Aktif' : 'Nonaktif'}\nWhatsApp API: ${whatsAppConfigured() ? 'Terkonfigurasi' : 'Belum lengkap'}\nGoogle Drive: ${driveStatus}\nFolder default upload: ${settings.defaultUploadFolderName || settings.defaultUploadFolderId || '-'}`;
}

function mediaFromMessage(message = {}) {
  const type = message.type || '';
  const media = message[type];
  if (!media || !media.id) return null;
  const mimeType = media.mime_type || 'application/octet-stream';
  const extMap = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'video/mp4': '.mp4',
    'application/pdf': '.pdf'
  };
  const fileName = media.filename || `WA-${type}-${nowStamp()}${extMap[mimeType] || ''}`;
  return {
    type,
    mediaId: media.id,
    mimeType,
    sha256: media.sha256 || '',
    caption: media.caption || '',
    fileName,
    extension: extMap[mimeType] || ''
  };
}

export async function handleIncomingWhatsAppMessage({ from, text = '', media = null, message = null }, options = {}) {
  const settings = await getBotSettings();
  const { phone, user, denied } = await requireActiveUser(from, settings);
  if (denied) return sendReplies(phone, denied, options);

  const session = await getBotSession(phone);

  try {
    const resolvedMedia = media || mediaFromMessage(message || {});
    if (resolvedMedia) {
      const reply = await handleIncomingMedia({ phone, user, media: resolvedMedia, settings, session });
      return sendReplies(phone, reply, options);
    }

    const body = cleanCommand(text || message?.text?.body || '');
    const lower = body.toLowerCase();
    let reply;

    if (!body || lower === '/start') {
      reply = `Halo ${user.name || ''}.\n\nBot WhatsApp untuk Manajemen File Google Drive siap digunakan.\n\nKetik /folder untuk melihat daftar folder atau /help untuk panduan.`;
      await addBotLog({ phone, activity: 'start', status: 'success' });
    } else if (lower === '/help') {
      reply = BOT_HELP_TEXT;
      await addBotLog({ phone, activity: 'help', status: 'success' });
    } else if (lower === '/folder') {
      reply = await handleFolderCommand({ phone, user, settings });
    } else if (lower.startsWith('/isi')) {
      reply = await handleIsiCommand({ phone, user, settings, session, arg: body.slice(4).trim() });
    } else if (lower.startsWith('/cari')) {
      reply = await handleSearchCommand({ phone, user, settings, session, arg: body.slice(5).trim() });
    } else if (lower.startsWith('/ambil')) {
      reply = await handleAmbilCommand({ phone, settings, session, arg: body.slice(7).trim(), send: options.send });
    } else if (lower.startsWith('/simpan')) {
      reply = await handleSimpanCommand({ phone, user, settings, session, arg: body.slice(8).trim() });
    } else if (lower === '/batal') {
      await clearPendingBotFile(phone);
      await clearBotSession(phone);
      await addBotLog({ phone, activity: 'cancel', status: 'success' });
      reply = 'Proses terakhir dibatalkan. Ketik /folder untuk memulai kembali.';
    } else if (lower === '/status') {
      reply = await handleStatusCommand({ settings });
      await addBotLog({ phone, activity: 'status', status: 'success' });
    } else {
      await addBotLog({ phone, activity: 'unknown_command', target: body, status: 'failed' });
      reply = 'Perintah tidak dikenali. Ketik /help untuk melihat daftar perintah.';
    }

    return sendReplies(phone, reply, options);
  } catch (error) {
    await addBotLog({ phone, activity: 'bot_error', target: text, status: 'failed', message: error.message });
    return sendReplies(phone, error.message || 'Terjadi error. Silakan coba lagi atau hubungi admin.', options);
  }
}

export async function handleWhatsAppWebhookPayload(payload = {}) {
  const replies = [];
  const entries = Array.isArray(payload.entry) ? payload.entry : [];
  for (const entry of entries) {
    const changes = Array.isArray(entry.changes) ? entry.changes : [];
    for (const change of changes) {
      const value = change.value || {};
      const messages = Array.isArray(value.messages) ? value.messages : [];
      for (const message of messages) {
        const result = await handleIncomingWhatsAppMessage({
          from: message.from,
          text: message.text?.body || '',
          message
        }, { send: true, source: 'webhook' });
        replies.push(...result);
      }
    }
  }
  return replies;
}

export async function simulateBotCommand({ from, text, media }) {
  return handleIncomingWhatsAppMessage({ from, text, media }, { send: false, source: 'simulator' });
}
