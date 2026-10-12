// Hitungan PO dan banding yang murni (tanpa database), dipakai di tampilan.
import { dec, rp } from './format';

export type Cur = 'IDR' | 'USD' | 'SGD' | 'CNY';

/** Harga per pcs dalam rupiah untuk satu baris PO. IDR: harga sudah rupiah. Valuta asing: harga x kurs perkiraan. */
export function lineUnit(currency: Cur, price: number | null | undefined, kurs: number | null | undefined): number {
  const p = Number(price) || 0;
  return currency === 'IDR' ? p : p * (Number(kurs) || 0);
}

/** Nilai valuta asing barang dalam satu pengiriman: jumlah qty x harga. */
export function shipForeignValue(items: { qty: number; price: number | null }[]): number {
  return items.reduce((a, i) => a + i.qty * (Number(i.price) || 0), 0);
}
/** Kurs efektif = total rupiah invoice / nilai valuta asing di pengiriman itu. 0 kalau belum bisa dihitung. */
export function effKurs(totalRupiah: number | null | undefined, foreignValue: number): number {
  const t = Number(totalRupiah) || 0;
  return foreignValue > 0 && t > 0 ? t / foreignValue : 0;
}

/** Status baris PO untuk tampilan. */
export function lineStatus(qty: number, sent: number, recv: number): [string, string] {
  if (recv >= qty) return ['Diterima semua', 'p-teal'];
  if (recv > 0) return ['Diterima sebagian', 'p-blue'];
  if (sent >= qty) return ['Terkirim semua', 'p-blue'];
  if (sent > 0) return ['Terkirim sebagian', 'p-amber'];
  return ['Belum dikirim', 'p-grey'];
}

export type CmpCell = { quote: number | null; ready: boolean } | undefined;
/** Harga rupiah per pcs satu sel banding. IDR: PL x (1 - diskon/100); valuta asing: harga x kurs. 0 kalau belum bisa dihitung. */
export function cellRupiah(cell: CmpCell, currency: Cur, pl: number | null | undefined, kurs: number): number {
  if (!cell || cell.quote === null || cell.quote === undefined) return 0;
  if (currency === 'IDR') return pl && pl > 0 ? pl * (1 - Number(cell.quote) / 100) : 0;
  return Number(cell.quote) * (kurs || 0);
}
/** Supplier termurah yang ready untuk satu produk. */
export function cheapest(cells: { supplierId: number; value: number; ready: boolean }[]): number | null {
  let best: number | null = null, bv = Infinity;
  for (const c of cells) if (c.ready && c.value > 0 && c.value < bv) { bv = c.value; best = c.supplierId; }
  return best;
}
/** Diskon efektif (%) dari harga rupiah terhadap PL, untuk supplier valuta asing. */
export const effDiscount = (pl: number | null | undefined, value: number): number | null => (pl && pl > 0 && value > 0 ? (1 - value / pl) * 100 : null);

/** Hasil "Jadi dikirim/diterima" di dialog catat: base + tambahan dari max. */
export function resultText(base: number, add: string, max: number): { text: string; over: boolean } {
  const a = Math.max(0, Math.round(rp(add || 0)));
  if (!a) return { text: '-', over: false };
  return base + a > max ? { text: 'Melebihi sisa', over: true } : { text: `${base + a} dari ${max}`, over: false };
}
export { dec };
