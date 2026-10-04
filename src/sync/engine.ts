import { AuthError, ConflictError, NetworkError, type Storage } from '../storage/types';
import type { LocalStore } from './local';
import { mergeFile } from './merge';

export type SyncStatus = 'synced' | 'offline' | 'auth' | 'error';
export interface SyncResult { status: SyncStatus; pushed: number }

const ROOT_FILES = ['students.json', 'meta.json'];
const DIRS = ['attendance', 'payments'];
const MAX_MERGE_ATTEMPTS = 3;

/** meta.json goes first so a receipt number is never reused if the payments write fails. */
const pushOrder = (a: string, b: string) => Number(b === 'meta.json') - Number(a === 'meta.json') || a.localeCompare(b);

export class SyncEngine {
  private local: LocalStore;
  private remote: Storage;

  constructor(local: LocalStore, remote: Storage) {
    this.local = local;
    this.remote = remote;
  }

  async pendingCount(): Promise<number> {
    return Object.values(await this.local.all()).filter((e) => e.dirty).length;
  }

  /** Refresh every clean local file from the data repo. Dirty files are left alone. */
  async pull(): Promise<void> {
    const listed = await Promise.all(DIRS.map((d) => this.remote.list(d)));
    const paths = [...ROOT_FILES, ...listed.flat()];
    await Promise.all(
      paths.map(async (path) => {
        const existing = await this.local.get(path);
        if (existing?.dirty) return;
        const file = await this.remote.read(path);
        if (!file) return;
        // Decided atomically: an edit made while we were waiting on the network must win.
        await this.local.update(path, (cur) => (cur?.dirty ? undefined : { content: file.content, sha: file.sha, dirty: false }));
      }),
    );
  }

  /** Write every dirty file to the data repo, merging on conflict. */
  async push(): Promise<SyncResult> {
    const all = await this.local.all();
    const dirty = Object.keys(all).filter((p) => all[p]!.dirty).sort(pushOrder);
    let pushed = 0;
    for (const path of dirty) {
      try {
        await this.pushOne(path);
        pushed++;
      } catch (e) {
        if (e instanceof NetworkError) return { status: 'offline', pushed };
        if (e instanceof AuthError) return { status: 'auth', pushed };
        return { status: 'error', pushed };
      }
    }
    return { status: 'synced', pushed };
  }

  private async pushOne(path: string): Promise<void> {
    let entry = (await this.local.get(path))!;
    for (let attempt = 0; attempt < MAX_MERGE_ATTEMPTS; attempt++) {
      try {
        const sent = entry.content;
        const { sha } = await this.remote.write(path, sent, entry.sha);
        // If the file changed while the upload was in flight, keep the newer text and upload it next time.
        await this.local.update(path, (cur) =>
          cur && cur.content !== sent ? { content: cur.content, sha, dirty: true } : { content: sent, sha, dirty: false },
        );
        return;
      } catch (e) {
        if (!(e instanceof ConflictError)) throw e;
        const remote = await this.remote.read(path);
        let merged = entry.content;
        const updated = await this.local.update(path, (cur) => {
          const base = cur?.content ?? entry.content;
          merged = remote ? mergeFile(path, remote.content, base) : base;
          return { content: merged, sha: remote?.sha, dirty: true };
        });
        entry = updated ?? { content: merged, sha: remote?.sha, dirty: true };
      }
    }
    throw new ConflictError();
  }

  /** Pull then push, reporting the combined outcome. */
  async sync(): Promise<SyncResult> {
    try {
      const pushed = await this.push();
      if (pushed.status !== 'synced') return pushed;
      await this.pull();
      return pushed;
    } catch (e) {
      if (e instanceof NetworkError) return { status: 'offline', pushed: 0 };
      if (e instanceof AuthError) return { status: 'auth', pushed: 0 };
      return { status: 'error', pushed: 0 };
    }
  }
}
