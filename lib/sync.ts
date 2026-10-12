import 'server-only';
import { adminClient } from './supabase/admin';
import { JurnalError, getInvoice, listInvoices, listProducts, mapInvoice, mapProduct } from './jurnal';

export type Kind = 'stok' | 'harga' | 'jual';
export type SyncResult = { kind: Kind; status: 'ok' | 'part' | 'fail'; total: number; ok: number; fail: number; message: string };

const PER_PAGE = 100;
const wibToday = () => new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
const addDays = (iso: string, n: number) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

type Fail = { sku: string | null; reason: string };
async function startRun(kind: Kind, mode: string) {
  const a = adminClient();
  const { data, error } = await a.from('sync_runs').insert({ kind, mode }).select('id').single();
  if (error) throw error;
  return data.id as number;
}
async function endRun(id: number, r: Omit<SyncResult, 'kind'>, fails: Fail[]) {
  const a = adminClient();
  await a.from('sync_runs').update({ finished_at: new Date().toISOString(), status: r.status, total: r.total, ok_count: r.ok, fail_count: r.fail, message: r.message }).eq('id', id);
  if (fails.length) await a.from('sync_failures').insert(fails.slice(0, 200).map(f => ({ run_id: id, sku: f.sku, reason: f.reason })));
}

/** Stok + harga + diskon: satu pembacaan produk Jurnal mengisi ketiganya. Dicatat sebagai dua riwayat (stok, harga). */
export async function syncProducts(mode: 'otomatis' | 'manual', deadlineMs = 240_000): Promise<SyncResult[]> {
  const a = adminClient();
  const t0 = Date.now();
  const runs = { stok: await startRun('stok', mode), harga: await startRun('harga', mode) };
  const fails: Fail[] = [];
  let total = 0, ok = 0, page = 1, finished = false, fatal: string | null = null;
  const { data: st } = await a.from('sync_state').select('cursor,in_progress').eq('kind', 'stok').maybeSingle();
  if (st?.cursor?.page && st.in_progress) page = Number(st.cursor.page) || 1;
  await a.from('sync_state').update({ in_progress: true }).eq('kind', 'stok');
  const catSkus = new Map<string, string[]>();
  try {
    while (Date.now() - t0 < deadlineMs) {
      const { raw } = await listProducts(page, PER_PAGE);
      if (!raw.length) { finished = true; break; }
      const items = [];
      for (const r of raw) {
        total++;
        const p = mapProduct(r);
        if (!p) { fails.push({ sku: null, reason: 'Produk tanpa kode (product_code) dilewati' }); continue; }
        items.push(p);
        if (p.category) catSkus.set(p.category, [...(catSkus.get(p.category) ?? []), p.sku]);
      }
      if (items.length) {
        const { data, error } = await a.rpc('sync_save_products', { p: items });
        if (error) throw new Error('Gagal menyimpan produk: ' + error.message);
        ok += Number(data ?? items.length);
      }
      page++;
      await a.from('sync_state').update({ cursor: { page } }).eq('kind', 'stok');
      if (raw.length < PER_PAGE) { finished = true; break; }
    }
  } catch (e) { fatal = e instanceof Error ? e.message : String(e); }

  // kategori yang tidak terbaca -> laporan gagal untuk "harga"
  const failH: Fail[] = [];
  if (catSkus.size) {
    const { data: bad } = await a.from('j_categories').select('name').eq('parse_ok', false).in('name', [...catSkus.keys()]);
    (bad ?? []).forEach(c => (catSkus.get(c.name) ?? []).slice(0, 10).forEach(sku => failH.push({ sku, reason: `kategori "${c.name}" tidak terbaca (harus berbentuk 10 atau 10 cash 15)` })));
  }
  await a.from('sync_state').update(finished ? { in_progress: false, cursor: null, last_success_at: fatal ? undefined : new Date().toISOString() } : { in_progress: true }).eq('kind', 'stok');

  const partialNote = !finished && !fatal ? ` Waktu habis di halaman ${page}; sisanya dilanjutkan pada sync berikutnya.` : '';
  const mk = (extra: Fail[], what: string): Omit<SyncResult, 'kind'> => {
    const fail = fails.length + extra.length + (fatal ? 1 : 0);
    const all = [...fails, ...extra, ...(fatal ? [{ sku: null, reason: fatal }] : [])];
    const status = fatal && !ok ? 'fail' : fail || !finished ? 'part' : 'ok';
    return { status, total, ok, fail, message: fatal ? `${what}: berhenti karena kesalahan. ${fatal}` : `${ok.toLocaleString('id-ID')} produk diperbarui${fail ? `, ${fail} gagal` : ''}.${partialNote}`, ...{ _f: all } } as never;
  };
  const rs = mk([], 'Stok') as Omit<SyncResult, 'kind'> & { _f: Fail[] }, rh = mk(failH, 'Harga') as Omit<SyncResult, 'kind'> & { _f: Fail[] };
  await endRun(runs.stok, rs, rs._f); await endRun(runs.harga, rh, rh._f);
  return [{ kind: 'stok', ...rs }, { kind: 'harga', ...rh }];
}

