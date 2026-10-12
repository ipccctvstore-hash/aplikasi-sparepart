'use client';
import { PLAB, periodRange, recentMonths, todayWib } from '@/lib/format';
import { Btn } from './ui';

/** Pilihan periode tanggal: tombol cepat + dua tanggal. */
export function RangeBar({ from, to, onChange, max }: { from: string; to: string; onChange: (from: string, to: string) => void; max?: string }) {
  const today = todayWib();
  return (
    <div className="range" role="group" aria-label="Periode">
      <b className="muted">Periode</b>
      {Object.keys(PLAB).map(p => {
        const r = periodRange(p, today);
        return <Btn key={p} sm variant="alt" className={r[0] === from && r[1] === to ? 'on' : ''} onClick={() => onChange(r[0], r[1])}>{PLAB[p]}</Btn>;
      })}
      <span className="dates">
        <label className="vh" htmlFor="rg-f">Dari tanggal</label>
        <input id="rg-f" type="date" value={from} max={max} onChange={e => onChange(e.target.value, to)} />
        <span className="muted">sampai</span>
        <label className="vh" htmlFor="rg-t">Sampai tanggal</label>
        <input id="rg-t" type="date" value={to} max={max} onChange={e => onChange(from, e.target.value)} />
      </span>
    </div>
  );
}

/** Pilihan periode bulan (12 bulan terakhir). */
export function MonthBar({ fromM, toM, onChange }: { fromM: string; toM: string; onChange: (a: string, b: string) => void }) {
  const ms = recentMonths(12);
  return (
    <div className="range" role="group" aria-label="Periode">
      <b className="muted">Periode</b>
      <span className="dates">
        <label className="vh" htmlFor="mb-f">Dari bulan</label>
        <select id="mb-f" value={fromM} onChange={e => onChange(e.target.value, toM)}>{ms.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}</select>
        <span className="muted">sampai</span>
        <label className="vh" htmlFor="mb-t">Sampai bulan</label>
        <select id="mb-t" value={toM} onChange={e => onChange(fromM, e.target.value)}>{ms.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}</select>
      </span>
    </div>
  );
}

export function FilterButton({ open, count, onClick }: { open: boolean; count?: number; onClick: () => void }) {
  return <Btn sm variant="alt" aria-expanded={open} onClick={onClick}>{`Filter${count ? ` (${count})` : ''}`}</Btn>;
}
