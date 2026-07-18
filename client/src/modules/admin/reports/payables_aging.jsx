import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  SlidersHorizontal, RefreshCw, Share2, Download, ChevronDown, X, Loader2,
} from 'lucide-react';
import AdminLayout from '../components/AdminLayout';
import apiClient from '../../../api/api';

const money = new Intl.NumberFormat('en-LK', {
  style: 'currency',
  currency: 'LKR',
  minimumFractionDigits: 2,
});

const formatMoney = (value) => money.format(Number(value || 0)).replace('LKR', 'LKR ');

const formatDate = (d) => d
  ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  : '—';

const INTERVAL_DAY_OPTIONS = [7, 15, 30, 45, 60];
const INTERVAL_COUNT_OPTIONS = [2, 3, 4, 5, 6];

// Builds N buckets of `intervalDays` width each, e.g. (15, 4) -> 1-15,
// 16-30, 31-45, Above 45 — the last bucket is always open-ended.
const buildBucketDefs = (intervalDays, intervalCount) => {
  const defs = [];
  for (let i = 0; i < intervalCount - 1; i++) {
    const min = i === 0 ? 0 : i * intervalDays + 1;
    const max = (i + 1) * intervalDays;
    const label = i === 0 ? `1 - ${intervalDays} Days` : `${min} - ${max} Days`;
    defs.push({ key: `bucket_${i}`, label, min, max });
  }
  const lastMax = (intervalCount - 1) * intervalDays;
  defs.push({ key: `bucket_${intervalCount - 1}`, label: `Above ${lastMax} Days`, min: lastMax + 1, max: Infinity });
  return defs;
};

const csvEscape = (val) => {
  const str = String(val ?? '');
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
};

// A tiny inert "dropdown" — visually matches the report toolbar's filter
// pills, but these dimensions (as-of date, aging basis, entity type) aren't
// backed by real filter logic yet, so they just display the current fixed
// values.
const FilterPill = ({ label, value }) => (
  <button
    type="button"
    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 transition-colors"
  >
    <span className="text-slate-400">{label} :</span>
    <span className="font-medium text-slate-700">{value}</span>
    <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
  </button>
);

const IconButton = ({ icon: Icon, onClick, title }) => (
  <button
    type="button"
    onClick={onClick}
    title={title}
    className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-700 transition-colors"
  >
    <Icon className="h-4 w-4" />
  </button>
);

