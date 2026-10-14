#!/usr/bin/env node
// Membuat file SQL seed dari Excel. Dijalankan di KOMPUTER KAMU (atau sandbox); hasilnya file .sql yang
// ditempel/dijalankan di Supabase (SQL Editor). Tidak butuh koneksi database dan tidak membuat laporan CSV.
//
//   npm run seed-sql -- --file 2026.xlsx --katalog order_dan_cek_harga.xlsx --po-map peta-po.json
//   opsi: --out supabase/seed-data   --map peta.json   --supplier-map peta-supplier.json   --handles Ali,Nabilla,Yaw,Krisnadi,Adji
//         --po-terbuka-hari 90   --tgl-cek 2025-12-31   --chunk 900000
//
// Hasil di supabase/seed-data/ (jalankan berurutan di SQL Editor, tiap file bisa diulang dengan aman):
//   01_customer.sql   cek supplier + akun sudah ada, lalu buat customer
//   02_produk_N.sql   produk (nama, PL, diskon manual)
//   03_request_N.sql  request riwayat + baris produk + penawaran supplier (SUPLIER)
//   04_cek_harga.sql  diskon supplier lokal dari CEK EX-STOCK (tidak dihitung "ditanya")
//   05_po.sql         riwayat PO
import fs from 'node:fs';
import path from 'node:path';
import ExcelJS from 'exceljs';
import { DEFAULT_HANDLES, canonicalCustomers, clientKey, extractCatalog, extractRows, groupRequests, mergeSimilarCustomers, parseOrderan, similarCustomers, summarizeProducts } from './impor-core.mjs';
import crypto from 'node:crypto';

const args = process.argv.slice(2);
const opt = (n, d = null) => { const i = args.indexOf('--' + n); return i >= 0 ? (args[i + 1] === undefined || args[i + 1].startsWith('--') ? true : args[i + 1]) : d; };
const file = opt('file');
if (!file || file === true) { console.error('Pakai: npm run seed-sql -- --file 2026.xlsx --katalog order_dan_cek_harga.xlsx --po-map peta-po.json'); process.exit(1); }
const readJson = n => (opt(n) && opt(n) !== true ? JSON.parse(fs.readFileSync(opt(n), 'utf8')) : null);

const cellVal = v => (v && typeof v === 'object' && !(v instanceof Date) ? (v.result ?? v.text ?? (v.richText ? v.richText.map(t => t.text).join('') : '')) : v);
async function readSheets(f) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(f);
  const out = {};
  for (const ws of wb.worksheets) {
    const rows = [];
    ws.eachRow({ includeEmpty: true }, (row, n) => { rows[n - 1] = Array.from(row.values.slice(1), cellVal); });
    out[ws.name] = Array.from(rows, r => r ?? []);
  }
  return out;
}

const override = readJson('map') ?? {};
const aliases = readJson('supplier-map') ?? {};
const poMap = Object.fromEntries(Object.entries(readJson('po-map') ?? {}).map(([k, v]) => [k.trim().toUpperCase(), v]));
const poOpenDays = Number(opt('po-terbuka-hari', 90)) || 90;
const checkDate = opt('tgl-cek') && opt('tgl-cek') !== true ? String(opt('tgl-cek')) : '2025-12-31';
const handles = opt('handles') && opt('handles') !== true ? String(opt('handles')).split(',').map(s => s.trim()).filter(Boolean) : DEFAULT_HANDLES;
const outDir = opt('out') && opt('out') !== true ? opt('out') : 'supabase/seed-data';
const maxChunk = Number(opt('chunk', 900000)) || 900000;
const fallbackHandle = handles.find(h => h.toLowerCase() === 'yaw') ?? handles[0];
const priceCustomer = 'Cek harga ex-stock (impor Excel)';

