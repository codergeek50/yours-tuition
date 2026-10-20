import { describe, it, expect } from 'vitest';
import { normalizeVisit, visitSummary } from './teachers';
import { validateVisit } from './validate';
import type { Teacher, Visit } from './types';

const teacher = (id: string, name: string): Teacher => ({ id, name, phone: '', subject: '', usualAmount: 0, active: true, updatedAt: '' });
const visit = (o: Partial<Visit> = {}): Visit => ({
  id: 'v', teacherId: 't1', date: '2026-10-03', hours: 2, amount: 800, note: '', paid: true, paidOn: '2026-10-03', deleted: false, updatedAt: '', ...o,
});

describe('normalizeVisit: visits saved before pay-later existed', () => {
  it('treats a visit with no status as paid on the day of the visit', () => {
    const old = { id: 'v', teacherId: 't1', date: '2026-09-05', hours: 2, amount: 800, note: '', deleted: false, updatedAt: '' };
    expect(normalizeVisit(old)).toMatchObject({ paid: true, paidOn: '2026-09-05' });
  });
  it('keeps an explicit pay-later visit pending with no paid date', () => {
    const v = normalizeVisit({ ...visit(), paid: false, paidOn: undefined });
    expect(v).toMatchObject({ paid: false, paidOn: '' });
  });
  it('keeps a recorded paid date', () => {
    expect(normalizeVisit({ ...visit(), paid: true, paidOn: '2026-10-09' }).paidOn).toBe('2026-10-09');
  });
  it('a paid visit with a blank paid date falls back to the visit date', () => {
    expect(normalizeVisit({ ...visit(), paid: true, paidOn: '' }).paidOn).toBe('2026-10-03');
  });
});

describe('validateVisit with payment status', () => {
  it('a paid visit needs a real paid date', () => {
    expect(validateVisit(visit({ paid: true, paidOn: '' })).map((e) => e.field)).toEqual(['paidOn']);
    expect(validateVisit(visit({ paid: true, paidOn: '2026-02-30' })).map((e) => e.field)).toEqual(['paidOn']);
  });
  it('a pending visit needs no paid date', () => {
    expect(validateVisit(visit({ paid: false, paidOn: '' }))).toEqual([]);
  });
  it('a pending visit may still owe zero? no: it keeps the same amount rules', () => {
    expect(validateVisit(visit({ paid: false, paidOn: '', amount: -1 })).map((e) => e.field)).toEqual(['amount']);
  });
});

describe('visitSummary splits paid and pending', () => {
  const teachers = [teacher('t1', 'Mr Rao'), teacher('t2', 'Ms Iyer')];
  const visits = [
    visit({ id: 'a', teacherId: 't1', hours: 2, amount: 800 }),
    visit({ id: 'b', teacherId: 't1', hours: 1.5, amount: 600, paid: false, paidOn: '' }),
    visit({ id: 'c', teacherId: 't2', hours: 3, amount: 1500, paid: false, paidOn: '' }),
    visit({ id: 'd', teacherId: 't2', hours: 1, amount: 400 }),
    visit({ id: 'e', teacherId: 't2', hours: 9, amount: 9999, paid: false, paidOn: '', deleted: true }),
  ];
  it('totals paid and pending per teacher, ignoring deleted visits', () => {
    const s = visitSummary(teachers, visits);
    expect(s.rows.map((r) => [r.teacher.name, r.visits, r.hours, r.paid, r.pending])).toEqual([
      ['Mr Rao', 2, 3.5, 800, 600],
      ['Ms Iyer', 1 + 1, 4, 400, 1500],
    ].sort((a, b) => String(a[0]).localeCompare(String(b[0]))));
    expect(s.totals).toEqual({ visits: 4, hours: 7.5, paid: 1200, pending: 2100 });
  });
  it('counts visits recorded before pay-later existed as paid', () => {
    const old = { id: 'o', teacherId: 't1', date: '2026-09-05', hours: 1, amount: 500, note: '', deleted: false, updatedAt: '' } as unknown as Visit;
    expect(visitSummary(teachers, [old]).totals).toEqual({ visits: 1, hours: 1, paid: 500, pending: 0 });
  });
});
