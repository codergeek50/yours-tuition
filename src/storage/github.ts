import { AuthError, ConflictError, NetworkError, NotPrivateError, type Storage, type StoredFile } from './types';

export interface GitHubOptions {
  owner: string;
  repo: string;
  token: string;
  fetchImpl?: typeof fetch;
}

const utf8ToB64 = (s: string) => {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
};
const b64ToUtf8 = (b: string) => new TextDecoder().decode(Uint8Array.from(atob(b.replace(/\n/g, '')), (c) => c.charCodeAt(0)));

export class GitHubStorage implements Storage {
  tokenExpiry: Date | null = null;
  private opts: GitHubOptions;

  constructor(opts: GitHubOptions) {
    this.opts = opts;
  }

  private get base() {
    return `https://api.github.com/repos/${this.opts.owner}/${this.opts.repo}`;
  }

  private async call(path: string, init: RequestInit = {}): Promise<Response> {
    const f = this.opts.fetchImpl ?? fetch;
    let res: Response;
    try {
      res = await f(`${this.base}${path}`, {
        ...init,
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${this.opts.token}`,
          'X-GitHub-Api-Version': '2022-11-28',
          ...(init.headers as Record<string, string> | undefined),
        },
      });
    } catch {
      throw new NetworkError();
    }
    const exp = res.headers.get('github-authentication-token-expiration');
    if (exp) {
      const d = new Date(exp.replace(' UTC', 'Z').replace(' ', 'T'));
      if (!Number.isNaN(d.getTime())) this.tokenExpiry = d;
    }
    if (res.status === 401 || res.status === 403) throw new AuthError();
    return res;
  }

  async verifyPrivate(): Promise<void> {
    const res = await this.call('');
    if (res.status === 404) throw new AuthError('Repository not found, or token has no access to it');
    const body = (await res.json()) as { private?: boolean };
    if (body.private !== true) throw new NotPrivateError();
  }

  async read(path: string): Promise<StoredFile | null> {
    const res = await this.call(`/contents/${path}`, { cache: 'no-store' });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`GitHub read failed (${res.status})`);
    const body = (await res.json()) as { content: string; sha: string; encoding?: string; size?: number };
    // Files over 1 MB come back without content; fetch them as a blob instead.
    if (body.encoding === 'none' || (body.content === '' && (body.size ?? 0) > 0)) {
      const blobRes = await this.call(`/git/blobs/${body.sha}`, { cache: 'no-store' });
      if (!blobRes.ok) throw new Error(`GitHub read failed (${blobRes.status})`);
      const blob = (await blobRes.json()) as { content: string };
      return { content: b64ToUtf8(blob.content), sha: body.sha };
    }
    return { content: b64ToUtf8(body.content), sha: body.sha };
  }

  async write(path: string, content: string, sha: string | undefined): Promise<{ sha: string }> {
    const res = await this.call(`/contents/${path}`, {
      method: 'PUT',
      body: JSON.stringify({ message: `update ${path}`, content: utf8ToB64(content), ...(sha ? { sha } : {}) }),
    });
    if (res.status === 409 || res.status === 422) throw new ConflictError();
    if (!res.ok) throw new Error(`GitHub write failed (${res.status})`);
    const body = (await res.json()) as { content: { sha: string } };
    return { sha: body.content.sha };
  }

  async list(dir: string): Promise<string[]> {
    const res = await this.call(`/contents/${dir}`, { cache: 'no-store' });
    if (res.status === 404) return [];
    if (!res.ok) throw new Error(`GitHub list failed (${res.status})`);
    const body = (await res.json()) as { path: string; type: string }[];
    return body.filter((e) => e.type === 'file').map((e) => e.path);
  }
}
