import React, { useEffect, useMemo, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, ChevronDown, ChevronsUpDown, Download, Loader2, RefreshCw, X,
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

const csvEscape = (val) => {
  const str = String(val ?? '');
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
};

// ── Date range presets, matching the standard accounting-report picker ──
const pad = (n) => String(n).padStart(2, '0');
const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (d, n) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };
const startOfWeek = (d) => addDays(d, -((d.getDay() + 6) % 7));
const endOfWeek = (d) => addDays(startOfWeek(d), 6);
const startOfMonth = (d) => new Date(d.getFullYear(), d.getMonth(), 1);
const endOfMonth = (d) => new Date(d.getFullYear(), d.getMonth() + 1, 0);
const startOfQuarter = (d) => new Date(d.getFullYear(), Math.floor(d.getMonth() / 3) * 3, 1);
const endOfQuarter = (d) => new Date(d.getFullYear(), Math.floor(d.getMonth() / 3) * 3 + 3, 0);
const startOfYear = (d) => new Date(d.getFullYear(), 0, 1);
const endOfYear = (d) => new Date(d.getFullYear(), 11, 31);

const buildPresets = () => {
  const today = new Date();
  const yesterday = addDays(today, -1);
  const prevWeekAnchor = addDays(today, -7);
  const prevMonthAnchor = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const prevQuarterAnchor = new Date(today.getFullYear(), today.getMonth() - 3, 1);
  const prevYearAnchor = new Date(today.getFullYear() - 1, 0, 1);

  const range = (from, to) => ({ from: toISO(from), to: toISO(to) });

  return [
    { label: 'Today', ...range(today, today) },
    { label: 'This Week', ...range(startOfWeek(today), endOfWeek(today)) },
    { label: 'This Month', ...range(startOfMonth(today), endOfMonth(today)) },
    { label: 'This Quarter', ...range(startOfQuarter(today), endOfQuarter(today)) },
    { label: 'This Year', ...range(startOfYear(today), endOfYear(today)) },
    { label: 'Yesterday', ...range(yesterday, yesterday) },
    { label: 'Previous Week', ...range(startOfWeek(prevWeekAnchor), endOfWeek(prevWeekAnchor)) },
    { label: 'Previous Month', ...range(startOfMonth(prevMonthAnchor), endOfMonth(prevMonthAnchor)) },
    { label: 'Previous Quarter', ...range(startOfQuarter(prevQuarterAnchor), endOfQuarter(prevQuarterAnchor)) },
    { label: 'Previous Year', ...range(startOfYear(prevYearAnchor), endOfYear(prevYearAnchor)) },
    { label: 'Custom', from: null, to: null },
  ];
};

const PRESETS = buildPresets();

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

