'use client';
import { nf } from '@/lib/format';
import type { LbRow } from '@/lib/types';

export function FxGeneric({ cover, th }: { cover: number; th: number }) {
  const R = [
    ['Kebutuhan per bulan', 'max(Terjual, Diminta) ÷ (jumlah hari di periode ÷ 30)', 'Terjual = qty di invoice Jurnal. Diminta = qty yang ditanya customer, termasuk saat stok kosong. Diambil yang lebih besar supaya barang laris yang sering kosong tidak terlewat.'],
    ['Punya', 'Stok Jurnal + Qty di PO', 'Barang yang sudah dipesan ikut dihitung supaya tidak pesan dobel. Hanya PO berstatus Dipesan yang dihitung (Draft, Selesai, dan Dibatalkan tidak).'],
    ['Cukup untuk', 'Punya ÷ Kebutuhan per bulan', 'Berapa bulan barang yang ada bisa melayani permintaan.'],
    ['Target', 'Lama datang + Cadangan', 'Pesanan harus sudah jalan sebelum stok habis. Lama datang dari supplier, cadangan sekarang ' + nf(cover) + ' bulan.'],
    ['Status', 'Perlu PO kalau Cukup untuk < Target', 'Cukup kalau sama atau lebih. Pantau kalau ditanya kurang dari ' + th + ' kali di periode ini.'],
    ['Saran qty PO', 'Target × Kebutuhan per bulan − Punya', 'Jumlah yang menutup kebutuhan sampai target. Minimal 1.'],
  ];
  return (
    <>
      <div className="fx">{R.map(r => <div className="fx-r" key={r[0]}><span className="k">{r[0]}</span><span className="f">= {r[1]}</span><span className="w">{r[2]}</span></div>)}</div>
      <span className="muted" style={{ display: 'block', marginBottom: 8 }}>Lama datang diambil dari supplier PO terakhir produk itu; kalau belum pernah di-PO, dari supplier penawaran terakhir di Daftar Request (diatur di menu Supplier). Belum ada supplier: dianggap 1 bulan.</span>
    </>
  );
}

export function FxProduct({ r, months, cover, th }: { r: LbRow; months: number; cover: number; th: number }) {
  const perMonth = r.need;
  const R: [string, string, string | number][] = [
    ['Kebutuhan per bulan', `max(terjual ${nf(r.sold)}, diminta ${r.qsum}) ÷ ${nf(months)} bulan`, `${nf(perMonth)} pcs`],
    ['Punya', r.in_jurnal ? `stok ${r.stock} + PO ${r.qty_wait + r.qty_ship}` : `PO ${r.qty_wait + r.qty_ship} (stok Jurnal belum ada)`, `${nf(r.have)} pcs`],
    ['Cukup untuk', `${nf(r.have)} ÷ ${nf(perMonth)}`, perMonth > 0 && r.cover !== null ? nf(r.cover) + ' bulan' : 'tidak ada permintaan'],
    ['Target', `lama datang ${nf(r.lead)}${r.lead_default ? ' (belum ada supplier, anggap 1)' : ' (' + (r.lead_name ?? '') + ')'} + cadangan ${nf(cover)}`, nf(r.target) + ' bulan'],
    ['Status', r.asked < th ? `ditanya ${r.asked} kali, kurang dari ${th}` : perMonth > 0 && r.cover !== null ? `${nf(r.cover)}${r.cover < r.target ? ' < ' : ' ≥ '}${nf(r.target)}` : 'tidak ada permintaan', r.status],
    ['Saran qty PO', r.status === 'Perlu PO' ? `${nf(r.target)} × ${nf(perMonth)} − ${nf(r.have)}` : 'tidak perlu', r.saran || '-'],
  ];
  return <div className="fx">{R.map(x => <div className="fx-r" key={x[0]}><span className="k">{x[0]}</span><span className="f">= {x[1]} <b>= {x[2]}</b></span></div>)}</div>;
}
