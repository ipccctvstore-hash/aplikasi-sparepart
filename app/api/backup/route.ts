import { NextResponse } from 'next/server';
import { getProfile } from '@/lib/auth';
import { buildBackupZip } from '@/lib/backup';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/** Unduh cadangan semua data (ZIP berisi CSV). Hanya superadmin. */
export async function GET() {
  const me = await getProfile();
  if (!me || me.role !== 'super') return NextResponse.json({ error: 'Hanya superadmin.' }, { status: 403 });
  try {
    const { zip, name } = await buildBackupZip();
    return new NextResponse(new Uint8Array(zip), { headers: { 'Content-Type': 'application/zip', 'Content-Disposition': `attachment; filename="${name}"`, 'Cache-Control': 'no-store' } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Gagal membuat cadangan.' }, { status: 500 });
  }
}
