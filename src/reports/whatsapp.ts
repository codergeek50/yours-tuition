import type { Payment } from '../domain/types';
import { monthLabel } from '../domain/dates';
import { formatRupees } from '../domain/money';

/**
 * A phone number as WhatsApp wants it: digits only, with the country code. A 10-digit number gets India's 91;
 * a leading 0 or 00 is dropped; anything else must already be 11 to 13 digits. Returns null for a number that cannot be used.
 */
export function normalizeWhatsAppNumber(input: string): string | null {
  let digits = input.replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  if (digits.length === 10) return `91${digits}`;
  return digits.length >= 11 && digits.length <= 13 ? digits : null;
}

/** wa.me click-to-chat link: opens a chat with that number and the message ready to send. Free, no account, no server. */
export function whatsappLink(number: string, message: string): string | null {
  const full = normalizeWhatsAppNumber(number);
  return full ? `https://wa.me/${full}?text=${encodeURIComponent(message)}` : null;
}

export interface ReceiptMessageOptions { tuitionName: string; teacherName: string }

/** The receipt as a short message that reads well in a chat. */
export function receiptMessage(p: Payment, o: ReceiptMessageOptions): string {
  const r = p.receipt;
  const lines = [
    `${r.voided ? 'VOID receipt' : 'Receipt'} No. ${r.number} - ${o.tuitionName}`,
    ...(r.voided ? [`This receipt is void${r.voidReason ? `: ${r.voidReason}` : ''}.`] : []),
    `Student: ${r.studentName}`,
    `Fee for: ${monthLabel(r.forMonth)}`,
    `Amount received: ${formatRupees(r.amount)}`,
    `Date paid: ${r.issuedOn}`,
    `Paid by: ${p.mode.toUpperCase()}`,
    `Balance for the month: ${formatRupees(Math.max(r.balanceAfter, 0))}`,
    o.teacherName ? `Thank you. - ${o.teacherName}` : 'Thank you.',
  ];
  return lines.join('\n');
}
