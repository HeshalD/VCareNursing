import React, { useEffect, useMemo, useState } from 'react';
import { X, Loader2, AlertTriangle, Plus, Trash2, Info } from 'lucide-react';
import apiClient from '../../../api/api';

const money = new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR', maximumFractionDigits: 2 });
const fmt = (v) => money.format(Number(v || 0));

const labelCls = 'block text-xs font-semibold text-slate-600 mb-1';
const inputCls = 'w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none disabled:bg-slate-100 disabled:text-slate-400';

const METHODS = [
  { value: 'BANK_TRANSFER', label: 'Bank Transfer' },
  { value: 'CASH_DEPOSIT', label: 'Cash Deposit' },
  { value: 'CASH', label: 'Cash' },
  { value: 'CHEQUE', label: 'Cheque' },
];
const SOURCE_LABELS = {
  CLIENT_PAYMENT: 'Client payment',
  QUOTE_PAYMENT: 'Quotation payment',
  BOOKING_PAYMENT: 'Booking payment',
  PRODUCT_INVOICE: 'Product invoice payment',
};

let rowSeq = 0;
const newRow = (a = {}) => ({
  key: `row-${rowSeq++}`,
  allocation_id: a.allocation_id || null,
  type: a.type || 'WALLET',
  amount: a.amount !== undefined ? String(a.amount) : '',
  booking_id: a.booking_id || '',
  description: a.description || '',
});

