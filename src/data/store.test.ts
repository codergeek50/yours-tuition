import { describe, it, expect, vi } from 'vitest';
import { MemoryLocalStore } from '../sync/local';
import { DataStore } from './store';
import type { Student } from '../domain/types';

const base = (o: Partial<Student> = {}): Omit<Student, 'id' | 'updatedAt'> => ({
  name: 'Asha', school: 'St Mary', grade: '8', guardianName: 'Ravi', guardianPhone: '9876543210',
  monthlyFee: 1000, joinedOn: '2026-08-05', active: true, ...o,
});
const mk = () => {
  const changed = vi.fn();
  const store = new DataStore(new MemoryLocalStore(), changed);
  return { store, changed };
};

describe('students', () => {
  it('starts empty, adds and edits a student', async () => {
    const { store, changed } = mk();
    expect(await store.students()).toEqual([]);
    const s = await store.saveStudent(base());
    expect(s.id).toBeTruthy();
    expect((await store.students()).length).toBe(1);
    await store.saveStudent({ ...s, school: 'New School' });
    const all = await store.students();
    expect(all.length).toBe(1);
    expect(all[0]!.school).toBe('New School');
    expect(changed).toHaveBeenCalled();
  });
  it('rejects invalid students', async () => {
    const { store } = mk();
    await expect(store.saveStudent(base({ name: '' }))).rejects.toThrow(/Name/);
  });
  it('deactivates instead of deleting', async () => {
    const { store } = mk();
    const s = await store.saveStudent(base());
    await store.setActive(s.id, false);
    expect((await store.students())[0]!.active).toBe(false);
  });
});

describe('attendance', () => {
  it('saves a day and reads it back by month', async () => {
    const { store } = mk();
    await store.saveAttendance('2026-10-01', { a: 'P', b: 'A' });
    await store.saveAttendance('2026-10-02', { a: 'P', b: 'P' });
    await store.saveAttendance('2026-11-01', { a: 'A' });
    const oct = await store.attendance('2026-10');
    expect(Object.keys(oct.days)).toEqual(['2026-10-01', '2026-10-02']);
    expect(oct.days['2026-10-01']).toEqual({ a: 'P', b: 'A' });
  });
  it('re-saving a day replaces its marks', async () => {
    const { store } = mk();
    await store.saveAttendance('2026-10-01', { a: 'A' });
    await store.saveAttendance('2026-10-01', { a: 'P' });
    expect((await store.attendance('2026-10')).days['2026-10-01']).toEqual({ a: 'P' });
  });
  it('rejects an invalid date', async () => {
    const { store } = mk();
    await expect(store.saveAttendance('2026-02-30', {})).rejects.toThrow(/date/i);
  });
  it('returns days in a range across months', async () => {
    const { store } = mk();
    await store.saveAttendance('2026-10-30', { a: 'P' });
    await store.saveAttendance('2026-11-02', { a: 'A' });
    await store.saveAttendance('2026-11-20', { a: 'P' });
    const days = await store.attendanceRange('2026-10-31', '2026-11-10');
    expect(days.map((d) => d.date)).toEqual(['2026-11-02']);
  });
});

