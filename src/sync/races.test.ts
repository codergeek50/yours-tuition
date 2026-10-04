import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { MemoryStorage } from '../storage/memory';
import { MemoryLocalStore, IdbLocalStore, type LocalStore } from './local';
import { SyncEngine } from './engine';
import { createSession } from '../app/session';

const stores: [string, () => LocalStore][] = [
  ['memory', () => new MemoryLocalStore()],
  ['indexeddb', () => new IdbLocalStore(`r${Math.random()}`)],
];

/** A promise you can release from the outside, to hold a network call open. */
function gate() {
  let open!: () => void;
  const wait = new Promise<void>((r) => (open = r));
  return { wait, open };
}

describe('LocalStore.update is atomic', () => {
  for (const [name, mk] of stores) {
    it(`${name}: concurrent updates never lose an increment`, async () => {
      const s = mk();
      await Promise.all(
        Array.from({ length: 25 }, () =>
          s.update('n.json', (cur) => ({ content: String(Number(cur?.content ?? '0') + 1), dirty: true })),
        ),
      );
      expect((await s.get('n.json'))!.content).toBe('25');
    });
    it(`${name}: returning undefined leaves the entry untouched`, async () => {
      const s = mk();
      await s.put('a', { content: 'keep', dirty: true });
      await s.update('a', () => undefined);
      expect((await s.get('a'))!.content).toBe('keep');
    });
  }
});

describe('sync never overwrites an edit made while it was running', () => {
  for (const [name, mk] of stores) {
    it(`${name}: an edit during pull survives`, async () => {
      const remote = new MemoryStorage();
      await remote.write('students.json', '{"students":["remote"]}', undefined);
      const g = gate();
      const realRead = remote.read.bind(remote);
      remote.read = async (p) => { const r = await realRead(p); if (p === 'students.json') await g.wait; return r; };
      const local = mk();
      const engine = new SyncEngine(local, remote);
      const pulling = engine.pull();
      await new Promise((r) => setTimeout(r, 20));
      await local.update('students.json', () => ({ content: '{"students":["edited while pulling"]}', dirty: true }));
      g.open();
      await pulling;
      const e = (await local.get('students.json'))!;
      expect(e.content).toBe('{"students":["edited while pulling"]}');
      expect(e.dirty).toBe(true);
    });

    it(`${name}: an edit during push is kept and uploaded next time`, async () => {
      const remote = new MemoryStorage();
      const g = gate();
      const realWrite = remote.write.bind(remote);
      let first = true;
      remote.write = async (p, c, s) => { if (first) { first = false; await g.wait; } return realWrite(p, c, s); };
      const local = mk();
      await local.put('attendance/2026-10.json', { content: '{"days":{"2026-10-01":{"a":"P"}}}', dirty: true });
      const engine = new SyncEngine(local, remote);
      const pushing = engine.push();
      await new Promise((r) => setTimeout(r, 20));
      await local.update('attendance/2026-10.json', () => ({ content: '{"days":{"2026-10-01":{"a":"A"}}}', dirty: true, sha: undefined }));
      g.open();
      await pushing;
      const mid = (await local.get('attendance/2026-10.json'))!;
      expect(mid.content).toBe('{"days":{"2026-10-01":{"a":"A"}}}');
      expect(mid.dirty).toBe(true);
      expect((await engine.push()).status).toBe('synced');
      expect(JSON.parse((await remote.read('attendance/2026-10.json'))!.content).days['2026-10-01'].a).toBe('A');
      expect((await local.get('attendance/2026-10.json'))!.dirty).toBe(false);
    });
  }
});

describe('session keeps syncing changes made during a sync', () => {
  it('uploads a change that arrived while the previous sync was still running', async () => {
    const remote = new MemoryStorage();
    const realWrite = remote.write.bind(remote);
    remote.write = async (p, c, s) => { await new Promise((r) => setTimeout(r, 40)); return realWrite(p, c, s); };
    const local = new MemoryLocalStore();
    const session = createSession(remote, local, 5);
    await session.store.saveStudent({ name: 'A', school: '', grade: '8', guardianName: '', guardianPhone: '', monthlyFee: 100, joinedOn: '2026-01-01', active: true });
    const running = session.syncNow();
    await new Promise((r) => setTimeout(r, 10));
    await session.store.saveStudent({ name: 'B', school: '', grade: '8', guardianName: '', guardianPhone: '', monthlyFee: 100, joinedOn: '2026-01-01', active: true });
    await running;
    const deadline = Date.now() + 3000;
    while ((await session.engine.pendingCount()) > 0 && Date.now() < deadline) await new Promise((r) => setTimeout(r, 20));
    session.dispose();
    expect(await session.engine.pendingCount()).toBe(0);
    const names = (JSON.parse((await remote.read('students.json'))!.content).students as { name: string }[]).map((s) => s.name).sort();
    expect(names).toEqual(['A', 'B']);
  });
});
