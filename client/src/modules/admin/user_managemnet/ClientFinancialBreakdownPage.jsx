import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, ChevronUp, Download, RefreshCw, Search, X } from 'lucide-react';
import AdminLayout from '../components/AdminLayout';
import EditedAmountBadge from '../components/EditedAmountBadge';
import apiClient from '../../../api/api';

// One page for all four client money breakdowns (Payments Made, Total Invoiced,
// Overdue Amount, Wallet Balance). The server (services/clientFinancialBreakdown.js)
// lists the ledger entries behind each headline figure and says whether they add up
// to it. Layout: tabs, a main column of accordion sections, and a sticky aside that
// answers "does it add up?" first. Clicking a row opens a detail drawer.

const money = new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR', maximumFractionDigits: 2 });
const fmtMoney = (v) => money.format(Number(v || 0));
// Table cells and the drawer show the bare number; the currency lives in the header.
const numFmt = new Intl.NumberFormat('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtNum = (v) => numFmt.format(Number(v || 0));

const fmtDate = (v) => {
  if (!v) return '—';
  const d = new Date(String(v).length === 10 ? `${v}T00:00:00` : v);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};
const fmtTime = (v) => {
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
};
const humanize = (v) => (v ? String(v).replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase()) : '—');

const METRICS = [
  { metric: 'payments-made', path: 'payments-made', label: 'Payments Made' },
  { metric: 'total-invoiced', path: 'total-invoiced', label: 'Total Invoiced' },
  { metric: 'overdue', path: 'overdue-amount', label: 'Overdue Amount' },
  { metric: 'wallet', path: 'wallet-balance', label: 'Wallet Balance' },
];

// Sections whose tone is counted/adjustment feed the headline figure; the rest are context.
const isIncluded = (s) => s.tone === 'counted' || s.tone === 'adjustment';
const AMOUNT_TYPES = ['money', 'signed', 'running'];
const RIGHT_TYPES = AMOUNT_TYPES;

const COL_WIDTH = {
  datetime: '150px', date: '110px', mono: '110px', category: '130px', method: '120px',
  booking: '110px', notes: 'minmax(140px,1fr)', money: '130px', signed: '130px', running: '130px', flag: '76px',
};
const gridCols = (columns) => columns.map((c) => COL_WIDTH[c.type] || 'minmax(100px,1fr)').join(' ');

const sectionSubtotal = (s) => {
  if (s.total && s.total.value !== undefined && s.total.value !== null) return Number(s.total.value);
  const col = s.columns.find((c) => c.type === 'signed') || s.columns.find((c) => c.type === 'money');
  return col ? s.rows.reduce((n, r) => n + Number(r[col.key] || 0), 0) : 0;
};
const amountOf = (section, row) => {
  const col = section.columns.find((c) => c.type === 'signed') || section.columns.find((c) => c.type === 'money');
  return col ? row[col.key] : null;
};
const dateValueOf = (section, row) => {
  const col = section.columns.find((c) => c.type === 'datetime' || c.type === 'date');
  return col ? row[col.key] : null;
};
const signedMoney = (n) => `${n < 0 ? '−' : ''}${fmtMoney(Math.abs(n))}`;