describe('payments and receipts', () => {
  it('records a payment with sequential receipt numbers', async () => {
    const { store } = mk();
    const s = await store.saveStudent(base());
    const p1 = await store.recordPayment({ studentId: s.id, forMonth: '2026-10', amount: 400, paidOn: '2026-10-03', mode: 'cash' });
    const p2 = await store.recordPayment({ studentId: s.id, forMonth: '2026-10', amount: 600, paidOn: '2026-10-10', mode: 'upi' });
    expect(p1.receipt.number).toBe(1);
    expect(p2.receipt.number).toBe(2);
    expect(p1.receipt.balanceAfter).toBe(600);
    expect(p2.receipt.balanceAfter).toBe(0);
    expect(p1.receipt.studentName).toBe('Asha');
    expect((await store.payments('2026-10')).length).toBe(2);
  });
  it('snapshots the student name so later edits do not change old receipts', async () => {
    const { store } = mk();
    const s = await store.saveStudent(base());
    const p = await store.recordPayment({ studentId: s.id, forMonth: '2026-10', amount: 500, paidOn: '2026-10-03', mode: 'cash' });
    await store.saveStudent({ ...s, name: 'Renamed' });
    expect((await store.payments('2026-10'))[0]!.receipt.studentName).toBe('Asha');
    expect(p.receipt.studentName).toBe('Asha');
  });
  it('rejects invalid payments and unknown students', async () => {
    const { store } = mk();
    const s = await store.saveStudent(base());
    await expect(store.recordPayment({ studentId: s.id, forMonth: '2026-10', amount: 0, paidOn: '2026-10-03', mode: 'cash' })).rejects.toThrow(/amount/i);
    await expect(store.recordPayment({ studentId: 'nope', forMonth: '2026-10', amount: 5, paidOn: '2026-10-03', mode: 'cash' })).rejects.toThrow(/student/i);
  });
  it('voiding keeps the record and the number; balance is restored; reissue gets a new number', async () => {
    const { store } = mk();
    const s = await store.saveStudent(base());
    const p = await store.recordPayment({ studentId: s.id, forMonth: '2026-10', amount: 1000, paidOn: '2026-10-03', mode: 'cash' });
    await store.voidReceipt(p.id, '2026-10', 'wrong amount');
    const [voided] = await store.payments('2026-10');
    expect(voided!.receipt.voided).toBe(true);
    expect(voided!.receipt.voidReason).toBe('wrong amount');
    expect(voided!.receipt.number).toBe(1);
    const again = await store.recordPayment({ studentId: s.id, forMonth: '2026-10', amount: 900, paidOn: '2026-10-03', mode: 'cash' });
    expect(again.receipt.number).toBe(2);
    expect(again.receipt.balanceAfter).toBe(100);
  });
  it('requires a reason to void', async () => {
    const { store } = mk();
    const s = await store.saveStudent(base());
    const p = await store.recordPayment({ studentId: s.id, forMonth: '2026-10', amount: 5, paidOn: '2026-10-03', mode: 'cash' });
    await expect(store.voidReceipt(p.id, '2026-10', '  ')).rejects.toThrow(/reason/i);
  });
  it('finds a payment by receipt number across months', async () => {
    const { store } = mk();
    const s = await store.saveStudent(base());
    await store.recordPayment({ studentId: s.id, forMonth: '2026-09', amount: 5, paidOn: '2026-09-03', mode: 'cash' });
    const p2 = await store.recordPayment({ studentId: s.id, forMonth: '2026-10', amount: 5, paidOn: '2026-10-03', mode: 'cash' });
    expect((await store.findReceipt(2))!.id).toBe(p2.id);
    expect(await store.findReceipt(99)).toBeUndefined();
  });
});

describe('backup', () => {
  it('exports everything and restores it into a fresh store', async () => {
    const a = mk().store;
    const s = await a.saveStudent(base());
    await a.saveAttendance('2026-10-01', { [s.id]: 'A' });
    await a.recordPayment({ studentId: s.id, forMonth: '2026-10', amount: 500, paidOn: '2026-10-03', mode: 'cash' });
    const dump = await a.exportAll();
    const b = mk().store;
    await b.importAll(dump);
    expect((await b.students()).length).toBe(1);
    expect((await b.attendance('2026-10')).days['2026-10-01']).toEqual({ [s.id]: 'A' });
    const next = await b.recordPayment({ studentId: s.id, forMonth: '2026-10', amount: 100, paidOn: '2026-10-04', mode: 'cash' });
    expect(next.receipt.number).toBe(2);
  });
  it('rejects a file that is not a backup', async () => {
    const { store } = mk();
    await expect(store.importAll('{"hello":1}')).rejects.toThrow(/backup/i);
    await expect(store.importAll('not json')).rejects.toThrow(/backup/i);
  });
});
