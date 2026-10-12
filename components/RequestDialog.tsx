'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { getCustomers, getProducts, getSuppliers, notifyChanged, rpc, searchProducts } from '@/lib/db';
import { fmt, fmtDate, fmtTime, todayWib } from '@/lib/format';
import { normSku, parseLines } from '@/lib/parse';
import type { Customer, Offer, Product, ReqRow, Supplier } from '@/lib/types';
import { Btn, Dialog, ErrorBox, Icon, IconButton, Notice, Pill, msg, useConfirm, useToast } from './ui';
import { useMe } from './Shell';
import ProductPicker from './ProductPicker';

/* ===== Pintu masuk global: buka formulir request dari halaman mana pun ===== */
const Ctx = createContext<(id: number | null) => void>(() => {});
export const useOpenRequest = () => useContext(Ctx);
export function RequestHost({ children }: { children: React.ReactNode }) {
  const [st, setSt] = useState<{ id: number | null } | null>(null);
  const open = useCallback((id: number | null) => setSt({ id }), []);
  return <Ctx.Provider value={open}>{children}{st && <RequestDialog id={st.id} onClose={() => setSt(null)} />}</Ctx.Provider>;
}

/* ===== Bentuk data ===== */
const blankOffer = (): Offer => ({ supplier_id: 0, quote: '', ready: true });
const blankRow = (): ReqRow => ({
  raw: '', typed_sku: '', sku: null, qty: 1, note: '', resolution: '', reason: '', orig: '', auto_source_row: null, auto_confirmed: false,
  auto_label: '', auto_use: false, auto_offers: [], pl: '', tempo: '', cash: '', offers: [blankOffer()],
});
const filled = (r: ReqRow) => r.offers.some(o => o.supplier_id > 0);
const isUnknown = (r: ReqRow) => !!r.typed_sku && !r.sku;
const unconf = (r: ReqRow) => r.auto_use && !r.auto_confirmed;
const isDone = (r: ReqRow) => !!r.sku && filled(r) && !unconf(r);
export function statusOf(rows: ReqRow[]): string {
  const n = rows.length; if (!n) return 'Belum diisi';
  const f = rows.filter(isDone).length;
  return f === 0 ? 'Belum diisi' : f === n ? 'Selesai' : 'Sedang diisi';
}

type Form = {
  id: number | null; version: number; owner: string; helpers: string[]; note: string; date: string; customerId: number;
  rows: ReqRow[]; draft: string; step: 1 | 2; newCust: boolean; newCustName: string; clientKey: string;
};
type Ctx2 = { dups: { sku: string; handle: string; time: string }[]; auto: { sku: string; row_id: number; handle: string; time: string; offers: { supplier_id: number; quote: number | null; ready: boolean }[] }[]; same: { handle: string; time: string } | null };

function applyProduct(r: ReqRow, p: Product | undefined) {
  if (!p || p.in_jurnal) { r.pl = ''; r.tempo = ''; r.cash = ''; return; }
  if (!r.pl && p.pl_price) r.pl = String(p.pl_price);
  if (!r.tempo && p.tempo_disc !== null && p.cash_disc !== null) { r.tempo = String(p.tempo_disc); r.cash = String(p.cash_disc); }
}

