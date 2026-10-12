# Aplikasi Sparepart

Aplikasi internal i1 CCTV: catat permintaan sparepart dari customer, bandingkan harga supplier, hitung kebutuhan PO, dan kelola PO. **Hanya membaca dari Jurnal** (stok, PL, kategori diskon, invoice penjualan). Next.js 15 + Supabase (Singapura) + Vercel.

## Isi
| Folder | Isi |
|---|---|
| `supabase/migrations` | 0001 skema, 0002 RLS, 0003 hitungan (List Barang, Menipis, Dashboard), 0004 operasi tulis (simpan request, PO, banding), 0005 riwayat impor |
| `supabase/seed.sql` | 11 supplier + 3 pengaturan. Tanpa data contoh |
| `supabase/tests` | stub Supabase + 275 tes. `bash supabase/tests/run.sh` (butuh Postgres 15+ lokal) |
| `app`, `components`, `lib` | aplikasi (halaman sesuai mockup v17) |
| `lib/jurnal.ts` | SATU-SATUNYA klien Jurnal, hanya GET. Dijaga `tests/jurnal-readonly.test.ts` |
| `scripts` | `impor-excel.mjs` (riwayat), `buat-user.mjs` (user awal) |

## Urutan go-live
1. **Supabase**: project baru (Singapore). SQL Editor: jalankan `0001` s/d `0005`, lalu `seed.sql`. Authentication > matikan "Allow new users to sign up".
2. **Env**: salin `.env.example` ke `.env.local` dan isi (service role key hanya di server). `INITIAL_PASSWORD` = password awal semua akun.
3. **User**: `npm install`, lalu `npm run buat-user -- --file users.json` (uji dulu), lalu tambahkan `--apply`. Format `users.contoh.json`. Hanya 1 superadmin. Semua wajib ganti password saat masuk pertama.
4. **Vercel**: impor repo, isi env yang sama, deploy. `vercel.json` sudah memasang cron harian (`/api/cron/sync`, 20:00 UTC = 03:00 WIB).
5. **Jurnal**: ikuti PDF "Tutorial Akses API Jurnal". Jalankan menu **Uji API Jurnal**. Kalau pemetaan field tidak cocok, tempel hasil uji ke Claude.
6. **Sync pertama**: List Barang > Riwayat sync > Jalankan sync stok (produk penuh), lalu sync penjualan.
7. **Riwayat Excel**: `npm run impor -- --file riwayat.xlsx` (uji dulu, hasilnya laporan CSV di `laporan-impor/`), lalu `--apply`. Nama customer yang mirip digabung manual di menu Customer.
8. Tim mulai input.

## Perintah
`npm run dev` · `npm run build` · `npm run lint` (tsc) · `npm test` (20 tes unit) · `bash supabase/tests/run.sh` (275 tes database)

## Catatan jujur tentang yang belum teruji
- Aplikasi belum dijalankan terhadap Supabase dan Jurnal asli (tidak ada akses dari sini). Yang sudah teruji: seluruh aturan database (275 tes), `tsc`, `next build`, tes unit, dan pengalihan login. Harapkan beberapa perbaikan kecil saat uji pertama.
- Nama field respons Jurnal dan filter tanggal invoice belum diverifikasi; pemetaan longgar di `lib/jurnal.ts`. Gunakan Uji API Jurnal.
- Status invoice yang dianggap batal: pengaturan `invoice_void_statuses` (bawaan hasil tebakan; cocokkan dengan status asli Jurnal).
