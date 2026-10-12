import { NextResponse } from 'next/server';
import { getProfile } from '@/lib/auth';
import { syncInvoices, syncProducts } from '@/lib/sync';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/** Sync manual (hanya superadmin). kind 'stok' atau 'harga' membaca produk sekali untuk keduanya. */
export async function POST(req: Request) {
  const me = await getProfile();
  if (!me || me.role !== 'super') return NextResponse.json({ error: 'Hanya superadmin.' }, { status: 403 });
  const { kind } = await req.json().catch(() => ({ kind: '' }));
  if (!['stok', 'harga', 'jual'].includes(kind)) return NextResponse.json({ error: 'Jenis sync tidak dikenal.' }, { status: 400 });
  try {
    const r = kind === 'jual' ? [await syncInvoices('manual', 240_000)] : await syncProducts('manual', 240_000);
    const main = r.find(x => x.kind === kind) ?? r[0];
    return NextResponse.json({ ok: true, message: main.message, results: r });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Sync gagal.' }, { status: 500 });
  }
}
