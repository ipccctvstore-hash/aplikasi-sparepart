import { describe, expect, it } from 'vitest';
// @ts-expect-error modul .mjs tanpa tipe
import { canonicalCustomers, mergeSimilarCustomers, clientKey, extractCatalog, extractRows, parseOrderan, parsePoCell, parsePoQty, findHeader, groupRequests, normalizeHandle, parseDate, parseDiscount, parseMoney, parseQty, parseSkuCell, parseSupplierCell, resolveDates, similarCustomers, summarizeProducts } from '../scripts/impor-core.mjs';

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
    const rows = [['Tanggal', 'Customer', 'Part Number', 'Qty'],
      ['31/02/2026', 'A', '04465-0K370', 1],                  // tanggal tidak ada -> dilewati (belum ada tanggal sebelumnya)
      ['01/03/2027', 'B', '04465-0K370', 1],                  // masa depan
      ['02/03/2026', 'A', 'kampas', 1],                       // bukan part number
      ['03/03/2026', 'A', '04465-0K370', 1]];
    const r = extractRows(rows, 'S', {}, today);
    expect(r.rows).toHaveLength(1);
    expect(r.skipped.map((s: { reason: string }) => s.reason)).toEqual([expect.stringContaining('tanggal'), expect.stringContaining('tanggal'), expect.stringContaining('part number')]);
  });
  it('tanggal dan customer diteruskan ke baris di bawahnya (format Excel asli)', () => {
    const rows = [['TANGGAL', 'CUSTOMER', 'HANDLE', 'NAMA MOBIL / RANGKA / NAMA  BARANG', 'PART NUMBER', 'QTY', 'NETTO', 'PL', 'DISKON', 'SUPLIER'],
      [], [new Date(Date.UTC(2026, 9, 1)), 'sjm ', 'ali', null, '81110-V1051'], [null, null, null, null, '81590-V1030'], [],
      [null, 'putra jaya motor', null, null, '47781-28210', 2, null, ' 1.418.000 ', '-25 cash 30', '-30duta'], [null, null, null, 'ring piston', '81551-60560', null, null, null, '-9.0', 'stok']];
    const r = extractRows(rows, 'OKTOBER', {}, today);
    expect(r.rows.map((x: { customer: string; date: string; sku: string; handle: string }) => [x.customer, x.date, x.sku, x.handle])).toEqual([
      ['sjm', '2026-10-01', '81110-V1051', 'Ali'], ['sjm', '2026-10-01', '81590-V1030', 'Ali'],
      ['putra jaya motor', '2026-10-01', '47781-28210', 'Ali'], ['putra jaya motor', '2026-10-01', '81551-60560', 'Ali']]);
    expect(r.rows[2]).toMatchObject({ qty: 2, pl: 1418000, disc: { tempo: 25, cash: 30 }, offers: [{ supplier: 'Duta', quote: 30 }] });
    expect(r.rows[3]).toMatchObject({ name: 'ring piston', disc: { tempo: 9, cash: 9 }, offers: [{ supplier: 'Stok sendiri', quote: null }] });
  });
  it('judul kolom tanggal kosong tetap memakai kolom pertama', () => {
    const rows = [[' ', 'CUSTOMER', 'PART NUMBER'], [new Date(Date.UTC(2026, 7, 1)), 'putra jaya', '04152-YZZA4'], [null, null, '75710-48031']];
    const r = extractRows(rows, 'AGUSTUS', {}, today);
    expect(r.rows).toHaveLength(2);
    expect(r.rows[1].date).toBe('2026-08-01');
  });
  it('salah ketik tanggal diperbaiki berdasarkan nama sheet dan urutan, dan dicatat', () => {
    const d = (m: number, dd: number, y = 2026) => new Date(Date.UTC(y, m - 1, dd));
    const cells = [{ r: 1, v: d(1, 2, 2025) }, { r: 2, v: d(1, 3) }, { r: 3, v: '29-01-0206' }, { r: 4, v: d(1, 30) }];
    const a = resolveDates(cells, 'JANUARI', today);
    expect([...a.map.values()]).toEqual(['2026-01-02', '2026-01-03', '2026-01-29', '2026-01-30'].map((x, i) => (i === 2 ? '2026-01-29' : x)));
    expect(a.fixes.map((f: { reason: string }) => f.reason)).toEqual(['tahun diperbaiki', 'tahun diperbaiki']);
    const mar = resolveDates([{ r: 1, v: d(3, 7) }, { r: 2, v: d(2, 9) }, { r: 3, v: d(3, 10) }], 'MARET', today);
    expect(mar.map.get(2)).toBe('2026-03-09');
    const jul = resolveDates([{ r: 1, v: d(7, 6) }, { r: 2, v: d(9, 24) }, { r: 3, v: d(7, 8) }], 'JULI', today);
    expect(jul.map.get(2)).toBe('2026-07-07');
    expect(jul.fixes[0].reason).toContain('tebakan');
    expect(resolveDates([{ r: 1, v: d(5, 2) }], 'Laporan', today).map.get(1)).toBe('2026-05-02');   // bukan sheet bulan: tidak diubah
  });
  it('sel part number berisi catatan, jumlah, atau varian', () => {
    expect(parseSkuCell('1pc 47731-52190')).toMatchObject({ skus: ['47731-52190'], qty: 1, note: '' });
    expect(parseSkuCell('20pc 23682-0L010 kosong, ready 23682-30020')).toMatchObject({ skus: ['23682-0L010'], qty: 20, note: 'kosong, ready 23682-30020' });
    expect(parseSkuCell('48510-80416  (harus set)')).toMatchObject({ skus: ['48510-80416'], note: '(harus set)' });
    expect(parseSkuCell('04111-30724?')).toMatchObject({ skus: ['04111-30724'] });
    expect(parseSkuCell('04465-bz300')).toMatchObject({ skus: ['04465-BZ300'] });
    expect(parseSkuCell('13041-51021-01/02/03')).toMatchObject({ skus: ['13041-51021-01', '13041-51021-02', '13041-51021-03'] });
    expect(parseSkuCell('44200 30730')).toMatchObject({ skus: ['44200-30730'] });
    expect(parseSkuCell('27415 - 30020')).toMatchObject({ skus: ['27415-30020'] });
    expect(parseSkuCell('Via laris cargo')).toBeNull();
    expect(parseSkuCell('20pc')).toBeNull();
    expect(parseSkuCell('2024')).toBeNull();
  });
  it('kolom supplier: nama, diskon, dan kata tak dikenal', () => {
    expect(parseSupplierCell('-30duta').offers).toEqual([{ supplier: 'Duta', quote: 30 }]);
    expect(parseSupplierCell('sum12').offers).toEqual([{ supplier: 'Sum', quote: 12 }]);
    expect(parseSupplierCell('hui 50, nsm 50, mit 50, dt 40').offers).toEqual([{ supplier: 'Hui', quote: 50 }, { supplier: 'NSM', quote: 50 }, { supplier: 'Mitra', quote: 50 }, { supplier: 'Duta', quote: 40 }]);
    expect(parseSupplierCell('tam , stok').offers).toEqual([{ supplier: 'TAM', quote: null }, { supplier: 'Stok sendiri', quote: null }]);
    expect(parseSupplierCell('rtD 30, stokD').offers).toEqual([{ supplier: 'RT D', quote: 30 }, { supplier: 'Stok D', quote: null }]);
    expect(parseSupplierCell('stok 1pc').offers).toEqual([{ supplier: 'Stok sendiri', quote: null }]);
    expect(parseSupplierCell('xyz 25')).toEqual({ offers: [], unknown: ['xyz'] });
    expect(parseSupplierCell('delwin12, rtD').offers).toEqual([{ supplier: 'Delwin', quote: 12 }, { supplier: 'RT D', quote: null }]);
    expect(parseSupplierCell('sm 20', { sm: 'Sum' }).offers).toEqual([{ supplier: 'Sum', quote: 20 }]);
  });
  it('diskon, harga, dan handle', () => {
    expect(parseDiscount('-25 cash 30')).toEqual({ tempo: 25, cash: 30 });
    expect(parseDiscount('22.5  cash 27.5')).toEqual({ tempo: 22.5, cash: 27.5 });
    expect(parseDiscount(' -25 cassh 30')).toEqual({ tempo: 25, cash: 30 });
    expect(parseDiscount('-9.0')).toEqual({ tempo: 9, cash: 9 });
    expect(parseDiscount(25)).toEqual({ tempo: 25, cash: 25 });
    expect(parseDiscount(-30)).toEqual({ tempo: 30, cash: 30 });
    expect(parseDiscount('-9 indent tam')).toEqual({ tempo: 9, cash: 9 });
    expect(parseDiscount('-30 (harus set)')).toEqual({ tempo: 30, cash: 30 });
    expect(parseDiscount('30 / 25')).toBeNull();
    expect(parseDiscount('cash 25')).toBeNull();
    expect(parseDiscount('netto 100.000')).toBeNull();
    expect(parseMoney(' 1.418.000 ')).toBe(1418000);
    expect(parseMoney(730000)).toBe(730000);
    expect(parseMoney('abc')).toBeNull();
    expect(parseMoney(45)).toBeNull();
    expect(['nablila', "nabilla'", 'nbilla', 'NABILLA ', 'ali', 'alio', 'adji`', 'yaw', 'krisnadi'].map(x => normalizeHandle(x))).toEqual(['Nabilla', 'Nabilla', 'Nabilla', 'Nabilla', 'Ali', 'Ali', 'Adji', 'Yaw', 'Krisnadi']);
    expect(['group 1', '2 orang', '0339:', '349.0', null, 'vx80'].map(x => normalizeHandle(x))).toEqual([null, null, null, null, null, null]);
  });
  it('produk dari riwayat: yang terbaru menang; katalog mengisi yang kosong', () => {
    const rows = [
      { date: '2026-03-01', sku: 'A-1111', name: 'lama', pl: 1000, disc: { tempo: 20, cash: 25 } },
      { date: '2026-05-01', sku: 'A-1111', name: 'baru', pl: 2000, disc: null },
      { date: '2026-04-01', sku: 'B-2222', name: '', pl: null, disc: null }];
    const cat = new Map([['A-1111', { pl: 9999, name: 'katalog', po: true }], ['C-3333', { pl: 5000, name: 'Brake pad', po: false }]]);
    const m = summarizeProducts(rows, cat);
    expect(m.get('A-1111')).toMatchObject({ name: 'baru', pl: 2000, tempo: 20, cash: 25, asked: 2, inPo: true });
    expect(m.get('B-2222')).toMatchObject({ name: '', pl: null });
    expect(m.get('C-3333')).toMatchObject({ name: 'Brake pad', pl: 5000, asked: 0 });
  });
  it('katalog dari file order dan cek harga', () => {
    const cat = extractCatalog({
      ORDERAN: [['PART NUMBER'], ['PO NUMBER'], ['PO NUMBER'], ['AMOUNT'], [null, 'QTY'], ['04111-0E032', null, 5], ['04111-0L193', null, null]],
      'CEK EX-STOCK': [['part number'], ['13568-39016', 30, 'dt 25', null, 721000]],
      MAZDA: [['PART NUMBER'], ['DAY6-33-28ZA', null, 1900400, 'BRAKE PAD DEPAN MAZDA 2']],
    });
    expect(cat.get('04111-0E032')).toMatchObject({ po: true });
    expect(cat.has('04111-0L193')).toBe(false);
    expect(cat.get('13568-39016')).toMatchObject({ pl: 721000, po: false });
    expect(cat.get('DAY6-33-28ZA')).toMatchObject({ pl: 1900400, name: 'BRAKE PAD DEPAN MAZDA 2' });
  });
  it('diskon supplier lokal di CEK EX-STOCK ikut dibaca (hanya yang ada angkanya)', () => {
    const cat = extractCatalog({ 'CEK EX-STOCK': [['part number'], ['13568-39016', 30, 'dt 25, nsm 30, sm 20', null, 721000], ['42431-26210', 4, 'tam', null, 2650000], ['46550-60070', 3, 'xyz 20']] });
    expect(cat.get('13568-39016').offers).toEqual([{ supplier: 'Duta', quote: 25 }, { supplier: 'NSM', quote: 30 }, { supplier: 'SM', quote: 20 }]);
    expect(cat.get('42431-26210').offers).toEqual([]);
    expect(cat.unknown).toEqual([expect.objectContaining({ word: 'xyz' })]);
  });
  it('qty PO yang ditulis sebagai teks', () => {
    expect([10, '10C', 'dms02 2pc', '5 DMS-12', '10(102)', '11 cancel + 9', 'cancel', 'HS 11 (68)', 0, '', null].map(parsePoQty)).toEqual([10, 10, 2, 5, 10, 11, null, null, null, null, null]);
  });
  it('sel PO: batal sebagian dan harga dalam kurung', () => {
    expect(parsePoCell('11 cancel + 9')).toEqual({ qty: 20, sent: 9 });
    expect(parsePoCell('10(102)')).toEqual({ qty: 10, price: 102 });
    expect(parsePoCell('5 (31310)')).toEqual({ qty: 5 });
    expect(parsePoCell(7)).toEqual({ qty: 7 });
    expect(parsePoCell('HS 11 (68)')).toEqual({ qty: 11, price: 68 });
    expect(parsePoCell('cancel')).toBeNull();
  });
  it('diskon dengan catatan indent', () => {
    expect(parseDiscount('-9 INDENT 3-14HARI')).toEqual({ tempo: 9, cash: 9 });
    expect(parseDiscount('-9 indent 3-14 hari')).toEqual({ tempo: 9, cash: 9 });
    expect(parseDiscount('indent')).toBeNull();
  });
  it('supplier Capela dan varian D', () => {
    expect(parseSupplierCell('-17capela, -15capelaD').offers).toEqual([{ supplier: 'Capela', quote: 17 }, { supplier: 'Capela D', quote: 15 }]);
    expect(parseSupplierCell('-22.5amin  -sing ada masuk')).toEqual({ offers: [{ supplier: 'Amin', quote: 22.5 }], unknown: [] });
  });
  it('customer yang hanya beda ketikan digabung', () => {
    const { map, groups } = mergeSimilarCustomers(new Map([['Budi', 10], ['Pak Budi', 2], ['Budi Motor', 1], ['Nabilla', 5], ['Nabila', 1], ['wendy', 3], ['rendy', 2], ['Toko 1', 4], ['Toko 2', 4], ['sumber rezeki', 9], ['sumber rezeki PMK', 8], ['putra jaya', 20], ['putra jya', 1], ['sinar jaya motor PMK', 3], ['sinar jaya motor PRJ', 2]]));
    expect(map.get('Pak Budi')).toBe('Budi');
    expect(map.get('Budi Motor')).toBe('Budi');
    expect(map.get('Nabila')).toBe('Nabilla');
    expect(map.get('putra jya')).toBe('putra jaya');
    expect(map.get('rendy')).toBe('rendy');
    expect(map.get('Toko 2')).toBe('Toko 2');
    expect(map.get('sumber rezeki PMK')).toBe('sumber rezeki PMK');
    expect(map.get('sinar jaya motor PRJ')).toBe('sinar jaya motor PRJ');
    expect(groups.length).toBe(3);
  });
  it('riwayat PO dibaca per kolom: tanggal, pemesan, nomor, qty', () => {
    const d = new Date(Date.UTC(2025, 2, 8));
    const { pos, odd, fuzzy } = parseOrderan([
      ['PART NUMBER', d, d], ['PO NUMBER', 'ELIZ', 'HS'], ['PO NUMBER', 31846, null], ['AMOUNT ', 35629.22, null], [null, 'QTY', 'QTY'],
      ['04111-0E032', 5, null], ['04111-0L193', '10C', 'cancel'], ['bukan sku', 3, null], ['04111-11280', null, 2]], new Date('2026-10-12T05:00:00Z'));
    expect(pos).toHaveLength(2);
    expect(pos[0]).toMatchObject({ date: '2025-03-08', contact: 'ELIZ', number: '31846', amount: 35629.22, lines: [{ sku: '04111-0E032', qty: 5 }, { sku: '04111-0L193', qty: 10 }] });
    expect(pos[1]).toMatchObject({ contact: 'HS', number: '', lines: [{ sku: '04111-11280', qty: 2 }] });
    expect(odd).toEqual([expect.objectContaining({ raw: 'cancel' })]);
    expect(fuzzy.map((f: { raw: string }) => f.raw)).toEqual(['10C', 'cancel']);
  });
  it('ejaan customer yang paling sering dipakai', () => {
    const c = canonicalCustomers([{ customer: 'sjm' }, { customer: 'SJM' }, { customer: 'SJM' }]);
    expect(c.get('sjm')).toBe('SJM');
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
