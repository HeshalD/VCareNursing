import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Loader2, X, Receipt, Check, AlertCircle, Download, Send, Search, Pencil,
} from 'lucide-react';
import AdminLayout from '../components/AdminLayout';
import apiClient from '../../../api/api';
import { formatMobileNumber } from '../../../utils/phoneFormat';
import DateInput from '../../../components/common/DateInput';
import useDebouncedValue from '../../../hooks/useDebouncedValue';

const money = new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR', maximumFractionDigits: 2 });
const formatMoney = (v) => money.format(Number(v || 0));
const formatDate = (v) => {
  if (!v) return '—';
  const d = new Date(v);
  return isNaN(d) ? '—' : d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
};

const STATUS_CONFIG = {
  INVOICED: { dot: 'bg-emerald-500', text: 'text-emerald-700', label: 'Invoiced' },
  SKIPPED:  { dot: 'bg-red-400',     text: 'text-red-700',     label: 'Skipped' },
  PENDING:  { dot: 'bg-amber-400',   text: 'text-amber-700',   label: 'Pending' },
};

// Registration fee row helpers — honorifics/company display name mirrors
// client_managemnet.jsx and client_detail_page.jsx's display_name logic;
// days-remaining mirrors client_detail_page.jsx's expiry countdown (only
// meaningful once PAID/WAIVED — see backend/cron/regFeeExpiry.js).
const regFeeDisplayName = (row) => {
  if (row.display_name_source === 'COMPANY_NAME' && row.company_name) return row.company_name;
  return `${row.honorific ? `${row.honorific} ` : ''}${row.full_name || '—'}`;
};

const regFeeDaysRemaining = (row) => {
  if (!['PAID', 'WAIVED'].includes(row.reg_fee_status) || !row.reg_fee_expires_at) return null;
  return Math.ceil((new Date(row.reg_fee_expires_at) - Date.now()) / (1000 * 60 * 60 * 24));
};

// Client's *current* membership state (client_profiles.reg_fee_status) — distinct
// from the invoice-row status above, which is this particular invoice's own
// SENT/PAID state and can lag behind if membership has since expired (Phase 3
// 365-day reset) or been overridden by an admin.
const MEMBERSHIP_STATUS_CONFIG = {
  PAID:             { dot: 'bg-emerald-500', text: 'text-emerald-700', label: 'Paid' },
  PENDING:          { dot: 'bg-amber-400',   text: 'text-amber-700',   label: 'Pending' },
  INVOICED:         { dot: 'bg-blue-400',    text: 'text-blue-700',    label: 'Invoiced' },
  RECEIPT_UPLOADED: { dot: 'bg-violet-400',  text: 'text-violet-700',  label: 'Receipt Submitted' },
  WAIVED:           { dot: 'bg-slate-400',   text: 'text-slate-600',   label: 'Waived' },
  EXPIRED:          { dot: 'bg-rose-400',    text: 'text-rose-700',    label: 'Expired' },
};

// Product/rental invoices (backend/controllers/invoiceController.js) — a
// generic invoices table distinct from the daily-invoice/reg-fee tables above.
const PRODUCT_INVOICE_STATUS_CONFIG = {
  PENDING:   { dot: 'bg-amber-400',   text: 'text-amber-700',   label: 'Pending' },
  OVERDUE:   { dot: 'bg-red-500',     text: 'text-red-700',     label: 'Overdue' },
  PAID:      { dot: 'bg-emerald-500', text: 'text-emerald-700', label: 'Paid' },
  CANCELLED: { dot: 'bg-slate-400',   text: 'text-slate-600',   label: 'Cancelled' },
};

// The system-wide overdue-invoices ledger (backend/services/overdueInvoices.js)
// — every invoice the system generated that the client hasn't paid off yet,
// currently populated only from registration fee invoices.
const OVERDUE_INVOICE_STATUS_CONFIG = {
  OVERDUE:  { dot: 'bg-red-500',     text: 'text-red-700',     label: 'Overdue' },
  RESOLVED: { dot: 'bg-emerald-500', text: 'text-emerald-700', label: 'Resolved' },
};
const OVERDUE_SOURCE_LABELS = { REGISTRATION_FEE: 'Registration Fee' };

// Sub-filter within the Registration Fees tab — mirrors client_managemnet.jsx's
// REG_TABS so admins filtering by membership state see the same vocabulary
// whether they're on the client list or this cross-client overview.
const REG_FEE_TABS = ['All', 'Pending', 'Invoiced', 'Receipt Submitted', 'Paid', 'Waived', 'Expired'];
const REG_FEE_TAB_TO_STATUS = {
  Pending: 'PENDING',
  Invoiced: 'INVOICED',
  'Receipt Submitted': 'RECEIPT_UPLOADED',
  Paid: 'PAID',
  Waived: 'WAIVED',
  Expired: 'EXPIRED',
};