// Super-admin editor for the payment behind a receipt. Only what the admin changes is sent;
// the server voids the receipt and issues a replacement.
const EditPaymentModal = ({ receipt, onClose, onSaved }) => {
  const [ctx, setCtx] = useState(null);
  const [bankAccounts, setBankAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [form, setForm] = useState({
    total_amount: '', payment_method: '', bank_account_id: '', cheque_number: '', cheque_date: '',
    reference_number: '', payment_date: '', notes: '', reason: '',
  });
  const [rows, setRows] = useState([]);
  const [slipFile, setSlipFile] = useState(null);

  useEffect(() => {
    let alive = true;
    Promise.all([
      apiClient.getPaymentEditContext(receipt.receipt_id),
      apiClient.getBankAccounts().catch(() => ({ data: [] })),
    ])
      .then(([c, banks]) => {
        if (!alive) return;
        const data = c?.data;
        setCtx(data);
        setBankAccounts(banks?.data || []);
        const d = data?.details || {};
        setForm((f) => ({
          ...f,
          total_amount: String(data?.total_amount ?? ''),
          payment_method: d.payment_method || '',
          bank_account_id: d.bank_account_id || '',
          cheque_number: d.cheque_number || '',
          cheque_date: d.cheque_date || '',
          reference_number: d.reference_number || '',
          payment_date: d.payment_date || '',
          notes: d.notes || '',
        }));
        setRows((data?.allocations || []).map(newRow));
      })
      .catch((err) => alive && setLoadError(err?.message || 'Failed to load the payment.'))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [receipt.receipt_id]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const updateRow = (key, patch) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const hasAllocations = ctx?.source_type === 'CLIENT_PAYMENT';
  const rowsTotal = useMemo(() => rows.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0), [rows]);
  const needsBank = ['BANK_TRANSFER', 'CASH_DEPOSIT'].includes(form.payment_method);
  const methodChanged = ctx?.details && form.payment_method !== ctx.details.payment_method;

  const handleMethod = (value) => {
    setForm((f) => ({
      ...f,
      payment_method: value,
      // A different method never silently keeps the old bank account.
      bank_account_id: value === ctx?.details?.payment_method ? (ctx.details.bank_account_id || '') : '',
    }));
  };

  const submit = async () => {
    setError('');
    const d = ctx.details;
    if (form.reason.trim().length < 3) return setError('Please give a reason for this edit.');
    if (needsBank && !form.bank_account_id) return setError('Select the bank account for this payment method.');
    if (form.payment_method === 'CHEQUE' && (!form.cheque_number.trim() || !form.cheque_date)) {
      return setError('Cheque number and cheque date are required for cheque payments.');
    }

    const fields = { reason: form.reason.trim() };
    // Only send what actually changed - everything else stays exactly as recorded.
    if (form.payment_method !== d.payment_method) fields.payment_method = form.payment_method;
    // Cash always goes to Petty Cash (the server resolves it); any other method sends the bank
    // whenever the method or the account changed.
    if (form.payment_method !== 'CASH' && (methodChanged || (form.bank_account_id || '') !== (d.bank_account_id || ''))) {
      fields.bank_account_id = form.bank_account_id;
    }
    if (form.payment_method === 'CHEQUE') {
      if (form.cheque_number !== (d.cheque_number || '')) fields.cheque_number = form.cheque_number.trim();
      if (form.cheque_date !== (d.cheque_date || '')) fields.cheque_date = form.cheque_date;
      // Switching to cheque needs both even if one happens to match an old value.
      if (methodChanged) { fields.cheque_number = form.cheque_number.trim(); fields.cheque_date = form.cheque_date; }
    }
    if (form.reference_number !== (d.reference_number || '')) fields.reference_number = form.reference_number.trim();
    if (form.payment_date && form.payment_date !== d.payment_date) fields.payment_date = form.payment_date;
    if (form.notes !== (d.notes || '')) fields.notes = form.notes;

    if (ctx.amount_editable) {
      if (hasAllocations) {
        if (rows.length === 0) return setError('Add at least one allocation.');
        for (const r of rows) {
          if (!(parseFloat(r.amount) > 0)) return setError('Every allocation needs an amount above zero.');
          if (r.type === 'BOOKING' && !r.booking_id) return setError('Choose a booking for each "Booking" allocation.');
          if (r.type === 'OTHER' && !r.description.trim()) return setError('Describe what each "Other" allocation is for.');
        }
        const same =
          rows.length === (ctx.allocations || []).length &&
          rows.every((r, i) => {
            const o = ctx.allocations[i];
            return o && r.allocation_id === o.allocation_id && r.type === o.type &&
              (r.booking_id || null) === (o.booking_id || null) &&
              Math.abs((parseFloat(r.amount) || 0) - o.amount) < 0.005 &&
              (r.type !== 'OTHER' || r.description.trim() === (o.description || ''));
          });
        if (!same) {
          fields.total_amount = rowsTotal.toFixed(2);
          fields.allocations = rows.map((r) => ({
            allocation_id: r.allocation_id,
            type: r.type,
            amount: parseFloat(r.amount),
            booking_id: r.type === 'BOOKING' || r.type === 'NEW_BOOKING' ? (r.booking_id || null) : null,
            description: r.type === 'OTHER' ? r.description.trim() : undefined,
          }));
        }
      } else {
        const amt = parseFloat(form.total_amount);
        if (!(amt > 0)) return setError('Enter an amount above zero.');
        if (Math.abs(amt - ctx.total_amount) > 0.005) fields.total_amount = amt.toFixed(2);
      }
    }

    if (Object.keys(fields).length === 1 && !slipFile) return setError('Nothing has been changed.');

    const lowering = fields.total_amount && parseFloat(fields.total_amount) < ctx.total_amount;
    const ok = window.confirm(
      `Edit this payment?\n\nReceipt ${ctx.receipt_code} will be VOIDED and a new receipt issued in its place.` +
      (lowering ? '\n\nThe amount is being reduced. If that money has already been used to pay invoices, the most recent wallet payments will be re-opened (those invoices become unpaid again).' : '')
    );
    if (!ok) return;

    setSaving(true);
    try {
      const res = await apiClient.editPaymentReceipt(receipt.receipt_id, fields, slipFile);
      onSaved(res);
    } catch (err) {
      setError(err?.message || 'Failed to save the changes.');
    } finally {
      setSaving(false);
    }
  };

  const bookingLabel = (b) => `${b.booking_code || 'Booking'} — ${b.patient_name || 'Patient'} (${String(b.service_type || '').replace(/_/g, ' ')}) [${b.status}]`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" onMouseDown={(e) => e.target === e.currentTarget && !saving && onClose()}>
      <div className="w-full max-w-2xl max-h-[92vh] overflow-hidden rounded-2xl bg-white shadow-2xl flex flex-col">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-base font-bold text-slate-900">Edit payment</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {SOURCE_LABELS[receipt.source_type] || receipt.source_type} · receipt {receipt.receipt_code}
            </p>
          </div>
          <button onClick={onClose} disabled={saving} className="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-16 gap-2 text-slate-400"><Loader2 className="w-5 h-5 animate-spin" /> Loading…</div>
          ) : loadError ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{loadError}</div>
          ) : !ctx.editable ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 flex gap-2">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" /> {ctx.reason}
            </div>
          ) : (
            <>
              <div className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2.5 text-xs text-blue-800 flex gap-2">
                <Info className="w-4 h-4 mt-0.5 shrink-0" />
                <span>
                  Saving updates the ledger entries in place (marked <b>Edited</b>), voids receipt {ctx.receipt_code} and issues a new one.
                  Bank and petty-cash balances follow automatically.
                </span>
              </div>

              {/* Amount */}
              {hasAllocations ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className={labelCls + ' mb-0'}>Allocations — where this payment went</label>
                    <span className="text-xs text-slate-500">Total <b className="text-slate-800">{fmt(rowsTotal)}</b></span>
                  </div>
                  {rows.map((r) => (
                    <div key={r.key} className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2">
                      <div className="grid gap-2 sm:grid-cols-[1fr_9rem_auto] items-end">
                        <div>
                          <label className={labelCls}>Type</label>
                          <select
                            className={inputCls}
                            value={r.type}
                            disabled={r.type === 'NEW_BOOKING'}
                            onChange={(e) => updateRow(r.key, { type: e.target.value, booking_id: e.target.value === 'BOOKING' ? r.booking_id : '' })}
                          >
                            <option value="BOOKING">Apply to existing booking</option>
                            <option value="WALLET">Add to client wallet</option>
                            <option value="OTHER">Other (not linked to anything)</option>
                            {r.type === 'NEW_BOOKING' && <option value="NEW_BOOKING">New booking (created by this payment)</option>}
                          </select>
                        </div>
                        <div>
                          <label className={labelCls}>Amount (LKR)</label>
                          <input type="number" min="0" step="0.01" className={inputCls} value={r.amount}
                            onChange={(e) => updateRow(r.key, { amount: e.target.value })} onWheel={(e) => e.target.blur()} />
                        </div>
                        <button
                          type="button"
                          disabled={rows.length === 1 || r.type === 'NEW_BOOKING'}
                          onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
                          title={r.type === 'NEW_BOOKING' ? 'The allocation that created a booking cannot be removed' : 'Remove this allocation'}
                          className="p-2 rounded-md text-rose-500 hover:bg-rose-50 disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                      {r.type === 'BOOKING' && (
                        <select className={inputCls} value={r.booking_id} onChange={(e) => updateRow(r.key, { booking_id: e.target.value })}>
                          <option value="">Select a booking…</option>
                          {(ctx.bookings || []).map((b) => <option key={b.booking_id} value={b.booking_id}>{bookingLabel(b)}</option>)}
                        </select>
                      )}
                      {r.type === 'NEW_BOOKING' && (
                        <p className="text-xs text-slate-500">Booking {(ctx.allocations || []).find((a) => a.allocation_id === r.allocation_id)?.booking_code || ''} — only the amount can change.</p>
                      )}
                      {r.type === 'OTHER' && (
                        <input type="text" className={inputCls} placeholder="What is this payment for?" value={r.description}
                          onChange={(e) => updateRow(r.key, { description: e.target.value })} />
                      )}
                    </div>
                  ))}
                  <button type="button" onClick={() => setRows((rs) => [...rs, newRow({ type: 'WALLET' })])}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700">
                    <Plus className="w-3.5 h-3.5" /> Add allocation
                  </button>
                </div>
              ) : (
                <div>
                  <label className={labelCls}>Amount (LKR)</label>
                  <input type="number" min="0" step="0.01" className={inputCls} value={form.total_amount} disabled={!ctx.amount_editable}
                    onChange={(e) => set('total_amount', e.target.value)} onWheel={(e) => e.target.blur()} />
                  {ctx.amount_note && <p className="mt-1 text-xs text-slate-500">{ctx.amount_note}</p>}
                </div>
              )}

              {/* Details */}
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className={labelCls}>Payment method</label>
                  <select className={inputCls} value={form.payment_method} onChange={(e) => handleMethod(e.target.value)}>
                    {METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Payment date</label>
                  <input type="date" className={inputCls} value={form.payment_date} max={new Date().toLocaleDateString('en-CA')}
                    onChange={(e) => set('payment_date', e.target.value)} />
                </div>
                {form.payment_method !== 'CASH' && (
                  <div className="sm:col-span-2">
                    <label className={labelCls}>Bank account{needsBank ? ' *' : ' (optional)'}</label>
                    <select className={inputCls} value={form.bank_account_id} onChange={(e) => set('bank_account_id', e.target.value)}>
                      <option value="">Select a bank account…</option>
                      {bankAccounts.filter((b) => !b.is_petty_cash).map((b) => (
                        <option key={b.account_id} value={b.account_id}>{b.account_nickname || b.bank_name}{b.account_number ? ` — ${b.account_number}` : ''}</option>
                      ))}
                    </select>
                  </div>
                )}
                {form.payment_method === 'CASH' && (
                  <p className="sm:col-span-2 text-xs text-slate-500">Cash is recorded against the Petty Cash account.</p>
                )}
                {form.payment_method === 'CHEQUE' && (
                  <>
                    <div>
                      <label className={labelCls}>Cheque number *</label>
                      <input className={inputCls} value={form.cheque_number} onChange={(e) => set('cheque_number', e.target.value)} />
                    </div>
                    <div>
                      <label className={labelCls}>Cheque date *</label>
                      <input type="date" className={inputCls} value={form.cheque_date} onChange={(e) => set('cheque_date', e.target.value)} />
                    </div>
                  </>
                )}
                <div className="sm:col-span-2">
                  <label className={labelCls}>Reference number</label>
                  <input className={inputCls} value={form.reference_number} onChange={(e) => set('reference_number', e.target.value)} />
                </div>
                <div className="sm:col-span-2">
                  <label className={labelCls}>Notes</label>
                  <textarea rows={2} className={inputCls} value={form.notes} onChange={(e) => set('notes', e.target.value)} />
                </div>
                <div className="sm:col-span-2">
                  <label className={labelCls}>Replace payment slip (optional)</label>
                  <input type="file" accept="image/*,application/pdf" onChange={(e) => setSlipFile(e.target.files?.[0] || null)}
                    className="block w-full text-sm text-slate-600 file:mr-3 file:px-3 file:py-1.5 file:rounded-lg file:border file:border-slate-300 file:bg-white file:text-slate-700 hover:file:bg-slate-100" />
                  {ctx.details?.slip_url && !slipFile && (
                    <a href={ctx.details.slip_url} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-xs text-blue-600 hover:underline">View current slip</a>
                  )}
                </div>
              </div>

              <div>
                <label className={labelCls}>Reason for this edit *</label>
                <textarea rows={2} className={inputCls} value={form.reason} onChange={(e) => set('reason', e.target.value)}
                  placeholder="e.g. Amount was keyed in wrong — client paid 45,000, not 54,000" />
              </div>
            </>
          )}

          {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3">
          <button onClick={onClose} disabled={saving} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
          {ctx?.editable && (
            <button onClick={submit} disabled={saving || loading}
              className="inline-flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />} Save changes
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default EditPaymentModal;
