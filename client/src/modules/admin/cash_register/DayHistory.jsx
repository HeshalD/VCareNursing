import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, X, AlertTriangle, CheckCircle2, History, ShieldCheck, Unlock } from 'lucide-react';
import apiClient from '../../../api/api';
import { useAdminAuth } from '../../../context/AdminAuthContext';
import { NoteModal } from './RegisterDialogs';
import { EntriesTable } from './EntriesTable';
import { fmt, fmtDate, fmtDateTime, methodLabel } from './registerUtils';

const EVENT_LABELS = {
  OPENED: 'Opened',
  CLOSED: 'Closed',
  REOPENED: 'Reopened',
  REVIEWED: 'Variance reviewed',
  CASH_OUT: 'Cash paid out',
  CASH_OUT_VOIDED: 'Cash-out voided',
  PAYMENT_VOIDED: 'Payment voided',
};

const eventSummary = (e) => {
  const d = e.details || {};
  switch (e.event_type) {
    case 'OPENED': return `Float ${fmt(d.opening_float)}${d.note ? ` — ${d.note}` : ''}`;
    case 'CLOSED': return `Expected ${fmt(d.expected_cash)}, counted ${fmt(d.counted_cash)}${d.flagged ? `, variance ${fmt(d.variance)}` : ''}${d.note ? ` — ${d.note}` : ''}`;
    case 'REOPENED': return d.reason || '';
    case 'REVIEWED': return d.note || '';
    case 'CASH_OUT': return `${fmt(d.amount)} (${String(d.kind || '').replace(/_/g, ' ').toLowerCase()})${d.notes ? ` — ${d.notes}` : ''}`;
    case 'CASH_OUT_VOIDED':
    case 'PAYMENT_VOIDED': return `${fmt(d.amount)} — ${d.reason || ''}`;
    default: return '';
  }
};

