import { describe, it, expect } from 'vitest';
import { csvCell, toCsv, jakartaStamp } from '@/lib/csv';

describe('cadangan CSV', () => {
  it('mengutip koma, kutip, dan baris baru', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('dia "x"')).toBe('"dia ""x"""');
    expect(csvCell('baris\nbaru')).toBe('"baris\nbaru"');
    expect(csvCell(null)).toBe('');
    expect(csvCell(0)).toBe('0');
    expect(csvCell({ a: 1 })).toBe('"{""a"":1}"');
  });
  it('menulis header dan baris, dengan BOM untuk Excel', () => {
    const t = toCsv([{ id: 1, nama: 'A,B' }, { id: 2, nama: null }]);
    expect(t.startsWith('﻿')).toBe(true);
    expect(t.split('\r\n').slice(0, 3)).toEqual(['﻿id,nama', '1,"A,B"', '2,']);
  });
  it('tabel kosong tetap punya header bila kolom diberikan', () => {
    expect(toCsv([], ['a', 'b'])).toBe('﻿a,b\r\n');
  });
  it('tanggal memakai zona Asia/Jakarta', () => {
    expect(jakartaStamp(new Date('2026-10-12T20:30:00Z'))).toEqual({ date: '2026-10-13', time: '03:30' });
  });
});
