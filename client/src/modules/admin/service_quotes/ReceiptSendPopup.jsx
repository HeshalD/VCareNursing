import { useState } from 'react';
import { X, MessageCircle, SendHorizontal, Loader2 } from 'lucide-react';
import apiClient from '../../../api/api';
import { formatMobileNumber } from '../../../utils/phoneFormat';

// Shown right after a payment is recorded (see PaymentAllocationModal) so the
// admin can immediately push the client's latest payment receipt out over
// WhatsApp, instead of having to separately remember to do it later. Shared
// by service_request_summary.jsx, quotations.jsx and quotation_details.jsx so
// the prompt is identical everywhere a payment can be recorded.
const ReceiptSendPopup = ({ open, clientId, payerName, payerMobile, onClose }) => {
  const [busy, setBusy] = useState(false);

  if (!open) return null;

  const handleSend = async () => {
    if (!clientId) { onClose(); return; }
    try {
      setBusy(true);
      const res = await apiClient.getClientReceipts(clientId);
      const receipts = Array.isArray(res?.receipts) ? res.receipts : [];
      const latest = receipts[0];
      if (latest?.receipt_id) {
        await apiClient.sendPaymentReceipt(latest.receipt_id);
      }
    } catch { /* non-critical */ }
    finally {
      setBusy(false);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-sm rounded-xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100">
              <MessageCircle className="h-4 w-4 text-slate-600" />
            </div>
            <h3 className="text-sm font-semibold text-slate-900">Send Payment Receipt?</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-5 py-4">
          <p className="text-sm text-slate-600">
            Payment recorded. Would you like to send the receipt to{' '}
            <span className="font-semibold text-slate-900">{payerName || 'the client'}</span>
            {payerMobile && (
              <span className="text-slate-400"> ({formatMobileNumber(payerMobile)})</span>
            )}{' '}
            via WhatsApp?
          </p>
          {!clientId && (
            <p className="mt-2 text-xs text-slate-400">
              No linked client profile — receipt sending is only available for registered clients.
            </p>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            Skip for now
          </button>
          <button
            type="button"
            onClick={handleSend}
            disabled={busy || !clientId}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {busy ? (
              <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Sending…</>
            ) : (
              <><SendHorizontal className="h-3.5 w-3.5" /> Yes, send now</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ReceiptSendPopup;
