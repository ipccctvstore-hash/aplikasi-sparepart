import { NextResponse, type NextRequest } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';
import { serverClient } from '@/lib/supabase/server';

// Tautan di email undangan / reset password mengarah ke sini. Setelah terverifikasi, pengguna diminta membuat password.
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const token_hash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;
  const url = req.nextUrl.clone(); url.search = '';
  if (token_hash && type) {
    const sb = await serverClient();
    const { error } = await sb.auth.verifyOtp({ type, token_hash });
    if (!error) {
      url.pathname = '/ganti-password';
      return NextResponse.redirect(url);
    }
  }
  url.pathname = '/login';
  url.searchParams.set('x', 'tautan');
  return NextResponse.redirect(url);
}
