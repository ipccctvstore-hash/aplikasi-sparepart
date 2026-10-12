export type Role = 'admin' | 'super';
export type SupplierType = 'Stok sendiri' | 'Lokal' | 'Ex-stock' | 'Indent';
export type Currency = 'IDR' | 'USD' | 'SGD' | 'CNY';
export type PoStatus = 'draft' | 'dipesan' | 'selesai' | 'dibatalkan';

export type Supplier = { id: number; name: string; type: SupplierType; lead_months: number; currency: Currency; kurs: number; active: boolean };
export type Customer = { id: number; name: string; note: string; active: boolean };
export type Settings = { ask_threshold: number; cover_months: number; po_aging_days: number };

/** Satu baris dari v_products. */
export type Product = {
  sku: string; name: string; in_jurnal: boolean; pl_price: number | null; tempo_disc: number | null; cash_disc: number | null;
  category_unreadable: boolean; category_name: string | null; stock_qty: number; low_since: string | null; low_from: number | null;
  no_stock_at: string | null; is_low: boolean;
};

/** Satu baris hasil list_barang / lb_calc. */
export type LbRow = {
  sku: string; name: string; in_jurnal: boolean; is_low: boolean; asked: number; qsum: number; sold: number; need: number;
  stock: number; qty_wait: number; qty_ship: number; have: number; cover: number | null; lead: number; lead_name: string | null;
  lead_default: boolean; target: number; status: 'Pantau' | 'Perlu PO' | 'Cukup'; saran: number; monthly?: number[]; total_rows?: number;
};

export type Offer = { supplier_id: number; quote: string; ready: boolean };
/** Baris produk di formulir request. */
export type ReqRow = {
  id?: number; raw: string; typed_sku: string; sku: string | null; qty: number; note: string;
  resolution: '' | 'new' | 'replaced'; reason: '' | 'typo' | 'disc'; orig: string;
  auto_source_row: number | null; auto_confirmed: boolean; auto_label: string; auto_use: boolean;
  auto_offers: Offer[];
  pl: string; tempo: string; cash: string; offers: Offer[];
};

export const TYPE_CLS: Record<string, string> = { 'Stok sendiri': 'p-teal', Lokal: 'p-blue', 'Ex-stock': 'p-amber', Indent: 'p-grey' };
export const PO_STATUS_LABEL: Record<PoStatus, string> = { draft: 'Draft', dipesan: 'Dipesan', selesai: 'Selesai', dibatalkan: 'Dibatalkan' };
export const PO_STATUS_CLS: Record<PoStatus, string> = { draft: 'p-grey', dipesan: 'p-amber', selesai: 'p-teal', dibatalkan: 'p-red' };
export const ST_CLS: Record<string, string> = { 'Perlu PO': 'p-amber', Cukup: 'p-teal', Pantau: 'p-grey' };
export const REQ_ST_CLS: Record<string, string> = { 'Belum diisi': 'p-grey', 'Sedang diisi': 'p-amber', Selesai: 'p-teal' };
