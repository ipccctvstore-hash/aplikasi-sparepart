'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { getSettings, notifyChanged, rpc } from '@/lib/db';
import { fmtDate, leadTxt, nf, recentMonths } from '@/lib/format';
import { ST_CLS } from '@/lib/types';
import type { LbRow } from '@/lib/types';
import { Btn, ErrorBox, IconButton, Notice, Pill, Rule, SortTable, SearchBox, msg, useConfirm, useLoad, useToast } from '@/components/ui';
import { FxGeneric } from '@/components/Formulas';
import { FilterButton, MonthBar } from '@/components/Filters';
import { defaultLb, lbDates, useOnDataChanged, useSessionState } from '@/components/hooks';
import type { LbParams } from '@/components/hooks';
import { norm, useProductDialogs } from '@/components/ProductDialogs';
import { useMe } from '@/components/Shell';

const PAGE = 25;
type Stats = { total: number; over_th: number; perlu_po: number; cukup: number; pantau: number; saran_total: number };
type SyncLast = { kind: 'stok' | 'harga' | 'jual'; started_at: string; status: 'ok' | 'part' | 'fail' | null };

export default function BarangPage() {
  const me = useMe(), isSuper = me.role === 'super';
  const router = useRouter();
  const confirm = useConfirm(), toast = useToast();
  const dlg = useProductDialogs();
  const [lb, setLb] = useSessionState<LbParams>('lb', defaultLb());
  const [q, setQ] = useSessionState('lb-q', '');
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 }>({ key: 'asked', dir: -1 });
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<LbRow[]>([]);
  const [total, setTotal] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const settings = useLoad(getSettings, []);
  const st = settings.data;
  const th = lb.th ?? st?.ask_threshold ?? 10, cover = lb.cover ?? st?.cover_months ?? 1;
  const { from, to } = lbDates(lb);
  const key = [from, to, th, cover, lb.status, q, sort.key, sort.dir].join('|');

  const base = { p_from: from, p_to: to, p_th: th, p_cover: cover };
  const stats = useLoad(async () => (st ? (await rpc<Stats[]>('list_barang_stats', base))[0] : null), [from, to, th, cover, !!st]);
  const syncs = useLoad(async () => {
    const { data } = await supabase().from('sync_runs').select('kind,started_at,status').order('started_at', { ascending: false }).limit(60);
    const seen = new Map<string, SyncLast>();
    (data as SyncLast[] ?? []).forEach(r => { if (!seen.has(r.kind)) seen.set(r.kind, r); });
    return seen;
  }, []);

  async function load(offset: number) {
    if (!st) return;
    setBusy(true); setErr(null);
    try {
      const r = (await rpc<unknown[]>('list_barang', { ...base, p_status: lb.status, p_q: q, p_sort: sort.key, p_dir: sort.dir === 1 ? 'asc' : 'desc', p_limit: PAGE, p_offset: offset })).map(norm);
      setRows(prev => (offset ? [...prev, ...r] : r));
      setTotal(r[0]?.total_rows ?? (offset ? total : 0));
    } catch (e) { setErr(msg(e)); } finally { setBusy(false); }
  }
  useEffect(() => { load(0); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [key, !!st]);
  useOnDataChanged(() => { load(0); stats.reload(); syncs.reload(); });

  const monthKeys = useMemo(() => recentMonths(12).map(m => m.key).reverse(), []);
  const [a, b] = lb.fromM > lb.toM ? [lb.toM, lb.fromM] : [lb.fromM, lb.toM];
  const mx = Math.max(1, ...rows.flatMap(r => r.monthly ?? []));
  const fcount = (lb.status !== 'Semua' ? 1 : 0) + (lb.th !== null ? 1 : 0) + (lb.cover !== null ? 1 : 0);
  const d = defaultLb();
  const months = Math.max(1, (new Date(to).getTime() - new Date(from).getTime()) / 864e5 + 1) / 30;

  async function del(r: LbRow) {
    if (!(await confirm({ title: 'Hapus produk', danger: true, ok: 'Ya, hapus', msg: `Hapus produk ${r.sku}?`, detail: 'Produk yang sudah dipakai di request atau PO tidak bisa dihapus.' }))) return;
    const { error } = await supabase().from('products').delete().eq('sku', r.sku);
    if (error) { toast(error.code === '23503' ? `${r.sku} sudah dipakai di request atau PO, tidak bisa dihapus.` : error.message); return; }
    toast('Produk dihapus'); notifyChanged();
  }
  const sugg = stats.data?.saran_total ?? 0;
  const lab = { stok: 'Stok', harga: 'Harga dan diskon', jual: 'Penjualan' } as const;

  return (
    <>
      <div className="top"><div><h1>List Barang</h1><p className="sub">Stok, qty PO, ditanya, terjual, dan status kebutuhan PO. Klik produk untuk detail.</p></div>
        <div className="actions">
          <Btn variant="alt" onClick={dlg.sync}>Riwayat sync</Btn>
          <Btn variant="alt" onClick={() => dlg.form(null)}>+ Tambah Produk</Btn>
          {isSuper && <Btn disabled={!sugg} onClick={() => router.push('/banding?saran=1')}>{`Buat banding dari saran stok (${sugg})`}</Btn>}
        </div></div>
      <div className="toolbar">
        <SearchBox id="lq" value={q} onChange={setQ} placeholder="Cari part number atau nama" label="Cari produk" />
        <FilterButton open={open} count={fcount} onClick={() => setOpen(o => !o)} />
        <Btn sm variant="alt" className="perchip" onClick={() => setOpen(true)}>Periode: <b>{lbLabel(a, b)}</b></Btn>
      </div>
      {open && (
        <div className="fpanel">
          <MonthBar fromM={lb.fromM} toM={lb.toM} onChange={(x, y) => setLb({ ...lb, fromM: x, toM: y })} />
          <div className="fgrid">
            <div className="field"><label htmlFor="a-th">Ditanya minimal (kali)</label><input id="a-th" type="text" inputMode="numeric" value={lb.th ?? ''} placeholder={String(st?.ask_threshold ?? 10)} onChange={e => setLb({ ...lb, th: e.target.value.trim() === '' ? null : Math.max(1, parseInt(e.target.value, 10) || 1) })} /></div>
            <div className="field"><label htmlFor="a-cv">Cadangan (bulan)</label><input id="a-cv" type="text" inputMode="decimal" value={lb.cover ?? ''} placeholder={nf(st?.cover_months ?? 1)} onChange={e => { const v = parseFloat(e.target.value.replace(',', '.')); setLb({ ...lb, cover: e.target.value.trim() === '' || isNaN(v) ? null : Math.max(0, v) }); }} /></div>
            <div className="field"><label htmlFor="a-st">Status</label>
              <select id="a-st" value={lb.status} onChange={e => setLb({ ...lb, status: e.target.value })}>{['Semua', 'Perlu PO', 'Cukup', 'Pantau'].map(s => <option key={s}>{s}</option>)}</select></div>
          </div>
          <div className="ffoot"><Btn sm variant="alt" onClick={() => setLb(d)}>Reset filter</Btn></div>
        </div>
      )}
      <div className="syncrow">
        {(['stok', 'harga', 'jual'] as const).map(k => {
          const s = syncs.data?.get(k);
          const t = s ? new Date(s.started_at) : null;
          return <Pill key={k} cls={s?.status === 'ok' ? 'p-teal' : s?.status === 'fail' ? 'p-red' : s ? 'p-amber' : 'p-grey'}>
            {lab[k]}: {t ? `${fmtDate(t.toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' }))} ${t.toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', hour12: false }).replace(':', '.')}, ${s?.status === 'ok' ? 'sukses' : s?.status === 'fail' ? 'gagal' : s?.status === 'part' ? 'sebagian gagal' : 'berjalan'}` : 'belum pernah'}
          </Pill>;
        })}
      </div>
      <Rule title={`Rumus status dan saran qty (periode ${lbLabel(a, b)})`}><FxGeneric cover={cover} th={th} /></Rule>
      <div className="stats">
        <div className="stat"><span className="muted">Produk melewati ambang</span><b>{stats.data?.over_th ?? '-'}</b></div>
        <div className="stat"><span className="muted">Perlu PO</span><b style={{ color: 'var(--amberink)' }}>{stats.data?.perlu_po ?? '-'}</b></div>
        <div className="stat"><span className="muted">Tertutup stok atau PO</span><b style={{ color: 'var(--tealink)' }}>{stats.data?.cukup ?? '-'}</b></div>
      </div>
      <ErrorBox error={err || settings.error} />
      <SortTable<LbRow> serverSort sortKey={sort.key} sortDir={sort.dir} minWidth={isSuper ? 1910 : 1770} rows={rows} rowKey={r => r.sku}
        onSort={(k, dir) => setSort(dir === 0 ? { key: 'asked', dir: -1 } : { key: k, dir })}
        onRow={r => dlg.detail(r.sku)}
        empty={busy ? 'Memuat...' : 'Tidak ada produk yang cocok.'}
        cols={[
          { key: 'sku', label: 'Part number', sort: () => 0, render: r => <><span className="mono">{r.sku}</span>{!r.in_jurnal && <><br /><Pill>Belum di Jurnal</Pill></>}</> },
          { key: 'name', label: 'Nama barang', sort: () => 0, cls: 'pname', render: r => r.name || <span className="muted">-</span> },
          { key: 'm', label: 'Per bulan', nosort: true, render: r => (
            <div className="spark" title={(r.monthly ?? []).map((v, i) => `${monthKeys[i]}: ${v}`).join(', ')}>
              {(r.monthly ?? []).map((v, i) => <i key={i} className={monthKeys[i] >= a && monthKeys[i] <= b ? '' : 'off'} style={{ height: Math.max(3, Math.round(v / mx * 30)) }} />)}
            </div>) },
          { key: 'asked', label: 'Ditanya', sort: () => 0, render: r => <><b>{r.asked}</b><br /><span className="muted">{r.qsum} pcs diminta</span></> },
          { key: 'sold', label: 'Terjual (invoice Jurnal)', sort: () => 0, render: r => nf(r.sold) },
          { key: 'need', label: 'Kebutuhan per bulan', sort: () => 0, render: r => nf(r.need) },
          { key: 'stock', label: 'Stok Jurnal', sort: () => 0, render: r => r.stock },
          { key: 'wait', label: 'Di PO (menunggu kirim)', sort: () => 0, render: r => r.qty_wait },
          { key: 'ship', label: 'Proses kirim', sort: () => 0, render: r => r.qty_ship },
          { key: 'cover', label: 'Cukup untuk', sort: () => 0, render: r => <>{r.cover === null ? '-' : nf(r.cover) + ' bulan'}<br /><span className="muted">target {nf(r.target)}</span></> },
          { key: 'lead', label: 'Lama datang', sort: () => 0, render: r => <>{leadTxt(r.lead)}<br /><span className="muted">{r.lead_default ? 'belum ada supplier' : r.lead_name}</span></> },
          { key: 'status', label: 'Status', sort: () => 0, render: r => <Pill cls={ST_CLS[r.status]}>{r.status}</Pill> },
          { key: 'saran', label: 'Saran qty PO', sort: () => 0, render: r => (r.saran ? <b>{r.saran}</b> : <span className="muted">-</span>) },
          { key: 'act', label: '', nosort: true, cls: 'act', render: r => <>
            <IconButton icon="edit" label="Ubah produk" onClick={() => dlg.form(r.sku)} />
            {isSuper && <IconButton icon="trash" label="Hapus produk" cls="del" onClick={() => del(r)} />}</> },
        ]} />
      {rows.length < total && <div style={{ display: 'flex', justifyContent: 'center' }}><Btn variant="alt" disabled={busy} onClick={() => load(rows.length)}>{`Muat lagi (${rows.length} dari ${total})`}</Btn></div>}
      <p className="muted" style={{ margin: 0 }}>{rows.length} dari {total} produk.{isSuper ? '' : ' Hapus produk hanya untuk superadmin.'} Periode dihitung {nf(months)} bulan.</p>
      {st && !settings.error && total === 0 && !busy && !err && !q && lb.status === 'Semua' && <Notice blue>List Barang masih kosong. Impor data awal atau tambah produk dari tombol di atas.</Notice>}
    </>
  );
}

function lbLabel(a: string, b: string) {
  const m = recentMonths(12);
  const f = (k: string) => m.find(x => x.key === k)?.label ?? k;
  return a === b ? f(a) : `${f(a)} sampai ${f(b)}`;
}
