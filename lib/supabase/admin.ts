import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/** Klien service role: melewati RLS. HANYA untuk route API di server (sync, kelola user). Jangan diimpor dari komponen klien. */
export function adminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL atau SUPABASE_SERVICE_ROLE_KEY belum diisi.');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
