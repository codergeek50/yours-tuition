import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { MemoryStorage } from '../storage/memory';
import { ConflictError, NetworkError, AuthError } from '../storage/types';
import { MemoryLocalStore, IdbLocalStore, type LocalStore } from './local';
import { mergeFile } from './merge';
import { SyncEngine } from './engine';

describe('local stores', () => {
  const makers: [string, () => LocalStore][] = [
    ['memory', () => new MemoryLocalStore()],
    ['indexeddb', () => new IdbLocalStore(`t${Math.random()}`)],
  ];
  for (const [name, mk] of makers) {
    it(`${name}: put, get, all, clear`, async () => {
      const s = mk();
      expect(await s.get('a')).toBeUndefined();
      await s.put('a', { content: '1', sha: 's', dirty: true });
      await s.put('b', { content: '2', dirty: false });
      expect(await s.get('a')).toEqual({ content: '1', sha: 's', dirty: true });
      expect(Object.keys(await s.all()).sort()).toEqual(['a', 'b']);
      await s.clear();
      expect(Object.keys(await s.all())).toEqual([]);
    });
  }
});

describe('mergeFile', () => {
  it('students: union by id, newer updatedAt wins', () => {
    const remote = JSON.stringify({ students: [{ id: '1', name: 'Old', updatedAt: '2026-10-01T00:00:00Z' }, { id: '2', name: 'R', updatedAt: '2026-10-01T00:00:00Z' }] });
    const local = JSON.stringify({ students: [{ id: '1', name: 'New', updatedAt: '2026-10-02T00:00:00Z' }, { id: '3', name: 'L', updatedAt: '2026-10-01T00:00:00Z' }] });
    const merged = JSON.parse(mergeFile('students.json', remote, local));
    expect(merged.students.map((s: any) => `${s.id}:${s.name}`).sort()).toEqual(['1:New', '2:R', '3:L']);
  });
  it('attendance: union of days, local wins per student on the same day', () => {
    const remote = JSON.stringify({ days: { '2026-10-01': { a: 'P', b: 'P' }, '2026-10-02': { a: 'A' } } });
    const local = JSON.stringify({ days: { '2026-10-01': { a: 'A' }, '2026-10-03': { a: 'P' } } });
    const merged = JSON.parse(mergeFile('attendance/2026-10.json', remote, local));
    expect(merged.days['2026-10-01']).toEqual({ a: 'A', b: 'P' });
    expect(Object.keys(merged.days).sort()).toEqual(['2026-10-01', '2026-10-02', '2026-10-03']);
  });
  it('payments: union by id; a voided receipt stays voided', () => {
    const p = (id: string, voided: boolean) => ({ id, receipt: { number: 1, voided } });
    const remote = JSON.stringify({ payments: [p('x', true), p('y', false)] });
    const local = JSON.stringify({ payments: [p('x', false), p('z', false)] });
    const merged = JSON.parse(mergeFile('payments/2026-10.json', remote, local));
    expect(merged.payments.map((q: any) => q.id).sort()).toEqual(['x', 'y', 'z']);
    expect(merged.payments.find((q: any) => q.id === 'x').receipt.voided).toBe(true);
  });
  it('meta: takes the larger receipt counter', () => {
    const merged = JSON.parse(mergeFile('meta.json', '{"schemaVersion":1,"nextReceiptNumber":9}', '{"schemaVersion":1,"nextReceiptNumber":7}'));
    expect(merged.nextReceiptNumber).toBe(9);
  });
});

