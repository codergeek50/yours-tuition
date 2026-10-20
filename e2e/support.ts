import { AppsScriptStorage } from '../src/storage/appsscript';
import { MemoryLocalStore } from '../src/sync/local';
import { SyncEngine } from '../src/sync/engine';
import { DataStore } from '../src/data/store';
// @ts-expect-error plain JavaScript helper, shared with the fake Apps Script tests
import { startFakeServer } from './fake-server.mjs';

export interface Target {
  endpoint: string;
  key: string;
  /** true when talking to a real deployed Apps Script web app (set E2E_ENDPOINT and E2E_KEY). */
  real: boolean;
  /** The in-memory Google behind the local server (not set when real). Lets tests look at the Drive files and Sheet. */
  apps?: unknown;
  close: () => Promise<void>;
}

/**
 * By default the end-to-end tests run over real HTTP against a local server that runs the real Code.gs on a fake of Google.
 * Set E2E_ENDPOINT and E2E_KEY to run the same tests against the real deployed web app instead
 * (use a throwaway deployment: the tests write real files).
 */
export async function startTarget(): Promise<Target> {
  if (process.env.E2E_ENDPOINT && process.env.E2E_KEY) {
    return { endpoint: process.env.E2E_ENDPOINT, key: process.env.E2E_KEY, real: true, close: async () => {} };
  }
  const s = await startFakeServer();
  return { endpoint: s.endpoint, key: s.key, real: false, apps: s.apps, close: s.close };
}

export function phoneFor(t: Target) {
  const local = new MemoryLocalStore();
  const storage = new AppsScriptStorage({ endpoint: t.endpoint, key: t.key, allowLocalTestServer: !t.real });
  return { local, storage, engine: new SyncEngine(local, storage), store: new DataStore(local) };
}
