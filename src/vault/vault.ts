/** PIN-encrypted storage for the GitHub token. The token is never stored or logged in plain text. */

export interface VaultRecord {
  owner: string;
  repo: string;
  /** 'device': locked by a non-extractable key kept on this phone (no PIN). 'pin': locked by the PIN. */
  mode?: 'pin' | 'device';
  salt?: string; // base64, PIN mode only
  /** PBKDF2 iterations used; absent on records made before this was recorded (310,000). */
  iter?: number;
  iv: string; // base64
  ct: string; // base64 AES-GCM ciphertext
}

const KEY = 'yt.vault';
const ITERATIONS = 600_000;
const LEGACY_ITERATIONS = 310_000;

const toB64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));
const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function deriveKey(pin: string, salt: BufferSource, iterations: number): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export function isValidPin(pin: string): boolean {
  return /^\d{4,8}$/.test(pin);
}

export async function sealToken(token: string, pin: string, repo: { owner: string; repo: string }): Promise<VaultRecord> {
  if (!isValidPin(pin)) throw new Error('PIN must be 4 to 8 digits');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(pin, salt, ITERATIONS);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(token)));
  return { owner: repo.owner, repo: repo.repo, mode: 'pin', iter: ITERATIONS, salt: toB64(salt), iv: toB64(iv), ct: toB64(ct) };
}

export async function openToken(rec: VaultRecord, pin: string): Promise<string> {
  try {
    const key = await deriveKey(pin, fromB64(rec.salt ?? ''), rec.iter ?? LEGACY_ITERATIONS);
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(rec.iv) }, key, fromB64(rec.ct));
    return new TextDecoder().decode(pt);
  } catch {
    throw new Error('Wrong PIN');
  }
}

export function saveVault(rec: VaultRecord): void {
  localStorage.setItem(KEY, JSON.stringify(rec));
}

export function loadVault(): VaultRecord | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const rec = JSON.parse(raw) as VaultRecord;
    return rec && typeof rec.ct === 'string' && typeof rec.iv === 'string' ? rec : null;
  } catch {
    return null;
  }
}

export function clearVault(): void {
  localStorage.removeItem(KEY);
}

export function daysUntilExpiry(expiry: Date | null, now: Date = new Date()): number | null {
  if (!expiry) return null;
  return Math.floor((expiry.getTime() - now.getTime()) / 86_400_000);
}

export const needsPin = (rec: VaultRecord) => rec.mode !== 'device';

// ---- device-key mode: the token is encrypted with a key the browser will not let anyone read out.

const KEYDB = 'yours-tuition-keys';

function keyDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(KEYDB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore('k');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function keyOp<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await keyDb();
  return new Promise((resolve, reject) => {
    const req = fn(db.transaction('k', mode).objectStore('k'));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function sealTokenDevice(token: string, repo: { owner: string; repo: string }): Promise<VaultRecord> {
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  await keyOp('readwrite', (s) => s.put(key, 'device'));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(token)));
  return { owner: repo.owner, repo: repo.repo, mode: 'device', iv: toB64(iv), ct: toB64(ct) };
}

export async function openTokenDevice(rec: VaultRecord): Promise<string> {
  const key = await keyOp<CryptoKey | undefined>('readonly', (s) => s.get('device'));
  if (!key) throw new Error('This phone no longer has the key for the saved token. Reconnect.');
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(rec.iv) }, key, fromB64(rec.ct));
  return new TextDecoder().decode(pt);
}

export async function clearDeviceKey(): Promise<void> {
  await keyOp('readwrite', (s) => s.delete('device'));
}

// ---- setup link: lets the person who owns the data set up the teacher's phone without typing a token.
// The details travel in the URL fragment, which browsers never send to any server.

export function encodeSetupLink(appUrl: string, repo: string, token: string): string {
  const payload = btoa(JSON.stringify({ r: repo, t: token })).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${appUrl.split('#')[0]}#setup=${payload}`;
}

export function decodeSetupLink(hash: string): { repo: string; token: string } | null {
  const m = /^#setup=([A-Za-z0-9_-]+)$/.exec(hash);
  if (!m) return null;
  try {
    const b64 = m[1]!.replace(/-/g, '+').replace(/_/g, '/');
    const parsed = JSON.parse(atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4))) as { r?: unknown; t?: unknown };
    return typeof parsed.r === 'string' && typeof parsed.t === 'string' && parsed.r && parsed.t ? { repo: parsed.r, token: parsed.t } : null;
  } catch {
    return null;
  }
}
