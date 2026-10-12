'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { Btn, ErrorBox, msg } from '@/components/ui';

export default function GantiPassword() {
  const router = useRouter();
  const [a, setA] = useState(''); const [b, setB] = useState('');
  const [error, setError] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setError(null);
    if (a.length < 8) { setError('Password minimal 8 karakter.'); return; }
    if (a !== b) { setError('Kedua password tidak sama.'); return; }
    setBusy(true);
    const { error } = await supabase().auth.updateUser({ password: a, data: { must_change_password: false } });
    if (error) { setError(msg(error)); setBusy(false); return; }
    await supabase().auth.refreshSession();
    router.replace('/dashboard'); router.refresh();
  }
  const style = { width: '100%', height: 44, padding: '0 14px', border: '1px solid #DCE5EC', borderRadius: 12 } as const;
  return (
    <main className="login">
      <form className="card" onSubmit={submit}>
        <h1 style={{ fontSize: 22 }}>Buat password baru</h1>
        <p className="muted" style={{ margin: 0 }}>Demi keamanan, password awal harus diganti sebelum memakai aplikasi.</p>
        <div className="field"><label htmlFor="p1">Password baru</label><input id="p1" type="password" autoComplete="new-password" value={a} onChange={e => setA(e.target.value)} style={style} /></div>
        <div className="field"><label htmlFor="p2">Ulangi password baru</label><input id="p2" type="password" autoComplete="new-password" value={b} onChange={e => setB(e.target.value)} style={style} /></div>
        <ErrorBox error={error} />
        <Btn type="submit" disabled={busy}>{busy ? 'Menyimpan...' : 'Simpan password'}</Btn>
      </form>
    </main>
  );
}
