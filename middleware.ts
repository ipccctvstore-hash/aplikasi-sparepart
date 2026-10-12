import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

// Semua halaman butuh login, kecuali yang tercantum. /api/cron/* dijaga CRON_SECRET di route-nya sendiri.
const PUBLIC = ['/login', '/auth/confirm', '/api/cron', '/manifest.webmanifest', '/offline.html', '/sw.js'];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC.some(p => pathname === p || pathname.startsWith(p + '/'))) return NextResponse.next();

  let res = NextResponse.next({ request: req });
  const sb = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: list => {
        list.forEach(c => req.cookies.set(c.name, c.value));
        res = NextResponse.next({ request: req });
        list.forEach(c => res.cookies.set(c.name, c.value, c.options));
      },
    },
  });
  const { data: { user } } = await sb.auth.getUser();
  if (!user) {
    if (pathname.startsWith('/api/')) return NextResponse.json({ error: 'Belum login.' }, { status: 401 });
    const url = req.nextUrl.clone(); url.pathname = '/login'; url.search = '';
    return NextResponse.redirect(url);
  }
  // Akun dengan password awal wajib menggantinya dulu.
  if (user.user_metadata?.must_change_password && pathname !== '/ganti-password' && !pathname.startsWith('/api/')) {
    const url = req.nextUrl.clone(); url.pathname = '/ganti-password'; url.search = '';
    return NextResponse.redirect(url);
  }
  return res;
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|ico|css|js)$).*)'] };