const DateRangePicker = ({ activeLabel, customFrom, customTo, onSelectPreset, onCustomChange }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const onClickOutside = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
      >
        {activeLabel}
        <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
      </button>

      {open && (
        <div className="absolute left-0 z-20 mt-1.5 w-52 rounded-lg border border-slate-200 bg-white py-1.5 shadow-lg">
          {PRESETS.map((preset) => (
            <button
              key={preset.label}
              type="button"
              onClick={() => {
                onSelectPreset(preset);
                if (preset.label !== 'Custom') setOpen(false);
              }}
              className={`w-full text-left px-3.5 py-2 text-sm transition-colors ${
                activeLabel === preset.label
                  ? 'bg-blue-600 text-white font-medium'
                  : 'text-slate-700 hover:bg-slate-50'
              }`}
            >
              {preset.label}
            </button>
          ))}

          {activeLabel === 'Custom' && (
            <div className="border-t border-slate-100 mt-1.5 px-3.5 pt-3 pb-1 space-y-2">
              <div>
                <label className="block text-xs text-slate-400 mb-1">From</label>
                <input
                  type="date"
                  value={customFrom}
                  onChange={(e) => onCustomChange({ from: e.target.value, to: customTo })}
                  className="w-full text-sm border border-slate-200 rounded-md px-2 py-1 outline-none focus:border-blue-400"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">To</label>
                <input
                  type="date"
                  value={customTo}
                  onChange={(e) => onCustomChange({ from: customFrom, to: e.target.value })}
                  className="w-full text-sm border border-slate-200 rounded-md px-2 py-1 outline-none focus:border-blue-400"
                />
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="w-full mt-1 rounded-md bg-blue-600 text-white text-sm font-medium py-1.5 hover:bg-blue-500 transition-colors"
              >
                Apply
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const SalesByCustomer = () => {
  const navigate = useNavigate();
  const defaultPreset = PRESETS.find((p) => p.label === 'This Month');

  const [activeLabel, setActiveLabel] = useState(defaultPreset.label);
  const [range, setRange] = useState({ from: defaultPreset.from, to: defaultPreset.to });
  const [customFrom, setCustomFrom] = useState(defaultPreset.from);
  const [customTo, setCustomTo] = useState(defaultPreset.to);

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [exportingPdf, setExportingPdf] = useState(false);
  const [sortAsc, setSortAsc] = useState(true);

  const load = async (from = range.from, to = range.to) => {
    try {
      setLoading(true);
      setError('');
      const res = await apiClient.getSalesByCustomer({ from, to });
      setData(res.data);
    } catch (err) {
      console.error('Failed to load sales by customer:', err);
      setError(err.message || 'Failed to load sales by customer');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const handleSelectPreset = (preset) => {
    setActiveLabel(preset.label);
    if (preset.label === 'Custom') {
      setCustomFrom(range.from);
      setCustomTo(range.to);
      return;
    }
    setRange({ from: preset.from, to: preset.to });
    load(preset.from, preset.to);
  };

  const handleCustomChange = ({ from, to }) => {
    setCustomFrom(from);
    setCustomTo(to);
    if (from && to) {
      setRange({ from, to });
      load(from, to);
    }
  };

  const rows = useMemo(() => {
    const list = data?.rows || [];
    const sorted = [...list].sort((a, b) => a.name.localeCompare(b.name));
    return sortAsc ? sorted : sorted.reverse();
  }, [data, sortAsc]);

  const totals = data?.totals || { invoice_count: 0, sales: 0, sales_with_tax: 0 };

  const handleExportCsv = () => {
    const header = ['Name', 'Invoice Count', 'Sales', 'Sales with Tax'];
    const csvRows = rows.map((r) => [r.name, r.invoice_count, r.sales.toFixed(2), r.sales_with_tax.toFixed(2)]);
    csvRows.push(['Total', totals.invoice_count, totals.sales.toFixed(2), totals.sales_with_tax.toFixed(2)]);
    const csv = [header, ...csvRows].map((r) => r.map(csvEscape).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Sales_by_Customer_${data?.from || 'all'}_to_${data?.to || 'all'}.csv`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  };

  const handleExportPdf = async () => {
    try {
      setExportingPdf(true);
      const blob = await apiClient.downloadSalesByCustomerPdf({ from: range.from, to: range.to });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Sales_by_Customer_${range.from || 'all'}_to_${range.to || 'all'}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      console.error('Failed to download sales by customer PDF:', err);
      setError(err.message || 'Failed to download PDF');
    } finally {
      setExportingPdf(false);
    }
  };

  return (
    <AdminLayout
      title="Sales by Customer"
      subtitle="Customer-level sales for a selected date range."
      actions={
        <button
          type="button"
          onClick={() => navigate('/admin/reports')}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Reports
        </button>
      }
    >
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
        {/* ── Toolbar ── */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 p-4 border-b border-slate-100">
          <DateRangePicker
            activeLabel={activeLabel}
            customFrom={customFrom}
            customTo={customTo}
            onSelectPreset={handleSelectPreset}
            onCustomChange={handleCustomChange}
          />
          <div className="flex items-center gap-1.5">
            <IconButton icon={RefreshCw} onClick={() => load()} title="Refresh" />
            <button
              type="button"
              onClick={handleExportPdf}
              disabled={loading || exportingPdf || rows.length === 0}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {exportingPdf ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} PDF
            </button>
            <button
              type="button"
              onClick={handleExportCsv}
              disabled={loading || rows.length === 0}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Download className="h-4 w-4" /> CSV
            </button>
            <IconButton icon={X} onClick={() => navigate('/admin/reports')} title="Close" />
          </div>
        </div>

        {error ? (
          <div className="mx-4 my-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>
        ) : null}

        {/* ── Report body ── */}
        <div className="px-6 py-8 text-center border-b border-slate-100">
          <p className="text-sm text-slate-500">Vcare Nursing</p>
          <h2 className="text-xl font-bold text-slate-900 mt-1">Sales by Customer</h2>
          <p className="text-sm text-slate-400 mt-1">
            {data?.from && data?.to ? (
              <>From <span className="font-semibold text-slate-600">{formatDate(data.from)}</span> To <span className="font-semibold text-slate-600">{formatDate(data.to)}</span></>
            ) : '—'}
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm text-left">
            <thead>
              <tr className="text-xs font-semibold uppercase tracking-wide text-slate-500 border-b border-slate-200 bg-slate-50">
                <th className="px-6 py-3">
                  <button
                    type="button"
                    onClick={() => setSortAsc((a) => !a)}
                    className="inline-flex items-center gap-1 hover:text-slate-700 transition-colors"
                  >
                    Name <ChevronsUpDown className="h-3.5 w-3.5" />
                  </button>
                </th>
                <th className="px-6 py-3 text-right whitespace-nowrap">Invoice Count</th>
                <th className="px-6 py-3 text-right whitespace-nowrap">Sales</th>
                <th className="px-6 py-3 text-right whitespace-nowrap">Sales with Tax</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-slate-500">
                    <div className="inline-flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading sales by customer...
                    </div>
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-slate-500">
                    No sales found for this period.
                  </td>
                </tr>
              ) : (
                <>
                  {rows.map((row) => (
                    <tr
                      key={row.client_id}
                      className="border-b border-slate-50 hover:bg-slate-50/70 transition-colors cursor-pointer"
                      onClick={() => navigate(`/admin/users/${row.client_id}/detail`)}
                    >
                      <td className="px-6 py-3">
                        <span className="text-blue-600 font-medium hover:underline">{row.name}</span>
                      </td>
                      <td className="px-6 py-3 text-right whitespace-nowrap text-blue-600">{row.invoice_count}</td>
                      <td className="px-6 py-3 text-right whitespace-nowrap text-blue-600">{formatMoney(row.sales)}</td>
                      <td className="px-6 py-3 text-right whitespace-nowrap text-blue-600">{formatMoney(row.sales_with_tax)}</td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-slate-200 bg-slate-50/60 font-bold text-slate-900">
                    <td className="px-6 py-3">Total</td>
                    <td className="px-6 py-3 text-right whitespace-nowrap">{totals.invoice_count}</td>
                    <td className="px-6 py-3 text-right whitespace-nowrap">{formatMoney(totals.sales)}</td>
                    <td className="px-6 py-3 text-right whitespace-nowrap">{formatMoney(totals.sales_with_tax)}</td>
                  </tr>
                </>
              )}
            </tbody>
          </table>
        </div>

        {!loading && rows.length > 0 && (
          <div className="px-6 py-4 text-xs text-slate-400">
            **Amount is displayed in your base currency LKR
          </div>
        )}
      </div>
    </AdminLayout>
  );
};

export default SalesByCustomer;
