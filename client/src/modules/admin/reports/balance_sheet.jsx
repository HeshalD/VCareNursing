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
  ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
  : '—';

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

// Flattens the backend's nested section tree into renderable rows: a group
// becomes a header row, its children, then a bold "Total for X" row — the
// same walk getBalanceSheetPdf does server-side, so screen/CSV/PDF agree.
function flattenNode(node, depth = 0, rows = []) {
  if (node.children) {
    rows.push({ label: node.label, value: null, depth, bold: depth === 0, header: true });
    node.children.forEach((child) => flattenNode(child, depth + 1, rows));
    rows.push({ label: `Total for ${node.label}`, value: node.total, depth, bold: true, emphasize: depth === 0 });
  } else {
    rows.push({ label: node.label, value: node.value, depth, bold: false });
  }
  return rows;
}

const BalanceSheet = () => {
  const navigate = useNavigate();
  const [asOfDate, setAsOfDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [exportingPdf, setExportingPdf] = useState(false);

  const load = async () => {
    try {
      setLoading(true);
      setError('');
      const res = await apiClient.getBalanceSheet({ date: asOfDate });
      setData(res.data);
    } catch (err) {
      console.error('Failed to load balance sheet:', err);
      setError(err.message || 'Failed to load balance sheet');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const rows = useMemo(
    () => (data?.sections || []).flatMap((section) => flattenNode(section)),
    [data],
  );

  const handleExportCsv = () => {
    const csvRows = [['Account', 'Total'], ...rows.map((row) => [
      `${'  '.repeat(row.depth)}${row.label}`,
      row.value === null ? '' : Number(row.value).toFixed(2),
    ])];
    const csv = csvRows.map((r) => r.map(csvEscape).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Balance_Sheet_${data?.asOf || ''}.csv`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  };

  const handleExportPdf = async () => {
    try {
      setExportingPdf(true);
      const blob = await apiClient.downloadBalanceSheetPdf({ date: asOfDate });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Balance_Sheet_${data?.asOf || ''}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      console.error('Failed to download balance sheet PDF:', err);
      setError(err.message || 'Failed to download PDF');
    } finally {
      setExportingPdf(false);
    }
  };

  // Tailwind needs full class names at build time, so no template maths here.
  const DEPTH_PADDING = ['pl-6', 'pl-10', 'pl-14', 'pl-[4.5rem]', 'pl-[5.5rem]'];

  return (
    <AdminLayout
      title="Balance Sheet"
      subtitle="Assets, liabilities, and equity as of a chosen date"
    >
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
        {/* ── Toolbar ── */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 p-4 border-b border-slate-100">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-slate-400 mr-1">As of :</span>
            <input
              type="date"
              value={asOfDate}
              onChange={(e) => setAsOfDate(e.target.value)}
              className="text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-700 bg-white outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
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
          <h2 className="text-xl font-bold text-slate-900 mt-1">Balance Sheet</h2>
          <p className="text-xs text-slate-400 mt-1">Basis: Accrual</p>
          <p className="text-sm text-slate-400 mt-1">
            {data ? `As of ${formatDate(data.asOf)}` : '—'}
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm text-left">
            <thead>
              <tr className="text-xs font-semibold uppercase tracking-wide text-slate-500 border-b border-slate-200">
                <th className="px-6 py-3">Account</th>
                <th className="px-6 py-3 text-right whitespace-nowrap">Total</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={2} className="px-6 py-12 text-center text-slate-500">
                    <div className="inline-flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading balance sheet...
                    </div>
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={2} className="px-6 py-12 text-center text-slate-500">
                    No data available for this date.
                  </td>
                </tr>
              ) : (
                rows.map((row, idx) => (
                  <tr
                    key={`${row.label}-${idx}`}
                    className={`border-b border-slate-50 ${row.emphasize ? 'border-t-2 border-t-slate-200 bg-slate-50/60' : ''} ${row.header && row.depth === 0 ? 'bg-slate-50 border-y border-slate-100' : ''}`}
                  >
                    <td className={`py-3 pr-6 text-slate-700 ${DEPTH_PADDING[Math.min(row.depth, DEPTH_PADDING.length - 1)]} ${row.bold ? 'font-bold text-slate-900' : ''} ${row.header && !row.bold ? 'font-semibold text-slate-700' : ''}`}>
                      {row.label}
                    </td>
                    <td className={`px-6 py-3 text-right whitespace-nowrap text-slate-700 ${row.bold ? 'font-bold text-slate-900' : ''}`}>
                      {row.value === null ? '' : formatMoney(row.value)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {!loading && rows.length > 0 && (
          <div className="px-6 py-4 text-xs text-slate-400 space-y-1">
            <p>**Amount is displayed in your base currency LKR</p>
            <p>**Inventory, client wallet balances, and rental deposits are reported at current values; all other lines are reconstructed as of the selected date.</p>
          </div>
        )}
      </div>
    </AdminLayout>
  );
};

export default BalanceSheet;