/** Penjualan: isi awal sekali (12 bulan), lalu hanya invoice sejak sync terakhir (+7 hari cadangan). */
export async function syncInvoices(mode: 'otomatis' | 'manual', deadlineMs = 240_000): Promise<SyncResult> {
  const a = adminClient();
  const t0 = Date.now();
  const id = await startRun('jual', mode);
  const { data: st } = await a.from('sync_state').select('cursor,in_progress,last_success_at').eq('kind', 'jual').maybeSingle();
  const resume = st?.in_progress && st.cursor?.since ? st.cursor as { since: string; page: number } : null;
  const since = resume?.since ?? (st?.last_success_at ? addDays(st.last_success_at.slice(0, 10), -7) : addDays(wibToday(), -365));
  let page = resume?.page ?? 1, total = 0, ok = 0, finished = false, fatal: string | null = null;
  const fails: Fail[] = [];
  await a.from('sync_state').update({ in_progress: true, cursor: { since, page } }).eq('kind', 'jual');
  try {
    while (Date.now() - t0 < deadlineMs) {
      const { raw } = await listInvoices(page, PER_PAGE, since);
      if (!raw.length) { finished = true; break; }
      const out = [];
      for (const r of raw) {
        let inv = mapInvoice(r);
        if (!inv) { fails.push({ sku: null, reason: `Invoice ${String(r.id ?? '?')} dilewati: tanggal atau id tidak terbaca` }); continue; }
        if (!inv.hasLines) { try { inv = mapInvoice(await getInvoice(inv.id)) ?? inv; } catch (e) { fails.push({ sku: null, reason: `Invoice ${inv.no || inv.id}: ${e instanceof Error ? e.message : e}` }); continue; } }
        total += Math.max(1, inv.lines.length);
        out.push({ id: inv.id, no: inv.no, date: inv.date, status: inv.status, updated_at: inv.updated_at, lines: inv.lines });
      }
      if (out.length) {
        const { error } = await a.rpc('sync_save_invoices', { p: out });
        if (error) throw new Error('Gagal menyimpan invoice: ' + error.message);
        ok += out.reduce((s, x) => s + Math.max(1, x.lines.length), 0);
      }
      page++;
      await a.from('sync_state').update({ cursor: { since, page } }).eq('kind', 'jual');
      if (raw.length < PER_PAGE) { finished = true; break; }
    }
  } catch (e) { fatal = e instanceof JurnalError || e instanceof Error ? e.message : String(e); }
  await a.from('sync_state').update(finished && !fatal ? { in_progress: false, cursor: null, last_success_at: new Date().toISOString() } : { in_progress: true }).eq('kind', 'jual');
  if (fatal) fails.push({ sku: null, reason: fatal });
  const fail = fails.length;
  const status: SyncResult['status'] = fatal && !ok ? 'fail' : fail || !finished ? 'part' : 'ok';
  const message = fatal ? `Berhenti karena kesalahan: ${fatal}` : `Dibaca: invoice baru atau berubah sejak ${since}. ${ok.toLocaleString('id-ID')} baris produk diperbarui${!finished ? `. Waktu habis di halaman ${page}; dilanjutkan pada sync berikutnya.` : '.'}`;
  const r = { status, total, ok, fail, message };
  await endRun(id, r, fails);
  return { kind: 'jual', ...r };
}

export async function syncAll(mode: 'otomatis' | 'manual'): Promise<SyncResult[]> {
  const out: SyncResult[] = [];
  try { out.push(...await syncProducts(mode, 140_000)); } catch (e) { out.push({ kind: 'stok', status: 'fail', total: 0, ok: 0, fail: 1, message: e instanceof Error ? e.message : String(e) }); }
  try { out.push(await syncInvoices(mode, 120_000)); } catch (e) { out.push({ kind: 'jual', status: 'fail', total: 0, ok: 0, fail: 1, message: e instanceof Error ? e.message : String(e) }); }
  return out;
}
