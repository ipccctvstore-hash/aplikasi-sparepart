'use client';
import { useState } from 'react';
import { Btn, Dialog, ErrorBox, Notice } from './ui';
import ProductPicker from './ProductPicker';

/** Pilih produk (atau ketik tipe baru) + qty (+ harga untuk PO), lalu serahkan ke pemanggil. */
export default function AddProduct({ exclude, priceLabel, onAdd, onClose }: {
  exclude: string[]; priceLabel?: string; onAdd: (sku: string, qty: number, price: string) => Promise<void>; onClose: () => void;
}) {
  const [pick, setPick] = useState<{ sku: string; isNew: boolean } | null>(null);
  const [qty, setQty] = useState('1');
  const [price, setPrice] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function go() {
    if (!pick) return;
    setBusy(true); setErr(null);
    try { await onAdd(pick.sku, Math.max(1, parseInt(qty, 10) || 1), price); onClose(); }
    catch (e) { setErr((e as Error).message); setBusy(false); }
  }
  return (
    <Dialog top title="Tambah produk" onClose={onClose} footer={<><Btn variant="alt" onClick={onClose}>Batal</Btn><Btn icon="plus" disabled={!pick || busy} onClick={go}>Tambah</Btn></>}>
      <ErrorBox error={err} />
      {pick && <Notice blue>Dipilih: <b className="mono">{pick.sku}</b>{pick.isNew ? ' (tipe baru, otomatis masuk List Barang)' : ''}</Notice>}
      <ProductPicker label="Cari dari list barang atau ketik tipe sendiri" exclude={exclude} onPick={(sku, p) => setPick({ sku, isNew: !p })} />
      <div className="row">
        <div className="field"><label htmlFor="ap-qty">Qty</label><input id="ap-qty" type="text" inputMode="numeric" value={qty} onChange={e => setQty(e.target.value)} /></div>
        {priceLabel && <div className="field"><label htmlFor="ap-price">{priceLabel}</label><input id="ap-price" type="text" inputMode="decimal" value={price} onChange={e => setPrice(e.target.value)} /></div>}
      </div>
    </Dialog>
  );
}