describe('SyncEngine', () => {
  it('pull stores remote files as clean entries', async () => {
    const remote = new MemoryStorage();
    await remote.write('students.json', '{"students":[]}', undefined);
    await remote.write('attendance/2026-10.json', '{"days":{}}', undefined);
    const local = new MemoryLocalStore();
    await new SyncEngine(local, remote).pull();
    expect((await local.get('students.json'))!.dirty).toBe(false);
    expect(await local.get('attendance/2026-10.json')).toBeDefined();
  });
  it('pull never overwrites a dirty local file', async () => {
    const remote = new MemoryStorage();
    await remote.write('students.json', '{"students":[1]}', undefined);
    const local = new MemoryLocalStore();
    await local.put('students.json', { content: '{"students":[2]}', dirty: true });
    await new SyncEngine(local, remote).pull();
    expect((await local.get('students.json'))!.content).toBe('{"students":[2]}');
  });
  it('push writes dirty files and records the new sha', async () => {
    const remote = new MemoryStorage();
    const local = new MemoryLocalStore();
    await local.put('students.json', { content: '{"students":[]}', dirty: true });
    const res = await new SyncEngine(local, remote).push();
    expect(res.status).toBe('synced');
    const entry = (await local.get('students.json'))!;
    expect(entry.dirty).toBe(false);
    expect(entry.sha).toBe((await remote.read('students.json'))!.sha);
  });
  it('push writes meta.json before payments', async () => {
    const order: string[] = [];
    const remote = new MemoryStorage();
    const orig = remote.write.bind(remote);
    remote.write = (p, c, s) => { order.push(p); return orig(p, c, s); };
    const local = new MemoryLocalStore();
    await local.put('payments/2026-10.json', { content: '{"payments":[]}', dirty: true });
    await local.put('meta.json', { content: '{"schemaVersion":1,"nextReceiptNumber":2}', dirty: true });
    await new SyncEngine(local, remote).push();
    expect(order).toEqual(['meta.json', 'payments/2026-10.json']);
  });
  it('push merges on conflict instead of losing either side', async () => {
    const remote = new MemoryStorage();
    await remote.write('attendance/2026-10.json', '{"days":{"2026-10-01":{"a":"P"}}}', undefined);
    const local = new MemoryLocalStore();
    const stale = (await remote.read('attendance/2026-10.json'))!.sha;
    await remote.write('attendance/2026-10.json', '{"days":{"2026-10-01":{"a":"P"},"2026-10-02":{"a":"A"}}}', stale);
    await local.put('attendance/2026-10.json', { content: '{"days":{"2026-10-03":{"a":"P"}}}', sha: stale, dirty: true });
    const res = await new SyncEngine(local, remote).push();
    expect(res.status).toBe('synced');
    const merged = JSON.parse((await remote.read('attendance/2026-10.json'))!.content);
    expect(Object.keys(merged.days).sort()).toEqual(['2026-10-01', '2026-10-02', '2026-10-03']);
    expect(JSON.parse((await local.get('attendance/2026-10.json'))!.content)).toEqual(merged);
  });
  it('reports offline and keeps changes dirty on network failure', async () => {
    const remote = new MemoryStorage();
    remote.write = async () => { throw new NetworkError(); };
    const local = new MemoryLocalStore();
    await local.put('students.json', { content: '{}', dirty: true });
    expect((await new SyncEngine(local, remote).push()).status).toBe('offline');
    expect((await local.get('students.json'))!.dirty).toBe(true);
  });
  it('reports auth failure and keeps changes dirty', async () => {
    const remote = new MemoryStorage();
    remote.write = async () => { throw new AuthError(); };
    const local = new MemoryLocalStore();
    await local.put('students.json', { content: '{}', dirty: true });
    expect((await new SyncEngine(local, remote).push()).status).toBe('auth');
    expect((await local.get('students.json'))!.dirty).toBe(true);
  });
  it('gives up with an error status after repeated conflicts', async () => {
    const remote = new MemoryStorage();
    remote.write = async () => { throw new ConflictError(); };
    const local = new MemoryLocalStore();
    await local.put('students.json', { content: '{"students":[]}', dirty: true });
    expect((await new SyncEngine(local, remote).push()).status).toBe('error');
  });
  it('counts pending files', async () => {
    const local = new MemoryLocalStore();
    await local.put('a', { content: '', dirty: true });
    await local.put('b', { content: '', dirty: false });
    expect(await new SyncEngine(local, new MemoryStorage()).pendingCount()).toBe(1);
  });
});
