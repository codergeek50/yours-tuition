import { DataStore } from '../data/store';
import { SyncEngine, type SyncStatus } from '../sync/engine';
import { IdbLocalStore, type LocalStore } from '../sync/local';
import type { Storage } from '../storage/types';

export interface SyncState { status: SyncStatus | 'syncing'; pending: number }

export interface Session {
  store: DataStore;
  engine: SyncEngine;
  local: LocalStore;
  getState(): SyncState;
  subscribe(fn: (s: SyncState) => void): () => void;
  syncNow(): Promise<void>;
  tokenExpiry(): Date | null;
  dispose(): void;
}

/** Wires the local working copy, the sync engine and background syncing together. */
export function createSession(
  remote: Storage & { tokenExpiry?: Date | null },
  local: LocalStore = new IdbLocalStore(),
  debounceMs = 1500,
): Session {
  const engine = new SyncEngine(local, remote);
  let state: SyncState = { status: 'synced', pending: 0 };
  const listeners = new Set<(s: SyncState) => void>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running = false;

  const emit = (next: SyncState) => {
    state = next;
    listeners.forEach((l) => l(state));
  };

  async function syncNow(): Promise<void> {
    if (running) return;
    running = true;
    emit({ ...state, status: 'syncing' });
    try {
      const res = await engine.sync();
      const pending = await engine.pendingCount();
      emit({ status: res.status, pending });
      // A change made while this run was in flight is still waiting: schedule another pass.
      if (res.status === 'synced' && pending > 0) schedule();
    } finally {
      running = false;
    }
  }

  const schedule = () => {
    void engine.pendingCount().then((pending) => emit({ ...state, pending }));
    clearTimeout(timer);
    timer = setTimeout(() => void syncNow(), debounceMs);
  };

  const onOnline = () => void syncNow();
  if (typeof window !== 'undefined') window.addEventListener('online', onOnline);

  return {
    store: new DataStore(local, schedule),
    engine,
    local,
    getState: () => state,
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    syncNow,
    tokenExpiry: () => remote.tokenExpiry ?? null,
    dispose() {
      clearTimeout(timer);
      if (typeof window !== 'undefined') window.removeEventListener('online', onOnline);
    },
  };
}
