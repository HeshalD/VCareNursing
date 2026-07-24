import React, { useState, useEffect, useCallback } from 'react';
import * as XLSX from 'xlsx';
import {
  ArrowLeftRight, ArrowDownLeft, ArrowUpRight, ChevronLeft, ChevronRight,
  ChevronDown, ChevronUp, Search, Plus, PenLine, ExternalLink, Loader2,
  FileSpreadsheet, FileText
} from 'lucide-react';
import AdminLayout from '../components/AdminLayout';
import apiClient from '../../../api/api';
import DateInput from '../../../components/common/DateInput';
import AddTransactionModal from './AddTransactionModal';
import useAutoRefresh from '../../../hooks/useAutoRefresh';
import { CATEGORY_CONFIG, flowOf, categoryBadge, relatedTo } from '../../../constants/transactionCategories';

const COMPANY_NAME = 'Vcare Nursing';
const COMPANY_ADDRESS_LINES = ['No: 293/17B', 'Hospital Rd', 'Sri Jayewardenepura Sri Lanka', 'SriLanka'];

const money = new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR', maximumFractionDigits: 2 });
const fmt = (v) => money.format(Number(v || 0));

const fmtDate = (d) => d
  ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  : '—';

const fmtDateTime = (d) => d
  ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  : '—';

const STATUS_CONFIG = {
  COMPLETED: { dot: 'bg-emerald-500', text: 'text-emerald-700' },
  PENDING:   { dot: 'bg-amber-400',   text: 'text-amber-700' },
  FAILED:    { dot: 'bg-rose-400',    text: 'text-rose-700' },
  CANCELLED: { dot: 'bg-slate-400',   text: 'text-slate-600' },
};

