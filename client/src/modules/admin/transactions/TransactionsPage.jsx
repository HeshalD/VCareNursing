import React, { useState, useEffect, useCallback } from 'react';
import {
  ArrowLeftRight, ArrowDownLeft, ArrowUpRight, ChevronLeft, ChevronRight,
  ChevronDown, ChevronUp, Search, Filter, Plus, PenLine, Wallet, Banknote,
  Receipt, Building2, Users, FileText, RefreshCcw, ExternalLink
} from 'lucide-react';
import AdminLayout from '../components/AdminLayout';
import apiClient from '../../../api/api';
import AddTransactionModal from './AddTransactionModal';

const money = new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR', maximumFractionDigits: 2 });
const fmt = (v) => money.format(Number(v || 0));

const fmtDate = (d) => d
  ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  : '—';

const fmtDateTime = (d) => d
  ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  : '—';

// Cash-flow classification — must mirror backend/utils/transactionFlow.js.
// Money direction is derived from the category, NOT the stored transaction_type column.
const IN_CATEGORIES = ['CLIENT_PAYMENT', 'BOOKING_PAYMENT', 'WALLET_TOPUP', 'OTHER_INCOME'];
const OUT_CATEGORIES = ['STAFF_SALARY_PAID', 'STAFF_ADVANCE', 'AGENCY_FEE', 'OTHER_EXPENSE'];
const flowOf = (category) => {
  if (IN_CATEGORIES.includes(category)) return 'IN';
  if (OUT_CATEGORIES.includes(category)) return 'OUT';
  return 'NEUTRAL';
};

// Visual identity per category — color + icon so each type is recognizable at a glance
const CATEGORY_CONFIG = {
  CLIENT_PAYMENT:     { label: 'Client Payment',     cls: 'bg-emerald-100 text-emerald-700', icon: Banknote },
  BOOKING_PAYMENT:    { label: 'Booking Payment',    cls: 'bg-blue-100 text-blue-700',       icon: Receipt },
  WALLET_TOPUP:       { label: 'Wallet Top-up',      cls: 'bg-teal-100 text-teal-700',       icon: Wallet },
  OTHER_INCOME:       { label: 'Other Income',       cls: 'bg-green-100 text-green-700',     icon: ArrowDownLeft },
  STAFF_SALARY_PAID:  { label: 'Salary Paid',        cls: 'bg-violet-100 text-violet-700',   icon: Users },
  STAFF_ADVANCE:      { label: 'Salary Advance',     cls: 'bg-fuchsia-100 text-fuchsia-700', icon: Users },
  AGENCY_FEE:         { label: 'Agency Fee',         cls: 'bg-indigo-100 text-indigo-700',   icon: Building2 },
  OTHER_EXPENSE:      { label: 'Other Expense',      cls: 'bg-rose-100 text-rose-700',       icon: ArrowUpRight },
  STAFF_SALARY:       { label: 'Staff Salary',       cls: 'bg-purple-100 text-purple-700',   icon: Users },
  SERVICE_INVOICE:    { label: 'Service Invoice',    cls: 'bg-cyan-100 text-cyan-700',       icon: FileText },
  REGISTRATION_FEE:   { label: 'Registration Fee',   cls: 'bg-lime-100 text-lime-700',       icon: FileText },
  WALLET_DEBIT:       { label: 'Wallet Debit',       cls: 'bg-orange-100 text-orange-700',   icon: Wallet },
  WALLET_REFUND:      { label: 'Wallet Refund',      cls: 'bg-amber-100 text-amber-700',     icon: RefreshCcw },
  BOOKING_SETTLEMENT: { label: 'Booking Settlement', cls: 'bg-sky-100 text-sky-700',         icon: Receipt },
};

const STATUS_COLORS = {
  COMPLETED: 'bg-emerald-100 text-emerald-700',
  PENDING:   'bg-amber-100 text-amber-700',
  FAILED:    'bg-rose-100 text-rose-700',
  CANCELLED: 'bg-slate-100 text-slate-600',
};

