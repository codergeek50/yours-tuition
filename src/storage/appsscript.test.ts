import { describe, it, expect } from 'vitest';
import { AppsScriptStorage, isValidEndpoint } from './appsscript';
import { AuthError, ConflictError, NetworkError, updateJson } from './types';
import { SyncEngine } from '../sync/engine';
import { MemoryLocalStore } from '../sync/local';
import { DataStore } from '../data/store';
import { fakeAppsScript } from '../test-support/fakeAppsScript';
import { tabValues } from '../../apps-script/fake-services.mjs';

const mk = () => {
  const fake = fakeAppsScript();
  const storage = new AppsScriptStorage({ endpoint: fake.endpoint, key: fake.key, fetchImpl: fake.fetchImpl });
  return { fake, storage };
};

describe('the web app address', () => {
  it('accepts only a script.google.com web app address', () => {
    expect(isValidEndpoint('https://script.google.com/macros/s/AKfycbx_abc-123/exec')).toBe(true);
    for (const bad of [
      'http://script.google.com/macros/s/abc/exec',
      'https://script.google.com/macros/s/abc/dev',
      'https://script.google.com/macros/s/abc/exec?x=1',
      'https://script.google.com/macros/s/abc/exec#frag',
      'https://evil.example.com/macros/s/abc/exec',
      'https://script.google.com.evil.com/macros/s/abc/exec',
      'https://script.google.com/macros/s//exec',
      'https://script.google.com/macros/s/abc/exec/extra',
      'javascript:alert(1)',
      '',
    ]) expect(isValidEndpoint(bad)).toBe(false);
  });
  it('the constructor refuses a bad address, except a local test server when allowed', () => {
    expect(() => new AppsScriptStorage({ endpoint: 'https://evil.example.com/x', key: 'k' })).toThrow(/address/i);
    expect(() => new AppsScriptStorage({ endpoint: 'http://127.0.0.1:8123/exec', key: 'k' })).toThrow(/address/i);
    expect(() => new AppsScriptStorage({ endpoint: 'http://127.0.0.1:8123/exec', key: 'k', allowLocalTestServer: true })).not.toThrow();
    expect(() => new AppsScriptStorage({ endpoint: 'http://evil.example.com/exec', key: 'k', allowLocalTestServer: true })).toThrow(/address/i);
  });
});

describe('verify', () => {
  it('accepts the right key and remembers the spreadsheet address', async () => {
    const { storage } = mk();
    await storage.verify();
    expect(storage.sheetUrl).toContain('docs.google.com/spreadsheets');
  });
  it('only keeps a Google Sheets address, so a bad reply cannot plant a script link', async () => {
    for (const evil of ['javascript:alert(1)', 'https://evil.example.com/spreadsheets/d/x', 'data:text/html,hi']) {
      const reply = { ok: true, app: 'yours-tuition', protocol: 1, sheetUrl: evil };
      const fetchImpl = (async () => new Response(JSON.stringify(reply))) as unknown as typeof fetch;
      const s = new AppsScriptStorage({ endpoint: 'https://script.google.com/macros/s/abc/exec', key: 'k', fetchImpl });
      await s.verify();
      expect(s.sheetUrl).toBe('');
    }
  });
  it('refreshViews asks the service to rebuild the spreadsheet tabs, separately from saving', async () => {
    const { fake, storage } = mk();
    await storage.write('students.json', JSON.stringify({ students: [] }), undefined);
    expect(tabValues(fake.apps, 'Students')).toBeUndefined();
    await storage.refreshViews();
    expect(tabValues(fake.apps, 'Students')).toBeDefined();
  });
  it('a wrong key is an AuthError', async () => {
    const fake = fakeAppsScript();
    const s = new AppsScriptStorage({ endpoint: fake.endpoint, key: 'wrong', fetchImpl: fake.fetchImpl });
    await expect(s.verify()).rejects.toBeInstanceOf(AuthError);
  });
  it('an address that is not this app gives a clear error', async () => {
    const f = (async () => new Response(JSON.stringify({ ok: true, app: 'something-else', protocol: 1 }), { status: 200 })) as unknown as typeof fetch;
    const s = new AppsScriptStorage({ endpoint: 'https://script.google.com/macros/s/abc/exec', key: 'k', fetchImpl: f });
    await expect(s.verify()).rejects.toThrow(/not a YOURS Tuition/i);
  });
});

