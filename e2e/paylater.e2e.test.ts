import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startTarget, phoneFor, type Target } from './support';
import { visitsCsv, visitSummaryCsv } from '../src/reports/csv';
import { visitSummary } from '../src/domain/teachers';

const run = `${Date.now()}`;
let target: Target;
const phone = () => phoneFor(target);


describe('end to end through the data service (pay-later visits)', () => {
  beforeAll(async () => {
    target = await startTarget();
  });
  afterAll(async () => {
    await target.close();
  });

  it('pending visits sync across phones, settling merges with new pay-later visits, and the reports show paid and pending', async () => {
    const a = phone();
    await a.engine.pull();
    const t = await a.store.saveTeacher({ name: `Pay Later Teacher ${run}`, phone: '', subject: 'Science', usualAmount: 800, active: true });
    const v1 = await a.store.recordVisit({ teacherId: t.id, date: '2027-04-10', hours: 2, amount: 800, note: 'April lab', paid: false });
    const v2 = await a.store.recordVisit({ teacherId: t.id, date: '2027-05-04', hours: 1.5, amount: 600, note: 'May revision', paid: false });
    const v3 = await a.store.recordVisit({ teacherId: t.id, date: '2027-05-06', hours: 1, amount: 400, note: 'Paid on the day' });
    expect((await a.engine.sync()).status).toBe('synced');

    // A second phone sees what is owed, across months.
    const b = phone();
    await b.engine.pull();
    expect((await b.store.pendingOverview()).byTeacher[t.id]).toEqual({ count: 2, amount: 1400 });

    // Phone B settles the teacher while phone A records another pay-later visit, before either syncs.
    const settled = await b.store.settleTeacher(t.id, '2027-05-20');
    expect(settled).toEqual({ count: 2, amount: 1400 });
    const v4 = await a.store.recordVisit({ teacherId: t.id, date: '2027-05-12', hours: 2, amount: 900, note: 'Added later', paid: false });
    expect((await a.engine.sync()).status).toBe('synced');
    expect((await b.engine.sync()).status).toBe('synced');
    await a.engine.sync();

    // A third phone: the settled visits are paid, the new one is still pending. Nothing was lost.
    const c = phone();
    await c.engine.pull();
    const may = (await c.store.visits('2027-05')).filter((v) => v.teacherId === t.id);
    expect(may.find((v) => v.id === v2.id)).toMatchObject({ paid: true, paidOn: '2027-05-20' });
    expect(may.find((v) => v.id === v3.id)).toMatchObject({ paid: true });
    expect(may.find((v) => v.id === v4.id)).toMatchObject({ paid: false, amount: 900 });
    expect((await c.store.visits('2027-04')).find((v) => v.id === v1.id)).toMatchObject({ paid: true, paidOn: '2027-05-20' });
    expect((await c.store.pendingOverview()).byTeacher[t.id]).toEqual({ count: 1, amount: 900 });

    // Reports for May show paid and pending separately.
    const teachers = await c.store.teachers();
    const summary = visitSummary(teachers, may);
    expect(summary.totals).toEqual({ visits: 3, hours: 4.5, paid: 1000, pending: 900 });
    expect(visitsCsv(teachers, may)).toContain('Pending');
    expect(visitSummaryCsv(teachers, may)).toContain(',1000,900,1900');

    // Everything is settled in the end.
    expect(await c.store.settleTeacher(t.id, '2027-06-01')).toEqual({ count: 1, amount: 900 });
    expect((await c.store.pendingOverview()).byTeacher[t.id]).toBeUndefined();
    expect((await c.engine.sync()).status).toBe('synced');
  });

  it('visits saved before pay-later existed count as paid after a real round trip', async () => {
    const a = phone();
    await a.engine.pull();
    const t = await a.store.saveTeacher({ name: `Old Data Teacher ${run}`, phone: '', subject: '', usualAmount: 0, active: true });
    await a.engine.sync();
    // Write a visit in the old shape (no paid / paidOn) straight into the data repo.
    const old = { id: `old-${run}`, teacherId: t.id, date: '2027-03-05', hours: 2, amount: 700, note: 'old shape', deleted: false, updatedAt: '2027-03-05T00:00:00Z' };
    const existing = await a.storage.read('visits/2027-03.json');
    const doc = existing ? JSON.parse(existing.content) : { visits: [] };
    doc.visits.push(old);
    await a.storage.write('visits/2027-03.json', JSON.stringify(doc, null, 2), existing?.sha);

    const b = phone();
    await b.engine.pull();
    const got = (await b.store.visits('2027-03')).find((v) => v.id === old.id);
    expect(got).toMatchObject({ paid: true, paidOn: '2027-03-05', amount: 700 });
    expect((await b.store.pendingOverview()).byTeacher[t.id]).toBeUndefined();
  });
});
