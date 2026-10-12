#!/usr/bin/env node
// Impor Excel riwayat request ke database. Dijalankan di KOMPUTER KAMU; file Excel tidak dikirim ke mana pun.
//
//   npm run impor -- --file riwayat.xlsx                 uji dulu (dry-run): hanya membaca dan membuat laporan
//   npm run impor -- --file riwayat.xlsx --apply         benar-benar menyimpan
//   opsi: --sheet "Mar"   --map peta.json   --out folder-laporan
//
// peta.json (kalau judul kolom tidak dikenali otomatis): {"date":"Tgl Req","customer":"Nama Toko","sku":"No Part","qty":"Jml"}
// Aman diulang: request yang isinya sama tidak dibuat dua kali (kunci idempotensi per customer + tanggal + isi).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import ExcelJS from 'exceljs';
import { createClient } from '@supabase/supabase-js';
import { clientKey, extractRows, groupRequests, similarCustomers } from './impor-core.mjs';

const args = process.argv.slice(2);
const opt = (n, d = null) => { const i = args.indexOf('--' + n); return i >= 0 ? (args[i + 1]?.startsWith('--') || args[i + 1] === undefined ? true : args[i + 1]) : d; };
const APPLY = args.includes('--apply');
const file = opt('file');
if (!file || file === true) { console.error('Pakai: npm run impor -- --file riwayat.xlsx [--apply] [--sheet Nama] [--map peta.json] [--out folder]'); process.exit(1); }

function loadEnv() {
  for (const f of ['.env.local', '.env']) {
    if (!fs.existsSync(f)) continue;
    for (const line of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
}
const csv = (rows, head) => [head.join(','), ...rows.map(r => head.map(h => `"${String(r[h] ?? '').replace(/"/g, '""')}"`).join(','))].join('\n');
const cellVal = v => (v && typeof v === 'object' && !(v instanceof Date) ? (v.result ?? v.text ?? (v.richText ? v.richText.map(t => t.text).join('') : '')) : v);

const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(file);
const override = opt('map') && opt('map') !== true ? JSON.parse(fs.readFileSync(opt('map'), 'utf8')) : {};
const only = opt('sheet') && opt('sheet') !== true ? String(opt('sheet')).toLowerCase() : null;

const all = [], skipped = [], report = [];
for (const ws of wb.worksheets) {
  if (only && ws.name.toLowerCase() !== only) continue;
  const rows = [];
  ws.eachRow({ includeEmpty: true }, (row, n) => { rows[n - 1] = row.values.slice(1).map(cellVal); });
  const r = extractRows(rows, ws.name, override);
  if (!r.header) { report.push(`Sheet "${ws.name}": judul kolom tidak ditemukan (butuh minimal kolom part number). Dilewati.`); continue; }
  if (r.missing) { report.push(`Sheet "${ws.name}": kolom ${r.missing.join(', ')} tidak ditemukan. Pakai --map peta.json atau kirim judul kolomnya ke Claude. Dilewati.`); continue; }
  all.push(...r.rows); skipped.push(...r.skipped);
  report.push(`Sheet "${ws.name}": ${r.rows.length} baris terbaca, ${r.skipped.length} dilewati.`);
}
const groups = groupRequests(all);
const customers = [...new Map(all.map(r => [r.customer.toLowerCase(), r.customer])).values()];
const similar = similarCustomers(customers);
const outDir = opt('out') && opt('out') !== true ? opt('out') : 'laporan-impor';
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'dilewati.csv'), csv(skipped, ['where', 'reason', 'raw']));
fs.writeFileSync(path.join(outDir, 'customer-mirip.csv'), csv(similar.map(([a, b]) => ({ a, b })), ['a', 'b']));

console.log('\n=== Hasil baca Excel ===');
report.forEach(l => console.log(l));
console.log(`Total: ${all.length} baris produk -> ${groups.length} request (customer x tanggal), ${customers.length} nama customer, ${new Set(all.map(r => r.sku)).size} part number.`);
console.log(`Dilewati: ${skipped.length} baris (lihat ${path.join(outDir, 'dilewati.csv')}).`);
console.log(`Nama customer yang mirip: ${similar.length} pasang (lihat ${path.join(outDir, 'customer-mirip.csv')}). Gabungkan manual di aplikasi: menu Customer, tombol Gabungkan.`);

