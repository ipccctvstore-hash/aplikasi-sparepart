import { describe, expect, it, vi } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

vi.mock('server-only', () => ({}));
const root = join(__dirname, '..');
const src = readFileSync(join(root, 'lib/jurnal.ts'), 'utf8');
const walk = (d: string): string[] => readdirSync(d).flatMap(f => {
  const p = join(d, f);
  if (['node_modules', '.next', '.git', 'tests', 'supabase', 'scripts'].includes(f)) return [];
  return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx|mjs|js)$/.test(f) ? [p] : [];
});

describe('klien Jurnal hanya membaca', () => {
  it('file lib/jurnal.ts tidak memuat metode tulis', () => {
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(code).not.toMatch(/['"`](POST|PUT|PATCH|DELETE)['"`]/i);
    expect(code).not.toMatch(/\.(post|put|patch|delete)\s*\(/i);
    expect(code).toMatch(/method:\s*'GET'/);
  });
  it('hanya lib/jurnal.ts yang menyentuh API Jurnal / Mekari', () => {
    const offenders = walk(root).filter(f => !f.endsWith(join('lib', 'jurnal.ts')) && /api\.mekari\.com|JURNAL_CLIENT_SECRET|public\/jurnal\/api/.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });
  it('fetch yang dikirim selalu GET dan bertanda tangan HMAC', async () => {
    process.env.JURNAL_CLIENT_ID = 'id-uji'; process.env.JURNAL_CLIENT_SECRET = 'rahasia-uji';
    const calls: { url: string; init: RequestInit }[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => { calls.push({ url, init }); return new Response(JSON.stringify({ products: [] }), { status: 200 }); }));
    const j = await import('../lib/jurnal');
    await j.listProducts(1, 10); await j.listInvoices(1, 10, '2026-01-01'); await j.getInvoice('5');
    expect(calls).toHaveLength(3);
    for (const c of calls) {
      expect(c.init.method).toBe('GET');
      expect(c.init.body).toBeUndefined();
      expect(String((c.init.headers as Record<string, string>).Authorization)).toMatch(/^hmac username="id-uji", algorithm="hmac-sha256", headers="date request-line", signature="[A-Za-z0-9+/=]+"$/);
    }
    vi.unstubAllGlobals();
  });
  it('tanda tangan HMAC cocok dengan contoh algoritma Mekari', async () => {
    const j = await import('../lib/jurnal');
    const crypto = await import('node:crypto');
    const now = new Date('2021-11-10T07:24:29Z');
    const h = j.signHeaders({ baseUrl: 'x', clientId: 'cid', clientSecret: 'sec' }, '/public/jurnal/api/v1/products?page=1', now);
    const expected = crypto.createHmac('sha256', 'sec').update('date: Wed, 10 Nov 2021 07:24:29 GMT\nGET /public/jurnal/api/v1/products?page=1 HTTP/1.1').digest('base64');
    expect(h.Authorization).toContain(`signature="${expected}"`);
    expect(h.Date).toBe('Wed, 10 Nov 2021 07:24:29 GMT');
  });
  it('pemetaan produk dan invoice', async () => {
    const j = await import('../lib/jurnal');
    expect(j.mapProduct({ id: 7, product_code: 'ab-1 ', name: 'Kampas', quantity: '3', sell_price_per_unit: '100000', product_categories: [{ name: '10 cash 15' }] }))
      .toMatchObject({ sku: 'AB-1', stock: 3, pl: 100000, category: '10 cash 15' });
    expect(j.mapProduct({ id: 1 })).toBeNull();
    const inv = j.mapInvoice({ id: 9, transaction_no: 'INV-1', transaction_date: '30/01/2024', transaction_status: { name: 'Paid' }, transaction_lines_attributes: [{ quantity: 2, product: { code: 'x-1' } }] });
    expect(inv).toMatchObject({ id: '9', date: '2024-01-30', status: 'Paid', lines: [{ sku: 'X-1', qty: 2 }] });
  });
});
