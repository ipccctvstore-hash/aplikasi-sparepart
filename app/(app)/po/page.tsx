'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { getProducts, getSettings, getSuppliers, notifyChanged, rpc } from '@/lib/db';
import { dec, fmt, fmtDate, leadTxt, normRange, rangeLabel, rp, todayWib } from '@/lib/format';
import { effKurs, lineStatus, lineUnit, resultText, shipForeignValue } from '@/lib/po';
import type { Cur } from '@/lib/po';
import { PO_STATUS_CLS, PO_STATUS_LABEL, TYPE_CLS } from '@/lib/types';
import type { PoStatus, Product, Supplier } from '@/lib/types';
import { Btn, Dialog, ErrorBox, Icon, IconButton, Notice, Pill, SearchBox, SortTable, msg, useConfirm, useLoad, useToast } from '@/components/ui';
import AddProduct from '@/components/AddProduct';
import { FilterButton, RangeBar } from '@/components/Filters';
import { useOnDataChanged } from '@/components/hooks';
import ProductPicker from '@/components/ProductPicker';

export default function Page() { return <Suspense><Po /></Suspense>; }
function Po() {
  const id = useSearchParams().get('id');
  return id ? <Detail id={+id} /> : <List />;
}

/* ===== Daftar PO ===== */
type PoRow = { po_id: number; name: string; status: PoStatus; po_date: string; supplier_id: number; qty_total: number; sent_total: number; recv_total: number; short_qty: number; age_days: number | null; supplier_name: string; supplier_type: string; currency: string; total_rupiah: number; n_lines: number };

