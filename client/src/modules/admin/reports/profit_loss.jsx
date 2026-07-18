import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  RefreshCw, Share2, Download, ChevronDown, X, Loader2,
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

const MODES = [
  { key: 'month', label: 'Monthly' },
  { key: '6month', label: '6 Months' },
  { key: 'year', label: 'Yearly' },
];

const csvEscape = (val) => {
  const str = String(val ?? '');
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
};

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

// Row spec shared by the on-screen table and the CSV export — `key` pulls
// the figure off each period object returned by GET /finances/profit-loss;
// a null key is a section header (no figure, just a label row).
const ROWS = [
  { label: 'Operating Income', section: true },
  { label: 'Service Revenue', key: 'serviceRevenue' },
  { label: 'Product Revenue', key: 'productRevenue' },
  { label: 'Other Operating Income', key: 'otherIncome' },
  { label: 'Total for Operating Income', key: 'totalSales', bold: true, border: true },
  { label: 'Cost of Goods Sold', section: true },
  { label: 'Cost of Goods Sold', key: 'cogs' },
  { label: 'Total for Cost of Goods Sold', key: 'cogs', bold: true, border: true },
  { label: 'Gross Profit', key: 'grossProfit', bold: true, border: true, emphasize: true },
  { label: 'Operating Expense', section: true },
  { label: 'Other Expenses', key: 'otherExpenses' },
  { label: 'Salaries and Employee Wages', key: 'salaries' },
  { label: 'Total for Operating Expense', key: 'totalExpenses', bold: true, border: true },
  { label: 'Operating Profit', key: 'operatingProfit', bold: true, border: true, emphasize: true },
  { label: 'Non Operating Income', section: true },
  { label: 'Total for Non Operating Income', key: null, staticValue: 0, bold: true, border: true },
  { label: 'Non Operating Expense', section: true },
  { label: 'Total for Non Operating Expense', key: null, staticValue: 0, bold: true, border: true },
  { label: 'Net Profit/Loss', key: 'netProfit', bold: true, border: true, emphasize: true },
];

