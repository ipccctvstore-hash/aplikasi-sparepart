'use client';
import { useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { notifyChanged, rpc } from '@/lib/db';
import { Btn, Dialog, ErrorBox, IconButton, Pill, SearchBox, SortTable, msg, useConfirm, useLoad, useToast } from '@/components/ui';

type C = { id: number; name: string; note: string; active: boolean; requests: { count: number }[] };
const cnt = (c: C) => c.requests?.[0]?.count ?? 0;

export default function CustomerPage() {
  const confirm = useConfirm(), toast = useToast();
  const [q, setQ] = useState('');
  const [form, setForm] = useState<null | { id?: number; name: string; note: string }>(null);
  const [merge, setMerge] = useState<C | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const { data, error, loading, reload } = useLoad(async () => {
    const { data, error } = await supabase().from('customers').select('id,name,note,active,requests(count)').order('name');
    if (error) throw error;
    return data as unknown as C[];
  }, []);
  const list = (data ?? []).filter(c => c.name.toLowerCase().includes(q.toLowerCase()) || c.note.toLowerCase().includes(q.toLowerCase()));
  const done = (m: string) => { toast(m); reload(); notifyChanged(); };
  async function del(c: C) {
    if (!(await confirm({ title: 'Hapus customer', danger: true, ok: 'Ya, hapus', msg: `Hapus customer ${c.name}?`, detail: cnt(c) ? `Customer ini punya ${cnt(c)} request. Gabungkan ke customer lain dulu.` : '' }))) return;
    const { error } = await supabase().from('customers').delete().eq('id', c.id);
    if (error) { setErr(error.code === '23503' ? `${c.name} masih punya request. Gabungkan ke customer lain dulu.` : error.message); return; }
    done('Customer dihapus');
  }
  async function toggle(c: C) {
    if (!(await confirm({ title: c.active ? 'Nonaktifkan' : 'Aktifkan', ok: 'Ya, lanjutkan', msg: `${c.active ? 'Nonaktifkan' : 'Aktifkan'} ${c.name}?`, detail: c.active ? 'Tidak muncul lagi di pilihan customer saat tambah request.' : '' }))) return;
    const { error } = await supabase().from('customers').update({ active: !c.active }).eq('id', c.id);
    if (error) setErr(error.message); else done('Tersimpan');
  }
  return (
    <>
      <div className="top"><div><h1>Customer</h1><p className="sub">Tambah dari form request boleh semua admin. Ubah, gabungkan, dan hapus hanya superadmin.</p></div><div className="actions"><Btn icon="plus" onClick={() => setForm({ name: '', note: '' })}>Tambah customer</Btn></div></div>
      <div className="toolbar"><SearchBox id="cq" value={q} onChange={setQ} placeholder="Cari customer" label="Cari customer" /></div>
      <ErrorBox error={err || error} />
      <SortTable<C> minWidth={680} rows={list} rowKey={c => c.id} empty={loading ? 'Memuat...' : 'Tidak ada customer.'}
        cols={[
          { key: 'n', label: 'Nama', sort: c => c.name, render: c => <b>{c.name}</b> },
          { key: 'c', label: 'Catatan', sort: c => c.note, render: c => <span className="muted">{c.note}</span> },
          { key: 'r', label: 'Request', sort: c => cnt(c), render: c => cnt(c) },
          { key: 's', label: 'Status', sort: c => (c.active ? 1 : 0), render: c => <Pill cls={c.active ? 'p-teal' : 'p-grey'}>{c.active ? 'Aktif' : 'Nonaktif'}</Pill> },
          { key: 'a', label: '', nosort: true, cls: 'act', render: c => <><IconButton icon="edit" label="Ubah customer" onClick={() => setForm({ id: c.id, name: c.name, note: c.note })} /><IconButton icon="merge" label="Gabungkan customer" onClick={() => setMerge(c)} /><IconButton icon="ban" label={c.active ? 'Nonaktifkan' : 'Aktifkan'} onClick={() => toggle(c)} /><IconButton icon="trash" label="Hapus customer" cls="del" onClick={() => del(c)} /></> },
        ]} />
      {form && <CustForm init={form} onClose={() => setForm(null)} onSaved={m => { setForm(null); done(m); }} />}
      {merge && <MergeForm src={merge} all={(data ?? []).filter(c => c.id !== merge.id)} onClose={() => setMerge(null)} onSaved={m => { setMerge(null); done(m); }} />}
    </>
  );
}

function CustForm({ init, onClose, onSaved }: { init: { id?: number; name: string; note: string }; onClose: () => void; onSaved: (m: string) => void }) {
  const confirm = useConfirm();
  const [f, setF] = useState(init);
  const [err, setErr] = useState<string | null>(null);
  async function save() {
    if (!f.name.trim()) { setErr('Isi nama customer.'); return; }
    if (!(await confirm({ title: f.id ? 'Ubah customer' : 'Tambah customer', ok: 'Ya, simpan', msg: f.id ? `Simpan perubahan ${f.name}?` : `Tambah customer ${f.name}?` }))) return;
    const t = supabase().from('customers');
    const { error } = f.id ? await t.update({ name: f.name.trim(), note: f.note.trim() }).eq('id', f.id) : await t.insert({ name: f.name.trim(), note: f.note.trim() });
    if (error) setErr(error.code === '23505' ? 'Nama customer itu sudah ada.' : error.message); else onSaved('Customer tersimpan');
  }
  return (
    <Dialog title={f.id ? 'Ubah customer' : 'Tambah customer'} onClose={onClose} footer={<><Btn variant="alt" onClick={onClose}>Batal</Btn><Btn icon="check" onClick={save}>Simpan</Btn></>}>
      <ErrorBox error={err} />
      <div className="field"><label htmlFor="c-name">Nama customer</label><input id="c-name" type="text" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /></div>
      <div className="field"><label htmlFor="c-note">Catatan (kota, kontak)</label><input id="c-note" type="text" value={f.note} onChange={e => setF({ ...f, note: e.target.value })} /></div>
    </Dialog>
  );
}

function MergeForm({ src, all, onClose, onSaved }: { src: C; all: C[]; onClose: () => void; onSaved: (m: string) => void }) {
  const confirm = useConfirm();
  const [t, setT] = useState(all[0]?.id ?? 0);
  const [err, setErr] = useState<string | null>(null);
  async function go() {
    const target = all.find(c => c.id === t); if (!target) return;
    if (!(await confirm({ title: 'Gabungkan customer', ok: 'Ya, gabungkan', danger: true, msg: `Gabungkan ${src.name} ke ${target.name}?`, detail: `${cnt(src)} request dipindah ke ${target.name}, lalu ${src.name} dihapus dari daftar. Tidak bisa dibatalkan.` }))) return;
    try { await rpc('merge_customers', { p_from: src.id, p_to: t }); onSaved('Customer digabung'); } catch (e) { setErr(msg(e)); }
  }
  return (
    <Dialog title="Gabungkan customer" onClose={onClose} footer={<><Btn variant="alt" onClick={onClose}>Batal</Btn><Btn disabled={!t} onClick={go}>Gabungkan</Btn></>}>
      <ErrorBox error={err} />
      <p style={{ margin: 0 }}>Semua request <b>{src.name}</b> ({cnt(src)}) dipindah ke customer tujuan, lalu <b>{src.name}</b> dihapus dari daftar.</p>
      <div className="field"><label htmlFor="m-target">Gabungkan ke</label><select id="m-target" value={t} onChange={e => setT(+e.target.value)}>{all.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
    </Dialog>
  );
}
