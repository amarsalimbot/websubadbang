import { requireSession } from '@/lib/session';
import { jsonResponse } from '@/lib/drive-common';
import { simulateBotCommand } from '@/lib/whatsapp-bot';

export const runtime = 'nodejs';

export async function POST(request) {
  try {
    requireSession();
    const body = await request.json();
    const replies = await simulateBotCommand({ from: body.from || body.phone || '', text: body.text || '' });
    return jsonResponse({ ok: true, replies });
  } catch (error) {
    return jsonResponse({ ok: false, message: error.message || 'Gagal menjalankan simulasi bot.' }, error.status || 500);
  }
}
