import { describe, it, expect } from 'vitest';
import { mergeFile } from './merge';

const file = (o: object) => JSON.stringify(o);

describe('merging attendance files with holidays', () => {
  it('keeps holidays from both sides', () => {
    const merged = JSON.parse(mergeFile('attendance/2026-10.json', file({ days: {}, holidays: { '2026-10-02': 'Gandhi Jayanti' } }), file({ days: {}, holidays: { '2026-10-20': 'Diwali' } })));
    expect(merged.holidays).toEqual({ '2026-10-02': 'Gandhi Jayanti', '2026-10-20': 'Diwali' });
  });

  it('this device wins for the same date, including removing it', () => {
    const remote = file({ days: {}, holidays: { '2026-10-20': 'Diwali' } });
    const renamed = JSON.parse(mergeFile('attendance/2026-10.json', remote, file({ days: {}, holidays: { '2026-10-20': 'Deepavali' } })));
    expect(renamed.holidays['2026-10-20']).toBe('Deepavali');
    const removed = JSON.parse(mergeFile('attendance/2026-10.json', remote, file({ days: {}, holidays: { '2026-10-20': '' } })));
    expect(removed.holidays['2026-10-20']).toBe('');
  });

  it('files without holidays still merge as before, and add none', () => {
    const merged = JSON.parse(mergeFile('attendance/2026-10.json', file({ days: { '2026-10-01': { a: 'P' } } }), file({ days: { '2026-10-02': { a: 'A' } } })));
    expect(Object.keys(merged.days)).toEqual(['2026-10-01', '2026-10-02']);
    expect('holidays' in merged).toBe(false);
  });

  it('ignores unsafe keys in holidays', () => {
    const merged = JSON.parse(mergeFile('attendance/2026-10.json', file({ days: {} }), '{"days":{},"holidays":{"__proto__":"x","2026-10-20":"Diwali"}}'));
    expect(Object.keys(merged.holidays)).toEqual(['2026-10-20']);
  });
});
