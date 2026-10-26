import { requireSession } from '@/lib/session';
import { jsonResponse } from '@/lib/drive-common';
import { listFolder } from '@/lib/drive-service';
import {
  clearBotLogs,
  deleteBotUser,
  getBotLogs,
  getBotSettings,
  getBotUsers,
  saveBotSettings,
  upsertBotUser
} from '@/lib/store';
import { whatsAppConfigStatus } from '@/lib/whatsapp-cloud';

export const runtime = 'nodejs';

async function rootFolders() {
  try {
    const data = await listFolder({ folderId: '', pageSize: 60, type: 'all' });
    return (data.items || []).filter((item) => item.type === 'folder').map((item) => ({ id: item.id, name: item.name }));
  } catch (error) {
    return [];
  }
}

export async function GET() {
  try {
    requireSession();
    const [settings, users, logs, folders] = await Promise.all([
      getBotSettings(),
      getBotUsers(),
      getBotLogs(120),
      rootFolders()
    ]);
    return jsonResponse({
      ok: true,
      settings,
      users,
      logs,
      folders,
      env: whatsAppConfigStatus(),
      writable: Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) || process.env.NODE_ENV !== 'production'
    });
  } catch (error) {
    return jsonResponse({ ok: false, message: error.message || 'Gagal membaca pengaturan bot.' }, error.status || 500);
  }
}

export async function PUT(request) {
  try {
    requireSession();
    const body = await request.json();
    if (body.action === 'clearLogs') {
      await clearBotLogs();
      return jsonResponse({ ok: true });
    }
    const result = await saveBotSettings(body.settings || body);
    const settings = await getBotSettings();
    return jsonResponse({ ok: true, settings, storage: result.backend });
  } catch (error) {
    return jsonResponse({ ok: false, message: error.message || 'Gagal menyimpan pengaturan bot.' }, error.status || 500);
  }
}

export async function POST(request) {
  try {
    requireSession();
    const body = await request.json();
    const user = await upsertBotUser(body.user || body);
    const users = await getBotUsers();
    return jsonResponse({ ok: true, user, users });
  } catch (error) {
    return jsonResponse({ ok: false, message: error.message || 'Gagal menyimpan pengguna bot.' }, error.status || 500);
  }
}

export async function DELETE(request) {
  try {
    requireSession();
    const { searchParams } = new URL(request.url);
    const phone = searchParams.get('phone') || '';
    await deleteBotUser(phone);
    const users = await getBotUsers();
    return jsonResponse({ ok: true, users });
  } catch (error) {
    return jsonResponse({ ok: false, message: error.message || 'Gagal menghapus pengguna bot.' }, error.status || 500);
  }
}
