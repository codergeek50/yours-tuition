import { describe, it, expect } from 'vitest';
import { mergeFile } from './merge';

const e = (id: string, o: object = {}) => ({ id, date: '2026-10-05', label: 'Rent', amount: 4000, deleted: false, updatedAt: '2026-10-05T10:00:00Z', ...o });
const file = (...expenses: object[]) => JSON.stringify({ expenses });
const merge = (remote: string, local: string) => JSON.parse(mergeFile('expenses/2026-10.json', remote, local)).expenses as { id: string; amount: number; deleted: boolean }[];

describe('merging expenses files', () => {
  it('keeps expenses added on either side', () => {
    expect(merge(file(e('a')), file(e('b'))).map((x) => x.id).sort()).toEqual(['a', 'b']);
  });
  it('the newer edit of the same expense wins', () => {
    const out = merge(file(e('a', { amount: 4000 })), file(e('a', { amount: 4500, updatedAt: '2026-10-06T10:00:00Z' })));
    expect(out).toHaveLength(1);
    expect(out[0]!.amount).toBe(4500);
  });
  it('a deleted expense stays deleted even if the other side edited it later', () => {
    const out = merge(file(e('a', { deleted: true })), file(e('a', { amount: 1, updatedAt: '2027-01-01T00:00:00Z' })));
    expect(out[0]!.deleted).toBe(true);
    const other = merge(file(e('a', { amount: 1, updatedAt: '2027-01-01T00:00:00Z' })), file(e('a', { deleted: true })));
    expect(other[0]!.deleted).toBe(true);
  });
});