loadEnv();
const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.log('\nNEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY belum ada di .env.local, jadi pengecekan ke database dilewati.');
  if (APPLY) { console.error('Tidak bisa --apply tanpa kedua variabel itu.'); process.exit(1); }
  process.exit(0);
}
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const chunk = (a, n) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));
const unwrap = r => { if (r.error) throw new Error(r.error.message); return r.data; };

const skus = [...new Set(all.map(r => r.sku))];
const haveSku = new Set();
for (const c of chunk(skus, 200)) unwrap(await db.from('products').select('sku').in('sku', c)).forEach(p => haveSku.add(p.sku));
const custRows = unwrap(await db.from('customers').select('id,name'));
const custId = new Map(custRows.map(c => [c.name.toLowerCase().trim(), c.id]));
const newSkus = skus.filter(s => !haveSku.has(s)), newCust = customers.filter(c => !custId.has(c.toLowerCase()));
const keys = groups.map(clientKey);
const have = new Set();
for (const c of chunk(keys, 200)) unwrap(await db.from('requests').select('client_key').in('client_key', c)).forEach(r => have.add(r.client_key));
const todo = groups.filter((g, i) => !have.has(keys[i]));
console.log(`\nDi database: ${haveSku.size} dari ${skus.length} part number sudah ada (${newSkus.length} akan ditambah sebagai produk baru), ${newCust.length} customer baru, ${have.size} request sudah pernah diimpor, ${todo.length} request baru akan dibuat.`);
if (!APPLY) { console.log('\nINI UJI SAJA (dry-run): tidak ada yang disimpan. Kalau laporan sudah benar, jalankan lagi dengan --apply.'); process.exit(0); }

// ---- simpan ----
let owner = unwrap(await db.from('profiles').select('id').eq('name', 'Riwayat Excel').maybeSingle());
if (!owner) {
  const u = await db.auth.admin.createUser({ email: `riwayat-${crypto.randomUUID().slice(0, 8)}@tidak-dipakai.invalid`, password: crypto.randomBytes(24).toString('base64'), email_confirm: true, user_metadata: { name: 'Riwayat Excel' } });
  if (u.error) throw new Error('Gagal membuat pemilik riwayat: ' + u.error.message);
  unwrap(await db.from('profiles').update({ active: false }).eq('id', u.data.user.id));
  owner = { id: u.data.user.id };
}
const nameOf = new Map(all.filter(r => r.name).map(r => [r.sku, r.name]));
for (const c of chunk(newSkus, 200)) unwrap(await db.from('products').upsert(c.map(sku => ({ sku, name: nameOf.get(sku) ?? '' })), { onConflict: 'sku', ignoreDuplicates: true }));
for (const c of chunk(newCust, 200)) unwrap(await db.from('customers').insert(c.map(name => ({ name }))).select());
const cust2 = new Map(unwrap(await db.from('customers').select('id,name')).map(c => [c.name.toLowerCase().trim(), c.id]));

let made = 0, rowsMade = 0;
for (const c of chunk(todo, 100)) {
  const ins = unwrap(await db.from('requests').upsert(c.map(g => ({ req_date: g.date, req_time: '12:00:00', customer_id: cust2.get(g.customer.toLowerCase()), owner_id: owner.id, is_history: true, note: '', client_key: clientKey(g) })), { onConflict: 'client_key', ignoreDuplicates: true }).select('id,client_key'));
  const idOf = new Map(ins.map(r => [r.client_key, r.id]));
  const rows = [];
  for (const g of c) {
    const id = idOf.get(clientKey(g)); if (!id) continue;
    g.items.forEach((it, i) => rows.push({ request_id: id, line_no: i + 1, raw_text: it.sku, typed_sku: it.sku, sku: it.sku, qty: it.qty, note: it.note }));
  }
  for (const r of chunk(rows, 500)) unwrap(await db.from('request_rows').insert(r));
  made += ins.length; rowsMade += rows.length;
}
console.log(`\nSELESAI: ${made} request dan ${rowsMade} baris produk tersimpan. Impor ulang file yang sama tidak akan menggandakan.`);
