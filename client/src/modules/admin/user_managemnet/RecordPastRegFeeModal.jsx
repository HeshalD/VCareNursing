import React, { useEffect, useState } from 'react';
import { X, Loader2, Check } from 'lucide-react';
import apiClient from '../../../api/api';
import DateInput, { todayISO } from '../../../components/common/DateInput';

const inputCls =
  'w-full px-3 py-2 text-sm border border-gray-200 rounded-md outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 bg-white';

const Field = ({ label, children }) => (
  <div>
    <label className="block text-[11px] font-medium uppercase tracking-wider text-gray-400 mb-1">{label}</label>
    {children}
  </div>
);

// Records a registration fee the client already paid before it was tracked in-system.
// Membership expiry is calculated 365 days from the date entered, not from today.
export default function RecordPastRegFeeModal({ open, onClose, clientId, clientProfile, salespersons = [], onSuccess }) {
  const [amount, setAmount] = useState('');
  const [paidDate, setPaidDate] = useState('');
  const [salespersonId, setSalespersonId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const feeStatus = clientProfile?.reg_fee_status || 'PENDING';
  const isSettled = ['PAID', 'WAIVED'].includes(feeStatus);

  useEffect(() => {
    if (!open) return;
    setAmount(String(clientProfile?.reg_fee_amount || '10000.00'));
    setPaidDate('');
    setSalespersonId('');
    setError('');
  }, [open, clientProfile?.reg_fee_amount]);

  if (!open) return null;

  const handleSave = async () => {
    if (!paidDate) { setError('Please select the date the fee was paid.'); return; }
    if (!amount || Number(amount) <= 0) { setError('Please enter a valid amount.'); return; }
    setLoading(true);
    setError('');
    try {
      await apiClient.backdateRegFeePayment(clientId, {
        amount,
        payment_date: paidDate,
        salesperson_id: salespersonId || null,
      });
      await onSuccess?.({ salespersonId: salespersonId || null });
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to record historical payment.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={() => { if (!loading) onClose(); }}
    >
      <div
        className="w-full max-w-md rounded-xl bg-white shadow-xl border border-gray-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Record Past Registration Fee</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              For a client who already paid before this was tracked here.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="p-1 rounded text-gray-400 hover:bg-gray-100 disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-3">
          {isSettled ? (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
              This client's registration fee is already {feeStatus === 'PAID' ? 'paid' : 'waived'}, so there is nothing left to record.
            </p>
          ) : (
            <>
              <p className="text-[11px] text-gray-400">
                Membership expiry is calculated 365 days from the date entered below, not from today.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Amount Paid (LKR)">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    onWheel={(e) => e.target.blur()}
                    className={inputCls}
                  />
                </Field>
                <Field label="Date Paid">
                  <DateInput
                    value={paidDate}
                    onChange={(e) => setPaidDate(e.target.value)}
                    max={todayISO()}
                    className={inputCls}
                  />
                </Field>
              </div>
              {salespersons.length > 0 && (
                <Field label="Credit Registration To (optional)">
                  <select value={salespersonId} onChange={(e) => setSalespersonId(e.target.value)} className={inputCls}>
                    <option value="">No salesperson</option>
                    {salespersons.map((sp) => (
                      <option key={sp.id} value={sp.id}>{sp.full_name}</option>
                    ))}
                  </select>
                </Field>
              )}
            </>
          )}
          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>

        <div className="flex items-center gap-2 px-5 py-4 border-t border-gray-100 bg-gray-50 rounded-b-xl">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="flex-1 px-4 py-2 border border-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-100 disabled:opacity-60"
          >
            {isSettled ? 'Close' : 'Cancel'}
          </button>
          {!isSettled && (
            <button
              type="button"
              onClick={handleSave}
              disabled={loading}
              className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Save Past Payment
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
