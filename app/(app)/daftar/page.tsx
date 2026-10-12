'use client';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { notifyChanged, rpc } from '@/lib/db';
import { fmt, fmtDate, fmtTime, normRange, rangeLabel, todayWib } from '@/lib/format';
import { REQ_ST_CLS } from '@/lib/types';
import { Btn, ErrorBox, IconButton, Pill, Rule, SearchBox, Seg, SortTable, msg, useConfirm, useLoad, useToast } from '@/components/ui';
import { FilterButton, RangeBar } from '@/components/Filters';
import { useOnDataChanged, useSessionState } from '@/components/hooks';
import { SnapPanel } from '@/components/SnapPanel';
import { useOpenRequest } from '@/components/RequestDialog';
import { useMe } from '@/components/Shell';

const PAGE = 25;
type Req = { id: number; req_date: string; req_time: string; customer: string; owner_id: string; owner: string; note: string; n_rows: number; n_done: number; n_unconf: number; n_unknown: number; status: string; helpers: string[]; total_rows: number };
type Item = { row_id: number; request_id: number; req_date: string; req_time: string; customer: string; owner: string; sku: string | null; typed_sku: string | null; raw_text: string; name: string; qty: number; is_done: boolean; unconfirmed: boolean; offers: { supplier: string; currency: string; quote: number | null; ready: boolean }[]; pl_price: number | null; tempo_disc: number | null; cash_disc: number | null; total_rows: number };

export default function Page() { return <Suspense><Daftar /></Suspense>; }

