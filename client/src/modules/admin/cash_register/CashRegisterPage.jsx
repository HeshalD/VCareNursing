import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Calculator, Loader2, Plus, HandCoins, Lock, AlertTriangle, CheckCircle2, Banknote, Wallet, ArrowDownLeft, ArrowUpRight,
} from 'lucide-react';
import AdminLayout from '../components/AdminLayout';
import apiClient from '../../../api/api';
import { useAdminAuth } from '../../../context/AdminAuthContext';
import useAutoRefresh from '../../../hooks/useAutoRefresh';
import EditPaymentModal from '../payments/EditPaymentModal';
import PaymentDeskModal from './PaymentDeskModal';
import { OpenDayForm, CloseDayModal, CashOutModal, VoidEntryModal } from './RegisterDialogs';
import { EntriesTable } from './EntriesTable';
import DayHistory from './DayHistory';
import { fmt, fmtDate, fmtDateTime, methodLabel, userIdFromToken } from './registerUtils';

const CashRegisterPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { hasPermission, adminToken } = useAdminAuth();
  const canOperate = hasPermission('CASH_REGISTER_OPERATE');
  const canViewAll = hasPermission('CASH_REGISTER_VIEW_ALL');
  const canManageAll = hasPermission('CASH_REGISTER_MANAGE_ENTRIES');
  const myUserId = useMemo(() => userIdFromToken(adminToken), [adminToken]);

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState(null);

  const [showDesk, setShowDesk] = useState(false);
  const [deskClientId, setDeskClientId] = useState(null);
  const [showCashOut, setShowCashOut] = useState(false);
  const [showClose, setShowClose] = useState(false);
  const [voiding, setVoiding] = useState(null);
  const [editing, setEditing] = useState(null);
  const [historyKey, setHistoryKey] = useState(0);

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setError('');
    try {
      const res = await apiClient.getCashRegisterCurrent();
      setData(res.data);
    } catch (err) {
      if (!silent) setError(err.message || 'Could not load the register.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const session = data?.open_session || null;
  const isStale = !!data?.stale_open_session;

  // While this screen is open, every payment recorded from it is stamped with the open day.
  // Cleared the moment the screen goes away so ordinary admin payments are never affected.
  useEffect(() => {
    apiClient.setRegisterSession(session && !isStale ? session.session_id : null);
    return () => apiClient.setRegisterSession(null);
  }, [session?.session_id, isStale]); // eslint-disable-line react-hooks/exhaustive-deps

  // A brand-new walk-in registered through the Users page comes back here with ?client=<id>.
  const returnedClient = searchParams.get('client');
  useEffect(() => {
    if (returnedClient && session && !isStale) {
      setDeskClientId(returnedClient);
      setShowDesk(true);
      const next = new URLSearchParams(searchParams);
      next.delete('client');
      setSearchParams(next, { replace: true });
    }
  }, [returnedClient, session?.session_id]); // eslint-disable-line react-hooks/exhaustive-deps

  const anyModalOpen = showDesk || showCashOut || showClose || !!voiding || !!editing;
  useAutoRefresh(() => load({ silent: true }), { intervalMs: 15000, enabled: !!session && !anyModalOpen });

  const flash = (text, tone = 'emerald') => {
    setNotice({ text, tone });
    setTimeout(() => setNotice(null), 6000);
  };

  const canTouch = (entry) => canOperate && !isStale && (canManageAll || entry.cashier_id === myUserId);

  const refreshAll = async () => {
    await load({ silent: true });
    setHistoryKey((k) => k + 1);
  };

  // Receipts are written just after a payment's response - give the row a moment, then refresh.
  const handlePaymentRecorded = () => {
    flash('Payment recorded.');
    setTimeout(() => load({ silent: true }), 1200);
  };

  const totals = session?.totals;

  return (
    <AdminLayout
      title="Cash Register"
      subtitle={session ? `${fmtDate(session.business_date)} · opened by ${session.opened_by_name || 'staff'} at ${fmtDateTime(session.opened_at)}` : 'Frontdesk till'}
      actions={session && canOperate && !isStale ? (
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => { setDeskClientId(null); setShowDesk(true); }}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700">
            <Plus className="h-4 w-4" /> Take payment
          </button>
          <button type="button" onClick={() => setShowCashOut(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
            <HandCoins className="h-4 w-4 text-amber-600" /> Cash out
          </button>
          <button type="button" onClick={() => setShowClose(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-sm font-medium text-rose-700 hover:bg-rose-50">
            <Lock className="h-4 w-4" /> Close day
          </button>
        </div>
      ) : null}
    >
      <div className="mx-auto max-w-6xl space-y-6 px-1 py-2">
        {notice && (
          <div className={`rounded-xl border px-4 py-3 text-sm font-medium ${
            notice.tone === 'emerald' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
            {notice.text}
          </div>
        )}
        {error && <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{error}</div>}

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-24 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading the register…</div>
        ) : !data ? null : session ? (
          <>
            {isStale && (
              <div className="flex items-start gap-3 rounded-2xl border border-amber-300 bg-amber-50 px-5 py-4 text-sm text-amber-900">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
                <div>
                  <p className="font-bold">The register for {fmtDate(session.business_date)} was never closed.</p>
                  <p className="mt-0.5">Count the drawer and close that day before today&rsquo;s can be opened. Payments are paused until then.</p>
                  {canOperate && (
                    <button type="button" onClick={() => setShowClose(true)}
                      className="mt-3 rounded-lg bg-amber-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-amber-700">
                      Close {fmtDate(session.business_date)}
                    </button>
                  )}
                </div>
              </div>
            )}

            <section className="grid gap-4 lg:grid-cols-3">
              <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-1">
                <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500">
                  <Banknote className="h-4 w-4 text-emerald-600" /> Cash that should be in the drawer
                </p>
                <p className="mt-2 text-4xl font-extrabold tracking-tight text-slate-900">{fmt(totals.expected_cash)}</p>
                <dl className="mt-4 space-y-1.5 text-sm">
                  <Line label="Opening float" value={fmt(totals.opening_float)} />
                  <Line label="Cash received" value={`+ ${fmt(totals.cash_received)}`} tone="emerald" />
                  <Line label="Cash paid out" value={`− ${fmt(totals.cash_out_total)}`} tone="rose" />
                </dl>
              </div>

              <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-2">
                <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500">
                  <Wallet className="h-4 w-4 text-blue-600" /> Today&rsquo;s takings &mdash; all payment methods
                </p>
                <div className="mt-2 flex flex-wrap items-end gap-x-6 gap-y-1">
                  <p className="text-4xl font-extrabold tracking-tight text-slate-900">{fmt(totals.total_received)}</p>
                  <p className="pb-1 text-sm text-slate-500">{totals.payment_count} payment{totals.payment_count === 1 ? '' : 's'}</p>
                </div>
                <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {totals.received_by_method.length === 0 ? (
                    <p className="text-sm text-slate-400">No payments yet today.</p>
                  ) : totals.received_by_method.map((m) => (
                    <div key={m.payment_method} className={`rounded-2xl px-4 py-3 ${m.payment_method === 'CASH' ? 'bg-emerald-50' : 'bg-slate-50'}`}>
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{methodLabel(m.payment_method)}</p>
                      <p className="mt-0.5 text-base font-bold text-slate-900">{fmt(m.total)}</p>
                      <p className="text-xs text-slate-400">{m.payment_count} payment{m.payment_count === 1 ? '' : 's'}{m.payment_method === 'CASH' ? ' · in the drawer' : ''}</p>
                    </div>
                  ))}
                </div>
                {totals.cash_out_total > 0 && (
                  <p className="mt-3 flex items-center gap-2 text-xs text-slate-500">
                    <ArrowUpRight className="h-3.5 w-3.5 text-rose-500" />
                    Paid out of the drawer: petty cash {fmt(totals.cash_out_by_kind.PETTY_CASH)} · refunds {fmt(totals.cash_out_by_kind.CLIENT_REFUND)} · banked {fmt(totals.cash_out_by_kind.BANKING)}
                  </p>
                )}
              </div>
            </section>

            <section>
              <div className="mb-2 flex items-center gap-2">
                <ArrowDownLeft className="h-4 w-4 text-slate-400" />
                <h2 className="text-sm font-bold uppercase tracking-wide text-slate-700">Today&rsquo;s entries</h2>
              </div>
              <EntriesTable
                entries={session.entries}
                readOnly={!canOperate || isStale}
                canManage={canTouch}
                onEdit={setEditing}
                onVoid={setVoiding}
              />
            </section>
          </>
        ) : data.closed_today_session ? (
          <ClosedToday session={data.closed_today_session} />
        ) : canOperate ? (
          <div className="py-6">
            <OpenDayForm suggestedFloat={data.suggested_float} onOpened={() => { flash('Register opened.'); load(); }} />
          </div>
        ) : (
          <div className="rounded-3xl border border-slate-200 bg-white px-6 py-16 text-center">
            <Calculator className="mx-auto h-8 w-8 text-slate-300" />
            <p className="mt-3 text-sm text-slate-500">Today&rsquo;s register hasn&rsquo;t been opened yet.</p>
          </div>
        )}

        {canViewAll && <DayHistory key={historyKey} onChanged={() => load({ silent: true })} />}
      </div>

      {showDesk && session && (
        <PaymentDeskModal
          initialClientId={deskClientId}
          onClose={() => { setShowDesk(false); setDeskClientId(null); load({ silent: true }); }}
          onPaymentRecorded={handlePaymentRecorded}
        />
      )}

      {showCashOut && session && (
        <CashOutModal
          session={session}
          onClose={() => setShowCashOut(false)}
          onRecorded={() => { setShowCashOut(false); flash('Cash paid out recorded.'); refreshAll(); }}
        />
      )}

      {showClose && session && (
        <CloseDayModal
          session={session}
          onClose={() => setShowClose(false)}
          onClosed={(res) => {
            setShowClose(false);
            flash(res.message, res.data?.flagged ? 'amber' : 'emerald');
            refreshAll();
          }}
        />
      )}

      {voiding && (
        <VoidEntryModal
          entry={voiding}
          onClose={() => setVoiding(null)}
          onVoided={() => { setVoiding(null); flash('Entry voided.'); refreshAll(); }}
        />
      )}

      {editing && (
        <EditPaymentModal
          receipt={{ receipt_id: editing.receipt_id, receipt_code: editing.receipt_code, source_type: editing.source_type }}
          loadContext={(id) => apiClient.getCashRegisterPaymentEditContext(id)}
          saveEdit={(id, fields, file) => apiClient.editCashRegisterPayment(id, fields, file)}
          onClose={() => setEditing(null)}
          onSaved={(res) => { setEditing(null); flash(res?.message || 'Payment updated.'); setTimeout(refreshAll, 800); }}
        />
      )}
    </AdminLayout>
  );
};

const Line = ({ label, value, tone }) => (
  <div className="flex items-center justify-between">
    <span className="text-slate-500">{label}</span>
    <span className={`font-semibold ${tone === 'emerald' ? 'text-emerald-700' : tone === 'rose' ? 'text-rose-700' : 'text-slate-800'}`}>{value}</span>
  </div>
);

const ClosedToday = ({ session }) => (
  <div className="mx-auto max-w-lg space-y-4 rounded-3xl border border-slate-200 bg-white p-6 text-center shadow-sm">
    <div className={`mx-auto flex h-12 w-12 items-center justify-center rounded-full ${session.flagged ? 'bg-amber-100' : 'bg-emerald-100'}`}>
      {session.flagged ? <AlertTriangle className="h-6 w-6 text-amber-600" /> : <CheckCircle2 className="h-6 w-6 text-emerald-600" />}
    </div>
    <div>
      <h2 className="text-lg font-bold text-slate-900">Today&rsquo;s register is closed</h2>
      <p className="mt-1 text-sm text-slate-500">Closed by {session.closed_by_name || 'staff'} at {fmtDateTime(session.closed_at)}</p>
    </div>
    <dl className="space-y-1.5 rounded-2xl bg-slate-50 p-4 text-left text-sm">
      <Line label="Total received" value={fmt(session.totals.total_received)} />
      <Line label="Expected cash" value={fmt(session.expected_cash)} />
      <Line label="Counted cash" value={fmt(session.counted_cash)} />
      <Line label="Variance" value={fmt(session.variance)} tone={session.flagged ? 'rose' : undefined} />
    </dl>
    {session.variance_note && <p className="text-sm text-slate-600">&ldquo;{session.variance_note}&rdquo;</p>}
    <p className="text-xs text-slate-500">The day is locked. A super-admin can reopen it from Previous days if a correction is needed.</p>
  </div>
);

export default CashRegisterPage;
