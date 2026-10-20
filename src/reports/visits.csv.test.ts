import { describe, it, expect } from 'vitest';
import { visitsCsv, visitSummaryCsv } from './csv';
import type { Teacher, Visit } from '../domain/types';

const t = (id: string, name: string, subject = ''): Teacher => ({ id, name, phone: '', subject, usualAmount: 0, active: true, updatedAt: '' });
const v = (id: string, teacherId: string, date: string, hours: number, amount: number, note = '', o: Partial<Visit> = {}): Visit => ({
  id, teacherId, date, hours, amount, note, paid: true, paidOn: date, deleted: false, updatedAt: '', ...o,
});

const teachers = [t('a', 'Mr Rao', 'Maths'), t('b', 'Ms Iyer', 'Science')];
const visits = [
  v('1', 'b', '2026-10-09', 3, 1500, 'Lab, practical', { paid: false, paidOn: '' }),
  v('2', 'a', '2026-10-02', 2, 800),
  v('3', 'a', '2026-10-05', 1.5, 600, 'Revision', { paidOn: '2026-10-12' }),
  { ...v('4', 'a', '2026-10-06', 9, 9999), deleted: true },
];

describe('visits CSV', () => {
  it('lists visits oldest first with status and paid date, then paid, pending and total rows', () => {
    const lines = visitsCsv(teachers, visits).split('\r\n');
    expect(lines[0]).toBe('Date,Teacher,Subject,Hours,Amount,Status,Paid on,Note');
    expect(lines[1]).toBe('2026-10-02,Mr Rao,Maths,2,800,Paid,2026-10-02,');
    expect(lines[2]).toBe('2026-10-05,Mr Rao,Maths,1.5,600,Paid,2026-10-12,Revision');
    expect(lines[3]).toBe('2026-10-09,Ms Iyer,Science,3,1500,Pending,,"Lab, practical"');
    expect(lines.slice(4)).toEqual(['Total,,,6.5,2900,,,', 'Paid,,,,1400,,,', 'Pending,,,,1500,,,']);
  });
  it('treats visits saved before pay-later existed as paid', () => {
    const old = { id: 'o', teacherId: 'a', date: '2026-09-05', hours: 1, amount: 500, note: '', deleted: false, updatedAt: '' } as unknown as Visit;
    const lines = visitsCsv(teachers, [old]).split('\r\n');
    expect(lines[1]).toBe('2026-09-05,Mr Rao,Maths,1,500,Paid,2026-09-05,');
  });
  it('neutralises formulas typed into notes', () => {
    const csv = visitsCsv(teachers, [v('9', 'a', '2026-10-01', 1, 100, '=HYPERLINK("x")')]);
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`);
  });
  it('is just a header and zero totals when there are no visits', () => {
    expect(visitsCsv(teachers, []).split('\r\n')).toEqual([
      'Date,Teacher,Subject,Hours,Amount,Status,Paid on,Note',
      'Total,,,0,0,,,',
      'Paid,,,,0,,,',
      'Pending,,,,0,,,',
    ]);
  });
});

describe('payout summary CSV', () => {
  it('shows paid, pending and total for each teacher and for the month', () => {
    const lines = visitSummaryCsv(teachers, visits).split('\r\n');
    expect(lines).toEqual([
      'Teacher,Subject,Visits,Hours,Paid,Pending,Total',
      'Mr Rao,Maths,2,3.5,1400,0,1400',
      'Ms Iyer,Science,1,3,0,1500,1500',
      'Total,,3,6.5,1400,1500,2900',
    ]);
  });
});
