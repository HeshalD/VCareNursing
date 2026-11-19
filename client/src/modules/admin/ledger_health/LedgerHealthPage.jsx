import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { HeartPulse, Play, Loader2, ChevronLeft, ChevronRight, CheckCircle2, AlertTriangle, AlertCircle, Undo2, X, ExternalLink } from 'lucide-react';
import AdminLayout from '../components/AdminLayout';
import apiClient from '../../../api/api';
import useAutoRefresh from '../../../hooks/useAutoRefresh';
import { useAdminAuth } from '../../../context/AdminAuthContext';

// Ledger Health: the nightly, read-only audit of the books (backend/services/ledgerHealth.js).
// Nothing here changes money. A finding is a pointer to something that needs a person to look.

const inputCls = 'px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-colors';
const primaryBtnCls = 'inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors';
const ghostBtnCls = 'inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors';

const money = (v) => (v === null || v === undefined || v === '' ? '' : `Rs. ${Number(v).toLocaleString('en-LK', { maximumFractionDigits: 2 })}`);
const when = (v) => (v ? new Date(v).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');
const day = (v) => (v ? new Date(v).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');

const STATES = [
  { id: 'open', label: 'Open' },
  { id: 'acknowledged', label: 'Acknowledged' },
  { id: 'resolved', label: 'Resolved' },
];

const SeverityPill = ({ severity }) => (
  severity === 'ERROR'
    ? <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-700 ring-1 ring-inset ring-rose-200"><AlertCircle className="h-3 w-3" />Error</span>
    : <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 ring-1 ring-inset ring-amber-200"><AlertTriangle className="h-3 w-3" />Warning</span>
);

const Stat = ({ label, value, tone }) => (
  <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
    <p className="text-[11px] font-medium uppercase tracking-wider text-slate-400">{label}</p>
    <p className={`mt-1 text-2xl font-semibold tabular-nums ${tone}`}>{value ?? 0}</p>
  </div>
);

// Where to go to look at what a finding is about.
const linkFor = (f) => {
  if (f.booking_id) return `/admin/bookings/${f.booking_id}/detail`;
  if (f.client_id) return `/admin/users/${f.client_id}`;
  return null;
};

export default function LedgerHealthPage() {
  const { hasPermission } = useAdminAuth();
  const canManage = hasPermission('LEDGER_HEALTH_MANAGE');

  const [summary, setSummary] = useState(null);
  const [findings, setFindings] = useState([]);
  const [pagination, setPagination] = useState({ total: 0, page: 1, limit: 50 });
  const [loading, setLoading] = useState(true);
  const [state, setState] = useState('open');
  const [severity, setSeverity] = useState('');
  const [checkKey, setCheckKey] = useState('');
  const [search, setSearch] = useState('');
  const [searchDraft, setSearchDraft] = useState('');
  const [error, setError] = useState('');
  const [starting, setStarting] = useState(false);
  const [ackFor, setAckFor] = useState(null);
  const [ackNote, setAckNote] = useState('');
  const [ackBusy, setAckBusy] = useState(false);

  const loadSummary = useCallback(async () => {
    try {
      const res = await apiClient.getLedgerHealthSummary();
      setSummary(res.data);
    } catch (err) { setError(err.message || 'Failed to load the summary'); }
  }, []);

  const loadFindings = useCallback(async (page = 1, { silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const params = { page, limit: 50, state };
      if (severity) params.severity = severity;
      if (checkKey) params.check_key = checkKey;
      if (search) params.search = search;
      const res = await apiClient.getLedgerHealthFindings(params);
      setFindings(res.data || []);
      setPagination(res.pagination || { total: 0, page, limit: 50 });
    } catch (err) { setError(err.message || 'Failed to load findings'); }
    finally { if (!silent) setLoading(false); }
  }, [state, severity, checkKey, search]);

  useEffect(() => { loadSummary(); }, [loadSummary]);
  useEffect(() => { loadFindings(1); }, [loadFindings]);

  // While a run is going, keep checking so its results appear without a refresh.
  useAutoRefresh(() => { loadSummary(); loadFindings(pagination.page, { silent: true }); }, { intervalMs: 5000, enabled: Boolean(summary?.running) && !ackFor });

  const run = async () => {
    setStarting(true); setError('');
    try {
      await apiClient.runLedgerHealth();
      await loadSummary();
    } catch (err) { setError(err.message || 'Could not start the check'); }
    finally { setStarting(false); }
  };

  const submitAck = async () => {
    if (!ackNote.trim()) return;
    setAckBusy(true);
    try {
      await apiClient.acknowledgeLedgerHealthFinding(ackFor.finding_id, ackNote.trim());
      setAckFor(null); setAckNote('');
      await Promise.all([loadSummary(), loadFindings(pagination.page, { silent: true })]);
    } catch (err) { setError(err.message || 'Could not acknowledge'); }
    finally { setAckBusy(false); }
  };

  const reopen = async (f) => {
    try {
      await apiClient.unacknowledgeLedgerHealthFinding(f.finding_id);
      await Promise.all([loadSummary(), loadFindings(pagination.page, { silent: true })]);
    } catch (err) { setError(err.message || 'Could not reopen'); }
  };

  const last = summary?.last_run;
  const counts = summary?.counts || {};
  const checks = summary?.checks || [];
  const totalPages = Math.max(1, Math.ceil(pagination.total / pagination.limit));
  const activeCheck = checks.find((c) => c.key === checkKey);

  return (
    <AdminLayout title="Ledger Health" subtitle="A nightly, read-only check of invoices, the ledger and client totals">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <p className="text-sm text-slate-500">
          {summary?.running
            ? <span className="inline-flex items-center gap-1.5 text-blue-600"><Loader2 className="h-4 w-4 animate-spin" />Check running…</span>
            : last
              ? <>Last check {when(last.finished_at)} · {last.trigger_source === 'CRON' ? 'nightly' : 'run by hand'} · {Math.round((last.duration_ms || 0) / 100) / 10}s{last.status !== 'OK' ? ` · ${last.status}` : ''}</>
              : 'No check has run yet.'}
        </p>
        {canManage && (
          <button onClick={run} disabled={starting || summary?.running} className={primaryBtnCls}>
            {starting || summary?.running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}Run check now
          </button>
        )}
      </div>

      {last?.notes && last.status !== 'OK' && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-800 whitespace-pre-wrap">
          Some checks could not run, so their results below may be out of date:{'\n'}{last.notes}
        </div>
      )}
      {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-xs text-red-700">{error}</div>}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <Stat label="Open errors" value={counts.errors} tone={counts.errors ? 'text-rose-600' : 'text-emerald-600'} />
        <Stat label="Open warnings" value={counts.warnings} tone={counts.warnings ? 'text-amber-600' : 'text-emerald-600'} />
        <Stat label="Acknowledged" value={counts.acknowledged} tone="text-slate-700" />
        <Stat label="Resolved, last 7 days" value={counts.resolved_7d} tone="text-emerald-600" />
      </div>

      <div className="flex flex-wrap items-end gap-3 mb-3">
        <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5">
          {STATES.map((s) => (
            <button key={s.id} onClick={() => setState(s.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${state === s.id ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>{s.label}</button>
          ))}
        </div>
        <select value={severity} onChange={(e) => setSeverity(e.target.value)} className={inputCls}>
          <option value="">Errors and warnings</option>
          <option value="ERROR">Errors only</option>
          <option value="WARNING">Warnings only</option>
        </select>
        <select value={checkKey} onChange={(e) => setCheckKey(e.target.value)} className={`${inputCls} max-w-xs`}>
          <option value="">All checks</option>
          {checks.map((c) => <option key={c.key} value={c.key}>{c.title}{c.open ? ` (${c.open})` : ''}</option>)}
        </select>
        <form onSubmit={(e) => { e.preventDefault(); setSearch(searchDraft.trim()); }} className="flex gap-2">
          <input value={searchDraft} onChange={(e) => setSearchDraft(e.target.value)} placeholder="Client, code or invoice" className={`${inputCls} w-56`} />
          {search && <button type="button" onClick={() => { setSearch(''); setSearchDraft(''); }} className={ghostBtnCls}>Clear</button>}
        </form>
      </div>
      {activeCheck && <p className="mb-3 text-xs text-slate-500">{activeCheck.help}</p>}

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-left text-[11px] font-medium uppercase tracking-wider text-slate-400">
                <th className="px-4 py-3 w-24">Severity</th>
                <th className="px-4 py-3">What is wrong</th>
                <th className="px-4 py-3">Client</th>
                <th className="px-4 py-3 text-right">Amount</th>
                <th className="px-4 py-3 w-28">First seen</th>
                <th className="px-4 py-3 w-36" />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="px-4 py-12 text-center text-slate-400"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></td></tr>
              ) : findings.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-12 text-center text-slate-400">
                  <CheckCircle2 className="mx-auto mb-2 h-6 w-6 text-emerald-500" />
                  {state === 'open' ? 'Nothing needs attention.' : 'Nothing here.'}
                </td></tr>
              ) : findings.map((f) => {
                const to = linkFor(f);
                return (
                  <tr key={f.finding_id} className="border-t border-slate-100 align-top hover:bg-slate-50/60">
                    <td className="px-4 py-3"><SeverityPill severity={f.severity} /></td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-800">{f.title}</p>
                      <p className="mt-0.5 text-xs text-slate-500">{f.detail}</p>
                      {f.acknowledged_at && (
                        <p className="mt-1 text-xs text-slate-500">
                          <span className="font-medium text-slate-600">Acknowledged by {f.acknowledged_by_name || 'admin'}:</span> {f.acknowledge_note}
                        </p>
                      )}
                      {f.resolved_at && <p className="mt-1 text-xs text-emerald-600">Resolved {when(f.resolved_at)}</p>}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">
                      {f.client_name ? <><p className="font-medium text-slate-700">{f.client_name}</p><p className="text-slate-400">{f.client_code}{f.booking_code ? ` · ${f.booking_code}` : ''}</p></> : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-700">{money(f.amount)}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">{day(f.first_seen_at)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1.5">
                        {to && <Link to={to} className={ghostBtnCls} title="Open the client or booking"><ExternalLink className="h-3.5 w-3.5" />Open</Link>}
                        {canManage && !f.resolved_at && (f.acknowledged_at
                          ? <button onClick={() => reopen(f)} className={ghostBtnCls} title="Move back to open"><Undo2 className="h-3.5 w-3.5" />Reopen</button>
                          : <button onClick={() => { setAckFor(f); setAckNote(''); }} className={ghostBtnCls}>Acknowledge</button>)}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {pagination.total > pagination.limit && (
          <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-xs text-slate-500">
            <span>{pagination.total} findings</span>
            <div className="flex items-center gap-2">
              <button disabled={pagination.page <= 1} onClick={() => loadFindings(pagination.page - 1)} className={ghostBtnCls}><ChevronLeft className="h-3.5 w-3.5" /></button>
              <span>Page {pagination.page} of {totalPages}</span>
              <button disabled={pagination.page >= totalPages} onClick={() => loadFindings(pagination.page + 1)} className={ghostBtnCls}><ChevronRight className="h-3.5 w-3.5" /></button>
            </div>
          </div>
        )}
      </div>

      {ackFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={() => !ackBusy && setAckFor(null)}>
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2"><HeartPulse className="h-4 w-4 text-blue-600" /><h3 className="text-sm font-semibold text-slate-800">Acknowledge this finding</h3></div>
              <button onClick={() => setAckFor(null)} className="text-slate-400 hover:text-slate-600"><X className="h-4 w-4" /></button>
            </div>
            <p className="mt-2 text-xs text-slate-500">{ackFor.detail}</p>
            <label className="mt-4 block text-xs font-medium text-slate-600">Why is this fine, or who is fixing it?</label>
            <textarea value={ackNote} onChange={(e) => setAckNote(e.target.value)} rows={3} autoFocus
              className={`${inputCls} mt-1 w-full`} placeholder="For example: rate was changed on purpose after the client agreed" />
            <p className="mt-1 text-[11px] text-slate-400">It stays acknowledged until the problem goes away. If it comes back, it shows as new again.</p>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setAckFor(null)} disabled={ackBusy} className={ghostBtnCls}>Cancel</button>
              <button onClick={submitAck} disabled={ackBusy || !ackNote.trim()} className={primaryBtnCls}>{ackBusy && <Loader2 className="h-4 w-4 animate-spin" />}Acknowledge</button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