describe('reading, writing and listing', () => {
  it('creates, reads back, updates with the version, and lists', async () => {
    const { storage } = mk();
    expect(await storage.read('students.json')).toBeNull();
    const first = await storage.write('students.json', '{"students":[]}', undefined);
    expect(first.sha).toBe('1');
    expect(await storage.read('students.json')).toEqual({ content: '{"students":[]}', sha: '1' });
    expect((await storage.write('students.json', '{"students":[{"id":"a"}]}', '1')).sha).toBe('2');
    await storage.write('visits/2026-10.json', '{"visits":[]}', undefined);
    expect(await storage.list('visits')).toEqual(['visits/2026-10.json']);
    expect(await storage.list('payments')).toEqual([]);
  });
  it('a stale version, or creating over an existing file, is a ConflictError', async () => {
    const { storage } = mk();
    await storage.write('meta.json', '{"schemaVersion":1,"nextReceiptNumber":1}', undefined);
    await expect(storage.write('meta.json', '{"schemaVersion":1,"nextReceiptNumber":2}', '9')).rejects.toBeInstanceOf(ConflictError);
    await expect(storage.write('meta.json', '{"schemaVersion":1,"nextReceiptNumber":2}', undefined)).rejects.toBeInstanceOf(ConflictError);
  });
  it('readAll returns every file and its version in one request', async () => {
    const { storage, fake } = mk();
    await storage.write('students.json', '{"students":[]}', undefined);
    await storage.write('teachers.json', '{"teachers":[]}', undefined);
    const before = fake.requests.length;
    const all = await storage.readAll();
    expect(fake.requests.length - before).toBe(1);
    expect(all).toEqual({ 'students.json': { content: '{"students":[]}', sha: '1' }, 'teachers.json': { content: '{"teachers":[]}', sha: '1' } });
  });
  it('updateJson works on top of it, retrying after a conflict', async () => {
    const { storage } = mk();
    await storage.write('meta.json', '{"schemaVersion":1,"nextReceiptNumber":5}', undefined);
    const real = storage.write.bind(storage);
    let first = true;
    storage.write = async (p, c, s) => {
      if (first) { first = false; await real(p, '{"schemaVersion":1,"nextReceiptNumber":10}', (await storage.read(p))!.sha); }
      return real(p, c, s);
    };
    await updateJson(storage, 'meta.json', { schemaVersion: 1, nextReceiptNumber: 0 }, (m) => ({ ...m, nextReceiptNumber: m.nextReceiptNumber + 1 }));
    expect(JSON.parse((await storage.read('meta.json'))!.content).nextReceiptNumber).toBe(11);
  });
});

describe('how requests are sent', () => {
  it('plain-text POST to the exact address: no custom headers (no pre-flight), no cookies, the key only in the body', async () => {
    const { storage, fake } = mk();
    await storage.read('students.json');
    const r = fake.requests.at(-1)!;
    expect(r.url).toBe(fake.endpoint);
    expect(r.init.method).toBe('POST');
    expect(r.init.credentials).toBe('omit');
    expect(r.init.redirect).toBe('follow');
    expect(Object.keys(r.init.headers as Record<string, string>)).toEqual(['Content-Type']);
    expect((r.init.headers as Record<string, string>)['Content-Type']).toMatch(/^text\/plain/);
    expect(r.body.key).toBe(fake.key);
    expect(r.url).not.toContain(fake.key);
  });
});

