import { describe, it, expect } from 'vitest';
import { validateTeacher, validateVisit } from './validate';
import { parseHours, formatHours, visitSummary } from './teachers';
import type { Teacher, Visit } from './types';

const teacher = (o: Partial<Teacher> = {}): Teacher => ({
  id: 't1', name: 'Mr Rao', phone: '9876543210', subject: 'Maths', usualAmount: 800, active: true, updatedAt: '2026-10-01T00:00:00Z', ...o,
});
const visit = (o: Partial<Visit> = {}): Visit => ({
  id: 'v1', teacherId: 't1', date: '2026-10-03', hours: 2, amount: 800, note: '', deleted: false, updatedAt: '2026-10-03T00:00:00Z', ...o,
});

describe('validateTeacher', () => {
  it('accepts a good teacher, with phone and amount optional', () => {
    expect(validateTeacher(teacher())).toEqual([]);
    expect(validateTeacher(teacher({ phone: '', usualAmount: 0, subject: '' }))).toEqual([]);
  });
  it('flags a missing name, a bad phone and a bad amount', () => {
    const errs = validateTeacher(teacher({ name: ' ', phone: '12', usualAmount: -5 }));
    expect(errs.map((e) => e.field).sort()).toEqual(['name', 'phone', 'usualAmount']);
  });
});

describe('validateVisit', () => {
  it('accepts a good visit', () => {
    expect(validateVisit(visit())).toEqual([]);
  });
  it('requires a teacher and a real date', () => {
    expect(validateVisit(visit({ teacherId: '' })).map((e) => e.field)).toEqual(['teacherId']);
    expect(validateVisit(visit({ date: '2026-02-30' })).map((e) => e.field)).toEqual(['date']);
  });
  it('hours must be above 0, at most 24, in quarter-hour steps', () => {
    for (const h of [0, -1, 24.5, 1.1, NaN]) expect(validateVisit(visit({ hours: h })).map((e) => e.field)).toEqual(['hours']);
    for (const h of [0.25, 0.5, 1.75, 8, 24]) expect(validateVisit(visit({ hours: h }))).toEqual([]);
  });
  it('amount must be a whole number of rupees, zero or more', () => {
    for (const a of [-1, 10.5, NaN]) expect(validateVisit(visit({ amount: a })).map((e) => e.field)).toEqual(['amount']);
    expect(validateVisit(visit({ amount: 0 }))).toEqual([]);
  });
});

describe('hours helpers', () => {
  it('parses typed hours, including a comma decimal', () => {
    expect(parseHours('2')).toBe(2);
    expect(parseHours(' 1.5 ')).toBe(1.5);
    expect(parseHours('1,5')).toBe(1.5);
    expect(parseHours('0.25')).toBe(0.25);
  });
  it('rejects junk, zero and off-step values', () => {
    for (const t of ['', 'abc', '0', '-2', '1.1', '25']) expect(parseHours(t)).toBeNull();
  });
  it('formats hours for display', () => {
    expect(formatHours(1)).toBe('1 h');
    expect(formatHours(1.5)).toBe('1.5 h');
    expect(formatHours(0.25)).toBe('0.25 h');
    expect(formatHours(10)).toBe('10 h');
  });
});

describe('visitSummary', () => {
  const teachers = [teacher(), teacher({ id: 't2', name: 'Ms Iyer', subject: 'Science' }), teacher({ id: 't3', name: 'Zed', active: false })];
  it('totals visits, hours and amount per teacher, ignoring deleted visits', () => {
    const visits = [
      visit({ id: 'a', teacherId: 't1', hours: 2, amount: 800 }),
      visit({ id: 'b', teacherId: 't1', hours: 1.5, amount: 600, date: '2026-10-05' }),
      visit({ id: 'c', teacherId: 't2', hours: 3, amount: 1500 }),
      visit({ id: 'd', teacherId: 't2', hours: 9, amount: 9999, deleted: true }),
    ];
    const s = visitSummary(teachers, visits);
    expect(s.rows.map((r) => [r.teacher.name, r.visits, r.hours, r.paid])).toEqual([
      ['Mr Rao', 2, 3.5, 1400],
      ['Ms Iyer', 1, 3, 1500],
    ].sort((a, b) => String(a[0]).localeCompare(String(b[0]))));
    expect(s.totals).toEqual({ visits: 3, hours: 6.5, paid: 2900 });
  });
  it('lists only teachers who visited, including retired ones, and handles no visits', () => {
    const s = visitSummary(teachers, [visit({ teacherId: 't3', id: 'z', hours: 1, amount: 100 })]);
    expect(s.rows.map((r) => r.teacher.name)).toEqual(['Zed']);
    expect(visitSummary(teachers, []).totals).toEqual({ visits: 0, hours: 0, paid: 0 });
  });
  it('keeps hours exact with quarter steps', () => {
    const s = visitSummary(teachers, [visit({ id: 'a', hours: 0.25 }), visit({ id: 'b', hours: 0.75 }), visit({ id: 'c', hours: 0.5 })]);
    expect(s.totals.hours).toBe(1.5);
  });
});