// ---------- baca Excel ----------
const sheets = await readSheets(file);
const all = [], skipped = [], dateFixes = [], supUnknown = [], discBad = [];
for (const [name, rows] of Object.entries(sheets)) {
  const r = extractRows(rows, name, override, new Date(), { handles, aliases });
  if (!r.header || r.missing) { console.log(`Sheet "${name}" dilewati (judul kolom tidak lengkap${r.missing ? ': ' + r.missing.join(', ') : ''}).`); continue; }
  all.push(...r.rows); skipped.push(...r.skipped); dateFixes.push(...r.dateFixes); supUnknown.push(...r.supplierUnknown); discBad.push(...r.discBad);
}
let catalog = new Map(), orderan = { pos: [], odd: [], fuzzy: [] };
const katalogFile = opt('katalog');
if (katalogFile && katalogFile !== true) {
  const ks = await readSheets(katalogFile);
  catalog = extractCatalog(ks, aliases);
  catalog.unknown.forEach(u => supUnknown.push(u));
  const oname = Object.keys(ks).find(k => k.trim().toLowerCase() === 'orderan');
  if (oname) orderan = parseOrderan(ks[oname]);
}
const canon = canonicalCustomers(all);
all.forEach(r => { r.customer = canon.get(r.customer.toLowerCase()); });
const custCount = new Map();
all.forEach(r => custCount.set(r.customer, (custCount.get(r.customer) ?? 0) + 1));
const nameBefore = custCount.size;
const merged = mergeSimilarCustomers(custCount);       // typo kecil / "Pak Budi" = "Budi" digabung
all.forEach(r => { r.customer = merged.map.get(r.customer) ?? r.customer; });
const groups = groupRequests(all);
const customers = [...new Set(all.map(r => r.customer))].sort((a, b) => a.localeCompare(b));
const products = summarizeProducts(all, catalog);
const priceItems = [...catalog.entries()].filter(([, c]) => c.offers.length).map(([sku, c]) => ({ sku, offers: c.offers })).sort((a, b) => a.sku.localeCompare(b.sku));
const priceKey = (() => { const h = crypto.createHash('sha1').update(`impor-cek|${checkDate}|${priceItems.map(i => i.sku + ':' + i.offers.map(o => o.supplier + '=' + o.quote).join('+')).join(',')}`).digest('hex'); return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`; })();
const cutoff = new Date(Date.now() - poOpenDays * 864e5).toISOString().slice(0, 10);
const poPlan = orderan.pos.map(po => ({
  ...po, supplier: poMap[po.contact] ?? null,
  title: `PO asli ${po.number || '(tanpa nomor)'} - ${po.contact || '?'}${po.amount ? ' - ' + po.amount.toLocaleString('id-ID') : ''} (impor Excel)`,
  closed: !!po.date && po.date < cutoff,
}));
const unmappedPo = poPlan.filter(p => !p.supplier);
if (unmappedPo.length) { console.error(`PO belum dipetakan ke supplier (isi peta-po.json): ${[...new Set(unmappedPo.map(p => p.contact))].join(', ')}`); process.exit(1); }

const usedSuppliers = [...new Set([
  ...groups.flatMap(g => g.items.flatMap(i => i.offers.map(o => o.supplier))),
  ...priceItems.flatMap(i => i.offers.map(o => o.supplier)),
  ...poPlan.map(p => p.supplier),
])].sort();

// ---------- tulis SQL ----------
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });
const written = [];
const lit = obj => {
  const s = JSON.stringify(obj);
  if (s.includes('$seed$')) throw new Error('Data mengandung $seed$, ganti penanda dollar-quote.');
  return `$seed$${s}$seed$`;
};
const sqlStr = s => `'${String(s).replace(/'/g, "''")}'`;
const put = (name, body) => { fs.writeFileSync(path.join(outDir, name), body); written.push([name, Buffer.byteLength(body)]); };
const chunks = (items, size) => {            // potong berdasarkan ukuran JSON
  const out = []; let cur = [], len = 0;
  for (const it of items) { const l = JSON.stringify(it).length + 1; if (cur.length && len + l > size) { out.push(cur); cur = []; len = 0; } cur.push(it); len += l; }
  if (cur.length) out.push(cur);
  return out;
};
const head = (n, what) => `-- Seed ${n}: ${what}\n-- Dibuat otomatis dari Excel oleh scripts/buat-seed-sql.mjs. Aman dijalankan ulang.\n\n`;

// 01 customer
put('01_customer.sql', head('01', 'pemeriksaan awal + customer') + `do $$
declare miss text;
begin
  select string_agg(n, ', ') into miss from unnest(array[${usedSuppliers.map(sqlStr).join(', ')}]::text[]) n
   where not exists (select 1 from suppliers s where lower(btrim(s.name)) = lower(n));
  if miss is not null then raise exception 'Supplier belum ada: %. Jalankan supabase/seed_supplier_asli.sql dulu.', miss; end if;
  select string_agg(n, ', ') into miss from unnest(array[${handles.map(sqlStr).join(', ')}]::text[]) n
   where not exists (select 1 from profiles p where lower(p.name) = lower(n));
  if miss is not null then raise exception 'Akun belum ada: %. Buat akun dulu (npm run buat-user).', miss; end if;
end $$;

insert into customers (name, note)
select x.name, x.note from jsonb_to_recordset(${lit([...customers.map(name => ({ name, note: '' })), ...(priceItems.length ? [{ name: priceCustomer, note: 'Dibuat impor Excel untuk menyimpan diskon supplier lama. Bukan customer sungguhan.' }] : [])])}::jsonb) as x(name text, note text)
on conflict do nothing;

select count(*) as customer_total from customers;
`);

