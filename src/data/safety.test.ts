import { describe, it, expect } from 'vitest';
import { DataStore } from './store';
import { MemoryLocalStore } from '../sync/local';
import { mergeFile } from '../sync/merge';

const base = { school: 'S', grade: '8', guardianName: '', guardianPhone: '', monthlyFee: 1000, joinedOn: '2026-01-01', active: true };
const mk = () => new DataStore(new MemoryLocalStore());

describe('receipt numbers stay unique and balances right under concurrent saves', () => {
  it('two payments recorded at the same instant get different numbers', async () => {
    const store = mk();
    const s = await store.saveStudent({ ...base, name: 'Asha' });
    const input = { studentId: s.id, forMonth: '2026-10', amount: 100, paidOn: '2026-10-03', mode: 'cash' as const };
    const results = await Promise.all(Array.from({ length: 8 }, () => store.recordPayment(input)));
    const numbers = results.map((p) => p.receipt.number).sort((a, b) => a - b);
    expect(numbers).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    const balances = results.map((p) => p.receipt.balanceAfter).sort((a, b) => b - a);
    expect(balances).toEqual([900, 800, 700, 600, 500, 400, 300, 200]);
    expect((await store.payments('2026-10')).length).toBe(8);
  });
});

describe('restoring a backup only accepts the app\'s own files', () => {
  const good = JSON.stringify({ students: [] });
  const backup = (files: Record<string, unknown>) => JSON.stringify({ app: 'yours-tuition', version: 1, exportedAt: 'x', files });

  it('accepts the known file layout', async () => {
    const store = mk();
    await store.importAll(backup({ 'students.json': good, 'meta.json': '{"schemaVersion":1,"nextReceiptNumber":3}', 'attendance/2026-10.json': '{"days":{}}', 'payments/2026-10.json': '{"payments":[]}' }));
    expect((await store.students()).length).toBe(0);
  });
  it('rejects paths that could write elsewhere in the data repo', async () => {
    const store = mk();
    for (const path of ['../evil.json', '.github/workflows/x.yml', 'attendance/../../x.json', 'attendance/2026-10.json/../../x', 'README.md', '/etc/passwd', 'attendance/2026-13.json']) {
      await expect(store.importAll(backup({ [path]: good }))).rejects.toThrow(/backup/i);
    }
  });
  it('rejects content that is not valid JSON of the right shape, or not text', async () => {
    const store = mk();
    await expect(store.importAll(backup({ 'students.json': 'not json' }))).rejects.toThrow(/backup/i);
    await expect(store.importAll(backup({ 'students.json': '{"nope":1}' }))).rejects.toThrow(/backup/i);
    await expect(store.importAll(backup({ 'students.json': 42 }))).rejects.toThrow(/backup/i);
  });
  it('writes nothing when any file in the backup is bad', async () => {
    const store = mk();
    await expect(store.importAll(backup({ 'students.json': good, '../x.json': good }))).rejects.toThrow();
    expect(await store.exportAll()).not.toContain('students.json');
  });
});

describe('merge ignores keys that could tamper with objects', () => {
  it('skips __proto__ dates in attendance', () => {
    const merged = mergeFile('attendance/2026-10.json', '{"days":{}}', '{"days":{"__proto__":{"x":"A"},"2026-10-01":{"a":"P"}}}');
    const days = JSON.parse(merged).days as Record<string, unknown>;
    expect(Object.keys(days)).toEqual(['2026-10-01']);
    expect(({} as Record<string, unknown>).x).toBeUndefined();
  });
});

describe('restoring never lets receipt numbers repeat', () => {
  it('moves the counter past the highest restored receipt', async () => {
    const a = mk();
    const s = await a.saveStudent({ ...base, name: 'Asha' });
    for (let i = 0; i < 5; i++) await a.recordPayment({ studentId: s.id, forMonth: '2026-10', amount: 10, paidOn: '2026-10-03', mode: 'cash' });
    const dump = JSON.parse(await a.exportAll());
    dump.files['meta.json'] = JSON.stringify({ schemaVersion: 1, nextReceiptNumber: 2 }); // a stale counter
    const b = mk();
    await b.importAll(JSON.stringify(dump));
    const next = await b.recordPayment({ studentId: s.id, forMonth: '2026-10', amount: 10, paidOn: '2026-10-04', mode: 'cash' });
    expect(next.receipt.number).toBe(6);
  });
});
