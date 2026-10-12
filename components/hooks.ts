'use client';
import { useEffect, useRef, useState } from 'react';
import { DATA_EVENT } from '@/lib/db';
import { addDays, monthBounds, recentMonths, todayWib } from '@/lib/format';

export function useOnDataChanged(cb: () => void) {
  const ref = useRef(cb); ref.current = cb;
  useEffect(() => { const f = () => ref.current(); window.addEventListener(DATA_EVENT, f); return () => window.removeEventListener(DATA_EVENT, f); }, []);
}

/** State yang diingat selama tab terbuka (sessionStorage), aman kalau penyimpanan diblokir. */
export function useSessionState<T>(key: string, initial: T): [T, (v: T | ((p: T) => T)) => void] {
  const [v, setV] = useState<T>(initial);
  const loaded = useRef(false);
  useEffect(() => {
    try { const s = sessionStorage.getItem('sp:' + key); if (s) setV(JSON.parse(s)); } catch { /* abaikan */ }
    loaded.current = true;
  }, [key]);
  useEffect(() => { if (!loaded.current) return; try { sessionStorage.setItem('sp:' + key, JSON.stringify(v)); } catch { /* abaikan */ } }, [key, v]);
  return [v, setV];
}

export type LbParams = { fromM: string; toM: string; th: number | null; cover: number | null; status: string };
export function defaultLb(today = todayWib()): LbParams {
  const ms = recentMonths(6, today);
  return { fromM: ms[ms.length - 1].key, toM: ms[0].key, th: null, cover: null, status: 'Semua' };
}
/** Tanggal awal/akhir dari pilihan bulan. Bulan berjalan dipotong sampai hari ini supaya pembagi tidak menghitung hari yang belum terjadi. */
export function lbDates(p: LbParams, today = todayWib()): { from: string; to: string; label: string } {
  let [a, b] = [p.fromM, p.toM];
  if (a > b) [a, b] = [b, a];
  const from = monthBounds(+a.slice(0, 4), +a.slice(5, 7))[0];
  let to = monthBounds(+b.slice(0, 4), +b.slice(5, 7))[1];
  if (to > today) to = today;
  if (from > to) return { from: addDays(today, -29), to: today, label: '' };
  return { from, to, label: '' };
}
