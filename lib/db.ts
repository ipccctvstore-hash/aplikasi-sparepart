'use client';
import { supabase } from './supabase/client';
import type { Customer, Product, Settings, Supplier } from './types';

const sb = () => supabase();
function ok<T>(r: { data: T | null; error: { message: string } | null }): T {
  if (r.error) throw new Error(r.error.message);
  return r.data as T;
}

export async function getSettings(): Promise<Settings> {
  const rows = ok(await sb().from('app_settings').select('key,value'));
  const m: Record<string, unknown> = Object.fromEntries((rows as { key: string; value: unknown }[]).map(r => [r.key, r.value]));
  return { ask_threshold: Number(m.ask_threshold ?? 10), cover_months: Number(m.cover_months ?? 1), po_aging_days: Number(m.po_aging_days ?? 60) };
}
export async function getSuppliers(): Promise<Supplier[]> {
  const rows = ok(await sb().from('suppliers').select('*').order('id'));
  return (rows as Supplier[]).map(s => ({ ...s, lead_months: Number(s.lead_months), kurs: Number(s.kurs) }));
}
export async function getCustomers(): Promise<Customer[]> {
  return ok(await sb().from('customers').select('*').order('name')) as Customer[];
}
const num = (x: unknown) => (x === null || x === undefined ? null : Number(x));
export function toProduct(r: Record<string, unknown>): Product {
  return { ...(r as unknown as Product), pl_price: num(r.pl_price), tempo_disc: num(r.tempo_disc), cash_disc: num(r.cash_disc), stock_qty: Number(r.stock_qty ?? 0) };
}
/** Data produk (nama, PL, diskon, stok) untuk beberapa SKU sekaligus. */
export async function getProducts(skus: string[]): Promise<Map<string, Product>> {
  const out = new Map<string, Product>();
  const list = [...new Set(skus.filter(Boolean))];
  for (let i = 0; i < list.length; i += 150) {
    const rows = ok(await sb().from('v_products').select('*').in('sku', list.slice(i, i + 150)));
    (rows as Record<string, unknown>[]).forEach(r => out.set(r.sku as string, toProduct(r)));
  }
  return out;
}
/** Cari produk untuk pemilih (part number atau nama). */
export async function searchProducts(q: string, limit = 20): Promise<Product[]> {
  const t = q.trim().replace(/[%,()]/g, ' ');
  let query = sb().from('v_products').select('*').order('sku').limit(limit);
  if (t) query = query.or(`sku.ilike.%${t}%,name.ilike.%${t}%`);
  return (ok(await query) as Record<string, unknown>[]).map(toProduct);
}
export async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const r = await sb().rpc(fn, args ?? {});
  if (r.error) throw new Error(r.error.message);
  return r.data as T;
}
/** Beri tahu halaman lain bahwa data berubah (daftar dimuat ulang). */
export const DATA_EVENT = 'sp-data-changed';
export const notifyChanged = () => window.dispatchEvent(new Event(DATA_EVENT));
