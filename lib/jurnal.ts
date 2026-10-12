import 'server-only';
import crypto from 'node:crypto';

/**
 * SATU-SATUNYA tempat aplikasi ini bicara dengan API Jurnal (Mekari).
 * Aturan keras: HANYA membaca (GET). Tidak ada fungsi tulis di sini, dan tes otomatis
 * (tests/jurnal-readonly.test.ts) gagal kalau ada POST/PUT/PATCH/DELETE di file ini.
 *
 * Autentikasi HMAC Mekari (developers.mekari.com/docs/kb/hmac-authentication):
 *   Date: <RFC 7231>  ;  string-to-sign = "date: <Date>\nGET <path>?<query> HTTP/1.1"
 *   signature = base64(HMAC-SHA256(client secret, string-to-sign))
 *   Authorization: hmac username="<client id>", algorithm="hmac-sha256", headers="date request-line", signature="<signature>"
 *
 * Nama field di respons Jurnal BELUM diverifikasi dengan data asli. Pemetaan ada di mapProduct/mapInvoice
 * dan dibuat longgar; halaman "Uji API Jurnal" dipakai untuk memastikannya sebelum sync pertama.
 */
const PREFIX = '/public/jurnal/api/v1';

export type JurnalConfig = { baseUrl: string; clientId: string; clientSecret: string };
export function jurnalConfig(): JurnalConfig {
  const baseUrl = (process.env.JURNAL_BASE_URL || 'https://api.mekari.com').replace(/\/+$/, '');
  const clientId = process.env.JURNAL_CLIENT_ID, clientSecret = process.env.JURNAL_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error('JURNAL_CLIENT_ID atau JURNAL_CLIENT_SECRET belum diisi di pengaturan server.');
  return { baseUrl, clientId, clientSecret };
}

export function signHeaders(cfg: JurnalConfig, pathWithQuery: string, now: Date = new Date()): Record<string, string> {
  const date = now.toUTCString();
  const payload = [`date: ${date}`, `GET ${pathWithQuery} HTTP/1.1`].join('\n');
  const signature = crypto.createHmac('sha256', cfg.clientSecret).update(payload).digest('base64');
  return {
    Accept: 'application/json',
    Date: date,
    Authorization: `hmac username="${cfg.clientId}", algorithm="hmac-sha256", headers="date request-line", signature="${signature}"`,
  };
}

export class JurnalError extends Error {
  constructor(message: string, readonly status: number | null) { super(message); }
}

