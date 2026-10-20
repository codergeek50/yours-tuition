import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { AppsScriptStorage } from '../src/storage/appsscript';
import { AuthError, ConflictError } from '../src/storage/types';
import { startTarget, phoneFor, type Target } from './support';

let target: Target;

describe('the data service over real HTTP', () => {
  beforeAll(async () => {
    target = await startTarget();
  });
  afterAll(async () => {
    await target.close();
  });

  const storage = (key = target.key) => new AppsScriptStorage({ endpoint: target.endpoint, key, allowLocalTestServer: !target.real });

  it('accepts the right key and identifies itself', async () => {
    const s = storage();
    await s.verify();
    expect(s.sheetUrl).toContain('docs.google.com/spreadsheets');
  });

  it('rejects a wrong key, a missing key and a nearly-right key', async () => {
    for (const key of ['wrong', 'x', target.key.slice(0, -1), target.key + 'x']) await expect(storage(key).verify()).rejects.toBeInstanceOf(AuthError);
  });

  it('refuses an address that is not a Google web app', () => {
    expect(() => new AppsScriptStorage({ endpoint: 'https://evil.example.com/macros/s/x/exec', key: 'k' })).toThrow(/address/i);
  });

  it('versions every write: stale writes conflict, and nothing is lost', async () => {
    const s = storage();
    const path = 'meta.json';
    const existing = await s.read(path);
    const first = await s.write(path, JSON.stringify({ schemaVersion: 1, nextReceiptNumber: 1 }), existing?.sha);
    const second = await s.write(path, JSON.stringify({ schemaVersion: 1, nextReceiptNumber: 2 }), first.sha);
    await expect(s.write(path, JSON.stringify({ schemaVersion: 1, nextReceiptNumber: 3 }), first.sha)).rejects.toBeInstanceOf(ConflictError);
    expect(JSON.parse((await s.read(path))!.content).nextReceiptNumber).toBe(2);
    expect(second.sha).not.toBe(first.sha);
  });

  it('a pull takes one request however many files there are', async () => {
    const a = phoneFor(target);
    await a.store.saveStudent({ name: 'Pull Test', school: '', grade: '8', guardianName: '', guardianPhone: '', monthlyFee: 100, joinedOn: '2026-01-01', active: true });
    for (const d of ['2026-01-05', '2026-02-05', '2026-03-05']) await a.store.saveAttendance(d, { x: 'P' });
    await a.engine.push();
    const b = phoneFor(target);
    let requests = 0;
    const real = globalThis.fetch;
    globalThis.fetch = ((...args: Parameters<typeof fetch>) => { requests++; return real(...args); }) as typeof fetch;
    try {
      await b.engine.pull();
    } finally {
      globalThis.fetch = real;
    }
    expect(requests).toBe(1);
    expect((await b.store.attendanceMonths()).length).toBeGreaterThanOrEqual(3);
  });

  it.skipIf(process.env.E2E_ENDPOINT !== undefined)('the readable sheet is rebuilt from what the app saved', async () => {
    const a = phoneFor(target);
    await a.store.saveStudent({ name: '=SUM(1,1) Sheet Student', school: 'DAV', grade: '9', guardianName: '', guardianPhone: '', monthlyFee: 1200, joinedOn: '2026-01-01', active: true });
    expect((await a.engine.push()).status).toBe('synced');
    const apps = (target as unknown as { apps?: any }).apps;
    const tab = [...apps.state.spreadsheets.values()].map((ss: any) => ss.tabs.get('Students')?.values).find(Boolean);
    const names = tab.slice(1).map((r: string[]) => r[0]);
    expect(names).toContain("'=SUM(1,1) Sheet Student"); // made harmless, not a live formula
  });
});
