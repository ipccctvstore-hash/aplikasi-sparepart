import { describe, expect, it } from 'vitest';
// @ts-expect-error modul .mjs tanpa tipe
import { clientKey, extractRows, findHeader, groupRequests, parseDate, parseQty, similarCustomers } from '../scripts/impor-core.mjs';

const today = new Date('2026-10-12T05:00:00Z');
describe('impor Excel', () => {
  it('mengenali judul kolom dan lewati baris judul di atas', () => {
    const rows = [['Riwayat request'], [], ['Tgl', 'Nama Customer', 'No Part', 'Jml', 'Keterangan'], [new Date(Date.UTC(2026, 2, 5)), 'Bengkel Maju', '04465-0k370', '2pc', 'cepat']];
    const h = findHeader(rows);
    expect(h?.row).toBe(2);
    const r = extractRows(rows, 'Mar', {}, today);
    expect(r.rows).toEqual([expect.objectContaining({ date: '2026-03-05', customer: 'Bengkel Maju', sku: '04465-0K370', qty: 2, note: 'cepat' })]);
  });
  it('baris bermasalah dilaporkan, bukan dibuang diam-diam', () => {
    const rows = [['Tanggal', 'Customer', 'Part Number', 'Qty'], ['31/02/2026', 'A', '04465-0K370', 1], ['01/03/2026', '', '04465-0K370', 1], ['01/03/2026', 'A', 'kampas', 1], ['01/03/2027', 'A', '04465-0K370', 1], ['02/03/2026', 'A', '04465-0K370', 1]];
    const r = extractRows(rows, 'S', {}, today);
    expect(r.rows).toHaveLength(1);
    expect(r.skipped.map((s: { reason: string }) => s.reason)).toEqual(expect.arrayContaining([expect.stringContaining('tanggal'), expect.stringContaining('customer'), expect.stringContaining('part number')]));
    expect(r.skipped).toHaveLength(4);
  });
  it('tanpa kolom customer atau tanggal diberi tahu, tidak ditebak', () => {
    const r = extractRows([['Part Number', 'Qty'], ['04465-0K370', 1]], 'S', {}, today);
    expect(r.missing).toEqual(['date', 'customer']);
  });
  it('pemetaan manual lewat --map', () => {
    const rows = [['Hari', 'Toko X', 'Kode Aneh', 'Banyak'], ['2026-03-01', 'T', '04465-0K370', 3]];
    expect(findHeader(rows, { date: 'Hari', customer: 'Toko X', sku: 'Kode Aneh', qty: 'Banyak' })?.cols).toMatchObject({ date: 0, customer: 1, sku: 2, qty: 3 });
  });
  it('tanggal dan qty', () => {
    expect(parseDate('5-3-26', today)).toBe('2026-03-05');
    expect(parseDate(46100, today)).toBe('2026-03-19');
    expect(parseDate('2026-10-13', today)).toBeNull();
    expect(parseQty('x3')).toBe(3);
    expect(parseQty('')).toBe(1);
    expect(parseQty(0)).toBe(1);
  });
  it('satu request per customer per hari; sku ganda = qty terbesar; kunci stabil', () => {
    const rows = [
      { date: '2026-03-05', customer: 'A', sku: 'X-1111', qty: 2, name: '', note: '' }, { date: '2026-03-05', customer: 'a', sku: 'X-1111', qty: 5, name: '', note: '' },
      { date: '2026-03-05', customer: 'A', sku: 'Y-2222', qty: 1, name: '', note: '' }, { date: '2026-03-06', customer: 'A', sku: 'X-1111', qty: 1, name: '', note: '' }];
    const g = groupRequests(rows);
    expect(g).toHaveLength(2);
    expect(g[0].items).toEqual([expect.objectContaining({ sku: 'X-1111', qty: 5 }), expect.objectContaining({ sku: 'Y-2222', qty: 1 })]);
    expect(clientKey(g[0])).toBe(clientKey(groupRequests(rows)[0]));
    expect(clientKey(g[0])).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-a[0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(clientKey(g[0])).not.toBe(clientKey(g[1]));
  });
  it('nama customer mirip dilaporkan untuk digabung manual', () => {
    const s = similarCustomers(['Bengkel Maju Jaya', 'Maju Jaya', 'Toko Sinar', 'Sinar Abadi Motor']);
    expect(s).toEqual(expect.arrayContaining([['Bengkel Maju Jaya', 'Maju Jaya']]));
    expect(similarCustomers(['Andi', 'Budi'])).toEqual([]);
  });
});
