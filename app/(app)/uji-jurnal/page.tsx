'use client';
import { useState } from 'react';
import { Btn, ErrorBox, Notice, Pill } from '@/components/ui';

type Step = { name: string; ok: boolean; ms: number; error?: string; count?: number; total?: number | null; shape?: unknown; mapped?: unknown; unmapped?: number; listHasLines?: boolean };
type Res = { error?: string; baseUrl?: string; steps?: Step[]; note?: string };

export default function UjiJurnal() {
  const [res, setRes] = useState<Res | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  async function run() {
    setBusy(true); setErr(null); setRes(null); setCopied(false);
    try {
      const r = await fetch('/api/jurnal/uji', { cache: 'no-store' });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Gagal.');
      setRes(j);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  const text = res ? JSON.stringify(res, null, 2) : '';
  return (
    <>
      <div className="top"><div><h1>Uji API Jurnal</h1><p className="sub">Mengecek koneksi dan bentuk data Jurnal sebelum sync pertama. Hanya membaca (GET). Client ID dan Secret tidak pernah ditampilkan.</p></div>
        <div className="actions"><Btn disabled={busy} onClick={run}>{busy ? 'Menguji...' : 'Jalankan uji'}</Btn></div></div>
      <ErrorBox error={err} />
      {res?.error && <Notice>{res.error}</Notice>}
      {res?.steps?.map(s => (
        <section className="card" key={s.name}>
          <div className="top" style={{ alignItems: 'center' }}><h2>{s.name}</h2><Pill cls={s.ok ? 'p-teal' : 'p-red'}>{s.ok ? 'Berhasil' : 'Gagal'}</Pill></div>
          <span className="muted">{s.ms} ms{s.count !== undefined ? `, ${s.count} baris contoh` : ''}{s.total ? `, total ${s.total}` : ''}</span>
          {s.error && <div className="err">{s.error}</div>}
          {s.unmapped ? <Notice>{s.unmapped} baris contoh tidak terbaca (tanpa kode produk atau tanggal). Bentuk datanya perlu disesuaikan.</Notice> : null}
          {s.shape !== undefined && <details className="rule"><summary>Bentuk data (nama field)</summary><pre style={{ overflow: 'auto', margin: 0 }}>{JSON.stringify(s.shape, null, 2)}</pre></details>}
          {s.mapped !== undefined && <details className="rule"><summary>Hasil pemetaan ke aplikasi</summary><pre style={{ overflow: 'auto', margin: 0 }}>{JSON.stringify(s.mapped, null, 2)}</pre></details>}
        </section>
      ))}
      {res && (
        <div><Btn variant="alt" onClick={async () => { try { await navigator.clipboard.writeText(text); setCopied(true); } catch { setErr('Salin manual dari kotak di bawah.'); } }}>{copied ? 'Tersalin' : 'Salin hasil uji'}</Btn>
          <p className="muted">Hasil di atas tidak berisi rahasia, aman ditempel ke chat. Bagian nama produk dan nomor invoice adalah data contoh dari Jurnal kamu; hapus kalau tidak mau dibagikan.</p></div>
      )}
      {!res && !busy && <Notice blue>Klik Jalankan uji. Aplikasi membaca 3 produk dan 3 invoice terbaru dari Jurnal, lalu menampilkan nama field dan hasil pemetaannya. Kirim hasilnya ke Claude kalau pemetaan perlu disesuaikan.</Notice>}
    </>
  );
}
