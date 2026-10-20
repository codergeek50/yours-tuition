import { describe, it, expect } from 'vitest';
import { DataStore } from './store';
import { MemoryLocalStore } from '../sync/local';
import { todayISO } from '../domain/dates';

const mk = () => {
  const local = new MemoryLocalStore();
  return { local, store: new DataStore(local) };
};
const teacher = { name: 'Mr Rao', phone: '', subject: 'Maths', usualAmount: 800, active: true };
const base = (teacherId: string, o: Record<string, unknown> = {}) => ({ teacherId, date: '2026-10-03', hours: 2, amount: 800, note: '', ...o });

describe('recording a visit as paid or pay later', () => {
  it('defaults to paid on the day of the visit', async () => {
    const { store } = mk();
    const t = await store.saveTeacher(teacher);
    const v = await store.recordVisit(base(t.id));
    expect(v).toMatchObject({ paid: true, paidOn: '2026-10-03' });
  });
  it('can be recorded as pay later: pending with no paid date, amount kept as owed', async () => {
    const { store } = mk();
    const t = await store.saveTeacher(teacher);
    const v = await store.recordVisit(base(t.id, { paid: false }));
    expect(v).toMatchObject({ paid: false, paidOn: '', amount: 800 });
    expect((await store.visits('2026-10'))[0]).toMatchObject({ paid: false });
  });
  it('an explicit paid date is kept', async () => {
    const { store } = mk();
    const t = await store.saveTeacher(teacher);
    const v = await store.recordVisit(base(t.id, { paid: true, paidOn: '2026-10-05' }));
    expect(v.paidOn).toBe('2026-10-05');
  });
});

describe('visits saved before pay-later existed', () => {
  it('read back as paid on the visit date, with no file rewritten', async () => {
    const { store, local } = mk();
    const t = await store.saveTeacher(teacher);
    const old = { id: 'old1', teacherId: t.id, date: '2026-09-05', hours: 2, amount: 800, note: '', deleted: false, updatedAt: '2026-09-05T00:00:00Z' };
    await local.put('visits/2026-09.json', { content: JSON.stringify({ visits: [old] }), dirty: false });
    expect((await store.visits('2026-09'))[0]).toMatchObject({ id: 'old1', paid: true, paidOn: '2026-09-05' });
    expect((await store.pendingOverview()).count).toBe(0);
    expect(JSON.parse((await local.get('visits/2026-09.json'))!.content).visits[0].paid).toBeUndefined();
  });
});

describe('marking visits paid', () => {
  it('markVisitPaid settles one visit with today as the paid date', async () => {
    const { store } = mk();
    const t = await store.saveTeacher(teacher);
    const v = await store.recordVisit(base(t.id, { paid: false }));
    await store.markVisitPaid(v.id, '2026-10');
    expect((await store.visits('2026-10'))[0]).toMatchObject({ paid: true, paidOn: todayISO() });
  });
  it('markVisitPaid accepts a chosen date', async () => {
    const { store } = mk();
    const t = await store.saveTeacher(teacher);
    const v = await store.recordVisit(base(t.id, { paid: false }));
    await store.markVisitPaid(v.id, '2026-10', '2026-10-07');
    expect((await store.visits('2026-10'))[0]!.paidOn).toBe('2026-10-07');
  });
  it('a paid visit can be put back to pay later', async () => {
    const { store } = mk();
    const t = await store.saveTeacher(teacher);
    const v = await store.recordVisit(base(t.id));
    await store.updateVisit(v.id, '2026-10', { paid: false });
    expect((await store.visits('2026-10'))[0]).toMatchObject({ paid: false, paidOn: '' });
  });
  it('editing a pending visit to paid fills in today as the paid date', async () => {
    const { store } = mk();
    const t = await store.saveTeacher(teacher);
    const v = await store.recordVisit(base(t.id, { paid: false }));
    await store.updateVisit(v.id, '2026-10', { paid: true });
    expect((await store.visits('2026-10'))[0]).toMatchObject({ paid: true, paidOn: todayISO() });
  });
});

describe('settling everything owed to a teacher', () => {
  it('marks all of that teacher\'s pending visits paid, in every month, and nobody else\'s', async () => {
    const { store } = mk();
    const rao = await store.saveTeacher(teacher);
    const iyer = await store.saveTeacher({ ...teacher, name: 'Ms Iyer' });
    await store.recordVisit(base(rao.id, { date: '2026-09-10', paid: false, amount: 500 }));
    await store.recordVisit(base(rao.id, { date: '2026-10-03', paid: false, amount: 800 }));
    await store.recordVisit(base(rao.id, { date: '2026-10-04', paid: true, amount: 300 }));
    await store.recordVisit(base(iyer.id, { date: '2026-10-05', paid: false, amount: 1200 }));
    const res = await store.settleTeacher(rao.id, '2026-10-20');
    expect(res).toEqual({ count: 2, amount: 1300 });
    const sep = await store.visits('2026-09');
    expect(sep[0]).toMatchObject({ paid: true, paidOn: '2026-10-20' });
    const overview = await store.pendingOverview();
    expect(overview.count).toBe(1);
    expect(overview.amount).toBe(1200);
    expect(overview.byTeacher[iyer.id]).toEqual({ count: 1, amount: 1200 });
    expect(overview.byTeacher[rao.id]).toBeUndefined();
  });
  it('does nothing when nothing is pending', async () => {
    const { store } = mk();
    const t = await store.saveTeacher(teacher);
    await store.recordVisit(base(t.id));
    expect(await store.settleTeacher(t.id)).toEqual({ count: 0, amount: 0 });
  });
  it('deleted visits are never settled or counted', async () => {
    const { store } = mk();
    const t = await store.saveTeacher(teacher);
    const v = await store.recordVisit(base(t.id, { paid: false }));
    await store.deleteVisit(v.id, '2026-10');
    expect((await store.pendingOverview()).count).toBe(0);
    expect(await store.settleTeacher(t.id)).toEqual({ count: 0, amount: 0 });
  });
});

describe('pending totals across months', () => {
  it('adds up everything still owed, whichever month it was earned in', async () => {
    const { store } = mk();
    const t = await store.saveTeacher(teacher);
    await store.recordVisit(base(t.id, { date: '2026-08-01', paid: false, amount: 400 }));
    await store.recordVisit(base(t.id, { date: '2026-10-01', paid: false, amount: 600 }));
    await store.recordVisit(base(t.id, { date: '2026-10-02', paid: true, amount: 999 }));
    expect(await store.pendingOverview()).toEqual({ count: 2, amount: 1000, byTeacher: { [t.id]: { count: 2, amount: 1000 } } });
  });
});
