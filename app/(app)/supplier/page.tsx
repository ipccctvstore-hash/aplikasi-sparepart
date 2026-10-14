'use client';
import { useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { getSuppliers, notifyChanged } from '@/lib/db';
import { dec, fmt, leadShow, nf } from '@/lib/format';
import { TYPE_CLS } from '@/lib/types';
import type { Currency, Supplier, SupplierType } from '@/lib/types';
import { Btn, Dialog, ErrorBox, IconButton, Notice, Pill, SortTable, useConfirm, useLoad, useToast } from '@/components/ui';

const TYPES: SupplierType[] = ['Stok sendiri', 'Lokal', 'Ex-stock', 'Indent'];
const CURS: Currency[] = ['IDR', 'USD', 'SGD', 'CNY'];

export default function SupplierPage() {
  const confirm = useConfirm(), toast = useToast();
  const [form, setForm] = useState<null | Partial<Supplier>>(null);
  const [err, setErr] = useState<string | null>(null);
  const { data, error, loading, reload } = useLoad(getSuppliers, []);
  async function toggle(s: Supplier) {
    if (!(await confirm({ title: s.active ? 'Nonaktifkan supplier' : 'Aktifkan supplier', ok: 'Ya, lanjutkan', msg: `${s.active ? 'Nonaktifkan' : 'Aktifkan'} ${s.name}?`, detail: s.active ? 'Tidak muncul lagi di pilihan baru. Data lama tetap ada.' : '' }))) return;
    const { error } = await supabase().from('suppliers').update({ active: !s.active }).eq('id', s.id);
    if (error) setErr(error.message); else { toast('Tersimpan'); reload(); notifyChanged(); }
  }
  return (
    <>
      <div className="top"><div><h1>Supplier dan kurs</h1><p className="sub">Lama datang per supplier dipakai untuk menghitung target stok. Kurs di sini adalah kurs awal; kurs sebenarnya dihitung per pengiriman PO.</p></div><div className="actions"><Btn icon="plus" onClick={() => setForm({ type: 'Lokal', currency: 'IDR', lead_months: 0.1, lead_note: '1-3 hari', kurs: 0, active: true })}>Tambah supplier</Btn></div></div>
      <ErrorBox error={err || error} />
      <SortTable<Supplier> minWidth={760} rows={data ?? []} rowKey={s => s.id} empty={loading ? 'Memuat...' : 'Belum ada supplier.'}
        cols={[
          { key: 'n', label: 'Nama', sort: s => s.name, render: s => <b>{s.name}</b> },
          { key: 't', label: 'Jenis', sort: s => s.type, render: s => <Pill cls={TYPE_CLS[s.type]}>{s.type}</Pill> },
          { key: 'l', label: 'Lama datang', sort: s => s.lead_months, render: s => <>{leadShow(s.lead_note, s.lead_months)}{s.lead_note ? <><br /><span className="muted">rumus: {nf(s.lead_months)} bulan</span></> : null}</> },
          { key: 'c', label: 'Mata uang', sort: s => s.currency, render: s => s.currency },
          { key: 'k', label: 'Kurs awal (Rp)', sort: s => s.kurs, render: s => (s.currency === 'IDR' ? '-' : fmt(s.kurs)) },
          { key: 's', label: 'Status', sort: s => (s.active ? 1 : 0), render: s => <Pill cls={s.active ? 'p-teal' : 'p-grey'}>{s.active ? 'Aktif' : 'Nonaktif'}</Pill> },
          { key: 'a', label: '', nosort: true, cls: 'act', render: s => <><IconButton icon="edit" label="Ubah supplier" onClick={() => setForm(s)} /><IconButton icon="ban" label={s.active ? 'Nonaktifkan' : 'Aktifkan'} onClick={() => toggle(s)} /></> },
        ]} />
      <Notice blue>Kolom Lama datang menampilkan kisaran yang kamu ketik (mis. 6-12 bulan); angka "rumus" di bawahnya (mis. 9 bulan) yang dipakai untuk menghitung target stok. 0,1 bulan artinya sekitar 3 hari; 0 artinya langsung. Supplier tidak dihapus, cukup dinonaktifkan supaya riwayat request dan PO tetap utuh.</Notice>
      {form && <SupForm init={form} onClose={() => setForm(null)} onSaved={() => { setForm(null); toast('Supplier tersimpan'); reload(); notifyChanged(); }} />}
    </>
  );
}

function SupForm({ init, onClose, onSaved }: { init: Partial<Supplier>; onClose: () => void; onSaved: () => void }) {
  const confirm = useConfirm();
  const [name, setName] = useState(init.name ?? '');
  const [type, setType] = useState<SupplierType>(init.type ?? 'Lokal');
  const [lead, setLead] = useState(init.lead_months === undefined ? '' : nf(init.lead_months));
  const [note, setNote] = useState(init.lead_note ?? '');
  const [cur, setCur] = useState<Currency>(init.currency ?? 'IDR');
  const [kurs, setKurs] = useState(init.kurs ? String(init.kurs) : '');
  const [err, setErr] = useState<string | null>(null);
  async function save() {
    const l = dec(lead), k = cur === 'IDR' ? 0 : Number(kurs.replace(/\./g, '').replace(',', '.')) || 0;
    if (!name.trim()) { setErr('Isi nama supplier.'); return; }
    if (lead.trim() === '' || l < 0) { setErr('Isi angka rumus lama datang (bulan), contoh 9 atau 0,1.'); return; }
    if (cur !== 'IDR' && k <= 0) { setErr('Supplier mata uang asing wajib punya kurs awal.'); return; }
    if (!(await confirm({ title: init.id ? 'Ubah supplier' : 'Tambah supplier', ok: 'Ya, simpan', msg: init.id ? `Simpan perubahan ${name}?` : `Tambah supplier ${name}?`, detail: init.id ? 'Lama datang baru dipakai di perhitungan List Barang untuk produk yang supplier terakhirnya ini.' : '' }))) return;
    const row = { name: name.trim(), type, lead_months: l, lead_note: note.trim(), currency: cur, kurs: k };
    const t = supabase().from('suppliers');
    const { error } = init.id ? await t.update(row).eq('id', init.id) : await t.insert(row);
    if (error) setErr(error.code === '23505' ? 'Nama supplier itu sudah ada.' : error.message); else onSaved();
  }
  return (
    <Dialog title={init.id ? 'Ubah supplier' : 'Tambah supplier'} onClose={onClose} footer={<><Btn variant="alt" onClick={onClose}>Batal</Btn><Btn icon="check" onClick={save}>Simpan</Btn></>}>
      <ErrorBox error={err} />
      <div className="field"><label htmlFor="s-name">Nama supplier</label><input id="s-name" type="text" value={name} onChange={e => setName(e.target.value)} /></div>
      <div className="row">
        <div className="field"><label htmlFor="s-type">Jenis</label><select id="s-type" value={type} onChange={e => setType(e.target.value as SupplierType)}>{TYPES.map(t => <option key={t}>{t}</option>)}</select></div>
        <div className="field"><label htmlFor="s-lead">Dipakai di rumus (bulan)</label><input id="s-lead" type="text" inputMode="decimal" placeholder="contoh 9 atau 0,1" value={lead} onChange={e => setLead(e.target.value)} /></div>
      </div>
      <div className="field"><label htmlFor="s-note">Kisaran lama datang (keterangan)</label><input id="s-note" type="text" maxLength={40} placeholder="contoh 1-3 hari atau 6-12 bulan" value={note} onChange={e => setNote(e.target.value)} /></div>
      <div className="row">
        <div className="field"><label htmlFor="s-cur">Mata uang</label><select id="s-cur" value={cur} onChange={e => setCur(e.target.value as Currency)}>{CURS.map(t => <option key={t}>{t}</option>)}</select></div>
        <div className="field"><label htmlFor="s-kurs">Kurs awal (Rp)</label><input id="s-kurs" type="text" inputMode="numeric" disabled={cur === 'IDR'} value={cur === 'IDR' ? '' : kurs} onChange={e => setKurs(e.target.value)} /></div>
      </div>
    </Dialog>
  );
}
