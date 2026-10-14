// Logika murni impor Excel riwayat request (tanpa database), supaya bisa diuji.
import crypto from 'node:crypto';

export const SYNONYMS = {
  date: ['tanggal', 'tgl', 'date', 'tanggalrequest', 'tglrequest', 'waktu'],
  customer: ['customer', 'cust', 'pelanggan', 'namacustomer', 'konsumen', 'nama', 'toko', 'bengkel'],
  handle: ['handle', 'handler', 'pic', 'petugas'],
  sku: ['partnumber', 'partno', 'part', 'pn', 'nopart', 'kodepart', 'kodebarang', 'sku', 'kode', 'noparts', 'tipe', 'type'],
  qty: ['qty', 'jumlah', 'jml', 'pcs', 'quantity', 'banyaknya'],
  name: ['namabarang', 'namapart', 'deskripsi', 'description', 'barang', 'item', 'namaproduk', 'produk', 'namamobilrangkanamabarang', 'namamobilnamabarang'],
  note: ['catatan', 'keterangan', 'note', 'ket', 'notes'],
  supplier: ['suplier', 'supplier', 'pemasok'],
  disc: ['diskon', 'disc', 'discount'],
  pl: ['pl', 'pricelist', 'hargapl'],
};
const squash = s => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
const pad = n => String(n).padStart(2, '0');
const isoOf = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
const validYmd = (y, m, d) => m >= 1 && m <= 12 && d >= 1 && new Date(Date.UTC(y, m - 1, d)).getUTCDate() === d;
const isEmpty = v => v === null || v === undefined || String(v).trim() === '';

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

// ---------- tanggal ----------
/** Baca nilai sel jadi {y,m,d} tanpa menilai kewajarannya (tahun boleh aneh), atau null. */
export function rawDate(v) {
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
  if (!(m >= 1 && m <= 12 && d >= 1 && d <= 31)) return null;
  return { y, m, d };
}

export function parseDate(v, today = new Date()) {
  const r = rawDate(v);
  if (!r || !(r.y >= 2015) || !validYmd(r.y, r.m, r.d)) return null;     // 31 Feb dan sejenisnya
  const iso = isoOf(r.y, r.m, r.d);
  const t = new Date(today.getTime() + 7 * 3600e3).toISOString().slice(0, 10);
  return iso > t ? null : iso;
}

const MONTHS = { januari: 1, jan: 1, februari: 2, feb: 2, pebruari: 2, maret: 3, mar: 3, april: 4, apr: 4, mei: 5, juni: 6, jun: 6, juli: 7, jul: 7, agustus: 8, agu: 8, agt: 8, aug: 8, september: 9, sep: 9, sept: 9, oktober: 10, okt: 10, oct: 10, november: 11, nov: 11, nop: 11, desember: 12, des: 12, dec: 12 };
/** Nama sheet bulan ("OKTOBER", "Mar") -> nomor bulan, atau null. */
export const sheetMonth = name => MONTHS[squash(name)] ?? null;
const dayNo = iso => Math.round(Date.parse(iso + 'T00:00:00Z') / 864e5);
const isoFromDay = n => new Date(n * 864e5).toISOString().slice(0, 10);

/**
 * Tentukan tanggal tiap sel tanggal di satu sheet. Kalau nama sheet adalah bulan, tanggal yang bulan/tahunnya
 * menyimpang dari sheet (salah ketik, mis. 2025 padahal 2026, atau 09-24 di sheet Juli) diperbaiki dan dicatat di `fixes`.
 * cells: [{ r, v }] urut dari atas. Hasil: Map r -> iso|null.
 */
