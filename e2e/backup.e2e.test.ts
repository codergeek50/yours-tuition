import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// @ts-expect-error plain JavaScript maintainer script
import { backupTo } from '../scripts/backup-data.mjs';
import { startTarget, phoneFor, type Target } from './support';
import { MemoryLocalStore } from '../src/sync/local';
import { DataStore } from '../src/data/store';

let target: Target;
let dir: string;

describe('the backup script', () => {
  beforeAll(async () => {
    target = await startTarget();
    dir = mkdtempSync(join(tmpdir(), 'yt-backup-'));
  });
  afterAll(async () => {
    await target.close();
    rmSync(dir, { recursive: true, force: true });
  });

  const endpoint = () => target.endpoint;

  it('writes one JSON file the app can restore, with every record', async () => {
    const a = phoneFor(target);
    const s = await a.store.saveStudent({ name: 'Backup Asha', school: 'S', grade: '8', guardianName: '', guardianPhone: '', monthlyFee: 1000, joinedOn: '2026-01-01', active: true });
    await a.store.saveAttendance('2026-10-01', { [s.id]: 'A' });
    await a.store.recordPayment({ studentId: s.id, forMonth: '2026-10', amount: 400, paidOn: '2026-10-03', mode: 'cash' });
    const t = await a.store.saveTeacher({ name: 'Backup Teacher', phone: '', subject: '', usualAmount: 500, active: true });
    await a.store.recordVisit({ teacherId: t.id, date: '2026-10-04', hours: 2, amount: 500, note: '', paid: false });
    expect((await a.engine.push()).status).toBe('synced');

    const result = await backupTo({ endpoint: endpoint(), key: target.key, outDir: dir, now: new Date('2026-10-05T10:00:00Z') });
    expect(result.file.endsWith('yours-tuition-backup-2026-10-05.json')).toBe(true);
    expect(result.count).toBeGreaterThanOrEqual(5);

    const restored = new DataStore(new MemoryLocalStore());
    await restored.importAll(readFileSync(result.file, 'utf8'));
    expect((await restored.students()).some((x) => x.name === 'Backup Asha')).toBe(true);
    expect((await restored.attendance('2026-10')).days['2026-10-01']![s.id]).toBe('A');
    expect((await restored.payments('2026-10'))[0]!.receipt.number).toBeGreaterThan(0);
    expect((await restored.pendingOverview()).count).toBeGreaterThanOrEqual(1);
  });

  it('keeps only the newest backups', async () => {
    for (const day of ['01', '02', '03', '04']) await backupTo({ endpoint: endpoint(), key: target.key, outDir: dir, keep: 2, now: new Date(`2026-11-${day}T10:00:00Z`) });
    const left = readdirSync(dir).filter((f) => f.startsWith('yours-tuition-backup-2026-11')).sort();
    expect(left).toEqual(['yours-tuition-backup-2026-11-03.json', 'yours-tuition-backup-2026-11-04.json']);
  });

  it('refuses a wrong key, a bad address, and never writes a file in those cases', async () => {
    const before = readdirSync(dir).length;
    await expect(backupTo({ endpoint: endpoint(), key: 'wrong', outDir: dir })).rejects.toThrow(/key was not accepted/);
    await expect(backupTo({ endpoint: 'https://evil.example.com/exec', key: 'k', outDir: dir })).rejects.toThrow(/valid web app address/);
    expect(readdirSync(dir).length).toBe(before);
  });
});
