#!/usr/bin/env node
// Membuat user awal dari users.json. Password awal diambil dari INITIAL_PASSWORD (.env.local), tidak pernah dicetak.
// Setiap user wajib mengganti password saat masuk pertama. Aman diulang (email yang sudah ada dilewati).
//   npm run buat-user -- --file users.json          uji dulu
//   npm run buat-user -- --file users.json --apply  simpan
// users.json: [{"name":"Owner","email":"owner@contoh.com","role":"super"},{"name":"Ali","email":"ali@contoh.com","role":"admin"}]
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const args = process.argv.slice(2);
const file = args[args.indexOf('--file') + 1];
const APPLY = args.includes('--apply');
if (!file || file.startsWith('--')) { console.error('Pakai: npm run buat-user -- --file users.json [--apply]'); process.exit(1); }
for (const f of ['.env.local', '.env']) if (fs.existsSync(f)) for (const l of fs.readFileSync(f, 'utf8').split(/\r?\n/)) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ''); }
const list = JSON.parse(fs.readFileSync(file, 'utf8'));
const errs = [];
if (list.filter(u => u.role === 'super').length > 1) errs.push('Hanya boleh ada 1 superadmin.');
list.forEach((u, i) => { if (!u.name?.trim() || !/^\S+@\S+\.\S+$/.test(u.email ?? '')) errs.push(`Baris ${i + 1}: nama atau email tidak valid.`); if (u.role && !['admin', 'super'].includes(u.role)) errs.push(`Baris ${i + 1}: role harus admin atau super.`); });
const pw = process.env.INITIAL_PASSWORD;
if (!pw || pw.length < 8) errs.push('INITIAL_PASSWORD belum diisi di .env.local (minimal 8 karakter).');
if (errs.length) { errs.forEach(e => console.error('- ' + e)); process.exit(1); }
const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY belum diisi di .env.local.'); process.exit(1); }
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const exist = new Set((await db.auth.admin.listUsers({ page: 1, perPage: 500 })).data?.users.map(u => u.email?.toLowerCase()) ?? []);
for (const u of list) {
  const email = u.email.toLowerCase();
  if (exist.has(email)) { console.log(`LEWATI  ${u.name} <${email}>: sudah ada`); continue; }
  if (!APPLY) { console.log(`AKAN DIBUAT  ${u.name} <${email}> sebagai ${u.role === 'super' ? 'Superadmin' : 'Admin'}`); continue; }
  const r = await db.auth.admin.createUser({ email, password: pw, email_confirm: true, user_metadata: { name: u.name.trim(), must_change_password: true } });
  if (r.error) { console.error(`GAGAL  ${u.name}: ${r.error.message}`); continue; }
  if (u.role === 'super') await db.from('profiles').update({ role: 'super' }).eq('id', r.data.user.id);
  console.log(`DIBUAT  ${u.name} <${email}> sebagai ${u.role === 'super' ? 'Superadmin' : 'Admin'}`);
}
if (!APPLY) console.log('\nINI UJI SAJA. Tambahkan --apply untuk membuat user.');
