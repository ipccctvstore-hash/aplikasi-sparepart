'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { getSettings, getSuppliers, getProducts, notifyChanged, rpc } from '@/lib/db';
import { agoTxt, ageOf, fmt, fmtDate, leadShow, normRange, rangeLabel, todayWib } from '@/lib/format';
import { cellRupiah, cheapest, effDiscount } from '@/lib/po';
import type { Cur } from '@/lib/po';
import { TYPE_CLS } from '@/lib/types';
import type { Product, Supplier } from '@/lib/types';
import { Btn, Dialog, ErrorBox, IconButton, Notice, Pill, SearchBox, SortTable, msg, useConfirm, useLoad, useToast } from '@/components/ui';
import AddProduct from '@/components/AddProduct';
import { FilterButton, RangeBar } from '@/components/Filters';
import { defaultLb, lbDates, useOnDataChanged, useSessionState } from '@/components/hooks';
import type { LbParams } from '@/components/hooks';
import ProductPicker from '@/components/ProductPicker';

export default function Page() { return <Suspense><Banding /></Suspense>; }

function Banding() {
  const sp = useSearchParams();
  const id = sp.get('id');
  return id ? <Detail id={+id} /> : <List fromSaran={sp.get('saran') === '1'} />;
}

/* ===== Daftar banding ===== */
type CmpRow = { id: number; name: string; cmp_date: string; items: { id: number; sku: string; pick_supplier_id: number | null }[]; sups: { supplier_id: number }[]; pos: { id: number }[] };

function List({ fromSaran }: { fromSaran: boolean }) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [range, setRange] = useState({ from: '', to: '' });
  const [fSup, setFSup] = useState('');
  const [fPo, setFPo] = useState('Semua');
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState<null | { preset: boolean }>(fromSaran ? { preset: true } : null);
  const sups = useLoad(getSuppliers, []);
  const [lo, hi] = normRange(range.from, range.to);
  const { data, error, loading, reload } = useLoad(async () => {
    const { data, error } = await supabase().from('comparisons').select('id,name,cmp_date,items:comparison_items(id,sku,pick_supplier_id),sups:comparison_suppliers(supplier_id),pos:purchase_orders(id)').order('id', { ascending: false });
    if (error) throw error;
    return data as unknown as CmpRow[];
  }, []);
  useOnDataChanged(reload);
  const sm = new Map((sups.data ?? []).map(s => [s.id, s]));
  const list = (data ?? []).filter(c => (!lo || c.cmp_date >= lo) && (!hi || c.cmp_date <= hi) && (!fSup || c.sups.some(s => s.supplier_id === +fSup))
    && (fPo === 'Semua' || (fPo === 'Sudah' ? c.pos.length > 0 : c.pos.length === 0))
    && (c.name.toLowerCase().includes(q.toLowerCase()) || c.items.some(i => i.sku.toLowerCase().includes(q.toLowerCase()))));
  return (
    <>
      <div className="top"><div><h1>Banding Harga</h1><p className="sub">Bandingkan harga supplier per produk, pilih order, lalu buat PO per supplier.</p></div><div className="actions"><Btn icon="plus" onClick={() => setCreating({ preset: false })}>Banding Baru</Btn></div></div>
      <div className="toolbar"><SearchBox id="cfq" value={q} onChange={setQ} placeholder="Cari nama banding atau part" label="Cari banding atau part number" />
        <FilterButton open={open} count={(fSup ? 1 : 0) + (fPo !== 'Semua' ? 1 : 0)} onClick={() => setOpen(o => !o)} />
        <Btn sm variant="alt" className="perchip" onClick={() => setOpen(true)}>Periode: <b>{rangeLabel(range.from, range.to)}</b></Btn></div>
      {open && <div className="fpanel"><RangeBar from={range.from} to={range.to} onChange={(f, t) => setRange({ from: f, to: t })} /><div className="fgrid">
        <div className="field"><label htmlFor="cf-sup">Supplier dibandingkan</label><select id="cf-sup" value={fSup} onChange={e => setFSup(e.target.value)}><option value="">Semua</option>{(sups.data ?? []).filter(s => s.type !== 'Stok sendiri').map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
        <div className="field"><label htmlFor="cf-po">PO</label><select id="cf-po" value={fPo} onChange={e => setFPo(e.target.value)}><option value="Semua">Semua</option><option value="Belum">Belum ada PO</option><option value="Sudah">Sudah ada PO</option></select></div>
      </div><div className="ffoot"><Btn sm variant="alt" onClick={() => { setFSup(''); setFPo('Semua'); setRange({ from: '', to: '' }); }}>Reset filter</Btn></div></div>}
      <ErrorBox error={error} />
      <SortTable<CmpRow> minWidth={820} rows={list} rowKey={c => c.id} onRow={c => router.push('/banding?id=' + c.id)} empty={loading ? 'Memuat...' : 'Tidak ada banding yang cocok.'}
        cols={[
          { key: 'n', label: 'Nama', sort: c => c.name, render: c => <b>{c.name}</b> },
          { key: 'd', label: 'Tanggal', sort: c => c.cmp_date, render: c => fmtDate(c.cmp_date) },
          { key: 'p', label: 'Produk', sort: c => c.items.length, render: c => c.items.length },
          { key: 's', label: 'Supplier', nosort: true, render: c => <span className="muted">{c.sups.map(s => sm.get(s.supplier_id)?.name).filter(Boolean).join(', ')}</span> },
          { key: 'k', label: 'Sudah dipilih', render: c => `${c.items.filter(i => i.pick_supplier_id).length} dari ${c.items.length}`, nosort: true },
          { key: 'po', label: 'PO dibuat', sort: c => c.pos.length, render: c => (c.pos.length ? <Pill cls="p-teal">{c.pos.length} PO</Pill> : <Pill>Belum ada</Pill>) },
        ]} />
      {creating && <NewCmp suppliers={(sups.data ?? []).filter(s => s.active && s.type !== 'Stok sendiri')} preset={creating.preset} onClose={() => { setCreating(null); if (fromSaran) router.replace('/banding'); }} onCreated={cid => router.push('/banding?id=' + cid)} />}
    </>
  );
}

