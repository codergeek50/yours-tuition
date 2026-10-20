import { AuthError, ConflictError, NetworkError, type Storage, type StoredFile } from './types';

/** The only kind of address the app will talk to: a published Google Apps Script web app. */
const ENDPOINT_RE = /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/;
const SHEET_RE = /^https:\/\/docs\.google\.com\/spreadsheets\/d\/[A-Za-z0-9_-]+(\/[A-Za-z0-9_\-/?=&#.]*)?$/;
const LOCAL_TEST_RE = /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/[A-Za-z0-9_\-/]*$/;

export function isValidEndpoint(url: string): boolean {
  return ENDPOINT_RE.test(url);
}

export interface AppsScriptOptions {
  endpoint: string;
  key: string;
  fetchImpl?: typeof fetch;
  /** Tests only: also allow a web server on this computer. Never set in the app. */
  allowLocalTestServer?: boolean;
}

type Reply = { ok: boolean; error?: string; [k: string]: unknown };

/** Storage on the owner's Google Drive through their own Apps Script web app (see apps-script/Code.gs). */
export class AppsScriptStorage implements Storage {
  sheetUrl = '';
  private opts: AppsScriptOptions;

  constructor(opts: AppsScriptOptions) {
    if (!isValidEndpoint(opts.endpoint) && !(opts.allowLocalTestServer && LOCAL_TEST_RE.test(opts.endpoint))) {
      throw new Error('That is not a valid web app address. It should look like https://script.google.com/macros/s/.../exec');
    }
    this.opts = opts;
  }

  private async call(body: Record<string, unknown>): Promise<Reply> {
    const f = this.opts.fetchImpl ?? fetch;
    let res: Response;
    try {
      // Plain-text POST, no custom headers and no cookies: the browser sends it without a pre-flight request.
      res = await f(this.opts.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ key: this.opts.key, ...body }),
        redirect: 'follow',
        credentials: 'omit',
        cache: 'no-store',
      });
    } catch {
      throw new NetworkError();
    }
    if (!res.ok) throw new Error(`The data service answered with an error (${res.status}).`);
    let reply: Reply;
    try {
      reply = (await res.json()) as Reply;
    } catch {
      throw new Error('The data service did not answer as expected. Check that the web app is deployed with access set to "Anyone".');
    }
    if (reply.ok) return reply;
    switch (reply.error) {
      case 'auth':
        throw new AuthError('The secret key was not accepted.');
      case 'conflict':
        throw new ConflictError();
      case 'not_setup':
        throw new Error('The data service is not set up yet. Run setup in the script first.');
      case 'too_large':
        throw new Error('A file is too large for the data service.');
      case 'bad_request':
        throw new Error('The data service rejected the request.');
      default:
        throw new Error('The data service had a problem. Try again in a moment.');
    }
  }

  /** Checks the address and key. Throws AuthError for a wrong key. */
  async verify(): Promise<void> {
    const r = await this.call({ action: 'ping' });
    if (r.app !== 'yours-tuition' || r.protocol !== 1) throw new Error('That address is not a YOURS Tuition data service.');
    // Shown as a link in More, so only a real Google Sheets address is kept.
    this.sheetUrl = typeof r.sheetUrl === 'string' && SHEET_RE.test(r.sheetUrl) ? r.sheetUrl : '';
  }

  async read(path: string): Promise<StoredFile | null> {
    const r = await this.call({ action: 'read', path });
    return r.found ? { content: String(r.content), sha: String(r.sha) } : null;
  }

  async write(path: string, content: string, sha: string | undefined): Promise<{ sha: string }> {
    const r = await this.call({ action: 'write', path, content, sha: sha ?? '' });
    return { sha: String(r.sha) };
  }

  async list(dir: string): Promise<string[]> {
    const r = await this.call({ action: 'list', dir });
    return (r.paths as string[]) ?? [];
  }

  /** Asks the service to rebuild the readable spreadsheet tabs for files saved since the last rebuild. Not needed for the data itself. */
  async refreshViews(): Promise<void> {
    await this.call({ action: 'refresh' });
  }

  /** Every file and its version in one request, so opening the app on a slow connection is one round trip. */
  async readAll(): Promise<Record<string, StoredFile>> {
    const r = await this.call({ action: 'snapshot' });
    return (r.files as Record<string, StoredFile>) ?? {};
  }
}
