import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Loader2, X, Filter, ExternalLink, Receipt, Check, AlertCircle, Download,
} from 'lucide-react';
import AdminLayout from '../components/AdminLayout';
import apiClient from '../../../api/api';

const money = new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR', maximumFractionDigits: 2 });
const formatMoney = (v) => money.format(Number(v || 0));
const formatDate = (v) => {
  if (!v) return '—';
  const d = new Date(v);
  return isNaN(d) ? '—' : d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
};

const STATUS_COLORS = {
  INVOICED: 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200',
  SKIPPED:  'bg-red-50 text-red-700 ring-1 ring-inset ring-red-200',
  PENDING:  'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200',
};

const REG_FEE_STATUS_COLORS = {
  SENT: 'bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-200',
  PAID: 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200',
};

const PAGE_SIZE = 50;

export default function AdminInvoicesPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState('pending'); // 'pending' | 'all' | 'reg-fee'

  // ── Registration fee invoices state ────────────────────────────────────────
  const [regFeeInvoices, setRegFeeInvoices] = useState([]);
  const [regFeeLoading, setRegFeeLoading] = useState(false);

  // ── Pending queue state ────────────────────────────────────────────────────
  const [pending, setPending] = useState([]);
  const [pendingLoading, setPendingLoading] = useState(false);
  const [decidingId, setDecidingId] = useState('');
  const [amountOverrides, setAmountOverrides] = useState({}); // daily_invoice_id → string
  const [decideError, setDecideError] = useState('');

  // ── All invoices state ─────────────────────────────────────────────────────
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [pagination, setPagination] = useState(null);
  const [page, setPage] = useState(1);

  const [statusFilter, setStatusFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [bookingIdFilter, setBookingIdFilter] = useState('');

  // ── Summary (derived from all invoices view) ───────────────────────────────
  const totals = invoices.reduce(
    (acc, inv) => {
      if (inv.status === 'INVOICED') acc.approved += Number(inv.amount || 0);
      if (inv.status === 'SKIPPED')  acc.rejected += Number(inv.amount || 0);
      return acc;
    },
    { approved: 0, rejected: 0 }
  );

  // ── Pending fetch ──────────────────────────────────────────────────────────
  const fetchPending = useCallback(async () => {
    setPendingLoading(true);
    setDecideError('');
    try {
      const res = await apiClient.getAdminInvoices({ status: 'PENDING', limit: 200 });
      const rows = Array.isArray(res?.data) ? res.data : [];
      setPending(rows);
      // Seed amount overrides with the expected amounts from the cron
      const init = {};
      rows.forEach((r) => { if (r.amount != null) init[r.daily_invoice_id] = String(r.amount); });
      setAmountOverrides(init);
    } catch {
      setPending([]);
    } finally {
      setPendingLoading(false);
    }
  }, []);

  // ── All invoices fetch ─────────────────────────────────────────────────────
  const fetchInvoices = useCallback(async (overrides = {}) => {
    setLoading(true);
    try {
      const filters = { page: overrides.page ?? page, limit: PAGE_SIZE };
      const status = overrides.status !== undefined ? overrides.status : statusFilter;
      const from   = overrides.dateFrom !== undefined ? overrides.dateFrom : dateFrom;
      const to     = overrides.dateTo   !== undefined ? overrides.dateTo   : dateTo;
      const bid    = overrides.bookingIdFilter !== undefined ? overrides.bookingIdFilter : bookingIdFilter;
      if (status) filters.status = status;
      if (from)   filters.date_from = from;
      if (to)     filters.date_to   = to;
      if (bid)    filters.booking_id = bid;
      const res = await apiClient.getAdminInvoices(filters);
      setInvoices(Array.isArray(res?.data) ? res.data : []);
      setPagination(res?.pagination || null);
    } catch {
      setInvoices([]);
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, dateFrom, dateTo, bookingIdFilter]);

  // ── Registration fee invoices fetch ────────────────────────────────────────
  const fetchRegFeeInvoices = useCallback(async () => {
    setRegFeeLoading(true);
    try {
      const res = await apiClient.getAllRegFeeInvoices({ limit: 200 });
      setRegFeeInvoices(Array.isArray(res?.data) ? res.data : []);
    } catch {
      setRegFeeInvoices([]);
    } finally {
      setRegFeeLoading(false);
    }
  }, []);

  useEffect(() => { fetchPending(); }, [fetchPending]);
  useEffect(() => { if (tab === 'all') fetchInvoices(); }, [tab]); // eslint-disable-line
  useEffect(() => { if (tab === 'all') fetchInvoices(); }, [page]); // eslint-disable-line
  useEffect(() => { if (tab === 'reg-fee') fetchRegFeeInvoices(); }, [tab]); // eslint-disable-line

  // ── Decide (approve / reject) ──────────────────────────────────────────────
  const handleDecide = async (inv, approve) => {
    setDecidingId(inv.daily_invoice_id);
    setDecideError('');
    try {
      const overrideAmt = amountOverrides[inv.daily_invoice_id];
      const payload = {
        service_date: inv.service_date,
        approve,
        ...(inv.shift_slot_id ? { shift_slot_id: inv.shift_slot_id } : {}),
        ...(approve && overrideAmt ? { amount: parseFloat(overrideAmt) } : {}),
      };
      await apiClient.confirmBookingDailyInvoice(inv.booking_id, payload);
      // Remove from pending list optimistically
      setPending((prev) => prev.filter((r) => r.daily_invoice_id !== inv.daily_invoice_id));
    } catch (err) {
      setDecideError(err.message || 'Failed to process decision.');
    } finally {
      setDecidingId('');
    }
  };

  // ── Download a single daily invoice PDF ────────────────────────────────────
  const [downloadingId, setDownloadingId] = useState('');
  const [downloadError, setDownloadError] = useState('');
  const handleDownload = async (inv) => {
    setDownloadingId(inv.daily_invoice_id);
    setDownloadError('');
    try {
      const blob = await apiClient.downloadDailyInvoicePdf(inv.daily_invoice_id);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Invoice_${inv.booking_code || inv.booking_id?.slice(0, 8)}_${inv.service_date}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setDownloadError(err.message || 'Failed to download invoice PDF.');
    } finally {
      setDownloadingId('');
    }
  };

  const applyFilters = () => { setPage(1); fetchInvoices({ page: 1 }); };
  const clearFilters = () => {
    setStatusFilter(''); setDateFrom(''); setDateTo(''); setBookingIdFilter('');
    setPage(1);
    fetchInvoices({ page: 1, status: '', dateFrom: '', dateTo: '', bookingIdFilter: '' });
  };
  const hasFilters = statusFilter || dateFrom || dateTo || bookingIdFilter;

  return (
    <AdminLayout
      title="Daily Invoices"
      subtitle="Approve pending charges and review all daily invoice records"
    >
      <div className="space-y-5">
        {/* Tabs */}
        <div className="flex gap-1 rounded-lg bg-gray-100 p-1 w-fit">
          {[
            { id: 'pending', label: 'Pending Approvals', count: pending.length },
            { id: 'all',     label: 'All Invoices' },
            { id: 'reg-fee', label: 'Registration Fees' },
          ].map(({ id, label, count }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`flex items-center gap-1.5 rounded-md px-4 py-1.5 text-sm font-medium transition-all ${
                tab === id
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {label}
              {count != null && count > 0 && (
                <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                  tab === id ? 'bg-amber-100 text-amber-700' : 'bg-gray-200 text-gray-600'
                }`}>
                  {count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Download error (shared across tabs) */}
        {downloadError && (
          <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" /> {downloadError}
          </div>
        )}

        {/* ── PENDING APPROVALS TAB ─────────────────────────────────────────── */}
        {tab === 'pending' && (
          <>
            {decideError && (
              <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
                <AlertCircle className="h-4 w-4 shrink-0" /> {decideError}
              </div>
            )}

            <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
              {pendingLoading ? (
                <div className="flex items-center justify-center gap-2 py-16 text-sm text-gray-500">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading pending invoices…
                </div>
              ) : pending.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-3 py-16 text-gray-400">
                  <Check className="h-8 w-8 text-emerald-400" />
                  <p className="text-sm font-medium text-gray-500">No pending invoices — all caught up!</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-100 text-sm">
                    <thead className="bg-gray-50 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                      <tr>
                        <th className="px-4 py-3 text-left">Date</th>
                        <th className="px-4 py-3 text-left">Client</th>
                        <th className="px-4 py-3 text-left">Booking</th>
                        <th className="px-4 py-3 text-left">Shift</th>
                        <th className="px-4 py-3 text-right">Amount (LKR)</th>
                        <th className="px-4 py-3 text-left">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 bg-white">
                      {pending.map((inv) => {
                        const busy = decidingId === inv.daily_invoice_id;
                        return (
                          <tr key={inv.daily_invoice_id} className="hover:bg-amber-50/40 transition-colors">
                            <td className="px-4 py-3 font-medium text-gray-800 whitespace-nowrap">
                              {formatDate(inv.service_date)}
                            </td>
                            <td className="px-4 py-3">
                              {inv.client_name ? (
                                <button
                                  type="button"
                                  onClick={() => navigate(`/admin/users/${inv.client_profile_id}/detail`)}
                                  className="text-blue-600 hover:underline font-medium inline-flex items-center gap-1"
                                >
                                  {inv.client_name}
                                  <ExternalLink className="h-3 w-3 text-gray-400" />
                                </button>
                              ) : '—'}
                            </td>
                            <td className="px-4 py-3">
                              <button
                                type="button"
                                onClick={() => navigate(`/admin/bookings/${inv.booking_id}/detail`)}
                                className="text-blue-600 hover:underline font-medium"
                              >
                                {inv.booking_code || inv.booking_id?.slice(0, 8)}
                              </button>
                              {inv.service_type && (
                                <span className="ml-1.5 text-gray-400 text-xs">({inv.service_type})</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                              {inv.shift_label || (inv.shift_number ? `Shift ${inv.shift_number}` : '—')}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={amountOverrides[inv.daily_invoice_id] ?? (inv.amount ?? '')}
                                onChange={(e) =>
                                  setAmountOverrides((prev) => ({
                                    ...prev,
                                    [inv.daily_invoice_id]: e.target.value,
                                  }))
                                }
                                disabled={busy}
                                className="w-32 rounded border border-gray-200 bg-white px-2 py-1 text-right text-sm font-semibold text-gray-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 disabled:opacity-50"
                              />
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => handleDecide(inv, true)}
                                  className="inline-flex items-center gap-1 rounded bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                                  Approve
                                </button>
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => handleDecide(inv, false)}
                                  className="inline-flex items-center gap-1 rounded border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-600 hover:bg-red-100 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3" />}
                                  Reject
                                </button>
                                <button
                                  type="button"
                                  disabled={downloadingId === inv.daily_invoice_id}
                                  onClick={() => handleDownload(inv)}
                                  title="Download invoice PDF"
                                  className="inline-flex items-center gap-1 rounded border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  {downloadingId === inv.daily_invoice_id
                                    ? <Loader2 className="h-3 w-3 animate-spin" />
                                    : <Download className="h-3 w-3" />}
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}

        {/* ── ALL INVOICES TAB ──────────────────────────────────────────────── */}
        {tab === 'all' && (
          <>
            {/* Summary strip */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <SummaryCard label="Showing" value={`${invoices.length} record${invoices.length !== 1 ? 's' : ''}`} tone="slate" />
              <SummaryCard label="Invoiced Total" value={formatMoney(totals.approved)} tone="emerald" />
              <SummaryCard label="Skipped Total" value={formatMoney(totals.rejected)} tone="red" />
            </div>

            {/* Filters */}
            <div className="rounded-lg border border-gray-200 bg-white p-4">
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-gray-500 mb-1">Status</label>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="rounded-md border border-slate-300 bg-white text-slate-800 px-2.5 py-1.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  >
                    <option value="">All</option>
                    <option value="INVOICED">Invoiced</option>
                    <option value="SKIPPED">Skipped</option>
                    <option value="PENDING">Pending</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-gray-500 mb-1">Date from</label>
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="rounded-md border border-slate-300 bg-white text-slate-800 px-2.5 py-1.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-gray-500 mb-1">Date to</label>
                  <input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="rounded-md border border-slate-300 bg-white text-slate-800 px-2.5 py-1.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-gray-500 mb-1">Booking ID</label>
                  <input
                    type="text"
                    placeholder="UUID or partial…"
                    value={bookingIdFilter}
                    onChange={(e) => setBookingIdFilter(e.target.value)}
                    className="rounded-md border border-slate-300 bg-white text-slate-800 placeholder-slate-400 px-2.5 py-1.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 w-48"
                  />
                </div>
                <div className="flex gap-2 mt-1">
                  <button
                    type="button"
                    onClick={applyFilters}
                    className="inline-flex items-center gap-1.5 rounded bg-blue-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-blue-700"
                  >
                    <Filter className="h-3.5 w-3.5" /> Apply
                  </button>
                  {hasFilters && (
                    <button
                      type="button"
                      onClick={clearFilters}
                      className="inline-flex items-center gap-1 rounded border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-500 hover:bg-gray-50"
                    >
                      <X className="h-3.5 w-3.5" /> Clear
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Table */}
            <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
              {loading ? (
                <div className="flex items-center justify-center gap-2 py-16 text-sm text-gray-500">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading invoices…
                </div>
              ) : invoices.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-3 py-16 text-gray-400">
                  <Receipt className="h-8 w-8" />
                  <p className="text-sm font-medium">No invoices match the current filters</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-100 text-sm">
                    <thead className="bg-gray-50 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                      <tr>
                        <th className="px-4 py-3 text-left">Date</th>
                        <th className="px-4 py-3 text-left">Client</th>
                        <th className="px-4 py-3 text-left">Booking</th>
                        <th className="px-4 py-3 text-left">Shift</th>
                        <th className="px-4 py-3 text-left">Status</th>
                        <th className="px-4 py-3 text-right">Amount</th>
                        <th className="px-4 py-3 text-left">Decided By</th>
                        <th className="px-4 py-3 text-left">Notes</th>
                        <th className="px-4 py-3 text-left">Download</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 bg-white">
                      {invoices.map((inv) => (
                        <tr key={inv.daily_invoice_id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-3 font-medium text-gray-800 whitespace-nowrap">{formatDate(inv.service_date)}</td>
                          <td className="px-4 py-3">
                            {inv.client_name ? (
                              <button
                                type="button"
                                onClick={() => navigate(`/admin/users/${inv.client_profile_id}/detail`)}
                                className="text-blue-600 hover:underline font-medium inline-flex items-center gap-1"
                              >
                                {inv.client_name}
                                <ExternalLink className="h-3 w-3 text-gray-400" />
                              </button>
                            ) : '—'}
                          </td>
                          <td className="px-4 py-3">
                            <button
                              type="button"
                              onClick={() => navigate(`/admin/bookings/${inv.booking_id}/detail`)}
                              className="text-blue-600 hover:underline font-medium"
                            >
                              {inv.booking_code || inv.booking_id?.slice(0, 8)}
                            </button>
                            {inv.service_type && <span className="ml-1.5 text-gray-400 text-xs">({inv.service_type})</span>}
                          </td>
                          <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                            {inv.shift_label || (inv.shift_number ? `Shift ${inv.shift_number}` : '—')}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${STATUS_COLORS[inv.status] || 'bg-gray-100 text-gray-600'}`}>
                              {inv.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right font-semibold text-gray-800 whitespace-nowrap">
                            {inv.amount != null ? formatMoney(inv.amount) : '—'}
                          </td>
                          <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                            {inv.decided_by_name || '—'}
                            {inv.decided_at && <span className="block text-[11px] text-gray-400">{formatDate(inv.decided_at)}</span>}
                          </td>
                          <td className="px-4 py-3 text-gray-500 max-w-[160px] truncate">{inv.notes || '—'}</td>
                          <td className="px-4 py-3">
                            <button
                              type="button"
                              disabled={downloadingId === inv.daily_invoice_id}
                              onClick={() => handleDownload(inv)}
                              className="inline-flex items-center gap-1.5 rounded border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {downloadingId === inv.daily_invoice_id
                                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                : <Download className="h-3.5 w-3.5" />}
                              Download
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Pagination */}
              {pagination && pagination.total_pages > 1 && (
                <div className="flex items-center justify-between border-t border-gray-100 px-4 py-3">
                  <p className="text-xs text-gray-500">
                    Page {pagination.page} of {pagination.total_pages} &middot; {pagination.total} total
                  </p>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      disabled={page === 1}
                      onClick={() => setPage((p) => p - 1)}
                      className="rounded border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Prev
                    </button>
                    <button
                      type="button"
                      disabled={page === pagination.total_pages}
                      onClick={() => setPage((p) => p + 1)}
                      className="rounded border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {/* ── REGISTRATION FEES TAB ─────────────────────────────────────────── */}
        {tab === 'reg-fee' && (
          <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
            {regFeeLoading ? (
              <div className="flex items-center justify-center gap-2 py-16 text-sm text-gray-500">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading registration fee invoices…
              </div>
            ) : regFeeInvoices.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 py-16 text-gray-400">
                <Receipt className="h-8 w-8" />
                <p className="text-sm font-medium">No registration fee invoices sent yet</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-100 text-sm">
                  <thead className="bg-gray-50 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                    <tr>
                      <th className="px-4 py-3 text-left">Date Sent</th>
                      <th className="px-4 py-3 text-left">Client</th>
                      <th className="px-4 py-3 text-left">Invoice Code</th>
                      <th className="px-4 py-3 text-left">Status</th>
                      <th className="px-4 py-3 text-right">Amount</th>
                      <th className="px-4 py-3 text-left">Download</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 bg-white">
                    {regFeeInvoices.map((inv) => (
                      <tr key={inv.invoice_id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 font-medium text-gray-800 whitespace-nowrap">{formatDate(inv.created_at)}</td>
                        <td className="px-4 py-3">
                          {inv.client_name ? (
                            <button
                              type="button"
                              onClick={() => navigate(`/admin/users/${inv.client_profile_id}/detail`)}
                              className="text-blue-600 hover:underline font-medium inline-flex items-center gap-1"
                            >
                              {inv.client_name}
                              <ExternalLink className="h-3 w-3 text-gray-400" />
                            </button>
                          ) : '—'}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-gray-600">{inv.invoice_code}</td>
                        <td className="px-4 py-3">
                          <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${REG_FEE_STATUS_COLORS[inv.status] || 'bg-gray-100 text-gray-600'}`}>
                            {inv.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-gray-800 whitespace-nowrap">{formatMoney(inv.amount)}</td>
                        <td className="px-4 py-3">
                          <a
                            href={inv.pdf_url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1.5 rounded border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                          >
                            <Download className="h-3.5 w-3.5" /> Download
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}

function SummaryCard({ label, value, tone }) {
  const colors = { slate: 'text-gray-900', emerald: 'text-emerald-600', red: 'text-red-600' };
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <p className="text-[11px] font-medium uppercase tracking-wider text-gray-400">{label}</p>
      <p className={`mt-0.5 text-lg font-semibold ${colors[tone] || 'text-gray-900'}`}>{value}</p>
    </div>
  );
}