function Daftar() {
  const me = useMe(), isSuper = me.role === 'super';
  const sp = useSearchParams();
  const openReq = useOpenRequest(), confirm = useConfirm(), toast = useToast();
  const today = todayWib();
  const [view, setView] = useSessionState<'request' | 'produk'>('dv', 'request');
  const [range, setRange] = useSessionState('dr', { from: today, to: today });
  const [status, setStatus] = useSessionState('ds', 'Semua');
  const [owner, setOwner] = useSessionState('do', '');
  const [q, setQ] = useSessionState('dq', '');
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<(Req | Item)[]>([]);
  const [total, setTotal] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [lo, hi] = normRange(range.from, range.to);
  const users = useLoad(async () => (await supabase().from('profiles').select('id,name').order('name')).data ?? [], []);

  useEffect(() => { const x = sp.get('q'); if (x) { setQ(x); setRange({ from: '', to: '' }); } /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [sp]);

  const args = { p_from: lo || null, p_to: hi || null, p_status: status, p_owner: owner || null, p_q: q };
  async function load(offset: number) {
    setBusy(true); setErr(null);
    try {
      const r = await rpc<(Req | Item)[]>(view === 'request' ? 'list_requests' : 'list_request_items', { ...args, p_limit: PAGE, p_offset: offset });
      setRows(prev => (offset ? [...prev, ...r] : r));
      setTotal(r[0] ? Number(r[0].total_rows) : offset ? total : 0);
    } catch (e) { setErr(msg(e)); } finally { setBusy(false); }
  }
  const key = JSON.stringify([view, lo, hi, status, owner, q]);
  useEffect(() => { load(0); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [key]);
  useOnDataChanged(() => load(0));

  async function del(r: Req) {
    if (!(await confirm({ title: 'Hapus request', danger: true, ok: 'Ya, hapus', msg: `Hapus request ${r.customer} tanggal ${fmtDate(r.req_date)}?`, detail: `${r.n_rows} baris produk ikut terhapus. Tidak bisa dibatalkan.` }))) return;
    const { error } = await supabase().from('requests').delete().eq('id', r.id);
    if (error) { toast(error.message); return; }
    toast('Request dihapus'); notifyChanged();
  }
  const dateCell = (r: { req_date: string; req_time: string }) => <><span className="mono">{fmtDate(r.req_date)}</span><br /><span className="muted">{fmtTime(r.req_time)}</span></>;
  const fc = (status !== 'Semua' ? 1 : 0) + (owner ? 1 : 0);
  const offerText = (x: Item) => x.offers.length ? x.offers.map(o => `${o.supplier}${o.quote !== null ? (o.currency !== 'IDR' ? ` ${o.currency} ${o.quote}` : ` ${o.quote}%`) : ''}${o.ready ? '' : ' (tidak ready)'}`).join(', ') : <span className="muted">Belum diisi</span>;

  return (
    <>
      <div className="top"><div><h1>Daftar Request</h1><p className="sub">Semua admin melihat daftar yang sama.</p></div><div className="actions"><Btn icon="plus" onClick={() => openReq(null)}>Tambah Request</Btn></div></div>
      <SnapPanel toggle from={range.from} to={range.to} onPick={id => { setOwner(id); setView('request'); }} />
      <div className="toolbar">
        <Seg label="Tampilan" value={view} options={[['request', 'Per request'], ['produk', 'Per produk']]} onChange={setView} />
        <SearchBox id="rq" value={q} onChange={setQ} placeholder="Cari customer, part, supplier" label="Cari customer, part number, atau supplier" />
        <FilterButton open={open} count={fc} onClick={() => setOpen(o => !o)} />
        <Btn sm variant="alt" className="perchip" onClick={() => setOpen(true)}>Periode: <b>{rangeLabel(range.from, range.to)}</b></Btn>
      </div>
      {open && (
        <div className="fpanel">
          <RangeBar from={range.from} to={range.to} max={today} onChange={(f, t) => setRange({ from: f, to: t })} />
          <div className="fgrid">
            <div className="field"><label htmlFor="rs">Status request</label><select id="rs" value={status} onChange={e => setStatus(e.target.value)}>{['Semua', 'Belum diisi', 'Sedang diisi', 'Selesai'].map(s => <option key={s}>{s}</option>)}</select></div>
            <div className="field"><label htmlFor="rh">Penanggung jawab</label><select id="rh" value={owner} onChange={e => setOwner(e.target.value)}><option value="">Semua</option>{(users.data ?? []).map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</select></div>
          </div>
          <div className="ffoot"><Btn sm variant="alt" onClick={() => { setStatus('Semua'); setOwner(''); setRange({ from: today, to: today }); setQ(''); }}>Reset filter</Btn></div>
        </div>
      )}
      <Rule title="Arti status"><p style={{ margin: '4px 0 8px' }}><b>Belum diisi</b>: belum ada produk yang punya supplier.<br /><b>Sedang diisi</b>: sebagian produk sudah ada supplier.<br /><b>Selesai</b>: semua produk sudah ada supplier.<br />Status dihitung otomatis. Isian otomatis dari request lain baru dihitung setelah dikonfirmasi.</p></Rule>
      <ErrorBox error={err} />
      {view === 'request' ? (
        <SortTable<Req> minWidth={900} rows={rows as Req[]} rowKey={r => r.id} onRow={r => openReq(r.id)} empty={busy ? 'Memuat...' : 'Tidak ada request yang cocok. Klik Tambah Request untuk menambah.'}
          cols={[
            { key: 'd', label: 'Tanggal', sort: r => r.req_date + r.req_time, render: dateCell },
            { key: 'c', label: 'Customer', sort: r => r.customer, render: r => <b>{r.customer}</b> },
            { key: 'o', label: 'Penanggung jawab', sort: r => r.owner, render: r => r.owner },
            { key: 'n', label: 'Part', sort: r => r.n_rows, render: r => r.n_rows },
            { key: 'k', label: 'Kelengkapan', sort: r => (r.n_rows ? r.n_done / r.n_rows : 0), style: { minWidth: 170 }, render: r => <><div className="bar"><i style={{ width: `${r.n_rows ? Math.round(r.n_done / r.n_rows * 100) : 0}%` }} /></div><span className="muted">{r.n_done} dari {r.n_rows} sudah ada penawaran supplier</span></> },
            { key: 's', label: 'Status', sort: r => r.status, render: r => <>
              <Pill cls={REQ_ST_CLS[r.status]}>{r.status}</Pill>
              {r.n_unconf > 0 && <><br /><Pill cls="p-blue" style={{ marginTop: 4 }}>{r.n_unconf} perlu konfirmasi</Pill></>}
              {r.n_unknown > 0 && <><br /><Pill cls="p-amber" style={{ marginTop: 4 }}>{r.n_unknown} bukan list produk</Pill></>}
              {r.helpers.length > 0 && <><br /><Pill cls="p-blue" style={{ marginTop: 4 }}>Dilengkapi {r.helpers.join(', ')}</Pill></>}</> },
            { key: 'nt', label: 'Catatan', render: r => <span className="muted">{r.note}</span>, nosort: true },
            { key: 'a', label: '', nosort: true, cls: 'act', render: r => <><IconButton icon="edit" label="Ubah request" onClick={() => openReq(r.id)} />{isSuper && <IconButton icon="trash" label="Hapus request" cls="del" onClick={() => del(r)} />}</> },
          ]} />
      ) : (
        <SortTable<Item> minWidth={1310} rows={rows as Item[]} rowKey={r => r.row_id} onRow={r => openReq(r.request_id)} empty={busy ? 'Memuat...' : 'Tidak ada produk yang cocok.'}
          cols={[
            { key: 'p', label: 'Part number', sort: r => r.sku ?? r.typed_sku, render: r => <><span className="mono">{r.sku ?? r.typed_sku ?? r.raw_text}</span>{!r.sku && <><br /><Pill cls="p-amber">Bukan list produk</Pill></>}</> },
            { key: 'n', label: 'Nama barang', cls: 'pname', sort: r => r.name, render: r => r.name || <span className="muted">-</span> },
            { key: 'q', label: 'Qty', sort: r => r.qty, render: r => r.qty },
            { key: 'c', label: 'Customer', sort: r => r.customer, render: r => <b>{r.customer}</b> },
            { key: 'd', label: 'Tanggal', sort: r => r.req_date + r.req_time, render: dateCell },
            { key: 'h', label: 'Handle', sort: r => r.owner, render: r => r.owner },
            { key: 'o', label: 'Penawaran supplier', nosort: true, render: offerText },
            { key: 'pl', label: 'PL dan diskon', nosort: true, render: r => (r.pl_price ? <>{fmt(r.pl_price)}<br /><span className="muted">tempo {r.tempo_disc ?? '-'}, cash {r.cash_disc ?? '-'}</span></> : <span className="muted">-</span>) },
            { key: 'i', label: 'Isian', sort: r => (r.is_done ? 1 : 0), render: r => (r.unconfirmed ? <Pill cls="p-blue">Perlu konfirmasi</Pill> : <Pill cls={r.is_done ? 'p-teal' : 'p-grey'}>{r.is_done ? 'Lengkap' : 'Belum'}</Pill>) },
          ]} />
      )}
      {rows.length < total && <div style={{ display: 'flex', justifyContent: 'center' }}><Btn variant="alt" disabled={busy} onClick={() => load(rows.length)}>{`Muat lagi (${rows.length} dari ${total})`}</Btn></div>}
      <p className="muted" style={{ margin: 0 }}>{total} {view === 'request' ? 'request' : 'baris produk'}. Klik baris untuk membuka. Request admin lain boleh dilengkapi.</p>
    </>
  );
}