// Manager view of earlier days: variance, flagged days waiting for review, full detail,
// and (super-admin) reopening a locked day.
const DayHistory = ({ onChanged }) => {
  const { hasPermission } = useAdminAuth();
  const canReview = hasPermission('CASH_REGISTER_REVIEW');
  const canReopen = hasPermission('CASH_REGISTER_REOPEN');

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [onlyFlagged, setOnlyFlagged] = useState(false);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [action, setAction] = useState(null); // { type: 'review' | 'reopen', session }

  const load = useCallback(async () => {
    try {
      const res = await apiClient.listCashRegisterSessions(onlyFlagged ? { flagged: 'true' } : {});
      setRows(res.data || []);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [onlyFlagged]);

  useEffect(() => { setLoading(true); load(); }, [load]);

  const openDetail = async (sessionId) => {
    setDetailLoading(true);
    setDetail({ loading: true });
    try {
      const res = await apiClient.getCashRegisterSession(sessionId);
      setDetail(res.data);
    } catch {
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const refreshAfterAction = async () => {
    setAction(null);
    setDetail(null);
    await load();
    onChanged?.();
  };

  return (
    <section className="rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-6 py-4">
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-slate-400" />
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-700">Previous days</h2>
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-600">
          <input type="checkbox" checked={onlyFlagged} onChange={(e) => setOnlyFlagged(e.target.checked)} />
          Only days with a variance
        </label>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
      ) : rows.length === 0 ? (
        <p className="px-6 py-10 text-center text-sm text-slate-500">No register days yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-6 py-3">Date</th>
                <th className="px-3 py-3 text-right">Received</th>
                <th className="px-3 py-3 text-right">Expected cash</th>
                <th className="px-3 py-3 text-right">Counted</th>
                <th className="px-3 py-3 text-right">Variance</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-6 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.session_id} className="hover:bg-slate-50">
                  <td className="px-6 py-3 font-semibold text-slate-900">{fmtDate(r.business_date)}</td>
                  <td className="px-3 py-3 text-right">{fmt(r.total_received)} <span className="text-xs text-slate-400">({r.payment_count})</span></td>
                  <td className="px-3 py-3 text-right">{r.status === 'CLOSED' ? fmt(r.expected_cash) : '—'}</td>
                  <td className="px-3 py-3 text-right">{r.status === 'CLOSED' ? fmt(r.counted_cash) : '—'}</td>
                  <td className={`px-3 py-3 text-right font-semibold ${r.flagged ? 'text-amber-700' : 'text-slate-500'}`}>
                    {r.status === 'CLOSED' ? fmt(r.variance) : '—'}
                  </td>
                  <td className="px-3 py-3">
                    {r.status === 'OPEN' ? (
                      <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">Open</span>
                    ) : r.flagged && !r.reviewed_at ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
                        <AlertTriangle className="h-3 w-3" /> Needs review
                      </span>
                    ) : r.flagged ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600">
                        <ShieldCheck className="h-3 w-3" /> Reviewed
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                        <CheckCircle2 className="h-3 w-3" /> Balanced
                      </span>
                    )}
                    {r.reopen_count > 0 && <span className="ml-2 text-xs text-slate-400">reopened ×{r.reopen_count}</span>}
                  </td>
                  <td className="px-6 py-3 text-right">
                    <button type="button" onClick={() => openDetail(r.session_id)} className="text-xs font-semibold text-blue-600 hover:underline">View</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {detail && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4">
          <div className="relative my-6 w-full max-w-4xl rounded-3xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <h2 className="text-base font-bold text-slate-900">{detail.business_date ? fmtDate(detail.business_date) : 'Register day'}</h2>
              <button type="button" onClick={() => setDetail(null)} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100"><X className="h-5 w-5" /></button>
            </div>

            {detailLoading || detail.loading ? (
              <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
            ) : (
              <div className="space-y-5 px-6 py-5">
                <div className="grid gap-3 sm:grid-cols-4">
                  <Stat label="Opening float" value={fmt(detail.opening_float)} />
                  <Stat label="Total received" value={fmt(detail.totals.total_received)} />
                  <Stat label="Expected cash" value={fmt(detail.expected_cash)} />
                  <Stat label={detail.counted_cash === null ? 'Counted' : 'Counted / variance'}
                    value={detail.counted_cash === null ? '—' : `${fmt(detail.counted_cash)} / ${fmt(detail.variance)}`}
                    tone={detail.flagged ? 'amber' : undefined} />
                </div>

                <div className="flex flex-wrap gap-2 text-xs">
                  {detail.totals.received_by_method.map((m) => (
                    <span key={m.payment_method} className="rounded-full bg-slate-100 px-3 py-1 font-semibold text-slate-700">
                      {methodLabel(m.payment_method)}: {fmt(m.total)}
                    </span>
                  ))}
                </div>

                {detail.variance_note && (
                  <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
                    <span className="font-semibold">Cashier&rsquo;s note:</span> {detail.variance_note}
                  </p>
                )}
                {detail.reviewed_at && (
                  <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-700">
                    Reviewed by {detail.reviewed_by_name} on {fmtDateTime(detail.reviewed_at)}{detail.review_note ? ` — ${detail.review_note}` : ''}
                  </p>
                )}

                <div className="flex flex-wrap gap-2">
                  {canReview && detail.status === 'CLOSED' && detail.flagged && !detail.reviewed_at && (
                    <button type="button" onClick={() => setAction({ type: 'review', session: detail })}
                      className="inline-flex items-center gap-2 rounded-xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700">
                      <ShieldCheck className="h-4 w-4" /> Mark variance reviewed
                    </button>
                  )}
                  {canReopen && detail.status === 'CLOSED' && (
                    <button type="button" onClick={() => setAction({ type: 'reopen', session: detail })}
                      className="inline-flex items-center gap-2 rounded-xl border border-rose-200 px-4 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50">
                      <Unlock className="h-4 w-4" /> Reopen this day
                    </button>
                  )}
                </div>

                <div>
                  <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Entries</h3>
                  <EntriesTable entries={detail.entries} readOnly />
                </div>

                <div>
                  <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Timeline</h3>
                  <ul className="space-y-1.5 text-sm">
                    {(detail.events || []).map((e, i) => (
                      <li key={i} className="flex gap-3">
                        <span className="w-28 shrink-0 text-xs text-slate-400">{fmtDateTime(e.created_at)}</span>
                        <span><span className="font-semibold text-slate-800">{EVENT_LABELS[e.event_type] || e.event_type}</span>
                          {e.actor_name ? <span className="text-slate-500"> · {e.actor_name}</span> : null}
                          {eventSummary(e) ? <span className="block text-xs text-slate-500">{eventSummary(e)}</span> : null}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {action?.type === 'review' && (
        <NoteModal
          title="Review this variance" subtitle={fmtDate(action.session.business_date)}
          label="Note" placeholder="What did you find? (optional)" required={false}
          submitLabel="Mark reviewed" tone="amber" onClose={() => setAction(null)}
          onSubmit={async (note) => { await apiClient.reviewCashRegister(action.session.session_id, note); await refreshAfterAction(); }}
        />
      )}
      {action?.type === 'reopen' && (
        <NoteModal
          title="Reopen this day" subtitle={fmtDate(action.session.business_date)}
          label="Reason for reopening" placeholder="e.g. A payment was missed and needs adding"
          submitLabel="Reopen day" tone="rose" onClose={() => setAction(null)}
          onSubmit={async (reason) => { await apiClient.reopenCashRegister(action.session.session_id, reason); await refreshAfterAction(); }}
        />
      )}
    </section>
  );
};

const Stat = ({ label, value, tone }) => (
  <div className={`rounded-2xl px-4 py-3 ${tone === 'amber' ? 'bg-amber-50' : 'bg-slate-50'}`}>
    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
    <p className="mt-1 text-base font-bold text-slate-900">{value}</p>
  </div>
);

export default DayHistory;
