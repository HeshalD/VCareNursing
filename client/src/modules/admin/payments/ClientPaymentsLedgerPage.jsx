import React, { useState, useEffect, useCallback } from 'react';
import {
  Receipt, Download, Send, Search, RefreshCcw, Loader2,
  CheckCircle2, Clock, ChevronLeft, ChevronRight, Wallet, User,
} from 'lucide-react';
import AdminLayout from '../components/AdminLayout';
import apiClient from '../../../api/api';
import useAutoRefresh from '../../../hooks/useAutoRefresh';

const money = new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR', maximumFractionDigits: 2 });
const fmt = (v) => money.format(Number(v || 0));
const fmtDate = (d) => d
  ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  : '—';
const fmtDateTime = (d) => d
  ? new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
  : null;

const METHOD_LABELS = { BANK_TRANSFER: 'Bank Transfer', CASH_DEPOSIT: 'Cash Deposit', CASH: 'Cash', CHEQUE: 'Cheque', WALLET: 'Wallet' };
const LIMIT = 20;

// Icon-only row action — minimal equivalent of a bordered/solid text button.
const iconBtnCls = 'inline-flex items-center justify-center w-7 h-7 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed';

const ClientPaymentsLedgerPage = () => {
  const [receipts, setReceipts] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: LIMIT, total: 0, total_pages: 1 });
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [sendingIds, setSendingIds] = useState(new Set());
  const [error, setError] = useState('');

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    if (!silent) setError('');
    try {
      const res = await apiClient.getAllReceipts({
        page, limit: LIMIT, ...(search.trim() ? { search: search.trim() } : {}),
      });
      setReceipts(Array.isArray(res?.receipts) ? res.receipts : []);
      if (res?.pagination) setPagination(res.pagination);
    } catch (err) {
      console.error('ClientPaymentsLedgerPage load error:', err);
      if (!silent) {
        setError(err?.message || 'Failed to load payments');
        setReceipts([]);
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, [page, search]);

  // Debounce the search box and reset to page 1 when the query changes.
  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput); setPage(1); }, 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => { load(); }, [load]);

  // New client payments can be recorded by other admins at any time; pause
  // while a WhatsApp receipt send is in flight so it can't be raced.
  useAutoRefresh(() => load({ silent: true }), {
    intervalMs: 5000,
    enabled: sendingIds.size === 0,
  });

  const handleSend = async (receiptId) => {
    setSendingIds((prev) => new Set([...prev, receiptId]));
    setError('');
    try {
      await apiClient.sendPaymentReceipt(receiptId);
      setReceipts((prev) => prev.map((r) =>
        r.receipt_id === receiptId
          ? { ...r, whatsapp_sent: true, whatsapp_sent_at: new Date().toISOString(), send_error: null }
          : r));
    } catch (err) {
      console.error('Send receipt error:', err);
      setError(`Failed to send receipt: ${err?.message || 'Server error'}`);
    } finally {
      setSendingIds((prev) => { const n = new Set(prev); n.delete(receiptId); return n; });
    }
  };

  const totalPages = pagination.total_pages || 1;
  const startIdx = pagination.total === 0 ? 0 : (pagination.page - 1) * pagination.limit + 1;
  const endIdx = Math.min(pagination.page * pagination.limit, pagination.total);

  // Track client changes to render a group header before the first row of each client.
  let lastClientId = null;

  return (
    <AdminLayout title="Client Payments" subtitle="All payment receipts, grouped by client">
      {/* Filter / action bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 flex-wrap">
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            placeholder="Search by client name or receipt no…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="pl-8 pr-3 py-1.5 text-sm border border-slate-200 rounded-lg bg-white focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none w-72"
          />
        </div>
        <button onClick={load} title="Refresh" className={iconBtnCls}>
          <RefreshCcw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
        <div className="flex-1" />
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <Receipt className="w-3.5 h-3.5" />
          {loading ? '…' : `${pagination.total} receipt${pagination.total !== 1 ? 's' : ''} total`}
        </div>
      </div>

      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 text-red-700 px-4 py-2.5 text-sm">{error}</div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20 gap-2 text-slate-400">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm">Loading payments…</span>
          </div>
        ) : receipts.length === 0 ? (
          <div className="text-center py-20 text-slate-400 text-sm">
            {search ? 'No payments match your search.' : 'No payment receipts have been generated yet.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Receipt</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Date</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">Amount</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Method</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Reference</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Delivery</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {receipts.map((r) => {
                  const isSending = sendingIds.has(r.receipt_id);
                  const showClientHeader = r.client_id !== lastClientId;
                  lastClientId = r.client_id;
                  return (
                    <React.Fragment key={r.receipt_id}>
                      {showClientHeader && (
                        <tr className="bg-slate-50/70">
                          <td colSpan={7} className="px-4 py-2.5">
                            <div className="flex items-center gap-2 text-slate-700">
                              <User className="w-4 h-4 text-slate-400" />
                              <span className="font-semibold">{r.client_name || 'Unknown client'}</span>
                              {r.mobile_number && <span className="text-xs text-slate-400">· {r.mobile_number}</span>}
                            </div>
                          </td>
                        </tr>
                      )}
                      <tr className="hover:bg-slate-50/60 transition-colors">
                        <td className="px-4 py-3 font-mono text-xs text-slate-500 whitespace-nowrap">{r.receipt_code}</td>
                        <td className="px-4 py-3 text-slate-600 text-xs whitespace-nowrap">{fmtDate(r.payment_date || r.created_at)}</td>
                        <td className="px-4 py-3 text-right font-medium text-slate-900 whitespace-nowrap">{fmt(r.total_amount)}</td>
                        <td className="px-4 py-3 text-slate-600 text-xs">{METHOD_LABELS[r.payment_method] || r.payment_method || '—'}</td>
                        <td className="px-4 py-3 text-slate-500 text-xs font-mono">
                          {r.reference_number || <span className="italic text-slate-300">—</span>}
                        </td>
                        <td className="px-4 py-3">
                          {r.whatsapp_sent ? (
                            <div className="flex items-start gap-1.5">
                              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                              <div>
                                <p className="text-xs font-semibold text-emerald-700 leading-tight">Sent</p>
                                <p className="text-[10px] text-slate-400 leading-tight mt-0.5">{fmtDateTime(r.whatsapp_sent_at)}</p>
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5">
                              <Clock className="w-4 h-4 text-slate-300 shrink-0" />
                              <span className="text-xs text-slate-400">Not sent</span>
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-0.5">
                            <button
                              disabled={isSending || !r.mobile_number}
                              onClick={() => handleSend(r.receipt_id)}
                              title={!r.mobile_number ? 'Client has no mobile number on record' : (r.whatsapp_sent ? 'Resend receipt via WhatsApp' : 'Send receipt via WhatsApp')}
                              className={iconBtnCls}
                            >
                              {isSending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                            </button>
                            {r.pdf_url ? (
                              <a
                                href={r.pdf_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                title="Download receipt PDF"
                                className={iconBtnCls}
                              >
                                <Download className="w-3.5 h-3.5" />
                              </a>
                            ) : (
                              <span className="text-xs text-amber-600 px-2">Generating…</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {!loading && pagination.total > 0 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-slate-500">
            Showing <span className="font-semibold text-slate-700">{startIdx}–{endIdx}</span> of{' '}
            <span className="font-semibold text-slate-700">{pagination.total}</span>
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={pagination.page <= 1}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft className="w-4 h-4" /> Prev
            </button>
            <span className="text-xs text-slate-500">Page {pagination.page} of {totalPages}</span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={pagination.page >= totalPages}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!loading && pagination.total === 0 && !search && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-8 text-center">
          <Wallet className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-600 font-medium">No client payments yet</p>
          <p className="text-sm text-slate-400 mt-1">Receipts are generated automatically when a client payment is recorded.</p>
        </div>
      )}
    </AdminLayout>
  );
};

export default ClientPaymentsLedgerPage;
