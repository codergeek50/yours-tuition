export interface LocalEntry {
  content: string;
  /** sha of the remote version this content was based on; undefined if never synced */
  sha?: string;
  /** true when content has changes not yet written to the data repo */
  dirty: boolean;
}

export interface LocalStore {
  get(path: string): Promise<LocalEntry | undefined>;
  put(path: string, entry: LocalEntry): Promise<void>;
  all(): Promise<Record<string, LocalEntry>>;
  clear(): Promise<void>;
}

export class MemoryLocalStore implements LocalStore {
  private m = new Map<string, LocalEntry>();
  async get(path: string) { return this.m.get(path); }
  async put(path: string, entry: LocalEntry) { this.m.set(path, { ...entry }); }
  async all() { return Object.fromEntries(this.m); }
  async clear() { this.m.clear(); }
}

const STORE = 'files';

/** IndexedDB-backed store: the app's working copy, survives offline and reloads. */
export class IdbLocalStore implements LocalStore {
  private dbp: Promise<IDBDatabase> | null = null;
  private name: string;

  constructor(name = 'yours-tuition') {
    this.name = name;
  }

  private db(): Promise<IDBDatabase> {
    this.dbp ??= new Promise((resolve, reject) => {
      const req = indexedDB.open(this.name, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return this.dbp;
  }

  private async run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const db = await this.db();
    return new Promise((resolve, reject) => {
      const req = fn(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  get(path: string) { return this.run<LocalEntry | undefined>('readonly', (s) => s.get(path)); }
  async put(path: string, entry: LocalEntry) { await this.run('readwrite', (s) => s.put(entry, path)); }
  async clear() { await this.run('readwrite', (s) => s.clear()); }
  async all() {
    const db = await this.db();
    return new Promise<Record<string, LocalEntry>>((resolve, reject) => {
      const out: Record<string, LocalEntry> = {};
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).openCursor();
      req.onsuccess = () => {
        const cur = req.result;
        if (cur) { out[String(cur.key)] = cur.value as LocalEntry; cur.continue(); } else resolve(out);
      };
      req.onerror = () => reject(req.error);
    });
  }
}
