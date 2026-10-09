import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, CheckCircle2, Info, Loader2, Search } from 'lucide-react';
import AdminLayout from '../components/AdminLayout';
import EditedAmountBadge from '../components/EditedAmountBadge';
import apiClient from '../../../api/api';

// One page for all four client money breakdowns (Payments Made, Total Invoiced,
// Overdue Amount, Wallet Balance). The server (services/clientFinancialBreakdown.js)
// lists the ledger entries behind each headline figure and says whether they add up
// to it; this page just renders that — header reconciliation, formula, rules,
// checks, then one table per group of entries.

const money = new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR', maximumFractionDigits: 2 });
const fmtMoney = (v) => money.format(Number(v || 0));

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

const SECTION_TONE = {
  counted: { bar: 'border-l-emerald-500', chip: 'bg-emerald-50 text-emerald-700', label: 'Counts' },
  adjustment: { bar: 'border-l-amber-500', chip: 'bg-amber-50 text-amber-700', label: 'Adjustment' },
  excluded: { bar: 'border-l-slate-300', chip: 'bg-slate-100 text-slate-600', label: 'Not counted' },
  info: { bar: 'border-l-blue-400', chip: 'bg-blue-50 text-blue-700', label: 'Reference' },
};

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
      return row.booking_id ? (
        <Link to={`/admin/bookings/${row.booking_id}/detail`} className="font-medium text-blue-600 hover:underline whitespace-nowrap">
          {value || 'Booking'}
        </Link>
      ) : '—';
    case 'notes':
      return blank ? '—' : <span className="block max-w-[260px] truncate text-slate-600" title={value}>{value}</span>;
    case 'money':
      return blank ? <span className="text-slate-300">—</span> : (
        <span className="whitespace-nowrap font-medium tabular-nums text-slate-800">
          {fmtMoney(value)}
          {col.editable && row.edit && <EditedAmountBadge record={row.edit} className="ml-1.5" />}
        </span>
      );
    case 'signed': {
      const n = Number(value || 0);
      return (
        <span className={`whitespace-nowrap font-medium tabular-nums ${n < 0 ? 'text-rose-600' : n > 0 ? 'text-slate-800' : 'text-slate-400'}`}>
          {n < 0 ? '−' : ''}{fmtMoney(Math.abs(n))}
        </span>
      );
    }
    case 'running':
      return blank ? '—' : <span className="whitespace-nowrap tabular-nums text-slate-500">{fmtMoney(value)}</span>;
    case 'flag':
      return row.flag ? (
        <span title={row.flag} className="inline-flex items-center gap-1 whitespace-nowrap rounded bg-amber-50 px-1.5 py-0.5 text-[11px] font-semibold text-amber-700 ring-1 ring-inset ring-amber-200">
          <AlertTriangle className="h-3 w-3" /> Check
        </span>
      ) : null;
    default:
      return <span className={col.muted ? 'text-xs text-slate-500' : 'text-slate-700'}>{blank ? '—' : value}</span>;
  }
}

