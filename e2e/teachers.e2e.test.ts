import { describe, it, expect, beforeAll } from 'vitest';
import { GitHubStorage } from '../src/storage/github';
import { MemoryLocalStore } from '../src/sync/local';
import { SyncEngine } from '../src/sync/engine';
import { DataStore } from '../src/data/store';
import { visitsCsv, visitSummaryCsv } from '../src/reports/csv';
import { visitSummary } from '../src/domain/teachers';

const repo = process.env.TEST_DATA_REPO ?? '';
const token = process.env.TEST_GITHUB_TOKEN ?? '';
const [owner = '', name = ''] = repo.split('/');
const run = `${Date.now()}`;

if (!repo || !token) throw new Error('Set TEST_DATA_REPO and TEST_GITHUB_TOKEN (see .env.example)');

const remote = () => new GitHubStorage({ owner, repo: name, token });
const phone = () => {
  const local = new MemoryLocalStore();
  const engine = new SyncEngine(local, remote());
  return { local, engine, store: new DataStore(local) };
};
const MONTH = '2027-03';

describe('visiting teachers against a real private GitHub repository', () => {
  beforeAll(async () => {
    await remote().verifyPrivate();
  });

  it('visits sync to a second phone, deletions stay deleted, concurrent visits merge, and the reports add up', async () => {
    const a = phone();
    await a.engine.pull();
    const teacher = await a.store.saveTeacher({ name: `Special Class Teacher ${run}`, phone: '', subject: 'Maths', usualAmount: 800, active: true });
    const first = await a.store.recordVisit({ teacherId: teacher.id, date: `${MONTH}-02`, hours: 2, amount: 800, note: 'Revision' });
    const second = await a.store.recordVisit({ teacherId: teacher.id, date: `${MONTH}-09`, hours: 1.5, amount: 600, note: 'Doubt clearing' });
    expect((await a.engine.sync()).status).toBe('synced');

    // A second phone that has never seen this data pulls it all.
    const b = phone();
    await b.engine.pull();
    expect((await b.store.teachers()).some((t) => t.id === teacher.id)).toBe(true);
    const seen = (await b.store.visits(MONTH)).filter((v) => v.teacherId === teacher.id);
    expect(seen.map((v) => [v.hours, v.amount]).sort()).toEqual([[1.5, 600], [2, 800]]);

    // Phone B deletes one visit while phone A records another, both before syncing.
    await b.store.deleteVisit(second.id, MONTH);
    const third = await a.store.recordVisit({ teacherId: teacher.id, date: `${MONTH}-16`, hours: 3, amount: 1500, note: 'Extra class' });
    expect((await a.engine.sync()).status).toBe('synced');
    expect((await b.engine.sync()).status).toBe('synced'); // conflicts, merges, retries
    await a.engine.sync();

    const c = phone();
    await c.engine.pull();
    const mine = (await c.store.visits(MONTH)).filter((v) => v.teacherId === teacher.id);
    expect(mine.map((v) => v.id).sort()).toEqual([first.id, third.id].sort());
    expect(mine.find((v) => v.id === second.id)).toBeUndefined();

    // The month's reports add up from what was stored.
    const teachers = await c.store.teachers();
    const summary = visitSummary(teachers, mine);
    expect(summary.totals).toEqual({ visits: 2, hours: 5, paid: 2300 });
    expect(visitsCsv(teachers, mine)).toContain(`Special Class Teacher ${run}`);
    expect(visitSummaryCsv(teachers, mine)).toContain(',2,5,2300');

    // Backup from one phone restores into another with the visits intact.
    const d = phone();
    await d.store.importAll(await c.store.exportAll());
    expect((await d.store.visits(MONTH)).filter((v) => v.teacherId === teacher.id)).toHaveLength(2);
    expect((await d.engine.push()).status).toBe('synced');
  });
});
