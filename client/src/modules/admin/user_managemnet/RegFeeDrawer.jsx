import React, { useEffect, useState } from 'react';
import {
  X, Loader2, Check, Download, SendHorizontal, RotateCcw,
} from 'lucide-react';
import apiClient from '../../../api/api';

const money = new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR', maximumFractionDigits: 2 });
const fmt = (v) => money.format(Number(v || 0));
const fmtDate = (v) => {
  if (!v) return '—';
  const d = new Date(v);
  return isNaN(d) ? '—' : d.toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
};

const STATUS_META = {
  PENDING:          { label: 'Pending',          cls: 'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200' },
  INVOICED:         { label: 'Invoiced',         cls: 'bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-200' },
  RECEIPT_UPLOADED: { label: 'Receipt Uploaded', cls: 'bg-violet-50 text-violet-700 ring-1 ring-inset ring-violet-200' },
  PAID:             { label: 'Paid',             cls: 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200' },
  WAIVED:           { label: 'Waived',           cls: 'bg-gray-100 text-gray-600 ring-1 ring-inset ring-gray-200' },
  EXPIRED:          { label: 'Expired',          cls: 'bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200' },
};

const Field = ({ label, children }) => (
  <div>
    <label className="block text-[11px] font-medium uppercase tracking-wider text-gray-400 mb-1">{label}</label>
    {children}
  </div>
);

export default function RegFeeDrawer({ open, onClose, clientId, clientProfile, onSuccess }) {
  const [amount, setAmount] = useState('');
  const [selectedBankAccountId, setSelectedBankAccountId] = useState('');
  const [bankAccounts, setBankAccounts] = useState([]);
  const [bankLoading, setBankLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [pdfUrl, setPdfUrl] = useState(null);

  const feeStatus = clientProfile?.reg_fee_status || 'PENDING';
  const badge = STATUS_META[feeStatus] || STATUS_META.PENDING;
  const canSendInvoice = ['PENDING', 'INVOICED', 'EXPIRED'].includes(feeStatus);
  const canViewReceipt = feeStatus === 'RECEIPT_UPLOADED' && clientProfile?.reg_fee_receipt_url;
  const isSettled = ['PAID', 'WAIVED'].includes(feeStatus);

  useEffect(() => {
    if (!open) return;
    setAmount(String(clientProfile?.reg_fee_amount || '10000.00'));
    setError('');
    setPdfUrl(null);

    const loadAccounts = async () => {
      try {
        setBankLoading(true);
        const res = await apiClient.getBankAccounts();
        const accounts = Array.isArray(res?.data) ? res.data.filter((a) => a.is_active) : [];
        setBankAccounts(accounts);
        if (accounts.length > 0) setSelectedBankAccountId(accounts[0].account_id);
      } catch {
        // non-fatal
      } finally {
        setBankLoading(false);
      }
    };

    loadAccounts();
  }, [open, clientProfile?.reg_fee_amount]);

  if (!open) return null;

  const run = async (fn) => {
    setLoading(true);
    setError('');
    try {
      await fn();
      onSuccess?.();
    } catch (err) {
      setError(err.message || 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  };

  const handleSendInvoice = () =>
    run(async () => {
      if (!selectedBankAccountId) throw new Error('Please select a bank account.');
      const res = await apiClient.sendRegFeeInvoice(clientId, { amount, bank_account_id: selectedBankAccountId });
      if (res.data?.invoice_pdf_url) setPdfUrl(res.data.invoice_pdf_url);
    });

  const handleVerify = () =>
    run(() => apiClient.verifyRegFeePayment(clientId));

  const handleStatusUpdate = (status) =>
    run(() => apiClient.updateRegFeeStatus(clientId, status));

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div className="flex-1 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* Drawer */}
      <div className="w-full max-w-md bg-white flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0">
          <div>
            <h2 className="text-sm font-semibold text-slate-800">Registration Fee</h2>
            <p className="text-xs text-slate-400 mt-0.5">{clientProfile?.full_name || 'Client'}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">

          {/* Current status */}
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-3">
            <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wider text-gray-400 mb-1">Status</p>
                <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-semibold ${badge.cls}`}>
                  {badge.label}
                </span>
              </div>
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wider text-gray-400 mb-1">Current Amount</p>
                <p className="text-sm font-bold text-gray-800">{fmt(clientProfile?.reg_fee_amount || 10000)}</p>
              </div>
              {clientProfile?.reg_fee_invoiced_at && (
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wider text-gray-400 mb-1">Invoiced On</p>
                  <p className="text-sm font-medium text-gray-700">{fmtDate(clientProfile.reg_fee_invoiced_at)}</p>
                </div>
              )}
              {feeStatus === 'EXPIRED' && clientProfile?.reg_fee_expires_at && (
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wider text-gray-400 mb-1">Expired On</p>
                  <p className="text-sm font-medium text-rose-600">{fmtDate(clientProfile.reg_fee_expires_at)}</p>
                </div>
              )}
            </div>
          </div>

          {/* PDF download (after sending invoice) */}
          {pdfUrl && (
            <a
              href={pdfUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100"
            >
              <Download className="h-3.5 w-3.5" /> Download Invoice PDF
            </a>
          )}

          {/* Receipt uploaded — verify section */}
          {canViewReceipt && (
            <div className="rounded-lg border border-violet-200 bg-violet-50 p-4 space-y-3">
              <p className="text-xs font-semibold text-violet-700">Receipt submitted — review before verifying</p>
              <div className="flex flex-wrap gap-2">
                <a
                  href={clientProfile.reg_fee_receipt_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                >
                  <Download className="h-3.5 w-3.5" /> View Receipt
                </a>
                <button
                  type="button"
                  onClick={handleVerify}
                  disabled={loading}
                  className="inline-flex items-center gap-1.5 rounded bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                >
                  {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                  Verify Payment
                </button>
              </div>
            </div>
          )}

          {/* Send invoice form */}
          {canSendInvoice && (
            <div className="space-y-4 border-t border-gray-100 pt-4">
              <p className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Send Invoice via WhatsApp</p>

              <Field label="Fee Amount (LKR)">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 bg-white text-gray-800"
                />
              </Field>

              <Field label="Bank Account">
                {bankLoading ? (
                  <p className="text-xs text-gray-400 py-2">Loading accounts…</p>
                ) : (
                  <select
                    value={selectedBankAccountId}
                    onChange={(e) => setSelectedBankAccountId(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 bg-white text-gray-800"
                  >
                    <option value="">— Select account —</option>
                    {bankAccounts.map((acc) => (
                      <option key={acc.account_id} value={acc.account_id}>
                        {acc.account_nickname} · {acc.bank_name} · {acc.account_number}
                      </option>
                    ))}
                  </select>
                )}
              </Field>

              {!clientProfile?.mobile_number && (
                <p className="text-xs text-amber-600">Client has no mobile number — WhatsApp delivery unavailable.</p>
              )}
            </div>
          )}

          {/* Error */}
          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>

        {/* Footer actions */}
        <div className="border-t border-gray-100 px-5 py-4 shrink-0 space-y-2">
          {canSendInvoice && (
            <button
              type="button"
              onClick={handleSendInvoice}
              disabled={loading || !selectedBankAccountId || bankLoading}
              title={!clientProfile?.mobile_number ? 'Client has no mobile number' : ''}
              className="w-full inline-flex items-center justify-center gap-1.5 rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <SendHorizontal className="h-4 w-4" />}
              Send Invoice via WhatsApp
            </button>
          )}

          {canSendInvoice && (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => handleStatusUpdate('WAIVED')}
                disabled={loading}
                className="flex-1 inline-flex items-center justify-center gap-1.5 rounded border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-60"
              >
                <X className="h-4 w-4" /> Mark as Waived
              </button>
              <button
                type="button"
                onClick={() => handleStatusUpdate('PAID')}
                disabled={loading}
                className="flex-1 inline-flex items-center justify-center gap-1.5 rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-60"
              >
                <Check className="h-4 w-4" /> Mark as Paid
              </button>
            </div>
          )}

          {isSettled && (
            <button
              type="button"
              onClick={() => handleStatusUpdate('PENDING')}
              disabled={loading}
              className="w-full inline-flex items-center justify-center gap-1.5 rounded border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-60"
            >
              <RotateCcw className="h-4 w-4" /> Reset to Pending
            </button>
          )}

          <button
            type="button"
            onClick={onClose}
            className="w-full rounded border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
