'use client';
import { useRouter } from 'next/navigation';
import { createContext, useCallback, useContext, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { getProducts, notifyChanged, rpc } from '@/lib/db';
import { daysBetween, fmt, fmtDate, MN, nf, todayWib } from '@/lib/format';
import { parseCat } from '@/lib/parse';
import { PO_STATUS_CLS, PO_STATUS_LABEL, REQ_ST_CLS, ST_CLS } from '@/lib/types';
import type { LbRow, PoStatus, Product, Settings } from '@/lib/types';
import { Btn, Dialog, ErrorBox, Notice, Pill, Rule, SortTable, msg, useConfirm, useLoad, useToast } from './ui';
import { FxProduct } from './Formulas';
import { defaultLb, lbDates, useSessionState } from './hooks';
import type { LbParams } from './hooks';
import { useMe } from './Shell';
import { useOpenRequest } from './RequestDialog';
import { getSettings } from '@/lib/db';

type Api = { detail: (sku: string) => void; form: (sku: string | null) => void; sync: () => void };
const Ctx = createContext<Api>({ detail: () => {}, form: () => {}, sync: () => {} });
export const useProductDialogs = () => useContext(Ctx);

export function ProductHost({ children }: { children: React.ReactNode }) {
  const [st, setSt] = useState<{ kind: 'detail' | 'form' | 'sync'; sku: string | null } | null>(null);
  const api: Api = {
    detail: useCallback((sku: string) => setSt({ kind: 'detail', sku }), []),
    form: useCallback((sku: string | null) => setSt({ kind: 'form', sku }), []),
    sync: useCallback(() => setSt({ kind: 'sync', sku: null }), []),
  };
  const close = () => setSt(null);
  return (
    <Ctx.Provider value={api}>
      {children}
      {st?.kind === 'detail' && st.sku && <ProductDetail sku={st.sku} onClose={close} />}
      {st?.kind === 'form' && <ProductForm sku={st.sku} onClose={close} />}
      {st?.kind === 'sync' && <SyncDialog onClose={close} />}
    </Ctx.Provider>
  );
}

/* ===== Detail produk ===== */
type ReqItem = { row_id: number; request_id: number; req_date: string; req_time: string; customer: string; owner: string; qty: number; is_done: boolean; sku: string };
type PoLine = { line_id: number; qty: number; price: number | null; sent: number; recv: number; po: { id: number; name: string; status: PoStatus; supplier: { name: string } | null; kurs_perkiraan: number | null } | null };

function ProductDetail({ sku, onClose }: { sku: string; onClose: () => void }) {
  const me = useMe();
  const router = useRouter();
  const openReq = useOpenRequest();
  const [tab, setTab] = useState<'req' | 'po' | 'sales'>('req');
  const [lb] = useSessionState<LbParams>('lb', defaultLb());
  const sb = supabase();
  const { from, to } = lbDates(lb);
  const months = (daysBetween(from, to) + 1) / 30;

  const base = useLoad(async () => {
    const [st, p, q] = await Promise.all([
      getSettings(),
      getProducts([sku]),
      sb.from('v_po_qty').select('qty_wait,qty_ship').eq('sku', sku).maybeSingle(),
    ]);
    const th = lb.th ?? st.ask_threshold, cover = lb.cover ?? st.cover_months;
    const rows = await rpc<LbRow[]>('list_barang', { p_from: from, p_to: to, p_th: th, p_cover: cover, p_status: 'Semua', p_q: sku, p_sort: 'sku', p_dir: 'asc', p_limit: 20, p_offset: 0 });
    const calc = rows.map(norm).find(r => r.sku === sku) ?? null;
    return { st, th, cover, product: p.get(sku) ?? null, calc, wait: Number(q.data?.qty_wait ?? 0), ship: Number(q.data?.qty_ship ?? 0) };
  }, [sku]);

  const reqs = useLoad(async () => {
    if (tab !== 'req') return [] as ReqItem[];
    const r = await rpc<ReqItem[]>('list_request_items', { p_q: sku, p_limit: 100, p_offset: 0 });
    return r.filter(x => x.sku === sku);
  }, [sku, tab]);

  const pos = useLoad(async () => {
    if (tab !== 'po' || me.role !== 'super') return [] as PoLine[];
    const { data, error } = await sb.from('po_lines').select('id,qty,price,po:purchase_orders(id,name,status,kurs_perkiraan,supplier:suppliers(name))').eq('sku', sku);
    if (error) throw error;
    const ids = (data ?? []).map((x: { id: number }) => x.id);
    const { data: t } = ids.length ? await sb.from('v_po_line_totals').select('line_id,sent,recv').in('line_id', ids) : { data: [] as { line_id: number; sent: number; recv: number }[] };
    const m = new Map((t ?? []).map(x => [x.line_id, x]));
    return (data ?? []).map((x: any) => ({ line_id: x.id, qty: x.qty, price: x.price === null ? null : Number(x.price), sent: m.get(x.id)?.sent ?? 0, recv: m.get(x.id)?.recv ?? 0, po: x.po })) as PoLine[];
  }, [sku, tab]);

  const monthly = useLoad(async () => (tab === 'sales' ? await rpc<{ month: string; asked: number; qty: number; sold: number }[]>('product_monthly', { p_sku: sku, p_months: 12 }) : []), [sku, tab]);

  const p = base.data?.product, c = base.data?.calc;
  const pl = p?.pl_price && p.pl_price > 0 ? p.pl_price : null;
  const disc = p && p.tempo_disc !== null && p.cash_disc !== null ? `Tempo ${p.tempo_disc}%, Cash ${p.cash_disc}%` : '-';
  const isSuper = me.role === 'super';

  return (
    <Dialog wide title={`Detail produk: ${sku}`} onClose={onClose}
      footer={<><Btn variant="alt" onClick={() => { onClose(); router.push('/daftar?q=' + encodeURIComponent(sku)); }}>Buka di Daftar Request</Btn><Btn onClick={onClose}>Tutup</Btn></>}>
      <ErrorBox error={base.error} />
      {base.loading && !p && <p className="muted">Memuat...</p>}
      {p && (
        <>
          <div className="pname" style={{ fontWeight: 600 }}>{p.name || <span className="muted">Nama barang belum diisi</span>}</div>
          <div className="stats">
            <div className="stat"><span className="muted">Stok Jurnal</span><b>{p.stock_qty}</b></div>
            <div className="stat"><span className="muted">Di PO (menunggu kirim)</span><b>{base.data?.wait ?? 0}</b></div>
            <div className="stat"><span className="muted">Proses kirim</span><b>{base.data?.ship ?? 0}</b></div>
            <div className="stat"><span className="muted">Harga PL</span><b style={{ fontSize: 18 }}>{pl ? fmt(pl) + (p.in_jurnal ? '' : ' (manual)') : '-'}</b></div>
            <div className="stat"><span className="muted">Diskon</span><b style={{ fontSize: 18 }}>{disc}</b></div>
          </div>
          {c && base.data && (
            <Rule title={`Hitungan produk ini (periode ${fmtDate(from)} sampai ${fmtDate(to)})`} open>
              <FxProduct r={c} months={months} cover={base.data.cover} th={base.data.th} />
            </Rule>
          )}
        </>
      )}
      <div className="steps">
        {([['req', 'Request'], ['po', 'PO'], ['sales', 'Penjualan']] as const).map(([k, t]) => <button key={k} type="button" className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{t}</button>)}
      </div>
      {tab === 'req' && (
        <>
          <ErrorBox error={reqs.error} />
          {reqs.data && reqs.data.length === 0 && !reqs.loading && <Notice blue>Belum ada request untuk produk ini di aplikasi.</Notice>}
          {reqs.data && reqs.data.length > 0 && (
            <SortTable minWidth={640} rowKey={r => r.row_id} onRow={r => openReq(r.request_id)} rows={reqs.data}
              cols={[
                { key: 'd', label: 'Tanggal', render: r => <>{fmtDate(r.req_date)}</>, sort: r => r.req_date + r.req_time },
                { key: 'c', label: 'Customer', render: r => <b>{r.customer}</b>, sort: r => r.customer },
                { key: 'h', label: 'Handle', render: r => r.owner, sort: r => r.owner },
                { key: 'q', label: 'Qty', render: r => r.qty, sort: r => r.qty },
                { key: 's', label: 'Supplier', render: r => <Pill cls={r.is_done ? REQ_ST_CLS.Selesai : REQ_ST_CLS['Belum diisi']}>{r.is_done ? 'Sudah ada' : 'Belum'}</Pill> },
              ]} />
          )}
          <p className="muted" style={{ margin: 0 }}>Klik baris untuk membuka request.</p>
        </>
      )}
      {tab === 'po' && (!isSuper ? <Notice blue>Detail PO (supplier, harga, dan pengiriman) hanya untuk superadmin. Qty di PO dan proses kirim tampil di atas.</Notice> : (
        <>
          <ErrorBox error={pos.error} />
          {pos.data && pos.data.length === 0 && !pos.loading && <Notice blue>Belum ada PO untuk produk ini.</Notice>}
          {pos.data && pos.data.length > 0 && (
            <SortTable minWidth={700} rowKey={r => r.line_id} rows={pos.data}
              cols={[
                { key: 'po', label: 'PO', render: r => <><b>{r.po?.name}</b><br />{r.po && <Pill cls={PO_STATUS_CLS[r.po.status]}>{PO_STATUS_LABEL[r.po.status]}</Pill>}</>, sort: r => r.po?.name },
                { key: 's', label: 'Supplier', render: r => r.po?.supplier?.name ?? '-', sort: r => r.po?.supplier?.name },
                { key: 'q', label: 'Qty', render: r => r.qty, sort: r => r.qty },
                { key: 'p', label: 'Harga per pcs (mata uang PO)', render: r => (r.price === null ? '-' : fmt(r.price)), sort: r => r.price },
                { key: 'k', label: 'Sudah dikirim', render: r => r.sent, sort: r => r.sent },
                { key: 'r', label: 'Diterima', render: r => r.recv, sort: r => r.recv },
              ]} />
          )}
        </>
      ))}
      {tab === 'sales' && (
        <>
          <ErrorBox error={monthly.error} />
          <SortTable minWidth={520} rowKey={r => r.month} rows={monthly.data ?? []}
            cols={[
              { key: 'm', label: 'Bulan', render: r => `${MN[+r.month.slice(5, 7) - 1]} ${r.month.slice(0, 4)}` },
              { key: 'a', label: 'Ditanya', render: r => r.asked },
              { key: 'q', label: 'Qty diminta', render: r => r.qty },
              { key: 's', label: 'Terjual (invoice Jurnal)', render: r => nf(Number(r.sold)) },
            ]} />
          <p className="muted" style={{ margin: 0 }}>Terjual diambil dari invoice penjualan Jurnal (hanya baca), tanpa invoice yang dibatalkan.</p>
        </>
      )}
    </Dialog>
  );
}

/** Hasil RPC memberi angka numerik sebagai string; ubah ke number. */
export function norm(r: any): LbRow {
  const n = (x: unknown) => (x === null || x === undefined ? null : Number(x));
  return {
    ...r, asked: Number(r.asked), qsum: Number(r.qsum), sold: Number(r.sold), need: Number(r.need), stock: Number(r.stock),
    qty_wait: Number(r.qty_wait), qty_ship: Number(r.qty_ship), have: Number(r.have), cover: n(r.cover), lead: Number(r.lead),
    target: Number(r.target), saran: Number(r.saran), total_rows: r.total_rows === undefined ? undefined : Number(r.total_rows),
  } as LbRow;
}

/* ===== Tambah / ubah produk ===== */
function ProductForm({ sku, onClose }: { sku: string | null; onClose: () => void }) {
  const confirm = useConfirm();
  const toast = useToast();
  const sb = supabase();
  const [id, setId] = useState(sku ?? '');
  const [name, setName] = useState('');
  const [pl, setPl] = useState('');
  const [cat, setCat] = useState('');
  const [inJ, setInJ] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ready, setReady] = useState(!sku);
  const [busy, setBusy] = useState(false);
  const edit = !!sku;

  useLoad(async () => {
    if (!sku) return null;
    const { data, error } = await sb.from('products').select('sku,name,local_pl,local_tempo,local_cash').eq('sku', sku).single();
    if (error) throw error;
    const m = await getProducts([sku]);
    const p = m.get(sku) as Product | undefined;
    setName(data.name ?? '');
    setInJ(!!p?.in_jurnal);
    setPl(data.local_pl === null ? '' : String(data.local_pl));
    setCat(data.local_tempo === null ? '' : data.local_tempo === data.local_cash ? String(data.local_tempo) : `${data.local_tempo} cash ${data.local_cash}`);
    setReady(true);
    return null;
  }, [sku]);

  async function save() {
    setErr(null);
    const key = id.trim().toUpperCase();
    if (!key) { setErr('Isi part number dulu.'); return; }
    let tempo: number | null = null, cash: number | null = null;
    if (!inJ && cat.trim()) {
      const c = parseCat(cat);
      if (!c) { setErr('Diskon tidak terbaca. Tulis 10 (tempo dan cash sama) atau 10 cash 15.'); return; }
      tempo = +c.tempo; cash = +c.cash;
    }
    const plv = !inJ && pl.trim() ? Number(pl.replace(/\./g, '').replace(',', '.')) : null;
    if (plv !== null && !(plv >= 0)) { setErr('Harga PL tidak valid.'); return; }
    if (!(await confirm({ title: edit ? 'Ubah produk' : 'Tambah produk', ok: 'Ya, simpan', msg: edit ? `Simpan perubahan produk ${key}?` : `Tambahkan produk ${key} ke List Barang?` }))) return;
    setBusy(true);
    try {
      if (!edit) {
        await rpc('ensure_product', { p_sku: key, p_name: name.trim() });
        if (plv !== null || tempo !== null) {
          const { error } = await sb.from('products').update({ local_pl: plv, local_tempo: tempo, local_cash: cash }).eq('sku', key);
          if (error) throw error;
        }
      } else {
        const patch: Record<string, unknown> = {};
        if (!inJ) Object.assign(patch, { name: name.trim(), local_pl: plv, local_tempo: tempo, local_cash: cash });
        if (Object.keys(patch).length) {
          const { error } = await sb.from('products').update(patch).eq('sku', key);
          if (error) throw error;
        }
      }
      toast(edit ? 'Produk diperbarui' : 'Produk ditambahkan');
      notifyChanged(); onClose();
    } catch (e) { setErr(msg(e)); setBusy(false); }
  }

  return (
    <Dialog title={edit ? 'Ubah produk' : 'Tambah produk'} onClose={onClose} footer={<><Btn variant="alt" onClick={onClose}>Batal</Btn><Btn icon="check" disabled={!ready || busy} onClick={save}>Simpan</Btn></>}>
      <ErrorBox error={err} />
      <div className="field"><label htmlFor="pr-id">Part number / tipe</label><input id="pr-id" type="text" value={id} readOnly={edit} placeholder="contoh 12345-67890" onChange={e => setId(e.target.value)} /></div>
      {inJ
        ? <Notice blue>Produk ini ada di Jurnal. Nama, PL, dan diskon dibaca dari Jurnal dan tidak bisa diubah di sini.</Notice>
        : (
          <>
            <div className="field"><label htmlFor="pr-name">Nama barang (opsional; diganti otomatis dari Jurnal kalau SKU sudah ada di sana)</label><input id="pr-name" type="text" value={name} onChange={e => setName(e.target.value)} /></div>
            <div className="row">
              <div className="field"><label htmlFor="pr-pl">Harga PL manual (Rp, opsional)</label><input id="pr-pl" type="text" inputMode="numeric" value={pl} onChange={e => setPl(e.target.value)} /></div>
              <div className="field"><label htmlFor="pr-cat">Diskon manual (contoh 10 atau 10 cash 15)</label><input id="pr-cat" type="text" value={cat} onChange={e => setCat(e.target.value)} /></div>
            </div>
          </>
        )}
    </Dialog>
  );
}

