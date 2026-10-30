import { describe, it, expect } from 'vitest';
import { normalizeWhatsAppNumber, receiptMessage, whatsappLink } from './whatsapp';
import { reminderLink } from './reminder';
import type { Payment } from '../domain/types';

const payment = (o: Partial<Payment['receipt']> = {}, p: Partial<Payment> = {}): Payment => ({
  id: 'p', studentId: 's', forMonth: '2026-10', amount: 600, paidOn: '2026-10-05', mode: 'upi',
  receipt: { number: 20260010, issuedOn: '2026-10-05', studentName: 'Asha Rao', amount: 600, forMonth: '2026-10', balanceAfter: 400, voided: false, ...o },
  ...p,
});

describe('normalizeWhatsAppNumber', () => {
  it.each([
    ['9876543210', '919876543210'],
    ['98765 43210', '919876543210'],
    ['+91 98765-43210', '919876543210'],
    ['919876543210', '919876543210'],
    ['09876543210', '919876543210'],
    ['0091 98765 43210', '919876543210'],
    ['(98765) 43210', '919876543210'],
    ['+44 7911 123456', '447911123456'],
  ])('accepts %s', (input, expected) => expect(normalizeWhatsAppNumber(input)).toBe(expected));

  it.each(['', '  ', '12345', 'abcdefghij', '98765432101234567', '+', '0'])('refuses %j', (input) => expect(normalizeWhatsAppNumber(input)).toBeNull());
});

describe('whatsappLink', () => {
  it('opens a chat with the number and the message ready', () => {
    const link = whatsappLink('98765 43210', 'Hello & welcome\nLine two')!;
    expect(link.startsWith('https://wa.me/919876543210?text=')).toBe(true);
    expect(decodeURIComponent(link.split('?text=')[1]!)).toBe('Hello & welcome\nLine two');
  });
  it('is null without a usable number', () => {
    expect(whatsappLink('nope', 'x')).toBeNull();
  });
  it('fee reminders use the same rules', () => {
    expect(reminderLink('98765 43210', 'hi')).toBe(whatsappLink('98765 43210', 'hi'));
    expect(reminderLink('09876543210', 'hi')).toContain('wa.me/919876543210');
    expect(reminderLink('', 'hi')).toBeNull();
  });
});

describe('receiptMessage', () => {
  const o = { tuitionName: 'YOURS Tuition', teacherName: 'Mrs Rao' };
  it('says who paid what, for which month, and what is left', () => {
    const text = receiptMessage(payment(), o);
    expect(text).toContain('Receipt No. 20260010');
    expect(text).toContain('YOURS Tuition');
    expect(text).toContain('Asha Rao');
    expect(text).toContain('October 2026');
    expect(text).toContain('₹600');
    expect(text).toContain('2026-10-05');
    expect(text).toContain('UPI');
    expect(text).toContain('Balance for the month: ₹400');
    expect(text).toContain('Mrs Rao');
  });
  it('never shows a negative balance', () => {
    expect(receiptMessage(payment({ balanceAfter: -100 }), o)).toContain('Balance for the month: ₹0');
  });
  it('a voided receipt says so plainly, with the reason', () => {
    const text = receiptMessage(payment({ voided: true, voidReason: 'wrong amount' }), o);
    expect(text).toMatch(/VOID/);
    expect(text).toContain('wrong amount');
  });
  it('works without a teacher name', () => {
    expect(receiptMessage(payment(), { tuitionName: 'T', teacherName: '' })).not.toContain('undefined');
  });
});
