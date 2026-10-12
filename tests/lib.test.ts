import { describe, expect, it } from 'vitest';
import { addDays, daysBetween, fmt, leadTxt, monthBounds, nf, periodRange, rangeLabel, todayWib } from '../lib/format';
import { normSku, parseCat, parseLines } from '../lib/parse';
import { cellRupiah, cheapest, effKurs, lineStatus, lineUnit, resultText } from '../lib/po';

describe('format', () => {
  it('tanggal WIB: lewat tengah malam UTC+7 jadi hari berikutnya', () => {
    expect(todayWib(new Date('2026-10-12T17:30:00Z'))).toBe('2026-10-13');
    expect(todayWib(new Date('2026-10-12T16:59:00Z'))).toBe('2026-10-12');
  });
  it('rentang dan label', () => {
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(daysBetween('2026-10-01', '2026-10-12')).toBe(11);
    expect(monthBounds(2026, 2)).toEqual(['2026-02-01', '2026-02-28']);
    expect(periodRange('7', '2026-10-12')).toEqual(['2026-10-06', '2026-10-12']);
    expect(rangeLabel('2026-10-12', '2026-10-12', '2026-10-12')).toBe('Hari ini');
  });
  it('angka', () => {
    expect(nf(1.25)).toBe('1,3');
    expect(fmt(1234567)).toBe('1.234.567');
    expect(leadTxt(0)).toBe('langsung');
    expect(leadTxt(0.1)).toBe('±3 hari');
    expect(leadTxt(4.5)).toBe('4,5 bulan');
  });
});

describe('parse chat', () => {
  it('memecah part number dan qty', () => {
    const r = parseLines('04465-0K370 2pc\n48157-0K010 x3\n\nkampas depan');
    expect(r[0]).toMatchObject({ part: '04465-0K370', qty: 2 });
    expect(r[1]).toMatchObject({ part: '48157-0K010', qty: 3 });
    expect(r[2].part).toBe('');
  });
  it('normSku dan kategori diskon', () => {
    expect(normSku(' 04465-0k370 ')).toBe('04465-0K370');
    expect(parseCat('10')).toEqual({ tempo: '10', cash: '10' });
    expect(parseCat('10 cash 15')).toEqual({ tempo: '10', cash: '15' });
    expect(parseCat('promo')).toBeNull();
  });
});

describe('hitungan PO dan banding', () => {
  it('harga per pcs dan kurs efektif', () => {
    expect(lineUnit('IDR', 5000, 0)).toBe(5000);
    expect(lineUnit('USD', 10, 16000)).toBe(160000);
    expect(effKurs(3_200_000, 200)).toBe(16000);
    expect(effKurs(null, 200)).toBe(0);
  });
  it('sel banding dan termurah', () => {
    expect(cellRupiah({ quote: 20, ready: true }, 'IDR', 100000, 0)).toBe(80000);
    expect(cellRupiah({ quote: 5, ready: true }, 'USD', 100000, 16000)).toBe(80000);
    expect(cellRupiah({ quote: 20, ready: true }, 'IDR', 0, 0)).toBe(0);
    expect(cheapest([{ supplierId: 1, value: 90, ready: true }, { supplierId: 2, value: 70, ready: false }, { supplierId: 3, value: 80, ready: true }])).toBe(3);
  });
  it('status baris dan hasil catat', () => {
    expect(lineStatus(10, 0, 0)[0]).toBe('Belum dikirim');
    expect(lineStatus(10, 4, 0)[0]).toBe('Terkirim sebagian');
    expect(lineStatus(10, 10, 4)[0]).toBe('Diterima sebagian');
    expect(lineStatus(10, 10, 10)[0]).toBe('Diterima semua');
    expect(resultText(4, '3', 10)).toEqual({ text: '7 dari 10', over: false });
    expect(resultText(4, '9', 10).over).toBe(true);
  });
});
