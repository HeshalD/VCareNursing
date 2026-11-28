// Payouts tab of the admin staff profile: summary strip, searchable payout history grouped by
// month, a payout-details drawer and a two-step "Record payout" drawer (form → review).
// Presentational — all data, form state and handlers come from props, so it can be restyled or
// previewed on its own.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Check, Download, Landmark, Loader2, Pencil, Plus, Search, X } from 'lucide-react';
import DateInput, { todayISO } from '../../../components/common/DateInput';

// ── helpers ──────────────────────────────────────────────────────────────────
const num = (v) => Number(v || 0);
const fmtNum = (n) => num(n).toLocaleString('en-US', { minimumFractionDigits: Number.isInteger(num(n)) ? 0 : 2, maximumFractionDigits: 2 });
const rs = (n) => `Rs. ${fmtNum(n)}`;
const toDate = (v) => { if (!v) return null; const d = typeof v === 'string' && v.length === 10 ? new Date(`${v}T00:00:00`) : new Date(v); return isNaN(d) ? null : d; };
const fmtDate = (v) => { const d = toDate(v); return d ? d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'; };
const fmtShort = (v) => { const d = toDate(v); return d ? d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : '—'; };
const fmtTime = (v) => { const d = toDate(v); return d ? d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }) : ''; };
const isoDay = (v) => { const d = toDate(v); if (!d) return ''; const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };
const monthKey = (v) => isoDay(v).slice(0, 7);
const monthLabel = (key) => new Date(`${key}-01T00:00:00`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
const humanize = (v) => { const s = String(v || '').replace(/_/g, ' ').toLowerCase(); return s ? s[0].toUpperCase() + s.slice(1) : '—'; };
const statusKey = (s) => {
  const u = String(s || '').toUpperCase();
  if (['PAID', 'COMPLETED', 'SUCCESS', 'SUCCESSFUL'].includes(u)) return 'Paid';
  if (u === 'VOIDED') return 'Voided';
  if (['FAILED', 'REJECTED', 'CANCELLED', 'VOID', 'REVERSED'].includes(u)) return 'Failed';
  return 'Pending';
};
const STATUS_CLS = { Paid: 'bg-emerald-50 text-emerald-700', Pending: 'bg-amber-50 text-amber-700', Failed: 'bg-red-50 text-red-700', Voided: 'bg-slate-100 text-slate-600' };
const last4 = (n) => { const s = String(n || '').replace(/\s/g, ''); return s ? `•••• ${s.slice(-4)}` : ''; };
const companyLabel = (a) => ({ main: a.bank_name || a.account_nickname || 'Company account', line: [a.account_nickname || a.account_holder_name, last4(a.account_number)].filter(Boolean).join(' · ') });
const staffLabel = (a) => ({ main: a.bank_name || 'Bank account', line: [a.account_holder_name, last4(a.account_number)].filter(Boolean).join(' · ') });

const FIELD = 'h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100';
const BTN = 'inline-flex h-9 items-center justify-center whitespace-nowrap rounded-md border px-3.5 text-sm font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-1 disabled:opacity-60';
const BTN_TONE = {
  neutral: 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50',
  primary: 'border-blue-600 bg-blue-600 text-white hover:bg-blue-700',
  ghost: 'border-transparent bg-transparent text-blue-600 hover:bg-blue-50',
};
const Btn = ({ tone = 'neutral', className = '', ...p }) => <button type="button" className={`${BTN} ${BTN_TONE[tone]} ${className}`} {...p} />;
const Chip = ({ on, children, ...p }) => (
  <button type="button" aria-pressed={!!on} className={`rounded-full border px-3.5 py-1.5 text-[13px] font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${on ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'}`} {...p}>{children}</button>
);
const Cap = ({ children }) => <div className="text-xs font-bold uppercase tracking-wide text-slate-500">{children}</div>;
const Skeleton = ({ className = '' }) => <div className={`animate-pulse rounded-md bg-slate-100 ${className}`} />;
const Empty = ({ title, subtitle, children }) => (
  <div className="rounded-lg border border-dashed border-slate-200 px-6 py-8 text-center">
    <p className="text-sm font-semibold text-slate-600">{title}</p>
    {subtitle && <p className="mt-1 text-[13px] text-slate-500">{subtitle}</p>}
    {children}
  </div>
);

// Right-hand drawer: scrim, Esc/scrim/Close, focus moved in on open and restored on close.
function Drawer({ open, onClose, label, title, subtitle, children, footer }) {
  const ref = useRef(null);
  const lastFocus = useRef(null);
  useEffect(() => {
    if (open) {
      lastFocus.current = document.activeElement;
      ref.current?.querySelector('[data-autofocus]')?.focus() || ref.current?.querySelector('[data-close]')?.focus();
      const onKey = (e) => { if (e.key === 'Escape') onClose(); };
      document.addEventListener('keydown', onKey);
      return () => document.removeEventListener('keydown', onKey);
    }
    if (lastFocus.current) { try { lastFocus.current.focus(); } catch { /* gone */ } lastFocus.current = null; }
    return undefined;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  if (!open) return null;
  return (
    <>
      <button type="button" aria-label="Close" tabIndex={-1} className="fixed inset-0 z-40 bg-slate-900/35" onClick={onClose} />
      <div ref={ref} role="dialog" aria-modal="true" aria-label={label} className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[460px] flex-col bg-white shadow-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div><div className="text-base font-semibold text-slate-900">{title}</div>{subtitle && <div className="text-[13px] text-slate-500">{subtitle}</div>}</div>
          <Btn data-close onClick={onClose}><X className="mr-1 h-4 w-4" aria-hidden="true" />Close</Btn>
        </div>
        <div className="flex flex-1 flex-col gap-5 overflow-y-auto p-5 text-sm text-slate-700">{children}</div>
        {footer && <div className="flex gap-2.5 border-t border-slate-200 px-5 py-3.5">{footer}</div>}
      </div>
    </>
  );
}

const AccountCards = ({ items, selected, onSelect, idKey, labelFn }) => (
  <div className="flex flex-col gap-2">
    {items.map(a => {
      const on = String(selected) === String(a[idKey]);
      const l = labelFn(a);
      return (
        <button key={a[idKey]} type="button" aria-pressed={on} onClick={() => onSelect(a[idKey])}
          className={`block w-full rounded-lg border px-3.5 py-2.5 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${on ? 'border-blue-600 bg-blue-50' : 'border-slate-300 bg-white hover:bg-slate-50'}`}>
          <b className="text-sm text-slate-900">{l.main}</b>
          {l.line && <span className="block text-[13px] text-slate-500">{l.line}</span>}
        </button>
      );
    })}
  </div>
);

/**
 * @param payoutsSummary        { all_time_paid, paid_this_month, outstanding } | null
 * @param overviewPayoutSummary { total_payouts } fallback from the staff detail payload
 * @param currentEarnings       number — fallback for "Outstanding"
 * @param payouts               payout rows (staff_payments_tracking + company_account_name)
 * @param sectionErrors         { payouts?: string }
 * @param payoutForm            { amount, payment_date, company_bank_account_id, staff_bank_account_id, reference_number, notes }
 * @param companyBankAccounts   [{ account_id, account_nickname, account_holder_name, bank_name, account_number }]
 * @param bankAccounts          [{ staff_bank_account_id, account_holder_name, bank_name, account_number }]
 * @param onFieldChange         (field) => (event) => void
 * @param onSubmit              (event) => void
 * @param onReset               () => void
 * @param submitting, submitError, submitSuccess
 * Optional extras: loading, staffName, staffCode, onAddBankAccount (() => void),
 * advanceThreshold (number) and onSaveAdvanceThreshold (amount) => Promise — the minimum accrued
 * balance before this staff member may request an advance; editable only when the handler is given.
 * onVoidPayout (staffPaymentId, { reason, password }) => Promise — shown in the details drawer only
 * when given (STAFF_PAYOUT_VOID); returns the amount to the staff member's earnings.
 */
export default function StaffPayoutsTab({
  payoutsSummary = null, overviewPayoutSummary = {}, currentEarnings = 0,
  payouts = [], sectionErrors = {}, payoutForm = {}, companyBankAccounts = [], bankAccounts = [],
  onFieldChange = () => () => {}, onSubmit = (e) => e?.preventDefault?.(), onReset = () => {},
  submitting = false, submitError = '', submitSuccess = '',
  loading = false, staffName = '', staffCode = '', onAddBankAccount = null,
  advanceThreshold = null, onSaveAdvanceThreshold = null, onVoidPayout = null,
}) {
  const emptyVoid = { open: false, reason: '', password: '', submitting: false, error: '' };
  const [voidForm, setVoidForm] = useState(emptyVoid);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('All');
  const [showAll, setShowAll] = useState(false);
  const [detailId, setDetailId] = useState(null);
  const [recOpen, setRecOpen] = useState(false);
  const [step, setStep] = useState('form');
  const [amountError, setAmountError] = useState('');
  const [moreOpen, setMoreOpen] = useState(false);
  const [needPrefill, setNeedPrefill] = useState(false);
  const [highlightId, setHighlightId] = useState(null);
  const [toast, setToast] = useState('');
  const [thrEditing, setThrEditing] = useState(false);
  const [thrValue, setThrValue] = useState('');
  const [thrSaving, setThrSaving] = useState(false);
  const [thrError, setThrError] = useState('');
  const timers = useRef([]);
  const topIdAtSubmit = useRef(undefined);
  const prevSuccess = useRef(submitSuccess);
  const later = (fn, ms) => { timers.current.push(setTimeout(fn, ms)); };
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const flash = (m) => { setToast(m); later(() => setToast(''), 2600); };

  const sorted = useMemo(() => [...payouts].sort((a, b) => new Date(b.paid_at || b.created_at || 0) - new Date(a.paid_at || a.created_at || 0)), [payouts]);
  const paidRows = sorted.filter(p => statusKey(p.status) === 'Paid');
  const outstanding = num(payoutsSummary?.outstanding ?? currentEarnings);
  const allTime = payoutsSummary?.all_time_paid ?? overviewPayoutSummary.total_payouts ?? 0;
  const thisMonth = payoutsSummary?.paid_this_month ?? 0;
  const lastPayout = paidRows[0];

  const startThrEdit = () => { setThrValue(String(num(advanceThreshold))); setThrError(''); setThrEditing(true); };
  const saveThr = async () => {
    const v = parseFloat(thrValue);
    if (!(v >= 0)) { setThrError('Enter an amount of zero or more.'); return; }
    try {
      setThrSaving(true); setThrError('');
      await onSaveAdvanceThreshold(v);
      setThrEditing(false); flash('Advance threshold updated');
    } catch (e) { setThrError(e?.message || 'Failed to update the threshold.'); }
    finally { setThrSaving(false); }
  };

  // ── list ──
  const q = query.trim().toLowerCase();
  const counts = { All: sorted.length, Paid: 0, Pending: 0, Failed: 0, Voided: 0 };
  sorted.forEach(p => { counts[statusKey(p.status)] += 1; });
  const list = sorted.filter(p => (filter === 'All' || statusKey(p.status) === filter)
    && (!q || `${p.reference_number || ''} ${p.notes || ''} ${p.payment_method || ''} ${p.staff_payment_id || ''}`.toLowerCase().includes(q)));
  const filtering = filter !== 'All' || !!q;
  const LIMIT = 5;
  const shown = showAll || filtering ? list : list.slice(0, LIMIT);

  const exportCsv = () => {
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const head = ['Payout ID', 'Date', 'Reference', 'Notes', 'Method', 'Status', 'Amount (LKR)', 'Recorded by'];
    const lines = list.map(p => [p.staff_payment_id, isoDay(p.paid_at), p.reference_number, p.notes, humanize(p.payment_method), statusKey(p.status), num(p.amount_paid), p.paid_by_name || p.paid_by_email].map(esc).join(','));
    const url = URL.createObjectURL(new Blob([[head.map(esc).join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = `payouts${staffCode ? `-${staffCode}` : ''}.csv`; a.click(); URL.revokeObjectURL(url);
    flash(`Exported ${list.length} payout${list.length !== 1 ? 's' : ''} to CSV`);
  };

  // ── record payout drawer ──
  const set = (field, value) => onFieldChange(field)({ target: { value } });
  const openRecord = () => { setDetailId(null); setStep('form'); setAmountError(''); setMoreOpen(false); setNeedPrefill(true); setRecOpen(true); };
  const closeRecord = () => { setRecOpen(false); setStep('form'); setAmountError(''); };
  const resetForm = () => { onReset(); setAmountError(''); setNeedPrefill(true); };

  // Prefill (on open and after Reset): outstanding amount, single accounts preselected.
  useEffect(() => {
    if (!needPrefill || !recOpen) return;
    setNeedPrefill(false);
    if (!payoutForm.amount && outstanding > 0) set('amount', String(outstanding));
    if (!payoutForm.company_bank_account_id && companyBankAccounts.length === 1) set('company_bank_account_id', companyBankAccounts[0].account_id);
    if (!payoutForm.staff_bank_account_id && bankAccounts.length === 1) set('staff_bank_account_id', bankAccounts[0].staff_bank_account_id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needPrefill, recOpen, payoutForm.amount]);

  const amount = parseFloat(payoutForm.amount) || 0;
  const after = Math.max(outstanding - amount, 0);
  const dup = amount > 0 && payouts.some(p => !['Failed', 'Voided'].includes(statusKey(p.status)) &&isoDay(p.paid_at) === payoutForm.payment_date && num(p.amount_paid) === amount);
  const comp = companyBankAccounts.find(a => String(a.account_id) === String(payoutForm.company_bank_account_id));
  const stf = bankAccounts.find(a => String(a.staff_bank_account_id) === String(payoutForm.staff_bank_account_id));

  const review = () => {
    if (!(amount > 0)) { setAmountError('Enter an amount greater than zero.'); return; }
    setAmountError(''); setStep('review');
  };
  const confirm = () => {
    topIdAtSubmit.current = sorted[0]?.staff_payment_id ?? null;
    onSubmit({ preventDefault() {} });
  };

  // Success → close drawer, toast, then highlight the new top row once the list refetches.
  useEffect(() => {
    if (submitSuccess && !prevSuccess.current) {
      closeRecord();
      flash('Payout recorded');
    }
    prevSuccess.current = submitSuccess;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submitSuccess]);
  const topId = sorted[0]?.staff_payment_id;
  useEffect(() => {
    if (topIdAtSubmit.current !== undefined && topId && topId !== topIdAtSubmit.current) {
      topIdAtSubmit.current = undefined;
      setHighlightId(topId); setFilter('All'); setQuery('');
      later(() => setHighlightId(null), 3000);
    }
  }, [topId]);

  const detail = sorted.find(p => p.staff_payment_id === detailId) || null;
  const closeDetail = () => { if (voidForm.submitting) return; setDetailId(null); setVoidForm(emptyVoid); };
  const submitVoid = async () => {
    if (!voidForm.reason.trim()) { setVoidForm(v => ({ ...v, error: 'Enter a reason for voiding this payout.' })); return; }
    if (!voidForm.password) { setVoidForm(v => ({ ...v, error: 'Enter your password to confirm.' })); return; }
    setVoidForm(v => ({ ...v, submitting: true, error: '' }));
    try {
      await onVoidPayout(detail.staff_payment_id, { reason: voidForm.reason.trim(), password: voidForm.password });
      setVoidForm(emptyVoid);
      flash(`Payout of ${rs(detail.amount_paid)} voided`);
    } catch (e) {
      setVoidForm(v => ({ ...v, submitting: false, password: '', error: e?.message || 'Failed to void the payout.' }));
    }
  };
  const noStaffBank = bankAccounts.length === 0;

  // ── render ──
  const GRID = 'grid items-center gap-x-4 px-5 grid-cols-[120px_minmax(160px,1fr)_140px_120px_150px]';
  const subtitle = [staffName, staffCode, 'everything paid to this staff member'].filter(Boolean).join(' · ');

  if (loading) {
    return <div className="flex flex-col gap-4" aria-busy="true"><Skeleton className="h-9 w-64" /><Skeleton className="h-28" /><Skeleton className="h-10 w-80" /><Skeleton className="h-72" /></div>;
  }

  let currentMonth = '';
  return (
    <div className="flex flex-col gap-4 text-slate-900">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[22px] font-semibold">Payouts</h2>
          <div className="mt-0.5 text-[13px] text-slate-500">{subtitle}</div>
        </div>
        <div className="flex gap-2.5">
          <Btn onClick={exportCsv} disabled={!list.length}><Download className="mr-1.5 h-4 w-4" aria-hidden="true" />Export CSV</Btn>
          <Btn tone="primary" onClick={openRecord}><Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />Record payout</Btn>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white px-6 py-5">
        <div className="flex flex-wrap gap-x-14 gap-y-5">
          <div><Cap>All-time paid</Cap><div className="mt-1 text-2xl font-bold tabular-nums">{rs(allTime)}</div></div>
          <div><Cap>Paid this month</Cap><div className="mt-1 text-2xl font-bold tabular-nums">{rs(thisMonth)}</div></div>
          <div>
            <Cap>Outstanding</Cap>
            <div className="mt-1 flex items-center gap-2.5">
              <span className={`text-2xl font-bold tabular-nums ${outstanding > 0 ? 'text-amber-700' : ''}`}>{rs(outstanding)}</span>
              {outstanding > 0
                ? <Btn tone="ghost" className="h-7 px-2" onClick={openRecord}>Pay now</Btn>
                : <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700"><Check className="h-3 w-3" aria-hidden="true" />All paid up</span>}
            </div>
          </div>
        </div>
        {advanceThreshold != null && (
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-slate-100 pt-4">
            <div className="min-w-0">
              <Cap>Advance threshold</Cap>
              <div className="text-[13px] text-slate-500">Minimum accrued balance before {staffName || 'this staff member'} can request an advance.</div>
            </div>
            {thrEditing ? (
              <div className="flex flex-wrap items-center gap-2">
                <label htmlFor="advance-threshold" className="sr-only">Advance threshold (LKR)</label>
                <input id="advance-threshold" type="number" min="0" step="100" value={thrValue} autoFocus onWheel={(e) => e.target.blur()}
                  onChange={(e) => { setThrValue(e.target.value); setThrError(''); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') saveThr(); if (e.key === 'Escape') setThrEditing(false); }}
                  aria-invalid={!!thrError} className={`${FIELD} w-40 font-semibold ${thrError ? 'border-red-600' : ''}`} />
                <Btn tone="primary" onClick={saveThr} disabled={thrSaving}>{thrSaving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" />}Save</Btn>
                <Btn onClick={() => setThrEditing(false)} disabled={thrSaving}>Cancel</Btn>
                {thrError && <span role="alert" className="w-full text-[13px] text-red-700">{thrError}</span>}
              </div>
            ) : (
              <div className="flex items-center gap-2.5">
                <span className="text-lg font-bold tabular-nums">{rs(advanceThreshold)}</span>
                {onSaveAdvanceThreshold && <Btn tone="ghost" className="h-7 px-2" onClick={startThrEdit}><Pencil className="mr-1 h-3.5 w-3.5" aria-hidden="true" />Edit</Btn>}
              </div>
            )}
          </div>
        )}
        <div className="mt-3 text-[13px] text-slate-500">{lastPayout ? `Last payout: ${fmtShort(lastPayout.paid_at)} · ${rs(lastPayout.amount_paid)}` : 'No payouts yet'}</div>
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        <div className="relative max-w-[340px] flex-[1_1_240px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <input value={query} onChange={e => setQuery(e.target.value)} aria-label="Search payouts" placeholder="Search reference, notes, method…" className={`${FIELD} pl-9`} />
        </div>
        {['All', 'Paid', 'Pending', 'Failed', 'Voided'].filter(k => k !== 'Voided' || counts.Voided > 0).map(k =><Chip key={k} on={filter === k} onClick={() => { setFilter(k); setShowAll(false); }}>{k} · {counts[k]}</Chip>)}
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        {sectionErrors.payouts ? (
          <div className="p-5"><Empty title="Failed to load payouts" subtitle={sectionErrors.payouts} /></div>
        ) : sorted.length === 0 ? (
          <div className="p-5"><Empty title="No payouts recorded" /></div>
        ) : (
          <div className="overflow-x-auto">
            <div className="min-w-[760px]">
              <div className={`${GRID} min-h-[38px] border-y border-slate-200 bg-slate-50 text-xs font-bold uppercase tracking-wide text-slate-500`}>
                <div>Date</div><div>Reference</div><div>Method</div><div>Status</div><div className="text-right">Amount (LKR)</div>
              </div>
              {shown.map(p => {
                const mk = monthKey(p.paid_at);
                const header = mk !== currentMonth ? (currentMonth = mk, (
                  <div key={`m-${mk}`} className={`${GRID} min-h-[40px] border-b border-slate-200 bg-slate-50 text-[13px] font-bold text-slate-600`}>
                    <div className="col-span-4">{mk ? monthLabel(mk) : '—'}</div>
                    <div className="text-right font-semibold tabular-nums">Paid {fmtNum(list.filter(x => monthKey(x.paid_at) === mk && statusKey(x.status) === 'Paid').reduce((n, x) => n + num(x.amount_paid), 0))}</div>
                  </div>
                )) : null;
                const st = statusKey(p.status);
                return (
                  <React.Fragment key={p.staff_payment_id}>
                    {header}
                    <button type="button" onClick={() => setDetailId(p.staff_payment_id)}
                      className={`${GRID} min-h-[56px] w-full border-b border-slate-100 text-left text-sm text-slate-700 transition-colors hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-600 ${highlightId === p.staff_payment_id ? 'bg-blue-50' : 'bg-white'}`}>
                      <div>{fmtDate(p.paid_at)}</div>
                      <div className="truncate text-slate-900">{[p.reference_number, p.notes].filter(Boolean).join(' · ') || '—'}</div>
                      <div>{humanize(p.payment_method)}</div>
                      <div><span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_CLS[st]}`}>{st}</span></div>
                      <div className={`text-right font-semibold tabular-nums ${st === 'Voided' ? 'text-slate-400 line-through' : 'text-slate-900'}`}>{fmtNum(p.amount_paid)}</div>
                    </button>
                  </React.Fragment>
                );
              })}
              {!list.length && (
                <div className="p-10 text-center text-sm text-slate-500">No payouts match.
                  <Btn className="ml-2" onClick={() => { setQuery(''); setFilter('All'); }}>Clear filters</Btn>
                </div>
              )}
              {!showAll && !filtering && list.length > LIMIT && (
                <div className="border-t border-slate-100 p-3.5 text-center"><Btn onClick={() => setShowAll(true)}>Show {list.length - LIMIT} more</Btn></div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── payout details drawer ───────────────────────────────────────── */}
      <Drawer
        open={!!detail} onClose={closeDetail} label="Payout details" title="Payout details" subtitle={detail?.staff_payment_id}
        footer={detail && onVoidPayout && statusKey(detail.status) === 'Paid' ? (voidForm.open ? (
          <>
            <Btn onClick={() => setVoidForm(emptyVoid)} disabled={voidForm.submitting}>Cancel</Btn>
            <Btn className="flex-1 border-red-600 bg-red-600 text-white hover:bg-red-700" onClick={submitVoid} disabled={voidForm.submitting}>
              {voidForm.submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}Void payout
            </Btn>
          </>
        ) : (
          <Btn className="flex-1 border-red-200 text-red-700 hover:bg-red-50" onClick={() => setVoidForm({ ...emptyVoid, open: true })}>Void this payout</Btn>
        )) : null}
      >
        {detail && (() => {
          const st = statusKey(detail.status);
          const cLabel = detail.company_account_name || (companyBankAccounts.find(a => String(a.account_id) === String(detail.company_bank_account_id)) && companyLabel(companyBankAccounts.find(a => String(a.account_id) === String(detail.company_bank_account_id))).main);
          const sAcc = bankAccounts.find(a => String(a.staff_bank_account_id) === String(detail.staff_bank_account_id));
          return (
            <>
              <div>
                <Cap>Amount</Cap>
                <div className="mt-0.5 text-[28px] font-bold tabular-nums">{rs(detail.amount_paid)}</div>
                <span className={`mt-1.5 inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_CLS[st]}`}>{st}</span>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><Cap>Paid on</Cap>{fmtDate(detail.paid_at)}{fmtTime(detail.paid_at) ? `, ${fmtTime(detail.paid_at)}` : ''}</div>
                <div><Cap>Method</Cap>{humanize(detail.payment_method)}</div>
                <div><Cap>Recorded by</Cap>{detail.paid_by_name || detail.paid_by_email || '—'}</div>
                <div><Cap>Reference</Cap>{detail.reference_number || '—'}</div>
              </div>
              <div className="overflow-hidden rounded-lg border border-slate-200">
                <div className="border-b border-slate-100 px-3.5 py-3"><Cap>From (company)</Cap><b className="text-slate-900">{cLabel || '—'}</b></div>
                <div className="px-3.5 py-3"><Cap>To (staff)</Cap><b className="text-slate-900">{sAcc ? [staffLabel(sAcc).main, staffLabel(sAcc).line].filter(Boolean).join(' · ') : '—'}</b></div>
              </div>
              <div><Cap>Notes</Cap><div className="leading-relaxed">{detail.notes || 'No notes.'}</div></div>
              {st === 'Voided' && (
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-3">
                  <Cap>Voided</Cap>
                  <div>{fmtDate(detail.voided_at)}{fmtTime(detail.voided_at) ? `, ${fmtTime(detail.voided_at)}` : ''}{detail.voided_by_name ? ` · ${detail.voided_by_name}` : ''}</div>
                  <div className="mt-1 leading-relaxed text-slate-600">{detail.void_reason || '—'}</div>
                </div>
              )}
              {voidForm.open && (
                <div className="flex flex-col gap-3.5 rounded-lg border border-red-200 bg-red-50/40 p-3.5">
                  <div className="flex items-start gap-2 text-[13px] text-red-800">
                    <AlertTriangle className="mt-0.5 h-4 w-4 flex-none" aria-hidden="true" />
                    <span>
                      {rs(detail.amount_paid)} goes back into this staff member's outstanding earnings and is removed from the company account's ledger.
                      The salary sheet already sent on WhatsApp is not recalled. Only void a payout that was recorded wrongly or never actually sent.
                    </span>
                  </div>
                  {voidForm.error && <div role="alert" className="text-[13px] text-red-700">{voidForm.error}</div>}
                  <div>
                    <label htmlFor="void-reason" className="text-[13px] font-semibold text-slate-600">Reason</label>
                    <input id="void-reason" type="text" autoFocus value={voidForm.reason} disabled={voidForm.submitting}
                      onChange={(e) => setVoidForm(v => ({ ...v, reason: e.target.value, error: '' }))}
                      placeholder="e.g. Entered twice / wrong staff member" className={`${FIELD} mt-1.5`} />
                  </div>
                  <div>
                    <label htmlFor="void-password" className="text-[13px] font-semibold text-slate-600">Your password</label>
                    <input id="void-password" type="password" autoComplete="current-password" value={voidForm.password} disabled={voidForm.submitting}
                      onChange={(e) => setVoidForm(v => ({ ...v, password: e.target.value, error: '' }))}
                      onKeyDown={(e) => { if (e.key === 'Enter') submitVoid(); }}
                      className={`${FIELD} mt-1.5`} />
                  </div>
                </div>
              )}
            </>
          );
        })()}
      </Drawer>

      {/* ── record payout drawer ────────────────────────────────────────── */}
      <Drawer
        open={recOpen} onClose={closeRecord} label="Record payout"
        title={step === 'form' ? 'Record payout' : 'Review payout'}
        subtitle={step === 'form' ? `${staffName ? `${staffName} · ` : ''}writes to the payroll ledger` : 'Check the details before it is recorded'}
        footer={step === 'form' ? (
          <>
            <Btn onClick={resetForm}>Reset</Btn>
            <Btn tone="primary" className="flex-1" onClick={review}>Review payout</Btn>
          </>
        ) : (
          <>
            <Btn onClick={() => setStep('form')} disabled={submitting}>Back</Btn>
            <Btn tone="primary" className="flex-1" onClick={confirm} disabled={submitting}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}Confirm payout
            </Btn>
          </>
        )}
      >
        {submitError && (
          <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700"><AlertTriangle className="mt-0.5 h-4 w-4 flex-none" aria-hidden="true" />{submitError}</div>
        )}
        {step === 'form' ? (
          <>
            <div>
              <label htmlFor="payout-amount" className="text-[13px] font-semibold text-slate-600">Amount (LKR)</label>
              <input id="payout-amount" data-autofocus type="number" min="0" step="0.01" value={payoutForm.amount ?? ''} onWheel={(e) => e.target.blur()}
                onChange={(e) => { onFieldChange('amount')(e); setAmountError(''); }} placeholder="0.00"
                aria-invalid={!!amountError} className={`${FIELD} mt-1.5 text-lg font-semibold ${amountError ? 'border-red-600' : ''}`} />
              <div className="mt-1.5 flex items-center justify-between gap-2">
                <span className="text-[13px] text-slate-500">{amount > 0 ? `Outstanding after this payout: ${rs(after)}` : `Outstanding now: ${rs(outstanding)}`}</span>
                <Btn tone="ghost" className="h-7 px-2" onClick={() => { set('amount', String(outstanding)); setAmountError(''); }}>Pay full outstanding</Btn>
              </div>
              {amountError && <div className="mt-1 text-[13px] text-red-700">{amountError}</div>}
              {amount > outstanding && amount > 0 && <div className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-[13px] text-amber-700">This is {rs(amount - outstanding)} more than the outstanding balance.</div>}
              {dup && <div className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-[13px] text-amber-700">A payout of this amount is already recorded for this date.</div>}
            </div>
            <div>
              <label htmlFor="payout-date" className="text-[13px] font-semibold text-slate-600">Payment date</label>
              <div className="mt-1.5"><DateInput id="payout-date" value={payoutForm.payment_date ?? ''} max={todayISO()} onChange={onFieldChange('payment_date')} className={FIELD} required /></div>
            </div>
            <div>
              <div className="mb-1.5 text-[13px] font-semibold text-slate-600">Pay from (company account)</div>
              {companyBankAccounts.length === 0 ? <Empty title="No company bank accounts" /> : (
                <AccountCards items={companyBankAccounts} selected={payoutForm.company_bank_account_id} idKey="account_id" labelFn={companyLabel} onSelect={(id) => set('company_bank_account_id', id)} />
              )}
            </div>
            <div>
              <div className="mb-1.5 text-[13px] font-semibold text-slate-600">Pay to (staff account)</div>
              {noStaffBank ? (
                <Empty title="This staff member has no bank account" subtitle="Add one before recording a bank transfer.">
                  {onAddBankAccount && <Btn className="mt-3" onClick={() => { closeRecord(); onAddBankAccount(); }}><Landmark className="mr-1.5 h-4 w-4" aria-hidden="true" />Add bank account</Btn>}
                </Empty>
              ) : (
                <AccountCards items={bankAccounts} selected={payoutForm.staff_bank_account_id} idKey="staff_bank_account_id" labelFn={staffLabel} onSelect={(id) => set('staff_bank_account_id', id)} />
              )}
            </div>
            <div>
              <button type="button" aria-expanded={moreOpen} onClick={() => setMoreOpen(o => !o)} className="text-sm font-semibold text-blue-600 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600">
                {moreOpen ? 'Hide reference and notes' : 'Add reference or notes'}
              </button>
              {moreOpen && (
                <div className="mt-2.5 flex flex-col gap-3.5">
                  <div><label htmlFor="payout-ref" className="text-[13px] font-semibold text-slate-600">Reference</label>
                    <input id="payout-ref" type="text" value={payoutForm.reference_number ?? ''} onChange={onFieldChange('reference_number')} placeholder="TRF / receipt no." className={`${FIELD} mt-1.5`} /></div>
                  <div><label htmlFor="payout-notes" className="text-[13px] font-semibold text-slate-600">Notes</label>
                    <input id="payout-notes" type="text" value={payoutForm.notes ?? ''} onChange={onFieldChange('notes')} placeholder="Anything worth remembering" className={`${FIELD} mt-1.5`} /></div>
                </div>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <Cap>You are recording</Cap>
              <div className="mt-0.5 text-[28px] font-bold tabular-nums">{rs(amount)}</div>
              <div className="text-[13px] text-slate-500">on {fmtDate(payoutForm.payment_date)}</div>
            </div>
            <div className="overflow-hidden rounded-lg border border-slate-200">
              <div className="border-b border-slate-100 px-3.5 py-3"><Cap>From</Cap><b className="text-slate-900">{comp ? [companyLabel(comp).main, companyLabel(comp).line].filter(Boolean).join(' · ') : '—'}</b></div>
              <div className="px-3.5 py-3"><Cap>To</Cap><b className="text-slate-900">{stf ? [staffLabel(stf).main, staffLabel(stf).line].filter(Boolean).join(' · ') : '—'}</b></div>
            </div>
            {payoutForm.reference_number && <div><Cap>Reference</Cap>{payoutForm.reference_number}</div>}
            {payoutForm.notes && <div><Cap>Notes</Cap>{payoutForm.notes}</div>}
            <div className="text-[13px] text-slate-500">Outstanding after this payout: {rs(after)}. This writes to the payroll ledger.</div>
          </>
        )}
      </Drawer>

      {toast && <div role="status" className="fixed bottom-6 left-1/2 z-[80] -translate-x-1/2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm text-slate-50">{toast}</div>}
    </div>
  );
}
