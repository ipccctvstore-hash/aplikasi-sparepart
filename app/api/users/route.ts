import { NextResponse } from 'next/server';
import { getProfile } from '@/lib/auth';
import { adminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

async function guard() {
  const me = await getProfile();
  if (!me || me.role !== 'super') return null;
  return me;
}
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

/** Daftar user + email (email hanya ada di Auth). */
export async function GET() {
  if (!(await guard())) return bad('Hanya superadmin.', 403);
  const a = adminClient();
  const [{ data: profiles, error }, { data: list, error: e2 }] = await Promise.all([
    a.from('profiles').select('id,name,role,active,created_at').order('name'),
    a.auth.admin.listUsers({ page: 1, perPage: 200 }),
  ]);
  if (error || e2) return bad((error || e2)!.message, 500);
  const em = new Map(list.users.map(u => [u.id, { email: u.email ?? '', must: !!u.user_metadata?.must_change_password }]));
  return NextResponse.json({ users: (profiles ?? []).map(p => ({ ...p, email: em.get(p.id)?.email ?? '', must_change_password: em.get(p.id)?.must ?? false })) });
}

/** Tambah user: password awal dari INITIAL_PASSWORD, wajib diganti saat masuk pertama. */
export async function POST(req: Request) {
  if (!(await guard())) return bad('Hanya superadmin.', 403);
  const b = await req.json().catch(() => ({}));
  const name = String(b.name ?? '').trim(), email = String(b.email ?? '').trim().toLowerCase(), role = b.role === 'super' ? 'super' : 'admin';
  if (!name || !/^\S+@\S+\.\S+$/.test(email)) return bad('Isi nama dan email yang benar.');
  const pw = process.env.INITIAL_PASSWORD;
  if (!pw || pw.length < 8) return bad('INITIAL_PASSWORD belum diisi di pengaturan server (minimal 8 karakter).', 500);
  const a = adminClient();
  if (role === 'super') {
    const { count } = await a.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'super').eq('active', true);
    if ((count ?? 0) >= 1) return bad('Hanya boleh ada 1 superadmin.');
  }
  const { data, error } = await a.auth.admin.createUser({ email, password: pw, email_confirm: true, user_metadata: { name, must_change_password: true } });
  if (error || !data.user) return bad(error?.message ?? 'Gagal membuat user.');
  if (role === 'super') await a.from('profiles').update({ role }).eq('id', data.user.id);
  return NextResponse.json({ ok: true, id: data.user.id });
}

/** Ubah nama/peran/aktif, atau reset password awal. */
export async function PATCH(req: Request) {
  const me = await guard();
  if (!me) return bad('Hanya superadmin.', 403);
  const b = await req.json().catch(() => ({}));
  const id = String(b.id ?? '');
  if (!id) return bad('User tidak jelas.');
  const a = adminClient();
  if (b.reset) {
    const pw = process.env.INITIAL_PASSWORD;
    if (!pw || pw.length < 8) return bad('INITIAL_PASSWORD belum diisi di pengaturan server.', 500);
    const { error } = await a.auth.admin.updateUserById(id, { password: pw, user_metadata: { must_change_password: true } });
    if (error) return bad(error.message);
    return NextResponse.json({ ok: true });
  }
  const patch: Record<string, unknown> = {};
  if (typeof b.name === 'string' && b.name.trim()) patch.name = b.name.trim();
  if (b.role === 'admin' || b.role === 'super') patch.role = b.role;
  if (typeof b.active === 'boolean') patch.active = b.active;
  if (id === me.id && (patch.active === false || patch.role === 'admin')) return bad('Akun superadmin sendiri tidak bisa dinonaktifkan atau diturunkan.');
  if (patch.role === 'super') {
    const { count } = await a.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'super').eq('active', true).neq('id', id);
    if ((count ?? 0) >= 1) return bad('Hanya boleh ada 1 superadmin.');
  }
  if (!Object.keys(patch).length) return bad('Tidak ada yang diubah.');
  const { error } = await a.from('profiles').update(patch).eq('id', id);
  if (error) return bad(error.message);
  return NextResponse.json({ ok: true });
}