// 02 produk
const prodRows = [...products.values()].sort((a, b) => a.sku.localeCompare(b.sku)).map(p => ({ s: p.sku, n: p.name || '', pl: p.pl, t: p.tempo, c: p.cash }));
chunks(prodRows, maxChunk).forEach((c, i, arr) => put(`02_produk_${i + 1}.sql`, head('02', `produk ${i + 1}/${arr.length}`) + `insert into products (sku, name, local_pl, local_tempo, local_cash)
select x.s, coalesce(x.n, ''), x.pl, x.t, x.c
from jsonb_to_recordset(${lit(c)}::jsonb) as x(s text, n text, pl numeric, t numeric, c numeric)
on conflict (sku) do update set
  name = case when products.name = '' then excluded.name else products.name end,
  local_pl = coalesce(products.local_pl, excluded.local_pl),
  local_tempo = coalesce(products.local_tempo, excluded.local_tempo),
  local_cash = coalesce(products.local_cash, excluded.local_cash);

select count(*) as produk_total from products;
`));

// 03 / 04 request
const requestSql = (list, label) => `with src as (
  select * from jsonb_to_recordset(${lit(list)}::jsonb) as x(k uuid, d date, c text, h text, pc boolean, nt text, items jsonb)
), ins as (
  insert into requests (req_date, req_time, customer_id, owner_id, is_history, price_check, note, client_key)
  select s.d, '12:00', (select id from customers where lower(btrim(name)) = lower(btrim(s.c))),
         coalesce((select id from profiles where lower(name) = lower(s.h)), (select id from profiles where lower(name) = ${sqlStr(fallbackHandle.toLowerCase())})),
         true, s.pc, coalesce(s.nt, ''), s.k
  from src s
  on conflict (client_key) do nothing
  returning id, client_key
), rws as (
  insert into request_rows (request_id, line_no, raw_text, typed_sku, sku, qty, note)
  select i.id, (e.v->>'n')::int, coalesce(e.v->>'r', e.v->>'s'), e.v->>'s', e.v->>'s', (e.v->>'q')::int, coalesce(e.v->>'t', '')
  from ins i join src s on s.k = i.client_key
  cross join lateral jsonb_array_elements(s.items) e(v)
  returning id, request_id, line_no
)
insert into offers (row_id, supplier_id, quote, ready)
select r.id, su.id, nullif(o.v->>1, '')::numeric, true
from rws r
join ins i on i.id = r.request_id
join src s on s.k = i.client_key
cross join lateral jsonb_array_elements(s.items) e(v)
cross join lateral jsonb_array_elements(coalesce(e.v->'o', '[]'::jsonb)) o(v)
join suppliers su on lower(btrim(su.name)) = lower(o.v->>0)
where (e.v->>'n')::int = r.line_no;

select count(*) as request_riwayat, (select count(*) from request_rows) as baris, (select count(*) from offers) as penawaran from requests where is_history;
`;
const reqObjs = groups.map(g => ({
  k: clientKey(g), d: g.date, c: g.customer, h: g.handle, pc: false, nt: '',
  items: g.items.map((it, i) => ({ n: i + 1, s: it.sku, q: it.qty, r: it.raw || it.sku, t: it.note || '', ...(it.offers.length ? { o: it.offers.map(o => [o.supplier, o.quote]) } : {}) })),
}));
reqObjs.sort((a, b) => a.d.localeCompare(b.d) || a.c.localeCompare(b.c));
const reqChunks = chunks(reqObjs, maxChunk);
reqChunks.forEach((c, i) => put(`03_request_${i + 1}.sql`, head('03', `request riwayat ${i + 1}/${reqChunks.length} (${c[0].d} s/d ${c[c.length - 1].d})`) + requestSql(c)));
if (priceItems.length) {
  const one = [{ k: priceKey, d: checkDate, c: priceCustomer, h: fallbackHandle, pc: true, nt: 'Impor Excel: CEK EX-STOCK (diskon supplier lokal)', items: priceItems.map((it, i) => ({ n: i + 1, s: it.sku, q: 1, r: it.sku, t: '', o: it.offers.map(o => [o.supplier, o.quote]) })) }];
  put('04_cek_harga.sql', head('04', 'diskon supplier lokal dari CEK EX-STOCK') + requestSql(one));
}

