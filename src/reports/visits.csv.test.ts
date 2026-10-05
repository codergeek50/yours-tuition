import { describe, it, expect } from 'vitest';
import { visitsCsv, visitSummaryCsv } from './csv';
import type { Teacher, Visit } from '../domain/types';

const t = (id: string, name: string, subject = ''): Teacher => ({ id, name, phone: '', subject, usualAmount: 0, active: true, updatedAt: '' });
const v = (id: string, teacherId: string, date: string, hours: number, amount: number, note = ''): Visit => ({ id, teacherId, date, hours, amount, note, deleted: false, updatedAt: '' });

const teachers = [t('a', 'Mr Rao', 'Maths'), t('b', 'Ms Iyer', 'Science')];
const visits = [
  v('1', 'b', '2026-10-09', 3, 1500, 'Lab, practical'),
  v('2', 'a', '2026-10-02', 2, 800),
  v('3', 'a', '2026-10-05', 1.5, 600, 'Revision'),
  { ...v('4', 'a', '2026-10-06', 9, 9999), deleted: true },
];

describe('visits CSV', () => {
  it('lists visits oldest first with teacher, hours, amount and note, plus a total row', () => {
    const lines = visitsCsv(teachers, visits).split('\r\n');
    expect(lines[0]).toBe('Date,Teacher,Subject,Hours,Amount paid,Note');
    expect(lines[1]).toBe('2026-10-02,Mr Rao,Maths,2,800,');
    expect(lines[2]).toBe('2026-10-05,Mr Rao,Maths,1.5,600,Revision');
    expect(lines[3]).toBe('2026-10-09,Ms Iyer,Science,3,1500,"Lab, practical"');
    expect(lines[4]).toBe('Total,,,6.5,2900,');
    expect(lines).toHaveLength(5);
  });
  it('neutralises formulas typed into notes', () => {
    const csv = visitsCsv(teachers, [v('9', 'a', '2026-10-01', 1, 100, '=HYPERLINK("x")')]);
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`);
  });
  it('is just a header and zero total when there are no visits', () => {
    expect(visitsCsv(teachers, []).split('\r\n')).toEqual(['Date,Teacher,Subject,Hours,Amount paid,Note', 'Total,,,0,0,']);
  });
});

describe('payout summary CSV', () => {
  it('totals each teacher and the month', () => {
    const lines = visitSummaryCsv(teachers, visits).split('\r\n');
    expect(lines).toEqual([
      'Teacher,Subject,Visits,Hours,Total paid',
      'Mr Rao,Maths,2,3.5,1400',
      'Ms Iyer,Science,1,3,1500',
      'Total,,3,6.5,2900',
    ]);
  });
});
