import React, { useEffect, useState } from 'react';
import { Loader2, X, Landmark, HandCoins, Undo2, Lock, AlertTriangle, CheckCircle2 } from 'lucide-react';
import apiClient from '../../../api/api';
import { ClientSearch } from './PaymentDeskModal';
import { fmt, labelCls, inputCls, CASH_OUT_LABELS } from './registerUtils';

// Tailwind only emits classes it can see literally, so tones are spelled out here.
const TONES = {
  blue: { badge: 'bg-blue-100 text-blue-600', button: 'bg-blue-600 hover:bg-blue-700' },
  rose: { badge: 'bg-rose-100 text-rose-600', button: 'bg-rose-600 hover:bg-rose-700' },
  amber: { badge: 'bg-amber-100 text-amber-600', button: 'bg-amber-600 hover:bg-amber-700' },
  emerald: { badge: 'bg-emerald-100 text-emerald-600', button: 'bg-emerald-600 hover:bg-emerald-700' },
};

// eslint-disable-next-line no-unused-vars -- Icon is rendered as <Icon /> below
const Shell = ({ title, subtitle, icon: Icon, tone = 'blue', onClose, children, width = 'max-w-lg' }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
    <div className={`relative max-h-[92vh] w-full ${width} overflow-y-auto rounded-3xl bg-white shadow-2xl`}>
      <div className="sticky top-0 z-10 flex items-center justify-between rounded-t-3xl border-b border-slate-200 bg-white px-6 py-4">
        <div className="flex items-center gap-3">
          <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${TONES[tone].badge}`}>
            <Icon className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900">{title}</h2>
            {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
          </div>
        </div>
        <button type="button" onClick={onClose} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
          <X className="h-5 w-5" />
        </button>
      </div>
      {children}
    </div>
  </div>
);

const ErrorBox = ({ message }) => (message
  ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{message}</div>
  : null);

const Footer = ({ onClose, busy, submitLabel, submitTone = 'blue', disabled }) => (
  <div className="flex items-center justify-end gap-3 border-t border-slate-200 pt-4">
    <button type="button" onClick={onClose} disabled={busy}
      className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
      Cancel
    </button>
    <button type="submit" disabled={busy || disabled}
      className={`inline-flex items-center gap-2 rounded-xl ${TONES[submitTone].button} px-5 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50`}>
      {busy && <Loader2 className="h-4 w-4 animate-spin" />} {submitLabel}
    </button>
  </div>
);

// ─── Open the day ────────────────────────────────────────────────────────────────────
export const OpenDayForm = ({ suggestedFloat, onOpened }) => {
  const [float, setFloat] = useState(suggestedFloat !== null && suggestedFloat !== undefined ? String(suggestedFloat) : '');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const hasSuggestion = suggestedFloat !== null && suggestedFloat !== undefined;
  const differs = hasSuggestion && float !== '' && Math.abs(parseFloat(float) - suggestedFloat) > 0.005;

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await apiClient.openCashRegister({ opening_float: parseFloat(float), note });
      onOpened();
    } catch (err) {
      setError(err.message || 'Could not open the register.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="mx-auto max-w-md space-y-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div>
        <h2 className="text-lg font-bold text-slate-900">Open today&rsquo;s register</h2>
        <p className="mt-1 text-sm text-slate-500">Count the cash in the drawer and enter it as the opening float.</p>
      </div>
      {hasSuggestion && (
        <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
          Yesterday&rsquo;s count closed at <span className="font-bold text-slate-900">{fmt(suggestedFloat)}</span>.
        </p>
      )}
      <div>
        <label className={labelCls}>Opening float (LKR) *</label>
        <input type="number" min="0" step="0.01" required autoFocus className={inputCls}
          value={float} onChange={(e) => setFloat(e.target.value)} onWheel={(e) => e.target.blur()} />
      </div>
      {differs && (
        <div>
          <label className={labelCls}>Why is it different? *</label>
          <textarea rows={2} required className={inputCls} value={note} onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Cash added from the safe" />
        </div>
      )}
      <ErrorBox message={error} />
      <button type="submit" disabled={busy || float === ''}
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-bold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50">
        {busy && <Loader2 className="h-4 w-4 animate-spin" />} Open register
      </button>
    </form>
  );
};

// ─── Close the day ───────────────────────────────────────────────────────────────────
export const CloseDayModal = ({ session, onClose, onClosed }) => {
  const expected = session.totals.expected_cash;
  const [counted, setCounted] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const hasCount = counted !== '' && !Number.isNaN(parseFloat(counted));
  const variance = hasCount ? Math.round((parseFloat(counted) - expected) * 100) / 100 : 0;
  const mismatch = hasCount && Math.abs(variance) >= 0.005;

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const res = await apiClient.closeCashRegister(session.session_id, { counted_cash: parseFloat(counted), variance_note: note });
      onClosed(res);
    } catch (err) {
      setError(err.message || 'Could not close the register.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell title="Close the day" subtitle="Count the drawer and balance it against the system" icon={Lock} tone="rose" onClose={onClose}>
      <form onSubmit={submit} className="space-y-5 px-6 py-5">
        <div className="space-y-2 rounded-2xl bg-slate-50 p-4 text-sm">
          <Row label="Opening float" value={fmt(session.totals.opening_float)} />
          <Row label="Cash received" value={`+ ${fmt(session.totals.cash_received)}`} />
          <Row label="Cash paid out" value={`− ${fmt(session.totals.cash_out_total)}`} />
          <div className="border-t border-slate-200 pt-2">
            <Row label="Cash that should be in the drawer" value={fmt(expected)} strong />
          </div>
        </div>

        <div>
          <label className={labelCls}>Cash counted in the drawer (LKR) *</label>
          <input type="number" min="0" step="0.01" required autoFocus className={inputCls}
            value={counted} onChange={(e) => setCounted(e.target.value)} onWheel={(e) => e.target.blur()} />
        </div>

        {hasCount && (
          <div className={`flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold ${
            mismatch ? 'bg-amber-50 text-amber-800' : 'bg-emerald-50 text-emerald-800'}`}>
            {mismatch ? <AlertTriangle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
            {mismatch
              ? `${variance < 0 ? 'Short' : 'Over'} by ${fmt(Math.abs(variance))}`
              : 'The count matches exactly'}
          </div>
        )}

        {mismatch && (
          <div>
            <label className={labelCls}>Explain the difference *</label>
            <textarea rows={3} required className={inputCls} value={note} onChange={(e) => setNote(e.target.value)}
              placeholder="A manager will review this day." />
            <p className="mt-1 text-xs text-slate-500">The day will be flagged for a manager to review.</p>
          </div>
        )}

        <p className="text-xs text-slate-500">Once closed, the day is locked. Only a super-admin can reopen it.</p>
        <ErrorBox message={error} />
        <Footer onClose={onClose} busy={busy} submitLabel="Close the day" submitTone="rose" disabled={!hasCount} />
      </form>
    </Shell>
  );
};

const Row = ({ label, value, strong }) => (
  <div className="flex items-center justify-between">
    <span className={strong ? 'font-bold text-slate-900' : 'text-slate-600'}>{label}</span>
    <span className={strong ? 'text-lg font-bold text-slate-900' : 'font-semibold text-slate-800'}>{value}</span>
  </div>
);

// ─── Money out of the drawer ─────────────────────────────────────────────────────────
export const CashOutModal = ({ session, onClose, onRecorded }) => {
  const [kind, setKind] = useState('PETTY_CASH');
  const [amount, setAmount] = useState('');
  const [paidTo, setPaidTo] = useState('');
  const [notes, setNotes] = useState('');
  const [bankId, setBankId] = useState('');
  const [client, setClient] = useState(null);
  const [banks, setBanks] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    apiClient.getBankAccounts()
      .then((res) => setBanks((res.data || []).filter((b) => !b.is_petty_cash && b.is_active)))
      .catch(() => {});
  }, []);

  const pickClient = async (id, summary) => setClient({ id, name: summary?.title || 'Client' });

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await apiClient.recordCashRegisterCashOut({
        kind,
        amount: parseFloat(amount),
        paid_to: paidTo,
        notes,
        client_id: client?.id,
        bank_account_id: bankId || undefined,
      });
      onRecorded();
    } catch (err) {
      setError(err.message || 'Could not record this.');
    } finally {
      setBusy(false);
    }
  };

  const KINDS = [
    { key: 'PETTY_CASH', label: 'Petty cash', icon: HandCoins },
    { key: 'CLIENT_REFUND', label: 'Client refund', icon: Undo2 },
    { key: 'BANKING', label: 'Cash to bank', icon: Landmark },
  ];

  return (
    <Shell title="Cash paid out" subtitle={`In the drawer now: ${fmt(session.totals.expected_cash)}`} icon={HandCoins} tone="amber" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4 px-6 py-5">
        <div className="grid grid-cols-3 gap-2">
          {/* eslint-disable-next-line no-unused-vars */}
          {KINDS.map(({ key, label, icon: Icon }) => (
            <button key={key} type="button" onClick={() => { setKind(key); setError(''); }}
              className={`flex flex-col items-center gap-1 rounded-2xl border px-2 py-3 text-xs font-semibold transition-colors ${
                kind === key ? 'border-amber-500 bg-amber-50 text-amber-800' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}>
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </div>

        <div>
          <label className={labelCls}>Amount (LKR) *</label>
          <input type="number" min="0.01" step="0.01" required className={inputCls}
            value={amount} onChange={(e) => setAmount(e.target.value)} onWheel={(e) => e.target.blur()} />
        </div>

        {kind === 'PETTY_CASH' && (
          <div>
            <label className={labelCls}>Paid to *</label>
            <input type="text" required className={inputCls} value={paidTo} onChange={(e) => setPaidTo(e.target.value)}
              placeholder="e.g. Stationery shop" />
          </div>
        )}

        {kind === 'CLIENT_REFUND' && (
          <div>
            <label className={labelCls}>Client being refunded *</label>
            {client ? (
              <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-2 text-sm">
                <span className="font-semibold text-slate-900">{client.name}</span>
                <button type="button" onClick={() => setClient(null)} className="text-xs font-semibold text-blue-600 hover:underline">Change</button>
              </div>
            ) : (
              <ClientSearch compact onPick={pickClient} />
            )}
          </div>
        )}

        {kind === 'BANKING' && (
          <div>
            <label className={labelCls}>Deposited to *</label>
            <select required className={`${inputCls} cursor-pointer`} value={bankId} onChange={(e) => setBankId(e.target.value)}>
              <option value="">Select account…</option>
              {banks.map((b) => (
                <option key={b.account_id} value={b.account_id}>{b.account_nickname} — {b.bank_name}</option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className={labelCls}>{kind === 'PETTY_CASH' ? 'What was it for? *' : kind === 'CLIENT_REFUND' ? 'Reason for the refund *' : 'Notes'}</label>
          <textarea rows={2} required={kind !== 'BANKING'} className={inputCls} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>

        {kind === 'CLIENT_REFUND' && (
          <p className="text-xs text-slate-500">
            This records the cash handed back. It does not change the client&rsquo;s wallet &mdash; adjust that separately if needed.
          </p>
        )}

        <ErrorBox message={error} />
        <Footer onClose={onClose} busy={busy} submitLabel={`Record ${CASH_OUT_LABELS[kind].toLowerCase()}`} submitTone="amber"
          disabled={kind === 'CLIENT_REFUND' && !client} />
      </form>
    </Shell>
  );
};

// ─── Void an entry ───────────────────────────────────────────────────────────────────
export const VoidEntryModal = ({ entry, onClose, onVoided }) => {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (entry.entry_type === 'PAYMENT') await apiClient.voidCashRegisterPayment(entry.receipt_id, reason);
      else await apiClient.voidCashRegisterCashOut(entry.transaction_id, reason);
      onVoided();
    } catch (err) {
      setError(err.message || 'Could not void this entry.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell title="Void this entry" subtitle={`${fmt(entry.amount)} · ${entry.party || ''}`} icon={Undo2} tone="rose" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4 px-6 py-5">
        <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {entry.entry_type === 'PAYMENT'
            ? 'The payment is cancelled and its receipt is voided. Any wallet credit it added to the client is taken back. The entry stays visible on today’s list, marked void.'
            : 'The entry stays on today’s list marked void, and the money returns to the drawer total.'}
        </p>
        <div>
          <label className={labelCls}>Reason *</label>
          <textarea rows={3} required autoFocus className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        <ErrorBox message={error} />
        <Footer onClose={onClose} busy={busy} submitLabel="Void entry" submitTone="rose" disabled={reason.trim().length < 3} />
      </form>
    </Shell>
  );
};

// ─── Reopen / review (manager actions on a past day) ─────────────────────────────────
export const NoteModal = ({ title, subtitle, label, placeholder, required = true, submitLabel, tone = 'blue', onClose, onSubmit }) => {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await onSubmit(text);
    } catch (err) {
      setError(err.message || 'Something went wrong.');
      setBusy(false);
    }
  };

  return (
    <Shell title={title} subtitle={subtitle} icon={Lock} tone={tone} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4 px-6 py-5">
        <div>
          <label className={labelCls}>{label}{required ? ' *' : ''}</label>
          <textarea rows={3} required={required} autoFocus className={inputCls} placeholder={placeholder}
            value={text} onChange={(e) => setText(e.target.value)} />
        </div>
        <ErrorBox message={error} />
        <Footer onClose={onClose} busy={busy} submitLabel={submitLabel} submitTone={tone} disabled={required && text.trim().length < 3} />
      </form>
    </Shell>
  );
};