describe('when things go wrong', () => {
  const storageWith = (fetchImpl: typeof fetch) => new AppsScriptStorage({ endpoint: 'https://script.google.com/macros/s/abc/exec', key: 'k', fetchImpl });

  it('no connection is a NetworkError', async () => {
    const s = storageWith((async () => { throw new TypeError('Failed to fetch'); }) as unknown as typeof fetch);
    await expect(s.read('students.json')).rejects.toBeInstanceOf(NetworkError);
  });
  it('a web page instead of JSON (for example a Google sign-in page) explains the likely cause', async () => {
    const s = storageWith((async () => new Response('<html>Sign in</html>', { status: 200, headers: { 'content-type': 'text/html' } })) as unknown as typeof fetch);
    await expect(s.read('students.json')).rejects.toThrow(/Anyone/);
  });
  it('an HTTP error status is reported, not swallowed', async () => {
    const s = storageWith((async () => new Response('boom', { status: 500 })) as unknown as typeof fetch);
    await expect(s.read('students.json')).rejects.toThrow(/500/);
  });
  it('server errors become readable errors', async () => {
    for (const [code, re] of [['too_large', /too large/i], ['bad_request', /rejected/i], ['server_error', /problem/i], ['not_setup', /not set up/i]] as const) {
      const s = storageWith((async () => new Response(JSON.stringify({ ok: false, error: code }), { status: 200 })) as unknown as typeof fetch);
      await expect(s.read('students.json')).rejects.toThrow(re);
    }
  });
});

describe('the sync engine on top of it', () => {
  const phone = (fake: ReturnType<typeof fakeAppsScript>) => {
    const local = new MemoryLocalStore();
    const storage = new AppsScriptStorage({ endpoint: fake.endpoint, key: fake.key, fetchImpl: fake.fetchImpl });
    return { local, engine: new SyncEngine(local, storage), store: new DataStore(local), storage };
  };

  it('pulls everything with a single request', async () => {
    const fake = fakeAppsScript();
    const a = phone(fake);
    await a.store.saveStudent({ name: 'Asha', school: 'S', grade: '8', guardianName: '', guardianPhone: '', monthlyFee: 1000, joinedOn: '2026-01-01', active: true });
    await a.store.saveAttendance('2026-10-01', { x: 'P' });
    expect((await a.engine.push()).status).toBe('synced');

    const b = phone(fake);
    const before = fake.requests.length;
    await b.engine.pull();
    expect(fake.requests.length - before).toBe(1);
    expect((await b.store.students()).map((s) => s.name)).toEqual(['Asha']);
    expect((await b.store.attendance('2026-10')).days['2026-10-01']).toEqual({ x: 'P' });
  });

  it('two phones changing the same month at once keep both changes', async () => {
    const fake = fakeAppsScript();
    const a = phone(fake);
    const b = phone(fake);
    await a.store.saveAttendance('2026-10-01', { x: 'P' });
    await a.engine.sync();
    await b.engine.sync();
    await a.store.saveAttendance('2026-10-02', { x: 'A' });
    await b.store.saveAttendance('2026-10-03', { x: 'L' });
    expect((await a.engine.sync()).status).toBe('synced');
    expect((await b.engine.sync()).status).toBe('synced'); // conflict, merged, retried
    await a.engine.sync();
    const days = Object.keys((await a.store.attendance('2026-10')).days).sort();
    expect(days).toEqual(['2026-10-01', '2026-10-02', '2026-10-03']);
  });

  it('a wrong key reports an auth problem and keeps the changes on the phone', async () => {
    const fake = fakeAppsScript();
    const local = new MemoryLocalStore();
    const storage = new AppsScriptStorage({ endpoint: fake.endpoint, key: 'wrong', fetchImpl: fake.fetchImpl });
    const engine = new SyncEngine(local, storage);
    const store = new DataStore(local);
    await store.saveAttendance('2026-10-01', { x: 'P' });
    expect((await engine.push()).status).toBe('auth');
    expect(await engine.pendingCount()).toBe(1);
  });
});
