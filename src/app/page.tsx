import { getServerSession } from '@/lib/server/session';
import { AppRoot } from '@/components/app/app-root';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const session = await getServerSession();
  return <AppRoot initialSession={session} />;
}