function NewCmp({ suppliers, preset, onClose, onCreated }: { suppliers: Supplier[]; preset: boolean; onClose: () => void; onCreated: (id: number) => void }) {
  const confirm = useConfirm(), toast = useToast();
  const [name, setName] = useState(`Banding ${fmtDate(todayWib())}`);
  const [items, setItems] = useState<{ sku: string; qty: number }[]>([]);
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [lb] = useSessionState<LbParams>('lb', defaultLb());
  useEffect(() => {
    if (!preset) return;
    (async () => {
      try {
        const st = await getSettings(); const { from, to } = lbDates(lb);
        const a = { p_from: from, p_to: to, p_th: lb.th ?? st.ask_threshold, p_cover: lb.cover ?? st.cover_months };
        const [need, low] = await Promise.all([
          rpc<{ sku: string; saran: number }[]>('list_barang', { ...a, p_status: 'Perlu PO', p_q: '', p_sort: 'asked', p_dir: 'desc', p_limit: 100, p_offset: 0 }),
          rpc<{ sku: string; hidden: boolean }[]>('list_menipis', a),
        ]);
        const m = new Map<string, number>();
        need.forEach(r => m.set(r.sku, Math.max(1, Number(r.saran))));
        low.filter(r => !r.hidden).forEach(r => { if (!m.has(r.sku)) m.set(r.sku, 1); });
        setItems([...m].map(([sku, qty]) => ({ sku, qty })));
      } catch (e) { setErr(msg(e)); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  async function go() {
    setErr(null);
    if (!name.trim()) { setErr('Isi nama banding.'); return; }
    if (!items.length) { setErr('Pilih minimal satu produk.'); return; }
    if (!sel.size) { setErr('Pilih minimal satu supplier.'); return; }
    if (!(await confirm({ title: 'Banding baru', ok: 'Ya, buat', msg: `Buat banding "${name.trim()}" dengan ${items.length} produk dan ${sel.size} supplier?`, detail: 'Harga dan diskon supplier terisi otomatis dari Daftar Request terakhir.' }))) return;
    setBusy(true);
    try {
      const cid = await rpc<number>('cmp_create', { p_name: name.trim(), p_items: items, p_suppliers: [...sel] });
      toast('Banding dibuat'); notifyChanged(); onCreated(cid);
    } catch (e) { setErr(msg(e)); setBusy(false); }
  }
  return (
    <Dialog wide title="Banding baru" onClose={onClose} footer={<><Btn variant="alt" onClick={onClose}>Batal</Btn><Btn icon="check" disabled={busy} onClick={go}>Buat banding</Btn></>}>
      <ErrorBox error={err} />
      <div className="field"><label htmlFor="n-name">Nama banding</label><input id="n-name" type="text" value={name} onChange={e => setName(e.target.value)} /></div>
      <ProductPicker label="Tambah produk" exclude={items.map(i => i.sku)} onPick={sku => setItems(l => [...l, { sku, qty: 1 }])} />
      {items.length > 0 && <div className="checklist">{items.map((it, i) => (
        <div key={it.sku} style={{ display: 'flex', gap: 10, alignItems: 'center' }}><span className="mono" style={{ flex: 1 }}>{it.sku}</span>
          <label className="muted" htmlFor={`nq-${i}`}>Qty</label><input id={`nq-${i}`} type="text" inputMode="numeric" style={{ width: 70 }} value={it.qty} onChange={e => setItems(l => l.map((x, k) => (k === i ? { ...x, qty: Math.max(1, parseInt(e.target.value, 10) || 1) } : x)))} />
          <IconButton icon="trash" label={`Hapus ${it.sku}`} cls="del sm" onClick={() => setItems(l => l.filter((_, k) => k !== i))} /></div>))}</div>}
      <div className="field"><label>Supplier yang dibandingkan</label><div className="checklist">{suppliers.map(s => (
        <label key={s.id}><input type="checkbox" checked={sel.has(s.id)} onChange={() => setSel(x => { const n = new Set(x); if (n.has(s.id)) n.delete(s.id); else n.add(s.id); return n; })} /><b>{s.name}</b><Pill cls={TYPE_CLS[s.type]}>{s.type}</Pill><span className="muted">{s.currency}</span></label>))}</div></div>
      <p className="muted" style={{ margin: 0 }}>Harga dan diskon supplier terisi otomatis dari Daftar Request terakhir (dengan tanggal cek). Produk lain bisa ditambah nanti lewat tombol + Produk.</p>
    </Dialog>
  );
}

/* ===== Detail banding ===== */
type Item = { id: number; sku: string; qty: number; pick_supplier_id: number | null };
type Price = { item_id: number; supplier_id: number; quote: number | null; ready: boolean; src_date: string | null; src_handle: string | null; manual: boolean };
type CS = { supplier_id: number; kurs: number | null };

function Detail({ id }: { id: number }) {
  const router = useRouter(), confirm = useConfirm(), toast = useToast();
  const sb = supabase();
  const [adding, setAdding] = useState<'prod' | 'sup' | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [kursIn, setKursIn] = useState<Record<number, string>>({});
  const [qtyIn, setQtyIn] = useState<Record<number, string>>({});
  const sups = useLoad(getSuppliers, []);
  const d = useLoad(async () => {
    const [c, it, pr, cs, po] = await Promise.all([
      sb.from('comparisons').select('id,name,cmp_date').eq('id', id).single(),
      sb.from('comparison_items').select('id,sku,qty,pick_supplier_id').eq('cmp_id', id).order('id'),
      sb.from('comparison_prices').select('item_id,supplier_id,quote,ready,src_date,src_handle,manual,item:comparison_items!inner(cmp_id)').eq('item.cmp_id', id),
      sb.from('comparison_suppliers').select('supplier_id,kurs').eq('cmp_id', id).order('supplier_id'),
      sb.from('purchase_orders').select('id,name,supplier_id').eq('comparison_id', id),
    ]);
    for (const r of [c, it, pr, cs, po]) if (r.error) throw r.error;
    const items = (it.data ?? []) as Item[];
    const prods = await getProducts(items.map(x => x.sku));
    const { data: ask } = items.length ? await sb.from('v_demand_day').select('sku').in('sku', items.map(x => x.sku)) : { data: [] as { sku: string }[] };
    const asked = new Map<string, number>(); (ask ?? []).forEach(a => asked.set(a.sku, (asked.get(a.sku) ?? 0) + 1));
    return { cmp: c.data as { id: number; name: string; cmp_date: string }, items, prices: ((pr.data ?? []) as unknown as Price[]).map(p => ({ ...p, quote: p.quote === null ? null : Number(p.quote) })), cs: ((cs.data ?? []) as CS[]).map(x => ({ ...x, kurs: x.kurs === null ? null : Number(x.kurs) })), pos: (po.data ?? []) as { id: number; name: string; supplier_id: number }[], prods, asked };
  }, [id]);
  useOnDataChanged(d.reload);

  const v = d.data;
  if (d.error) return <><Btn sm variant="alt" onClick={() => router.push('/banding')}>&larr; Semua banding</Btn><ErrorBox error={d.error} /></>;
  if (!v || !sups.data) return <p className="muted">Memuat...</p>;
  const sm = new Map(sups.data.map(s => [s.id, s]));
  const cols = v.cs.map(x => ({ s: sm.get(x.supplier_id)!, kurs: x.kurs ?? sm.get(x.supplier_id)!.kurs })).filter(x => x.s);
  const price = (itemId: number, sid: number) => v.prices.find(p => p.item_id === itemId && p.supplier_id === sid);
  const plOf = (p?: Product) => (p?.pl_price && p.pl_price > 0 ? p.pl_price : 0);
  const rupiah = (it: Item, c: { s: Supplier; kurs: number }) => cellRupiah(price(it.id, c.s.id), c.s.currency as Cur, plOf(v.prods.get(it.sku)), c.kurs);
  const bestOf = (it: Item) => cheapest(cols.map(c => ({ supplierId: c.s.id, value: rupiah(it, c), ready: price(it.id, c.s.id)?.ready ?? true })));
  const pickOk = (it: Item) => { const c = cols.find(x => x.s.id === it.pick_supplier_id); const p = c && price(it.id, c.s.id); return !!(c && p && p.ready && rupiah(it, c) > 0); };

  const picks = new Map<number, { n: number; q: number; t: number }>();
  let pickedN = 0, total = 0, totalQty = 0;
  v.items.forEach(it => { if (pickOk(it)) { const c = cols.find(x => x.s.id === it.pick_supplier_id)!; const val = rupiah(it, c) * it.qty; const e = picks.get(c.s.id) ?? { n: 0, q: 0, t: 0 }; e.n++; e.q += it.qty; e.t += val; picks.set(c.s.id, e); pickedN++; total += val; totalQty += it.qty; } });
  const poOf = (sid: number) => v.pos.find(p => p.supplier_id === sid);
  const pending = [...picks.keys()].filter(sid => !poOf(sid));

  async function run(fn: () => PromiseLike<unknown>, ok?: string) {
    setErr(null);
    try { await fn(); if (ok) toast(ok); d.reload(); notifyChanged(); } catch (e) { setErr(msg(e)); }
  }
  const upd = (table: string, patch: object, match: object) => run(async () => { const { error } = await sb.from(table).update(patch).match(match); if (error) throw error; });
  const setQuote = (it: Item, sid: number, val: string) => run(() => rpc('cmp_set_quote', { p_item: it.id, p_supplier: sid, p_quote: val.trim() === '' ? null : Number(val.replace(',', '.')) }));
  const fromLabel = (p?: Price) => {
    if (!p || !p.src_date || p.manual) return null;
    const n = ageOf(p.src_date);
    return <Pill cls={n <= 1 ? 'p-teal' : n <= 7 ? 'p-grey' : 'p-amber'}>Dicek {agoTxt(n)}{p.src_handle ? `, ${p.src_handle}` : ''}</Pill>;
  };
  async function makePo(sid: number) {
    const s = sm.get(sid)!;
    if (!(await confirm({ title: 'Buat PO', ok: 'Ya, buat PO', msg: `Buat PO ke ${s.name}?`, detail: `${picks.get(sid)!.n} jenis produk, total ${picks.get(sid)!.q} pcs. PO dibuat berstatus Draft.` }))) return;
    run(async () => { const pid = await rpc<number>('cmp_make_po', { p_cmp: id, p_supplier: sid }); toast('PO dibuat'); router.push('/po?id=' + pid); });
  }
  async function makeAll() {
    if (!(await confirm({ title: 'Buat PO semua supplier', ok: 'Ya, buat semua', msg: `Buat ${pending.length} PO sekaligus (satu per supplier)?`, detail: 'Semua PO berstatus Draft.' }))) return;
    run(async () => { const n = await rpc<number>('cmp_make_po_all', { p_cmp: id }); toast(`${n} PO dibuat`); }, undefined);
  }
  async function pickAll() { if (!(await confirm({ title: 'Pilih termurah', ok: 'Ya, pilih', msg: 'Pilih supplier termurah (yang ready) untuk semua produk?', detail: 'Pilihan yang sudah ada diganti.' }))) return;
    run(async () => { for (const it of v!.items) { const b = bestOf(it); if (b) { const { error } = await sb.from('comparison_items').update({ pick_supplier_id: b }).eq('id', it.id); if (error) throw error; } } }, 'Termurah dipilih'); }
  async function refresh() { if (!(await confirm({ title: 'Ambil ulang', ok: 'Ya, ambil ulang', msg: 'Ambil ulang harga dari Daftar Request terakhir?', detail: 'Isian yang kamu ketik manual tidak ditimpa.' }))) return;
    run(async () => { const n = await rpc<number>('cmp_prefill', { p_cmp: id }); toast(`${n} isian diperbarui`); }); }
  async function rmSup(s: Supplier) { if (!(await confirm({ danger: true, ok: 'Ya, hapus', title: 'Hapus kolom', msg: `Hapus kolom ${s.name} dari banding ini?` }))) return; run(() => rpc('cmp_remove_supplier', { p_cmp: id, p_supplier: s.id }), 'Kolom dihapus'); }
  async function rmItem(it: Item) { if (!(await confirm({ danger: true, ok: 'Ya, hapus', title: 'Hapus produk', msg: `Hapus ${it.sku} dari banding ini?` }))) return; run(async () => { const { error } = await sb.from('comparison_items').delete().eq('id', it.id); if (error) throw error; }, 'Produk dihapus'); }
  async function delCmp() { if (!(await confirm({ danger: true, ok: 'Ya, hapus', title: 'Hapus banding', msg: `Hapus banding "${v!.cmp.name}"?`, detail: v!.pos.length ? 'PO yang sudah dibuat dari banding ini tidak ikut terhapus.' : '' }))) return;
    const { error } = await sb.from('comparisons').delete().eq('id', id); if (error) { setErr(error.message); return; } toast('Banding dihapus'); notifyChanged(); router.push('/banding'); }

  return (
    <>
      <div className="top"><div><Btn sm variant="alt" onClick={() => router.push('/banding')}>&larr; Semua banding</Btn>
        <h1 style={{ marginTop: 12 }}>{v.cmp.name}</h1>
        <p className="sub">{fmtDate(v.cmp.cmp_date)}. Isi diskon (lokal) atau harga mata uang asing, centang Ready, lalu pilih Order. Hijau = termurah yang ready. Label Dicek = kapan terakhir ditanya di Daftar Request (hijau 1 hari, abu 7 hari, kuning lebih lama).</p></div>
        <div className="actions"><Btn variant="alt" onClick={refresh}>Ambil ulang dari request</Btn><Btn variant="alt" onClick={() => setAdding('prod')}>+ Produk</Btn><Btn variant="alt" onClick={() => setAdding('sup')}>+ Supplier</Btn><Btn variant="alt" onClick={pickAll}>Pilih termurah semua</Btn><Btn disabled={!pending.length} onClick={makeAll}>{`Buat PO semua supplier (${pending.length})`}</Btn><Btn variant="danger" onClick={delCmp}>Hapus banding</Btn></div></div>
      <ErrorBox error={err} />
      <div className="wrap">
        <table style={{ minWidth: 410 + cols.length * 200 }}>
          <thead><tr><th className="sticky" style={{ minWidth: 210 }}>Part number</th><th style={{ minWidth: 280 }}>Nama barang</th><th style={{ minWidth: 110 }}>PL (Jurnal)</th>
            {cols.map(c => (
              <th key={c.s.id} style={{ minWidth: 190 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}><span>{c.s.name}</span><IconButton icon="trash" label={`Hapus kolom ${c.s.name}`} cls="del sm" onClick={() => rmSup(c.s)} /></div>
                <Pill cls={TYPE_CLS[c.s.type]}>{c.s.type}</Pill> <span className="muted">{leadShow(c.s.lead_note, c.s.lead_months)}</span>
                {c.s.currency === 'IDR' ? <div className="muted" style={{ marginTop: 6 }}>Rupiah</div> : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}><label className="muted" htmlFor={`ck-${c.s.id}`}>Kurs {c.s.currency}</label>
                    <input id={`ck-${c.s.id}`} type="text" inputMode="numeric" style={{ width: 84, height: 34 }} value={kursIn[c.s.id] ?? String(c.kurs)} onChange={e => setKursIn(k => ({ ...k, [c.s.id]: e.target.value }))}
                      onBlur={() => { const raw = kursIn[c.s.id]; if (raw === undefined) return; const n = Number(raw.replace(/\./g, '').replace(',', '.')); if (n > 0 && n !== c.kurs) upd('comparison_suppliers', { kurs: n }, { cmp_id: id, supplier_id: c.s.id }); else setKursIn(k => { const { [c.s.id]: _, ...r } = k; return r; }); }} /></div>)}
              </th>))}
            <th style={{ minWidth: 170 }}>Pilihan</th></tr></thead>
          <tbody>
            {v.items.map(it => {
              const p = v.prods.get(it.sku), best = bestOf(it), asked = v.asked.get(it.sku) ?? 0, pl = plOf(p);
              return (
                <tr key={it.id}>
                  <td className="sticky"><span className="mono">{it.sku}</span><br /><span className="muted">{asked === 0 ? 'Tipe di luar yang ditanyakan' : `Ditanya ${asked} kali`}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}><label className="muted" htmlFor={`cq-${it.id}`}>Qty</label>
                      <input id={`cq-${it.id}`} type="text" inputMode="numeric" style={{ width: 70 }} value={qtyIn[it.id] ?? it.qty} onChange={e => setQtyIn(k => ({ ...k, [it.id]: e.target.value }))}
                        onBlur={() => { const raw = qtyIn[it.id]; if (raw === undefined) return; const n = Math.max(1, parseInt(raw, 10) || 1); setQtyIn(k => { const { [it.id]: _, ...r } = k; return r; }); if (n !== it.qty) upd('comparison_items', { qty: n }, { id: it.id }); }} />
                      <IconButton icon="trash" label={`Hapus produk ${it.sku}`} cls="del sm" onClick={() => rmItem(it)} /></div></td>
                  <td className="pname">{p?.name || <span className="muted">-</span>}</td>
                  <td>{pl ? <><b>{fmt(pl)}</b>{p && !p.in_jurnal && <><br /><Pill>PL manual</Pill></>}</> : <Pill cls="p-amber">PL belum ada</Pill>}</td>
                  {cols.map(c => {
                    const cell = price(it.id, c.s.id), val = rupiah(it, c), isBest = best === c.s.id, ready = cell?.ready ?? true, can = ready && val > 0, idr = c.s.currency === 'IDR';
                    const ed = pl && val > 0 && !idr ? effDiscount(pl, val) : null;
                    return (
                      <td key={c.s.id} className={isBest ? 'best' : !ready ? 'nope' : ''}>
                        <div className="cellbox">
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span className="muted">{idr ? 'Diskon' : c.s.currency}</span>
                            <input type="text" inputMode="decimal" style={{ width: 90 }} aria-label={`${idr ? 'Diskon persen' : 'Harga'} ${c.s.name} untuk ${it.sku}`} key={`${cell?.quote ?? ''}`} defaultValue={cell?.quote ?? ''}
                              onBlur={e => { if (e.target.value !== String(cell?.quote ?? '')) setQuote(it, c.s.id, e.target.value); }} />{idr && <span className="muted">%</span>}</div>
                          <label className="chk"><input type="checkbox" checked={ready} onChange={e => run(() => rpc('cmp_set_ready', { p_item: it.id, p_supplier: c.s.id, p_ready: e.target.checked }))} /> Ready</label>
                          {val > 0 ? <span className="muted">Rp {fmt(val)} per pcs</span> : idr && cell?.quote ? <Pill cls="p-amber" style={{ alignSelf: 'flex-start' }}>PL belum ada</Pill> : null}
                          {ed !== null && <span className="muted">Diskon efektif {ed.toFixed(1).replace('.', ',')}%</span>}
                          {fromLabel(cell)}
                          {isBest && <Pill cls="p-teal" style={{ alignSelf: 'flex-start' }}>Termurah</Pill>}{!ready && <Pill style={{ alignSelf: 'flex-start' }}>Tidak ready</Pill>}
                          <label className="chk"><input type="radio" name={`pick-${it.id}`} disabled={!can} checked={it.pick_supplier_id === c.s.id && can} onChange={() => upd('comparison_items', { pick_supplier_id: c.s.id }, { id: it.id })} /> Order ke sini</label>
                        </div>
                      </td>
                    );
                  })}
                  <td>{pickOk(it) ? <><b>{sm.get(it.pick_supplier_id!)?.name}</b><br /><span className="muted">Rp {fmt(rupiah(it, cols.find(x => x.s.id === it.pick_supplier_id)!) * it.qty)}</span></> : <span className="muted">Belum dipilih</span>}<br />
                    <Btn sm variant="alt" style={{ marginTop: 6 }} disabled={!best} onClick={() => upd('comparison_items', { pick_supplier_id: best }, { id: it.id })}>Pilih termurah</Btn></td>
                </tr>
              );
            })}
            {v.items.length === 0 && <tr><td colSpan={4 + cols.length} className="muted" style={{ padding: 20 }}>Belum ada produk. Klik + Produk.</td></tr>}
          </tbody>
        </table>
      </div>
      <section className="card"><h2>Ringkasan pilihan</h2>
        {pickedN ? (
          <div className="wrap"><table style={{ minWidth: 640 }}><thead><tr><th>Supplier</th><th>Jenis produk</th><th>Total qty</th><th>Perkiraan total (Rp)</th><th>PO</th></tr></thead><tbody>
            {[...picks].map(([sid, e]) => { const po = poOf(sid); return (
              <tr key={sid} className={po ? 'click' : ''} onClick={po ? () => router.push('/po?id=' + po.id) : undefined}><td><b>{sm.get(sid)?.name}</b></td><td>{e.n}</td><td>{e.q}</td><td>{fmt(e.t)}</td>
                <td>{po ? <Pill cls="p-teal">{po.name}</Pill> : <Btn sm onClick={() => makePo(sid)}>{`Buat PO ke ${sm.get(sid)?.name}`}</Btn>}</td></tr>); })}
            <tr><td><b>Total</b></td><td><b>{pickedN}</b></td><td><b>{totalQty}</b></td><td><b>{fmt(total)}</b></td><td></td></tr></tbody></table></div>
        ) : <p className="muted" style={{ margin: 0 }}>Belum ada produk yang dipilih.</p>}
        <p className="muted" style={{ margin: 0 }}>{v.items.length - pickedN > 0 ? `${v.items.length - pickedN} produk belum dipilih dan tidak ikut PO. ` : ''}Satu PO hanya untuk satu supplier.</p></section>
      {adding === 'prod' && <AddProduct exclude={v.items.map(i => i.sku)} onClose={() => setAdding(null)} onAdd={async (sku, qty) => { await rpc('cmp_add_item', { p_cmp: id, p_sku: sku, p_qty: qty }); toast('Produk ditambahkan'); d.reload(); }} />}
      {adding === 'sup' && <AddSup all={sups.data.filter(s => s.active && s.type !== 'Stok sendiri' && !v.cs.some(c => c.supplier_id === s.id))} onClose={() => setAdding(null)} onAdd={async sid => { await rpc('cmp_add_supplier', { p_cmp: id, p_supplier: sid }); toast('Kolom supplier ditambahkan'); d.reload(); }} />}
      {v.items.length > 0 && cols.length === 0 && <Notice>Belum ada kolom supplier. Klik + Supplier.</Notice>}
    </>
  );
}

function AddSup({ all, onAdd, onClose }: { all: Supplier[]; onAdd: (sid: number) => Promise<void>; onClose: () => void }) {
  const [sid, setSid] = useState(all[0]?.id ?? 0);
  const [err, setErr] = useState<string | null>(null);
  return (
    <Dialog top title="Tambah kolom supplier" onClose={onClose} footer={<><Btn variant="alt" onClick={onClose}>Batal</Btn>{all.length > 0 && <Btn onClick={async () => { try { await onAdd(sid); onClose(); } catch (e) { setErr(msg(e)); } }}>Tambah</Btn>}</>}>
      <ErrorBox error={err} />
      {all.length ? <div className="field"><label htmlFor="x-sup">Supplier</label><select id="x-sup" value={sid} onChange={e => setSid(+e.target.value)}>{all.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div> : <p style={{ margin: 0 }}>Semua supplier aktif sudah ada di banding ini.</p>}
    </Dialog>
  );
}