function List() {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [range, setRange] = useState({ from: '', to: '' });
  const [fStatus, setFStatus] = useState('Semua');
  const [fSup, setFSup] = useState('');
  const [fRecv, setFRecv] = useState('Semua');
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [lo, hi] = normRange(range.from, range.to);
  const sups = useLoad(getSuppliers, []);
  const st = useLoad(getSettings, []);
  const { data, error, loading, reload } = useLoad(async () => {
    const [a, b] = await Promise.all([supabase().from('v_po_list').select('*').order('po_id', { ascending: false }), supabase().from('po_lines').select('po_id,sku')]);
    if (a.error) throw a.error;
    const skus = new Map<number, string[]>(); (b.data ?? []).forEach(l => skus.set(l.po_id, [...(skus.get(l.po_id) ?? []), l.sku]));
    return (a.data ?? []).map(r => ({ ...r, total_rupiah: Number(r.total_rupiah), skus: skus.get(r.po_id) ?? [] })) as (PoRow & { skus: string[] })[];
  }, []);
  useOnDataChanged(reload);
  const old = st.data?.po_aging_days ?? 60;
  const ql = q.toLowerCase();
  const list = (data ?? []).filter(p => (!lo || p.po_date >= lo) && (!hi || p.po_date <= hi) && (fStatus === 'Semua' || p.status === fStatus) && (!fSup || p.supplier_id === +fSup)
    && (fRecv === 'Semua' || (fRecv === 'Lengkap' ? p.recv_total >= p.qty_total && p.n_lines > 0 : p.recv_total < p.qty_total || !p.n_lines))
    && (p.name.toLowerCase().includes(ql) || p.supplier_name.toLowerCase().includes(ql) || p.skus.some(s => s.toLowerCase().includes(ql))));
  return (
    <>
      <div className="top"><div><h1>PO</h1><p className="sub">Satu PO untuk satu supplier. Catat pengiriman dan penerimaan per kiriman. Hanya PO berstatus Dipesan yang dihitung di List Barang.</p></div><div className="actions"><Btn icon="plus" onClick={() => setCreating(true)}>PO Baru</Btn></div></div>
      <div className="toolbar"><SearchBox id="pfq" value={q} onChange={setQ} placeholder="Cari PO, supplier, part" label="Cari PO, supplier, atau part number" />
        <FilterButton open={open} count={(fStatus !== 'Semua' ? 1 : 0) + (fSup ? 1 : 0) + (fRecv !== 'Semua' ? 1 : 0)} onClick={() => setOpen(o => !o)} />
        <Btn sm variant="alt" className="perchip" onClick={() => setOpen(true)}>Periode: <b>{rangeLabel(range.from, range.to)}</b></Btn></div>
      {open && <div className="fpanel"><RangeBar from={range.from} to={range.to} onChange={(f, t) => setRange({ from: f, to: t })} /><div className="fgrid">
        <div className="field"><label htmlFor="pf-st">Status</label><select id="pf-st" value={fStatus} onChange={e => setFStatus(e.target.value)}><option>Semua</option>{(Object.keys(PO_STATUS_LABEL) as PoStatus[]).map(s => <option key={s} value={s}>{PO_STATUS_LABEL[s]}</option>)}</select></div>
        <div className="field"><label htmlFor="pf-sup">Supplier</label><select id="pf-sup" value={fSup} onChange={e => setFSup(e.target.value)}><option value="">Semua</option>{(sups.data ?? []).filter(s => s.type !== 'Stok sendiri').map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
        <div className="field"><label htmlFor="pf-rc">Penerimaan</label><select id="pf-rc" value={fRecv} onChange={e => setFRecv(e.target.value)}><option value="Semua">Semua</option><option value="Belum">Belum lengkap diterima</option><option value="Lengkap">Sudah lengkap diterima</option></select></div>
      </div><div className="ffoot"><Btn sm variant="alt" onClick={() => { setFStatus('Semua'); setFSup(''); setFRecv('Semua'); setRange({ from: '', to: '' }); }}>Reset filter</Btn></div></div>}
      <ErrorBox error={error} />
      <SortTable<PoRow> minWidth={1180} rows={list} rowKey={p => p.po_id} onRow={p => router.push('/po?id=' + p.po_id)} empty={loading ? 'Memuat...' : 'Tidak ada PO yang cocok.'}
        cols={[
          { key: 'n', label: 'PO', sort: p => p.po_id, render: p => <b>{p.name}</b> },
          { key: 's', label: 'Supplier', sort: p => p.supplier_name, render: p => <>{p.supplier_name} <Pill cls={TYPE_CLS[p.supplier_type]}>{p.supplier_type}</Pill></> },
          { key: 'd', label: 'Tanggal', sort: p => p.po_date, render: p => fmtDate(p.po_date) },
          { key: 'a', label: 'Umur (hari sejak PO dibuat)', sort: p => p.age_days ?? -1, render: p => (p.age_days === null ? '-' : <Pill cls={p.age_days > old ? 'p-red' : 'p-grey'}>{p.age_days} hari</Pill>) },
          { key: 'st', label: 'Status', sort: p => p.status, render: p => <><Pill cls={PO_STATUS_CLS[p.status]}>{PO_STATUS_LABEL[p.status]}</Pill>{p.status === 'selesai' && p.short_qty > 0 && <div className="muted">kurang {p.short_qty} pcs</div>}</> },
          { key: 'i', label: 'Item', sort: p => p.n_lines, render: p => p.n_lines },
          { key: 'q', label: 'Total qty', sort: p => p.qty_total, render: p => p.qty_total },
          { key: 'sent', label: 'Sudah dikirim', sort: p => p.sent_total, render: p => <><b>{p.sent_total}</b> dari {p.qty_total}<div className="bar" style={{ marginTop: 4 }}><i style={{ width: `${p.qty_total ? Math.round(p.sent_total / p.qty_total * 100) : 0}%` }} /></div></> },
          { key: 'rem', label: 'Sisa belum dikirim', sort: p => p.qty_total - p.sent_total, render: p => Math.max(0, p.qty_total - p.sent_total) },
          { key: 'r', label: 'Diterima', sort: p => p.recv_total, render: p => p.recv_total },
          { key: 't', label: 'Total (Rp)', sort: p => p.total_rupiah, render: p => fmt(p.total_rupiah) },
        ]} />
      <p className="muted" style={{ margin: 0 }}>Umur dihitung dari tanggal PO dibuat, hanya untuk PO Draft dan Dipesan. Merah kalau lebih dari {old} hari. Klik judul kolom Umur untuk mengurutkan.</p>
      <p className="muted" style={{ margin: 0 }}>PO di sini hanya catatan di aplikasi ini. Dokumen PO resmi tetap dibuat di Jurnal oleh tim.</p>
      {creating && sups.data && <NewPo suppliers={sups.data.filter(s => s.active && s.type !== 'Stok sendiri')} onClose={() => setCreating(false)} onCreated={pid => router.push('/po?id=' + pid)} />}
    </>
  );
}

function NewPo({ suppliers, onClose, onCreated }: { suppliers: Supplier[]; onClose: () => void; onCreated: (id: number) => void }) {
  const confirm = useConfirm(), toast = useToast();
  const [sid, setSid] = useState(suppliers[0]?.id ?? 0);
  const [items, setItems] = useState<{ sku: string; qty: number }[]>([]);
  const [err, setErr] = useState<string | null>(null);
  async function go() {
    const s = suppliers.find(x => x.id === sid); if (!s) { setErr('Pilih supplier.'); return; }
    if (!(await confirm({ title: 'PO baru', ok: 'Ya, buat PO', msg: `Buat PO baru ke ${s.name}${items.length ? ` dengan ${items.length} produk` : ''}?`, detail: 'PO dibuat berstatus Draft dan baru dihitung di List Barang setelah berstatus Dipesan.' }))) return;
    try { const pid = await rpc<number>('po_create', { p_supplier: sid, p_lines: items }); toast('PO dibuat'); notifyChanged(); onCreated(pid); } catch (e) { setErr(msg(e)); }
  }
  return (
    <Dialog wide title="PO baru" onClose={onClose} footer={<><Btn variant="alt" onClick={onClose}>Batal</Btn><Btn icon="check" onClick={go}>Buat PO</Btn></>}>
      <ErrorBox error={err} />
      <div className="field"><label htmlFor="p-sup">Supplier (satu PO satu supplier)</label><select id="p-sup" value={sid} onChange={e => setSid(+e.target.value)}>{suppliers.map(s => <option key={s.id} value={s.id}>{s.name} ({s.currency})</option>)}</select></div>
      <ProductPicker label="Tambah produk (opsional)" exclude={items.map(i => i.sku)} onPick={sku => setItems(l => [...l, { sku, qty: 1 }])} />
      {items.length > 0 && <div className="checklist">{items.map((it, i) => (
        <div key={it.sku} style={{ display: 'flex', gap: 10, alignItems: 'center' }}><span className="mono" style={{ flex: 1 }}>{it.sku}</span>
          <label className="muted" htmlFor={`pq-${i}`}>Qty</label><input id={`pq-${i}`} type="text" inputMode="numeric" style={{ width: 70 }} value={it.qty} onChange={e => setItems(l => l.map((x, k) => (k === i ? { ...x, qty: Math.max(1, parseInt(e.target.value, 10) || 1) } : x)))} />
          <IconButton icon="trash" label={`Hapus ${it.sku}`} cls="del sm" onClick={() => setItems(l => l.filter((_, k) => k !== i))} /></div>))}</div>}
      <p className="muted" style={{ margin: 0 }}>Produk bisa dikosongkan dan ditambah nanti lewat tombol + Produk setelah PO dibuat.</p>
    </Dialog>
  );
}

/* ===== Detail PO ===== */
type Line = { line_id: number; sku: string; qty: number; price: number | null; sent: number; recv: number };
type Log = { id: number; date: string; note: string; items: Record<string, number>; total_rupiah: number | null; kurs_efektif: number | null };

function Detail({ id }: { id: number }) {
  const router = useRouter(), confirm = useConfirm(), toast = useToast();
  const sb = supabase();
  const [err, setErr] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [log, setLog] = useState<null | { mode: 'new'; kind: 'ship' | 'recv' } | { mode: 'edit'; kind: 'ship' | 'recv'; log: Log }>(null);
  const [finishing, setFinishing] = useState(false);
  const [remain, setRemain] = useState(false);
  const [edit, setEdit] = useState<Record<string, string>>({});
  const st = useLoad(getSettings, []);
  const d = useLoad(async () => {
    const [po, ln, sh, rc, kr] = await Promise.all([
      sb.from('purchase_orders').select('id,name,po_date,status,supplier_id,kurs_perkiraan,closed_short,supplier:suppliers(id,name,type,currency,lead_months,kurs)').eq('id', id).single(),
      sb.from('v_po_line_totals').select('line_id,sku,qty,sent,recv').eq('po_id', id).order('line_id'),
      sb.from('po_shipments').select('id,ship_date,note,total_rupiah,items:po_shipment_items(line_id,qty)').eq('po_id', id),
      sb.from('po_receipts').select('id,recv_date,note,items:po_receipt_items(line_id,qty)').eq('po_id', id),
      sb.from('v_po_shipment_kurs').select('shipment_id,kurs_efektif').eq('po_id', id),
    ]);
    for (const r of [po, ln, sh, rc, kr]) if (r.error) throw r.error;
    const { data: pr } = await sb.from('po_lines').select('id,price').eq('po_id', id);
    const pm = new Map((pr ?? []).map(x => [x.id, x.price === null ? null : Number(x.price)]));
    const lines: Line[] = (ln.data ?? []).map(l => ({ ...l, price: pm.get(l.line_id) ?? null }));
    const prods = await getProducts(lines.map(l => l.sku));
    const ke = new Map((kr.data ?? []).map(k => [k.shipment_id, k.kurs_efektif === null ? null : Number(k.kurs_efektif)]));
    const toItems = (a: { line_id: number; qty: number }[]) => Object.fromEntries(a.map(i => [String(i.line_id), i.qty]));
    const ships: Log[] = (sh.data ?? []).map(s => ({ id: s.id, date: s.ship_date, note: s.note, items: toItems(s.items), total_rupiah: s.total_rupiah === null ? null : Number(s.total_rupiah), kurs_efektif: ke.get(s.id) ?? null }));
    const recs: Log[] = (rc.data ?? []).map(r => ({ id: r.id, date: r.recv_date, note: r.note, items: toItems(r.items), total_rupiah: null, kurs_efektif: null }));
    const sort = (a: Log[]) => a.sort((x, y) => y.date.localeCompare(x.date) || y.id - x.id);
    return { po: po.data as any, lines, prods, ships: sort(ships), recs: sort(recs) };
  }, [id]);
  useOnDataChanged(d.reload);
  const v = d.data;
  if (d.error) return <><Btn sm variant="alt" onClick={() => router.push('/po')}>&larr; Semua PO</Btn><ErrorBox error={d.error} /></>;
  if (!v) return <p className="muted">Memuat...</p>;
  const po = v.po, s: Supplier = { ...po.supplier, lead_months: Number(po.supplier.lead_months), kurs: Number(po.supplier.kurs) };
  const cur = s.currency as Cur, fx = cur !== 'IDR', status: PoStatus = po.status, canceled = status === 'dibatalkan';
  const kurs = Number(po.kurs_perkiraan) || 0;
  const tq = v.lines.reduce((a, l) => a + l.qty, 0), ts = v.lines.reduce((a, l) => a + l.sent, 0), tr = v.lines.reduce((a, l) => a + l.recv, 0);
  const canDel = !v.ships.length && !v.recs.length;
  const fv = v.lines.reduce((a, l) => a + (l.price ?? 0) * l.qty, 0);
  const real = v.ships.reduce((a, r) => a + (r.total_rupiah ?? 0), 0), nInv = v.ships.filter(r => (r.total_rupiah ?? 0) > 0).length;
  const total = v.lines.reduce((a, l) => a + lineUnit(cur, l.price, kurs) * l.qty, 0);
  const age = status === 'draft' || status === 'dipesan' ? Math.floor((new Date(todayWib()).getTime() - new Date(po.po_date).getTime()) / 864e5) : null;
  const old = st.data?.po_aging_days ?? 60;

  async function run(fn: () => PromiseLike<unknown>, ok?: string) {
    setErr(null);
    try { const r = await fn(); if (typeof r === 'string' && r) toast(r); else if (ok) toast(ok); d.reload(); notifyChanged(); } catch (e) { setErr(msg(e)); d.reload(); }
  }
  async function changeStatus(ns: PoStatus) {
    if (ns === status) return;
    if (ns === 'selesai') { if (tq - tr > 0) { setFinishing(true); return; } }
    if (ns === 'dibatalkan' && !(await confirm({ title: 'Batalkan PO', danger: true, ok: 'Ya, batalkan', msg: `Batalkan ${po.name}?`, detail: 'PO yang dibatalkan tidak bisa dibuka lagi dan sisanya tidak dihitung di List Barang.' }))) return;
    if (ns !== 'dibatalkan' && !(await confirm({ title: 'Ubah status PO', ok: 'Ya, ubah', msg: `Ubah status ${po.name} menjadi ${PO_STATUS_LABEL[ns]}?`, detail: ns === 'dipesan' ? 'Qty PO mulai dihitung di List Barang.' : ns === 'draft' ? 'Qty PO tidak lagi dihitung di List Barang.' : '' }))) return;
    run(() => rpc('po_set_status', { p_po: id, p_status: ns }), 'Status diubah');
  }
  async function saveLine(l: Line, qty: string | undefined, price: string | undefined) {
    const q = Math.max(1, parseInt(qty ?? String(l.qty), 10) || 1);
    const pv = price === undefined ? l.price : price.trim() === '' ? null : dec(price);
    setEdit(e => { const n = { ...e }; delete n['q' + l.line_id]; delete n['p' + l.line_id]; return n; });
    if (q === l.qty && pv === l.price) return;
    run(() => rpc<string>('po_set_line', { p_line: l.line_id, p_qty: q, p_price: pv }));
  }
  async function rmLine(l: Line) { if (!(await confirm({ title: 'Hapus produk', danger: true, ok: 'Ya, hapus', msg: `Hapus ${l.sku} dari ${po.name}?`, detail: (l.sent || l.recv) ? 'Catatan pengiriman dan penerimaan untuk produk ini ikut terhapus.' : '' }))) return; run(() => rpc<string>('po_remove_line', { p_line: l.line_id }), 'Produk dihapus'); }
  async function delPo() { if (!(await confirm({ title: 'Hapus PO', danger: true, ok: 'Ya, hapus', msg: `Hapus ${po.name}?`, detail: 'Tidak bisa dibatalkan.' }))) return; const { error } = await sb.from('purchase_orders').delete().eq('id', id); if (error) { setErr(error.message); return; } toast('PO dihapus'); notifyChanged(); router.push('/po'); }
  async function delLog(kind: 'ship' | 'recv', l: Log) { if (!(await confirm({ title: 'Hapus catatan', danger: true, ok: 'Ya, hapus', msg: `Hapus ${kind === 'ship' ? 'pengiriman' : 'penerimaan'} tanggal ${fmtDate(l.date)}?` }))) return; run(() => rpc<string>('po_delete_log', { p_kind: kind, p_id: l.id }), 'Catatan dihapus'); }

  const logSection = (kind: 'ship' | 'recv') => {
    const sh = kind === 'ship', arr = sh ? v.ships : v.recs, can = !canceled && (sh ? tq > ts : ts > tr);
    return (
      <section className="card"><div className="cardhead"><h2>{sh ? 'Riwayat pengiriman' : 'Riwayat penerimaan'}</h2><Btn sm disabled={!can} onClick={() => setLog({ mode: 'new', kind })}>{sh ? 'Catat pengiriman' : 'Catat penerimaan'}</Btn></div>
        {arr.length ? <><div className="loglist">{arr.map(r => {
          const n = Object.keys(r.items).length, q = Object.values(r.items).reduce((a, x) => a + x, 0);
          return (
            <div className="logrow" key={r.id} role="button" tabIndex={0} aria-label={`Buka detail ${fmtDate(r.date)}`} onClick={() => setLog({ mode: 'edit', kind, log: r })} onKeyDown={e => { if (e.key === 'Enter') setLog({ mode: 'edit', kind, log: r }); }}>
              <div className="lm"><b>{fmtDate(r.date)}</b><span className="muted">{n} produk, {q} pcs{r.note ? ', ' + r.note : ''}</span>
                {sh && fx && (r.kurs_efektif ? <Pill cls="p-blue" style={{ alignSelf: 'flex-start' }}>Kurs efektif Rp {fmt(r.kurs_efektif)} per {cur}</Pill> : <span className="muted">Total rupiah invoice belum diisi</span>)}</div>
              <IconButton icon="trash" label={sh ? 'Hapus pengiriman' : 'Hapus penerimaan'} cls="del" onClick={() => delLog(kind, r)} /><Icon name="chevright" size={18} />
            </div>); })}</div><p className="muted" style={{ margin: 0 }}>Klik satu baris untuk melihat produknya, mengubah qty, atau menghapus produk dari catatan itu.</p></>
          : <p className="muted" style={{ margin: 0 }}>{sh ? 'Belum ada pengiriman. Order 100 yang dikirim 30, 40, lalu 30 dicatat sebagai tiga pengiriman, satu per kiriman.' : 'Belum ada penerimaan. Barang yang datang dicatat per kedatangan dan tidak bisa melebihi yang sudah dikirim.'}</p>}
      </section>
    );
  };

  return (
    <>
      <div className="top"><div><Btn sm variant="alt" onClick={() => router.push('/po')}>&larr; Semua PO</Btn>
        <h1 style={{ marginTop: 12 }}>{po.name}</h1>
        <p className="sub">Supplier <b>{s.name}</b> <Pill cls={TYPE_CLS[s.type]}>{s.type}</Pill>, lama datang {leadTxt(s.lead_months)}. Dibuat {fmtDate(po.po_date)}.{age !== null && <> Umur <Pill cls={age > old ? 'p-red' : 'p-grey'}>{age} hari</Pill></>}{status === 'selesai' && po.closed_short && <> <Pill cls="p-amber">Selesai, kurang {Math.max(0, tq - tr)} pcs</Pill></>}</p></div>
        <div className="actions">
          <div className="field" style={{ flex: '0 0 160px' }}><label htmlFor="po-st" className="vh">Status PO</label>
            <select id="po-st" value={status} disabled={canceled} onChange={e => changeStatus(e.target.value as PoStatus)}>{(Object.keys(PO_STATUS_LABEL) as PoStatus[]).map(x => <option key={x} value={x}>{PO_STATUS_LABEL[x]}</option>)}</select></div>
          <Btn variant="alt" disabled={canceled} onClick={() => setAdding(true)}>+ Produk</Btn><Btn variant="danger" disabled={!canDel} onClick={delPo}>Hapus PO</Btn></div></div>
      <ErrorBox error={err} />
      {canceled && <Notice>PO ini dibatalkan. Sisa yang belum diterima tidak dihitung di List Barang. PO yang dibatalkan tidak bisa dibuka lagi.</Notice>}
      {!canDel && <p className="pohint" style={{ margin: 0 }}>Untuk menghapus PO ini, hapus dulu {v.ships.length} catatan pengiriman dan {v.recs.length} catatan penerimaan di bawah. Kalau hanya ingin tidak dihitung lagi, ubah status ke Dibatalkan.</p>}
      <div className="stats">
        <div className="stat"><span className="muted">Qty dipesan</span><b>{tq}</b></div>
        <div className="stat"><span className="muted">Sudah dikirim</span><b>{ts}</b><span className="muted">dari {tq} di PO</span></div>
        <div className="stat"><span className="muted">Dalam perjalanan</span><b style={{ color: 'var(--amberink)' }}>{Math.max(0, ts - tr)}</b><span className="muted">dikirim, belum diterima</span></div>
        <div className="stat"><span className="muted">Sudah diterima</span><b style={{ color: 'var(--tealink)' }}>{tr}</b><span className="muted">dari {tq} di PO</span></div>
      </div>
      {fx && (
        <section className="card" style={{ gap: 12 }}><h2>Kurs dan total</h2>
          <div className="row" style={{ alignItems: 'flex-end' }}>
            <div className="field" style={{ flex: '0 1 260px' }}><label htmlFor="po-kurs">Kurs perkiraan (Rp per 1 {cur})</label>
              <input id="po-kurs" type="text" inputMode="numeric" disabled={canceled} value={edit.kurs ?? (kurs ? String(kurs) : '')} onChange={e => setEdit(x => ({ ...x, kurs: e.target.value }))}
                onBlur={() => { const raw = edit.kurs; if (raw === undefined) return; const n = rp(raw); setEdit(x => { const r = { ...x }; delete r.kurs; return r; }); if (n > 0 && n !== kurs) run(async () => { const { error } = await sb.from('purchase_orders').update({ kurs_perkiraan: n }).eq('id', id); if (error) throw error; }, 'Kurs diperbarui'); }} /></div>
            <div className="stat" style={{ flex: '1 1 180px', boxShadow: 'none', background: 'var(--head)' }}><span className="muted">Taksiran total PO</span><b style={{ fontSize: 22 }}>Rp {fmt(fv * kurs)}</b><span className="muted">{cur} {fv.toLocaleString('id-ID', { maximumFractionDigits: 2 })} x kurs perkiraan</span></div>
            <div className="stat" style={{ flex: '1 1 180px', boxShadow: 'none', background: 'var(--head)' }}><span className="muted">Realisasi invoice</span><b style={{ fontSize: 22 }}>{nInv ? 'Rp ' + fmt(real) : '-'}</b><span className="muted">{nInv ? `dari ${nInv} pengiriman yang diisi total rupiahnya` : 'belum ada total rupiah di pengiriman'}</span></div></div>
          <p className="muted" style={{ margin: 0 }}>Kurs perkiraan hanya untuk menaksir total PO sebelum invoice keluar. Kurs sebenarnya dihitung per pengiriman: isi total rupiah invoice saat mencatat atau mengedit pengiriman, kurs efektif muncul otomatis.</p></section>
      )}
      <section className="card"><div className="cardhead"><h2>Produk</h2><label className="chk"><input type="checkbox" checked={remain} onChange={e => setRemain(e.target.checked)} /> Munculkan sisa barang yang belum dikirim dan belum diterima</label></div>
        <div className="wrap"><table className="cardtbl" style={{ minWidth: remain ? 1410 : 1130 }}><thead><tr><th>Part number</th><th>Nama barang</th><th>Qty PO</th><th>Harga ({cur})</th><th>Harga per pcs (Rp)</th><th>Total (Rp)</th><th>Status</th>{remain && <><th>Belum dikirim<br /><span className="muted" style={{ fontWeight: 400 }}>Qty PO − dikirim</span></th><th>Belum diterima<br /><span className="muted" style={{ fontWeight: 400 }}>Qty PO − diterima</span></th></>}<th></th></tr></thead>
          <tbody>
            {v.lines.map(l => { const stt = lineStatus(l.qty, l.sent, l.recv), p: Product | undefined = v.prods.get(l.sku); return (
              <tr key={l.line_id}><td data-l="" className="mono">{l.sku}</td><td data-l="Nama barang" className="pname">{p?.name || <span className="muted">-</span>}</td>
                <td data-l="Qty PO"><input type="text" inputMode="numeric" aria-label={`Qty ${l.sku}`} style={{ width: 70 }} disabled={canceled} value={edit['q' + l.line_id] ?? l.qty} onChange={e => setEdit(x => ({ ...x, ['q' + l.line_id]: e.target.value }))} onBlur={() => saveLine(l, edit['q' + l.line_id], edit['p' + l.line_id])} /></td>
                <td data-l={`Harga (${cur})`}><input type="text" inputMode="decimal" aria-label={`Harga ${l.sku}`} style={{ width: 110 }} disabled={canceled} value={edit['p' + l.line_id] ?? (l.price ?? '')} onChange={e => setEdit(x => ({ ...x, ['p' + l.line_id]: e.target.value }))} onBlur={() => saveLine(l, edit['q' + l.line_id], edit['p' + l.line_id])} /></td>
                <td data-l="Harga per pcs (Rp)">{fmt(lineUnit(cur, l.price, kurs))}</td><td data-l="Total (Rp)"><b>{fmt(lineUnit(cur, l.price, kurs) * l.qty)}</b></td>
                <td data-l="Status"><Pill cls={stt[1]}>{stt[0]}</Pill></td>
                {remain && <><td data-l="Belum dikirim (Qty PO − dikirim)">{l.qty - l.sent}</td><td data-l="Belum diterima (Qty PO − diterima)">{l.qty - l.recv}</td></>}
                <td className="act">{!canceled && <IconButton icon="trash" label="Hapus produk dari PO" cls="del" onClick={() => rmLine(l)} />}</td></tr>); })}
            {v.lines.length === 0 && <tr><td colSpan={remain ? 10 : 8} className="muted" style={{ padding: 20 }}>PO ini masih kosong. Klik + Produk.</td></tr>}
            <tr><td data-l=""><b>Total</b></td><td></td><td data-l="Qty PO"><b>{tq}</b></td><td></td><td></td><td data-l="Total (Rp)"><b>{fmt(total)}</b></td><td></td>{remain && <><td><b>{Math.max(0, tq - ts)}</b></td><td><b>{Math.max(0, tq - tr)}</b></td></>}<td></td></tr>
          </tbody></table></div></section>
      {logSection('ship')}
      {logSection('recv')}
      <p className="muted" style={{ margin: 0 }}>Qty ini dipakai di List Barang (kolom Di PO dan Proses kirim) hanya selama status PO Dipesan.{fx ? ` Kurs perkiraan PO ini: Rp ${fmt(kurs)} per ${cur}.` : ''}</p>
      {adding && <AddProduct exclude={v.lines.map(l => l.sku)} priceLabel={`Harga per pcs (${cur})`} onClose={() => setAdding(false)} onAdd={async (sku, qty, price) => { await rpc('po_add_line', { p_po: id, p_sku: sku, p_qty: qty, p_price: price.trim() ? dec(price) : null }); toast('Produk ditambahkan'); d.reload(); notifyChanged(); }} />}
      {log && <LogDialog po={{ id, cur, supplier: s }} lines={v.lines} prods={v.prods} spec={log} onClose={() => setLog(null)} onSaved={m => { setLog(null); if (m) toast(m); d.reload(); notifyChanged(); }} />}
      {finishing && <Dialog top title={`Selesaikan ${po.name}`} onClose={() => setFinishing(false)} footer={<><Btn variant="alt" onClick={() => setFinishing(false)}>Batal</Btn>
        <Btn variant="alt" onClick={async () => { if (!(await confirm({ title: 'Selesai, sisa tidak datang', ok: 'Ya, selesaikan', msg: `Selesaikan ${po.name} dengan sisa ${tq - tr} pcs yang tidak datang?` }))) return; setFinishing(false); run(() => rpc('po_finish', { p_po: id, p_mode: 'short' }), 'PO selesai, sisa tidak datang'); }}>Selesai, sisa tidak datang</Btn>
        <Btn variant="okb" onClick={async () => { if (!(await confirm({ title: 'Catat semua diterima', ok: 'Ya, catat', msg: `Catat semua sisa (${tq - tr} pcs) sebagai dikirim dan diterima hari ini?` }))) return; setFinishing(false); run(() => rpc('po_finish', { p_po: id, p_mode: 'all' }), 'PO selesai'); }}>Catat semua diterima</Btn></>}>
        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}><span className="cico"><Icon name="check" size={22} /></span><div><p style={{ margin: 0, fontWeight: 500 }}>Masih ada {tq - tr} pcs yang belum diterima.</p><p className="muted" style={{ margin: '8px 0 0' }}>Pilih salah satu. Keduanya bisa dikoreksi lagi lewat daftar pengiriman dan penerimaan.</p></div></div>
        <Notice blue><b>Catat semua diterima</b>: aplikasi mencatat satu pengiriman dan satu penerimaan untuk semua sisa, tanggal hari ini.</Notice>
        <Notice><b>Selesai, sisa tidak datang</b>: status Selesai dengan tulisan &quot;kurang {tq - tr} pcs&quot;. Sisanya tidak dihitung lagi di List Barang.</Notice>
      </Dialog>}
    </>
  );
}