function Cell({ col, row }) {
  const value = row[col.key];
  const blank = value === null || value === undefined || value === '';

  switch (col.type) {
    case 'datetime':
      return blank ? '—' : (
        <span className="whitespace-nowrap">
          {fmtDate(value)}
          <span className="ml-1.5 text-[11px] text-slate-400">{fmtTime(value)}</span>
        </span>
      );
    case 'date':
      return <span className="whitespace-nowrap">{fmtDate(value)}</span>;
    case 'mono':
      return <span className="font-mono text-xs text-slate-600">{blank ? '—' : value}</span>;
    case 'category':
      return blank ? '—' : (
        <span className="inline-block whitespace-nowrap rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-600">{humanize(value)}</span>
      );
    case 'method':
      return <span className="whitespace-nowrap text-slate-600">{blank ? '—' : humanize(value)}</span>;
    case 'booking':
      // Inside a row button, so rendered as text; the drawer carries the real link.
      return row.booking_id ? (
        <span className="font-medium text-blue-600 whitespace-nowrap">{value || 'Booking'}</span>
      ) : '—';
    case 'notes':
      return blank ? '—' : <span className="block max-w-[260px] truncate text-slate-600" title={value}>{value}</span>;
    case 'money':
      return blank ? <span className="text-slate-300">—</span> : (
        <span className="whitespace-nowrap font-medium tabular-nums text-slate-800">
          {fmtNum(value)}
          {col.editable && row.edit && <EditedAmountBadge record={row.edit} className="ml-1.5" />}
        </span>
      );
    case 'signed': {
      const n = Number(value || 0);
      return (
        <span className={`whitespace-nowrap font-medium tabular-nums ${n < 0 ? 'text-red-600' : n > 0 ? 'text-slate-800' : 'text-slate-400'}`}>
          {n < 0 ? '−' : ''}{fmtNum(Math.abs(n))}
        </span>
      );
    }
    case 'running':
      return blank ? '—' : <span className="whitespace-nowrap tabular-nums text-slate-500">{fmtNum(value)}</span>;
    case 'flag':
      return row.flag ? (
        <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 ring-1 ring-inset ring-amber-200">
          <AlertTriangle className="h-3 w-3" /> Check
        </span>
      ) : null;
    default:
      return <span className={col.muted ? 'text-xs text-slate-500' : 'text-slate-700'}>{blank ? '—' : value}</span>;
  }
}

const FOCUS = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600';

function Skeleton({ className = '' }) {
  return <div className={`animate-pulse rounded-lg bg-slate-200/70 ${className}`} />;
}

function LoadingState() {
  return (
    <div className="flex flex-wrap items-start gap-6" aria-busy="true" aria-label="Loading breakdown">
      <div className="min-w-0 flex-1 basis-[640px] space-y-4">
        <Skeleton className="h-9 w-80" />
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
      </div>
      <div className="w-full min-w-[300px] flex-[0_1_340px] space-y-3.5">
        <Skeleton className="h-64" />
        <Skeleton className="h-28" />
      </div>
    </div>
  );
}