export function resolveDates(cells, sheetName, today = new Date()) {
  const res = new Map(), fixes = [];
  const parsed = cells.map(c => ({ ...c, p: rawDate(c.v) }));
  const years = new Map();
  parsed.forEach(c => { if (c.p && c.p.y >= 2015) years.set(c.p.y, (years.get(c.p.y) ?? 0) + 1); });
  const modalYear = [...years.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const mo = sheetMonth(sheetName);
  const t = new Date(today.getTime() + 7 * 3600e3).toISOString().slice(0, 10);
  const final = iso => (iso && iso > t ? null : iso);
  const good = c => c.p && modalYear && mo && c.p.y === modalYear && c.p.m === mo && validYmd(c.p.y, c.p.m, c.p.d);
  if (!mo || !modalYear) {                      // sheet bukan nama bulan: perilaku sederhana, tanpa perbaikan
    parsed.forEach(c => res.set(c.r, parseDate(c.v, today)));
    return { map: res, fixes };
  }
  let prev = null;
  parsed.forEach((c, i) => {
    let iso = null, reason = null;
    if (good(c)) iso = isoOf(c.p.y, c.p.m, c.p.d);
    else if (!c.p) reason = 'tidak terbaca';
    else {
      const next = parsed.slice(i + 1).find(good);
      const nextIso = next ? isoOf(next.p.y, next.p.m, next.p.d) : null;
      const cand = validYmd(modalYear, mo, c.p.d) ? isoOf(modalYear, mo, c.p.d) : null;
      if (cand && (!prev || cand >= prev) && (!nextIso || cand <= nextIso)) { iso = cand; reason = c.p.m === mo ? 'tahun diperbaiki' : 'bulan diperbaiki'; }
      else if (prev && nextIso) { iso = dayNo(nextIso) - dayNo(prev) === 2 ? isoFromDay(dayNo(prev) + 1) : prev; reason = 'tebakan (urutan tanggal)'; }
      else if (prev || nextIso) { iso = prev ?? nextIso; reason = 'tebakan (urutan tanggal)'; }
      else reason = 'tidak bisa diperbaiki';
    }
    iso = final(iso);
    if (iso) prev = iso;
    res.set(c.r, iso);
    if (reason) fixes.push({ r: c.r, from: c.v instanceof Date ? c.v.toISOString().slice(0, 10) : String(c.v), to: iso ?? '', reason });
  });
  return { map: res, fixes };
}

// ---------- qty, part number ----------
export function parseQty(v) {
  if (v === null || v === undefined || v === '') return 1;
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/,/g, '.').match(/\d+(?:\.\d+)?/)?.[0] ?? '');
  return Number.isFinite(n) && n >= 1 ? Math.round(n) : 1;
}

const SKU_RE = /^[A-Z0-9][A-Z0-9\-./]{3,40}$/;
export function normSku(v) {
  const s = String(v ?? '').toUpperCase().replace(/\s+/g, '').trim();
  if (!SKU_RE.test(s) || !/\d/.test(s)) return null;
  if (/^\d+(PCS?|SET|BH|BIJI|UNIT)$/.test(s)) return null;      // "20pc" bukan part number
  if (/^\d+$/.test(s) && s.length < 6) return null;             // angka pendek (tahun, qty, dll)
  return s;
}
export const normCustomer = v => String(v ?? '').replace(/\s+/g, ' ').trim();

/**
 * Sel part number di Excel sering berisi catatan: "1pc 47731-52190", "13507-0E011 ready 13507-11011",
 * "13041-51021-01/02/03" (varian). Hasil: { skus, qty|null, note } atau null kalau tidak ada part number.
 */
export function parseSkuCell(v) {
  let s = String(v ?? '').trim();
  if (!s) return null;
  let qty = null;
  const lead = s.match(/^(\d{1,4})\s*(?:pcs|pc|biji|bh|set)\b\s*/i);
  if (lead) { qty = +lead[1]; s = s.slice(lead[0].length); }
  const split = s.match(/^(\d{5})(?:\s*-\s*|\s+)([0-9A-Z]{5})(?=$|[^0-9A-Z])/i);   // "44200 30730", "27415 - 30020"
  if (split) s = `${split[1]}-${split[2]}${s.slice(split[0].length)}`;
  const tokens = s.split(/\s+/).filter(Boolean);
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i].replace(/^[(\[]+|[?.,;:)\]]+$/g, '');
    let skus = null;
    const slash = tok.indexOf('/');
    if (slash > 0) {                                          // varian: 13041-51021-01/02/03
      const head = tok.slice(0, slash), dash = head.lastIndexOf('-');
      const parts = [head.slice(dash + 1), ...tok.slice(slash + 1).split('/')].map(x => x.toUpperCase());
      if (dash > 0 && parts.length <= 12 && parts.every(x => /^[A-Z0-9]{1,4}$/.test(x))) {
        const list = parts.map(x => normSku(head.slice(0, dash + 1) + x));
        if (list.every(Boolean)) skus = [...new Set(list)];
      }
    }
    if (!skus) { const one = normSku(tok); if (one) skus = [one]; }
    if (skus) return { skus, qty, note: tokens.filter((_, j) => j !== i).join(' ').trim(), expanded: skus.length > 1 };
  }
  return null;
}