/* ===== Catat / ubah pengiriman dan penerimaan ===== */
function LogDialog({ po, lines, prods, spec, onClose, onSaved }: {
  po: { id: number; cur: Cur; supplier: Supplier }; lines: Line[]; prods: Map<string, Product>;
  spec: { mode: 'new'; kind: 'ship' | 'recv' } | { mode: 'edit'; kind: 'ship' | 'recv'; log: Log }; onClose: () => void; onSaved: (m: string) => void;
}) {
  const confirm = useConfirm();
  const sh = spec.kind === 'ship', isEdit = spec.mode === 'edit', fx = po.cur !== 'IDR';
  const [date, setDate] = useState(spec.mode === 'edit' ? spec.log.date : todayWib());
  const [note, setNote] = useState(spec.mode === 'edit' ? spec.log.note : '');
  const [q, setQ] = useState<Record<number, string>>(spec.mode === 'edit' ? Object.fromEntries(Object.entries(spec.log.items).map(([k, x]) => [+k, String(x)])) : {});
  const [removed, setRemoved] = useState<Set<number>>(new Set());
  const [total, setTotal] = useState(spec.mode === 'edit' && spec.log.total_rupiah ? String(spec.log.total_rupiah) : '');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const own = spec.mode === 'edit' ? spec.log.items : {};
  // baris yang tampil: baru = yang masih punya sisa; ubah = baris di catatan itu
  const rows = isEdit ? lines.filter(l => String(l.line_id) in own && !removed.has(l.line_id)) : lines.filter(l => (sh ? l.qty > l.sent : l.sent > l.recv));
  const num = (id: number) => Math.max(0, Math.round(rp(q[id] || 0)));
  const items = rows.map(l => ({ l, n: num(l.line_id) })).filter(x => x.n > 0);
  const fv = shipForeignValue(items.map(x => ({ qty: x.n, price: x.l.price })));
  const ek = effKurs(rp(total), fv);

  async function save() {
    setErr(null);
    if (!items.length) { setErr('Isi qty minimal satu produk.'); return; }
    if (!(await confirm({ title: isEdit ? 'Simpan perubahan' : sh ? 'Simpan pengiriman' : 'Simpan penerimaan', ok: 'Ya, simpan', msg: `${isEdit ? 'Simpan perubahan catatan' : 'Simpan'} ${sh ? 'pengiriman' : 'penerimaan'} tanggal ${fmtDate(date)}?`, detail: `${items.length} produk, ${items.reduce((a, x) => a + x.n, 0)} pcs.` }))) return;
    setBusy(true);
    const obj = Object.fromEntries(items.map(x => [String(x.l.line_id), x.n]));
    const tot = sh && fx && total.trim() ? rp(total) : null;
    try {
      if (isEdit) { const m = await rpc<string>('po_edit_log', { p_kind: spec.kind, p_id: (spec as { log: Log }).log.id, p_date: date, p_note: note, p_total: tot, p_items: obj }); onSaved(m || 'Perubahan disimpan'); }
      else { const r = await rpc<{ message: string }>('po_add_log', { p_po: po.id, p_kind: spec.kind, p_date: date, p_note: note, p_total: tot, p_items: obj }); onSaved(r.message || (sh ? 'Pengiriman dicatat' : 'Penerimaan dicatat')); }
    } catch (e) { setErr(msg(e)); setBusy(false); }
  }
  const title = isEdit ? (sh ? 'Detail pengiriman ' : 'Detail penerimaan ') + fmtDate((spec as { log: Log }).log.date) : sh ? 'Catat pengiriman dari supplier' : 'Catat penerimaan barang';
  return (
    <Dialog wide title={title} onClose={onClose} footer={<><Btn variant="alt" onClick={onClose}>Batal</Btn><Btn disabled={busy} onClick={save}>{isEdit ? 'Simpan perubahan' : sh ? 'Simpan pengiriman' : 'Simpan penerimaan'}</Btn></>}>
      <ErrorBox error={err} />
      <div className="row">
        <div className="field" style={{ maxWidth: 240 }}><label htmlFor="rc-date">{sh ? 'Tanggal dikirim' : 'Tanggal diterima'}</label><input id="rc-date" type="date" value={date} max={todayWib()} onChange={e => setDate(e.target.value)} /></div>
        <div className="field"><label htmlFor="rc-note">Catatan (opsional)</label><input id="rc-note" type="text" value={note} onChange={e => setNote(e.target.value)} /></div>
      </div>
      {!isEdit && <div><Btn sm variant="alt" icon="check" onClick={() => setQ(Object.fromEntries(rows.map(l => [l.line_id, String(sh ? l.qty - l.sent : l.sent - l.recv)])))}>Isi semua sisa</Btn></div>}
      <div className="wrap"><table className="cardtbl" style={{ minWidth: 0 }}><thead><tr><th>Part number</th><th>Nama barang</th>
        {isEdit ? <th>{sh ? 'Dikirim' : 'Diterima'}</th> : sh ? <><th>Qty PO</th><th>Sudah dikirim</th><th>Sisa belum dikirim</th><th>Dikirim kali ini</th><th>Jadi dikirim</th></> : <><th>Sudah dikirim</th><th>Sudah diterima</th><th>Dalam perjalanan</th><th>Diterima kali ini</th><th>Jadi diterima</th></>}
        {isEdit && <th></th>}</tr></thead>
        <tbody>{rows.map(l => {
          const name = prods.get(l.sku)?.name;
          const input = <input type="text" inputMode="numeric" aria-label={`Qty ${l.sku}`} style={{ width: 80 }} value={q[l.line_id] ?? ''} onChange={e => setQ(x => ({ ...x, [l.line_id]: e.target.value }))} />;
          if (isEdit) return <tr key={l.line_id}><td data-l="" className="mono">{l.sku}</td><td data-l="Nama barang" className="pname">{name || '-'}</td><td data-l={sh ? 'Dikirim' : 'Diterima'}>{input}</td><td className="act"><IconButton icon="trash" label="Hapus produk dari catatan ini" cls="del" onClick={() => setRemoved(r => new Set(r).add(l.line_id))} /></td></tr>;
          const res = sh ? resultText(l.sent, q[l.line_id] ?? '', l.qty) : resultText(l.recv, q[l.line_id] ?? '', l.sent);
          return sh
            ? <tr key={l.line_id}><td data-l="" className="mono">{l.sku}</td><td data-l="Nama barang" className="pname">{name || '-'}</td><td data-l="Qty PO">{l.qty}</td><td data-l="Sudah dikirim">{l.sent}</td><td data-l="Sisa belum dikirim"><b>{l.qty - l.sent}</b></td><td data-l="Dikirim kali ini">{input}</td><td data-l="Jadi dikirim" style={res.over ? { color: 'var(--redink)' } : undefined}>{res.text}</td></tr>
            : <tr key={l.line_id}><td data-l="" className="mono">{l.sku}</td><td data-l="Nama barang" className="pname">{name || '-'}</td><td data-l="Sudah dikirim">{l.sent}</td><td data-l="Sudah diterima">{l.recv}</td><td data-l="Dalam perjalanan"><b>{l.sent - l.recv}</b></td><td data-l="Diterima kali ini">{input}</td><td data-l="Jadi diterima" style={res.over ? { color: 'var(--redink)' } : undefined}>{res.text}</td></tr>;
        })}{rows.length === 0 && <tr><td colSpan={7} className="muted" style={{ padding: 16 }}>Tidak ada produk.</td></tr>}</tbody></table></div>
      <p className="muted" style={{ margin: 0 }}>{isEdit ? 'Qty bisa diubah dan produk bisa dibuang dari catatan ini. Batas: total dikirim tidak boleh melebihi qty PO, dan total diterima tidak boleh melebihi yang dikirim. Perubahan baru tersimpan setelah klik Simpan perubahan.' : `Isi hanya jumlah ${sh ? 'yang dikirim kali ini' : 'yang datang kali ini'} (bukan total). Tidak bisa melebihi ${sh ? 'sisa belum dikirim' : 'yang dalam perjalanan'}.`}</p>
      {sh && fx && <>
        <div className="field" style={{ maxWidth: 340 }}><label htmlFor="sh-rp">Total rupiah akhir sesuai invoice (opsional)</label><input id="sh-rp" type="text" inputMode="numeric" value={total} onChange={e => setTotal(e.target.value)} /></div>
        <div className="stats"><div className="stat"><span className="muted">Nilai barang kiriman ini</span><b style={{ fontSize: 18 }}>{fv ? `${po.cur} ${fv.toLocaleString('id-ID', { maximumFractionDigits: 2 })}` : '-'}</b></div>
          <div className="stat" style={{ background: 'var(--tealbg)' }}><span className="muted">Kurs efektif</span><b style={{ fontSize: 18 }}>{ek ? `Rp ${fmt(ek)} per ${po.cur}` : '-'}</b></div></div>
        <p className="muted" style={{ margin: 0 }}>Isi setelah invoice kiriman ini keluar, sudah termasuk ongkir, admin, dan pajak. Boleh dikosongkan dulu dan diisi nanti lewat detail pengiriman.</p></>}
    </Dialog>
  );
}
