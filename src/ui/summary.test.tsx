import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, within, cleanup } from '@testing-library/preact';
import { DataStore } from '../data/store';
import { MemoryLocalStore } from '../sync/local';
import { todayISO } from '../domain/dates';
import { ReportsScreen } from './ReportsScreen';

afterEach(cleanup);

describe('the monthly summary on the Reports screen', () => {
  it('shows fees collected, teachers paid, expenses and the net for the month', async () => {
    const store = new DataStore(new MemoryLocalStore());
    const asha = await store.saveStudent({ name: 'Asha', school: '', grade: 'III', guardianName: '', guardianPhone: '', monthlyFee: 6000, joinedOn: '2026-01-01', active: true });
    await store.recordPayment({ studentId: asha.id, forMonth: todayISO().slice(0, 7), amount: 6000, paidOn: todayISO(), mode: 'cash' });
    const t = await store.saveTeacher({ name: 'Mr Rao', phone: '', subject: 'Maths', usualAmount: 0, active: true });
    await store.recordVisit({ teacherId: t.id, date: todayISO(), hours: 2, amount: 800, note: '' });
    await store.recordVisit({ teacherId: t.id, date: todayISO(), hours: 1, amount: 300, note: '', paid: false });
    await store.recordExpense({ date: todayISO(), label: 'Rent', amount: 4000 });
    render(<ReportsScreen store={store} />);
    const card = await screen.findByLabelText('Monthly summary');
    await within(card).findByText('₹1,200'); // 6000 - 800 - 4000
    expect(within(card).getByText('₹6,000')).toBeTruthy();
    expect(within(card).getByText('₹800')).toBeTruthy();
    expect(within(card).getByText('₹4,000')).toBeTruthy();
    expect(within(card).getByText(/₹300 is still to pay/)).toBeTruthy();
  });
});
