'use client';
import { useEffect, useState } from 'react';
import { searchProducts } from '@/lib/db';
import { PN, normSku } from '@/lib/parse';
import type { Product } from '@/lib/types';
import { Btn } from './ui';

/** Cari produk dari List Barang (part number atau nama), atau ketik tipe baru. */
export default function ProductPicker({ onPick, exclude = [], allowNew = true, label = 'Cari produk' }: {
  onPick: (sku: string, p: Product | null) => void; exclude?: string[]; allowNew?: boolean; label?: string;
}) {
  const [q, setQ] = useState('');
  const [list, setList] = useState<Product[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    const t = setTimeout(() => {
      setBusy(true);
      searchProducts(q, 12).then(r => { if (live) setList(r.filter(p => !exclude.includes(p.sku))); }).catch(() => { if (live) setList([]); }).finally(() => { if (live) setBusy(false); });
    }, 250);
    return () => { live = false; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, exclude.join('|')]);
  const typed = normSku(q);
  const isNew = allowNew && PN.test(typed) && typed.match(PN)![0] === typed && !list.some(p => p.sku === typed) && !exclude.includes(typed);
  return (
    <div className="field">
      <label htmlFor="pp-q">{label}</label>
      <input id="pp-q" type="text" placeholder="Ketik part number atau nama barang" value={q} onChange={e => setQ(e.target.value)} autoComplete="off" />
      <div className="checklist" aria-live="polite">
        {busy && list.length === 0 && <span className="muted" style={{ padding: 8 }}>Mencari...</span>}
        {!busy && list.length === 0 && !isNew && <span className="muted" style={{ padding: 8 }}>Tidak ada produk yang cocok.{allowNew ? ' Ketik part number lengkap (contoh 12345-67890) untuk menambah tipe baru.' : ''}</span>}
        {list.map(p => (
          <button key={p.sku} type="button" onClick={() => onPick(p.sku, p)} style={{ display: 'flex', gap: 10, alignItems: 'center', textAlign: 'left', minHeight: 40, padding: '0 8px', border: 0, background: 'transparent', borderRadius: 8, cursor: 'pointer' }}>
            <span className="mono">{p.sku}</span><span className="muted">{p.name || '-'}</span>
          </button>
        ))}
        {isNew && <div style={{ padding: 8 }}><Btn sm variant="alt" icon="plus" onClick={() => onPick(typed, null)}>Tambah tipe baru {typed}</Btn></div>}
      </div>
    </div>
  );
}