// ---------- supplier, diskon, harga, handle ----------
/** Penulisan di kolom SUPLIER -> nama supplier di database. Kata lain dilaporkan, tidak ditebak. */
export const SUPPLIER_ALIASES = {
  stok: 'Stok sendiri', stokd: 'Stok D',
  tam: 'TAM', tamf: 'TAM', duta: 'Duta', nduta: 'Duta', dt: 'Duta', dut: 'Duta', sum: 'Sum', hui: 'Hui', amin: 'Amin', rt: 'RT', rtd: 'RT D',
  nsm: 'NSM', nsmd: 'NSM D', nnsm: 'NSM', sdm: 'SDM', mit: 'Mitra', nmit: 'Mitra', mitra: 'Mitra', cpl: 'CPL', ncpl: 'CPL', ue: 'UE', nue: 'UE',
  sm: 'SM', sumber: 'Sumber', delwin: 'Delwin', delwind: 'Delwin D', dlwin: 'Delwin', khan: 'Khan', khanmotor: 'Khan', khanmtr: 'Khan',
  ateng: 'Ateng', denso: 'Denso', ndenso: 'Denso', roti: 'Roti', asom: 'Asom', otocitra: 'Otocitra', tyt: 'TYT', ukm: 'UKM', autostar: 'Autostar', capela: 'Capela', capelad: 'Capela D',
};
const NOISE = new Set(['pc', 'pcs', 'set', 'cash', 'nett', 'netto', 'net', 'ada', 'sudah', 'pesan', 'minggu', 'kosong', 'indent', 'n', 'a', 'l', 'd', 'x', 'ppn', 'harga', 'ready', 'double', 'hari', 'bln', 'bulan', 'dari', 'di', 'ke', 'dan', 'no', 'na', 'motor', 'masuk', 'order', 'harus', 'pt', 'toyota', 'proses', 'baru', 'sing', 'cacat', 'karat', 'cancel', 'cek', 'gak', 'ga', 'isi', 'punya', 'siapa', 'min', 'pl', 'jt']);

/** "-30duta", "dt 40", "hui 50, nsm 50", "tam stok", "stok 1pc" -> penawaran supplier (diskon dari PL, persen) + kata tak dikenal. */
export function parseSupplierCell(text, extra = {}) {
  const aliases = { ...SUPPLIER_ALIASES, ...extra };
  const s = String(text ?? '').toLowerCase().replace(/\d+\s*(?:pcs|pc|set|biji|bh)\b/g, ' ');
  const toks = [...s.matchAll(/([a-z]+)|(\d+(?:[.,]\d+)?)/g)].map(m => (m[1] ? { w: m[1] } : { n: parseFloat(m[2].replace(',', '.')) }));
  const used = new Set(), found = new Map(), unknown = [];
  toks.forEach((t, i) => {
    if (!t.w) return;
    const sup = aliases[t.w];
    if (!sup) { if (t.w.length >= 2 && !NOISE.has(t.w)) unknown.push(t.w); return; }
    let q = null;
    const nextFree = toks[i + 1]?.n !== undefined && !used.has(i + 1), prevFree = toks[i - 1]?.n !== undefined && !used.has(i - 1);
    const nextIsNextSupplier = !!(toks[i + 2]?.w && aliases[toks[i + 2].w]);       // "-17capela -15capelaD": angka 15 milik supplier berikutnya
    if (nextFree && !(prevFree && nextIsNextSupplier)) { q = toks[i + 1].n; used.add(i + 1); }
    else if (prevFree) { q = toks[i - 1].n; used.add(i - 1); }
    if (sup === 'Stok sendiri' || sup === 'Stok D' || !(q > 0 && q <= 90)) q = null;
    const old = found.get(sup);
    found.set(sup, q ?? old ?? null);
  });
  return { offers: [...found.entries()].map(([supplier, quote]) => ({ supplier, quote })), unknown };
}

