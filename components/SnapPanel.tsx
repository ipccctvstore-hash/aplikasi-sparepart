'use client';
import { useState } from 'react';
import { rpc } from '@/lib/db';
import { normRange, rangeLabel } from '@/lib/format';
import { ErrorBox, IconButton, Pill, useLoad } from './ui';
import { useOnDataChanged, useSessionState } from './hooks';

type Stat = { user_id: string; name: string; active: boolean; req: number; selesai: number; dibantu: number; prod: number; done: number };

export function SnapPanel({ from, to, onPick, toggle }: { from: string; to: string; onPick?: (id: string) => void; toggle?: boolean }) {
  const [open, setOpen] = useSessionState('snap', true);
  const [lo, hi] = normRange(from, to);
  const { data, error, reload } = useLoad(() => rpc<Stat[]>('admin_stats', { p_from: lo || null, p_to: hi || null }), [lo, hi]);
  useOnDataChanged(reload);
  const show = !toggle || open;
  const all = (data ?? []).reduce((a, s) => ({ req: a.req + s.req, selesai: a.selesai + s.selesai, dibantu: a.dibantu + s.dibantu, prod: a.prod + s.prod, done: a.done + s.done }), { req: 0, selesai: 0, dibantu: 0, prod: 0, done: 0 });
  const badge = (s: { req: number; prod: number; done: number }): [string, string] => (!s.req ? ['Belum input', 'p-grey'] : s.done >= s.prod ? ['Lengkap', 'p-teal'] : s.done * 2 >= s.prod ? ['Berjalan', 'p-amber'] : ['Tertinggal', 'p-red']);
  const card = (name: string, s: typeof all, id: string) => {
    const b = badge(s);
    return (
      <button type="button" key={id || 'all'} className="snapc" aria-label={`Lihat request ${name}`} onClick={() => onPick?.(id)}>
        <div className="sh"><span className="av" aria-hidden="true">{name.slice(0, 1)}</span><b>{name}</b><Pill cls={b[1]} style={{ marginLeft: 'auto' }}>{b[0]}</Pill></div>
        <div><span className="big">{s.req}</span> <span className="muted">request, {s.prod} produk</span></div>
        <div className="bar"><i style={{ width: `${s.prod ? Math.round(s.done / s.prod * 100) : 0}%` }} /></div>
        <span className="muted">{s.done} dari {s.prod} produk sudah ada supplier. {s.selesai} request selesai{s.dibantu ? `, ${s.dibantu} dilengkapi admin lain` : ''}.</span>
      </button>
    );
  };
  return (
    <section className="card" aria-label="Ringkasan per admin">
      <div className="top" style={{ alignItems: 'flex-start', flexWrap: 'nowrap' }}>
        <div style={{ flex: '1 1 auto', minWidth: 0 }}><h2>Input per admin</h2>
          <span className="muted">{rangeLabel(from, to)}. {show ? 'Dihitung atas nama penanggung jawab input. Klik kartu untuk melihat daftarnya.' : `${all.req} request, ${all.done} dari ${all.prod} produk sudah ada supplier.`}</span></div>
        {toggle && <IconButton icon={open ? 'chevup' : 'chevdown'} label={open ? 'Sembunyikan ringkasan admin' : 'Tampilkan ringkasan admin'} onClick={() => setOpen(!open)} />}
      </div>
      <ErrorBox error={error} />
      {show && data && <div className="snaps">{card('Semua admin', all, '')}{data.map(s => card(s.name, s, s.user_id))}</div>}
    </section>
  );
}

