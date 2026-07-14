import React, { useEffect, useState } from 'react';
import { Loader2, X, ArrowDownLeft, ArrowUpRight, PenLine } from 'lucide-react';
import apiClient from '../../../api/api';
import DateInput from '../../../components/common/DateInput';

const PAYMENT_METHODS = ['CASH', 'BANK_TRANSFER', 'CASH_DEPOSIT', 'CHEQUE', 'ONLINE_GATEWAY', 'OTHER'];

// Manual entries are limited to off-platform money movements.
// Must mirror MANUAL_CATEGORIES in backend/utils/transactionFlow.js.
const CREDIT_CATEGORIES = ['OTHER_INCOME'];
const DEBIT_CATEGORIES = ['OTHER_EXPENSE', 'AGENCY_FEE'];

const labelCls = 'block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1';
const inputCls = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500';
const selectCls = `${inputCls} cursor-pointer`;

const todayStr = () => new Date().toISOString().split('T')[0];

const AddTransactionModal = ({ onClose, onSuccess }) => {
  const [form, setForm] = useState({
    transaction_type: 'CREDIT',
    category: 'OTHER_INCOME',
    amount: '',
    transaction_date: todayStr(),
    payment_method: 'CASH',
    bank_account_id: '',
    cheque_number: '',
    cheque_date: '',
    reference_number: '',
    external_party: '',
    notes: '',
  });
  const [bankAccounts, setBankAccounts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    apiClient.getBankAccounts()
      .then(res => setBankAccounts(res.data || []))
      .catch(() => {});
  }, []);

  const updateField = (field, value) => setForm(f => ({ ...f, [field]: value }));

  const setDirection = (type) => {
    setForm(f => ({
      ...f,
      transaction_type: type,
      category: type === 'CREDIT' ? 'OTHER_INCOME' : 'OTHER_EXPENSE',
    }));
  };

  const categories = form.transaction_type === 'CREDIT' ? CREDIT_CATEGORIES : DEBIT_CATEGORIES;
  const needsBank = ['BANK_TRANSFER', 'CASH_DEPOSIT'].includes(form.payment_method);
  const needsCheque = form.payment_method === 'CHEQUE';
  const isCredit = form.transaction_type === 'CREDIT';

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const payload = {
      transaction_type: form.transaction_type,
      category: form.category,
      amount: parseFloat(form.amount),
      transaction_date: form.transaction_date || null,
      payment_method: form.payment_method,
      bank_account_id: needsBank ? form.bank_account_id : null,
      cheque_number: needsCheque ? form.cheque_number : null,
      cheque_date: needsCheque ? form.cheque_date : null,
      reference_number: form.reference_number || null,
      external_party: form.external_party.trim(),
      notes: form.notes || null,
    };

    try {
      setLoading(true);
      const response = await apiClient.createManualTransaction(payload);
      onSuccess(response.transaction || response);
    } catch (err) {
      setError(err.message || 'Failed to record transaction');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="relative w-full max-w-xl max-h-[92vh] overflow-y-auto rounded-3xl bg-white shadow-2xl">

        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4 rounded-t-3xl">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-100">
              <PenLine className="h-4 w-4 text-blue-600" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Add Manual Transaction</h2>
              <p className="text-xs text-slate-500">Record money received or paid outside the platform</p>
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

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">

          {/* Direction toggle */}
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setDirection('CREDIT')}
              className={`flex items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-sm font-semibold transition-colors ${
                isCredit
                  ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                  : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'
              }`}
            >
              <ArrowDownLeft className="h-4 w-4" /> Money In
            </button>
            <button
              type="button"
              onClick={() => setDirection('DEBIT')}
              className={`flex items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-sm font-semibold transition-colors ${
                !isCredit
                  ? 'border-rose-500 bg-rose-50 text-rose-700'
                  : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'
              }`}
            >
              <ArrowUpRight className="h-4 w-4" /> Money Out
            </button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {/* Amount */}
            <div>
              <label className={labelCls}>Amount (LKR) *</label>
              <input
                type="number"
                min="0.01"
                step="0.01"
                placeholder="0.00"
                required
                className={inputCls}
                value={form.amount}
                onChange={e => updateField('amount', e.target.value)}
              />
            </div>

            {/* Date */}
            <div>
              <label className={labelCls}>Transaction Date *</label>
              <DateInput
                required
                max={todayStr()}
                className={inputCls}
                value={form.transaction_date}
                onChange={e => updateField('transaction_date', e.target.value)}
              />
            </div>

            {/* Category */}
            <div>
              <label className={labelCls}>Category *</label>
              <select
                required
                className={selectCls}
                value={form.category}
                onChange={e => updateField('category', e.target.value)}
              >
                {categories.map(c => (
                  <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>
                ))}
              </select>
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
                  <option key={m} value={m}>{m.replace(/_/g, ' ')}</option>
                ))}
              </select>
            </div>

            {/* Counterparty */}
            <div className="sm:col-span-2">
              <label className={labelCls}>{isCredit ? 'Received From *' : 'Paid To *'}</label>
              <input
                type="text"
                required
                placeholder={isCredit ? 'e.g. Walk-in client, ABC Hospital' : 'e.g. Supplier, utility company, landlord'}
                className={inputCls}
                value={form.external_party}
                onChange={e => updateField('external_party', e.target.value)}
              />
            </div>

            {/* Bank account */}
            {needsBank && (
              <div className="sm:col-span-2">
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
            <div className="sm:col-span-2">
              <label className={labelCls}>Reference Number</label>
              <input
                type="text"
                placeholder="Optional — slip / receipt / invoice number"
                className={inputCls}
                value={form.reference_number}
                onChange={e => updateField('reference_number', e.target.value)}
              />
            </div>

            {/* Notes */}
            <div className="sm:col-span-2">
              <label className={labelCls}>Notes</label>
              <textarea
                rows={2}
                placeholder="What was this transaction for?"
                className={inputCls}
                value={form.notes}
                onChange={e => updateField('notes', e.target.value)}
              />
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="rounded-xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700 border border-rose-200">
              {error}
            </div>
          )}

          {/* Actions */}
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
              disabled={loading}
              className={`inline-flex items-center gap-2 rounded-xl px-5 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50 ${
                isCredit ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-rose-600 hover:bg-rose-700'
              }`}
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {loading ? 'Saving…' : isCredit ? 'Record Money In' : 'Record Money Out'}
            </button>
          </div>

        </form>
      </div>
    </div>
  );
};

export default AddTransactionModal;
