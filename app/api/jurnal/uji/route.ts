import { NextResponse } from 'next/server';
import { getProfile } from '@/lib/auth';
import { JurnalError, getInvoice, jurnalConfig, listInvoices, listProducts, mapInvoice, mapProduct } from '@/lib/jurnal';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type Obj = Record<string, unknown>;
const shape = (o: unknown, depth = 0): unknown => {
  if (Array.isArray(o)) return o.length ? [shape(o[0], depth + 1)] : [];
  if (o && typeof o === 'object') return depth > 2 ? '{...}' : Object.fromEntries(Object.entries(o as Obj).map(([k, v]) => [k, shape(v, depth + 1)]));
  return o === null ? 'null' : typeof o;
};
const step = async (name: string, fn: () => Promise<unknown>) => {
  const t0 = Date.now();
  try { return { name, ok: true, ms: Date.now() - t0, ...(await fn() as Obj) }; }
  catch (e) { return { name, ok: false, ms: Date.now() - t0, error: e instanceof JurnalError || e instanceof Error ? e.message : String(e) }; }
};

/** Uji API Jurnal (hanya superadmin, hanya GET). Tidak pernah mengembalikan Client ID atau Secret. */
export async function GET() {
  const me = await getProfile();
  if (!me || me.role !== 'super') return NextResponse.json({ error: 'Hanya superadmin.' }, { status: 403 });
  let cfg;
  try { cfg = jurnalConfig(); } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 200 }); }
  const since = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
  const steps = [
    await step('Produk (GET /products)', async () => {
      const { raw, total } = await listProducts(1, 3);
      const mapped = raw.map(mapProduct);
      return { count: raw.length, total, shape: shape(raw[0]), mapped, unmapped: mapped.filter(x => !x).length };
    }),
    await step('Invoice penjualan (GET /sales_invoices)', async () => {
      const { raw, total } = await listInvoices(1, 3, since);
      const mapped = raw.map(mapInvoice);
      return { count: raw.length, total, since, shape: shape(raw[0]), mapped: mapped.map(m => m && { ...m, lines: m.lines.slice(0, 3) }), listHasLines: mapped.some(m => m?.hasLines) };
    }),
  ];
  const inv = steps[1] as Obj;
  if (inv.ok && inv.count && !inv.listHasLines) {
    const { raw } = await listInvoices(1, 1, since);
    steps.push(await step('Detail invoice (GET /sales_invoices/{id})', async () => {
      const d = await getInvoice(String(raw[0].id));
      const m = mapInvoice(d);
      return { shape: shape(d), mapped: m && { ...m, lines: m.lines.slice(0, 3) } };
    }));
  }
  return NextResponse.json({ baseUrl: cfg.baseUrl, steps, note: 'Hanya permintaan GET. Client ID dan Secret tidak ditampilkan.' });
}
