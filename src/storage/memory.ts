import { ConflictError, type Storage, type StoredFile } from './types';

export class MemoryStorage implements Storage {
  private files = new Map<string, StoredFile>();
  private counter = 0;

  async read(path: string) {
    return this.files.get(path) ?? null;
  }
  async write(path: string, content: string, sha: string | undefined) {
    const existing = this.files.get(path);
    if ((existing?.sha ?? undefined) !== sha) throw new ConflictError();
    const next = `sha${++this.counter}`;
    this.files.set(path, { content, sha: next });
    return { sha: next };
  }
  async list(dir: string) {
    return [...this.files.keys()].filter((p) => p.startsWith(`${dir}/`) && !p.slice(dir.length + 1).includes('/'));
  }
}
