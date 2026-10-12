import 'server-only';
import JSZip from 'jszip';
import { adminClient } from './supabase/admin';
import { toCsv, jakartaStamp } from './csv';

/** Tabel yang dicadangkan, beserta kolom pengurut supaya pembacaan per halaman stabil. */
export const BACKUP_TABLES: [string, string[]][] = [
  ['profiles', ['id']], ['app_settings', ['key']], ['customers', ['id']], ['suppliers', ['id']],
  ['products', ['sku']], ['sku_substitutions', ['from_sku']], ['history_monthly', ['sku', 'month']],
  ['requests', ['id']], ['request_helpers', ['request_id', 'user_id']], ['request_rows', ['id']], ['offers', ['id']],
  ['comparisons', ['id']], ['comparison_suppliers', ['cmp_id', 'supplier_id']], ['comparison_items', ['id']], ['comparison_prices', ['item_id', 'supplier_id']],
  ['purchase_orders', ['id']], ['po_lines', ['id']], ['po_shipments', ['id']], ['po_shipment_items', ['shipment_id', 'line_id']], ['po_receipts', ['id']], ['po_receipt_items', ['receipt_id', 'line_id']],
  ['j_categories', ['name']], ['j_products', ['sku']], ['j_invoices', ['jurnal_id']], ['j_invoice_lines', ['id']],
  ['sync_runs', ['id']], ['sync_failures', ['id']], ['sync_state', ['kind']],
];

const PAGE = 1000;

/** Membaca seluruh isi satu tabel (service role, per halaman). */
async function readAll(table: string, order: string[]): Promise<Record<string, unknown>[]> {
  const db = adminClient(), out: Record<string, unknown>[] = [];
  for (let from = 0; ; from += PAGE) {
    let q = db.from(table).select('*');
    for (const o of order) q = q.order(o, { ascending: true });
    const { data, error } = await q.range(from, from + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

/** Membuat ZIP berisi satu CSV per tabel + ringkasan jumlah baris. */
export async function buildBackupZip(): Promise<{ zip: Buffer; counts: Record<string, number>; name: string }> {
  const zip = new JSZip(), counts: Record<string, number> = {};
  for (const [t, order] of BACKUP_TABLES) {
    const rows = await readAll(t, order);
    counts[t] = rows.length;
    zip.file(`${t}.csv`, toCsv(rows));
  }
  const st = jakartaStamp();
  zip.file('_ringkasan.txt', [`Cadangan Aplikasi Sparepart`, `Dibuat: ${st.date} ${st.time} WIB`, '', ...Object.entries(counts).map(([t, n]) => `${t}: ${n} baris`)].join('\r\n'));
  const buf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  return { zip: buf, counts, name: `cadangan-sparepart-${st.date}.zip` };
}

export const BACKUP_BUCKET = 'cadangan';
export const BACKUP_KEEP = 14;

/** Menyimpan cadangan ke Supabase Storage (bucket privat) dan menyisakan BACKUP_KEEP berkas terbaru. */
export async function saveBackupToStorage(): Promise<{ name: string; bytes: number; kept: number }> {
  const db = adminClient();
  const { error: be } = await db.storage.createBucket(BACKUP_BUCKET, { public: false });
  if (be && !/already exists|duplicate/i.test(be.message)) throw new Error('Bucket cadangan: ' + be.message);
  const { zip, name } = await buildBackupZip();
  const up = await db.storage.from(BACKUP_BUCKET).upload(name, zip, { contentType: 'application/zip', upsert: true });
  if (up.error) throw new Error('Unggah cadangan: ' + up.error.message);
  const list = await db.storage.from(BACKUP_BUCKET).list('', { limit: 1000 });
  const files = (list.data ?? []).filter(f => /^cadangan-sparepart-\d{4}-\d{2}-\d{2}\.zip$/.test(f.name)).map(f => f.name).sort();
  const old = files.slice(0, Math.max(0, files.length - BACKUP_KEEP));
  if (old.length) await db.storage.from(BACKUP_BUCKET).remove(old);
  return { name, bytes: zip.length, kept: files.length - old.length };
}