const categoryBadge = (category) => {
  const cfg = CATEGORY_CONFIG[category] || {
    label: (category || 'Unknown').replace(/_/g, ' '),
    cls: 'bg-slate-100 text-slate-700',
    icon: Receipt,
  };
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${cfg.cls}`}>
      <Icon className="w-3 h-3" />
      {cfg.label}
    </span>
  );
};

// Who/what the transaction relates to: external party (manual), client + patient, or staff
const relatedTo = (tx) => {
  if (tx.external_party) {
    return { primary: tx.external_party, secondary: 'External party' };
  }
  if (tx.client_name) {
    const parts = [];
    if (tx.patient_name) parts.push(`Patient: ${tx.patient_name}`);
    if (tx.booking_service_type) parts.push(tx.booking_service_type);
    return { primary: tx.client_name, secondary: parts.join(' · ') || 'Client' };
  }
  if (tx.staff_name) {
    return { primary: tx.staff_name, secondary: 'Staff member' };
  }
  return { primary: '—', secondary: '' };
};

const SummaryCard = ({ label, value, icon: Icon, accent }) => (
  <div className="bg-white rounded-lg border border-slate-200 p-5 flex items-center gap-4">
    <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${accent}`}>
      <Icon className="w-5 h-5" />
    </div>
    <div>
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{label}</p>
      <p className="text-xl font-bold text-slate-900">{value}</p>
    </div>
  </div>
);

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

  useEffect(() => {
    apiClient.getTransactionMeta()
      .then(res => setCategories(res.categories || []))
      .catch(() => setCategories(Object.keys(CATEGORY_CONFIG)));
  }, []);

  const fetchTransactions = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const params = { page, limit: 25 };
      if (search.trim()) params.search = search.trim();
      if (category) params.category = category;
      if (flow) params.flow = flow;
      if (source) params.source = source;
      if (fromDate) params.from_date = fromDate;
      if (toDate) params.to_date = toDate;

      const res = await apiClient.getAllTransactions(params);
      setTransactions(res.data || []);
      setSummary(res.summary || { total_in: 0, total_out: 0, net: 0 });
      setPagination(res.pagination || { total: 0, page, limit: 25, total_pages: 1 });
    } catch (err) {
      console.error('Transactions fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [search, category, flow, source, fromDate, toDate]);

  useEffect(() => { fetchTransactions(1); }, [fetchTransactions]);

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

  return (
    <AdminLayout
      title="Transactions"
      subtitle={`${pagination.total} transactions across the platform`}
      actions={
        <button
          onClick={() => setShowAddModal(true)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4" /> Add Transaction
        </button>
      }
    >
      {toast && (
        <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm font-medium text-emerald-700">
          {toast}
        </div>
      )}

      {/* Summary cards (reflect current filters) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <SummaryCard
          label="Money In"
          value={fmt(summary.total_in)}
          icon={ArrowDownLeft}
          accent="bg-emerald-100 text-emerald-600"
        />
        <SummaryCard
          label="Money Out"
          value={fmt(summary.total_out)}
          icon={ArrowUpRight}
          accent="bg-rose-100 text-rose-600"
        />
        <SummaryCard
          label="Net"
          value={fmt(summary.net)}
          icon={ArrowLeftRight}
          accent={summary.net >= 0 ? 'bg-blue-100 text-blue-600' : 'bg-amber-100 text-amber-600'}
        />
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg border border-slate-200 p-5">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="lg:col-span-2">
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1.5">Search</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Client, staff, external party, reference, notes…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && fetchTransactions(1)}
                className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1.5">Category</label>
            <div className="relative">
              <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <select
                value={category}
                onChange={e => setCategory(e.target.value)}
                className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none bg-white"
              >
                <option value="">All Categories</option>
                {categories.map(c => (
                  <option key={c} value={c}>{(CATEGORY_CONFIG[c]?.label) || c.replace(/_/g, ' ')}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1.5">Direction</label>
            <select
              value={flow}
              onChange={e => setFlow(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none bg-white"
            >
              <option value="">All</option>
              <option value="IN">Money In</option>
              <option value="OUT">Money Out</option>
              <option value="NEUTRAL">Neutral (internal)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1.5">Source</label>
            <select
              value={source}
              onChange={e => setSource(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none bg-white"
            >
              <option value="">All Sources</option>
              <option value="SYSTEM">System (in-app)</option>
              <option value="MANUAL">Manual entry</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1.5">From</label>
            <input
              type="date"
              value={fromDate}
              onChange={e => setFromDate(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1.5">To</label>
            <input
              type="date"
              value={toDate}
              onChange={e => setToDate(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex items-end gap-2">
            <button
              onClick={() => fetchTransactions(1)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors"
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
      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
          </div>
        ) : transactions.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 gap-3">
            <ArrowLeftRight className="w-10 h-10 text-slate-300" />
            <p className="text-slate-500 text-sm">No transactions found</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    {['Date', 'Type', 'Category', 'Related To', 'Method', 'Amount', 'Status', 'Source', ''].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {transactions.map(tx => {
                    const isExpanded = expandedRow === tx.transaction_id;
                    const flowDir = flowOf(tx.category);
                    const related = relatedTo(tx);
                    const statusCls = STATUS_COLORS[tx.status] || 'bg-slate-100 text-slate-600';

                    return (
                      <React.Fragment key={tx.transaction_id}>
                        <tr
                          className="hover:bg-slate-50 transition-colors cursor-pointer"
                          onClick={() => setExpandedRow(isExpanded ? null : tx.transaction_id)}
                        >
                          <td className="px-4 py-3 text-sm text-slate-500 whitespace-nowrap">
                            {fmtDate(tx.transaction_date)}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            {flowDir === 'IN' ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700">
                                <ArrowDownLeft className="w-3 h-3" /> In
                              </span>
                            ) : flowDir === 'OUT' ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-700">
                                <ArrowUpRight className="w-3 h-3" /> Out
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-500">
                                <ArrowLeftRight className="w-3 h-3" /> Neutral
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">{categoryBadge(tx.category)}</td>
                          <td className="px-4 py-3 max-w-[220px]">
                            <p className="text-sm font-semibold text-slate-900 truncate">{related.primary}</p>
                            {related.secondary && (
                              <p className="text-xs text-slate-500 truncate">{related.secondary}</p>
                            )}
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-500 whitespace-nowrap">
                            {tx.payment_method ? tx.payment_method.replace(/_/g, ' ') : '—'}
                          </td>
                          <td className={`px-4 py-3 text-sm font-bold whitespace-nowrap ${
                            flowDir === 'IN' ? 'text-emerald-600' : flowDir === 'OUT' ? 'text-rose-600' : 'text-slate-500'
                          }`}>
                            {flowDir === 'IN' ? '+' : flowDir === 'OUT' ? '−' : ''}{fmt(tx.amount)}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${statusCls}`}>
                              {tx.status || '—'}
                            </span>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            {tx.is_manual ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">
                                <PenLine className="w-3 h-3" /> Manual
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-600">
                                System
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right">
                            {isExpanded
                              ? <ChevronUp className="w-4 h-4 text-slate-400 inline" />
                              : <ChevronDown className="w-4 h-4 text-slate-400 inline" />}
                          </td>
                        </tr>

                        {isExpanded && (
                          <tr className="bg-slate-50">
                            <td colSpan={9} className="px-6 py-4">
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-3 text-sm">
                                <div>
                                  <p className="text-xs font-semibold text-slate-400 uppercase">Transaction ID</p>
                                  <p className="text-slate-700 font-mono text-xs mt-0.5 break-all">{tx.transaction_id}</p>
                                </div>
                                <div>
                                  <p className="text-xs font-semibold text-slate-400 uppercase">Recorded At</p>
                                  <p className="text-slate-700 mt-0.5">{fmtDateTime(tx.created_at)}</p>
                                </div>
                                <div>
                                  <p className="text-xs font-semibold text-slate-400 uppercase">Recorded By</p>
                                  <p className="text-slate-700 mt-0.5">{tx.recorded_by_name || '—'}</p>
                                </div>
                                <div>
                                  <p className="text-xs font-semibold text-slate-400 uppercase">Reference</p>
                                  <p className="text-slate-700 mt-0.5">{tx.reference_number || '—'}</p>
                                </div>
                                {(tx.bank_account_nickname || tx.bank_name) && (
                                  <div>
                                    <p className="text-xs font-semibold text-slate-400 uppercase">Bank Account</p>
                                    <p className="text-slate-700 mt-0.5">
                                      {[tx.bank_account_nickname, tx.bank_name].filter(Boolean).join(' — ')}
                                    </p>
                                  </div>
                                )}
                                {tx.cheque_number && (
                                  <div>
                                    <p className="text-xs font-semibold text-slate-400 uppercase">Cheque</p>
                                    <p className="text-slate-700 mt-0.5">
                                      #{tx.cheque_number}{tx.cheque_date ? ` — ${fmtDate(tx.cheque_date)}` : ''}
                                    </p>
                                  </div>
                                )}
                                {tx.receipt_url && (
                                  <div>
                                    <p className="text-xs font-semibold text-slate-400 uppercase">Receipt</p>
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
                                    <p className="text-xs font-semibold text-slate-400 uppercase">Notes</p>
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
            <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200">
              <p className="text-sm text-slate-500">
                Showing {transactions.length} of {pagination.total} transactions
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => fetchTransactions(pagination.page - 1)}
                  disabled={pagination.page <= 1}
                  className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-sm text-slate-700 font-medium px-2">
                  Page {pagination.page} of {pagination.total_pages}
                </span>
                <button
                  onClick={() => fetchTransactions(pagination.page + 1)}
                  disabled={pagination.page >= pagination.total_pages}
                  className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
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
