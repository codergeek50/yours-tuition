import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup, within } from '@testing-library/preact';
import { DataStore } from '../data/store';
import { MemoryLocalStore } from '../sync/local';
import { monthOf, todayISO } from '../domain/dates';
import { ReportsScreen } from './ReportsScreen';

afterEach(cleanup);

const month = monthOf(todayISO());
const [y, m] = month.split('-').map(Number) as [number, number];
const lastDay = `${month}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`;

async function seeded() {
  const store = new DataStore(new MemoryLocalStore());
  const base = { school: 'S', grade: '8', guardianName: '', guardianPhone: '', monthlyFee: 1000, joinedOn: '2026-01-01', active: true };
  const asha = await store.saveStudent({ ...base, name: 'Asha' });
  const bala = await store.saveStudent({ ...base, name: 'Bala' });
  await store.saveAttendance(`${month}-01`, { [asha.id]: 'A', [bala.id]: 'P' });
  await store.saveAttendance(`${month}-02`, { [asha.id]: 'P', [bala.id]: 'L' });
  return { store, asha, bala };
}

describe('attendance report', () => {
  it('defaults to the whole current month', async () => {
    const { store } = await seeded();
    render(<ReportsScreen store={store} />);
    expect(((await screen.findByLabelText('From')) as HTMLInputElement).value).toBe(`${month}-01`);
    expect((screen.getByLabelText('To') as HTMLInputElement).value).toBe(lastDay);
  });

  it('shows each recorded date as a column with every student\'s mark', async () => {
    const { store } = await seeded();
    render(<ReportsScreen store={store} />);
    await screen.findByRole('columnheader', { name: /^1 / });
    const heads = screen.getAllByRole('columnheader').map((h) => h.getAttribute('aria-label') ?? h.textContent);
    expect(heads.slice(1, 3)).toHaveLength(2);
    const asha = within(await screen.findByRole('row', { name: /Asha/ })).getAllByRole('cell').map((c) => c.textContent);
    expect(asha).toEqual(['A', 'P', '1', '1', '0', '50']);
    const bala = within(screen.getByRole('row', { name: /Bala/ })).getAllByRole('cell').map((c) => c.textContent);
    expect(bala).toEqual(['P', 'L', '1', '0', '1', '50']);
  });

  it('narrowing the range drops the dates outside it', async () => {
    const { store } = await seeded();
    render(<ReportsScreen store={store} />);
    await screen.findByRole('row', { name: /Asha/ });
    fireEvent.input(screen.getByLabelText('To'), { target: { value: `${month}-01` } });
    await waitFor(() => {
      const asha = within(screen.getByRole('row', { name: /Asha/ })).getAllByRole('cell').map((c) => c.textContent);
      expect(asha).toEqual(['A', '0', '1', '0', '0']);
    });
  });

  it('says so when nothing was recorded in the range', async () => {
    const store = new DataStore(new MemoryLocalStore());
    render(<ReportsScreen store={store} />);
    await screen.findByText(/No attendance recorded in this period/);
  });

  it('offers quick ranges', async () => {
    const { store } = await seeded();
    render(<ReportsScreen store={store} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Last month' }));
    const prev = new Date(y, m - 2, 1);
    const prevMonth = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`;
    await waitFor(() => expect((screen.getByLabelText('From') as HTMLInputElement).value).toBe(`${prevMonth}-01`));
    fireEvent.click(screen.getByRole('button', { name: 'This month' }));
    await waitFor(() => expect((screen.getByLabelText('From') as HTMLInputElement).value).toBe(`${month}-01`));
  });
});
