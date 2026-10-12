import 'server-only';
import { redirect } from 'next/navigation';
import { serverClient } from './supabase/server';

export type Profile = { id: string; name: string; role: 'admin' | 'super'; email: string };

/** Profil pengguna yang sedang login (null kalau belum login atau akun nonaktif). */
export async function getProfile(): Promise<Profile | null> {
  const sb = await serverClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return null;
  const { data } = await sb.from('profiles').select('id,name,role,active').eq('id', user.id).maybeSingle();
  if (!data || !data.active) return null;
  return { id: data.id, name: data.name, role: data.role, email: user.email ?? '' };
}
export async function requireProfile(): Promise<Profile> {
  const p = await getProfile();
  if (!p) redirect('/login?x=1');
  return p;
}
export async function requireSuper(): Promise<Profile> {
  const p = await requireProfile();
  if (p.role !== 'super') redirect('/dashboard');
  return p;
}
