'use client';
import { useState } from 'react';
import { notifyChanged } from '@/lib/db';
import { Btn, Dialog, ErrorBox, IconButton, Notice, Pill, SortTable, msg, useConfirm, useLoad, useToast } from '@/components/ui';
import { useMe } from '@/components/Shell';

type U = { id: string; name: string; email: string; role: 'admin' | 'super'; active: boolean; must_change_password: boolean };
async function api(method: string, body?: object) {
  const r = await fetch('/api/users', { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'Gagal.');
  return j;
}

export default function UserPage() {
  const me = useMe(), confirm = useConfirm(), toast = useToast();
  const [form, setForm] = useState<null | { id?: string; name: string; email: string; role: 'admin' | 'super' }>(null);
  const [err, setErr] = useState<string | null>(null);
  const { data, error, loading, reload } = useLoad(async () => (await api('GET')).users as U[], []);

  async function toggle(u: U) {
    if (!(await confirm({ title: u.active ? 'Nonaktifkan user' : 'Aktifkan user', ok: 'Ya, lanjutkan', msg: `${u.active ? 'Nonaktifkan' : 'Aktifkan'} ${u.name}?`, detail: u.active ? 'User tidak bisa masuk lagi. Request lamanya tetap tercatat.' : '' }))) return;
    try { await api('PATCH', { id: u.id, active: !u.active }); toast('Tersimpan'); reload(); notifyChanged(); } catch (e) { setErr(msg(e)); }
  }
  async function reset(u: U) {
    if (!(await confirm({ title: 'Reset password', ok: 'Ya, reset', msg: `Kembalikan password ${u.name} ke password awal?`, detail: 'User wajib menggantinya saat masuk berikutnya.' }))) return;
    try { await api('PATCH', { id: u.id, reset: true }); toast('Password dikembalikan ke password awal'); reload(); } catch (e) { setErr(msg(e)); }
  }
  return (
    <>
      <div className="top"><div><h1>User</h1><p className="sub">Nama user dipakai sebagai handle di request. Hanya ada 1 superadmin.</p></div><div className="actions"><Btn icon="plus" onClick={() => setForm({ name: '', email: '', role: 'admin' })}>Tambah user</Btn></div></div>
      <ErrorBox error={err || error} />
      <SortTable<U> minWidth={760} rows={data ?? []} rowKey={u => u.id} empty={loading ? 'Memuat...' : 'Belum ada user.'}
        cols={[
          { key: 'n', label: 'Nama', sort: u => u.name, render: u => <b>{u.name}</b> },
          { key: 'e', label: 'Email', sort: u => u.email, render: u => u.email },
          { key: 'r', label: 'Peran', sort: u => u.role, render: u => <Pill cls={u.role === 'super' ? 'p-red' : 'p-grey'}>{u.role === 'super' ? 'Superadmin' : 'Admin'}</Pill> },
          { key: 's', label: 'Status', sort: u => (u.active ? 1 : 0), render: u => <><Pill cls={u.active ? 'p-teal' : 'p-grey'}>{u.active ? 'Aktif' : 'Nonaktif'}</Pill>{u.must_change_password && <><br /><span className="muted">Belum ganti password awal</span></>}</> },
          { key: 'a', label: '', nosort: true, cls: 'act', render: u => <>
            <IconButton icon="edit" label="Ubah user" onClick={() => setForm({ id: u.id, name: u.name, email: u.email, role: u.role })} />
            <IconButton icon="undo" label="Reset password" onClick={() => reset(u)} />
            {u.id !== me.id && <IconButton icon="ban" label={u.active ? 'Nonaktifkan' : 'Aktifkan'} onClick={() => toggle(u)} />}</> },
        ]} />
      <Notice blue>User baru masuk dengan password awal dari pengaturan server, lalu diminta menggantinya. Admin bisa input dan tambah data, tapi tidak bisa menghapus data dan tidak melihat Banding, PO, dan Pengaturan.</Notice>
      {form && <UserForm init={form} onClose={() => setForm(null)} onSaved={() => { setForm(null); reload(); notifyChanged(); }} />}
    </>
  );
}

function UserForm({ init, onClose, onSaved }: { init: { id?: string; name: string; email: string; role: 'admin' | 'super' }; onClose: () => void; onSaved: () => void }) {
  const confirm = useConfirm(), toast = useToast();
  const [f, setF] = useState(init);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function save() {
    setErr(null);
    if (!f.name.trim()) { setErr('Isi nama.'); return; }
    if (!f.id && !f.email.trim()) { setErr('Isi email.'); return; }
    if (!(await confirm({ title: f.id ? 'Ubah user' : 'Tambah user', ok: 'Ya, simpan', msg: f.id ? `Simpan perubahan ${f.name}?` : `Tambah user ${f.name} (${f.email})?` }))) return;
    setBusy(true);
    try {
      if (f.id) await api('PATCH', { id: f.id, name: f.name, role: f.role }); else await api('POST', f);
      toast('Tersimpan'); onSaved();
    } catch (e) { setErr(msg(e)); setBusy(false); }
  }
  return (
    <Dialog title={f.id ? 'Ubah user' : 'Tambah user'} onClose={onClose} footer={<><Btn variant="alt" onClick={onClose}>Batal</Btn><Btn icon="check" disabled={busy} onClick={save}>Simpan</Btn></>}>
      <ErrorBox error={err} />
      <div className="field"><label htmlFor="u-name">Nama (dipakai sebagai handle)</label><input id="u-name" type="text" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /></div>
      <div className="field"><label htmlFor="u-email">Email</label><input id="u-email" type="email" value={f.email} readOnly={!!f.id} onChange={e => setF({ ...f, email: e.target.value })} /></div>
      <div className="field"><label htmlFor="u-role">Peran</label><select id="u-role" value={f.role} onChange={e => setF({ ...f, role: e.target.value as 'admin' | 'super' })}>
        <option value="admin">Admin: input dan tambah, tidak bisa hapus atau ubah data master</option><option value="super">Superadmin: akses penuh (hanya 1)</option></select></div>
    </Dialog>
  );
}
