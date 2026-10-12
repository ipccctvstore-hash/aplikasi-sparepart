import { redirect } from 'next/navigation';
import Shell from '@/components/Shell';
import { getProfile } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const p = await getProfile();
  if (!p) redirect('/login?x=1');
  return <Shell me={p}>{children}</Shell>;
}
