import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/preact';
import { DataStore } from '../data/store';
import { MemoryLocalStore } from '../sync/local';
import { todayISO, monthOf } from '../domain/dates';
import { StudentsScreen } from './StudentsScreen';
import { AttendanceScreen } from './AttendanceScreen';
import { FeesScreen } from './FeesScreen';

afterEach(cleanup);

const newStore = () => new DataStore(new MemoryLocalStore());
const seed = async (store: DataStore) => {
  const a = await store.saveStudent({ name: 'Asha', school: 'St Mary', grade: '8', guardianName: 'Ravi', guardianPhone: '9876543210', monthlyFee: 1000, joinedOn: '2026-01-01', active: true });
  const b = await store.saveStudent({ name: 'Bala', school: 'St Mary', grade: '9', guardianName: 'Mani', guardianPhone: '', monthlyFee: 800, joinedOn: '2026-01-01', active: true });
  return { a, b };
};

describe('StudentsScreen', () => {
  it('adds a student with school and class', async () => {
    const store = newStore();
    render(<StudentsScreen store={store} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Add student' }));
    fireEvent.input(screen.getByLabelText('Name'), { target: { value: 'Chitra' } });
    fireEvent.input(screen.getByLabelText('School'), { target: { value: 'City School' } });
    fireEvent.input(screen.getByLabelText('Class'), { target: { value: '10' } });
    fireEvent.input(screen.getByLabelText('Monthly fee (₹)'), { target: { value: '1200' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save student' }));
    await screen.findByText('Chitra');
    const saved = (await store.students())[0]!;
    expect(saved).toMatchObject({ name: 'Chitra', school: 'City School', grade: '10', monthlyFee: 1200 });
  });
  it('shows validation errors instead of saving', async () => {
    const store = newStore();
    render(<StudentsScreen store={store} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Add student' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save student' }));
    await screen.findByText(/Name is required/);
    expect(await store.students()).toEqual([]);
  });
  it('filters by search text', async () => {
    const store = newStore();
    await seed(store);
    render(<StudentsScreen store={store} />);
    await screen.findByText('Asha');
    fireEvent.input(screen.getByLabelText('Search students'), { target: { value: 'bal' } });
    expect(screen.queryByText('Asha')).toBeNull();
    expect(screen.getByText('Bala')).toBeTruthy();
  });
});

describe('AttendanceScreen', () => {
  it('defaults everyone to present and saves only the absentee change', async () => {
    const store = newStore();
    const { a, b } = await seed(store);
    render(<AttendanceScreen store={store} />);
    const asha = await screen.findByRole('button', { name: 'Asha: Present' });
    expect(screen.getByRole('button', { name: 'Bala: Present' })).toBeTruthy();
    fireEvent.click(asha);
    await screen.findByRole('button', { name: 'Asha: Absent' });
    fireEvent.click(screen.getByRole('button', { name: 'Save attendance' }));
    await screen.findByText(/Saved/);
    const today = todayISO();
    const day = (await store.attendance(monthOf(today))).days[today]!;
    expect(day).toEqual({ [a.id]: 'A', [b.id]: 'P' });
  });
  it('loads previously saved marks for a date', async () => {
    const store = newStore();
    const { a } = await seed(store);
    await store.saveAttendance(todayISO(), { [a.id]: 'L' });
    render(<AttendanceScreen store={store} />);
    await screen.findByRole('button', { name: 'Asha: Leave' });
  });
  it('excludes inactive students', async () => {
    const store = newStore();
    const { b } = await seed(store);
    await store.setActive(b.id, false);
    render(<AttendanceScreen store={store} />);
    await screen.findByRole('button', { name: 'Asha: Present' });
    expect(screen.queryByRole('button', { name: /Bala/ })).toBeNull();
  });
});

describe('FeesScreen', () => {
  const settings = { teacherName: 'Mr Kumar', tuitionName: 'Kumar Tuition' };
  it('shows pending balances for the month', async () => {
    const store = newStore();
    await seed(store);
    render(<FeesScreen store={store} settings={settings} />);
    await screen.findByText(/₹1,800 pending/);
  });
  it('records a payment and lists its receipt number', async () => {
    const store = newStore();
    await seed(store);
    render(<FeesScreen store={store} settings={settings} />);
    fireEvent.click(await screen.findByRole('button', { name: /Asha/ }));
    fireEvent.input(await screen.findByLabelText('Amount (₹)'), { target: { value: '400' } });
    fireEvent.click(screen.getByRole('button', { name: 'Record payment' }));
    await screen.findByText(/Receipt #1/);
    const month = monthOf(todayISO());
    await waitFor(async () => expect((await store.payments(month)).length).toBe(1));
  });
  it('pressing Record payment twice quickly records only one payment', async () => {
    const store = newStore();
    await seed(store);
    render(<FeesScreen store={store} settings={settings} />);
    fireEvent.click(await screen.findByRole('button', { name: /Asha/ }));
    fireEvent.input(await screen.findByLabelText('Amount (₹)'), { target: { value: '300' } });
    const form = screen.getByRole('button', { name: 'Record payment' }).closest('form')!;
    fireEvent.submit(form);
    fireEvent.submit(form);
    await screen.findByText(/Receipt #1/);
    await new Promise((r) => setTimeout(r, 50));
    expect((await store.payments(monthOf(todayISO()))).length).toBe(1);
  });
  it('voiding requires a reason and shows the receipt as void', async () => {
    const store = newStore();
    const { a } = await seed(store);
    const today = todayISO();
    await store.recordPayment({ studentId: a.id, forMonth: monthOf(today), amount: 500, paidOn: today, mode: 'cash' });
    render(<FeesScreen store={store} settings={settings} />);
    fireEvent.click(await screen.findByRole('button', { name: /Asha/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Void receipt #1' }));
    fireEvent.input(screen.getByLabelText('Reason for voiding'), { target: { value: 'typo' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm void' }));
    await screen.findByText(/Receipt #1 .*VOID/);
  });
});
