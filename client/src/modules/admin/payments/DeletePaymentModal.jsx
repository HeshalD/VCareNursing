import React, { useEffect, useState } from 'react';
import { Loader2, Trash2, AlertTriangle, X } from 'lucide-react';
import apiClient from '../../../api/api';

const money = new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR', maximumFractionDigits: 2 });
const fmt = (v) => money.format(Number(v || 0));

// Super-admin confirmation for deleting a recorded payment. On open it asks the server for a
// dry run (everything is executed and rolled back) so the admin sees exactly what will be
// reversed - or why the delete is refused - before typing a reason and confirming.
const DeletePaymentModal = ({ receipt, onClose, onDeleted }) => {
  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState(null);
  const [blocked, setBlocked] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await apiClient.previewDeletePaymentReceipt(receipt.receipt_id);
        if (alive) setPreview(res?.data || null);
      } catch (err) {
        if (alive) setBlocked(err?.message || 'This payment cannot be deleted.');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [receipt.receipt_id]);

  const confirm = async () => {
    setBusy(true);
    setError('');
    try {
      const res = await apiClient.deletePaymentReceipt(receipt.receipt_id, reason.trim());
      onDeleted(res);
    } catch (err) {
      setError(err?.message || 'Delete failed. Nothing was changed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" onClick={busy ? undefined : onClose}>
      <div className="w-full max-w-lg rounded-xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div className="flex items-center gap-2">
            <div className="rounded-full bg-red-100 p-2 text-red-600"><Trash2 className="h-4 w-4" /></div>
            <div>
              <h2 className="text-base font-semibold text-slate-800">Delete payment</h2>
              <p className="text-xs text-slate-500">Receipt {receipt.receipt_code} · {fmt(receipt.total_amount)}</p>
            </div>
          </div>
          <button onClick={onClose} disabled={busy} className="text-slate-400 hover:text-slate-600"><X className="h-4 w-4" /></button>
        </div>

        <div className="space-y-4 px-5 py-4 text-sm">
          {loading && (
            <div className="flex items-center gap-2 text-slate-400"><Loader2 className="h-4 w-4 animate-spin" /> Checking what this would affect…</div>
          )}

          {!loading && blocked && (
            <div className="flex gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-red-700">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>{blocked}</p>
            </div>
          )}

          {!loading && preview && (
            <>
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">This will permanently</p>
                <ul className="list-disc space-y-1 pl-5 text-slate-700">
                  {preview.effects.map((e, i) => <li key={i}>{e}</li>)}
                </ul>
              </div>

              {preview.reopened?.length > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-800">
                  <p className="font-medium">The credit was already spent, so these wallet payments will be re-opened (invoices unpaid again):</p>
                  <ul className="mt-1 list-disc pl-5">
                    {preview.reopened.map((x, i) => (
                      <li key={i}>Booking {x.booking_code}: {fmt(x.amount)} ({fmt(x.was)} → {fmt(x.now)})</li>
                    ))}
                  </ul>
                </div>
              )}

              {preview.warnings?.length > 0 && (
                <div className="space-y-1 rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-800">
                  {preview.warnings.map((w, i) => <p key={i}>{w}</p>)}
                </div>
              )}

              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">Reason (required)</label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={2}
                  placeholder="Why is this payment being deleted?"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100"
                />
                <p className="mt-1 text-xs text-slate-400">This cannot be undone. The reason is kept in the audit log.</p>
              </div>

              {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-red-700">{error}</p>}
            </>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-3">
          <button onClick={onClose} disabled={busy} className="rounded-lg border border-slate-200 px-4 py-1.5 text-sm text-slate-600 hover:bg-slate-50">
            {preview ? 'Cancel' : 'Close'}
          </button>
          {preview && (
            <button
              onClick={confirm}
              disabled={busy || reason.trim().length < 3}
              className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} Delete payment
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default DeletePaymentModal;
