import { NextResponse } from 'next/server';
import { saveBackupToStorage } from '@/lib/backup';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/** Dipanggil Vercel Cron tiap hari (vercel.json). Dilindungi Bearer CRON_SECRET. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) return NextResponse.json({ error: 'Tidak diizinkan.' }, { status: 401 });
  try { return NextResponse.json({ ok: true, ...(await saveBackupToStorage()) }); }
  catch (e) { return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'Gagal.' }, { status: 500 }); }
}
