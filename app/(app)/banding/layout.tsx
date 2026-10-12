import { requireSuper } from '@/lib/auth';

export default async function SuperOnly({ children }: { children: React.ReactNode }) {
  await requireSuper();
  return <>{children}</>;
}