const SummaryCard = ({ label, value, icon: Icon, accent }) => (
  <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-3.5">
    <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${accent}`}>
      <Icon className="w-5 h-5" />
    </div>
    <div>
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{label}</p>
      <p className="mt-0.5 text-lg font-bold text-slate-900 tabular-nums">{value}</p>
    </div>
  </div>
);

const filterInputCls =
  'w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-colors';

const TransactionsPage = () => {
  const [transactions, setTransactions] = useState([]);
  const [summary, setSummary] = useState({ total_in: 0, total_out: 0, net: 0 });
  const [pagination, setPagination] = useState({ total: 0, page: 1, limit: 25, total_pages: 1 });
  const [loading, setLoading] = useState(true);
  const [expandedRow, setExpandedRow] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [toast, setToast] = useState('');

  const [categories, setCategories] = useState([]);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [flow, setFlow] = useState('');
  const [source, setSource] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [exportingExcel, setExportingExcel] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);

  useEffect(() => {
    apiClient.getTransactionMeta()
      .then(res => setCategories(res.categories || []))
      .catch(() => setCategories(Object.keys(CATEGORY_CONFIG)));
  }, []);

  // Shared with the Excel/PDF exports so "download" always reflects exactly
  // what the current filters show on screen — not just the loaded page.
  const buildFilterParams = useCallback(() => {
    const params = {};
    if (search.trim()) params.search = search.trim();
    if (category) params.category = category;
    if (flow) params.flow = flow;
    if (source) params.source = source;
    if (fromDate) params.from_date = fromDate;
    if (toDate) params.to_date = toDate;
    return params;
  }, [search, category, flow, source, fromDate, toDate]);

  const fetchTransactions = useCallback(async (page = 1, { silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const res = await apiClient.getAllTransactions({ ...buildFilterParams(), page, limit: 25 });
      setTransactions(res.data || []);
      setSummary(res.summary || { total_in: 0, total_out: 0, net: 0 });
      setPagination(res.pagination || { total: 0, page, limit: 25, total_pages: 1 });
    } catch (err) {
      console.error('Transactions fetch error:', err);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [buildFilterParams]);

  useEffect(() => { fetchTransactions(1); }, [fetchTransactions]);

  // Ledger entries can be added by other admins at any time; keep the current
  // page fresh, but pause while the "Add Transaction" modal is open.
  useAutoRefresh(() => fetchTransactions(pagination.page, { silent: true }), {
    intervalMs: 5000,
    enabled: !showAddModal,
  });

  const handleClear = () => {
    setSearch('');
    setCategory('');
    setFlow('');
    setSource('');
    setFromDate('');
    setToDate('');
  };

  const handleAddSuccess = () => {
    setShowAddModal(false);
    setToast('Transaction recorded successfully');
    setTimeout(() => setToast(''), 4000);
    fetchTransactions(1);
  };

  const handleExportPdf = async () => {
    setExportingPdf(true);
    try {
      const blob = await apiClient.exportTransactionsPdf(buildFilterParams());
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Transactions_${new Date().toISOString().slice(0, 10)}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      console.error('Transactions PDF export error:', err);
      setToast('Failed to generate PDF. Please try again.');
      setTimeout(() => setToast(''), 4000);
    } finally {
      setExportingPdf(false);
    }
  };

  const handleExportExcel = async () => {
    setExportingExcel(true);
    try {
      const res = await apiClient.getAllTransactions({ ...buildFilterParams(), limit: 'all' });
      const rows = res.data || [];
      const rowSummary = res.summary || { total_in: 0, total_out: 0, net: 0 };

      // Header block (company identity + report metadata) built as an array-of-arrays
      // sheet so it can sit above the data table — json_to_sheet alone can't do that.
      const headerRows = [
        [COMPANY_NAME],
        ...COMPANY_ADDRESS_LINES.map(line => [line]),
        [],
        ['Transaction Report'],
        [`Generated ${new Date().toLocaleString('en-GB')}`],
        [],
        ['Money In', rowSummary.total_in, 'Money Out', rowSummary.total_out, 'Net', rowSummary.net],
        [],
      ];

      const tableHeader = ['Date', 'Type', 'Category', 'Related To', 'Method', 'Reference', 'Status', 'Source', 'Amount'];
      const tableRows = rows.map(tx => {
        const flowDir = flowOf(tx.category, tx.transaction_type);
        const related = relatedTo(tx);
        return [
          fmtDate(tx.transaction_date),
          flowDir === 'IN' ? 'In' : flowDir === 'OUT' ? 'Out' : 'Neutral',
          tx.custom_category_label || CATEGORY_CONFIG[tx.category]?.label || (tx.category || '').replace(/_/g, ' '),
          [related.primary, related.secondary].filter(Boolean).join(' — '),
          tx.payment_method ? tx.payment_method.replace(/_/g, ' ') : '—',
          tx.reference_number || '—',
          tx.status || '—',
          tx.is_manual ? 'Manual' : 'System',
          parseFloat(tx.amount || 0) * (flowDir === 'OUT' ? -1 : 1),
        ];
      });

      const sheet = XLSX.utils.aoa_to_sheet([...headerRows, tableHeader, ...tableRows]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, sheet, 'Transactions');
      XLSX.writeFile(wb, `Transactions_${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch (err) {
      console.error('Transactions Excel export error:', err);
      setToast('Failed to generate Excel file. Please try again.');
      setTimeout(() => setToast(''), 4000);
    } finally {
      setExportingExcel(false);
    }
  };

  return (
    <AdminLayout
      title="Transactions"
      subtitle={`${pagination.total} transactions across the platform`}
      actions={
        <div className="flex items-center gap-2">
          <button
            onClick={handleExportExcel}
            disabled={exportingExcel}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 text-slate-600 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="Download filtered transactions as Excel"
          >
            {exportingExcel ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4 text-slate-400" />}
            Excel
          </button>
          <button
            onClick={handleExportPdf}
            disabled={exportingPdf}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 text-slate-600 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="Download filtered transactions as PDF"
          >
            {exportingPdf ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4 text-slate-400" />}
            PDF
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-500 transition-colors"
          >
            <Plus className="w-4 h-4" /> Add Transaction
          </button>
        </div>
      }
    >
      {toast && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-3 rounded-lg text-sm">
          {toast}
        </div>
      )}

      {/* Summary cards (reflect current filters) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <SummaryCard
          label="Money In"
          value={fmt(summary.total_in)}
          icon={ArrowDownLeft}
          accent="bg-emerald-50 text-emerald-600"
        />
        <SummaryCard
          label="Money Out"
          value={fmt(summary.total_out)}
          icon={ArrowUpRight}
          accent="bg-rose-50 text-rose-600"
        />
        <SummaryCard
          label="Net"
          value={fmt(summary.net)}
          icon={ArrowLeftRight}
          accent={summary.net >= 0 ? 'bg-blue-50 text-blue-600' : 'bg-amber-50 text-amber-600'}
        />
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="lg:col-span-2">
            <label className="block text-xs font-medium text-slate-600 mb-1">Search</label>
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                placeholder="Client, staff, external party, reference, notes…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && fetchTransactions(1)}
                className={`${filterInputCls} pl-8`}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Category</label>
            <select
              value={category}
              onChange={e => setCategory(e.target.value)}
              className={filterInputCls}
            >
              <option value="">All Categories</option>
              {categories.map(c => (
                <option key={c} value={c}>{(CATEGORY_CONFIG[c]?.label) || c.replace(/_/g, ' ')}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Direction</label>
            <select
              value={flow}
              onChange={e => setFlow(e.target.value)}
              className={filterInputCls}
            >
              <option value="">All</option>
              <option value="IN">Money In</option>
              <option value="OUT">Money Out</option>
              <option value="NEUTRAL">Neutral (internal)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Source</label>
            <select
              value={source}
              onChange={e => setSource(e.target.value)}
              className={filterInputCls}
            >
              <option value="">All Sources</option>
              <option value="SYSTEM">System (in-app)</option>
              <option value="MANUAL">Manual entry</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">From</label>
            <DateInput
              value={fromDate}
              onChange={e => setFromDate(e.target.value)}
              className={filterInputCls}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">To</label>
            <DateInput
              value={toDate}
              onChange={e => setToDate(e.target.value)}
              className={filterInputCls}
            />
          </div>

          <div className="flex items-end gap-2">
            <button
              onClick={() => fetchTransactions(1)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-500 transition-colors"
            >
              Apply
            </button>
            <button
              onClick={handleClear}
              className="px-4 py-2 border border-slate-200 text-slate-600 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors"
            >
              Clear
            </button>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
          </div>
        ) : transactions.length === 0 ? (
          <div className="text-center py-16 text-slate-400 text-sm">
            No transactions match your filters.
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    {['Date', 'Type', 'Category', 'Related To', 'Method', 'Amount', 'Status', 'Source', ''].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {transactions.map(tx => {
                    const isExpanded = expandedRow === tx.transaction_id;
                    const flowDir = flowOf(tx.category, tx.transaction_type);
                    const related = relatedTo(tx);
                    const statusCfg = STATUS_CONFIG[tx.status] || { dot: 'bg-slate-400', text: 'text-slate-600' };

                    return (
                      <React.Fragment key={tx.transaction_id}>
                        <tr
                          className={`transition-colors cursor-pointer select-none ${isExpanded ? 'bg-blue-50/50' : 'hover:bg-slate-50'}`}
                          onClick={() => setExpandedRow(isExpanded ? null : tx.transaction_id)}
                        >
                          <td className="px-4 py-3 whitespace-nowrap">
                            {tx.transaction_code && (
                              <p className="text-xs font-mono text-slate-400 mb-0.5">{tx.transaction_code}</p>
                            )}
                            <p className="text-slate-600">{fmtDate(tx.transaction_date)}</p>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            {flowDir === 'IN' ? (
                              <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
                                <ArrowDownLeft className="w-3 h-3" /> In
                              </span>
                            ) : flowDir === 'OUT' ? (
                              <span className="inline-flex items-center gap-1 text-xs font-medium text-rose-700">
                                <ArrowUpRight className="w-3 h-3" /> Out
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-500">
                                <ArrowLeftRight className="w-3 h-3" /> Neutral
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">{categoryBadge(tx.category, tx.custom_category_label)}</td>
                          <td className="px-4 py-3 max-w-[220px]">
                            <p className="font-semibold text-slate-900 truncate leading-tight">{related.primary}</p>
                            {related.secondary && (
                              <p className="text-xs text-slate-400 truncate">{related.secondary}</p>
                            )}
                          </td>
                          <td className="px-4 py-3 text-slate-600 whitespace-nowrap capitalize">
                            {tx.payment_method ? tx.payment_method.replace(/_/g, ' ') : '—'}
                          </td>
                          <td className={`px-4 py-3 font-semibold tabular-nums whitespace-nowrap ${
                            flowDir === 'IN' ? 'text-emerald-600' : flowDir === 'OUT' ? 'text-rose-600' : 'text-slate-500'
                          }`}>
                            {flowDir === 'IN' ? '+' : flowDir === 'OUT' ? '−' : ''}{fmt(tx.amount)}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${statusCfg.text}`}>
                              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${statusCfg.dot}`} />
                              {tx.status || '—'}
                            </span>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            {tx.is_manual ? (
                              <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700">
                                <PenLine className="w-3 h-3" /> Manual
                              </span>
                            ) : (
                              <span className="text-xs font-medium text-slate-500">System</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right">
                            {isExpanded
                              ? <ChevronUp className="w-4 h-4 text-blue-500 ml-auto" />
                              : <ChevronDown className="w-4 h-4 text-slate-300 ml-auto" />}
                          </td>
                        </tr>

                        {isExpanded && (
                          <tr className="bg-slate-50/70">
                            <td colSpan={9} className="px-6 py-4">
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-3 text-sm">
                                <div>
                                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Transaction Code</p>
                                  <p className="text-slate-900 font-mono font-semibold mt-0.5">{tx.transaction_code || tx.transaction_id}</p>
                                  {tx.transaction_code && (
                                    <p className="text-slate-400 font-mono text-xs mt-0.5 break-all">{tx.transaction_id}</p>
                                  )}
                                </div>
                                <div>
                                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Recorded At</p>
                                  <p className="text-slate-700 mt-0.5">{fmtDateTime(tx.created_at)}</p>
                                </div>
                                <div>
                                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Recorded By</p>
                                  <p className="text-slate-700 mt-0.5">{tx.recorded_by_name || '—'}</p>
                                </div>
                                <div>
                                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Reference</p>
                                  <p className="text-slate-700 mt-0.5">{tx.reference_number || '—'}</p>
                                </div>
                                {(tx.bank_account_nickname || tx.bank_name) && (
                                  <div>
                                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Bank Account</p>
                                    <p className="text-slate-700 mt-0.5">
                                      {[tx.bank_account_nickname, tx.bank_name].filter(Boolean).join(' — ')}
                                    </p>
                                  </div>
                                )}
                                {tx.cheque_number && (
                                  <div>
                                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Cheque</p>
                                    <p className="text-slate-700 mt-0.5">
                                      #{tx.cheque_number}{tx.cheque_date ? ` — ${fmtDate(tx.cheque_date)}` : ''}
                                    </p>
                                  </div>
                                )}
                                {tx.receipt_url && (
                                  <div>
                                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Receipt</p>
                                    <a
                                      href={tx.receipt_url}
                                      target="_blank"
                                      rel="noreferrer"
                                      onClick={e => e.stopPropagation()}
                                      className="inline-flex items-center gap-1 text-blue-600 hover:underline mt-0.5"
                                    >
                                      View slip <ExternalLink className="w-3 h-3" />
                                    </a>
                                  </div>
                                )}
                                {tx.notes && (
                                  <div className="col-span-2 md:col-span-4">
                                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Notes</p>
                                    <p className="text-slate-700 mt-0.5 whitespace-pre-wrap">{tx.notes}</p>
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between border-t border-slate-100 px-4 py-2.5">
              <p className="text-xs text-slate-400">
                Showing {transactions.length} of {pagination.total} transaction{pagination.total !== 1 ? 's' : ''}
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => fetchTransactions(pagination.page - 1)}
                  disabled={pagination.page <= 1}
                  className="p-1.5 rounded-md text-slate-500 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-xs text-slate-600 font-medium tabular-nums px-1">
                  Page {pagination.page} of {pagination.total_pages}
                </span>
                <button
                  onClick={() => fetchTransactions(pagination.page + 1)}
                  disabled={pagination.page >= pagination.total_pages}
                  className="p-1.5 rounded-md text-slate-500 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {showAddModal && (
        <AddTransactionModal
          onClose={() => setShowAddModal(false)}
          onSuccess={handleAddSuccess}
        />
      )}
    </AdminLayout>
  );
};

export default TransactionsPage;
