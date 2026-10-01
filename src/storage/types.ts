export interface StoredFile { content: string; sha: string }

/** Everything the app needs from a backing store. The UI never talks to GitHub directly. */
export interface Storage {
  read(path: string): Promise<StoredFile | null>;
  /** sha is the version being replaced; undefined means "create". Throws ConflictError when stale. */
  write(path: string, content: string, sha: string | undefined): Promise<{ sha: string }>;
  /** Full paths of files directly inside dir. Missing dir gives []. */
  list(dir: string): Promise<string[]>;
}

export class ConflictError extends Error { constructor(m = 'File changed elsewhere') { super(m); this.name = 'ConflictError'; } }
export class AuthError extends Error { constructor(m = 'Token rejected or expired') { super(m); this.name = 'AuthError'; } }
export class NotPrivateError extends Error { constructor(m = 'Data repository is not private') { super(m); this.name = 'NotPrivateError'; } }
export class NetworkError extends Error { constructor(m = 'Network unavailable') { super(m); this.name = 'NetworkError'; } }

/** Read-modify-write a JSON file, re-reading and retrying when another write wins. */
export async function updateJson<T>(storage: Storage, path: string, fallback: T, fn: (current: T) => T, attempts = 4): Promise<T> {
  for (let i = 0; i < attempts; i++) {
    const existing = await storage.read(path);
    const current = existing ? (JSON.parse(existing.content) as T) : fallback;
    const next = fn(current);
    try {
      await storage.write(path, JSON.stringify(next, null, 2), existing?.sha);
      return next;
    } catch (e) {
      if (!(e instanceof ConflictError) || i === attempts - 1) throw e;
    }
  }
  throw new ConflictError();
}
