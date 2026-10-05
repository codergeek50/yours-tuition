import { describe, it, expect } from 'vitest';
import { mergeFile } from './merge';
import { MemoryStorage } from '../storage/memory';
import { MemoryLocalStore } from './local';
import { SyncEngine } from './engine';
import { DataStore } from '../data/store';

const visit = (id: string, o: Record<string, unknown> = {}) => ({ id, teacherId: 't1', date: '2026-10-03', hours: 2, amount: 800, note: '', deleted: false, updatedAt: '2026-10-03T10:00:00Z', ...o });

describe('merging teachers and visits', () => {
  it('teachers: union by id, newer edit wins', () => {
    const remote = JSON.stringify({ teachers: [{ id: 'a', name: 'Old', updatedAt: '2026-10-01T00:00:00Z' }, { id: 'b', name: 'B', updatedAt: '2026-10-01T00:00:00Z' }] });
    const local = JSON.stringify({ teachers: [{ id: 'a', name: 'New', updatedAt: '2026-10-02T00:00:00Z' }, { id: 'c', name: 'C', updatedAt: '2026-10-01T00:00:00Z' }] });
    const merged = JSON.parse(mergeFile('teachers.json', remote, local)).teachers.map((t: any) => `${t.id}:${t.name}`).sort();
    expect(merged).toEqual(['a:New', 'b:B', 'c:C']);
  });
  it('visits: union by id, newer edit wins', () => {
    const remote = JSON.stringify({ visits: [visit('x', { hours: 1, updatedAt: '2026-10-03T10:00:00Z' }), visit('y')] });
    const local = JSON.stringify({ visits: [visit('x', { hours: 3, updatedAt: '2026-10-03T11:00:00Z' }), visit('z')] });
    const merged = JSON.parse(mergeFile('visits/2026-10.json', remote, local)).visits;
    expect(merged.map((v: any) => v.id).sort()).toEqual(['x', 'y', 'z']);
    expect(merged.find((v: any) => v.id === 'x').hours).toBe(3);
  });
  it('visits: a deleted visit stays deleted even if the other phone edited it later', () => {
    const remote = JSON.stringify({ visits: [visit('x', { deleted: true, updatedAt: '2026-10-03T10:00:00Z' })] });
    const local = JSON.stringify({ visits: [visit('x', { hours: 5, updatedAt: '2026-10-04T10:00:00Z' })] });
    const merged = JSON.parse(mergeFile('visits/2026-10.json', remote, local)).visits;
    expect(merged).toHaveLength(1);
    expect(merged[0].deleted).toBe(true);
  });
});

describe('sync pulls the new files', () => {
  it('downloads teachers.json and every visits month', async () => {
    const remote = new MemoryStorage();
    await remote.write('teachers.json', '{"teachers":[]}', undefined);
    await remote.write('visits/2026-09.json', '{"visits":[]}', undefined);
    await remote.write('visits/2026-10.json', '{"visits":[]}', undefined);
    const local = new MemoryLocalStore();
    await new SyncEngine(local, remote).pull();
    expect(Object.keys(await local.all()).sort()).toEqual(['teachers.json', 'visits/2026-09.json', 'visits/2026-10.json']);
  });
  it('two phones recording visits the same day both survive the merge', async () => {
    const remote = new MemoryStorage();
    const a = new MemoryLocalStore();
    const b = new MemoryLocalStore();
    const sa = new DataStore(a);
    const t = await sa.saveTeacher({ name: 'Mr Rao', phone: '', subject: '', usualAmount: 0, active: true });
    await new SyncEngine(a, remote).sync();
    const eb = new SyncEngine(b, remote);
    await eb.sync();
    const sb = new DataStore(b);
    await sa.recordVisit({ teacherId: t.id, date: '2026-10-03', hours: 2, amount: 800, note: 'phone A' });
    await sb.recordVisit({ teacherId: t.id, date: '2026-10-03', hours: 1, amount: 400, note: 'phone B' });
    expect((await new SyncEngine(a, remote).sync()).status).toBe('synced');
    expect((await eb.sync()).status).toBe('synced');
    await new SyncEngine(a, remote).sync();
    expect((await sa.visits('2026-10')).map((v) => v.note).sort()).toEqual(['phone A', 'phone B']);
    expect((await sb.visits('2026-10')).map((v) => v.note).sort()).toEqual(['phone A', 'phone B']);
  });
});

describe('backup and restore include teachers and visits', () => {
  const backup = (files: Record<string, unknown>) => JSON.stringify({ app: 'yours-tuition', version: 1, exportedAt: 'x', files });
  const fresh = () => new DataStore(new MemoryLocalStore());

  it('round-trips through export and import', async () => {
    const a = fresh();
    const t = await a.saveTeacher({ name: 'Ms Iyer', phone: '', subject: 'Science', usualAmount: 1000, active: true });
    await a.recordVisit({ teacherId: t.id, date: '2026-10-04', hours: 1.5, amount: 900, note: '' });
    const b = fresh();
    await b.importAll(await a.exportAll());
    expect((await b.teachers()).map((x) => x.name)).toEqual(['Ms Iyer']);
    expect((await b.visits('2026-10'))[0]).toMatchObject({ hours: 1.5, amount: 900 });
  });
  it('accepts the new files and rejects malformed ones', async () => {
    const s = fresh();
    await s.importAll(backup({ 'teachers.json': '{"teachers":[]}', 'visits/2026-10.json': '{"visits":[]}' }));
    for (const files of [
      { 'teachers.json': '{"teachers":"no"}' },
      { 'visits/2026-10.json': '{"visits":{}}' },
      { 'visits/2026-13.json': '{"visits":[]}' },
      { 'visits/../x.json': '{"visits":[]}' },
      { 'visits/2026-10.json/../../y': '{"visits":[]}' },
    ]) await expect(fresh().importAll(backup(files))).rejects.toThrow(/backup/i);
  });
});
