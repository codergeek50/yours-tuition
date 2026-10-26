import { describe, it, expect } from 'vitest';
import { DataStore } from './store';
import { MemoryLocalStore } from '../sync/local';

const mk = () => new DataStore(new MemoryLocalStore());

describe('holidays', () => {
  it('a holiday is saved with its name, defaulting to "Holiday"', async () => {
    const store = mk();
    await store.setHoliday('2026-10-20', 'Diwali');
    await store.setHoliday('2026-10-21', '  ');
    expect(await store.holidays('2026-10')).toEqual({ '2026-10-20': 'Diwali', '2026-10-21': 'Holiday' });
  });

  it('keeps a holiday name to 60 letters', async () => {
    const store = mk();
    await store.setHoliday('2026-10-20', 'x'.repeat(200));
    expect((await store.holidays('2026-10'))['2026-10-20']).toHaveLength(60);
  });

  it('refuses a date that is not real', async () => {
    await expect(mk().setHoliday('2026-13-40', 'x')).rejects.toThrow(/date/i);
  });

  it('removing a holiday leaves a marker, so a sync cannot bring it back', async () => {
    const store = mk();
    await store.setHoliday('2026-10-20', 'Diwali');
    await store.clearHoliday('2026-10-20');
    expect(await store.holidays('2026-10')).toEqual({});
    expect((await store.attendance('2026-10')).holidays?.['2026-10-20']).toBe('');
  });

  it('saving attendance keeps the holidays of that month', async () => {
    const store = mk();
    await store.setHoliday('2026-10-20', 'Diwali');
    await store.saveAttendance('2026-10-19', { a: 'P' });
    expect(await store.holidays('2026-10')).toEqual({ '2026-10-20': 'Diwali' });
    expect((await store.attendance('2026-10')).days['2026-10-19']).toEqual({ a: 'P' });
  });

  it('the attendance range includes holiday dates, even with no marks, in date order', async () => {
    const store = mk();
    await store.saveAttendance('2026-10-19', { a: 'P' });
    await store.setHoliday('2026-10-20', 'Diwali');
    await store.saveAttendance('2026-10-21', { a: 'A' });
    const days = await store.attendanceRange('2026-10-01', '2026-10-31');
    expect(days.map((d) => [d.date, d.holiday ?? ''])).toEqual([['2026-10-19', ''], ['2026-10-20', 'Diwali'], ['2026-10-21', '']]);
    expect(days[1]!.marks).toEqual({});
  });

  it('a removed holiday no longer shows in the range', async () => {
    const store = mk();
    await store.setHoliday('2026-10-20', 'Diwali');
    await store.clearHoliday('2026-10-20');
    expect(await store.attendanceRange('2026-10-01', '2026-10-31')).toEqual([]);
  });
});