const PayablesAging = () => {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showMoreFilters, setShowMoreFilters] = useState(false);
  const [activeBucket, setActiveBucket] = useState('');
  const [intervalDays, setIntervalDays] = useState(15);
  const [intervalCount, setIntervalCount] = useState(4);
  const [showIntervalEditor, setShowIntervalEditor] = useState(false);

  const load = async () => {
    try {
      setLoading(true);
      setError('');
      const res = await apiClient.getPayablesAging();
      setData(res.data);
    } catch (err) {
      console.error('Failed to load payables aging:', err);
      setError(err.message || 'Failed to load payables aging report');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const bucketDefs = useMemo(() => buildBucketDefs(intervalDays, intervalCount), [intervalDays, intervalCount]);

  // Reset any bucket-based filter whenever the interval shape changes, since
  // the old bucket key no longer means the same date range.
  useEffect(() => { setActiveBucket(''); }, [intervalDays, intervalCount]);

  const computedBuckets = useMemo(() => {
    const items = data?.items || [];
    return bucketDefs.map(def => {
      const bucketItems = items.filter(i => i.age_days >= def.min && i.age_days <= def.max);
      return {
        ...def,
        amount: bucketItems.reduce((sum, i) => sum + Number(i.amount), 0),
        count: bucketItems.length,
      };
    });
  }, [data, bucketDefs]);

  const filteredItems = useMemo(() => {
    const items = data?.items || [];
    if (!activeBucket) return items;
    const def = bucketDefs.find(b => b.key === activeBucket);
    if (!def) return items;
    return items.filter(i => i.age_days >= def.min && i.age_days <= def.max);
  }, [data, activeBucket, bucketDefs]);

  const groupedByBucket = useMemo(() => {
    return bucketDefs
      .map(def => ({
        key: def.key,
        label: def.label,
        items: filteredItems
          .filter(i => i.age_days >= def.min && i.age_days <= def.max)
          .sort((a, b) => a.age_days - b.age_days),
      }))
      .filter(group => group.items.length > 0);
  }, [filteredItems, bucketDefs]);

  const grandTotal = filteredItems.reduce((sum, i) => sum + Number(i.amount), 0);

  const handleExportCsv = () => {
    const header = ['Date', 'Due Date', 'Transaction#', 'Type', 'Status', 'Employee', 'Age', 'Bill Amount', 'Balance Due'];
    const rows = filteredItems.map(i => [
      formatDate(i.reference_date),
      formatDate(i.reference_date),
      i.reference,
      i.type,
      'Overdue',
      i.employee_name,
      `${i.age_days} Days`,
      Number(i.amount).toFixed(2),
      Number(i.amount).toFixed(2),
    ]);
    const csv = [header, ...rows].map(row => row.map(csvEscape).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `AP_Aging_Details_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  };

  return (
    <AdminLayout
      title="Payables"
      subtitle="AP Aging Details By Bill Due Date"
    >
      {/* ── Toolbar: filter pills + icon actions, mirrors the Receivables Aging report toolbar ── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 p-4 border-b border-slate-100">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-slate-400 mr-1">Filters :</span>
            <FilterPill label="As of" value="Today" />
            <FilterPill label="Aging By" value="Bill Due Date" />
            <FilterPill label="Entities" value="Bill" />
            <button
              type="button"
              onClick={() => setShowMoreFilters(v => !v)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-700 hover:bg-blue-100 transition-colors"
            >
              + More Filters
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={load}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-blue-500 transition-colors"
            >
              Run Report
            </button>
            <div className="flex items-center gap-1.5 pl-2 ml-1 border-l border-slate-200">
              <IconButton icon={SlidersHorizontal} title="Filter options" />
              <IconButton icon={RefreshCw} onClick={load} title="Refresh" />
              <IconButton icon={Share2} title="Share" />
              <button
                type="button"
                onClick={handleExportCsv}
                disabled={loading || filteredItems.length === 0}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Download className="h-4 w-4" /> Export <ChevronDown className="h-3.5 w-3.5" />
              </button>
              <IconButton icon={X} onClick={() => navigate('/admin/reports')} title="Close" />
            </div>
          </div>
        </div>

        {showMoreFilters && (
          <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-slate-100 bg-slate-50/60">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide mr-1">Age Bucket</span>
            {computedBuckets.map(b => (
              <button
                key={b.key}
                type="button"
                onClick={() => setActiveBucket(prev => prev === b.key ? '' : b.key)}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                  activeBucket === b.key
                    ? 'bg-blue-600 text-white'
                    : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}
              >
                {b.label} · {formatMoney(b.amount)}
              </button>
            ))}
            {activeBucket && (
              <button type="button" onClick={() => setActiveBucket('')} className="text-xs text-slate-400 hover:text-slate-600 underline">
                Clear
              </button>
            )}
          </div>
        )}

        {/* Secondary toolbar row */}
        <div className="relative flex flex-wrap items-center gap-4 px-4 py-2 text-xs text-slate-500 bg-slate-50/40">
          <span>Group By : <span className="font-medium text-slate-700">Age Bucket</span></span>
          <button
            type="button"
            onClick={() => setShowIntervalEditor(v => !v)}
            className="inline-flex items-center gap-1 hover:text-slate-700 transition-colors"
          >
            Aging Intervals : <span className="font-medium text-slate-700">{intervalCount} X {intervalDays} Days</span>
            <ChevronDown className={`h-3 w-3 transition-transform ${showIntervalEditor ? 'rotate-180' : ''}`} />
          </button>
          <span>Customize Report Columns <span className="inline-flex items-center justify-center h-4 w-4 rounded-full bg-slate-200 text-slate-600 text-[10px] font-bold ml-0.5">9</span></span>

          {showIntervalEditor && (
            <div className="absolute z-10 top-full left-0 mt-1 w-64 bg-white rounded-xl border border-slate-200 shadow-lg p-4">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Edit Aging Intervals</p>
              <label className="block text-xs text-slate-500 mb-1">Days per interval</label>
              <select
                value={intervalDays}
                onChange={(e) => setIntervalDays(Number(e.target.value))}
                className="w-full mb-3 text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-700 bg-white outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              >
                {INTERVAL_DAY_OPTIONS.map(d => <option key={d} value={d}>{d} days</option>)}
              </select>
              <label className="block text-xs text-slate-500 mb-1">Number of intervals</label>
              <select
                value={intervalCount}
                onChange={(e) => setIntervalCount(Number(e.target.value))}
                className="w-full mb-3 text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-700 bg-white outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              >
                {INTERVAL_COUNT_OPTIONS.map(c => <option key={c} value={c}>{c} intervals</option>)}
              </select>
              <p className="text-xs text-slate-400 mb-3">
                Preview: {buildBucketDefs(intervalDays, intervalCount).map(b => b.label).join(' · ')}
              </p>
              <button
                type="button"
                onClick={() => setShowIntervalEditor(false)}
                className="w-full text-center text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-lg py-1.5 transition-colors"
              >
                Done
              </button>
            </div>
          )}
        </div>

        {error ? (
          <div className="mx-4 my-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>
        ) : null}

        {/* ── Report body ── */}
        <div className="px-6 py-8 text-center border-b border-slate-100">
          <p className="text-sm text-slate-500">Vcare Nursing</p>
          <h2 className="text-xl font-bold text-slate-900 mt-1">AP Aging Details By Bill Due Date</h2>
          <p className="text-sm text-slate-400 mt-1">As of {data?.as_of ? formatDate(data.as_of) : '—'}</p>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm text-left">
            <thead>
              <tr className="text-xs font-semibold uppercase tracking-wide text-slate-500 border-b border-slate-200">
                <th className="px-6 py-3">Date</th>
                <th className="px-6 py-3">Due Date</th>
                <th className="px-6 py-3">Transaction#</th>
                <th className="px-6 py-3">Type</th>
                <th className="px-6 py-3">Status</th>
                <th className="px-6 py-3">Employee</th>
                <th className="px-6 py-3">Age</th>
                <th className="px-6 py-3 text-right">Bill Amount</th>
                <th className="px-6 py-3 text-right">Balance Due</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="9" className="px-6 py-12 text-center text-slate-500">
                    <div className="inline-flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading payables aging...
                    </div>
                  </td>
                </tr>
              ) : groupedByBucket.length === 0 ? (
                <tr>
                  <td colSpan="9" className="px-6 py-12 text-center text-slate-500">
                    No outstanding payables found.
                  </td>
                </tr>
              ) : (
                groupedByBucket.map(group => {
                  const bucketAmount = group.items.reduce((sum, i) => sum + Number(i.amount), 0);
                  return (
                    <React.Fragment key={group.key}>
                      <tr className="bg-slate-50 border-y border-slate-100">
                        <td colSpan="7" className="px-6 py-2 font-semibold text-slate-700">{group.label}</td>
                        <td className="px-6 py-2 text-right font-semibold text-slate-900">{formatMoney(bucketAmount)}</td>
                        <td className="px-6 py-2 text-right font-semibold text-slate-900">{formatMoney(bucketAmount)}</td>
                      </tr>
                      {group.items.map((item, idx) => (
                        <tr key={`${group.key}-${idx}`} className="border-b border-slate-50 hover:bg-slate-50/60 transition-colors">
                          <td className="px-6 py-3 text-slate-600 whitespace-nowrap">{formatDate(item.reference_date)}</td>
                          <td className="px-6 py-3 text-slate-600 whitespace-nowrap">{formatDate(item.reference_date)}</td>
                          <td className="px-6 py-3">
                            <span className="font-medium text-blue-700 hover:underline cursor-default">{item.reference}</span>
                          </td>
                          <td className="px-6 py-3 text-slate-600">{item.type}</td>
                          <td className="px-6 py-3">
                            <span className="text-orange-600 font-medium">Overdue</span>
                          </td>
                          <td className="px-6 py-3">
                            <span className="text-blue-700 hover:underline cursor-default">{item.employee_name}</span>
                          </td>
                          <td className="px-6 py-3 text-slate-600 whitespace-nowrap">{item.age_days} Days</td>
                          <td className="px-6 py-3 text-right text-slate-700">{formatMoney(item.amount)}</td>
                          <td className="px-6 py-3 text-right font-medium text-slate-900">{formatMoney(item.amount)}</td>
                        </tr>
                      ))}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
            {!loading && groupedByBucket.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-slate-200 bg-slate-50">
                  <td colSpan="7" className="px-6 py-3 font-bold text-slate-900">Total</td>
                  <td className="px-6 py-3 text-right font-bold text-slate-900">{formatMoney(grandTotal)}</td>
                  <td className="px-6 py-3 text-right font-bold text-slate-900">{formatMoney(grandTotal)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </AdminLayout>
  );
};

export default PayablesAging;
