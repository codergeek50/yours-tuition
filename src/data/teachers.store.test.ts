import { describe, it, expect, vi } from 'vitest';
import { DataStore } from './store';
import { MemoryLocalStore } from '../sync/local';

const mk = () => {
  const changed = vi.fn();
  return { store: new DataStore(new MemoryLocalStore(), changed), changed };
};
const t = { name: 'Mr Rao', phone: '9876543210', subject: 'Maths', usualAmount: 800, active: true };

describe('teachers', () => {
  it('starts empty, adds and edits a teacher', async () => {
    const { store, changed } = mk();
    expect(await store.teachers()).toEqual([]);
    const a = await store.saveTeacher(t);
    expect(a.id).toBeTruthy();
    await store.saveTeacher({ ...a, subject: 'Physics' });
    const all = await store.teachers();
    expect(all).toHaveLength(1);
    expect(all[0]!.subject).toBe('Physics');
    expect(changed).toHaveBeenCalled();
  });
  it('rejects an invalid teacher', async () => {
    const { store } = mk();
    await expect(store.saveTeacher({ ...t, name: '' })).rejects.toThrow(/Name/);
  });
  it('retires and brings back a teacher without losing history', async () => {
    const { store } = mk();
    const a = await store.saveTeacher(t);
    await store.setTeacherActive(a.id, false);
    expect((await store.teachers())[0]!.active).toBe(false);
    await store.setTeacherActive(a.id, true);
    expect((await store.teachers())[0]!.active).toBe(true);
  });
});

describe('visits', () => {
  const visit = (teacherId: string, o = {}) => ({ teacherId, date: '2026-10-03', hours: 2, amount: 800, note: 'Revision class', ...o });

  it('records a visit in the month file of its date', async () => {
    const { store } = mk();
    const a = await store.saveTeacher(t);
    const v = await store.recordVisit(visit(a.id));
    expect(v).toMatchObject({ teacherId: a.id, date: '2026-10-03', hours: 2, amount: 800, deleted: false });
    expect((await store.visits('2026-10')).map((x) => x.id)).toEqual([v.id]);
    expect(await store.visits('2026-11')).toEqual([]);
  });
  it('rejects a visit for an unknown teacher or with bad numbers', async () => {
    const { store } = mk();
    const a = await store.saveTeacher(t);
    await expect(store.recordVisit(visit('nope'))).rejects.toThrow(/teacher/i);
    await expect(store.recordVisit(visit(a.id, { hours: 1.1 }))).rejects.toThrow(/Hours/);
    await expect(store.recordVisit(visit(a.id, { amount: -5 }))).rejects.toThrow(/Amount/);
    await expect(store.recordVisit(visit(a.id, { date: '2026-02-30' }))).rejects.toThrow(/Date/);
  });
  it('lists newest first', async () => {
    const { store } = mk();
    const a = await store.saveTeacher(t);
    await store.recordVisit(visit(a.id, { date: '2026-10-02' }));
    await store.recordVisit(visit(a.id, { date: '2026-10-09' }));
    await store.recordVisit(visit(a.id, { date: '2026-10-05' }));
    expect((await store.visits('2026-10')).map((v) => v.date)).toEqual(['2026-10-09', '2026-10-05', '2026-10-02']);
  });
  it('edits a visit', async () => {
    const { store } = mk();
    const a = await store.saveTeacher(t);
    const v = await store.recordVisit(visit(a.id));
    await store.updateVisit(v.id, '2026-10', { hours: 3, amount: 1200, note: 'Extra hour' });
    expect((await store.visits('2026-10'))[0]).toMatchObject({ hours: 3, amount: 1200, note: 'Extra hour' });
  });
  it('moving a visit to another month moves it between files and keeps its id', async () => {
    const { store } = mk();
    const a = await store.saveTeacher(t);
    const v = await store.recordVisit(visit(a.id));
    await store.updateVisit(v.id, '2026-10', { date: '2026-11-02' });
    expect(await store.visits('2026-10')).toEqual([]);
    expect((await store.visits('2026-11')).map((x) => x.id)).toEqual([v.id]);
  });
  it('deleting hides the visit but keeps it flagged, so merges cannot bring it back', async () => {
    const { store } = mk();
    const a = await store.saveTeacher(t);
    const v = await store.recordVisit(visit(a.id));
    await store.deleteVisit(v.id, '2026-10');
    expect(await store.visits('2026-10')).toEqual([]);
    const dump = JSON.parse(await store.exportAll()) as { files: Record<string, string> };
    expect(JSON.parse(dump.files['visits/2026-10.json']!).visits[0]).toMatchObject({ id: v.id, deleted: true });
  });
  it('two visits recorded at the same instant are both kept', async () => {
    const { store } = mk();
    const a = await store.saveTeacher(t);
    await Promise.all(Array.from({ length: 6 }, (_, i) => store.recordVisit(visit(a.id, { date: `2026-10-0${i + 1}` }))));
    expect(await store.visits('2026-10')).toHaveLength(6);
  });
  it('lists the months that have visits', async () => {
    const { store } = mk();
    const a = await store.saveTeacher(t);
    await store.recordVisit(visit(a.id, { date: '2026-09-30' }));
    await store.recordVisit(visit(a.id, { date: '2026-10-01' }));
    expect(await store.visitMonths()).toEqual(['2026-09', '2026-10']);
  });
});