/* ===== Riwayat sync ===== */
type Run = { id: number; kind: 'stok' | 'harga' | 'jual'; started_at: string; mode: string; status: 'ok' | 'part' | 'fail' | null; total: number; ok_count: number; fail_count: number; message: string; failures: { sku: string | null; reason: string }[] };
export const SYNC_NAME = { stok: 'stok', harga: 'harga dan diskon', jual: 'penjualan' } as const;
export const SYNC_LAB = { ok: 'Sukses', part: 'Sebagian gagal', fail: 'Gagal' } as const;
const SYNC_CLS = { ok: 'p-teal', part: 'p-amber', fail: 'p-red' } as const;
const wibTime = (iso: string) => new Date(iso).toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', hour12: false }).replace(':', '.');
const wibDate = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });

function SyncDialog({ onClose }: { onClose: () => void }) {
  const me = useMe();
  const toast = useToast();
  const confirm = useConfirm();
  const [tab, setTab] = useState<'stok' | 'harga' | 'jual'>('stok');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { data, error, loading, reload } = useLoad(async () => {
    const { data, error } = await supabase().from('sync_runs').select('*, failures:sync_failures(sku,reason)').eq('kind', tab).order('started_at', { ascending: false }).limit(10);
    if (error) throw error;
    return data as Run[];
  }, [tab]);

  async function runNow() {
    if (!(await confirm({ title: 'Sync Jurnal', ok: 'Ya, jalankan', msg: `Jalankan sync ${SYNC_NAME[tab]} sekarang?`, detail: 'Hanya membaca dari Jurnal. Tidak ada data yang ditulis ke Jurnal.' }))) return;
    setBusy(true); setErr(null);
    try {
      const res = await fetch('/api/sync', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind: tab }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || 'Sync gagal dijalankan.');
      toast(j.message || 'Sync selesai'); reload(); notifyChanged();
    } catch (e) { setErr(msg(e)); } finally { setBusy(false); }
  }
  const unit = tab === 'jual' ? 'baris invoice' : 'produk';
  return (
    <Dialog title="Riwayat sync Jurnal" onClose={onClose} footer={<>{me.role === 'super' && <Btn variant="alt" disabled={busy} onClick={runNow}>Jalankan sync {SYNC_NAME[tab]} sekarang</Btn>}<Btn onClick={onClose}>Tutup</Btn></>}>
      <ErrorBox error={err || error} />
      <div className="seg" role="group" aria-label="Jenis sync" style={{ alignSelf: 'flex-start', flexWrap: 'wrap' }}>
        {(['stok', 'harga', 'jual'] as const).map(k => <button key={k} type="button" className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{k === 'stok' ? 'Stok' : k === 'harga' ? 'Harga dan diskon' : 'Penjualan'}</button>)}
      </div>
      {loading && !data && <p className="muted">Memuat...</p>}
      {data && data.length === 0 && <Notice blue>Belum ada sync {SYNC_NAME[tab]}.</Notice>}
      {(data ?? []).map(e => (
        <div className="card" key={e.id} style={{ padding: '14px 16px', gap: 6 }}>
          <div className="top" style={{ alignItems: 'center' }}><b>Sync Jurnal, {SYNC_NAME[tab]}</b>{e.status ? <Pill cls={SYNC_CLS[e.status]}>{SYNC_LAB[e.status]}</Pill> : <Pill>Berjalan</Pill>}</div>
          <span className="muted">{fmtDate(wibDate(e.started_at))}, {wibTime(e.started_at)}, {e.mode}</span>
          <span>Total {e.total.toLocaleString('id-ID')} {unit}, berhasil {e.ok_count.toLocaleString('id-ID')}, gagal {e.fail_count.toLocaleString('id-ID')}</span>
          {e.message && <span style={{ color: e.status === 'fail' ? 'var(--redink)' : 'var(--mute)', fontSize: 14 }}>{e.message}</span>}
          {e.failures.slice(0, 20).map((f, i) => <span className="muted" key={i}>Gagal: {f.sku ? f.sku + ': ' : ''}{f.reason}</span>)}
          {e.failures.length > 20 && <span className="muted">Dan {e.failures.length - 20} lainnya.</span>}
        </div>
      ))}
      <p className="muted" style={{ margin: 0 }}>
        {tab === 'jual' ? 'Penjualan dibaca bertahap: hanya invoice baru atau berubah, bukan seluruh invoice setiap kali. ' : tab === 'harga' ? 'PL dibaca dari harga produk di Jurnal. Diskon dibaca dari nama kategori: "10" artinya tempo dan cash 10%, "10 cash 15" artinya tempo 10% dan cash 15%. Kategori yang tidak terbaca dilaporkan sebagai gagal. ' : ''}
        Sync hanya membaca dari Jurnal. Jadwal otomatis: tiap hari sekitar pukul 03.00 WIB.
      </p>
    </Dialog>
  );
}

export { todayWib, ST_CLS };
export type { Settings };
