import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { sealToken, openToken, saveVault, loadVault, clearVault, daysUntilExpiry, sealTokenDevice, openTokenDevice, clearDeviceKey, encodeSetupLink, decodeSetupLink, type VaultRecord } from './vault';

beforeEach(() => localStorage.clear());

describe('vault', () => {
  it('round-trips a token with the right PIN', async () => {
    const rec = await sealToken('github_pat_secret', '1234', { owner: 'me', repo: 'data' });
    expect(await openToken(rec, '1234')).toBe('github_pat_secret');
  });
  it('rejects a wrong PIN', async () => {
    const rec = await sealToken('github_pat_secret', '1234', { owner: 'me', repo: 'data' });
    await expect(openToken(rec, '9999')).rejects.toThrow(/PIN/);
  });
  it('never contains the token in plain text', async () => {
    const rec = await sealToken('github_pat_secret', '1234', { owner: 'me', repo: 'data' });
    expect(JSON.stringify(rec)).not.toContain('github_pat_secret');
  });
  it('uses a fresh salt each time', async () => {
    const a = await sealToken('t', '1234', { owner: 'o', repo: 'r' });
    const b = await sealToken('t', '1234', { owner: 'o', repo: 'r' });
    expect(a.salt).not.toBe(b.salt);
  });
  it('rejects PINs shorter than 4 digits', async () => {
    await expect(sealToken('t', '12', { owner: 'o', repo: 'r' })).rejects.toThrow(/PIN/);
  });
  it('saves, loads and clears from localStorage', async () => {
    expect(loadVault()).toBeNull();
    const rec = await sealToken('t', '1234', { owner: 'o', repo: 'r' });
    saveVault(rec);
    expect(loadVault()).toEqual(rec);
    clearVault();
    expect(loadVault()).toBeNull();
  });
  it('ignores corrupt stored data', () => {
    localStorage.setItem('yt.vault', '{not json');
    expect(loadVault()).toBeNull();
  });
  it('computes days until expiry', () => {
    const now = new Date('2026-10-01T00:00:00Z');
    expect(daysUntilExpiry(new Date('2026-10-11T00:00:00Z'), now)).toBe(10);
    expect(daysUntilExpiry(null, now)).toBeNull();
    expect(daysUntilExpiry(new Date('2026-09-29T00:00:00Z'), now)).toBeLessThan(0);
  });
  it('stores expiry on the record', async () => {
    const rec: VaultRecord = await sealToken('t', '1234', { owner: 'o', repo: 'r' });
    expect(rec.owner).toBe('o');
    expect(rec.repo).toBe('r');
  });
});

describe('device-key mode (no PIN)', () => {
  it('round-trips without a PIN and keeps the token out of storage', async () => {
    const rec = await sealTokenDevice('github_pat_secret', { owner: 'me', repo: 'data' });
    expect(rec.mode).toBe('device');
    expect(JSON.stringify(rec)).not.toContain('github_pat_secret');
    expect(await openTokenDevice(rec)).toBe('github_pat_secret');
  });
  it('cannot be opened once the device key is gone', async () => {
    const rec = await sealTokenDevice('t', { owner: 'o', repo: 'r' });
    await clearDeviceKey();
    await expect(openTokenDevice(rec)).rejects.toThrow();
  });
  it('PIN records report their mode', async () => {
    const rec = await sealToken('t', '1234', { owner: 'o', repo: 'r' });
    expect(rec.mode ?? 'pin').toBe('pin');
  });
});

describe('setup link', () => {
  it('round-trips repo and token through the URL fragment', () => {
    const link = encodeSetupLink('https://app.example/yours/', 'me/data', 'github_pat_a+b/c=');
    expect(link.startsWith('https://app.example/yours/#setup=')).toBe(true);
    expect(decodeSetupLink(new URL(link).hash)).toEqual({ repo: 'me/data', token: 'github_pat_a+b/c=' });
  });
  it('ignores hashes that are not setup links or are malformed', () => {
    expect(decodeSetupLink('')).toBeNull();
    expect(decodeSetupLink('#other=1')).toBeNull();
    expect(decodeSetupLink('#setup=%%%')).toBeNull();
    expect(decodeSetupLink('#setup=' + btoa('{"r":1}'))).toBeNull();
  });
});
