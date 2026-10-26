import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import WhatsAppBotAdmin from '@/components/WhatsAppBotAdmin';

export default function BotPage() {
  const session = getSession();
  if (!session) redirect('/login');
  return <WhatsAppBotAdmin username={session.sub} />;
}
