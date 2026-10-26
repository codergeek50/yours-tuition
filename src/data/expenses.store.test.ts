import { describe, it, expect } from 'vitest';
import { DataStore } from './store';
import { MemoryLocalStore } from '../sync/local';

const mk = () => {
  const local = new MemoryLocalStore();
  return { local, store: new DataStore(local) };
};
const rent = { date: '2026-10-05', label: 'Rent', amount: 4000 };

describe('expenses', () => {
  it('records an expense and lists the month newest first', async () => {
    const { store } = mk();
    await store.recordExpense(rent);
    await store.recordExpense({ date: '2026-10-12', label: 'Chalk and markers', amount: 150 });
    const list = await store.expenses('2026-10');
    expect(list.map((e) => [e.label, e.amount])).toEqual([['Chalk and markers', 150], ['Rent', 4000]]);
    expect(await store.expenses('2026-09')).toEqual([]);
  });

  it('is saved in the month file of its date', async () => {
    const { local, store } = mk();
    await store.recordExpense({ ...rent, date: '2026-11-01' });
    expect(Object.keys(await local.all())).toEqual(['expenses/2026-11.json']);
  });

  it.each([
    [{ ...rent, label: '  ' }, /what/i],
    [{ ...rent, amount: 0 }, /amount/i],
    [{ ...rent, amount: 12.5 }, /amount/i],
    [{ ...rent, date: '2026-02-31' }, /date/i],
  ])('refuses %j', async (input, message) => {
    await expect(mk().store.recordExpense(input)).rejects.toThrow(message);
  });

  it('can be edited, and moving the date to another month moves it', async () => {
    const { store } = mk();
    const e = await store.recordExpense(rent);
    await store.updateExpense(e.id, '2026-10', { amount: 4500 });
    expect((await store.expenses('2026-10'))[0]!.amount).toBe(4500);
    await store.updateExpense(e.id, '2026-10', { date: '2026-11-03' });
    expect(await store.expenses('2026-10')).toEqual([]);
    expect((await store.expenses('2026-11'))[0]).toMatchObject({ label: 'Rent', date: '2026-11-03' });
  });

  it('deleting hides it but keeps the record, so a sync cannot bring it back', async () => {
    const { local, store } = mk();
    const e = await store.recordExpense(rent);
    await store.deleteExpense(e.id, '2026-10');
    expect(await store.expenses('2026-10')).toEqual([]);
    const file = JSON.parse((await local.get('expenses/2026-10.json'))!.content);
    expect(file.expenses[0]).toMatchObject({ id: e.id, deleted: true });
    await expect(store.deleteExpense('nope', '2026-10')).rejects.toThrow(/not found/i);
  });

  it('lists the months that have expenses', async () => {
    const { store } = mk();
    await store.recordExpense(rent);
    const gone = await store.recordExpense({ ...rent, date: '2026-09-05' });
    await store.deleteExpense(gone.id, '2026-09');
    expect(await store.expenseMonths()).toEqual(['2026-10']);
  });

  it('a backup with expenses restores, and a malformed expenses file is refused', async () => {
    const { store } = mk();
    const good = JSON.stringify({ app: 'yours-tuition', version: 1, exportedAt: '', files: { 'expenses/2026-10.json': JSON.stringify({ expenses: [] }) } });
    await store.importAll(good);
    const bad = JSON.stringify({ app: 'yours-tuition', version: 1, exportedAt: '', files: { 'expenses/2026-10.json': JSON.stringify({ visits: [] }) } });
    await expect(store.importAll(bad)).rejects.toThrow(/backup/i);
    const wrongPath = JSON.stringify({ app: 'yours-tuition', version: 1, exportedAt: '', files: { 'expenses/2026-13.json': JSON.stringify({ expenses: [] }) } });
    await expect(store.importAll(wrongPath)).rejects.toThrow(/backup/i);
  });
});
