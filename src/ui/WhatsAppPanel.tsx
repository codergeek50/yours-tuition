import { useRef, useState } from 'preact/hooks';
import type { Payment } from '../domain/types';
import type { Settings } from '../app/settings';
import { receiptFileName, renderReceiptPdf } from '../reports/receiptPdf';
import { receiptMessage, whatsappLink } from '../reports/whatsapp';
import { Field, val } from './common';

type ContactPicker = { select(props: string[], options?: { multiple?: boolean }): Promise<{ tel?: string[] }[]> };
const contactPicker = (): ContactPicker | undefined => (navigator as unknown as { contacts?: ContactPicker }).contacts;

/** Sends a receipt on WhatsApp to any number: a chat with the receipt text, or the PDF through the phone's share sheet. */
export function WhatsAppPanel({ payment, settings, guardianPhone, makePdf = renderReceiptPdf }: {
  payment: Payment;
  settings: Settings;
  guardianPhone: string;
  makePdf?: (p: Payment, o: { teacherName: string; tuitionName: string }) => Promise<Blob>;
}) {
  const [number, setNumber] = useState(guardianPhone);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const working = useRef(false);
  const opts = { teacherName: settings.teacherName, tuitionName: settings.tuitionName };
  const message = receiptMessage(payment, opts);
  const picker = contactPicker();

  function sendMessage() {
    setNote('');
    const link = whatsappLink(number, message);
    if (!link) return setError('Enter a valid WhatsApp number, for example 98765 43210 or +44 7911 123456.');
    setError('');
    window.open(link, '_blank', 'noopener');
  }

  async function chooseContact() {
    try {
      const picked = await picker!.select(['tel'], { multiple: false });
      const tel = picked[0]?.tel?.[0];
      if (tel) { setNumber(tel); setError(''); } else setError('That contact has no phone number.');
    } catch {
      /* closed without choosing */
    }
  }

  async function sharePdf() {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    setError('');
    setNote('');
    try {
      const blob = await makePdf(payment, opts);
      const file = new File([blob], receiptFileName(payment), { type: 'application/pdf' });
      if (typeof navigator.share === 'function' && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: `Receipt No. ${payment.receipt.number}`, text: message });
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = file.name;
        document.body.append(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10_000);
        setNote('This phone cannot share files from here, so the PDF was downloaded. Attach it to the chat in WhatsApp.');
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setError((e as Error).message || 'The PDF could not be shared.');
    } finally {
      working.current = false;
      setBusy(false);
    }
  }

  return (
    <section class="card wa" aria-label="Send on WhatsApp">
      <h3>Send on WhatsApp</h3>
      <Field label="WhatsApp number" hint="Any number. Starts with the guardian's number.">
        <input type="tel" inputMode="tel" autoComplete="off" value={number} placeholder="98765 43210" onInput={(e) => setNumber(val(e))} />
      </Field>
      {picker && <button class="btn small" type="button" onClick={chooseContact}>Choose from contacts</button>}
      <button class="btn primary wide" type="button" onClick={sendMessage}>Send message on WhatsApp</button>
      <button class="btn wide" type="button" disabled={busy} onClick={sharePdf}>{busy ? 'Making the PDF…' : 'Share PDF receipt'}</button>
      <p class="muted small">WhatsApp lets this app open a chat with the number and write the message, but a PDF has to be attached from the share sheet. When it opens, choose WhatsApp and pick the same contact.</p>
      {error && <p class="errors" role="alert">{error}</p>}
      {note && <p class="note" role="status">{note}</p>}
    </section>
  );
}
