'use client';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { getSettings, rpc } from '@/lib/db';
import { fmtDate, fmtTime, normRange, rangeLabel, todayWib } from '@/lib/format';
import { PO_STATUS_CLS, PO_STATUS_LABEL } from '@/lib/types';
import type { PoStatus } from '@/lib/types';
import { Btn, ErrorBox, Notice, Pill, useLoad } from '@/components/ui';
import { FilterButton, RangeBar } from '@/components/Filters';
import { defaultLb, lbDates, useOnDataChanged, useSessionState } from '@/components/hooks';
import type { LbParams } from '@/components/hooks';
import { norm, useProductDialogs } from '@/components/ProductDialogs';
import { useOpenRequest } from '@/components/RequestDialog';
import { SnapPanel } from '@/components/SnapPanel';
import { useMe } from '@/components/Shell';
import { useState } from 'react';

type Stat = { name: string; req: number; selesai: number; dibantu: number; prod: number; done: number };
type Req = { id: number; req_date: string; req_time: string; customer: string; owner: string; n_rows: number; n_done: number; total_rows: number };

export default function Dashboard() {
  const me = useMe(), isSuper = me.role === 'super';
  const router = useRouter(), dlg = useProductDialogs(), openReq = useOpenRequest();
  const today = todayWib();
  const [range, setRange] = useSessionState('dash', { from: today, to: today });
  const [lb] = useSessionState<LbParams>('lb', defaultLb());
  const [open, setOpen] = useState(false);
  const [lo, hi] = normRange(range.from, range.to);
  const PL = rangeLabel(range.from, range.to);

  const d = useLoad(async () => {
    const sb = supabase();
    const st = await getSettings();
    const { from, to } = lbDates(lb);
    const th = lb.th ?? st.ask_threshold, cover = lb.cover ?? st.cover_months;
    const dFrom = lo || (() => { const t = new Date(today + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() - 13); return t.toISOString().slice(0, 10); })();
    const dTo = hi || today;
    const [stats, open, need, low, perDay, syncs, pos, cmps] = await Promise.all([
      rpc<Stat[]>('admin_stats', { p_from: lo || null, p_to: hi || null }),
      rpc<Req[]>('list_requests', { p_from: lo || null, p_to: hi || null, p_status: 'Belum selesai', p_limit: 100, p_offset: 0 }),
      rpc<unknown[]>('list_barang', { p_from: from, p_to: to, p_th: th, p_cover: cover, p_status: 'Perlu PO', p_q: '', p_sort: 'asked', p_dir: 'desc', p_limit: 100, p_offset: 0 }),
      rpc<{ sku: string; name: string; stock: number; qty_wait: number; qty_ship: number; asked: number; hidden: boolean }[]>('list_menipis', { p_from: from, p_to: to, p_th: th, p_cover: cover }),
      rpc<{ day: string; n: number }[]>('requests_per_day', { p_from: (() => { const m = new Date(dTo + 'T00:00:00Z'); m.setUTCDate(m.getUTCDate() - 30); const mm = m.toISOString().slice(0, 10); return dFrom > mm ? dFrom : mm; })(), p_to: dTo }),
      sb.from('sync_runs').select('kind,started_at,status').order('started_at', { ascending: false }).limit(60),
      isSuper ? sb.from('v_po_list').select('po_id,name,status,supplier_name,sent_total,qty_total,recv_total').in('status', ['draft', 'dipesan']) : Promise.resolve({ data: [] as any[] }),
      isSuper ? sb.from('comparisons').select('id,purchase_orders(id)') : Promise.resolve({ data: [] as any[] }),
    ]);
    const openOut = (await rpc<Req[]>('list_requests', { p_status: 'Belum selesai', p_limit: 1, p_offset: 0 }))[0]?.total_rows ?? 0;
    return { stats, open, need: need.map(norm), low: low.map(r => ({ ...r, stock: +r.stock, qty_wait: +r.qty_wait, qty_ship: +r.qty_ship, asked: +r.asked })).filter(r => !r.hidden), perDay, syncs: syncs.data ?? [], pos: pos.data ?? [], cmpOpen: (cmps.data ?? []).filter((c: any) => !(c.purchase_orders ?? []).length).length, openOut: Number(openOut) };
  }, [lo, hi, lb.fromM, lb.toM, lb.th, lb.cover]);
  useOnDataChanged(d.reload);

  const v = d.data;
  const tot = (v?.stats ?? []).reduce((a, s) => ({ req: a.req + s.req, selesai: a.selesai + s.selesai, dibantu: a.dibantu + s.dibantu, prod: a.prod + s.prod, done: a.done + s.done }), { req: 0, selesai: 0, dibantu: 0, prod: 0, done: 0 });
  const openIn = v?.open ?? [];
  const waiting = openIn.reduce((a, r) => a + (r.n_rows - r.n_done), 0);
  const openCount = openIn[0] ? Number(openIn[0].total_rows) : 0;
  const openOut = Math.max(0, (v?.openOut ?? 0) - openCount);
  const lowNoPo = (v?.low ?? []).filter(r => r.qty_wait + r.qty_ship === 0).length;
  const top = [...(v?.stats ?? [])].sort((a, b) => b.req - a.req)[0];
  const idle = (v?.stats ?? []).filter(s => !s.req).map(s => s.name);
  const byOwner: Record<string, number> = {}; openIn.forEach(r => { byOwner[r.owner] = (byOwner[r.owner] || 0) + 1; });
  const needLow = (v?.need ?? []).filter(r => v?.low.some(l => l.sku === r.sku)).length;
  const dc = v?.perDay ?? [], mx = Math.max(1, ...dc.map(x => x.n));
  const concl: React.ReactNode[] = !v ? [] : [
    <>Periode <b>{PL}</b>: <b>{tot.req}</b> request ({tot.prod} produk). <b>{tot.done}</b> dari {tot.prod} produk sudah ada penawaran supplier{tot.prod && tot.done < tot.prod ? `, tersisa ${tot.prod - tot.done} produk` : ''}.</>,
    openCount ? <><b>{openCount}</b> request belum selesai di periode ini, dengan <b>{waiting}</b> produk yang masih menunggu penawaran supplier atau konfirmasi.{Object.keys(byOwner).length ? ' Per penanggung jawab: ' + Object.entries(byOwner).map(([k, n]) => `${k} ${n}`).join(', ') + '.' : ''}</> : 'Semua request di periode ini sudah selesai.',
    openOut ? <>Ada <b>{openOut}</b> request belum selesai di luar periode ini.</> : null,
    top && top.req ? <>Input terbanyak: <b>{top.name}</b> ({top.req} request, {top.done} dari {top.prod} produk sudah ada supplier).{idle.length ? ` Belum ada input: ${idle.join(', ')}.` : ''}</> : 'Belum ada request masuk di periode ini.',
    tot.dibantu ? <><b>{tot.dibantu}</b> request dilengkapi admin lain (penanggung jawab awal tetap tercatat).</> : null,
    <>Sekarang: <b>{v.need.length}</b> produk berstatus Perlu PO{v.need.length ? `, ${needLow} di antaranya juga stok menipis` : ''}; <b>{v.low.length}</b> produk stok menipis, {lowNoPo} belum ada PO. (Stok dan PO tidak tergantung periode.)</>,
    isSuper ? <><b>{v.pos.length}</b> PO masih berjalan dan <b>{v.cmpOpen}</b> banding harga belum dibuatkan PO.</> : null,
  ].filter(Boolean);

  const lab = { stok: 'Stok', harga: 'Harga dan diskon', jual: 'Penjualan' } as const;
  const lastSync = (['stok', 'harga', 'jual'] as const).map(k => (v?.syncs as any[] | undefined)?.find(s => s.kind === k));
  const syncWarn = lastSync.some(s => s && s.status !== 'ok');
  const tbl = (head: string[], body: React.ReactNode, empty: string, has: boolean) => (
    <div className="wrap" style={{ maxHeight: 340 }}><table style={{ minWidth: 0 }}><thead><tr>{head.map(h => <th key={h}>{h}</th>)}</tr></thead><tbody>{has ? body : <tr><td colSpan={head.length} className="muted" style={{ padding: 16 }}>{empty}</td></tr>}</tbody></table></div>
  );

  return (
    <>
      <div className="top"><div><h1>Dashboard</h1><p className="sub">Progress input request mengikuti periode. Stok menipis, Perlu PO, dan PO adalah kondisi saat ini.</p></div></div>
      <div className="toolbar"><FilterButton open={open} onClick={() => setOpen(o => !o)} /><Btn sm variant="alt" className="perchip" onClick={() => setOpen(true)}>Periode: <b>{PL}</b></Btn></div>
      {open && <div className="fpanel"><RangeBar from={range.from} to={range.to} max={today} onChange={(f, t) => setRange({ from: f, to: t })} /></div>}
      <ErrorBox error={d.error} />
      <div className="syncrow" aria-label="Terakhir sync Jurnal"><span className="muted" style={{ alignSelf: 'center' }}>Terakhir sync Jurnal:</span>
        {(['stok', 'harga', 'jual'] as const).map((k, i) => {
          const s = lastSync[i];
          return <Pill key={k} cls={s?.status === 'ok' ? 'p-teal' : s?.status === 'fail' ? 'p-red' : s ? 'p-amber' : 'p-grey'}>{lab[k]}: {s ? `${fmtDate(new Date(s.started_at).toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' }))} ${new Date(s.started_at).toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', hour12: false }).replace(':', '.')}, ${s.status === 'ok' ? 'sukses' : s.status === 'fail' ? 'gagal' : 'sebagian gagal'}` : 'belum pernah'}</Pill>;
        })}</div>
      {syncWarn && <Notice>Ada sync Jurnal yang belum sukses penuh. Buka List Barang, Riwayat sync, untuk melihat produk yang gagal.</Notice>}
      <div className="tiles">
        <div className="tile t-red"><span>Request ({PL})</span><b>{tot.req}</b><span>{tot.selesai} selesai</span></div>
        <div className="tile t-green"><span>Progress pengisian ({PL})</span><b>{tot.done}</b><span>dari {tot.prod} produk sudah ada supplier</span></div>
        <div className="tile t-amber"><span>Produk Perlu PO</span><b>{v?.need.length ?? '-'}</b><span>dari List Barang</span></div>
        <div className="tile t-blue"><span>Stok menipis</span><b>{v?.low.length ?? '-'}</b><span>{v?.low.filter(r => r.stock === 0).length ?? 0} stok 0, {lowNoPo} belum ada PO</span></div>
        {isSuper && <div className="tile t-grey"><span>PO berjalan</span><b>{v?.pos.length ?? '-'}</b><span>{v?.cmpOpen ?? 0} banding belum jadi PO</span></div>}
      </div>
      <section className="card"><h2>Kesimpulan</h2><ul className="concl">{concl.map((c, i) => <li key={i}>{c}</li>)}</ul></section>
      <SnapPanel from={range.from} to={range.to} onPick={id => router.push('/daftar')} />
      <section className="card"><h2>Request per hari</h2>
        <div className="days" role="img" aria-label="Jumlah request per hari">{dc.slice(-31).map(x => <div key={x.day}><span className="muted">{x.n}</span><i style={{ height: Math.max(3, Math.round(x.n / mx * 70)) }} /><span className="muted">{x.day.slice(8)}/{x.day.slice(5, 7)}</span></div>)}</div></section>
      <div className="dgrid">
        <section className="card"><h2>Perlu PO teratas</h2>{tbl(['Part number', 'Nama barang', 'Ditanya', 'Stok', 'Saran qty'], (v?.need ?? []).slice(0, 6).map(r => <tr key={r.sku} className="click" onClick={() => dlg.detail(r.sku)}><td className="mono">{r.sku}</td><td className="pname">{r.name || '-'}</td><td>{r.asked}</td><td>{r.stock}</td><td><b>{r.saran}</b></td></tr>), 'Belum ada produk Perlu PO.', !!v?.need.length)}</section>
        <section className="card"><h2>Stok menipis</h2>{tbl(['Part number', 'Nama barang', 'Stok', 'Di PO', 'Ditanya'], [...(v?.low ?? [])].sort((a, b) => a.stock - b.stock || b.asked - a.asked).slice(0, 6).map(r => <tr key={r.sku} className="click" onClick={() => dlg.detail(r.sku)}><td className="mono">{r.sku}</td><td className="pname">{r.name || '-'}</td><td><Pill cls={r.stock === 0 ? 'p-red' : 'p-amber'}>{r.stock}</Pill></td><td>{r.qty_wait + r.qty_ship}</td><td>{r.asked}</td></tr>), 'Tidak ada stok menipis.', !!v?.low.length)}</section>
        <section className="card"><h2>Request belum selesai ({PL})</h2>{tbl(['Tanggal', 'Customer', 'Penanggung jawab', 'Isi'], openIn.slice(0, 6).map(r => <tr key={r.id} className="click" onClick={() => openReq(r.id)}><td><span className="mono">{fmtDate(r.req_date)}</span><br /><span className="muted">{fmtTime(r.req_time)}</span></td><td><b>{r.customer}</b></td><td>{r.owner}</td><td>{r.n_done} dari {r.n_rows}</td></tr>), 'Semua request di periode ini sudah selesai.', openIn.length > 0)}</section>
        {isSuper && <section className="card"><h2>PO berjalan</h2>{tbl(['PO', 'Supplier', 'Dikirim', 'Diterima'], (v?.pos ?? []).map((p: any) => <tr key={p.po_id} className="click" onClick={() => router.push('/po?id=' + p.po_id)}><td><b>{p.name}</b><br /><Pill cls={PO_STATUS_CLS[p.status as PoStatus]}>{PO_STATUS_LABEL[p.status as PoStatus]}</Pill></td><td>{p.supplier_name}</td><td>{p.sent_total} dari {p.qty_total}</td><td>{p.recv_total}</td></tr>), 'Tidak ada PO berjalan.', !!v?.pos.length)}</section>}
      </div>
    </>
  );
}