function Section({ section }) {
  const [filter, setFilter] = useState('');
  const tone = SECTION_TONE[section.tone] || SECTION_TONE.info;

  const rows = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return section.rows;
    return section.rows.filter((r) => [r.booking_code, r.code, r.category, r.notes, r.method, r.why, r.rule, r.service, r.status]
      .some((v) => String(v || '').toLowerCase().includes(q)));
  }, [section.rows, filter]);

  return (
    <section className={`overflow-hidden rounded-xl border border-slate-200 border-l-4 bg-white shadow-sm ${tone.bar}`}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="font-semibold text-slate-900">{section.title}</h2>
            <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${tone.chip}`}>{tone.label}</span>
            <span className="text-xs text-slate-400">{section.rows.length} {section.rows.length === 1 ? 'entry' : 'entries'}</span>
          </div>
          <p className="mt-0.5 text-xs text-slate-500">{section.description}</p>
        </div>
        {section.filterable && (
          <div className="relative w-56">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter by booking, category…"
              className="w-full rounded-md border border-slate-200 py-1.5 pl-8 pr-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </div>
        )}
      </div>

      {section.rows.length === 0 ? (
        <p className="px-5 py-6 text-sm text-slate-400">{section.empty}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                {section.columns.map((c) => (
                  <th
                    key={c.key}
                    className={`px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500 ${['money', 'signed', 'running'].includes(c.type) ? 'text-right' : 'text-left'}`}
                  >
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row, i) => (
                <tr key={row.id || i} className={`align-top hover:bg-slate-50 ${row.counted === false ? 'opacity-60' : ''}`}>
                  {section.columns.map((c) => (
                    <td key={c.key} className={`px-4 py-2.5 ${['money', 'signed', 'running'].includes(c.type) ? 'text-right' : ''}`}>
                      <Cell col={c} row={row} />
                    </td>
                  ))}
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={section.columns.length} className="px-5 py-5 text-center text-sm text-slate-400">Nothing matches that filter.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {section.total && (
        <div className={`flex items-center justify-between gap-4 border-t border-slate-200 px-5 py-3 ${section.total.muted ? 'bg-white' : 'bg-slate-50'}`}>
          <span className={`text-sm font-semibold ${section.total.muted ? 'text-slate-500' : 'text-slate-700'}`}>{section.total.label}</span>
          <span className={`text-base font-bold tabular-nums ${section.total.muted ? 'text-slate-500' : 'text-slate-900'}`}>
            {section.total.value < 0 ? '−' : ''}{fmtMoney(Math.abs(section.total.value))}
          </span>
        </div>
      )}
    </section>
  );
}

export default function ClientFinancialBreakdownPage({ metric }) {
  const { clientId } = useParams();
  const navigate = useNavigate();
  // The result remembers which request it answers, so switching client or metric
  // shows the spinner again without resetting state inside the effect.
  const requestKey = `${clientId}:${metric}`;
  const [result, setResult] = useState({ key: '', data: null, error: '' });
  const loading = result.key !== requestKey;
  const data = loading ? null : result.data;
  const error = loading ? '' : result.error;

  useEffect(() => {
    let alive = true;
    apiClient.getClientFinancialBreakdown(clientId, metric)
      .then((res) => alive && setResult({ key: requestKey, data: res.data, error: '' }))
      .catch((err) => alive && setResult({ key: requestKey, data: null, error: err?.message || 'Failed to load this breakdown' }));
    return () => { alive = false; };
  }, [clientId, metric, requestKey]);

  const summary = data?.summary;
  const hasMismatch = summary && !summary.matches;
  const failedChecks = (data?.checks || []).filter((c) => !c.ok);

  return (
    <AdminLayout>
      <div className="mx-auto max-w-6xl space-y-5 px-4 py-6">
        <div className="flex flex-wrap items-center gap-3">
          <Link
            to={`/admin/users/${clientId}/detail`}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
          >
            <ArrowLeft className="h-4 w-4" /> Back to client
          </Link>
          <div>
            <h1 className="text-xl font-bold text-slate-900">{data?.title || METRICS.find((m) => m.metric === metric)?.label}</h1>
            {data?.client && <p className="text-sm text-slate-500">{data.client.name}{data.client.client_code ? ` · ${data.client.client_code}` : ''}</p>}
          </div>
        </div>

        <nav className="flex flex-wrap gap-1.5">
          {METRICS.map((m) => (
            <button
              key={m.metric}
              type="button"
              onClick={() => navigate(`/admin/users/${clientId}/${m.path}`)}
              className={`rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                m.metric === metric ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              {m.label}
            </button>
          ))}
        </nav>

        {loading && <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-blue-500" /></div>}
        {error && <div className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-center text-rose-700">{error}</div>}

        {data && (
          <>
            {/* Reconciliation */}
            <div className={`rounded-xl border p-5 ${hasMismatch ? 'border-rose-200 bg-rose-50' : 'border-emerald-200 bg-emerald-50'}`}>
              <div className="flex items-start gap-3">
                {hasMismatch
                  ? <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" />
                  : <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />}
                <div className="min-w-0 flex-1">
                  <p className={`font-semibold ${hasMismatch ? 'text-rose-800' : 'text-emerald-800'}`}>
                    {hasMismatch
                      ? `These entries are ${fmtMoney(Math.abs(summary.difference))} ${summary.difference > 0 ? 'short of' : 'over'} the figure on the client page`
                      : 'The entries below add up exactly to the figure on the client page'}
                  </p>
                  <div className="mt-3 grid gap-3 sm:grid-cols-3">
                    <div className="rounded-lg bg-white/70 px-4 py-3">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{summary.headline_label}</p>
                      <p className="mt-0.5 text-xl font-bold tabular-nums text-slate-900">{fmtMoney(summary.headline)}</p>
                    </div>
                    <div className="rounded-lg bg-white/70 px-4 py-3">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{summary.derived_label}</p>
                      <p className="mt-0.5 text-xl font-bold tabular-nums text-slate-900">{fmtMoney(summary.derived)}</p>
                    </div>
                    <div className="rounded-lg bg-white/70 px-4 py-3">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Difference</p>
                      <p className={`mt-0.5 text-xl font-bold tabular-nums ${hasMismatch ? 'text-rose-700' : 'text-emerald-700'}`}>
                        {summary.difference < 0 ? '−' : ''}{fmtMoney(Math.abs(summary.difference))}
                      </p>
                    </div>
                  </div>

                  {data.formula.length > 1 && (
                    <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-700">
                      {data.formula.map((f, i) => (
                        <React.Fragment key={f.label}>
                          {i > 0 && <span className="text-slate-400">{f.value < 0 ? '−' : '+'}</span>}
                          <span><span className="font-semibold tabular-nums">{fmtMoney(Math.abs(f.value))}</span> <span className="text-slate-500">{f.label}</span></span>
                        </React.Fragment>
                      ))}
                      <span className="text-slate-400">=</span>
                      <span className="font-bold tabular-nums">{fmtMoney(summary.derived)}</span>
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Cross-checks */}
            {data.checks.length > 0 && (
              <div className="space-y-2">
                {data.checks.map((c) => (
                  <div
                    key={c.label}
                    className={`flex items-start gap-2.5 rounded-lg border px-4 py-3 text-sm ${c.ok ? 'border-slate-200 bg-white' : 'border-amber-200 bg-amber-50'}`}
                  >
                    {c.ok
                      ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                      : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />}
                    <div>
                      <p className={`font-semibold ${c.ok ? 'text-slate-800' : 'text-amber-900'}`}>{c.label}</p>
                      <p className={`text-xs ${c.ok ? 'text-slate-500' : 'text-amber-800'}`}>{c.detail}</p>
                    </div>
                  </div>
                ))}
                {failedChecks.length > 0 && !hasMismatch && (
                  <p className="text-xs text-slate-500">The figure itself adds up, but {failedChecks.length === 1 ? 'a check above shows' : 'checks above show'} entries worth looking at.</p>
                )}
              </div>
            )}

            {/* Rules */}
            <div className="rounded-xl border border-blue-100 bg-blue-50 px-5 py-4 text-sm text-blue-900">
              <p className="mb-2 flex items-center gap-1.5 font-semibold"><Info className="h-4 w-4" /> How this figure is worked out</p>
              <ul className="list-disc space-y-1 pl-5 text-[13px] leading-relaxed">
                {data.rules.map((r) => <li key={r}>{r}</li>)}
              </ul>
            </div>

            {data.sections.map((s) => <Section key={s.key} section={s} />)}
          </>
        )}
      </div>
    </AdminLayout>
  );
}
