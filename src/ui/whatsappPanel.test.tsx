import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/preact';
import { ReceiptView } from './ReceiptView';
import type { Payment } from '../domain/types';
import type { Settings } from '../app/settings';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  for (const k of ['share', 'canShare', 'contacts']) delete (navigator as unknown as Record<string, unknown>)[k];
});

const payment: Payment = {
  id: 'p', studentId: 's', forMonth: '2026-10', amount: 600, paidOn: '2026-10-05', mode: 'cash',
  receipt: { number: 20260010, issuedOn: '2026-10-05', studentName: 'Asha Rao', amount: 600, forMonth: '2026-10', balanceAfter: 0, voided: false },
};
const settings = { teacherName: 'Mrs Rao', tuitionName: 'YOURS Tuition' } as Settings;
const pdf = () => new Blob(['%PDF-1.4 fake'], { type: 'application/pdf' });

const open = (o: { phone?: string; makePdf?: () => Promise<Blob> } = {}) =>
  render(<ReceiptView payment={payment} settings={settings} guardianPhone={o.phone ?? '98765 43210'} makePdf={o.makePdf ?? (async () => pdf())} onClose={() => {}} />);
const setNavigator = (name: string, value: unknown) => Object.defineProperty(navigator, name, { value, configurable: true, writable: true });

describe('the WhatsApp panel on a receipt', () => {
  let opened: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    opened = vi.fn();
    vi.spyOn(window, 'open').mockImplementation(opened as never);
  });

  it('starts with the guardian\'s number, which the person can change to any number', () => {
    open();
    const field = screen.getByLabelText('WhatsApp number') as HTMLInputElement;
    expect(field.value).toBe('98765 43210');
    fireEvent.input(field, { target: { value: '+44 7911 123456' } });
    expect(field.value).toBe('+44 7911 123456');
  });

  it('Send message opens a chat with that number and the receipt text', () => {
    open();
    fireEvent.input(screen.getByLabelText('WhatsApp number'), { target: { value: '99999 88888' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send message on WhatsApp' }));
    expect(opened).toHaveBeenCalledTimes(1);
    const url = String(opened.mock.calls[0]![0]);
    expect(url.startsWith('https://wa.me/919999988888?text=')).toBe(true);
    const message = decodeURIComponent(url.split('?text=')[1]!);
    expect(message).toContain('Receipt No. 20260010');
    expect(message).toContain('Asha Rao');
    expect(message).toContain('₹600');
  });

  it('a number that cannot work is explained and nothing opens', () => {
    open({ phone: '' });
    fireEvent.click(screen.getByRole('button', { name: 'Send message on WhatsApp' }));
    expect(screen.getByRole('alert').textContent).toMatch(/valid WhatsApp number/i);
    expect(opened).not.toHaveBeenCalled();
  });

  it('Share PDF hands the PDF file to the phone\'s share sheet', async () => {
    const share = vi.fn(async () => {});
    setNavigator('canShare', () => true);
    setNavigator('share', share);
    const makePdf = vi.fn(async () => pdf());
    open({ makePdf });
    fireEvent.click(screen.getByRole('button', { name: 'Share PDF receipt' }));
    await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
    const arg = (share.mock.calls[0] as unknown as [{ files: File[]; text: string }])[0];
    expect(arg.files).toHaveLength(1);
    expect(arg.files[0]!.name).toBe('receipt-20260010.pdf');
    expect(arg.files[0]!.type).toBe('application/pdf');
    expect(arg.text).toContain('Receipt No. 20260010');
    expect(makePdf).toHaveBeenCalledTimes(1);
  });

  it('closing the share sheet without sending is not an error', async () => {
    setNavigator('canShare', () => true);
    setNavigator('share', vi.fn(async () => { throw new DOMException('cancelled', 'AbortError'); }));
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Share PDF receipt' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Share PDF receipt' }).hasAttribute('disabled')).toBe(false));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('when files cannot be shared the PDF is downloaded instead, and the person is told', async () => {
    setNavigator('canShare', () => false);
    (URL as unknown as { createObjectURL: () => string }).createObjectURL = () => 'blob:receipt';
    (URL as unknown as { revokeObjectURL: () => void }).revokeObjectURL = () => {};
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Share PDF receipt' }));
    await screen.findByText(/downloaded/i);
    expect(click).toHaveBeenCalledTimes(1);
  });

  it('if the PDF cannot be made, a message says so', async () => {
    open({ makePdf: async () => { throw new Error('This browser cannot draw the receipt.'); } });
    fireEvent.click(screen.getByRole('button', { name: 'Share PDF receipt' }));
    await screen.findByText(/cannot draw the receipt/i);
  });

  it('Choose from contacts only appears where the browser has it, and fills in the number', async () => {
    open();
    expect(screen.queryByRole('button', { name: 'Choose from contacts' })).toBeNull();
    cleanup();
    setNavigator('contacts', { select: vi.fn(async () => [{ tel: ['+91 90000 11111'] }]) });
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Choose from contacts' }));
    await waitFor(() => expect((screen.getByLabelText('WhatsApp number') as HTMLInputElement).value).toBe('+91 90000 11111'));
  });

  it('tells the person that the PDF is attached from the share sheet', () => {
    open();
    expect(screen.getByText(/pick the same contact/i)).toBeTruthy();
  });

  it('keeps the print option', () => {
    open();
    expect(screen.getByRole('button', { name: /Print \/ Save as PDF/ })).toBeTruthy();
  });
});