const num = x => parseFloat(String(x).replace(',', '.'));
/** "-25 cash 30" -> {tempo:25, cash:30}; "-25" atau "25.0" -> {25,25} (aturan Jurnal: angka tunggal = tempo dan cash sama). Selain itu null. */
export function parseDiscount(v) {
  if (isEmpty(v)) return null;
  if (typeof v === 'number') { const a = Math.abs(v); return a > 0 && a <= 90 ? { tempo: a, cash: a } : null; }
  const s = String(v).toLowerCase().trim();
  let m = s.match(/^-?\s*(\d+(?:[.,]\d+)?)\s*[,/]?\s*c+a+s+h+\s*-?\s*(\d+(?:[.,]\d+)?)/);
  if (m) { const t = num(m[1]), c = num(m[2]); return t > 0 && t <= 90 && c > 0 && c <= 90 ? { tempo: t, cash: c } : null; }
  m = s.match(/^-?\s*(\d+(?:[.,]\d+)?)\s*indent\b.*$/);                                      // "-9 indent 3-14 hari": diskon 9, sisanya catatan
  if (!m) m = s.match(/^-?\s*(\d+(?:[.,]\d+)?)\s*[,.]?\s*(?:[a-z(][^0-9]*)?$/);       // angka, boleh diikuti catatan: "-9 indent tam", "-30 (harus set)"
  if (m) { const t = num(m[1]); return t > 0 && t <= 90 ? { tempo: t, cash: t } : null; }
  return null;
}

/** Harga PL: 2460000, " 1.418.000 ", "Rp 730.000". Di luar 500..1 miliar dianggap bukan harga. */
export function parseMoney(v) {
  if (isEmpty(v)) return null;
  let n;
  if (typeof v === 'number') n = v;
  else {
    const s = String(v).toLowerCase().replace(/rp\.?|\s/g, '');
    if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) n = parseFloat(s.replace(/\./g, '').replace(',', '.'));
    else if (/^\d+([.,]\d+)?$/.test(s)) n = parseFloat(s.replace(',', '.'));
    else return null;
  }
  return Number.isFinite(n) && n >= 500 && n < 1e9 ? Math.round(n) : null;
}

