import { useRef } from 'preact/hooks';
import type { Payment } from '../domain/types';
import { receiptHtml } from '../reports/receipt';
import type { Settings } from '../app/settings';
import { Modal } from './common';

export function ReceiptView({ payment, settings, onClose }: { payment: Payment; settings: Settings; onClose: () => void }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const html = receiptHtml(payment, { teacherName: settings.teacherName, tuitionName: settings.tuitionName });
  return (
    <Modal title={`Receipt No. ${payment.receipt.number}`} onClose={onClose}>
      <iframe ref={frame} class="receipt-frame" title="Receipt" srcDoc={html} sandbox="allow-same-origin allow-modals" />
      <div class="row">
        <button class="btn primary" type="button" onClick={() => frame.current?.contentWindow?.print()}>Print / Save as PDF</button>
      </div>
    </Modal>
  );
}