const ProfitLoss = () => {
  const navigate = useNavigate();
  const [mode, setMode] = useState('month');
  const [anchorDate, setAnchorDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [exportingPdf, setExportingPdf] = useState(false);

  const load = async () => {
    try {
      setLoading(true);
      setError('');
      const res = await apiClient.getProfitLoss({ mode, date: anchorDate });
      setData(res.data);
    } catch (err) {
      console.error('Failed to load profit and loss report:', err);
      setError(err.message || 'Failed to load profit and loss report');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [mode]);

  const periods = data?.periods || [];
  const isMultiPeriod = periods.length > 1;

  const totalsColumn = useMemo(() => {
    if (!isMultiPeriod) return null;
    const total = {};
    ['serviceRevenue', 'productRevenue', 'otherIncome', 'totalSales', 'cogs', 'grossProfit',
      'salaries', 'otherExpenses', 'totalExpenses', 'operatingProfit', 'netProfit'].forEach((k) => {
      total[k] = periods.reduce((sum, p) => sum + Number(p[k] || 0), 0);
    });
    return total;
  }, [periods, isMultiPeriod]);

  const handleExportCsv = () => {
    const header = ['Account', ...periods.map(p => p.label), ...(totalsColumn ? ['Total'] : [])];
    const rows = ROWS.map((row) => {
      if (row.section) return [row.label, ...periods.map(() => ''), ...(totalsColumn ? [''] : [])];
      const values = periods.map(p => (row.key ? Number(p[row.key] || 0) : row.staticValue).toFixed(2));
      const totalValue = totalsColumn ? [(row.key ? totalsColumn[row.key] : row.staticValue).toFixed(2)] : [];
      return [row.label, ...values, ...totalValue];
    });
    const csv = [header, ...rows].map(r => r.map(csvEscape).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Profit_and_Loss_${data?.from || ''}_to_${data?.to || ''}.csv`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  };

  const handleExportPdf = async () => {
    try {
      setExportingPdf(true);
      const blob = await apiClient.downloadProfitLossPdf({ mode, date: anchorDate });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Profit_and_Loss_${data?.from || ''}_to_${data?.to || ''}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      console.error('Failed to download profit and loss PDF:', err);
      setError(err.message || 'Failed to download PDF');
    } finally {
      setExportingPdf(false);
    }
  };

  return (
    <AdminLayout
      title="Profit & Loss"
      subtitle="Service and product revenue, cost of goods sold, and operating expenses"
    >
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
        {/* ── Toolbar ── */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 p-4 border-b border-slate-100">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-slate-400 mr-1">View :</span>
            {MODES.map(m => (
              <button
                key={m.key}
                type="button"
                onClick={() => setMode(m.key)}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                  mode === m.key
                    ? 'bg-blue-600 text-white'
                    : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                {m.label}
              </button>
            ))}
            <input
              type={mode === 'month' ? 'month' : 'date'}
              value={mode === 'month' ? anchorDate.slice(0, 7) : anchorDate}
              onChange={(e) => setAnchorDate(mode === 'month' ? `${e.target.value}-01` : e.target.value)}
              className="ml-1 text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-700 bg-white outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            />
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
              <IconButton icon={RefreshCw} onClick={load} title="Refresh" />
              <IconButton icon={Share2} title="Share" />
              <button
                type="button"
                onClick={handleExportPdf}
                disabled={loading || exportingPdf || periods.length === 0}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {exportingPdf ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} PDF
              </button>
              <button
                type="button"
                onClick={handleExportCsv}
                disabled={loading || periods.length === 0}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Download className="h-4 w-4" /> CSV <ChevronDown className="h-3.5 w-3.5" />
              </button>
              <IconButton icon={X} onClick={() => navigate('/admin/reports')} title="Close" />
            </div>
          </div>
        </div>

        {error ? (
          <div className="mx-4 my-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>
        ) : null}

        {/* ── Report body ── */}
        <div className="px-6 py-8 text-center border-b border-slate-100">
          <p className="text-sm text-slate-500">Vcare Nursing</p>
          <h2 className="text-xl font-bold text-slate-900 mt-1">Profit and Loss</h2>
          <p className="text-xs text-slate-400 mt-1">Basis: Accrual (Service Revenue) &amp; Cash (Product Revenue)</p>
          <p className="text-sm text-slate-400 mt-1">
            {data ? `From ${formatDate(data.from)} To ${formatDate(data.to)}` : '—'}
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm text-left">
            <thead>
              <tr className="text-xs font-semibold uppercase tracking-wide text-slate-500 border-b border-slate-200">
                <th className="px-6 py-3">Account</th>
                {periods.map(p => (
                  <th key={p.monthStart} className="px-6 py-3 text-right whitespace-nowrap">{p.label}</th>
                ))}
                {totalsColumn && <th className="px-6 py-3 text-right whitespace-nowrap">Total</th>}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={2 + periods.length} className="px-6 py-12 text-center text-slate-500">
                    <div className="inline-flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading profit and loss report...
                    </div>
                  </td>
                </tr>
              ) : periods.length === 0 ? (
                <tr>
                  <td colSpan={2 + periods.length} className="px-6 py-12 text-center text-slate-500">
                    No data available for this period.
                  </td>
                </tr>
              ) : (
                ROWS.map((row, idx) => {
                  if (row.section) {
                    return (
                      <tr key={`section-${idx}`} className="bg-slate-50 border-y border-slate-100">
                        <td colSpan={2 + periods.length} className="px-6 py-2 font-semibold text-slate-700">{row.label}</td>
                      </tr>
                    );
                  }
                  return (
                    <tr
                      key={`${row.label}-${idx}`}
                      className={`border-b border-slate-50 ${row.border ? 'border-t-2 border-t-slate-200' : ''} ${row.emphasize ? 'bg-slate-50/60' : ''}`}
                    >
                      <td className={`px-6 py-3 text-slate-700 ${row.bold ? 'font-bold text-slate-900' : ''}`}>{row.label}</td>
                      {periods.map((p) => (
                        <td
                          key={p.monthStart}
                          className={`px-6 py-3 text-right whitespace-nowrap text-slate-700 ${row.bold ? 'font-bold text-slate-900' : ''}`}
                        >
                          {formatMoney(row.key ? p[row.key] : row.staticValue)}
                        </td>
                      ))}
                      {totalsColumn && (
                        <td className={`px-6 py-3 text-right whitespace-nowrap text-slate-700 ${row.bold ? 'font-bold text-slate-900' : ''}`}>
                          {formatMoney(row.key ? totalsColumn[row.key] : row.staticValue)}
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {!loading && periods.length > 0 && (
          <div className="px-6 py-4 text-xs text-slate-400">
            **Amount is displayed in your base currency LKR
          </div>
        )}
      </div>
    </AdminLayout>
  );
};

export default ProfitLoss;
