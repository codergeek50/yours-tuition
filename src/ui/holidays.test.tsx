import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/preact';
import { DataStore } from '../data/store';
import { MemoryLocalStore } from '../sync/local';
import { monthOf, todayISO } from '../domain/dates';
import { AttendanceScreen } from './AttendanceScreen';
import { ReportsScreen } from './ReportsScreen';
import { HomeScreen } from './HomeScreen';

afterEach(cleanup);

const today = todayISO();
const newStore = () => new DataStore(new MemoryLocalStore());
const asha = { name: 'Asha', school: '', grade: 'III', guardianName: '', guardianPhone: '', monthlyFee: 600, joinedOn: '2026-01-01', active: true };

describe('holidays elsewhere', () => {
  it('Reports shows H for the holiday and does not count it', async () => {
    const store = newStore();
    await store.saveStudent(asha);
    await store.setHoliday(today, 'Diwali');
    render(<ReportsScreen store={store} />);
    const cell = await screen.findByTitle('Holiday: Diwali');
    expect(cell.textContent).toBe('H');
    expect(screen.getAllByText('-').length).toBeGreaterThan(0); // no percentage when nothing was counted
  });

  it('Home says it is a holiday today instead of asking for attendance', async () => {
    const store = newStore();
    await store.saveStudent(asha);
    await store.setHoliday(today, 'Diwali');
    render(<HomeScreen store={store} settings={{ teacherName: '' } as never} goto={() => {}} />);
    await screen.findAllByText(/Holiday: Diwali/);
    expect(screen.queryByText('Attendance not taken yet')).toBeNull();
  });
});

describe('marking a day as a holiday on the attendance screen', () => {
  it('Mark as holiday asks for a name, saves it and hides the student list for that day', async () => {
    const store = newStore();
    await store.saveStudent(asha);
    render(<AttendanceScreen store={store} />);
    await screen.findByText('Asha');
    fireEvent.click(screen.getByRole('button', { name: 'Mark as holiday' }));
    fireEvent.input(screen.getByLabelText('Holiday name'), { target: { value: 'Diwali' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save holiday' }));
    await screen.findByText(/Holiday: Diwali/);
    expect(screen.queryByText('Asha')).toBeNull();
    expect(await store.holidays(monthOf(today))).toEqual({ [today]: 'Diwali' });
  });

  it('Remove holiday brings the students back and clears it', async () => {
    const store = newStore();
    await store.saveStudent(asha);
    await store.setHoliday(today, 'Diwali');
    render(<AttendanceScreen store={store} />);
    await screen.findByText(/Holiday: Diwali/);
    fireEvent.click(screen.getByRole('button', { name: 'Remove holiday' }));
    await screen.findByText('Asha');
    expect(await store.holidays(monthOf(today))).toEqual({});
  });
});
