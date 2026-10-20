import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startTarget, phoneFor, type Target } from './support';
import { attendanceCsv, feeReportCsv } from '../src/reports/csv';
import { receiptHtml } from '../src/reports/receipt';

const run = `${Date.now()}`;
let target: Target;
const phone = () => phoneFor(target);
const student = (n: string) => ({ name: `${n} ${run}`, school: 'E2E School', grade: '8', guardianName: 'Guardian', guardianPhone: '9876543210', monthlyFee: 1000, joinedOn: '2026-01-01', active: true });

describe('end to end through the data service (the whole teacher workflow)', () => {
  beforeAll(async () => {
    target = await startTarget();
  });
  afterAll(async () => {
    await target.close();
  });

  it('full teacher workflow: student, attendance, payment, receipt, reports, restore on a second phone', async () => {
    const a = phone();
    await a.engine.pull();
    const asha = await a.store.saveStudent(student('Asha'));
    const bala = await a.store.saveStudent(student('Bala'));
    await a.store.saveAttendance('2026-10-01', { [asha.id]: 'P', [bala.id]: 'A' });
    await a.store.saveAttendance('2026-10-02', { [asha.id]: 'P', [bala.id]: 'L' });
    const pay = await a.store.recordPayment({ studentId: asha.id, forMonth: '2026-10', amount: 400, paidOn: '2026-10-03', mode: 'upi' });
    expect((await a.engine.push()).status).toBe('synced');
    expect(await a.engine.pendingCount()).toBe(0);

    // A different phone that has never seen this data pulls it all.
    const b = phone();
    await b.engine.pull();
    const students = await b.store.students();
    expect(students.map((s) => s.id)).toEqual(expect.arrayContaining([asha.id, bala.id]));
    const oct = await b.store.attendance('2026-10');
    expect(oct.days['2026-10-01']![bala.id]).toBe('A');
    const payments = await b.store.payments('2026-10');
    const same = payments.find((p) => p.id === pay.id)!;
    expect(same.receipt.number).toBe(pay.receipt.number);
    expect(same.receipt.balanceAfter).toBe(600);

    // Reports and receipts come out of the stored data.
    const range = await b.store.attendanceRange('2026-10-01', '2026-10-31');
    const csv = attendanceCsv(students.filter((s) => [asha.id, bala.id].includes(s.id)), range);
    expect(csv).toContain(`Asha ${run}`);
    expect(feeReportCsv(students.filter((s) => s.id === asha.id), '2026-10', payments)).toContain(`#${pay.receipt.number}`);
    expect(receiptHtml(same, { teacherName: 'T', tuitionName: 'E2E' })).toContain(`Receipt No. ${pay.receipt.number}`);

    // The second phone issues the next receipt number, never reusing one.
    const next = await b.store.recordPayment({ studentId: asha.id, forMonth: '2026-10', amount: 600, paidOn: '2026-10-05', mode: 'cash' });
    expect(next.receipt.number).toBeGreaterThan(pay.receipt.number);
    expect((await b.engine.push()).status).toBe('synced');
  });

  it('two phones changing the same month at once: nothing is lost', async () => {
    const a = phone();
    await a.engine.pull();
    const s = await a.store.saveStudent(student('Chitra'));
    await a.engine.push();

    const b = phone();
    await b.engine.pull();

    // Both phones are offline-ish: each marks a different day, then both sync.
    await a.store.saveAttendance('2026-11-03', { [s.id]: 'P' });
    await b.store.saveAttendance('2026-11-04', { [s.id]: 'A' });
    expect((await a.engine.push()).status).toBe('synced');
    expect((await b.engine.push()).status).toBe('synced'); // conflicts, merges, retries

    const c = phone();
    await c.engine.pull();
    const nov = await c.store.attendance('2026-11');
    expect(nov.days['2026-11-03']![s.id]).toBe('P');
    expect(nov.days['2026-11-04']![s.id]).toBe('A');
  });

  it('a voided receipt stays voided after sync and keeps its number', async () => {
    const a = phone();
    await a.engine.pull();
    const s = await a.store.saveStudent(student('Devi'));
    const p = await a.store.recordPayment({ studentId: s.id, forMonth: '2026-12', amount: 500, paidOn: '2026-12-02', mode: 'cash' });
    await a.engine.push();
    await a.store.voidReceipt(p.id, '2026-12', 'wrong student');
    await a.engine.push();
    const b = phone();
    await b.engine.pull();
    const got = (await b.store.payments('2026-12')).find((x) => x.id === p.id)!;
    expect(got.receipt.voided).toBe(true);
    expect(got.receipt.number).toBe(p.receipt.number);
  });

  it('backup export from one phone restores into another', async () => {
    const a = phone();
    await a.engine.pull();
    const dump = await a.store.exportAll();
    const b = phone();
    await b.store.importAll(dump);
    expect((await b.store.students()).length).toBe((await a.store.students()).length);
    expect((await b.engine.push()).status).toBe('synced');
  });
});
