// Membaca chat customer dan nama kategori diskon Jurnal.
export const PN = /[0-9A-Za-z]{5}-[0-9A-Za-z]{5}(?:-[0-9A-Za-z]{2})?/;

export type ParsedLine = { part: string; raw: string; qty: number; note: string };

/** Satu baris chat = satu baris produk. Part number: 5-5 atau 5-5-2 karakter. Qty: "2pc", "2 pcs", "x2". */
export function parseLines(text: string): ParsedLine[] {
  return text.split(/\r?\n/).map(l => l.trim()).filter(Boolean).map(line => {
    const m = line.match(PN);
    const rest = m ? line.replace(m[0], ' ') : line;
    let qty = 1;
    const q = rest.match(/(\d+)\s*pcs?\b/i) || rest.match(/\bx\s*(\d+)\b/i);
    if (q) qty = Math.max(1, parseInt(q[1], 10));
    const note = rest.replace(/(\d+)\s*pcs?\b/i, '').replace(/\bx\s*\d+\b/i, '').replace(/\s+/g, ' ').trim();
    return { part: m ? m[0].toUpperCase() : '', raw: line, qty, note };
  });
}

/** "10" = tempo 10 cash 10; "10 cash 15" = tempo 10 cash 15. Null kalau tidak terbaca. (Sama dengan parse_category di database.) */
export function parseCat(cat?: string | null): { tempo: string; cash: string } | null {
  const m = String(cat ?? '').trim().match(/^(\d+(?:[.,]\d+)?)(?:\s*cash\s*(\d+(?:[.,]\d+)?))?$/i);
  if (!m) return null;
  const f = (x: string) => x.replace(',', '.');
  return { tempo: f(m[1]), cash: f(m[2] || m[1]) };
}

export const normSku = (s: string) => s.trim().toUpperCase();
