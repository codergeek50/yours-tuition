import { describe, it, expect, vi } from 'vitest';
import { MemoryStorage } from './memory';
import { GitHubStorage } from './github';
import { ConflictError, NotPrivateError, AuthError, updateJson } from './types';

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

function mockFetch(routes: Record<string, (init?: RequestInit) => Response>) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    const key = `${init?.method ?? 'GET'} ${url.replace('https://api.github.com', '')}`;
    const handler = routes[key];
    if (!handler) throw new Error(`unmocked ${key}`);
    return handler(init);
  }) as unknown as typeof fetch;
}
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
const b64 = (s: string) => btoa(unescape(encodeURIComponent(s)));

describe('GitHubStorage', () => {
  const mk = (routes: Record<string, (init?: RequestInit) => Response>) =>
    new GitHubStorage({ owner: 'me', repo: 'data', token: 'tok', fetchImpl: mockFetch(routes) });

  it('reads a file, decoding base64 with unicode', async () => {
    const g = mk({ 'GET /repos/me/data/contents/a.json': () => json({ content: b64('{"n":"₹"}'), sha: 'abc' }) });
    expect(await g.read('a.json')).toEqual({ content: '{"n":"₹"}', sha: 'abc' });
  });
  it('returns null on 404', async () => {
    const g = mk({ 'GET /repos/me/data/contents/a.json': () => json({ message: 'Not Found' }, 404) });
    expect(await g.read('a.json')).toBeNull();
  });
  it('writes with the sha and returns the new sha', async () => {
    let body: any;
    const g = mk({ 'PUT /repos/me/data/contents/a.json': (init) => { body = JSON.parse(init!.body as string); return json({ content: { sha: 'new' } }); } });
    expect(await g.write('a.json', 'hello', 'old')).toEqual({ sha: 'new' });
    expect(body.sha).toBe('old');
    expect(atob(body.content)).toBe('hello');
  });
  it('maps 409 and 422 to ConflictError', async () => {
    for (const status of [409, 422]) {
      const g = mk({ 'PUT /repos/me/data/contents/a.json': () => json({ message: 'sha mismatch' }, status) });
      await expect(g.write('a.json', 'x', 'old')).rejects.toBeInstanceOf(ConflictError);
    }
  });
  it('maps 401 and 403 to AuthError', async () => {
    const g = mk({ 'GET /repos/me/data/contents/a.json': () => json({ message: 'Bad credentials' }, 401) });
    await expect(g.read('a.json')).rejects.toBeInstanceOf(AuthError);
  });
  it('lists a directory, and returns [] for a missing one', async () => {
    const g = mk({
      'GET /repos/me/data/contents/attendance': () => json([{ path: 'attendance/2026-10.json', type: 'file' }, { path: 'attendance/x', type: 'dir' }]),
      'GET /repos/me/data/contents/payments': () => json({ message: 'Not Found' }, 404),
    });
    expect(await g.list('attendance')).toEqual(['attendance/2026-10.json']);
    expect(await g.list('payments')).toEqual([]);
  });
  it('refuses a public repo', async () => {
    const g = mk({ 'GET /repos/me/data': () => json({ private: false }) });
    await expect(g.verifyPrivate()).rejects.toBeInstanceOf(NotPrivateError);
  });
  it('accepts a private repo and sends the token', async () => {
    const f = mockFetch({ 'GET /repos/me/data': () => json({ private: true }, 200, { 'github-authentication-token-expiration': '2027-01-01 00:00:00 UTC' }) });
    const g = new GitHubStorage({ owner: 'me', repo: 'data', token: 'tok', fetchImpl: f });
    await g.verifyPrivate();
    expect((f as any).mock.calls[0][1].headers.Authorization).toBe('Bearer tok');
    expect(g.tokenExpiry?.getUTCFullYear()).toBe(2027);
  });
});

describe('GitHubStorage large files', () => {
  it('reads a file over 1 MB through the blob endpoint', async () => {
    const g = new GitHubStorage({
      owner: 'me', repo: 'data', token: 'tok',
      fetchImpl: mockFetch({
        'GET /repos/me/data/contents/big.json': () => json({ content: '', encoding: 'none', size: 2_000_000, sha: 'abc' }),
        'GET /repos/me/data/git/blobs/abc': () => json({ content: b64('{"big":true}'), encoding: 'base64' }),
      }),
    });
    expect(await g.read('big.json')).toEqual({ content: '{"big":true}', sha: 'abc' });
  });
});
