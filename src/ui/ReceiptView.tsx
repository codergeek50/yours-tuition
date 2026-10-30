import { useRef } from 'preact/hooks';
import type { Payment } from '../domain/types';
import { receiptHtml } from '../reports/receipt';
import type { Settings } from '../app/settings';
import { Modal } from './common';
import { IconPrint } from './icons';
import { WhatsAppPanel } from './WhatsAppPanel';
import type { renderReceiptPdf } from '../reports/receiptPdf';

export function ReceiptView({ payment, settings, guardianPhone = '', makePdf, onClose }: {
  payment: Payment;
  settings: Settings;
  guardianPhone?: string;
  makePdf?: typeof renderReceiptPdf;
  onClose: () => void;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const html = receiptHtml(payment, { teacherName: settings.teacherName, tuitionName: settings.tuitionName });
  return (
    <Modal title={`Receipt No. ${payment.receipt.number}`} onClose={onClose}>
      <iframe ref={frame} class="receipt-frame" title="Receipt" srcDoc={html} sandbox="allow-same-origin allow-modals" />
      <button class="btn primary wide" type="button" onClick={() => frame.current?.contentWindow?.print()}><IconPrint size={20} /> Print / Save as PDF</button>
      <WhatsAppPanel payment={payment} settings={settings} guardianPhone={guardianPhone} makePdf={makePdf} />
    </Modal>
  );
}
