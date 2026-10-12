'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { getSettings, notifyChanged } from '@/lib/db';
import { nf } from '@/lib/format';
import { Btn, ErrorBox, Notice, useConfirm, useLoad, useToast } from '@/components/ui';

export default function PengaturanPage() {
  const confirm = useConfirm(), toast = useToast();
  const { data, error, reload } = useLoad(getSettings, []);
  const [th, setTh] = useState(''), [cv, setCv] = useState(''), [ag, setAg] = useState('');
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { if (data) { setTh(String(data.ask_threshold)); setCv(nf(data.cover_months)); setAg(String(data.po_aging_days)); } }, [data]);
  const [dl, setDl] = useState(false);
  async function unduhCadangan() {
    if (!(await confirm({ title: 'Unduh cadangan', ok: 'Ya, unduh', msg: 'Unduh cadangan seluruh data sekarang?', detail: 'Berkas ZIP berisi satu CSV per tabel. Simpan di tempat aman karena memuat data customer dan harga.' }))) return;
    setDl(true); setErr(null);
    try {
      const r = await fetch('/api/backup');
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Gagal membuat cadangan.');
      const cd = r.headers.get('Content-Disposition') || '', name = /filename="([^"]+)"/.exec(cd)?.[1] || 'cadangan-sparepart.zip';
      const url = URL.createObjectURL(await r.blob());
      const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      toast('Cadangan terunduh');
    } catch (e) { setErr(e instanceof Error ? e.message : 'Gagal membuat cadangan.'); }
    setDl(false);
  }
  async function save() {
    setErr(null);
    const t = parseInt(th, 10), c = parseFloat(cv.replace(',', '.')), a = parseInt(ag, 10);
    if (!(t >= 1)) { setErr('Ambang ditanya minimal 1.'); return; }
    if (!(c >= 0)) { setErr('Cadangan tidak boleh negatif.'); return; }
    if (!(a >= 1)) { setErr('Batas umur PO minimal 1 hari.'); return; }
    if (!(await confirm({ title: 'Simpan pengaturan', ok: 'Ya, simpan', msg: 'Simpan pengaturan ini?', detail: 'Status dan saran qty di List Barang langsung dihitung ulang dengan nilai baru (kecuali filter yang diisi manual di halaman itu).' }))) return;
    const { error } = await supabase().from('app_settings').upsert([
      { key: 'ask_threshold', value: t }, { key: 'cover_months', value: c }, { key: 'po_aging_days', value: a },
    ]);
    if (error) setErr(error.message); else { toast('Pengaturan tersimpan'); reload(); notifyChanged(); }
  }
  return (
    <>
      <div className="top"><div><h1>Pengaturan</h1><p className="sub">Nilai bawaan perhitungan. Di List Barang, nilai ini bisa diganti sementara lewat Filter.</p></div></div>
      <ErrorBox error={err || error} />
      <section className="card">
        <div className="fgrid" style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit,minmax(min(240px,100%),1fr))' }}>
          <div className="field"><label htmlFor="s-th">Ditanya minimal (kali) sebelum dihitung</label><input id="s-th" type="text" inputMode="numeric" value={th} onChange={e => setTh(e.target.value)} /></div>
          <div className="field"><label htmlFor="s-cv">Cadangan di atas lama datang (bulan)</label><input id="s-cv" type="text" inputMode="decimal" value={cv} onChange={e => setCv(e.target.value)} /></div>
          <div className="field"><label htmlFor="s-ag">PO ditandai merah setelah (hari sejak dibuat)</label><input id="s-ag" type="text" inputMode="numeric" value={ag} onChange={e => setAg(e.target.value)} /></div>
        </div>
        <div><Btn icon="check" onClick={save}>Simpan</Btn></div>
      </section>
      <section className="card">
        <h2 style={{ margin: 0, fontSize: 16 }}>Cadangan data</h2>
        <p className="sub" style={{ margin: '6px 0 12px' }}>Setiap hari sekitar pukul 04.30 WIB, sistem menyimpan cadangan otomatis ke penyimpanan privat di Supabase (bucket &quot;cadangan&quot;, 14 hari terakhir). Anda juga bisa mengunduh sendiri kapan saja.</p>
        <div><Btn icon="download" onClick={unduhCadangan} disabled={dl}>{dl ? 'Menyiapkan…' : 'Unduh cadangan sekarang'}</Btn></div>
      </section>
      <Notice blue>Produk yang ditanya kurang dari ambang berstatus Pantau dan tidak dapat saran PO. Target stok = lama datang supplier + cadangan.</Notice>
    </>
  );
}