// 05 PO
if (poPlan.length) {
  const poObjs = poPlan.map(p => ({
    title: p.title, date: p.date ?? checkDate, supplier: p.supplier, closed: p.closed,
    lines: p.lines.map(l => ({ s: l.sku, q: l.qty, ...(l.sent !== undefined ? { sent: l.sent } : {}), ...(l.price ? { p: l.price } : {}) })),
  }));
  put('05_po.sql', head('05', 'riwayat PO (ORDERAN)') + `-- PO lama (> ${poOpenDays} hari): status Selesai, dianggap dikirim dan diterima (Excel tidak mencatatnya); qty yang dibatalkan
-- dicatat sebagai "Selesai, sisa tidak datang". PO baru: status Dipesan tanpa catatan pengiriman.
do $po$
declare p jsonb; l jsonb; cid bigint; pid bigint; lid bigint; sid bigint; rid bigint; sup bigint; short boolean; n int := 0;
begin
  for p in select * from jsonb_array_elements(${lit(poObjs)}::jsonb) loop
    continue when exists (select 1 from comparisons where name = p->>'title');
    select id into sup from suppliers where lower(btrim(name)) = lower(p->>'supplier');
    insert into comparisons (name, cmp_date) values (p->>'title', (p->>'date')::date) returning id into cid;
    insert into purchase_orders (po_date, status, supplier_id, comparison_id) values ((p->>'date')::date, 'dipesan', sup, cid) returning id into pid;
    short := false;
    for l in select * from jsonb_array_elements(p->'lines') loop
      insert into po_lines (po_id, sku, qty, price) values (pid, l->>'s', (l->>'q')::int, nullif(l->>'p', '')::numeric);
      if (p->>'closed')::boolean and coalesce((l->>'sent')::int, (l->>'q')::int) < (l->>'q')::int then short := true; end if;
    end loop;
    if (p->>'closed')::boolean then
      insert into po_shipments (po_id, ship_date, note) values (pid, (p->>'date')::date, 'Impor Excel: pengiriman tidak tercatat di Excel, dianggap terkirim.') returning id into sid;
      insert into po_receipts (po_id, recv_date, note) values (pid, (p->>'date')::date, 'Impor Excel: penerimaan tidak tercatat di Excel, dianggap diterima.') returning id into rid;
      for l in select * from jsonb_array_elements(p->'lines') loop
        select id into lid from po_lines where po_id = pid and sku = l->>'s';
        insert into po_shipment_items (shipment_id, line_id, qty) values (sid, lid, coalesce((l->>'sent')::int, (l->>'q')::int));
        insert into po_receipt_items (receipt_id, line_id, qty) values (rid, lid, coalesce((l->>'sent')::int, (l->>'q')::int));
      end loop;
      update purchase_orders set status = 'selesai', closed_short = short where id = pid;
    end if;
    n := n + 1;
  end loop;
  raise notice 'PO dibuat: %', n;
end $po$;

select name, status, closed_short, (select count(*) from po_lines where po_id = purchase_orders.id) as produk from purchase_orders order by id;
`);
}

// ---------- ringkasan di layar ----------
const offerCount = groups.reduce((n, g) => n + g.items.reduce((m, i) => m + i.offers.length, 0), 0);
console.log(`\n=== Seed SQL dibuat di ${outDir}/ ===`);
written.forEach(([n, b]) => console.log(`  ${n}  (${(b / 1024).toFixed(0)} KB)`));
console.log(`\nIsi: ${customers.length} customer, ${products.size} produk, ${groups.length} request (${all.length} baris produk, ${offerCount} penawaran supplier), cek harga ${priceItems.length} produk, ${poPlan.length} PO.`);
console.log(`Dilewati ${skipped.length} baris; tanggal diperbaiki ${dateFixes.length}${dateFixes.filter(d => /tebakan/.test(d.reason)).length ? ` (tebakan: ${dateFixes.filter(d => /tebakan/.test(d.reason)).map(d => `${d.where} ${d.from} -> ${d.to}`).join('; ')})` : ''}.`);
console.log(`Kata supplier tak dikenal: ${new Set(supUnknown.map(x => x.word)).size} jenis. Diskon tak terbaca: ${discBad.length} sel. Customer: ${nameBefore} ejaan -> ${customers.length} setelah digabung (${merged.groups.length} kelompok). Pasangan yang masih mirip tapi tidak digabung: ${similarCustomers(customers).length}.`);
if (args.includes('--tampil-gabungan')) merged.groups.forEach(g => console.log('  gabung: ' + g.join(' | ')));
const fz = orderan.fuzzy;
if (fz.length) console.log(`Sel qty PO berisi teks: ${fz.length} (contoh: ${fz.slice(0, 5).map(f => `${f.sku} "${f.raw}"->${f.qty}`).join('; ')}).`);