export const DEFAULT_HANDLES = ['Ali', 'Nabilla', 'Yaw', 'Krisnadi', 'Adji'];
function lev(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
/** Rapikan ejaan handle ("nablila", "nabilla'", "ALI") ke nama resmi; yang tak dikenali ("group 1", "0339:") -> null. */
export function normalizeHandle(raw, known = DEFAULT_HANDLES) {
  const s = String(raw ?? '').toLowerCase().replace(/[^a-z]/g, '');
  if (!s) return null;
  const scored = known.map(k => ({ k, d: lev(s, k.toLowerCase()), lim: k.length >= 7 ? 3 : 1 })).filter(x => x.d <= x.lim).sort((a, b) => a.d - b.d);
  if (!scored.length || (scored[1] && scored[1].d === scored[0].d)) return null;
  return scored[0].k;
}

// ---------- baca satu sheet ----------
const looksVin = s => { const t = s.replace(/\s/g, ''); return /^[A-HJ-NPR-Z0-9]{17}$/i.test(t) && /\d/.test(t) && /[a-z]/i.test(t); };

/** Ubah isi satu sheet jadi baris terstruktur + daftar baris yang dilewati + catatan perbaikan. */
export function extractRows(rows, sheetName, override = {}, today = new Date(), opts = {}) {
  const h = findHeader(rows, override);
  const out = { sheet: sheetName, header: h, rows: [], skipped: [], dateFixes: [], supplierUnknown: [], discBad: [] };
  if (!h) return out;
  const { cols } = h;
  if (cols.date === undefined && isEmpty((rows[h.row] ?? [])[0])) cols.date = 0;      // judul kolom tanggal kosong (mis. ' ')
  const missing = ['date', 'customer'].filter(f => cols[f] === undefined);
  if (missing.length) { out.missing = missing; return out; }
  const at = (line, f) => (cols[f] === undefined ? undefined : line[cols[f]]);

  const dateCells = [];
  for (let r = h.row + 1; r < rows.length; r++) { const v = at(rows[r] ?? [], 'date'); if (!isEmpty(v)) dateCells.push({ r, v }); }
  const { map: dateOf, fixes } = resolveDates(dateCells, sheetName, today);
  fixes.forEach(f => out.dateFixes.push({ where: `${sheetName} baris ${f.r + 1}`, from: f.from, to: f.to, reason: f.reason }));

  let curDate = null, curCustomer = '', curHandle = null;
  for (let r = h.row + 1; r < rows.length; r++) {
    const line = rows[r] ?? [];
    if (line.every(isEmpty)) continue;
    const where = `${sheetName} baris ${r + 1}`;
    if (dateOf.has(r)) curDate = dateOf.get(r);
    const c = normCustomer(at(line, 'customer'));
    if (c) curCustomer = c;
    const hd = at(line, 'handle');
    if (!isEmpty(hd)) curHandle = String(hd).trim();
    const skuRaw = at(line, 'sku');
    if (isEmpty(skuRaw)) continue;                                     // baris tanpa part number (nama mobil, no. rangka, dll) bukan data
    const cell = parseSkuCell(skuRaw);
    if (!cell) { out.skipped.push({ where, reason: 'part number tidak terbaca', raw: String(skuRaw) }); continue; }
    if (!curDate) { out.skipped.push({ where, reason: 'tanggal kosong, salah format, atau di masa depan', raw: String(skuRaw) }); continue; }
    if (!curCustomer) { out.skipped.push({ where, reason: 'nama customer kosong', raw: String(skuRaw) }); continue; }

    const qtyCell = at(line, 'qty');
    const qty = isEmpty(qtyCell) ? (cell.qty ?? 1) : parseQty(qtyCell);
    let name = String(at(line, 'name') ?? '').replace(/\s+/g, ' ').trim();
    if (!name || looksVin(name) || /^[\d.,\s-]+$/.test(name)) name = '';
    const noteCell = String(at(line, 'note') ?? '').trim();
    const note = [cell.note, noteCell].filter(Boolean).join(' | ');

    const supRaw = at(line, 'supplier');
    let offers = [];
    if (!isEmpty(supRaw)) {
      const p = parseSupplierCell(supRaw, opts.aliases);
      offers = p.offers;
      p.unknown.forEach(w => out.supplierUnknown.push({ where, word: w, raw: String(supRaw) }));
    }
    const discRaw = at(line, 'disc');
    const disc = parseDiscount(discRaw);
    if (!isEmpty(discRaw) && !disc && !/^\s*(cash|nett|netto|-?\s*nett)/i.test(String(discRaw))) out.discBad.push({ where, raw: String(discRaw) });
    const pl = parseMoney(at(line, 'pl'));
    const handle = normalizeHandle(curHandle, opts.handles);

    for (const sku of cell.skus) {
      out.rows.push({ where, date: curDate, customer: curCustomer, handle, handleRaw: curHandle ?? '', sku, qty, name, note, raw: String(skuRaw).trim(), offers, disc, pl });
    }
  }
  return out;
}

// ---------- gabung jadi request ----------
/** Satu request = satu customer pada satu hari. SKU ganda di hari yang sama: qty terbesar; penawaran supplier digabung. */
export function groupRequests(rows) {
  const g = new Map();
  for (const r of rows) {
    const key = `${r.customer.toLowerCase()}|${r.date}`;
    const e = g.get(key) ?? { customer: r.customer, date: r.date, items: new Map(), handles: new Map() };
    if (r.handle) e.handles.set(r.handle, (e.handles.get(r.handle) ?? 0) + 1);
    const cur = e.items.get(r.sku);
    const offers = new Map((cur?.offers ?? []).map(o => [o.supplier, o.quote]));
    for (const o of r.offers ?? []) offers.set(o.supplier, o.quote ?? offers.get(o.supplier) ?? null);
    e.items.set(r.sku, { sku: r.sku, qty: Math.max(cur?.qty ?? 0, r.qty), name: cur?.name || r.name, note: cur?.note || r.note, raw: cur?.raw || r.raw, offers: [...offers.entries()].map(([supplier, quote]) => ({ supplier, quote })) });
    g.set(key, e);
  }
  return [...g.values()].map(e => ({
    customer: e.customer, date: e.date,
    handle: [...e.handles.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null,
    items: [...e.items.values()].sort((a, b) => a.sku.localeCompare(b.sku)),
  }));
}

/** Kunci idempotensi: sama isinya -> sama kuncinya, jadi impor ulang tidak menggandakan. */
export function clientKey(group) {
  const h = crypto.createHash('sha1').update(`impor|${group.customer.toLowerCase()}|${group.date}|${group.items.map(i => i.sku + ':' + i.qty).join(',')}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

/** Ejaan customer yang paling sering dipakai untuk tiap nama (tanpa beda huruf besar/kecil). */
export function canonicalCustomers(rows) {
  const by = new Map();
  for (const r of rows) {
    const k = r.customer.toLowerCase();
    const m = by.get(k) ?? new Map();
    m.set(r.customer, (m.get(r.customer) ?? 0) + 1);
    by.set(k, m);
  }
  return new Map([...by.entries()].map(([k, m]) => [k, [...m.entries()].sort((a, b) => b[1] - a[1])[0][0]]));
}

// ---------- produk ----------
/** Data produk (nama, PL, diskon manual) dari riwayat request (yang terbaru menang) + katalog. */
export function summarizeProducts(rows, catalog = new Map()) {
  const m = new Map();
  const ordered = rows.map((r, i) => [r, i]).sort((a, b) => (a[0].date < b[0].date ? -1 : a[0].date > b[0].date ? 1 : a[1] - b[1])).map(x => x[0]);
  const get = sku => m.get(sku) ?? { sku, name: '', pl: null, tempo: null, cash: null, asked: 0, inCatalog: false, inPo: false };
  for (const r of ordered) {
    const e = get(r.sku);
    e.asked++;
    if (r.name) e.name = r.name;
    if (r.pl) e.pl = r.pl;
    if (r.disc) { e.tempo = r.disc.tempo; e.cash = r.disc.cash; }
    m.set(r.sku, e);
  }
  for (const [sku, c] of catalog) {
    const e = get(sku);
    if (!e.name && c.name) e.name = c.name;
    if (e.pl === null && c.pl) e.pl = c.pl;
    e.inCatalog = true; e.inPo = e.inPo || !!c.po;
    m.set(sku, e);
  }
  return m;
}

/** Qty di sel PO: 5, "10C", "dms02 2pc", "5 DMS-12" -> angka; tidak terbaca -> null. */
export function parsePoQty(v) {
  if (typeof v === 'number') return v >= 1 ? Math.round(v) : null;
  if (isEmpty(v)) return null;
  const s = String(v).trim();
  const pc = s.match(/(\d+)\s*pcs?\b/i);
  if (pc) return +pc[1] >= 1 ? +pc[1] : null;
  const lead = s.match(/^(\d+)/);
  return lead && +lead[1] >= 1 ? +lead[1] : null;
}

/**
 * Isi satu sel qty PO -> { qty, sent?, price? } atau null.
 *  "10(102)"        -> qty 10, harga satuan valuta 102 (angka dalam kurung 1-4 digit = harga; 5 digit = nomor referensi, diabaikan)
 *  "11 cancel + 9"  -> dipesan 20, yang jadi dikirim 9 (11 dibatalkan)
 */
export function parsePoCell(v) {
  if (typeof v === 'number') return v >= 1 ? { qty: Math.round(v) } : null;
  if (isEmpty(v)) return null;
  const s = String(v).trim();
  const cancel = s.match(/^(\d+)\s*cancel\w*\s*\+\s*(\d+)/i);
  if (cancel && +cancel[1] + +cancel[2] >= 1) return { qty: +cancel[1] + +cancel[2], sent: +cancel[2] };
  const tagged = s.match(/^[A-Za-z]{1,4}\s+(\d+)\s*\((\d{1,4})\)\s*$/);   // "HS 11 (68)"
  if (tagged && +tagged[1] >= 1) return { qty: +tagged[1], price: +tagged[2] };
  const qty = parsePoQty(s);
  if (!qty) return null;
  const price = s.match(/^\d+\s*\((\d{1,4}(?:[.,]\d+)?)\)\s*$/);
  return price ? { qty, price: parseFloat(price[1].replace(',', '.')) } : { qty };
}

/** Sheet ORDERAN: tiap kolom = satu PO (tanggal, pemesan, nomor PO, amount) dengan qty per part number di bawahnya. */
export function parseOrderan(rows, today = new Date()) {
  const head = rows.slice(0, 5), body = rows.slice(5);
  const pos = [], odd = [], fuzzy = [];
  const width = Math.max(0, ...rows.map(r => r.length));
  for (let j = 1; j < width; j++) {
    const lines = [];
    for (const r of body) {
      const sku = normSku(r[0]);
      if (!sku || isEmpty(r[j])) continue;
      const cell = parsePoCell(r[j]);
      if (typeof r[j] !== 'number') fuzzy.push({ col: j + 1, sku, raw: String(r[j]), qty: cell?.qty ?? '', sent: cell?.sent ?? '', price: cell?.price ?? '' });      // sel berisi teks: hasil bacaan perlu dicek
      if (cell) lines.push({ sku, ...cell }); else odd.push({ col: j + 1, sku, raw: String(r[j]) });
    }
    if (!lines.length) continue;
    const merged = new Map();
    lines.forEach(l => { const m = merged.get(l.sku); merged.set(l.sku, { sku: l.sku, qty: (m?.qty ?? 0) + l.qty, sent: m?.sent !== undefined || l.sent !== undefined ? (m?.sent ?? m?.qty ?? 0) + (l.sent ?? l.qty) : undefined, price: l.price ?? m?.price }); });
    const num = head[2]?.[j], amt = head[3]?.[j];
    pos.push({
      col: j + 1, date: parseDate(head[0]?.[j], today), contact: String(head[1]?.[j] ?? '').trim().toUpperCase(),
      number: isEmpty(num) ? '' : String(num).trim(), amount: typeof amt === 'number' ? amt : null,
      lines: [...merged.values()].map(m => ({ sku: m.sku, qty: m.qty, ...(m.sent !== undefined && m.sent < m.qty ? { sent: m.sent } : {}), ...(m.price ? { price: m.price } : {}) })),
    });
  }
  return { pos, odd, fuzzy };
}

/** Katalog dari file "order dan cek harga": produk yang pernah masuk PO / dicek harga + PL + diskon supplier lokal. sheets: { namaSheet: baris[][] }. */
export function extractCatalog(sheets, aliases = {}) {
  const cat = new Map(), unknown = [];
  const put = (sku, { pl = null, name = '', po = false, offers = [] } = {}) => {
    const s = normSku(sku);
    if (!s) return;
    const e = cat.get(s) ?? { pl: null, name: '', po: false, offers: [] };
    if (pl && !e.pl) e.pl = pl;
    if (name && !e.name) e.name = name;
    e.po = e.po || po;
    for (const o of offers) if (!e.offers.some(x => x.supplier === o.supplier)) e.offers.push(o);
    cat.set(s, e);
  };
  const find = n => Object.entries(sheets).find(([k]) => k.trim().toLowerCase() === n)?.[1] ?? [];
  parseOrderan(find('orderan')).pos.forEach(po => po.lines.forEach(l => put(l.sku, { po: true })));
  find('cek ex-stock').slice(1).forEach((r, i) => {
    const p = isEmpty(r[2]) ? { offers: [], unknown: [] } : parseSupplierCell(r[2], aliases);
    p.unknown.forEach(w => unknown.push({ where: `CEK EX-STOCK baris ${i + 2}`, word: w, raw: String(r[2]) }));
    put(r[0], { pl: parseMoney(r[4]), offers: p.offers.filter(o => o.quote !== null) });
  });
  find('konversi').slice(1).forEach(r => put(r[1], { pl: parseMoney(r[3]) }));
  find('mazda').slice(1).forEach(r => put(r[0], { pl: parseMoney(r[2]), name: String(r[3] ?? '').trim() }));
  find('mitsubishi').slice(1).forEach(r => put(r[2], { pl: parseMoney(r[3]) }));
  const byd = find('byd');
  const models = (byd[0] ?? []).slice(1);
  byd.slice(1).forEach(r => models.forEach((mdl, i) => put(r[i + 1], { name: `${String(r[0] ?? '').trim()} (BYD ${String(mdl ?? '').trim()})` })));
  cat.unknown = unknown;
  return cat;
}

// ---------- customer mirip ----------
const simple = s => s.toLowerCase().replace(/\b(pt|cv|ud|toko|tk|bengkel|bkl|motor|mobil|auto)\b/g, ' ').replace(/[^a-z0-9]/g, '');
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

// ---------- gabung customer yang hanya beda ketikan ----------
const HONOR = new Set(['pak', 'bpk', 'bapak', 'bu', 'ibu', 'mas', 'mbak', 'om', 'koh', 'ko', 'cici', 'ci', 'pt', 'cv', 'ud', 'toko', 'tk', 'bengkel', 'bkl', 'motor', 'mobil', 'auto', 'mr', 'mrs']);
const custWords = n => String(n).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(w => w && !HONOR.has(w) && !(w.length >= 4 && lev(w, 'motor') <= 1));
const custKey = n => String(n).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(' ')
  .filter(w => w && !HONOR.has(w) && !(w.length >= 4 && lev(w, 'motor') <= 1)).join('');
/**
 * Customer yang hanya beda ketikan digabung ke ejaan yang paling sering dipakai: "Budi" = "Pak Budi" = "Budi Motor",
 * "putra jaya" = "putra jya". Angka harus sama (Toko 1 != Toko 2) dan nama yang beda cabang/kota tetap terpisah
 * ("sumber rezeki" != "sumber rezeki PMK"). counts: Map nama -> jumlah pemakaian. Hasil: { map: nama -> nama resmi, groups }.
 */
export function mergeSimilarCustomers(counts) {
  const items = [...counts.entries()].map(([n, c]) => ({ n, c, k: custKey(n) })).sort((a, b) => b.c - a.c || a.n.localeCompare(b.n));
  const reps = [], map = new Map();
  const same = (a, b) => {
    if (a.k.length < 3 || b.k.length < 3 || a.k.replace(/\D/g, '') !== b.k.replace(/\D/g, '')) return false;
    if (a.k === b.k) return true;
    const wa = custWords(a.n), wb = custWords(b.n);       // kode cabang pendek berbeda (PMK vs PRJ) = tempat berbeda, jangan digabung
    if (wa.length === wb.length && wa.some((w, i) => w !== wb[i] && w.length <= 3 && wb[i].length <= 3)) return false;
    const m = Math.min(a.k.length, b.k.length), d = lev(a.k, b.k);
    return (m >= 6 && d <= 1) || (m === 5 && d <= 1 && a.k[0] === b.k[0]) || (m >= 11 && d <= 2);
  };
  for (const it of items) {
    const rep = reps.find(r => same(r, it));
    if (rep) { map.set(it.n, rep.n); rep.members.push(it); } else { reps.push({ ...it, members: [it] }); map.set(it.n, it.n); }
  }
  return { map, groups: reps.filter(r => r.members.length > 1).map(r => r.members.map(m => m.n)) };
}