const StatusDot = ({ status, config }) => {
  const cfg = config[status] || { dot: 'bg-slate-400', text: 'text-slate-600', label: status || '—' };
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${cfg.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
};

const PAGE_SIZE = 50;

// Two unrelated systems share this page: daily booking-attendance charges
// (Pending/History) vs. everything else invoice-shaped (reg fee, product/
// rental, combined quotation). Grouping + per-tab title/subtitle makes that
// split visible instead of implying one unified "invoices" list.
const TAB_GROUPS = [
  {
    label: 'Daily Attendance',
    tabs: [
      { id: 'pending', label: 'Pending' },
      { id: 'all', label: 'History' },
    ],
  },
  {
    label: 'Other Invoices',
    tabs: [
      { id: 'reg-fee', label: 'Registration Fees' },
      { id: 'products', label: 'Product & Rental' },
      { id: 'combined', label: 'Combined' },
      { id: 'overdue', label: 'Overdue' },
    ],
  },
];

const TAB_META = {
  pending: {
    title: 'Daily Attendance — Pending',
    subtitle: 'Approve or reject each service day\'s attendance charge before it becomes an invoice.',
  },
  all: {
    title: 'Daily Attendance — History',
    subtitle: 'Every daily attendance charge, invoiced or skipped.',
  },
  'reg-fee': {
    title: 'Registration Fees',
    subtitle: 'One row per client — current fee, renewal countdown, salesperson credit, and invoice on file.',
  },
  products: {
    title: 'Product & Rental Invoices',
    subtitle: 'Invoices generated from the Products catalog — purchases, rentals, and deposits.',
  },
  combined: {
    title: 'Combined Invoices',
    subtitle: 'The merged service + product Invoice generated once a quotation is paid in full.',
  },
  overdue: {
    title: 'Overdue Invoices',
    subtitle: 'Every invoice the system has sent that the client hasn\'t paid off yet, across all invoice sources.',
  },
};

const inputCls = 'rounded-lg border border-slate-300 bg-white text-slate-800 px-2.5 py-1.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100';
const primaryBtnCls = 'inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-500 transition-colors';
// Icon-only row action — the minimal equivalent of the reference table's trailing chevron.
const iconBtnCls = 'inline-flex items-center justify-center w-7 h-7 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed';
const approveBtnCls = 'inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed';
const rejectBtnCls = 'inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed';
const linkCls = 'text-blue-600 hover:underline';

export default function AdminInvoicesPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState('pending'); // 'pending' | 'all' | 'reg-fee' | 'products' | 'combined'

  // ── Combined (quotation) invoices state ────────────────────────────────────
  const [combinedInvoices, setCombinedInvoices] = useState([]);
  const [combinedLoading, setCombinedLoading] = useState(false);
  const [combinedError, setCombinedError] = useState('');
  const [sendingInvoiceId, setSendingInvoiceId] = useState('');
  const [sentInvoiceId, setSentInvoiceId] = useState('');

  // ── Registration fees overview state (one row per client) ─────────────────
  const [regFeeRows, setRegFeeRows] = useState([]);
  const [regFeeLoading, setRegFeeLoading] = useState(false);
  const [regFeeStatusTab, setRegFeeStatusTab] = useState('All');
  const [regFeeSearch, setRegFeeSearch] = useState('');
  const debouncedRegFeeSearch = useDebouncedValue(regFeeSearch, 400);
  const [regFeePage, setRegFeePage] = useState(1);
  const [regFeePagination, setRegFeePagination] = useState(null);
  const [regFeeCounts, setRegFeeCounts] = useState({ All: 0 });

  // Amount-correction modal — same operation as client_detail_page's inline
  // editor, surfaced here so an admin doesn't have to open each client just
  // to fix a typo'd fee. Only enabled for INVOICED/PAID rows (see backend
  // updateRegFeeAmount — PENDING/EXPIRED have no invoice, WAIVED has no money
  // or invoice to correct).
  const [editingRegFeeRow, setEditingRegFeeRow] = useState(null);
  const [regFeeEditAmount, setRegFeeEditAmount] = useState('');
  const [regFeeEditReason, setRegFeeEditReason] = useState('');
  const [regFeeEditLoading, setRegFeeEditLoading] = useState(false);
  const [regFeeEditError, setRegFeeEditError] = useState('');

  // ── Product/rental invoices state ──────────────────────────────────────────
  const [productInvoices, setProductInvoices] = useState([]);
  const [productInvoicesLoading, setProductInvoicesLoading] = useState(false);
  const [productInvoiceStatusFilter, setProductInvoiceStatusFilter] = useState('');
  const [downloadingProductInvoiceId, setDownloadingProductInvoiceId] = useState('');

  // ── Overdue invoices state ─────────────────────────────────────────────────
  const [overdueInvoices, setOverdueInvoices] = useState([]);
  const [overdueInvoicesLoading, setOverdueInvoicesLoading] = useState(false);
  const [overdueStatusFilter, setOverdueStatusFilter] = useState('OVERDUE');

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

  // ── Registration fees overview fetch (one row per client) ──────────────────
  const fetchRegFeeRows = useCallback(async () => {
    setRegFeeLoading(true);
    try {
      const filters = { page: regFeePage, limit: PAGE_SIZE };
      if (regFeeStatusTab !== 'All') filters.status = REG_FEE_TAB_TO_STATUS[regFeeStatusTab];
      if (debouncedRegFeeSearch) filters.search = debouncedRegFeeSearch;
      const res = await apiClient.getRegistrationFeesOverview(filters);
      setRegFeeRows(Array.isArray(res?.data) ? res.data : []);
      setRegFeePagination(res?.pagination || null);
      if (res?.counts) setRegFeeCounts(res.counts);
    } catch {
      setRegFeeRows([]);
    } finally {
      setRegFeeLoading(false);
    }
  }, [regFeePage, regFeeStatusTab, debouncedRegFeeSearch]);

  const openRegFeeEdit = (row) => {
    setEditingRegFeeRow(row);
    setRegFeeEditAmount(String(row.reg_fee_amount || ''));
    setRegFeeEditReason('');
    setRegFeeEditError('');
  };

  const closeRegFeeEdit = () => {
    if (regFeeEditLoading) return;
    setEditingRegFeeRow(null);
  };

  const handleSaveRegFeeEdit = async () => {
    const parsed = parseFloat(regFeeEditAmount);
    if (!regFeeEditAmount || isNaN(parsed) || parsed <= 0) {
      setRegFeeEditError('Enter a valid amount.');
      return;
    }
    if (!regFeeEditReason.trim()) {
      setRegFeeEditError('A reason for the change is required.');
      return;
    }
    setRegFeeEditLoading(true);
    setRegFeeEditError('');
    try {
      await apiClient.updateRegFeeAmount(editingRegFeeRow.client_profile_id, {
        amount: regFeeEditAmount,
        reason: regFeeEditReason.trim(),
      });
      setEditingRegFeeRow(null);
      fetchRegFeeRows();
    } catch (err) {
      setRegFeeEditError(err.message || 'Failed to update registration fee amount.');
    } finally {
      setRegFeeEditLoading(false);
    }
  };

  // ── Product/rental invoices fetch ──────────────────────────────────────────
  const fetchProductInvoices = useCallback(async (overrides = {}) => {
    setProductInvoicesLoading(true);
    try {
      const status = overrides.status !== undefined ? overrides.status : productInvoiceStatusFilter;
      const filters = {};
      if (status) filters.status = status;
      const res = await apiClient.getProductInvoices(filters);
      setProductInvoices(Array.isArray(res?.data) ? res.data : []);
    } catch {
      setProductInvoices([]);
    } finally {
      setProductInvoicesLoading(false);
    }
  }, [productInvoiceStatusFilter]);

  // ── Overdue invoices fetch ──────────────────────────────────────────────────
  const fetchOverdueInvoices = useCallback(async (overrides = {}) => {
    setOverdueInvoicesLoading(true);
    try {
      const status = overrides.status !== undefined ? overrides.status : overdueStatusFilter;
      const filters = { limit: 200 };
      if (status) filters.status = status;
      const res = await apiClient.getAllOverdueInvoices(filters);
      setOverdueInvoices(Array.isArray(res?.data) ? res.data : []);
    } catch {
      setOverdueInvoices([]);
    } finally {
      setOverdueInvoicesLoading(false);
    }
  }, [overdueStatusFilter]);

  const handleDownloadProductInvoice = async (inv) => {
    setDownloadingProductInvoiceId(inv.invoice_id);
    try {
      const res = await apiClient.getProductInvoicePdf(inv.invoice_id);
      if (res?.pdf_url) window.open(res.pdf_url, '_blank', 'noopener');
    } catch (err) {
      setDownloadError(err.message || 'Failed to generate invoice PDF.');
    } finally {
      setDownloadingProductInvoiceId('');
    }
  };

  // ── Combined (quotation) invoices fetch ────────────────────────────────────
  const fetchCombinedInvoices = useCallback(async () => {
    setCombinedLoading(true);
    setCombinedError('');
    try {
      const res = await apiClient.getCombinedInvoices();
      setCombinedInvoices(Array.isArray(res?.data) ? res.data : []);
    } catch (err) {
      setCombinedError(err.message || 'Failed to load combined invoices');
      setCombinedInvoices([]);
    } finally {
      setCombinedLoading(false);
    }
  }, []);

  const handleSendCombinedInvoice = async (inv) => {
    setSendingInvoiceId(inv.quote_id);
    setCombinedError('');
    setSentInvoiceId('');
    try {
      await apiClient.sendCombinedInvoice(inv.quote_id);
      setSentInvoiceId(inv.quote_id);
    } catch (err) {
      setCombinedError(err.message || 'Failed to send invoice');
    } finally {
      setSendingInvoiceId('');
    }
  };

  useEffect(() => { fetchPending(); }, [fetchPending]);
  useEffect(() => { if (tab === 'all') fetchInvoices(); }, [tab]); // eslint-disable-line
  useEffect(() => { if (tab === 'all') fetchInvoices(); }, [page]); // eslint-disable-line
  useEffect(() => { setRegFeePage(1); }, [regFeeStatusTab, debouncedRegFeeSearch]);
  useEffect(() => { if (tab === 'reg-fee') fetchRegFeeRows(); }, [tab, regFeePage, regFeeStatusTab, debouncedRegFeeSearch]); // eslint-disable-line
  useEffect(() => { if (tab === 'products') fetchProductInvoices(); }, [tab]); // eslint-disable-line
  useEffect(() => { if (tab === 'combined') fetchCombinedInvoices(); }, [tab]); // eslint-disable-line
  useEffect(() => { if (tab === 'overdue') fetchOverdueInvoices(); }, [tab]); // eslint-disable-line

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

  const tabCounts = { pending: pending.length };

  return (
    <AdminLayout
      title={TAB_META[tab].title}
      subtitle={TAB_META[tab].subtitle}
    >
      <div className="space-y-5">
        {/* Tabs, grouped by which underlying system they belong to */}
        <div className="flex flex-wrap items-start gap-4">
          {TAB_GROUPS.map((group, idx) => (
            <div key={group.label} className={`flex items-center gap-2 ${idx > 0 ? 'border-l border-slate-200 pl-4' : ''}`}>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{group.label}</span>
              <div className="flex gap-0.5 rounded-lg bg-slate-100 p-1">
                {group.tabs.map(({ id, label }) => {
                  const count = tabCounts[id];
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setTab(id)}
                      className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                        tab === id
                          ? 'bg-white text-slate-900 shadow-sm'
                          : 'text-slate-500 hover:text-slate-700'
                      }`}
                    >
                      {label}
                      {count != null && count > 0 && (
                        <span className="ml-1.5 tabular-nums text-slate-400">{count}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
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

            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              {pendingLoading ? (
                <div className="flex items-center justify-center h-64">
                  <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
                </div>
              ) : pending.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-3 py-16 text-slate-400">
                  <Check className="h-8 w-8 text-emerald-400" />
                  <p className="text-sm font-medium text-slate-500">No pending invoices — all caught up!</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50">
                        <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Date</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Client</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Booking</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Shift</th>
                        <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Amount (LKR)</th>
                        <th className="px-4 py-3" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {pending.map((inv) => {
                        const busy = decidingId === inv.daily_invoice_id;
                        return (
                          <tr key={inv.daily_invoice_id} className="hover:bg-slate-50 transition-colors">
                            <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                              {formatDate(inv.service_date)}
                            </td>
                            <td className="px-4 py-3">
                              {inv.client_name ? (
                                <button
                                  type="button"
                                  onClick={() => navigate(`/admin/users/${inv.client_profile_id}/detail`)}
                                  className={linkCls}
                                >
                                  {inv.client_name}
                                </button>
                              ) : '—'}
                            </td>
                            <td className="px-4 py-3">
                              <button
                                type="button"
                                onClick={() => navigate(`/admin/bookings/${inv.booking_id}/detail`)}
                                className={linkCls}
                              >
                                {inv.booking_code || inv.booking_id?.slice(0, 8)}
                              </button>
                              {inv.service_type && (
                                <span className="ml-1.5 text-slate-400 text-xs">({inv.service_type})</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
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
                                onWheel={(e) => e.target.blur()}
                                disabled={busy}
                                className="w-28 rounded-lg border border-slate-300 bg-white px-2 py-1 text-right text-sm font-medium text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:opacity-50"
                              />
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center justify-end gap-0.5">
                                <button type="button" disabled={busy} onClick={() => handleDecide(inv, true)} className={approveBtnCls}>
                                  {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                                  Approve
                                </button>
                                <button type="button" disabled={busy} onClick={() => handleDecide(inv, false)} className={rejectBtnCls}>
                                  {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3" />}
                                  Reject
                                </button>
                                <button
                                  type="button"
                                  disabled={downloadingId === inv.daily_invoice_id}
                                  onClick={() => handleDownload(inv)}
                                  title="Download invoice PDF"
                                  className={iconBtnCls}
                                >
                                  {downloadingId === inv.daily_invoice_id
                                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    : <Download className="h-3.5 w-3.5" />}
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

            {/* Filters — flat inline toolbar, no boxed card */}
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Status</label>
                <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={inputCls}>
                  <option value="">All</option>
                  <option value="INVOICED">Invoiced</option>
                  <option value="SKIPPED">Skipped</option>
                  <option value="PENDING">Pending</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Date from</label>
                <DateInput value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Date to</label>
                <DateInput value={dateTo} onChange={(e) => setDateTo(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Booking ID</label>
                <input
                  type="text"
                  placeholder="UUID or partial…"
                  value={bookingIdFilter}
                  onChange={(e) => setBookingIdFilter(e.target.value)}
                  className={`${inputCls} placeholder-slate-400 w-48`}
                />
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={applyFilters} className={primaryBtnCls}>Apply</button>
                {hasFilters && (
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-medium text-slate-500 hover:bg-slate-100 transition-colors"
                  >
                    <X className="h-3.5 w-3.5" /> Clear
                  </button>
                )}
              </div>
            </div>

            {/* Table */}
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              {loading ? (
                <div className="flex items-center justify-center h-64">
                  <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
                </div>
              ) : invoices.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-3 py-16 text-slate-400">
                  <Receipt className="h-8 w-8" />
                  <p className="text-sm font-medium">No invoices match the current filters</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50">
                        <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Date</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Client</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Booking</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Shift</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                        <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Amount</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Decided By</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Notes</th>
                        <th className="px-4 py-3" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {invoices.map((inv) => (
                        <tr key={inv.daily_invoice_id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{formatDate(inv.service_date)}</td>
                          <td className="px-4 py-3">
                            {inv.client_name ? (
                              <button
                                type="button"
                                onClick={() => navigate(`/admin/users/${inv.client_profile_id}/detail`)}
                                className={linkCls}
                              >
                                {inv.client_name}
                              </button>
                            ) : '—'}
                          </td>
                          <td className="px-4 py-3">
                            <button
                              type="button"
                              onClick={() => navigate(`/admin/bookings/${inv.booking_id}/detail`)}
                              className={linkCls}
                            >
                              {inv.booking_code || inv.booking_id?.slice(0, 8)}
                            </button>
                            {inv.service_type && <span className="ml-1.5 text-slate-400 text-xs">({inv.service_type})</span>}
                          </td>
                          <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                            {inv.shift_label || (inv.shift_number ? `Shift ${inv.shift_number}` : '—')}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <StatusDot status={inv.status} config={STATUS_CONFIG} />
                          </td>
                          <td className="px-4 py-3 text-right font-medium text-slate-800 whitespace-nowrap">
                            {inv.amount != null ? formatMoney(inv.amount) : '—'}
                          </td>
                          <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                            {inv.decided_by_name || '—'}
                            {inv.decided_at && <span className="block text-xs text-slate-400">{formatDate(inv.decided_at)}</span>}
                          </td>
                          <td className="px-4 py-3 text-slate-500 max-w-[160px] truncate">{inv.notes || '—'}</td>
                          <td className="px-4 py-3 text-right">
                            <button
                              type="button"
                              disabled={downloadingId === inv.daily_invoice_id}
                              onClick={() => handleDownload(inv)}
                              title="Download invoice PDF"
                              className={iconBtnCls}
                            >
                              {downloadingId === inv.daily_invoice_id
                                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                : <Download className="h-3.5 w-3.5" />}
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
                <div className="flex items-center justify-between border-t border-slate-100 px-4 py-2.5">
                  <p className="text-xs text-slate-400">
                    Page {pagination.page} of {pagination.total_pages} &middot; {pagination.total} total
                  </p>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      disabled={page === 1}
                      onClick={() => setPage((p) => p - 1)}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Prev
                    </button>
                    <button
                      type="button"
                      disabled={page === pagination.total_pages}
                      onClick={() => setPage((p) => p + 1)}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors disabled:cursor-not-allowed disabled:opacity-40"
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
          <>
            {/* Sub-filter: membership state, mirrors client_managemnet.jsx's tabs */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex items-center gap-0.5 bg-slate-100 rounded-lg p-1 w-fit flex-wrap">
                {REG_FEE_TABS.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setRegFeeStatusTab(t)}
                    className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                      regFeeStatusTab === t
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    {t}
                    <span className="ml-1.5 tabular-nums text-slate-400">{regFeeCounts[t === 'All' ? 'All' : REG_FEE_TAB_TO_STATUS[t]] ?? 0}</span>
                  </button>
                ))}
              </div>
              <div className="relative sm:ml-auto">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  value={regFeeSearch}
                  onChange={(e) => setRegFeeSearch(e.target.value)}
                  placeholder="Search by name, code, mobile…"
                  className="pl-8 pr-3 py-1.5 text-sm border border-slate-200 rounded-lg bg-white focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none w-64"
                />
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              {regFeeLoading ? (
                <div className="flex items-center justify-center h-64">
                  <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
                </div>
              ) : regFeeRows.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-3 py-16 text-slate-400">
                  <Receipt className="h-8 w-8" />
                  <p className="text-sm font-medium">No clients match the current filters</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50">
                        <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Client</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Mobile</th>
                        <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Amount Paid</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Renewal</th>
                        <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Reg. Fee</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Salesperson</th>
                        <th className="px-4 py-3" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {regFeeRows.map((row) => {
                        const daysLeft = regFeeDaysRemaining(row);
                        const renewalTone = daysLeft === null ? 'text-slate-400'
                          : daysLeft <= 7 ? 'text-rose-600'
                          : daysLeft <= 30 ? 'text-amber-600'
                          : 'text-emerald-600';
                        const canEdit = ['INVOICED', 'PAID'].includes(row.reg_fee_status);
                        return (
                          <tr key={row.client_profile_id} className="hover:bg-slate-50 transition-colors">
                            <td className="px-4 py-3">
                              <button
                                type="button"
                                onClick={() => navigate(`/admin/users/${row.client_profile_id}/detail`)}
                                className={`${linkCls} text-left`}
                              >
                                <span className="block font-medium">{regFeeDisplayName(row)}</span>
                                {row.client_code && <span className="block text-xs text-slate-400 font-mono">{row.client_code}</span>}
                              </button>
                              <div className="mt-0.5">
                                <StatusDot status={row.reg_fee_status} config={MEMBERSHIP_STATUS_CONFIG} />
                              </div>
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              {row.mobile_number ? (
                                <button
                                  type="button"
                                  onClick={() => navigate(`/admin/users/${row.client_profile_id}/detail`)}
                                  className={linkCls}
                                >
                                  {formatMobileNumber(row.mobile_number)}
                                </button>
                              ) : '—'}
                            </td>
                            <td className="px-4 py-3 text-right font-medium text-slate-800 whitespace-nowrap">{formatMoney(row.total_paid)}</td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              {daysLeft === null ? (
                                <span className="text-slate-400">—</span>
                              ) : (
                                <span className={`font-semibold ${renewalTone}`}>
                                  {daysLeft > 0 ? `${daysLeft}d left` : daysLeft === 0 ? 'Today' : 'Overdue'}
                                </span>
                              )}
                              {row.reg_fee_expires_at && (
                                <span className="block text-xs text-slate-400 mt-0.5">{formatDate(row.reg_fee_expires_at)}</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right font-medium text-slate-800 whitespace-nowrap">{formatMoney(row.reg_fee_amount)}</td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              {row.salesperson_id ? (
                                <button
                                  type="button"
                                  onClick={() => navigate(`/admin/salespersons/${row.salesperson_id}`)}
                                  className={linkCls}
                                >
                                  {row.salesperson_name}
                                </button>
                              ) : <span className="text-slate-400">—</span>}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center justify-end gap-1">
                                <a
                                  href={row.invoice_pdf_url || undefined}
                                  target="_blank"
                                  rel="noreferrer"
                                  title={row.invoice_pdf_url ? 'Download invoice PDF' : 'No invoice sent yet'}
                                  className={`${iconBtnCls} ${!row.invoice_pdf_url ? 'pointer-events-none opacity-40' : ''}`}
                                  aria-disabled={!row.invoice_pdf_url}
                                >
                                  <Download className="h-3.5 w-3.5" />
                                </a>
                                <button
                                  type="button"
                                  onClick={() => canEdit && openRegFeeEdit(row)}
                                  disabled={!canEdit}
                                  title={canEdit ? 'Edit registration fee amount' : 'Only invoiced or paid fees can be edited'}
                                  className={iconBtnCls}
                                >
                                  <Pencil className="h-3.5 w-3.5" />
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

              {/* Pagination */}
              {regFeePagination && regFeePagination.total_pages > 1 && (
                <div className="flex items-center justify-between border-t border-slate-100 px-4 py-2.5">
                  <p className="text-xs text-slate-400">
                    Page {regFeePagination.page} of {regFeePagination.total_pages} &middot; {regFeePagination.total} total
                  </p>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      disabled={regFeePage === 1}
                      onClick={() => setRegFeePage((p) => p - 1)}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Prev
                    </button>
                    <button
                      type="button"
                      disabled={regFeePage === regFeePagination.total_pages}
                      onClick={() => setRegFeePage((p) => p + 1)}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {/* Edit Registration Fee Amount modal */}
        {editingRegFeeRow && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/30" onClick={closeRegFeeEdit} />
            <div className="relative w-full max-w-sm bg-white rounded-xl shadow-2xl p-5">
              <h2 className="text-sm font-semibold text-slate-900 mb-1">Edit Registration Fee</h2>
              <p className="text-xs text-slate-500 mb-4">{regFeeDisplayName(editingRegFeeRow)}</p>

              <label className="block text-xs font-medium text-slate-600 mb-1">New Fee Amount (LKR)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={regFeeEditAmount}
                onChange={(e) => setRegFeeEditAmount(e.target.value)}
                onWheel={(e) => e.target.blur()}
                className={`${inputCls} w-full mb-3`}
              />

              <label className="block text-xs font-medium text-slate-600 mb-1">Reason for Change</label>
              <input
                type="text"
                value={regFeeEditReason}
                onChange={(e) => setRegFeeEditReason(e.target.value)}
                placeholder="e.g. Applied a discount, corrected a typo"
                className={`${inputCls} w-full`}
              />

              {editingRegFeeRow.reg_fee_status === 'PAID' && (
                <p className="mt-3 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  This fee is already marked paid — saving corrects the recorded payment and invoice on file. It does not trigger a refund or additional collection.
                </p>
              )}

              {regFeeEditError && <p className="mt-3 text-xs text-red-600">{regFeeEditError}</p>}

              <div className="flex items-center gap-2 mt-4">
                <button
                  type="button"
                  onClick={closeRegFeeEdit}
                  disabled={regFeeEditLoading}
                  className="flex-1 px-4 py-2 border border-slate-200 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-100 transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveRegFeeEdit}
                  disabled={regFeeEditLoading}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-500 transition-colors disabled:opacity-50"
                >
                  {regFeeEditLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                  Save
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── PRODUCTS TAB ──────────────────────────────────────────────────── */}
        {tab === 'products' && (
          <>
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Status</label>
                <select
                  value={productInvoiceStatusFilter}
                  onChange={(e) => setProductInvoiceStatusFilter(e.target.value)}
                  className={inputCls}
                >
                  <option value="">All</option>
                  <option value="PENDING">Pending</option>
                  <option value="OVERDUE">Overdue</option>
                  <option value="PAID">Paid</option>
                  <option value="CANCELLED">Cancelled</option>
                </select>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => fetchProductInvoices()} className={primaryBtnCls}>Apply</button>
                {productInvoiceStatusFilter && (
                  <button
                    type="button"
                    onClick={() => { setProductInvoiceStatusFilter(''); fetchProductInvoices({ status: '' }); }}
                    className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-medium text-slate-500 hover:bg-slate-100 transition-colors"
                  >
                    <X className="h-3.5 w-3.5" /> Clear
                  </button>
                )}
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              {productInvoicesLoading ? (
                <div className="flex items-center justify-center h-64">
                  <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
                </div>
              ) : productInvoices.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-3 py-16 text-slate-400">
                  <Receipt className="h-8 w-8" />
                  <p className="text-sm font-medium">No product invoices match the current filters</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50">
                        <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Invoice Code</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Date</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Recipient</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Category</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                        <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Amount</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Paid</th>
                        <th className="px-4 py-3" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {productInvoices.map((inv) => (
                        <tr key={inv.invoice_id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-3 font-mono text-xs text-slate-500 whitespace-nowrap">{inv.invoice_code}</td>
                          <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{formatDate(inv.created_at)}</td>
                          <td className="px-4 py-3">
                            {inv.client_id ? (
                              <button
                                type="button"
                                onClick={() => navigate(`/admin/users/${inv.client_id}/detail`)}
                                className={linkCls}
                              >
                                {inv.client_name}
                              </button>
                            ) : (
                              <>
                                {inv.walk_in_name || '—'}
                                {inv.walk_in_name && <span className="ml-1.5 text-[10px] text-amber-600">(walk-in)</span>}
                              </>
                            )}
                          </td>
                          <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{inv.category}</td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <StatusDot status={inv.status} config={PRODUCT_INVOICE_STATUS_CONFIG} />
                          </td>
                          <td className="px-4 py-3 text-right font-medium text-slate-800 whitespace-nowrap">{formatMoney(inv.amount)}</td>
                          <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{inv.paid_at ? formatDate(inv.paid_at) : '—'}</td>
                          <td className="px-4 py-3 text-right">
                            <button
                              type="button"
                              disabled={downloadingProductInvoiceId === inv.invoice_id}
                              onClick={() => handleDownloadProductInvoice(inv)}
                              title="Download invoice PDF"
                              className={iconBtnCls}
                            >
                              {downloadingProductInvoiceId === inv.invoice_id
                                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                : <Download className="h-3.5 w-3.5" />}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            <p className="text-xs text-slate-400">Payments for these invoices are recorded from the Products page.</p>
          </>
        )}

        {/* ── QUOTATION INVOICES TAB ────────────────────────────────────────── */}
        {tab === 'combined' && (
          <>
            {combinedError && (
              <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
                <AlertCircle className="h-4 w-4 shrink-0" /> {combinedError}
              </div>
            )}
            <p className="text-xs text-slate-400">
              The combined Invoice generated for a quotation (service charges plus any linked products/rentals) once it's paid in full.
            </p>
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              {combinedLoading ? (
                <div className="flex items-center justify-center h-64">
                  <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
                </div>
              ) : combinedInvoices.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-3 py-16 text-slate-400">
                  <Receipt className="h-8 w-8" />
                  <p className="text-sm font-medium">No quotation invoices generated yet</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50">
                        <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Invoice Code</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Generated</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Estimate #</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Payer</th>
                        <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Total</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {combinedInvoices.map((inv) => (
                        <tr key={inv.quote_id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-3 font-mono text-xs text-slate-500 whitespace-nowrap">{inv.invoice_code}</td>
                          <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{formatDate(inv.invoice_generated_at)}</td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => navigate(`/admin/quotations/${inv.quote_id}`)}
                              className={linkCls}
                            >
                              {inv.estimate_number}
                            </button>
                          </td>
                          <td className="px-4 py-3 text-slate-700">
                            {inv.payer_name || '—'}
                            {inv.payer_mobile && <span className="block text-xs text-slate-400">{formatMobileNumber(inv.payer_mobile)}</span>}
                          </td>
                          <td className="px-4 py-3 text-right font-medium text-slate-800 whitespace-nowrap">{formatMoney(inv.total_amount)}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end gap-0.5">
                              <a href={inv.invoice_pdf_url} target="_blank" rel="noreferrer" title="Download invoice PDF" className={iconBtnCls}>
                                <Download className="h-3.5 w-3.5" />
                              </a>
                              <button
                                type="button"
                                disabled={sendingInvoiceId === inv.quote_id}
                                onClick={() => handleSendCombinedInvoice(inv)}
                                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-500 transition-colors disabled:opacity-50"
                              >
                                {sendingInvoiceId === inv.quote_id
                                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  : <Send className="h-3.5 w-3.5" />}
                                {sentInvoiceId === inv.quote_id ? 'Sent!' : 'Send to Client'}
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}

        {/* ── OVERDUE INVOICES TAB ──────────────────────────────────────────── */}
        {tab === 'overdue' && (
          <>
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Status</label>
                <select
                  value={overdueStatusFilter}
                  onChange={(e) => setOverdueStatusFilter(e.target.value)}
                  className={inputCls}
                >
                  <option value="">All</option>
                  <option value="OVERDUE">Overdue</option>
                  <option value="RESOLVED">Resolved</option>
                </select>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => fetchOverdueInvoices()} className={primaryBtnCls}>Apply</button>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              {overdueInvoicesLoading ? (
                <div className="flex items-center justify-center h-64">
                  <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
                </div>
              ) : overdueInvoices.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-3 py-16 text-slate-400">
                  <Receipt className="h-8 w-8" />
                  <p className="text-sm font-medium">No overdue invoices match the current filters</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50">
                        <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Invoiced On</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Client</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Source</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Invoice Code</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Resolved On</th>
                        <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {overdueInvoices.map((inv) => (
                        <tr key={inv.overdue_invoice_id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{formatDate(inv.invoiced_at)}</td>
                          <td className="px-4 py-3">
                            {inv.client_profile_id ? (
                              <button
                                type="button"
                                onClick={() => navigate(`/admin/users/${inv.client_profile_id}/detail`)}
                                className={linkCls}
                              >
                                {inv.client_name || '—'}
                              </button>
                            ) : (inv.client_name || '—')}
                          </td>
                          <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{OVERDUE_SOURCE_LABELS[inv.source_type] || inv.source_type}</td>
                          <td className="px-4 py-3 font-mono text-xs text-slate-500">{inv.invoice_code || '—'}</td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <StatusDot status={inv.status} config={OVERDUE_INVOICE_STATUS_CONFIG} />
                          </td>
                          <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{inv.resolved_at ? formatDate(inv.resolved_at) : '—'}</td>
                          <td className="px-4 py-3 text-right font-medium text-slate-800 whitespace-nowrap">{formatMoney(inv.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </AdminLayout>
  );
}

function SummaryCard({ label, value, tone }) {
  const colors = { slate: 'text-slate-900', emerald: 'text-emerald-600', red: 'text-red-600' };
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4">
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{label}</p>
      <p className={`mt-0.5 text-lg font-semibold ${colors[tone] || 'text-slate-900'}`}>{value}</p>
    </div>
  );
}
