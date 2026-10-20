import { describe, it, expect, vi } from 'vitest';
import { MemoryStorage } from './memory';
import { ConflictError, updateJson } from './types';

describe('MemoryStorage', () => {
  it('returns null for missing files and writes with sha', async () => {
    const s = new MemoryStorage();
    expect(await s.read('a.json')).toBeNull();
    const { sha } = await s.write('a.json', '{"x":1}', undefined);
    expect((await s.read('a.json'))!.content).toBe('{"x":1}');
    expect((await s.read('a.json'))!.sha).toBe(sha);
  });
  it('rejects a stale or missing sha with ConflictError', async () => {
    const s = new MemoryStorage();
    await s.write('a.json', '1', undefined);
    await expect(s.write('a.json', '2', 'stale')).rejects.toBeInstanceOf(ConflictError);
    await expect(s.write('a.json', '2', undefined)).rejects.toBeInstanceOf(ConflictError);
  });
  it('lists files in a directory', async () => {
    const s = new MemoryStorage();
    await s.write('attendance/2026-09.json', '{}', undefined);
    await s.write('attendance/2026-10.json', '{}', undefined);
    await s.write('students.json', '{}', undefined);
    expect((await s.list('attendance')).sort()).toEqual(['attendance/2026-09.json', 'attendance/2026-10.json']);
  });
});

describe('updateJson', () => {
  it('creates, then updates a file', async () => {
    const s = new MemoryStorage();
    await updateJson(s, 'n.json', { n: 0 }, (d) => ({ n: d.n + 1 }));
    await updateJson(s, 'n.json', { n: 0 }, (d) => ({ n: d.n + 1 }));
    expect(JSON.parse((await s.read('n.json'))!.content)).toEqual({ n: 2 });
  });
  it('retries after a conflict by re-reading', async () => {
    const s = new MemoryStorage();
    await s.write('n.json', '{"n":5}', undefined);
    const realWrite = s.write.bind(s);
    let first = true;
    s.write = async (p, c, sha) => {
      if (first) { first = false; await realWrite(p, '{"n":10}', (await s.read(p))!.sha); }
      return realWrite(p, c, sha);
    };
    await updateJson(s, 'n.json', { n: 0 }, (d) => ({ n: d.n + 1 }));
    expect(JSON.parse((await s.read('n.json'))!.content)).toEqual({ n: 11 });
  });
});
