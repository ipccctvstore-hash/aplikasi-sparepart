// Format angka, tanggal, dan waktu. Semua "hari" memakai zona waktu Asia/Jakarta.
export const MN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

export function fmtDate(iso?: string | null): string {
  if (!iso) return '-';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d} ${MN[+m - 1]} ${y}`;
}
export const fmtTime = (t?: string | null) => (t ? t.slice(0, 5).replace(':', '.') : '');
export const fmt = (n: number) => Math.round(n).toLocaleString('id-ID');
/** Angka bergaya Indonesia: titik ribuan, koma desimal. */
export const rp = (v: unknown): number => parseFloat(String(v ?? '').replace(/\./g, '').replace(',', '.')) || 0;
/** Desimal: koma atau titik dianggap desimal. */
export const dec = (v: unknown): number => parseFloat(String(v ?? '').replace(',', '.')) || 0;
/** Satu desimal, koma sebagai pemisah. */
export const nf = (v: number): string => String(Math.round(v * 10) / 10).replace('.', ',');
export const leadTxt = (v: number): string => (!(v > 0) ? 'langsung' : v < 1 ? '±' + Math.round(v * 30) + ' hari' : nf(v) + ' bulan');

/** Lama datang untuk tampilan: kisaran yang diketik pemilik ("6-12 bulan") kalau ada, selain itu angka yang dipakai rumus. */
export const leadShow = (note: string | null | undefined, v: number): string => (note && note.trim() ? note.trim() : leadTxt(v));

const pad2 = (n: number) => String(n).padStart(2, '0');

/** Tanggal hari ini di Jakarta, format YYYY-MM-DD. */
export function todayWib(now: Date = new Date()): string {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  return p; // en-CA menghasilkan YYYY-MM-DD
}
export function addDays(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export function daysBetween(a: string, b: string): number {
  return Math.round((new Date(b + 'T00:00:00Z').getTime() - new Date(a + 'T00:00:00Z').getTime()) / 864e5);
}
export const ageOf = (iso: string, today = todayWib()) => daysBetween(iso, today);
export const agoTxt = (n: number) => (n <= 0 ? 'hari ini' : n === 1 ? 'kemarin' : n + ' hari lalu');

/** Awal dan akhir bulan (month 1-12). */
export function monthBounds(year: number, month: number): [string, string] {
  const from = `${year}-${pad2(month)}-01`;
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return [from, `${year}-${pad2(month)}-${pad2(last)}`];
}
export function monthLabel(year: number, month: number): string {
  return `${MN[month - 1]} ${year}`;
}
/** Daftar bulan mundur dari bulan ini, untuk pilihan periode. */
export function recentMonths(count: number, today = todayWib()): { year: number; month: number; key: string; label: string }[] {
  let y = +today.slice(0, 4), m = +today.slice(5, 7);
  const out = [];
  for (let i = 0; i < count; i++) {
    out.push({ year: y, month: m, key: `${y}-${pad2(m)}`, label: monthLabel(y, m) });
    m--; if (m === 0) { m = 12; y--; }
  }
  return out;
}

export type Range = { from: string; to: string };
export const normRange = (f: string, t: string): [string, string] => (f && t && f > t ? [t, f] : [f, t]);

export function periodRange(p: string, today = todayWib()): [string, string] {
  if (p === 'today') return [today, today];
  if (p === 'yest') { const y = addDays(today, -1); return [y, y]; }
  if (p === '7') return [addDays(today, -6), today];
  if (p === 'month') return [today.slice(0, 8) + '01', today];
  if (p === 'lastm') {
    const y = +today.slice(0, 4), m = +today.slice(5, 7);
    const [f, t] = monthBounds(m === 1 ? y - 1 : y, m === 1 ? 12 : m - 1);
    return [f, t];
  }
  return ['', ''];
}
export const PLAB: Record<string, string> = { today: 'Hari ini', yest: 'Kemarin', '7': '7 hari terakhir', month: 'Bulan ini', lastm: 'Bulan lalu', all: 'Semua' };
export function rangeLabel(f: string, t: string, today = todayWib()): string {
  [f, t] = normRange(f, t);
  for (const k of Object.keys(PLAB)) { const r = periodRange(k, today); if (r[0] === f && r[1] === t) return PLAB[k]; }
  return f && t ? fmtDate(f) + ' sampai ' + fmtDate(t) : f ? 'sejak ' + fmtDate(f) : t ? 'sampai ' + fmtDate(t) : 'Semua';
}
