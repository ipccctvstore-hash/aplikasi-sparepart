'use client';
import { Suspense, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { Btn, ErrorBox } from '@/components/ui';

function Form() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    const { error } = await supabase().auth.signInWithPassword({ email: email.trim(), password });
    if (error) { setError('Email atau password salah, atau akun dinonaktifkan.'); setBusy(false); return; }
    router.replace('/dashboard'); router.refresh();
  }
  return (
    <main className="login" style={{ padding: 20 }}>
      <form className="card" onSubmit={submit}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <span className="logo" style={{ background: 'var(--brand)', color: '#fff' }} aria-hidden="true">S</span>
          <div><h1 style={{ fontSize: 22 }}>Aplikasi Sparepart</h1><span className="muted">Masuk untuk melanjutkan</span></div>
        </div>
        <div className="field"><label htmlFor="em">Email</label><input id="em" type="text" inputMode="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} /></div>
        <div className="field"><label htmlFor="pw">Password</label><input id="pw" type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} style={{ width: '100%', height: 44, padding: '0 14px', border: '1px solid #DCE5EC', borderRadius: 12 }} /></div>
        <ErrorBox error={error} />
        <Btn type="submit" disabled={busy || !email || !password}>{busy ? 'Masuk...' : 'Masuk'}</Btn>
        <p className="muted" style={{ margin: 0 }}>Lupa password? Minta Superadmin mereset akunmu.</p>
      </form>
    </main>
  );
}
export default function LoginPage() { return <Suspense><Form /></Suspense>; }
