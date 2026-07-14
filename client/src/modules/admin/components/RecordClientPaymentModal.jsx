import React, { useEffect, useState } from 'react';
import { Loader2, Plus, Trash2, X, CreditCard, Wallet, CalendarDays } from 'lucide-react';
import apiClient from '../../../api/api';
import DateInput from '../../../components/common/DateInput';

const PAYMENT_METHODS = ['BANK_TRANSFER', 'CASH_DEPOSIT', 'CASH', 'CHEQUE'];
const SERVICE_MODELS  = ['SHIFT_BASED', 'LIVE_IN', 'VISITING'];

const money = new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR', maximumFractionDigits: 2 });
const fmt = (v) => money.format(Number(v || 0));

function createRow() {
  return {
    id: `${Date.now()}_${Math.random()}`,
    type: 'BOOKING',
    amount: '',
    booking_id: '',
    new_booking: {
      patient_id: '',
      service_type: '',
      service_model: 'SHIFT_BASED',
      preferred_gender: 'ANY',
      start_date: '',
      daily_rate: '',
      amount_quotated: '',
    },
  };
}

const labelCls  = 'block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1';
const inputCls  = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500';
const selectCls = `${inputCls} cursor-pointer`;

// ─── Allocation row ───────────────────────────────────────────────────────────
const AllocationRow = ({ row, index, bookings, patients, onChange, onRemove, canRemove }) => {
  const update = (field, value) => onChange(row.id, field, value);
  const updateNewBooking = (field, value) =>
    onChange(row.id, 'new_booking', { ...row.new_booking, [field]: value });

  const eligibleBookings = bookings.filter(b =>
    ['ACTIVE', 'OVERDUE'].includes((b.status || '').toUpperCase())
  );

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-wide text-slate-500">
          Allocation {index + 1}
        </span>
        {canRemove && (
          <button
            type="button"
            onClick={() => onRemove(row.id)}
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50"
          >
            <Trash2 className="h-3 w-3" /> Remove
          </button>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {/* Type */}
        <div>
          <label className={labelCls}>Type</label>
          <select className={selectCls} value={row.type} onChange={e => update('type', e.target.value)}>
            <option value="BOOKING">Apply to existing booking</option>
            <option value="NEW_BOOKING">Create new booking</option>
            <option value="WALLET">Add to client wallet</option>
          </select>
        </div>

        {/* Amount */}
        <div>
          <label className={labelCls}>Amount (LKR)</label>
          <input
            type="number"
            min="0"
            step="0.01"
            placeholder="0.00"
            className={inputCls}
            value={row.amount}
            onChange={e => update('amount', e.target.value)}
          />
        </div>
      </div>

      {/* BOOKING: booking selector */}
      {row.type === 'BOOKING' && (
        <div>
          <label className={labelCls}>Booking</label>
          {eligibleBookings.length === 0 ? (
            <p className="text-xs text-slate-400 italic">No active or overdue bookings found for this client.</p>
          ) : (
            <select
              className={selectCls}
              value={row.booking_id}
              onChange={e => update('booking_id', e.target.value)}
            >
              <option value="">Select a booking…</option>
              {eligibleBookings.map(b => {
                const balance = (parseFloat(b.amount_quotated || b.total_amount || 0) - parseFloat(b.amount_paid || 0));
                return (
                  <option key={b.booking_id} value={b.booking_id}>
                    {b.service_type || 'Booking'} — {b.patient_name || 'Patient'} — Balance: {fmt(balance)} [{b.status}]
                  </option>
                );
              })}
            </select>
          )}
        </div>
      )}

      {/* NEW_BOOKING: sub-form */}
      {row.type === 'NEW_BOOKING' && (
        <div className="rounded-xl border border-blue-100 bg-blue-50 p-3 space-y-3">
          <p className="text-xs font-bold uppercase tracking-wide text-blue-600">New Booking Details</p>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={labelCls}>Care Profile</label>
              <select
                className={selectCls}
                value={row.new_booking.patient_id}
                onChange={e => updateNewBooking('patient_id', e.target.value)}
              >
                <option value="">Select care profile…</option>
                {patients.map(p => (
                  <option key={p.patient_id} value={p.patient_id}>
                    {p.full_name} {p.age ? `(Age ${p.age})` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className={labelCls}>Service Type</label>
              <input
                type="text"
                placeholder="e.g. Nursing, Caretaker"
                className={inputCls}
                value={row.new_booking.service_type}
                onChange={e => updateNewBooking('service_type', e.target.value)}
              />
            </div>

            <div>
              <label className={labelCls}>Service Model</label>
              <select
                className={selectCls}
                value={row.new_booking.service_model}
                onChange={e => updateNewBooking('service_model', e.target.value)}
              >
                {SERVICE_MODELS.map(m => <option key={m} value={m}>{m.replace('_', ' ')}</option>)}
              </select>
            </div>

            <div>
              <label className={labelCls}>Start Date</label>
              <DateInput
                className={inputCls}
                value={row.new_booking.start_date}
                onChange={e => updateNewBooking('start_date', e.target.value)}
              />
            </div>

            <div>
              <label className={labelCls}>Daily Rate (LKR)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                className={inputCls}
                value={row.new_booking.daily_rate}
                onChange={e => updateNewBooking('daily_rate', e.target.value)}
              />
            </div>

            <div>
              <label className={labelCls}>Quoted Amount (LKR)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="Defaults to allocation amount"
                className={inputCls}
                value={row.new_booking.amount_quotated}
                onChange={e => updateNewBooking('amount_quotated', e.target.value)}
              />
            </div>
          </div>
        </div>
      )}

      {/* WALLET: informational tag */}
      {row.type === 'WALLET' && (
        <div className="flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2">
          <Wallet className="h-4 w-4 text-emerald-600" />
          <span className="text-xs font-semibold text-emerald-700">
            This amount will be credited to the client wallet balance.
          </span>
        </div>
      )}
    </div>
  );
};

// ─── Modal ────────────────────────────────────────────────────────────────────
const RecordClientPaymentModal = ({ clientId, bookings, patients, onClose, onSuccess }) => {
  const [form, setForm] = useState({
    total_amount: '',
    payment_method: 'CASH',
    bank_account_id: '',
    cheque_number: '',
    cheque_date: '',
    reference_number: '',
    notes: '',
  });
  const [slipFile, setSlipFile]       = useState(null);
  const [rows, setRows]               = useState([createRow()]);
  const [bankAccounts, setBankAccounts] = useState([]);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState('');

  useEffect(() => {
    apiClient.getBankAccounts()
      .then(res => setBankAccounts(res.data || []))
      .catch(() => {});
  }, []);

  const parsedTotal   = parseFloat(form.total_amount) || 0;
  const allocatedTotal = rows.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
  const remaining     = parsedTotal - allocatedTotal;
  const isBalanced    = parsedTotal > 0 && Math.abs(remaining) < 0.01;

  const updateField = (field, value) => setForm(f => ({ ...f, [field]: value }));

  const updateRow = (id, field, value) =>
    setRows(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));

  const addRow = () => setRows(prev => [...prev, createRow()]);

  const removeRow = (id) => setRows(prev => prev.filter(r => r.id !== id));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const payload = {
      total_amount: parsedTotal,
      payment_method: form.payment_method,
      bank_account_id: form.bank_account_id || null,
      cheque_number: form.cheque_number || null,
      cheque_date: form.cheque_date || null,
      reference_number: form.reference_number || null,
      notes: form.notes || null,
      allocations: rows.map(r => {
        const base = { type: r.type, amount: parseFloat(r.amount) };
        if (r.type === 'BOOKING') return { ...base, booking_id: r.booking_id };
        if (r.type === 'NEW_BOOKING') return {
          ...base,
          new_booking: {
            patient_id: r.new_booking.patient_id,
            service_type: r.new_booking.service_type,
            service_model: r.new_booking.service_model,
            preferred_gender: r.new_booking.preferred_gender,
            start_date: r.new_booking.start_date,
            daily_rate: parseFloat(r.new_booking.daily_rate),
            amount_quotated: r.new_booking.amount_quotated
              ? parseFloat(r.new_booking.amount_quotated)
              : parseFloat(r.amount),
          },
        };
        return base;
      }),
    };

    try {
      setLoading(true);
      const response = await apiClient.recordClientPayment(clientId, payload, slipFile || null);
      onSuccess(response.record || response);
    } catch (err) {
      setError(err.message || 'Failed to record payment');
    } finally {
      setLoading(false);
    }
  };

  const needsBank   = ['BANK_TRANSFER', 'CASH_DEPOSIT'].includes(form.payment_method);
  const needsCheque = form.payment_method === 'CHEQUE';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="relative w-full max-w-2xl max-h-[92vh] overflow-y-auto rounded-3xl bg-white shadow-2xl">

        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4 rounded-t-3xl">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100">
              <CreditCard className="h-4 w-4 text-emerald-600" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Record Client Payment</h2>
              <p className="text-xs text-slate-500">Allocate across bookings or wallet</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-6">

          {/* ── Payment Details ── */}
          <section className="space-y-4">
            <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide">Payment Details</h3>

            <div className="grid gap-4 sm:grid-cols-2">
              {/* Total amount */}
              <div className="sm:col-span-2">
                <label className={labelCls}>Total Amount Received (LKR) *</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  required
                  className={inputCls}
                  value={form.total_amount}
                  onChange={e => updateField('total_amount', e.target.value)}
                />
              </div>

              {/* Payment method */}
              <div>
                <label className={labelCls}>Payment Method *</label>
                <select
                  required
                  className={selectCls}
                  value={form.payment_method}
                  onChange={e => updateField('payment_method', e.target.value)}
                >
                  {PAYMENT_METHODS.map(m => (
                    <option key={m} value={m}>{m.replace('_', ' ')}</option>
                  ))}
                </select>
              </div>

              {/* Bank account */}
              {needsBank && (
                <div>
                  <label className={labelCls}>Bank Account *</label>
                  <select
                    required
                    className={selectCls}
                    value={form.bank_account_id}
                    onChange={e => updateField('bank_account_id', e.target.value)}
                  >
                    <option value="">Select account…</option>
                    {bankAccounts.map(a => (
                      <option key={a.account_id} value={a.account_id}>
                        {a.account_nickname} — {a.bank_name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Cheque fields */}
              {needsCheque && (
                <>
                  <div>
                    <label className={labelCls}>Cheque Number *</label>
                    <input
                      type="text"
                      required
                      className={inputCls}
                      value={form.cheque_number}
                      onChange={e => updateField('cheque_number', e.target.value)}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Cheque Date *</label>
                    <DateInput
                      required
                      className={inputCls}
                      value={form.cheque_date}
                      onChange={e => updateField('cheque_date', e.target.value)}
                    />
                  </div>
                </>
              )}

              {/* Reference */}
              <div>
                <label className={labelCls}>Reference Number</label>
                <input
                  type="text"
                  placeholder="Optional"
                  className={inputCls}
                  value={form.reference_number}
                  onChange={e => updateField('reference_number', e.target.value)}
                />
              </div>

              {/* Payment slip */}
              <div>
                <label className={labelCls}>Payment Slip (optional)</label>
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-1 file:text-xs file:font-semibold"
                  onChange={e => setSlipFile(e.target.files?.[0] || null)}
                />
              </div>

              {/* Notes */}
              <div className="sm:col-span-2">
                <label className={labelCls}>Notes</label>
                <textarea
                  rows={2}
                  placeholder="Optional notes about this payment"
                  className={inputCls}
                  value={form.notes}
                  onChange={e => updateField('notes', e.target.value)}
                />
              </div>
            </div>
          </section>

          {/* ── Allocations ── */}
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide">Allocations</h3>
              <button
                type="button"
                onClick={addRow}
                className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
              >
                <Plus className="h-3.5 w-3.5" /> Add
              </button>
            </div>

            {rows.map((row, idx) => (
              <AllocationRow
                key={row.id}
                row={row}
                index={idx}
                bookings={bookings}
                patients={patients}
                onChange={updateRow}
                onRemove={removeRow}
                canRemove={rows.length > 1}
              />
            ))}

            {/* Running total */}
            <div className={`flex items-center justify-between rounded-2xl px-4 py-3 text-sm font-semibold ${
              parsedTotal === 0
                ? 'bg-slate-100 text-slate-500'
                : isBalanced
                  ? 'bg-emerald-50 text-emerald-700'
                  : remaining > 0
                    ? 'bg-amber-50 text-amber-700'
                    : 'bg-rose-50 text-rose-700'
            }`}>
              <span>
                Allocated: {fmt(allocatedTotal)} of {fmt(parsedTotal)}
              </span>
              <span>
                {parsedTotal > 0 && !isBalanced && (
                  remaining > 0
                    ? `${fmt(remaining)} remaining`
                    : `${fmt(Math.abs(remaining))} over`
                )}
                {isBalanced && '✓ Balanced'}
              </span>
            </div>
          </section>

          {/* ── Error ── */}
          {error && (
            <div className="rounded-xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700 border border-rose-200">
              {error}
            </div>
          )}

          {/* ── Actions ── */}
          <div className="flex items-center justify-end gap-3 border-t border-slate-200 pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!isBalanced || loading}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {loading ? 'Recording…' : 'Record Payment'}
            </button>
          </div>

        </form>
      </div>
    </div>
  );
};

export default RecordClientPaymentModal;