function SectionCard({ section, open, onToggle, rows, onRowClick }) {
  const included = isIncluded(section);
  const subtotal = sectionSubtotal(section);
  const cols = gridCols(section.columns);

  return (
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className={`flex w-full items-center gap-3 px-4 py-3.5 text-left hover:bg-slate-50 ${FOCUS}`}
      >
        <ChevronRight className={`h-4 w-4 shrink-0 text-slate-500 transition-transform ${open ? 'rotate-90' : ''}`} />
        <span className="min-w-0 flex-1">
          <span className="block font-semibold text-slate-900">{section.title}</span>
          <span className="mt-0.5 block text-xs text-slate-500">{section.description}</span>
        </span>
        <span className={`hidden whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold sm:inline-flex ${included ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
          {included ? 'Included in the total' : 'Shown for context only'}
        </span>
        <span className="min-w-[110px] text-right">
          <span className="block font-semibold tabular-nums text-slate-900">{signedMoney(subtotal)}</span>
          <span className="block text-xs text-slate-500">{section.rows.length} {section.rows.length === 1 ? 'entry' : 'entries'}</span>
        </span>
      </button>

      {open && (
        section.rows.length === 0 ? (
          <p className="border-t border-slate-100 px-5 py-6 text-sm text-slate-400">{section.empty}</p>
        ) : (
          <div className="overflow-x-auto border-t border-slate-200">
            <div className="min-w-[640px]">
              <div className="grid items-center gap-x-3 border-b border-slate-200 bg-slate-50 px-4 py-2" style={{ gridTemplateColumns: cols }}>
                {section.columns.map((c) => (
                  <div
                    key={c.key}
                    className={`text-xs font-semibold uppercase tracking-wide text-slate-500 ${RIGHT_TYPES.includes(c.type) ? 'text-right' : ''}`}
                  >
                    {c.label}{AMOUNT_TYPES.includes(c.type) && !/lkr/i.test(c.label) ? ' (LKR)' : ''}
                  </div>
                ))}
              </div>
              {rows.map((row, i) => (
                <button
                  key={row.id || i}
                  type="button"
                  onClick={(e) => onRowClick(section, row, e.currentTarget)}
                  className={`grid min-h-[44px] w-full items-center gap-x-3 border-b border-slate-100 px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-100 ${FOCUS} ${row.counted === false ? 'opacity-60' : ''}`}
                  style={{ gridTemplateColumns: cols }}
                >
                  {section.columns.map((c) => (
                    <div key={c.key} className={`min-w-0 ${RIGHT_TYPES.includes(c.type) ? 'text-right' : ''}`}>
                      <Cell col={c} row={row} />
                    </div>
                  ))}
                </button>
              ))}
              {rows.length === 0 && <p className="px-5 py-5 text-center text-sm text-slate-400">Nothing matches the filters.</p>}
              {section.total && (
                <div className="flex items-center justify-between gap-4 border-t border-slate-200 bg-slate-50 px-4 py-3">
                  <span className={`text-sm font-semibold ${section.total.muted ? 'text-slate-500' : 'text-slate-700'}`}>
                    {section.total.muted ? `${section.total.label} (not counted)` : section.total.label}
                  </span>
                  <span className={`font-semibold tabular-nums ${section.total.muted ? 'text-slate-500' : 'text-slate-900'}`}>{signedMoney(section.total.value)}</span>
                </div>
              )}
            </div>
          </div>
        )
      )}
    </section>
  );
}

function DetailDrawer({ entry, onClose }) {
  const closeRef = useRef(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const { section, row } = entry;
  const amount = amountOf(section, row);
  const when = dateValueOf(section, row);
  const included = isIncluded(section) && row.counted !== false;
  const Field = ({ label, children }) => (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <div className="mt-0.5 text-sm text-slate-800">{children}</div>
    </div>
  );

  return (
    <>
      <div className="fixed inset-0 z-40 bg-slate-900/35" onClick={onClose} aria-hidden="true" />
      <div role="dialog" aria-modal="true" aria-label="Entry details" className="fixed bottom-0 right-0 top-0 z-50 flex w-full max-w-[400px] flex-col bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <p className="font-semibold text-slate-900">Entry details</p>
            <p className="text-sm text-slate-500">{section.title}</p>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className={`inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 ${FOCUS}`}
          >
            <X className="h-4 w-4" /> Close
          </button>
        </div>
        <div className="space-y-5 overflow-y-auto p-5">
          {amount !== null && amount !== undefined && (
            <Field label="Amount (LKR)">
              <span className={`text-2xl font-bold tabular-nums ${Number(amount) < 0 ? 'text-red-600' : 'text-slate-900'}`}>
                {signedMoney(Number(amount))}
                {row.edit && <EditedAmountBadge record={row.edit} className="ml-2" />}
              </span>
            </Field>
          )}
          <div className="grid grid-cols-2 gap-4">
            <Field label="Date">{fmtDate(when)}</Field>
            <Field label="Time">{when ? fmtTime(when) || '—' : '—'}</Field>
            <Field label="Booking">
              {row.booking_id ? (
                <Link to={`/admin/bookings/${row.booking_id}/detail`} className="font-semibold text-blue-600 hover:underline">{row.booking_code || 'Booking'}</Link>
              ) : '—'}
            </Field>
            <Field label="Method">{humanize(row.method)}</Field>
            <Field label="Category">{humanize(row.category)}</Field>
            <Field label="Counted">{included ? 'Yes' : 'No'}</Field>
          </div>
          <Field label="Notes"><p className="whitespace-pre-wrap leading-relaxed text-slate-700">{row.notes || 'No notes on this entry.'}</p></Field>
          {row.flag && (
            <div className="rounded-lg bg-amber-50 p-3 text-amber-800">
              <p className="font-semibold">Worth a look</p>
              <p className="mt-0.5 text-sm">{row.flag}</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function Breakdown({ clientId, metric }) {
  const navigate = useNavigate();
  const [nonce, setNonce] = useState(0);
  const requestKey = `${clientId}:${metric}:${nonce}`;
  const [result, setResult] = useState({ key: '', data: null, error: '', at: null });
  const loading = result.key !== requestKey;
  const data = loading ? null : result.data;
  const error = loading ? '' : result.error;

  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All');
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const [openMap, setOpenMap] = useState({});
  const [checksOpen, setChecksOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [drawer, setDrawer] = useState(null);
  const openerRef = useRef(null);
  const [toast, setToast] = useState('');
  const toastTimer = useRef(null);

  const showToast = useCallback((msg) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 2500);
  }, []);
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  useEffect(() => {
    let alive = true;
    apiClient.getClientFinancialBreakdown(clientId, metric)
      .then((res) => alive && setResult({ key: requestKey, data: res.data, error: '', at: new Date() }))
      .catch((err) => alive && setResult({ key: requestKey, data: null, error: err?.message || 'Failed to load this breakdown', at: null }));
    return () => { alive = false; };
  }, [clientId, metric, requestKey]);

  const closeDrawer = useCallback(() => {
    setDrawer(null);
    openerRef.current?.focus();
  }, []);

  const summary = data?.summary;
  const mismatch = !!summary && !summary.matches;
  const sections = useMemo(() => data?.sections || [], [data]);
  const allRows = useMemo(() => sections.flatMap((s) => s.rows), [sections]);
  const categories = useMemo(() => ['All', ...new Set(allRows.map((r) => r.category).filter(Boolean))], [allRows]);
  const flaggedCount = allRows.filter((r) => r.flag).length;
  const filtering = !!(query.trim() || category !== 'All' || flaggedOnly);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sections
      .map((s) => ({
        s,
        rows: s.rows.filter((r) => (category === 'All' || r.category === category)
          && (!flaggedOnly || r.flag)
          && (!q || [r.booking_code, r.code, r.category, r.method, r.notes, r.why, r.rule, r.service, r.status]
            .some((v) => String(v || '').toLowerCase().includes(q)))),
      }))
      .filter((o) => !filtering || o.rows.length);
  }, [sections, query, category, flaggedOnly, filtering]);

  const clearFilters = () => { setQuery(''); setCategory('All'); setFlaggedOnly(false); };

  const exportCsv = () => {
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = [];
    visible.forEach(({ s, rows }) => {
      lines.push(esc(s.title));
      lines.push(s.columns.map((c) => esc(c.label)).join(','));
      rows.forEach((r) => lines.push(s.columns.map((c) => esc(c.type === 'flag' ? r.flag : r[c.key])).join(',')));
      lines.push('');
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${metric}-${clientId}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Exported as CSV');
  };

  const refresh = () => { setNonce((n) => n + 1); showToast('Recalculating…'); };

  const failedChecks = (data?.checks || []).filter((c) => !c.ok);
  const passedChecks = (data?.checks || []).filter((c) => c.ok);
  const countedTotal = sections.filter(isIncluded).reduce((n, s) => n + Math.abs(sectionSubtotal(s)), 0);
  const contextTotal = sections.filter((s) => !isIncluded(s)).reduce((n, s) => n + Math.abs(sectionSubtotal(s)), 0);
  const metricLabel = METRICS.find((m) => m.metric === metric)?.label;
  const clientName = data?.client?.name;

  return (
    <div className="mx-auto max-w-[1240px] space-y-5 px-4 py-5 sm:px-7">
      <div>
        <p className="text-sm text-slate-500">
          <Link to="/admin/users" className="hover:underline">Clients</Link> › <Link to={`/admin/users/${clientId}/detail`} className="hover:underline">{clientName || 'Client'}</Link> › <span className="font-semibold text-slate-900">{metricLabel}</span>
        </p>
        <div className="mt-1.5 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-[22px] font-semibold text-slate-900">
            Financial breakdown
            {clientName && <span className="ml-1 text-[15px] font-normal text-slate-500">· {clientName}{data.client.client_code ? ` · ${data.client.client_code}` : ''}</span>}
          </h1>
          <div className="flex items-center gap-2.5">
            {result.at && !loading && <span className="text-sm text-slate-500">Last calculated {result.at.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span>}
            <button type="button" onClick={refresh} className={`inline-flex h-[34px] items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 text-[13px] font-semibold text-slate-700 hover:bg-slate-50 ${FOCUS}`}>
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
            </button>
            <button type="button" onClick={exportCsv} disabled={!data} className={`inline-flex h-[34px] items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 text-[13px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 ${FOCUS}`}>
              <Download className="h-3.5 w-3.5" /> Export CSV
            </button>
          </div>
        </div>
      </div>

      <div role="tablist" className="flex flex-wrap border-b border-slate-200">
        {METRICS.map((m) => {
          const active = m.metric === metric;
          return (
            <button
              key={m.metric}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => !active && navigate(`/admin/users/${clientId}/${m.path}`)}
              className={`mr-7 flex flex-col items-start gap-0.5 border-b-2 pb-3 pt-2.5 text-left ${FOCUS} ${active ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
            >
              <span className="flex items-center text-sm font-semibold">
                {m.label}
                {active && mismatch && <span className="ml-2 inline-block h-2 w-2 rounded-full bg-red-600" title="Does not reconcile" />}
              </span>
              <span className="text-[13px] tabular-nums">{active && summary ? fmtMoney(summary.headline) : ' '}</span>
            </button>
          );
        })}
      </div>

      {loading && <LoadingState />}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center text-red-700">
          <p>{error}</p>
          <button type="button" onClick={() => setNonce((n) => n + 1)} className={`mt-3 inline-flex h-[34px] items-center gap-1.5 rounded-md border border-red-300 bg-white px-3 text-[13px] font-semibold text-red-700 hover:bg-red-50 ${FOCUS}`}>
            <RefreshCw className="h-3.5 w-3.5" /> Retry
          </button>
        </div>
      )}

      {data && (
        <div className="flex flex-wrap items-start gap-6">
          {/* Main column */}
          <div className="flex min-w-0 flex-1 basis-[640px] flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="relative min-w-[240px] max-w-[340px] flex-1">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  aria-label="Search entries"
                  placeholder="Search booking, category, notes…"
                  className="h-9 w-full rounded-md border border-slate-300 bg-white pl-8 pr-2.5 text-sm outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                />
              </div>
              {categories.length > 2 && categories.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCategory(c)}
                  aria-pressed={category === c}
                  className={`rounded-full border px-3 py-1 text-[13px] font-semibold ${FOCUS} ${category === c ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'}`}
                >
                  {c === 'All' ? c : humanize(c)}
                </button>
              ))}
              {flaggedCount > 0 && (
                <button
                  type="button"
                  onClick={() => setFlaggedOnly((v) => !v)}
                  aria-pressed={flaggedOnly}
                  className={`rounded-full border px-3 py-1 text-[13px] font-semibold ${FOCUS} ${flaggedOnly ? 'border-amber-300 bg-amber-50 text-amber-700' : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'}`}
                >
                  Flagged only · {flaggedCount}
                </button>
              )}
            </div>

            {visible.length === 0 ? (
              <div className="rounded-lg border border-slate-200 bg-white p-10 text-center text-slate-500">
                No entries match.
                <button type="button" onClick={clearFilters} className={`ml-2 inline-flex h-[34px] items-center rounded-md border border-slate-300 bg-white px-3 text-[13px] font-semibold text-slate-700 hover:bg-slate-50 ${FOCUS}`}>Clear filters</button>
              </div>
            ) : visible.map(({ s, rows }) => {
              const open = filtering ? true : (openMap[s.key] !== undefined ? openMap[s.key] : isIncluded(s));
              return (
                <SectionCard
                  key={s.key}
                  section={s}
                  rows={rows}
                  open={open}
                  onToggle={() => setOpenMap((m) => ({ ...m, [s.key]: !open }))}
                  onRowClick={(section, row, el) => { openerRef.current = el; setDrawer({ section, row }); }}
                />
              );
            })}
          </div>

          {/* Aside */}
          <aside className="flex w-full min-w-[300px] flex-[0_1_340px] flex-col gap-3.5 lg:sticky lg:top-4">
            <div className="rounded-lg border border-slate-200 bg-white p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{summary.headline_label || metricLabel}</p>
              <p className="my-1 mb-2.5 text-[32px] font-bold tabular-nums text-slate-900">{fmtMoney(summary.headline)}</p>
              <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${mismatch ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>
                {mismatch ? `Off by ${fmtMoney(Math.abs(summary.difference))} from the entries` : 'Matches the entries below'}
              </span>

              <div className="mt-4 space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">How it adds up</p>
                {(data.formula || []).map((f, i) => (
                  <div key={f.label} className="flex justify-between gap-3 text-sm text-slate-700">
                    <span>{i > 0 ? (f.value < 0 ? '− ' : '+ ') : ''}{f.label}</span>
                    <span className={`whitespace-nowrap tabular-nums ${f.value < 0 && i === 0 ? 'text-red-600' : ''}`}>{i === 0 ? signedMoney(f.value) : fmtMoney(Math.abs(f.value))}</span>
                  </div>
                ))}
                <div className="flex justify-between border-t border-slate-900 pt-2 text-sm font-bold text-slate-900">
                  <span>Total from entries</span>
                  <span className="tabular-nums">{signedMoney(summary.derived)}</span>
                </div>
                {mismatch && (
                  <>
                    <div className="flex justify-between text-sm text-slate-600">
                      <span>Client page shows</span><span className="tabular-nums">{signedMoney(summary.headline)}</span>
                    </div>
                    <div className="flex justify-between text-sm font-bold text-red-700">
                      <span>Difference</span><span className="tabular-nums">{signedMoney(summary.difference)}</span>
                    </div>
                    {flaggedCount > 0 && (
                      <button
                        type="button"
                        onClick={() => { setQuery(''); setCategory('All'); setFlaggedOnly(true); }}
                        className={`mt-1 inline-flex h-[34px] w-full items-center justify-center rounded-md border border-slate-300 bg-white text-[13px] font-semibold text-slate-700 hover:bg-slate-50 ${FOCUS}`}
                      >
                        Show flagged entries
                      </button>
                    )}
                  </>
                )}
              </div>

              <div className="mt-4">
                <div className="flex h-2 overflow-hidden rounded bg-slate-200">
                  <div className="h-full bg-emerald-500" style={{ width: `${Math.round((countedTotal / (countedTotal + contextTotal || 1)) * 100)}%` }} />
                </div>
                <div className="mt-1.5 flex justify-between text-xs text-slate-500">
                  <span>Counted</span>
                  <span>{contextTotal ? `${fmtMoney(contextTotal)} shown for context` : 'Nothing set aside'}</span>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-1.5">
              {failedChecks.map((c) => (
                <div key={c.label} className="m-1.5 flex items-start gap-2 rounded-md bg-amber-50 px-3 py-2.5 text-amber-800">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                  <div>
                    <p className="font-semibold">{c.label}</p>
                    {c.detail && <p className="mt-0.5 text-[13px]">{c.detail}</p>}
                  </div>
                </div>
              ))}
              {passedChecks.length > 0 && (
                <>
                  <button
                    type="button"
                    onClick={() => setChecksOpen((v) => !v)}
                    aria-expanded={checksOpen}
                    className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 ${FOCUS}`}
                  >
                    <span>{passedChecks.length} check{passedChecks.length === 1 ? '' : 's'} passed</span>
                    {checksOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </button>
                  {checksOpen && (
                    <div className="space-y-1.5 px-3.5 pb-2.5 pt-1">
                      {passedChecks.map((c) => (
                        <p key={c.label} className="flex items-start gap-1.5 text-[13px] text-slate-600">
                          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" /> {c.label}
                        </p>
                      ))}
                    </div>
                  )}
                </>
              )}
              <button
                type="button"
                onClick={() => setRulesOpen((v) => !v)}
                aria-expanded={rulesOpen}
                className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 ${FOCUS}`}
              >
                <span>How this figure is worked out</span>
                {rulesOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>
              {rulesOpen && (
                <ul className="list-disc space-y-1 py-1 pl-8 pr-3.5 pb-3 text-[13px] leading-relaxed text-slate-600">
                  {data.rules.map((r) => <li key={r}>{r}</li>)}
                </ul>
              )}
            </div>
          </aside>
        </div>
      )}

      {drawer && <DetailDrawer entry={drawer} onClose={closeDrawer} />}
      {toast && (
        <div role="status" className="fixed bottom-6 left-1/2 z-[80] -translate-x-1/2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm text-slate-50">{toast}</div>
      )}
    </div>
  );
}

export default function ClientFinancialBreakdownPage({ metric }) {
  const { clientId } = useParams();
  // Keyed so filters, open sections and the drawer reset when switching client or metric.
  return (
    <AdminLayout>
      <Breakdown key={`${clientId}:${metric}`} clientId={clientId} metric={metric} />
    </AdminLayout>
  );
}
