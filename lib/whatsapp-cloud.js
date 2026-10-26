function getApiVersion() {
  return process.env.WHATSAPP_API_VERSION || 'v20.0';
}

function getPhoneNumberId() {
  return process.env.WHATSAPP_PHONE_NUMBER_ID || '';
}

function getToken() {
  return process.env.WHATSAPP_ACCESS_TOKEN || process.env.WHATSAPP_TOKEN || '';
}

export function whatsAppConfigured() {
  return Boolean(getToken() && getPhoneNumberId());
}

export function whatsAppConfigStatus() {
  return {
    configured: whatsAppConfigured(),
    hasAccessToken: Boolean(getToken()),
    hasPhoneNumberId: Boolean(getPhoneNumberId()),
    hasVerifyToken: Boolean(process.env.WHATSAPP_VERIFY_TOKEN || process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN),
    apiVersion: getApiVersion()
  };
}

function apiUrl(path) {
  return `https://graph.facebook.com/${getApiVersion()}${path}`;
}

async function whatsappFetch(path, options = {}) {
  const token = getToken();
  if (!token) throw new Error('WHATSAPP_ACCESS_TOKEN belum diisi di environment variable server.');

  const response = await fetch(apiUrl(path), {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    },
    cache: 'no-store'
  });

  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }

  if (!response.ok) {
    const message = data?.error?.message || data?.message || data?.raw || `WhatsApp API HTTP ${response.status}`;
    throw new Error(message);
  }
  return data;
}

export async function sendWhatsAppText(to, text) {
  const phoneNumberId = getPhoneNumberId();
  if (!phoneNumberId) throw new Error('WHATSAPP_PHONE_NUMBER_ID belum diisi di environment variable server.');

  return whatsappFetch(`/${phoneNumberId}/messages`, {
    method: 'POST',
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'text',
      text: {
        preview_url: true,
        body: String(text || '').slice(0, 3900)
      }
    })
  });
}

export async function sendWhatsAppDocument(to, { link, filename, caption = '' }) {
  const phoneNumberId = getPhoneNumberId();
  if (!phoneNumberId) throw new Error('WHATSAPP_PHONE_NUMBER_ID belum diisi di environment variable server.');
  if (!link) throw new Error('Link dokumen kosong, file tidak dapat dikirim.');

  return whatsappFetch(`/${phoneNumberId}/messages`, {
    method: 'POST',
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'document',
      document: {
        link,
        filename: filename || 'file',
        caption: String(caption || '').slice(0, 1024)
      }
    })
  });
}

export async function getWhatsAppMediaInfo(mediaId) {
  if (!mediaId) throw new Error('mediaId kosong.');
  return whatsappFetch(`/${encodeURIComponent(mediaId)}`);
}

export async function downloadWhatsAppMedia(mediaId) {
  const info = await getWhatsAppMediaInfo(mediaId);
  const mediaUrl = info?.url;
  if (!mediaUrl) throw new Error('URL media WhatsApp tidak ditemukan.');

  const token = getToken();
  const response = await fetch(mediaUrl, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store'
  });
  if (!response.ok) throw new Error(`Gagal mengunduh media WhatsApp HTTP ${response.status}`);
  const arrayBuffer = await response.arrayBuffer();
  return {
    buffer: Buffer.from(arrayBuffer),
    mimeType: info.mime_type || response.headers.get('content-type') || 'application/octet-stream',
    size: Number(info.file_size || arrayBuffer.byteLength || 0),
    sha256: info.sha256 || ''
  };
}
