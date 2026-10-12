'use client';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

/* ===== Ikon ===== */
export const ICO: Record<string, string> = {
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  trash: '<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/>',
  merge: '<path d="M6 4v5a5 5 0 0 0 5 5h2"/><path d="M18 4v5a5 5 0 0 1-5 5"/><path d="M12 14v7"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13"/><path d="M3 6h.01M3 12h.01M3 18h.01"/>',
  file: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M9 14h6M9 18h6"/>',
  power: '<path d="M12 2v10"/><path d="M18.4 6.6a9 9 0 1 1-12.8 0"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="M10.8 12.2L20 3M16 7l3 3"/>',
  check: '<path d="M20 6L9 17l-5-5"/>',
  clip: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4h6v3H9zM9 12h6M9 16h6"/>',
  box: '<path d="M21 8l-9-5-9 5v8l9 5 9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/>',
  alert: '<path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
  scale: '<path d="M12 3v18M6 21h12M5 7h14"/><path d="M5 7l-3 7a4 4 0 0 0 6 0zM19 7l-3 7a4 4 0 0 0 6 0z"/>',
  users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>',
  user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  filter: '<path d="M3 4h18l-7 8v6l-4 2v-8z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  reset: '<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/>',
  refresh: '<path d="M21 12a9 9 0 0 1-15.5 6.2M3 12a9 9 0 0 1 15.5-6.2"/><path d="M21 4v5h-5M3 20v-5h5"/>',
  x: '<path d="M18 6L6 18M6 6l12 12"/>',
  arrowl: '<path d="M19 12H5M12 19l-7-7 7-7"/>',
  calc: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 7h8M8 12h.01M12 12h.01M16 12h.01M8 16h.01M12 16h.01M16 16h.01"/>',
  ban: '<circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/>',
  undo: '<path d="M3 7v6h6"/><path d="M3 13a9 9 0 1 0 3-7.7L3 8"/>',
  chevup: '<path d="M18 15l-6-6-6 6"/>',
  chevdown: '<path d="M6 9l6 6 6-6"/>',
  chevright: '<path d="M9 6l6 6-6 6"/>',
  grid: '<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>',
  truck: '<path d="M1 3h15v13H1zM16 8h4l3 3v5h-7z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  plug: '<path d="M9 2v6M15 2v6"/><path d="M6 8h12v4a6 6 0 0 1-12 0z"/><path d="M12 18v4"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5M21 12H9"/>',
};
export function Icon({ name, size = 18 }: { name: string; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" dangerouslySetInnerHTML={{ __html: ICO[name] || '' }} />;
}
export function IconButton({ icon, label, onClick, cls = '', disabled }: { icon: string; label: string; onClick?: (e: React.MouseEvent) => void; cls?: string; disabled?: boolean }) {
  return <button type="button" className={`ib ${cls}`} title={label} aria-label={label} disabled={disabled} onClick={e => { e.stopPropagation(); onClick?.(e); }}><Icon name={icon} /></button>;
}
export function Btn({ children, icon, variant = '', sm, ...p }: React.ButtonHTMLAttributes<HTMLButtonElement> & { icon?: string; variant?: '' | 'alt' | 'danger' | 'okb' | 'del'; sm?: boolean }) {
  const { className, ...rest } = p;
  return <button type="button" {...rest} className={`btn ${variant} ${sm ? 'sm' : ''} ${className || ''}`}>{icon && <Icon name={icon} size={sm ? 15 : 17} />}<span>{children}</span></button>;
}
export const Pill = ({ cls = 'p-grey', children, style }: { cls?: string; children: React.ReactNode; style?: React.CSSProperties }) => <span className={`pill ${cls}`} style={style}>{children}</span>;
export const Notice = ({ children, blue }: { children: React.ReactNode; blue?: boolean }) => <div className={`notice ${blue ? 'blue' : ''}`}>{children}</div>;
export const ErrorBox = ({ error }: { error?: string | null }) => (error ? <div className="err" role="alert">{error}</div> : null);

/* ===== Toast ===== */
const ToastCtx = createContext<(t: string) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

/* ===== Konfirmasi (semua tambah/ubah/hapus/ganti status lewat sini) ===== */
export type ConfirmOpts = { title?: string; msg: string; detail?: string; ok?: string; danger?: boolean };
type ConfirmFn = (o: ConfirmOpts) => Promise<boolean>;
const ConfirmCtx = createContext<ConfirmFn>(async () => false);
export const useConfirm = () => useContext(ConfirmCtx);

export function Providers({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState('');
  const [show, setShow] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const notify = useCallback((t: string) => {
    setToast(t); setShow(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setShow(false), 3200);
  }, []);
  const [conf, setConf] = useState<{ o: ConfirmOpts; res: (v: boolean) => void } | null>(null);
  const confirm = useCallback<ConfirmFn>(o => new Promise(res => setConf({ o, res })), []);
  const close = (v: boolean) => { conf?.res(v); setConf(null); };
  return (
    <ToastCtx.Provider value={notify}>
      <ConfirmCtx.Provider value={confirm}>
        {children}
        {conf && (
          <Dialog top title={conf.o.title || 'Konfirmasi'} onClose={() => close(false)} footer={<>
            <Btn variant="alt" icon="x" onClick={() => close(false)}>Batal</Btn>
            <Btn variant={conf.o.danger ? 'del' : 'okb'} icon={conf.o.danger ? 'trash' : 'check'} onClick={() => close(true)} autoFocus>{conf.o.ok || 'Ya, lanjutkan'}</Btn>
          </>}>
            <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
              <span className={`cico ${conf.o.danger ? 'danger' : ''}`}><Icon name={conf.o.danger ? 'trash' : 'check'} size={22} /></span>
              <div><p style={{ margin: 0, fontWeight: 500 }}>{conf.o.msg}</p>{conf.o.detail && <p className="muted" style={{ margin: '8px 0 0' }}>{conf.o.detail}</p>}</div>
            </div>
          </Dialog>
        )}
        <div className={`toast ${show ? 'show' : ''}`} role="status" aria-live="polite">{toast}</div>
      </ConfirmCtx.Provider>
    </ToastCtx.Provider>
  );
}

/* ===== Dialog ===== */
export function Dialog({ title, onClose, children, footer, wide, top }: { title: string; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode; wide?: boolean; top?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    document.addEventListener('keydown', onKey, true);
    const prev = document.body.style.overflow; document.body.style.overflow = 'hidden';
    ref.current?.focus();
    return () => { document.removeEventListener('keydown', onKey, true); document.body.style.overflow = prev; };
  }, [onClose]);
  return (
    <div className={`ov ${top ? 'top2' : ''}`} onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`dlg ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title} ref={ref} tabIndex={-1}>
        <div className="dlg-head"><h2>{title}</h2><button type="button" className="x" aria-label="Tutup" onClick={onClose}>&times;</button></div>
        <div className="dlg-body">{children}</div>
        {footer && <div className="dlg-foot">{footer}</div>}
      </div>
    </div>
  );
}

/* ===== Form ===== */
export function Field({ label, id, children, style }: { label: string; id: string; children: React.ReactNode; style?: React.CSSProperties }) {
  return <div className="field" style={style}><label htmlFor={id}>{label}</label>{children}</div>;
}
export function Seg<T extends string>({ value, options, onChange, label }: { value: T; options: [T, string][]; onChange: (v: T) => void; label: string }) {
  return <div className="seg" role="group" aria-label={label}>{options.map(([v, t]) => <button type="button" key={v} className={v === value ? 'on' : ''} onClick={() => onChange(v)}>{t}</button>)}</div>;
}
export function SearchBox({ id, value, onChange, placeholder, label }: { id: string; value: string; onChange: (v: string) => void; placeholder: string; label: string }) {
  // jeda singkat supaya tidak menembak database di tiap ketikan
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  useEffect(() => { if (v === value) return; const t = setTimeout(() => onChange(v), 350); return () => clearTimeout(t); }, [v]); // eslint-disable-line react-hooks/exhaustive-deps
  return <div className="grow"><label htmlFor={id} className="vh">{label}</label><input id={id} type="text" placeholder={placeholder} value={v} onChange={e => setV(e.target.value)} /></div>;
}
export function Rule({ title, children, open }: { title: string; children: React.ReactNode; open?: boolean }) {
  return <details className="rule" open={open}><summary><Icon name="info" size={17} />{title}</summary>{children}</details>;
}

/* ===== Tabel dengan urut klik judul kolom ===== */
export type Col<T> = {
  key: string; label: React.ReactNode; render: (row: T, i: number) => React.ReactNode;
  sort?: (row: T) => string | number | null | undefined; cls?: string; nosort?: boolean; style?: React.CSSProperties;
  /** judul di tampilan kartu (HP); kosong = judul baris */
  card?: string;
};
export function SortTable<T>({ cols, rows, rowKey, onRow, minWidth = 760, empty, footer, cardView, sortKey: sk0, sortDir: sd0, onSort, serverSort }: {
  cols: Col<T>[]; rows: T[]; rowKey: (r: T, i: number) => string | number; onRow?: (r: T) => void; minWidth?: number;
  empty?: React.ReactNode; footer?: React.ReactNode; cardView?: boolean;
  sortKey?: string; sortDir?: 1 | -1; onSort?: (key: string, dir: 1 | -1 | 0) => void; serverSort?: boolean;
}) {
  const [lk, setLk] = useState<string | null>(null);
  const [ld, setLd] = useState<1 | -1>(1);
  const key = serverSort ? sk0 ?? null : lk, dir = serverSort ? sd0 ?? 1 : ld;
  const sorted = useMemo(() => {
    if (serverSort || !key) return rows;
    const c = cols.find(x => x.key === key);
    if (!c?.sort) return rows;
    const f = c.sort;
    return rows.map((r, idx) => ({ r, idx, k: f(r) })).sort((a, b) => {
      const ae = a.k === null || a.k === undefined || a.k === '', be = b.k === null || b.k === undefined || b.k === '';
      if (ae || be) return (ae ? 1 : 0) - (be ? 1 : 0) || a.idx - b.idx;
      const c2 = typeof a.k === 'number' && typeof b.k === 'number' ? a.k - b.k : String(a.k).localeCompare(String(b.k), 'id', { numeric: true });
      return c2 * dir || a.idx - b.idx;
    }).map(x => x.r);
  }, [rows, cols, key, dir, serverSort]);
  const click = (c: Col<T>) => {
    if (c.nosort || !c.sort) return;
    const next: 1 | -1 | 0 = key !== c.key ? 1 : dir === 1 ? -1 : 0;
    if (serverSort) { onSort?.(c.key, next); return; }
    if (next === 0) { setLk(null); setLd(1); } else { setLk(c.key); setLd(next); }
  };
  return (
    <div className="wrap">
      <table className={cardView ? 'cardtbl' : ''} style={{ minWidth }}>
        <thead><tr>{cols.map(c => {
          const sortable = !c.nosort && !!c.sort;
          return <th key={c.key} className={sortable ? 'sortable' : ''} tabIndex={sortable ? 0 : undefined}
            aria-sort={sortable && key === c.key ? (dir === 1 ? 'ascending' : 'descending') : undefined}
            onClick={() => click(c)} onKeyDown={e => { if (sortable && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); click(c); } }} style={c.style}>{c.label}</th>;
        })}</tr></thead>
        <tbody>
          {sorted.length === 0 && <tr><td colSpan={cols.length} className="muted" style={{ padding: 20 }}>{empty ?? 'Tidak ada data.'}</td></tr>}
          {sorted.map((r, i) => (
            <tr key={rowKey(r, i)} className={onRow ? 'click' : ''} onClick={onRow ? () => onRow(r) : undefined}>
              {cols.map(c => <td key={c.key} className={c.cls} data-l={cardView ? (c.card ?? (typeof c.label === 'string' ? c.label : '')) : undefined}>{c.render(r, i)}</td>)}
            </tr>
          ))}
          {footer}
        </tbody>
      </table>
    </div>
  );
}

/** Sel nama barang (kolom terpisah di samping Part number). */
export const NameCell = ({ name, label }: { name?: string | null; label?: string }) => <span data-l={label}>{name ? name : <span className="muted">-</span>}</span>;

/* ===== Memuat data dengan penanganan error ===== */
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[]): { data: T | null; error: string | null; loading: boolean; reload: () => void } {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true;
    setLoading(true);
    fn().then(d => { if (live) { setData(d); setError(null); } })
      .catch(e => { if (live) setError(msg(e)); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  return { data, error, loading, reload: () => setTick(t => t + 1) };
}
export function msg(e: unknown): string {
  if (!e) return 'Terjadi kesalahan.';
  if (typeof e === 'string') return e;
  const o = e as { message?: string; details?: string; error_description?: string };
  return o.message || o.error_description || o.details || 'Terjadi kesalahan.';
}
