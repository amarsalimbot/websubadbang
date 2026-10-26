import { handleWhatsAppWebhookPayload } from '@/lib/whatsapp-bot';

export const runtime = 'nodejs';

function verifyToken() {
  return process.env.WHATSAPP_VERIFY_TOKEN || process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || '';
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  if (mode === 'subscribe' && token && token === verifyToken()) {
    return new Response(challenge || '', { status: 200, headers: { 'Content-Type': 'text/plain' } });
  }
  return new Response('Forbidden', { status: 403 });
}

export async function POST(request) {
  try {
    const payload = await request.json();
    await handleWhatsAppWebhookPayload(payload);
    return Response.json({ ok: true });
  } catch (error) {
    console.error('WhatsApp webhook error:', error);
    return Response.json({ ok: true, warning: error.message || 'Webhook diproses dengan peringatan.' });
  }
}
