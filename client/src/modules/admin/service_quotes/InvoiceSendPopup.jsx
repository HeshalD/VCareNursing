import { useState } from 'react';
import { X, FileCheck2, SendHorizontal, Loader2 } from 'lucide-react';
import apiClient from '../../../api/api';
import { formatMobileNumber } from '../../../utils/phoneFormat';

// Shown right after a payment fully settles a quotation (see
// ensureCombinedInvoice — the combined invoice PDF is generated on the first
// payment against a quote, but only actually pushed to the client here, once
// nothing is left to pay) so the admin can immediately send it over
// WhatsApp. Distinct from ReceiptSendPopup, which prompts after every
// payment regardless of whether the balance is now zero. Shared by
// service_request_summary.jsx, quotations.jsx and quotation_details.jsx so
// the prompt is identical everywhere a payment can be recorded.
const InvoiceSendPopup = ({ open, quoteId, payerName, payerMobile, onClose }) => {
  const [busy, setBusy] = useState(false);

  if (!open) return null;

  const handleSend = async () => {
    if (!quoteId) { onClose(); return; }
    try {
      setBusy(true);
      await apiClient.sendCombinedInvoice(quoteId);
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
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-50">
              <FileCheck2 className="h-4 w-4 text-emerald-600" />
            </div>
            <h3 className="text-sm font-semibold text-slate-900">Send Invoice?</h3>
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
            This quotation is now fully paid. Would you like to send the invoice to{' '}
            <span className="font-semibold text-slate-900">{payerName || 'the client'}</span>
            {payerMobile && (
              <span className="text-slate-400"> ({formatMobileNumber(payerMobile)})</span>
            )}{' '}
            via WhatsApp?
          </p>
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
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
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

export default InvoiceSendPopup;