/** GET ke API Jurnal. `path` relatif terhadap /public/jurnal/api/v1. */
export async function jurnalGet(path: string, query: Record<string, string | number | undefined> = {}, signal?: AbortSignal): Promise<unknown> {
  const cfg = jurnalConfig();
  const qs = Object.entries(query).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`).join('&');
  const pathWithQuery = `${PREFIX}${path}${qs ? '?' + qs : ''}`;
  let res: Response;
  try {
    res = await fetch(cfg.baseUrl + pathWithQuery, { method: 'GET', headers: signHeaders(cfg, pathWithQuery), signal, cache: 'no-store' });
  } catch (e) {
    throw new JurnalError('Tidak bisa menghubungi Jurnal: ' + (e instanceof Error ? e.message : String(e)), null);
  }
  const text = await res.text();
  if (!res.ok) {
    const hint = res.status === 401 || res.status === 403 ? ' (cek Client ID dan Secret, serta izin akses API di Jurnal)' : res.status === 429 ? ' (terlalu banyak permintaan, coba lagi nanti)' : '';
    throw new JurnalError(`Jurnal membalas ${res.status}${hint}: ${text.slice(0, 200)}`, res.status);
  }
  try { return JSON.parse(text); } catch { throw new JurnalError('Balasan Jurnal bukan JSON.', res.status); }
}

/* ===== Pemetaan data ===== */
type Obj = Record<string, any>;
const first = (o: Obj, keys: string[]) => { for (const k of keys) if (o[k] !== undefined && o[k] !== null && o[k] !== '') return o[k]; return undefined; };
const num = (v: unknown) => { const n = Number(typeof v === 'string' ? v.replace(/,/g, '') : v); return Number.isFinite(n) ? n : null; };

/** Ambil array dari balasan, apa pun nama pembungkusnya. */
export function pickList(body: unknown, names: string[]): Obj[] {
  if (Array.isArray(body)) return body as Obj[];
  const o = (body ?? {}) as Obj;
  for (const n of names) if (Array.isArray(o[n])) return o[n];
  for (const v of Object.values(o)) if (Array.isArray(v)) return v as Obj[];
  return [];
}

export type JProduct = { sku: string; jurnal_id: string; name: string; category: string; pl: number | null; stock: number };
export function mapProduct(p: Obj): JProduct | null {
  const sku = String(first(p, ['product_code', 'code', 'sku']) ?? '').trim().toUpperCase();
  if (!sku) return null;
  const cat = first(p, ['product_category_name', 'category_name']) ?? (Array.isArray(p.product_categories) ? p.product_categories[0]?.name : undefined) ?? p.product_category?.name ?? p.category?.name ?? '';
  return {
    sku, jurnal_id: String(p.id ?? sku), name: String(first(p, ['description', 'name']) ?? '').trim(),
    category: String(cat ?? '').trim(), pl: num(first(p, ['sell_price_per_unit', 'sales_price', 'sell_price', 'unit_price', 'price'])),
    stock: Math.round(num(first(p, ['quantity', 'stock_quantity', 'stock', 'qty'])) ?? 0),
  };
}

export type JInvoice = { id: string; no: string; date: string; status: string; updated_at: string | null; lines: { sku: string; qty: number }[]; hasLines: boolean };
const isoDate = (v: unknown): string => {
  const s = String(v ?? '');
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/) ?? null;
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  const d = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  return d ? `${d[3]}-${d[2]}-${d[1]}` : '';
};
export function mapInvoice(x: Obj): JInvoice | null {
  const id = first(x, ['id']); const date = isoDate(first(x, ['transaction_date', 'date']));
  if (id === undefined || !date) return null;
  const rawLines = first(x, ['transaction_lines_attributes', 'transaction_lines', 'lines', 'items']);
  const lines = (Array.isArray(rawLines) ? rawLines : []).map((l: Obj) => ({
    sku: String(first(l.product ?? {}, ['code', 'product_code']) ?? first(l, ['product_code', 'sku']) ?? '').trim().toUpperCase(),
    qty: num(first(l, ['quantity', 'qty'])) ?? 0,
  })).filter(l => l.sku && l.qty);
  const status = typeof x.transaction_status === 'object' && x.transaction_status ? (x.transaction_status.name ?? x.transaction_status.id) : first(x, ['status', 'transaction_status']);
  return { id: String(id), no: String(first(x, ['transaction_no', 'number']) ?? ''), date, status: String(status ?? ''), updated_at: first(x, ['updated_at']) ? String(x.updated_at) : null, lines, hasLines: Array.isArray(rawLines) };
}

/* ===== Operasi baca ===== */
export async function listProducts(page: number, perPage: number, signal?: AbortSignal) {
  const body = await jurnalGet('/products', { page, per_page: perPage }, signal);
  return { raw: pickList(body, ['products']), total: num((body as Obj)?.total_count ?? (body as Obj)?.total) };
}
export async function listInvoices(page: number, perPage: number, since: string, signal?: AbortSignal) {
  const body = await jurnalGet('/sales_invoices', { page, per_page: perPage, start_date: since }, signal);
  return { raw: pickList(body, ['sales_invoices']), total: num((body as Obj)?.total_count ?? (body as Obj)?.total) };
}
export async function getInvoice(id: string, signal?: AbortSignal): Promise<Obj> {
  const body = (await jurnalGet(`/sales_invoices/${encodeURIComponent(id)}`, {}, signal)) as Obj;
  return (body.sales_invoice ?? body) as Obj;
}
