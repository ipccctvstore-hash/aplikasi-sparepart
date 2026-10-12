'use client';
import { useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { getSettings, notifyChanged, rpc } from '@/lib/db';
import { fmtDate } from '@/lib/format';
import { ST_CLS } from '@/lib/types';
import { Btn, ErrorBox, Pill, Rule, SearchBox, Seg, SortTable, msg, useConfirm, useLoad, useToast } from '@/components/ui';
import { FilterButton } from '@/components/Filters';
import { defaultLb, lbDates, useOnDataChanged, useSessionState } from '@/components/hooks';
import type { LbParams } from '@/components/hooks';
import { useProductDialogs } from '@/components/ProductDialogs';

type Row = { sku: string; name: string; stock: number; low_from: number | null; low_since: string | null; qty_wait: number; qty_ship: number; asked: number; sold: number; status: string; hidden: boolean; no_stock_at: string | null; no_stock_by: string | null };

export default function MenipisPage() {
  const dlg = useProductDialogs(), confirm = useConfirm(), toast = useToast();
  const [lb] = useSessionState<LbParams>('lb', defaultLb());
  const [view, setView] = useState<'aktif' | 'hide'>('aktif');
  const [q, setQ] = useState('');
  const [fStok, setFStok] = useState('Semua');
  const [fPo, setFPo] = useState('Semua');
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [err, setErr] = useState<string | null>(null);
  const { from, to } = lbDates(lb);
  const { data, error, loading, reload } = useLoad(async () => {
    const st = await getSettings();
    return (await rpc<Row[]>('list_menipis', { p_from: from, p_to: to, p_th: lb.th ?? st.ask_threshold, p_cover: lb.cover ?? st.cover_months }))
      .map(r => ({ ...r, stock: +r.stock, qty_wait: +r.qty_wait, qty_ship: +r.qty_ship, asked: +r.asked, sold: +r.sold }));
  }, [from, to, lb.th, lb.cover]);
  useOnDataChanged(reload);

  const all = data ?? [];
  const act = all.filter(r => !r.hidden), hid = all.filter(r => r.hidden);
  const hv = view === 'hide', ql = q.toLowerCase();
  const list = (hv ? hid : act).filter(r => (fStok === 'Semua' || String(r.stock) === fStok)
    && (fPo === 'Semua' || (fPo === 'Ada' ? r.qty_wait + r.qty_ship > 0 : r.qty_wait + r.qty_ship === 0))
    && (r.sku.toLowerCase().includes(ql) || r.name.toLowerCase().includes(ql)));
  const picked = list.filter(r => sel.has(r.sku));
  const allSel = list.length > 0 && picked.length === list.length;
  const noPo = (r: Row) => r.qty_wait + r.qty_ship === 0;

  async function mark() {
    const n = picked.length; if (!n) return;
    if (!(await confirm({ title: hv ? 'Kembalikan ke daftar' : 'Tidak di stok lagi', ok: 'Ya, lanjutkan',
      msg: hv ? `Kembalikan ${n} produk ke daftar Perlu perhatian?` : `Tandai ${n} produk sebagai tidak di-stok lagi?`,
      detail: hv ? '' : 'Produk pindah ke tab sebelah dan tidak dihitung di badge menu. Bisa dikembalikan kapan saja.' }))) return;
    try {
      const me = (await supabase().auth.getUser()).data.user?.id;
      const { error } = await supabase().from('products').update(hv ? { no_stock_at: null, no_stock_by: null } : { no_stock_at: new Date().toISOString(), no_stock_by: me }).in('sku', picked.map(r => r.sku));
      if (error) throw error;
      toast(hv ? `${n} produk dikembalikan` : `${n} produk ditandai tidak di-stok lagi`);
      setSel(new Set()); notifyChanged(); reload();
    } catch (e) { setErr(msg(e)); }
  }
  const toggle = (sku: string) => setSel(s => { const n = new Set(s); if (n.has(sku)) n.delete(sku); else n.add(sku); return n; });

  return (
    <>
      <div className="top"><div><h1>Stok Menipis</h1><p className="sub">Stok turun jadi 1 atau 0. Hilang otomatis kalau stok naik lagi ke 2 atau lebih.</p></div></div>
      <div className="stats">
        <div className="stat"><span className="muted">Stok menipis</span><b>{act.length}</b></div>
        <div className="stat"><span className="muted">Stok 0</span><b style={{ color: 'var(--redink)' }}>{act.filter(r => r.stock === 0).length}</b></div>
        <div className="stat"><span className="muted">Stok 1</span><b style={{ color: 'var(--amberink)' }}>{act.filter(r => r.stock === 1).length}</b></div>
        <div className="stat"><span className="muted">Belum ada PO</span><b>{act.filter(noPo).length}</b></div>
        <div className="stat"><span className="muted">Tidak di-stok lagi</span><b style={{ color: 'var(--mute)' }}>{hid.length}</b></div>
      </div>
      <div className="toolbar">
        <Seg label="Tampilan daftar" value={view} options={[['aktif', `Perlu perhatian (${act.length})`], ['hide', `Tidak di-stok lagi (${hid.length})`]]} onChange={v => { setView(v); setSel(new Set()); }} />
        <SearchBox id="mfq" value={q} onChange={setQ} placeholder="Cari part number atau nama" label="Cari produk" />
        <FilterButton open={open} count={(fStok !== 'Semua' ? 1 : 0) + (fPo !== 'Semua' ? 1 : 0)} onClick={() => setOpen(o => !o)} />
      </div>
      {open && (
        <div className="fpanel"><div className="fgrid">
          <div className="field"><label htmlFor="mf-st">Stok sekarang</label><select id="mf-st" value={fStok} onChange={e => setFStok(e.target.value)}>{['Semua', '0', '1'].map(x => <option key={x}>{x}</option>)}</select></div>
          <div className="field"><label htmlFor="mf-po">PO</label><select id="mf-po" value={fPo} onChange={e => setFPo(e.target.value)}><option value="Semua">Semua</option><option value="Ada">Sudah ada di PO</option><option value="Belum">Belum ada PO</option></select></div>
        </div><div className="ffoot"><Btn sm variant="alt" onClick={() => { setFStok('Semua'); setFPo('Semua'); }}>Reset filter</Btn></div></div>
      )}
      <Rule title="Cara kerja daftar ini"><p style={{ margin: '4px 0 8px' }}><b>Masuk</b>: stok turun dari 2 atau lebih ke 1 atau 0.<br /><b>Keluar</b>: stok naik lagi ke 2 atau lebih.<br /><b>Tidak di stok lagi</b>: pindah ke tab sebelah dan tidak dihitung di badge menu.<br />Terjual diambil dari invoice Jurnal, periodenya mengikuti filter bulan di List Barang.</p></Rule>
      <ErrorBox error={err || error} />
      <div className={`selbar ${picked.length ? 'on' : ''}`}>
        <span>{picked.length ? <><b>{picked.length}</b> dari {list.length} produk dicentang</> : <span className="muted">Centang produk di tabel, lalu klik tombol di kanan.</span>}</span>
        <Btn variant={hv ? 'alt' : ''} icon={hv ? 'undo' : 'ban'} disabled={!picked.length} onClick={mark}>{`${hv ? 'Kembalikan ke Daftar' : 'Tandai Tidak di Stok Lagi'} (${picked.length})`}</Btn>
      </div>
      <SortTable<Row> minWidth={1350} rows={list} rowKey={r => r.sku} onRow={r => dlg.detail(r.sku)} empty={loading ? 'Memuat...' : hv ? 'Belum ada produk yang ditandai tidak di-stok lagi.' : 'Tidak ada produk yang cocok. Daftar terisi otomatis saat sync stok menurunkan stok produk menjadi 1 atau 0.'}
        cols={[
          { key: 'chk', nosort: true, style: { width: '1%' }, cls: '', label: <input type="checkbox" checked={allSel} disabled={!list.length} aria-label="Pilih semua produk di daftar ini" onChange={e => setSel(e.target.checked ? new Set(list.map(r => r.sku)) : new Set())} onClick={e => e.stopPropagation()} />,
            render: r => <span style={{ display: 'block', textAlign: 'center' }} onClick={e => e.stopPropagation()}><input type="checkbox" checked={sel.has(r.sku)} aria-label={`Pilih ${r.sku}`} onChange={() => toggle(r.sku)} /></span> },
          { key: 'sku', label: 'Part number', cls: 'mono', sort: r => r.sku, render: r => r.sku },
          { key: 'name', label: 'Nama barang', cls: 'pname', sort: r => r.name, render: r => r.name || <span className="muted">-</span> },
          { key: 'stock', label: 'Stok sekarang', sort: r => r.stock, render: r => <Pill cls={r.stock === 0 ? 'p-red' : 'p-amber'}>{r.stock}</Pill> },
          { key: 'from', label: 'Turun dari', sort: r => r.low_from, render: r => r.low_from ?? '-' },
          { key: 'since', label: 'Sejak', sort: r => r.low_since, render: r => fmtDate(r.low_since) },
          { key: 'wait', label: 'Di PO (menunggu kirim)', sort: r => r.qty_wait, render: r => r.qty_wait },
          { key: 'ship', label: 'Proses kirim', sort: r => r.qty_ship, render: r => r.qty_ship },
          { key: 'asked', label: 'Ditanya', sort: r => r.asked, render: r => <b>{r.asked}</b> },
          { key: 'sold', label: 'Terjual (invoice Jurnal)', sort: r => r.sold, render: r => <b>{r.sold}</b> },
          { key: 'st', label: 'Status', sort: r => r.status, render: r => <Pill cls={ST_CLS[r.status]}>{r.status}</Pill> },
          ...(hv ? [{ key: 'by', label: 'Ditandai', render: (r: Row) => <span className="muted">{r.no_stock_at ? `${r.no_stock_by ?? ''}, ${fmtDate(new Date(r.no_stock_at).toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' }))}` : ''}</span>, nosort: true }] : []),
        ]} />
      <p className="muted" style={{ margin: 0 }}>{list.length} produk. Klik baris untuk melihat detail produk.</p>
    </>
  );
}
