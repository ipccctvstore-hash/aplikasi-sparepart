'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createContext, useContext, useEffect, useState } from 'react';
import { Icon } from './ui';
import { supabase } from '@/lib/supabase/client';
import { RequestHost } from './RequestDialog';
import { ProductHost } from './ProductDialogs';

export type Me = { id: string; name: string; role: 'admin' | 'super'; email: string };
const MeCtx = createContext<Me>({ id: '', name: '', role: 'admin', email: '' });
export const useMe = () => useContext(MeCtx);

const NAV_ALL: [string, string, string][] = [['/dashboard', 'Dashboard', 'grid'], ['/daftar', 'Daftar Request', 'clip'], ['/barang', 'List Barang', 'box'], ['/menipis', 'Stok Menipis', 'alert']];
const NAV_SUPER: [string, string, string][] = [['/banding', 'Banding Harga', 'scale'], ['/po', 'PO', 'file']];
const SETNAV: [string, string, string][] = [['/customer', 'Customer', 'users'], ['/user', 'User', 'user'], ['/supplier', 'Supplier dan kurs', 'truck'], ['/pengaturan', 'Pengaturan', 'gear'], ['/uji-jurnal', 'Uji API Jurnal', 'plug']];

export default function Shell({ me, children }: { me: Me; children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [low, setLow] = useState<number | null>(null);
  const isSuper = me.role === 'super';

  useEffect(() => { setOpen(false); }, [path]);
  useEffect(() => {
    let live = true;
    supabase().from('v_products').select('sku', { count: 'exact', head: true }).eq('is_low', true)
      .then(({ count }) => { if (live) setLow(count ?? 0); });
    return () => { live = false; };
  }, [path]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const item = ([href, label, ico]: [string, string, string]) => {
    const on = path === href || path.startsWith(href + '/');
    return (
      <Link key={href} href={href} className={on ? 'on' : ''} style={{ textDecoration: 'none' }} aria-current={on ? 'page' : undefined}>
        <NavBtn on={on}><Icon name={ico} size={20} /><span>{label}</span>{href === '/menipis' && low !== null && <span className="navbadge">{low}</span>}</NavBtn>
      </Link>
    );
  };
  async function logout() { await supabase().auth.signOut(); router.replace('/login'); router.refresh(); }

  return (
    <MeCtx.Provider value={me}>
      <RequestHost><ProductHost>
      <header className="mbar">
        <button type="button" onClick={() => setOpen(o => !o)} aria-label={open ? 'Tutup menu' : 'Buka menu'} aria-expanded={open} aria-controls="side">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
        </button>
        <b>Sparepart</b>
      </header>
      <div className={`nbd ${open ? 'show' : ''}`} onClick={() => setOpen(false)} />
      <div className="app">
        <aside id="side" className={open ? 'open' : ''}>
          <div className="brand"><span className="logo" aria-hidden="true">S</span><div><b>Sparepart</b><span className="sm">Analisa permintaan</span></div>
            <button type="button" className="aclose" onClick={() => setOpen(false)} aria-label="Tutup menu">&times;</button></div>
          <nav aria-label="Menu utama">
            {NAV_ALL.map(item)}
            {isSuper && <>{NAV_SUPER.map(item)}<div className="grp">Pengaturan</div>{SETNAV.map(item)}</>}
          </nav>
          <div className="side-foot">
            <div className="box"><span style={{ display: 'block', color: '#FFE1E1', marginBottom: 6 }}>Masuk sebagai</span>
              <b style={{ display: 'block' }}>{me.name}</b><span style={{ fontSize: 12, color: '#FFD3D3' }}>{isSuper ? 'Superadmin' : 'Admin'}</span>
              <button type="button" onClick={logout} style={{ marginTop: 10, width: '100%', height: 40, borderRadius: 10, border: 0, background: '#fff', color: 'var(--brand)', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}><Icon name="logout" size={16} />Keluar</button></div>
            <div className="ro">Jurnal: hanya baca. Aplikasi ini tidak punya fitur tulis ke Jurnal.</div>
          </div>
        </aside>
        <main>
          <div className="hello"><span className="hl">Aplikasi Sparepart</span><div className="hw"><span>Halo, <b>{me.name}</b></span><span className="av" aria-hidden="true">{me.name.slice(0, 1)}</span></div></div>
          {children}
        </main>
      </div>
    </ProductHost></RequestHost>
    </MeCtx.Provider>
  );
}

// Tombol menu tanpa elemen button bersarang di dalam Link: pakai div dengan gaya yang sama.
function NavBtn({ on, children }: { on: boolean; children: React.ReactNode }) {
  return <span className={`navitem ${on ? 'on' : ''}`}>{children}</span>;
}
