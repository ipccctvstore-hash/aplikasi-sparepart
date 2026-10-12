import { NextResponse } from 'next/server';
import { syncAll } from '@/lib/sync';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/** Dipanggil Vercel Cron tiap hari (vercel.json). Dilindungi Bearer CRON_SECRET. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) return NextResponse.json({ error: 'Tidak diizinkan.' }, { status: 401 });
  const results = await syncAll('otomatis');
  return NextResponse.json({ ok: true, results });
}