export default function RequestDialog({ id, onClose }: { id: number | null; onClose: () => void }) {
  const me = useMe();
  const confirm = useConfirm();
  const toast = useToast();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [prods, setProds] = useState<Map<string, Product>>(new Map());
  const [poq, setPoq] = useState<Map<string, number>>(new Map());
  const [subs, setSubs] = useState<Map<string, string>>(new Map());
  const [ctx, setCtx] = useState<Ctx2>({ dups: [], auto: [], same: null });
  const [f, setF] = useState<Form | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [repl, setRepl] = useState<{ i: number; reason: 'typo' | 'disc'; custom: boolean } | null>(null);
  const [openErr, setOpenErr] = useState<string | null>(null);
  const today = todayWib();
  const sb = supabase();

  const sup = useMemo(() => new Map(suppliers.map(s => [s.id, s])), [suppliers]);

  /* ---- muat data awal ---- */
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const [ss, cs] = await Promise.all([getSuppliers(), getCustomers()]);
        if (!live) return;
        setSuppliers(ss); setCustomers(cs);
        if (id === null) {
          const first = cs.find(c => c.active);
          setF({ id: null, version: 0, owner: me.name, helpers: [], note: '', date: today, customerId: first?.id ?? 0, rows: [], draft: '', step: 1, newCust: false, newCustName: '', clientKey: crypto.randomUUID() });
          return;
        }
        const { data: q, error: e1 } = await sb.from('requests')
          .select('id,req_date,customer_id,note,version,owner:profiles!owner_id(name),helpers:request_helpers(profile:profiles(name))').eq('id', id).single();
        if (e1) throw e1;
        const { data: rr, error: e2 } = await sb.from('request_rows')
          .select('id,line_no,raw_text,typed_sku,sku,qty,note,resolution,replace_reason,auto_source_row,auto_confirmed,offers(supplier_id,quote,ready)')
          .eq('request_id', id).order('line_no');
        if (e2) throw e2;
        const srcIds = (rr ?? []).map((x: { auto_source_row: number | null }) => x.auto_source_row).filter((x: number | null): x is number => !!x);
        const labels = new Map<number, string>();
        if (srcIds.length) {
          const { data: src } = await sb.from('request_rows').select('id,request:requests(req_time,owner:profiles!owner_id(name))').in('id', srcIds);
          (src ?? []).forEach((s: any) => labels.set(s.id, `${s.request?.owner?.name ?? ''} ${fmtTime(s.request?.req_time)}`.trim()));
        }
        const rows: ReqRow[] = (rr ?? []).map((x: any) => {
          const offers: Offer[] = (x.offers ?? []).map((o: any) => ({ supplier_id: o.supplier_id, quote: o.quote === null ? '' : String(o.quote), ready: o.ready }));
          const auto = !!x.auto_source_row;
          return {
            id: x.id, raw: x.raw_text, typed_sku: x.typed_sku ?? '', sku: x.sku, qty: x.qty, note: x.note,
            resolution: x.resolution ?? '', reason: x.replace_reason ?? '', orig: x.resolution === 'replaced' ? (x.typed_sku ?? '') : '',
            auto_source_row: x.auto_source_row, auto_confirmed: x.auto_confirmed, auto_label: auto ? (labels.get(x.auto_source_row) ?? 'request lain') : '',
            auto_use: auto, auto_offers: auto ? offers.map(o => ({ ...o })) : [], pl: '', tempo: '', cash: '', offers: offers.length ? offers : [blankOffer()],
          } as ReqRow;
        });
        const owner = (q as any).owner?.name ?? '';
        setF({
          id, version: (q as any).version, owner, helpers: ((q as any).helpers ?? []).map((h: any) => h.profile?.name).filter(Boolean),
          note: (q as any).note ?? '', date: (q as any).req_date, customerId: (q as any).customer_id, rows,
          draft: rows.map(r => r.raw || r.typed_sku).join('\n'), step: 2, newCust: false, newCustName: '', clientKey: crypto.randomUUID(),
        });
      } catch (e) { if (live) setOpenErr(msg(e)); }
    })();
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  /* ---- data produk, PO, penggantian, dan konteks (hari yang sama) ---- */
  const skuKey = f ? f.rows.map(r => `${r.typed_sku}|${r.sku ?? ''}`).join(',') : '';
  useEffect(() => {
    if (!f) return;
    let live = true;
    (async () => {
      try {
        const all = f.rows.flatMap(r => [r.typed_sku, r.sku ?? '']).filter(Boolean);
        const pm = await getProducts(all);
        const known = f.rows.map(r => r.sku).filter((x): x is string => !!x);
        const unknown = f.rows.filter(isUnknown).map(r => r.typed_sku);
        const [q, sRows, ctxData] = await Promise.all([
          known.length ? sb.from('v_po_qty').select('sku,qty_wait,qty_ship').in('sku', known) : Promise.resolve({ data: [] as any[] }),
          unknown.length ? sb.from('sku_substitutions').select('from_sku,to_sku').in('from_sku', unknown) : Promise.resolve({ data: [] as any[] }),
          f.customerId ? rpc<Ctx2>('request_context', { p_customer: f.customerId, p_date: f.date, p_skus: [...new Set(f.rows.map(r => r.sku || r.typed_sku).filter(Boolean))], p_exclude: f.id }) : Promise.resolve({ dups: [], auto: [], same: null } as Ctx2),
        ]);
        if (!live) return;
        setProds(pm);
        setPoq(new Map((q.data ?? []).map((x: any) => [x.sku, Number(x.qty_wait) + Number(x.qty_ship)])));
        setSubs(new Map((sRows.data ?? []).map((x: any) => [x.from_sku, x.to_sku])));
        setCtx(ctxData);
        // lengkapi PL/diskon manual dari produk (hanya yang belum ada di Jurnal)
        setF(cur => cur && ({ ...cur, rows: cur.rows.map(r => { if (!r.sku || r.pl || r.tempo) return r; const n = { ...r }; applyProduct(n, pm.get(r.sku)); return n; }) }));
      } catch { /* konteks hanya pelengkap; kesalahan tidak menghalangi pengisian */ }
    })();
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skuKey, f?.customerId, f?.date, f?.id]);

  if (openErr) return <Dialog title="Request" onClose={onClose} footer={<Btn onClick={onClose}>Tutup</Btn>}><ErrorBox error={openErr} /></Dialog>;
  if (!f) return <Dialog title={id ? `Request #${id}` : 'Tambah Request'} onClose={onClose}><p className="muted">Memuat...</p></Dialog>;

  const update = (patch: Partial<Form>) => setF(cur => cur && ({ ...cur, ...patch }));
  const setRow = (i: number, patch: Partial<ReqRow>) => setF(cur => cur && ({ ...cur, rows: cur.rows.map((r, k) => (k === i ? { ...r, ...patch } : r)) }));
  const setOffer = (i: number, j: number, patch: Partial<Offer>) => setF(cur => cur && ({ ...cur, rows: cur.rows.map((r, k) => (k !== i ? r : { ...r, offers: r.offers.map((o, m) => (m === j ? { ...o, ...patch } : o)) })) }));
  const isIDR = (sid: number) => !sid || (sup.get(sid)?.currency ?? 'IDR') === 'IDR';

  /* ---- isian otomatis dari request lain pada hari yang sama ---- */
  function autoFillRows(rows: ReqRow[], c: Ctx2): { rows: ReqRow[]; n: number } {
    let n = 0;
    const out = rows.map(r => {
      if (!r.sku || filled(r)) return r;
      const a = c.auto.find(x => x.sku === r.sku);
      if (!a) return r;
      n++;
      const offers = a.offers.map(o => ({ supplier_id: o.supplier_id, quote: o.quote === null ? '' : String(o.quote), ready: o.ready }));
      return { ...r, offers, auto_label: `${a.handle} ${fmtTime(a.time)}`, auto_use: true, auto_confirmed: false, auto_source_row: a.row_id, auto_offers: offers.map(o => ({ ...o })) };
    });
    return { rows: out, n };
  }
  async function contextFor(rows: ReqRow[], customerId: number, date: string): Promise<Ctx2> {
    const skus = [...new Set(rows.map(r => r.sku || r.typed_sku).filter(Boolean))];
    if (!skus.length || !customerId) return { dups: [], auto: [], same: null };
    return rpc<Ctx2>('request_context', { p_customer: customerId, p_date: date, p_skus: skus, p_exclude: f!.id });
  }

  /* ---- langkah 1: pecah chat ---- */
  async function parse() {
    setError(null);
    const parsed = parseLines(f!.draft);
    if (!parsed.length) { toast('Belum ada chat untuk dipecah'); return; }
    try {
      const pm = await getProducts(parsed.map(p => p.part));
      let rows: ReqRow[] = parsed.map(p => {
        const r: ReqRow = { ...blankRow(), raw: p.raw, typed_sku: p.part, sku: p.part && pm.has(p.part) ? p.part : null, qty: p.qty, note: p.note };
        applyProduct(r, r.sku ? pm.get(r.sku) : undefined);
        return r;
      });
      const c = await contextFor(rows, f!.customerId, f!.date);
      const af = autoFillRows(rows, c);
      rows = af.rows;
      const unk = rows.filter(isUnknown).length;
      setProds(pm); setCtx(c);
      update({ rows, step: 2 });
      toast([af.n ? `${af.n} baris terisi otomatis` : '', unk ? `${unk} baris bukan list produk kita` : ''].filter(Boolean).join(', ') || 'Chat dipecah');
    } catch (e) { setError(msg(e)); }
  }

  async function changeDate(date: string) {
    const d = date > today ? today : date;
    update({ date: d });
    if (!f!.rows.length) return;
    try {
      const reset = f!.rows.map(r => (r.auto_label ? { ...r, offers: [blankOffer()], auto_label: '', auto_use: false, auto_confirmed: false, auto_source_row: null, auto_offers: [] } : r));
      const c = await contextFor(reset, f!.customerId, d);
      const af = autoFillRows(reset, c);
      setCtx(c); update({ date: d, rows: af.rows });
      toast(af.n ? `${af.n} baris terisi otomatis untuk tanggal ini` : 'Tanggal diubah, isian otomatis disesuaikan');
    } catch (e) { setError(msg(e)); }
  }

  async function addCustomer() {
    const n = f!.newCustName.trim();
    if (!n) { toast('Isi nama customer dulu'); return; }
    const ex = customers.find(c => c.name.toLowerCase() === n.toLowerCase());
    if (ex) { update({ customerId: ex.id, newCust: false, newCustName: '' }); toast('Customer sudah ada, dipilih'); return; }
    if (!(await confirm({ title: 'Customer baru', msg: `Tambahkan customer baru "${n}"?`, ok: 'Ya, tambahkan' }))) return;
    const { data, error } = await sb.from('customers').insert({ name: n }).select().single();
    if (error) { setError(msg(error)); return; }
    setCustomers(cs => [...cs, data as Customer].sort((a, b) => a.name.localeCompare(b.name)));
    update({ customerId: (data as Customer).id, newCust: false, newCustName: '' });
    toast('Customer baru ditambahkan');
  }

  /* ---- baris tidak dikenal ---- */
  async function newProduct(i: number) {
    const r = f!.rows[i];
    if (!(await confirm({ title: 'Barang baru', msg: `Tambahkan ${r.typed_sku} sebagai barang baru di List Barang?`, detail: 'Produk ini masuk ke List Barang dan ikut dihitung di analisa.', ok: 'Ya, tambahkan' }))) return;
    try {
      await rpc('ensure_product', { p_sku: r.typed_sku, p_name: '' });
      const pm = await getProducts([r.typed_sku]);
      setProds(m => new Map([...m, ...pm]));
      const c = await contextFor(f!.rows.map((x, k) => (k === i ? { ...x, sku: r.typed_sku } : x)), f!.customerId, f!.date);
      const nr = { ...r, sku: r.typed_sku, resolution: 'new' as const };
      applyProduct(nr, pm.get(r.typed_sku));
      const af = autoFillRows([nr], c);
      setF(cur => cur && ({ ...cur, rows: cur.rows.map((x, k) => (k === i ? af.rows[0] : x)) }));
      toast(`${r.typed_sku} ditambahkan sebagai barang baru`);
    } catch (e) { setError(msg(e)); }
  }
  async function useSub(i: number) {
    const r = f!.rows[i], to = subs.get(r.typed_sku); if (!to) return;
    const pm = await getProducts([to]);
    const nr: ReqRow = { ...r, orig: r.typed_sku, sku: to, resolution: 'replaced', reason: 'disc' };
    applyProduct(nr, pm.get(to));
    setProds(m => new Map([...m, ...pm]));
    const c = await contextFor(f!.rows.map((x, k) => (k === i ? nr : x)), f!.customerId, f!.date);
    const af = autoFillRows([nr], c);
    setF(cur => cur && ({ ...cur, rows: cur.rows.map((x, k) => (k === i ? af.rows[0] : x)) }));
    toast('Diganti ke ' + to);
  }
  async function doReplace(i: number, reason: 'typo' | 'disc', pid: string, isNew: boolean) {
    const r = f!.rows[i];
    if (pid === r.typed_sku) { toast('Tipe pengganti sama dengan yang diketik customer'); return; }
    if (!(await confirm({ title: 'Ganti tipe', msg: `Ganti ${r.typed_sku} menjadi ${pid}?`, ok: 'Ya, ganti',
      detail: (isNew ? `${pid} belum ada di List Barang dan akan ditambahkan. ` : '') + (reason === 'disc' ? 'Penggantian karena discontinue diingat untuk request berikutnya.' : 'Dicatat sebagai typo.') }))) return;
    try {
      if (isNew) await rpc('ensure_product', { p_sku: pid, p_name: '' });
      const pm = await getProducts([pid]);
      setProds(m => new Map([...m, ...pm]));
      const nr: ReqRow = { ...r, orig: r.typed_sku, sku: pid, resolution: 'replaced', reason };
      applyProduct(nr, pm.get(pid));
      const c = await contextFor(f!.rows.map((x, k) => (k === i ? nr : x)), f!.customerId, f!.date);
      const af = autoFillRows([nr], c);
      setF(cur => cur && ({ ...cur, rows: cur.rows.map((x, k) => (k === i ? af.rows[0] : x)) }));
      setRepl(null);
      toast(`Diganti ke ${pid}${isNew ? ' (barang baru)' : ''}`);
    } catch (e) { setError(msg(e)); }
  }
  async function typePart(i: number, raw: string) {
    const v = normSku(raw); if (!v) return;
    const pm = await getProducts([v]);
    setProds(m => new Map([...m, ...pm]));
    const nr = { ...f!.rows[i], typed_sku: v, sku: pm.has(v) ? v : null };
    applyProduct(nr, pm.get(v));
    setF(cur => cur && ({ ...cur, rows: cur.rows.map((x, k) => (k === i ? nr : x)) }));
  }

  /* ---- simpan ---- */
  function payload(confirmAuto: boolean) {
    return {
      id: f!.id, version: f!.version, client_key: f!.id ? null : f!.clientKey, date: f!.date, customer_id: f!.customerId, note: f!.note,
      rows: f!.rows.map((r, i) => {
        const p = r.sku ? prods.get(r.sku) : undefined;
        const manual = !!p && !p.in_jurnal;
        return {
          id: r.id ?? null, line_no: i + 1, raw: r.raw, typed_sku: r.typed_sku || null, sku: r.sku, qty: r.qty, note: r.note,
          resolution: r.resolution || null, reason: r.reason || null,
          auto_source_row: r.auto_use ? r.auto_source_row : null, auto_confirmed: r.auto_use ? (confirmAuto || r.auto_confirmed) : false,
          pl: manual ? r.pl : '', tempo: manual ? r.tempo : '', cash: manual ? r.cash : '',
          offers: r.offers.filter(o => o.supplier_id > 0).map(o => ({ supplier_id: o.supplier_id, quote: o.quote.trim() === '' ? null : Number(o.quote.replace(',', '.')), ready: o.ready })),
        };
      }),
      substitutions: f!.rows.filter(r => r.resolution === 'replaced' && r.reason === 'disc' && r.sku && r.orig).map(r => ({ from: r.orig, to: r.sku })),
    };
  }
  async function save(confirmAuto: boolean) {
    setError(null);
    const bad = f!.rows.filter(r => !r.typed_sku).length;
    if (!f!.customerId) { setError('Pilih customer dulu.'); return; }
    if (bad) { setError(`${bad} baris belum punya part number. Isi part number-nya atau hapus barisnya.`); return; }
    const sim = f!.rows.map(r => (confirmAuto && r.auto_use ? { ...r, auto_confirmed: true } : r));
    let same: Ctx2['same'] = null;
    try { same = (await contextFor(f!.rows, f!.customerId, f!.date)).same; } catch { /* peringatan saja */ }
    const cust = customers.find(c => c.id === f!.customerId)?.name ?? '';
    const ok = await confirm({
      title: 'Simpan request', ok: 'Ya, simpan',
      msg: `${f!.id ? 'Simpan perubahan request' : 'Simpan request baru'} untuk ${cust}?`,
      detail: `${f!.rows.length} produk, tanggal ${fmtDate(f!.date)}. Status request akan menjadi ${statusOf(sim)}.` + (confirmAuto ? ' Isian otomatis ikut dikonfirmasi.' : '')
        + (same ? ` PERHATIAN: sudah ada request ${cust} jam ${fmtTime(same.time)} dengan produk yang persis sama. Pastikan ini bukan request ganda.` : ''),
    });
    if (!ok) return;
    setSaving(true);
    try {
      const res = await rpc<{ id: number; status: string; duplicate: boolean }>('save_request', { p: payload(confirmAuto) });
      toast(res.duplicate ? 'Request ini sudah tersimpan sebelumnya.' : `Tersimpan. Status: ${res.status}`);
      notifyChanged(); onClose();
    } catch (e) { setError(msg(e)); setSaving(false); }
  }

  /* ---- tampilan ---- */
  const unc = f.rows.filter(unconf).length, unk = f.rows.filter(isUnknown).length, bad = f.rows.filter(r => !r.typed_sku).length;
  const dups = f.rows.filter(r => r.sku && ctx.dups.some(d => d.sku === r.sku)).length;
  const cust = customers.find(c => c.id === f.customerId);
  const activeSup = suppliers.filter(s => s.active);

  const tabs = (
    <div className="steps">
      <button type="button" className={f.step === 1 ? 'on' : ''} onClick={() => update({ step: 1 })}>1. Chat customer</button>
      <button type="button" className={f.step === 2 ? 'on' : ''} onClick={() => update({ step: 2 })}>2. Detail harga ({f.rows.length})</button>
    </div>
  );

  const step1 = (
    <>
      {tabs}
      <div className="row">
        <div className="field" style={{ flex: '2 1 260px' }}>
          <label htmlFor="r-cust">Customer</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <select id="r-cust" value={f.customerId} onChange={e => update({ customerId: +e.target.value })}>
              {customers.filter(c => c.active || c.id === f.customerId).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <Btn sm variant="alt" style={{ height: 44 }} onClick={() => update({ newCust: !f.newCust })}>Customer baru</Btn>
          </div>
        </div>
        <div className="field"><label htmlFor="r-tgl">Tanggal request</label><input id="r-tgl" type="date" value={f.date} max={today} onChange={e => e.target.value ? changeDate(e.target.value) : undefined} /></div>
        <div className="field"><label htmlFor="r-hnd">Handle (dari akun login)</label><input id="r-hnd" type="text" readOnly value={f.owner} /></div>
      </div>
      <p className="muted" style={{ margin: 0 }}>Tanggal bisa diubah kalau request ketinggalan diinput.</p>
      {f.newCust && <div className="sub-panel"><div className="field" style={{ flex: '1 1 240px' }}><label htmlFor="r-nn">Nama customer baru</label><input id="r-nn" type="text" autoFocus value={f.newCustName} onChange={e => update({ newCustName: e.target.value })} /></div><Btn sm onClick={addCustomer} icon="plus">Tambah</Btn></div>}
      <div className="field"><label htmlFor="r-chat">Paste chat dari customer (satu part per baris; qty seperti 2pc atau x2 dikenali)</label><textarea id="r-chat" value={f.draft} onChange={e => update({ draft: e.target.value })} /></div>
    </>
  );

  const supSelect = (i: number, j: number, r: ReqRow, o: Offer, lock: boolean) => (
    <select aria-label="Supplier" style={{ width: 130 }} disabled={lock} value={o.supplier_id}
      onChange={e => { const sid = +e.target.value; const flip = isIDR(sid) !== isIDR(o.supplier_id); setOffer(i, j, { supplier_id: sid, quote: flip ? '' : o.quote }); }}>
      <option value={0}>Pilih</option>
      {suppliers.filter(s => s.active || s.id === o.supplier_id).map(s => <option key={s.id} value={s.id} disabled={r.offers.some((x, k) => k !== j && x.supplier_id === s.id)}>{s.name}</option>)}
    </select>
  );

  const step2 = (
    <>
      {tabs}
      {f.rows.length === 0 ? <Notice blue>Belum ada baris. Kembali ke langkah 1, paste chat, lalu klik Pecah per baris.</Notice> : (
        <>
          <div className="muted">Penanggung jawab: <b>{f.owner}</b>{f.helpers.length ? `, dilengkapi ${f.helpers.join(', ')}` : ''}. {cust?.name}, {fmtDate(f.date)}, {f.rows.length} baris{bad ? `, ${bad} tanpa part number` : ''}. PL dan diskon dari Jurnal (hanya baca); hanya SKU yang belum ada di Jurnal diisi manual.</div>
          {unk > 0 && <Notice><b>{unk} baris bukan list produk kita.</b> Tambahkan sebagai barang baru, atau ganti tipe kalau typo atau discontinue.</Notice>}
          {dups > 0 && <Notice>{dups} part sudah pernah diinput untuk {cust?.name} pada {fmtDate(f.date)}. Cek baris bertanda &quot;Sudah ada&quot; supaya tidak dobel.</Notice>}
          {unc > 0 && <Notice blue><b>{unc} baris terisi otomatis.</b> Diisi dari request lain di hari yang sama (kolom biru). Tetap dihitung belum diisi sampai kamu klik Konfirmasi di bawah.</Notice>}
          <div className="field"><label htmlFor="r-note">Catatan: kenapa belum selesai (opsional, kelihatan di Daftar Request)</label><input id="r-note" type="text" value={f.note} placeholder="contoh: menunggu balasan TAM" onChange={e => update({ note: e.target.value })} /></div>
          <div className="wrap">
            <table style={{ minWidth: 1410 }}>
              <thead><tr><th>Part number</th><th>Nama barang</th><th>Qty</th><th>Stok Jurnal</th><th>Harga PL (Jurnal)</th><th>Diskon customer (kategori Jurnal)</th><th>Penawaran supplier (diskon % atau harga mata uang asing, ready)</th></tr></thead>
              <tbody>
                {f.rows.map((r, i) => {
                  const p = r.sku ? prods.get(r.sku) : undefined, du = r.sku ? ctx.dups.find(d => d.sku === r.sku) : undefined, lock = r.auto_use;
                  const sub = isUnknown(r) ? subs.get(r.typed_sku) : undefined;
                  return (
                    <tr key={i}>
                      <td style={{ minWidth: 200 }}>
                        {r.typed_sku ? <span className="mono">{r.typed_sku}</span> : (
                          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                            <input type="text" aria-label="Ketik part number" placeholder="Part number" style={{ width: 140 }} onBlur={e => typePart(i, e.target.value)} onKeyDown={e => { if (e.key === 'Enter') typePart(i, (e.target as HTMLInputElement).value); }} />
                          </div>
                        )}
                        {r.note && <><br /><span className="muted">{r.note}</span></>}
                        {!r.typed_sku && <><br /><Pill cls="p-amber">Tidak ada part number</Pill></>}
                        {du && <><br /><Pill cls="p-amber">Sudah ada: {du.handle} {fmtTime(du.time)}</Pill></>}
                        {isUnknown(r) && (
                          <div className="autobox"><Pill cls="p-red" style={{ alignSelf: 'flex-start' }}>Bukan list produk kita</Pill>
                            <div className="chips">
                              <Btn sm variant="alt" onClick={() => newProduct(i)}>Barang baru</Btn>
                              <Btn sm variant="alt" onClick={() => setRepl({ i, reason: 'typo', custom: false })}>Ganti tipe</Btn>
                              {sub && <Btn sm onClick={() => useSub(i)}>Pakai {sub}</Btn>}
                            </div></div>
                        )}
                        {r.resolution === 'new' && <><br /><Pill cls="p-teal">Barang baru ditambahkan</Pill></>}
                        {r.resolution === 'replaced' && <><br /><Pill cls="p-blue">Diganti dari {r.orig} ({r.reason === 'disc' ? 'discontinue' : 'typo'})</Pill></>}
                        <div style={{ marginTop: 6 }}><IconButton icon="trash" label={`Hapus baris ${r.typed_sku || r.raw}`} cls="del sm" onClick={() => setF(cur => cur && ({ ...cur, rows: cur.rows.filter((_, k) => k !== i) }))} /></div>
                      </td>
                      <td className="pname">{p?.name ? p.name : <span className="muted">-</span>}</td>
                      <td><input type="text" inputMode="numeric" aria-label={`Qty ${r.typed_sku || r.raw}`} style={{ width: 70 }} value={r.qty} onChange={e => setRow(i, { qty: Math.max(1, parseInt(e.target.value, 10) || 1) })} /></td>
                      <td>{p && p.stock_qty > 0 ? <Pill cls="p-blue">Ada stok {p.stock_qty}</Pill> : <span className="muted">Kosong</span>}<br /><span className="muted">{r.sku && (poq.get(r.sku) ?? 0) > 0 ? 'Di PO ' + poq.get(r.sku) : 'Tidak ada PO'}</span></td>
                      <td>{!p ? <span className="muted">-</span> : p.in_jurnal ? (p.pl_price && p.pl_price > 0 ? <><b>{fmt(p.pl_price)}</b><br /><span className="muted">dari Jurnal</span></> : <Pill cls="p-amber" style={{ whiteSpace: 'normal' }}>PL belum ada di Jurnal. Isi di Jurnal.</Pill>) : (
                        <div className="cellbox" style={{ minWidth: 150 }}><Pill cls="p-grey" style={{ alignSelf: 'flex-start' }}>Belum ada di Jurnal, isi manual</Pill>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><label className="muted" htmlFor={`pl-${i}`}>PL Rp</label><input id={`pl-${i}`} type="text" inputMode="numeric" style={{ width: 110 }} value={r.pl} onChange={e => setRow(i, { pl: e.target.value })} /></div></div>
                      )}</td>
                      <td>{!p ? <span className="muted">Menunggu produk divalidasi</span> : p.in_jurnal ? (
                        p.tempo_disc !== null && p.cash_disc !== null
                          ? <div className="cellbox" style={{ minWidth: 170 }}>Tempo <b>{p.tempo_disc}%</b>, Cash <b>{p.cash_disc}%</b><span className="muted">Kategori Jurnal: {p.category_name}. Dari Jurnal, tidak bisa diubah di sini.</span></div>
                          : <div className="cellbox" style={{ minWidth: 170 }}><Pill cls="p-amber" style={{ alignSelf: 'flex-start', whiteSpace: 'normal' }}>{p.category_name ? `Kategori Jurnal "${p.category_name}" tidak terbaca` : 'Belum ada kategori di Jurnal'}</Pill><span className="muted">Perbaiki di Jurnal, lalu tunggu sync berikutnya.</span></div>
                      ) : (
                        <div className="cellbox" style={{ minWidth: 170 }}><Pill cls="p-grey" style={{ alignSelf: 'flex-start' }}>Belum ada di Jurnal, isi manual</Pill>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            <label className="muted" htmlFor={`dt-${i}`}>Tempo</label><input id={`dt-${i}`} type="text" inputMode="decimal" style={{ width: 62 }} value={r.tempo} onChange={e => setRow(i, { tempo: e.target.value })} />
                            <label className="muted" htmlFor={`dc-${i}`}>Cash</label><input id={`dc-${i}`} type="text" inputMode="decimal" style={{ width: 62 }} value={r.cash} onChange={e => setRow(i, { cash: e.target.value })} /></div></div>
                      )}</td>
                      <td className={lock ? 'auto' : ''}>
                        <div className="offs">
                          {r.offers.map((o, j) => (
                            <div className="off" key={j}>
                              {supSelect(i, j, r, o, lock)}
                              <input type="text" aria-label={isIDR(o.supplier_id) ? 'Diskon dari supplier persen' : 'Harga dari supplier'} placeholder={isIDR(o.supplier_id) ? 'Disk %' : 'Harga ' + (sup.get(o.supplier_id)?.currency ?? '')}
                                inputMode="decimal" style={{ width: isIDR(o.supplier_id) ? 70 : 100 }} disabled={lock} value={o.quote} onChange={e => setOffer(i, j, { quote: e.target.value })} />
                              <label className="chk"><input type="checkbox" disabled={lock} checked={o.ready} onChange={e => setOffer(i, j, { ready: e.target.checked })} /> Ready</label>
                              {r.offers.length > 1 && !lock && <button type="button" className="x2" aria-label="Hapus supplier ini" onClick={() => setF(cur => cur && ({ ...cur, rows: cur.rows.map((x, k) => (k === i ? { ...x, offers: x.offers.filter((_, m) => m !== j) } : x)) }))}>&times;</button>}
                            </div>
                          ))}
                          {!lock && <Btn sm variant="alt" style={{ alignSelf: 'flex-start' }} icon="plus" onClick={() => setRow(i, { offers: [...r.offers, blankOffer()] })}>Supplier</Btn>}
                        </div>
                        {r.auto_label && (
                          <div className="autobox">
                            <label className="chk"><input type="checkbox" checked={r.auto_use} onChange={e => e.target.checked
                              ? setRow(i, { auto_use: true, auto_confirmed: false, offers: r.auto_offers.length ? r.auto_offers.map(o => ({ ...o })) : r.offers })
                              : setRow(i, { auto_use: false, auto_confirmed: false, auto_source_row: null, offers: [blankOffer()] })} /> Sudah diinput di request lain pada hari yang sama ({r.auto_label}). Pakai isian ini</label>
                            <span className="autotag">{r.auto_use ? (r.auto_confirmed ? 'Terisi otomatis, sudah dikonfirmasi.' : 'Terisi otomatis, menunggu konfirmasi.') : 'Tidak memakai isian otomatis. Isi manual.'}</span>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );

  const footer = f.step === 1
    ? <><Btn variant="alt" onClick={onClose}>Batal</Btn><Btn icon="list" onClick={parse}>Pecah per baris</Btn></>
    : <><Btn variant="alt" onClick={onClose}>Batal</Btn>{unc > 0
      ? <Btn icon="check" disabled={!f.rows.length || saving} onClick={() => save(true)}>Konfirmasi isian otomatis dan simpan ({unc})</Btn>
      : <Btn icon="check" disabled={!f.rows.length || saving} onClick={() => save(false)}>Simpan request</Btn>}</>;

  return (
    <>
      <Dialog wide title={f.id ? `Request #${f.id}` : 'Tambah Request'} onClose={onClose} footer={footer}>
        <ErrorBox error={error} />
        {f.step === 1 ? step1 : step2}
      </Dialog>
      {repl && <ReplaceDialog row={f.rows[repl.i]} initial={repl} onClose={() => setRepl(null)} onDo={(reason, pid, isNew) => doReplace(repl.i, reason, pid, isNew)} />}
    </>
  );
}

function ReplaceDialog({ row, initial, onClose, onDo }: { row: ReqRow; initial: { reason: 'typo' | 'disc'; custom: boolean }; onClose: () => void; onDo: (reason: 'typo' | 'disc', pid: string, isNew: boolean) => void }) {
  const [reason, setReason] = useState<'typo' | 'disc'>(initial.reason);
  const [picked, setPicked] = useState<{ sku: string; isNew: boolean } | null>(null);
  return (
    <Dialog top title="Ganti ke tipe lain" onClose={onClose} footer={<><Btn variant="alt" onClick={onClose}>Batal</Btn><Btn icon="check" disabled={!picked} onClick={() => picked && onDo(reason, picked.sku, picked.isNew)}>Ganti tipe</Btn></>}>
      <p style={{ margin: 0 }}>Ditulis customer: <span className="mono">{row.typed_sku}</span>, tidak ada di list produk kita.</p>
      <div className="field"><label>Alasan</label>
        <div className="seg" role="group" aria-label="Alasan" style={{ alignSelf: 'flex-start' }}>
          <button type="button" className={reason === 'typo' ? 'on' : ''} onClick={() => setReason('typo')}>Typo</button>
          <button type="button" className={reason === 'disc' ? 'on' : ''} onClick={() => setReason('disc')}>Discontinue, diganti tipe lain</button>
        </div></div>
      {picked && <Notice blue>Tipe pengganti: <b className="mono">{picked.sku}</b>{picked.isNew ? ' (tipe baru, akan masuk List Barang)' : ''}</Notice>}
      <ProductPicker label="Cari tipe pengganti" onPick={(sku, p) => setPicked({ sku, isNew: !p })} />
      <p className="muted" style={{ margin: 0 }}>{reason === 'disc' ? 'Pergantian discontinue diingat: lain kali tipe ini muncul, kamu ditawari tipe penggantinya.' : 'Typo hanya memperbaiki baris ini.'} Tipe yang diketik sendiri dan belum ada akan masuk List Barang sebagai barang baru.</p>
    </Dialog>
  );
}
