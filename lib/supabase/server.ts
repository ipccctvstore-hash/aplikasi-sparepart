import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { SupabaseClient } from '@supabase/supabase-js';

/** Klien server berbasis cookie sesi pengguna (RLS tetap berlaku). */
export async function serverClient(): Promise<SupabaseClient> {
  const store = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: list => { try { list.forEach(c => store.set(c.name, c.value, c.options)); } catch { /* dipanggil dari Server Component: abaikan */ } },
    },
  });
}
