// Logika murni impor Excel riwayat request (tanpa database), supaya bisa diuji.
import crypto from 'node:crypto';

export const SYNONYMS = {
  date: ['tanggal', 'tgl', 'date', 'tanggalrequest', 'tglrequest', 'waktu'],
  customer: ['customer', 'cust', 'pelanggan', 'namacustomer', 'konsumen', 'nama', 'toko', 'bengkel'],
  sku: ['partnumber', 'partno', 'part', 'pn', 'nopart', 'kodepart', 'kodebarang', 'sku', 'kode', 'noparts', 'tipe', 'type'],
  qty: ['qty', 'jumlah', 'jml', 'pcs', 'quantity', 'banyaknya'],
  name: ['namabarang', 'namapart', 'deskripsi', 'description', 'barang', 'item', 'namaproduk', 'produk'],
  note: ['catatan', 'keterangan', 'note', 'ket', 'notes'],
};
const squash = s => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

/** Cari baris judul (15 baris pertama). Mengembalikan { row, cols } atau null; `override` = pemetaan manual {field: 'Judul kolom'}. */
export function findHeader(rows, override = {}) {
  let best = null;
  for (let r = 0; r < Math.min(rows.length, 15); r++) {
    const cells = rows[r] ?? [];
    const cols = {};
    for (const [field, label] of Object.entries(override)) {
      const i = cells.findIndex(c => squash(c) === squash(label));
      if (i >= 0) cols[field] = i;
    }
    cells.forEach((c, i) => {
      const k = squash(c);
      if (!k) return;
      for (const [field, list] of Object.entries(SYNONYMS)) if (cols[field] === undefined && list.includes(k)) cols[field] = i;
    });
    const score = Object.keys(cols).length;
    if (cols.sku !== undefined && (!best || score > best.score)) best = { row: r, cols, score };
  }
  return best;
}

export function parseDate(v, today = new Date()) {
  if (v === null || v === undefined || v === '') return null;
  let y, m, d;
  if (v instanceof Date) { if (isNaN(v)) return null; y = v.getUTCFullYear(); m = v.getUTCMonth() + 1; d = v.getUTCDate(); }
  else if (typeof v === 'number') { const dt = new Date(Math.round((v - 25569) * 864e5)); y = dt.getUTCFullYear(); m = dt.getUTCMonth() + 1; d = dt.getUTCDate(); }
  else {
    const s = String(v).trim();
    let x = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
    if (x) { y = +x[1]; m = +x[2]; d = +x[3]; }
    else if ((x = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/))) { d = +x[1]; m = +x[2]; y = +x[3]; if (y < 100) y += 2000; }
    else return null;
  }
  if (!(y >= 2015 && m >= 1 && m <= 12 && d >= 1 && d <= 31)) return null;
  const iso = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  if (new Date(iso + 'T00:00:00Z').getUTCDate() !== d) return null;       // 31 Feb dan sejenisnya
  const t = new Date(today.getTime() + 7 * 3600e3).toISOString().slice(0, 10);
  return iso > t ? null : iso;
}

export function parseQty(v) {
  if (v === null || v === undefined || v === '') return 1;
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/,/g, '.').match(/\d+(?:\.\d+)?/)?.[0] ?? '');
  return Number.isFinite(n) && n >= 1 ? Math.round(n) : 1;
}

const SKU_RE = /^[A-Z0-9][A-Z0-9\-./]{3,24}$/;
export function normSku(v) {
  const s = String(v ?? '').toUpperCase().replace(/\s+/g, '').trim();
  return SKU_RE.test(s) && /\d/.test(s) ? s : null;
}
export const normCustomer = v => String(v ?? '').replace(/\s+/g, ' ').trim();

/** Ubah isi satu sheet jadi baris terstruktur + daftar baris yang dilewati. */
export function extractRows(rows, sheetName, override = {}, today = new Date()) {
  const h = findHeader(rows, override);
  const out = { sheet: sheetName, header: h, rows: [], skipped: [] };
  if (!h) return out;
  const { cols } = h;
  const missing = ['date', 'customer'].filter(f => cols[f] === undefined);
  if (missing.length) { out.missing = missing; return out; }
  for (let r = h.row + 1; r < rows.length; r++) {
    const line = rows[r] ?? [];
    if (line.every(c => c === null || c === undefined || String(c).trim() === '')) continue;
    const at = f => (cols[f] === undefined ? undefined : line[cols[f]]);
    const where = `${sheetName} baris ${r + 1}`;
    const date = parseDate(at('date'), today), customer = normCustomer(at('customer')), sku = normSku(at('sku'));
    if (!date) { out.skipped.push({ where, reason: 'tanggal kosong, salah format, atau di masa depan', raw: String(at('date') ?? '') }); continue; }
    if (!customer) { out.skipped.push({ where, reason: 'nama customer kosong', raw: String(at('sku') ?? '') }); continue; }
    if (!sku) { out.skipped.push({ where, reason: 'part number tidak terbaca', raw: String(at('sku') ?? '') }); continue; }
    out.rows.push({ where, date, customer, sku, qty: parseQty(at('qty')), name: String(at('name') ?? '').trim(), note: String(at('note') ?? '').trim() });
  }
  return out;
}

/** Satu request = satu customer pada satu hari. SKU ganda di hari yang sama: qty terbesar. */
export function groupRequests(rows) {
  const g = new Map();
  for (const r of rows) {
    const key = `${r.customer.toLowerCase()}|${r.date}`;
    const e = g.get(key) ?? { customer: r.customer, date: r.date, items: new Map() };
    const cur = e.items.get(r.sku);
    e.items.set(r.sku, { sku: r.sku, qty: Math.max(cur?.qty ?? 0, r.qty), name: cur?.name || r.name, note: cur?.note || r.note });
    g.set(key, e);
  }
  return [...g.values()].map(e => ({ ...e, items: [...e.items.values()].sort((a, b) => a.sku.localeCompare(b.sku)) }));
}

/** Kunci idempotensi: sama isinya -> sama kuncinya, jadi impor ulang tidak menggandakan. */
export function clientKey(group) {
  const h = crypto.createHash('sha1').update(`impor|${group.customer.toLowerCase()}|${group.date}|${group.items.map(i => i.sku + ':' + i.qty).join(',')}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

const simple = s => s.toLowerCase().replace(/\b(pt|cv|ud|toko|tk|bengkel|bkl|motor|mobil|auto|autо)\b/g, ' ').replace(/[^a-z0-9]/g, '');
function lev(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
/** Pasangan nama customer yang mirip, untuk digabung manual lewat aplikasi (tidak digabung otomatis). */
export function similarCustomers(names) {
  const list = [...new Set(names)].map(n => ({ n, s: simple(n) })).filter(x => x.s.length >= 3);
  const out = [];
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const a = list[i], b = list[j];
    if (a.n.toLowerCase() === b.n.toLowerCase()) continue;
    const lim = Math.min(a.s.length, b.s.length) >= 9 ? 2 : Math.min(a.s.length, b.s.length) >= 5 ? 1 : 0;
    if (a.s === b.s || lev(a.s, b.s) <= lim || (a.s.length >= 5 && (a.s.includes(b.s) || b.s.includes(a.s)) && Math.abs(a.s.length - b.s.length) <= 4)) out.push([a.n, b.n]);
  }
  return out;
}
