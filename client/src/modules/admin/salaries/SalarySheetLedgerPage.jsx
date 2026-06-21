import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  FileText, Download, Eye, Search, RefreshCcw, Loader2,
  ArrowLeft, Banknote, Send, CheckSquare, Square,
  ChevronDown, CheckCircle2, Clock, X,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import AdminLayout from '../components/AdminLayout';
import apiClient from '../../../api/api';

const money = new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR', maximumFractionDigits: 2 });
const fmt = (v) => money.format(Number(v || 0));
const fmtDate = (d) => d
  ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  : '—';
const fmtDateTime = (d) => d
  ? new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
  : null;
const monthLabel = (d) => d
  ? new Date(d).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
  : '—';

const METHOD_LABELS = { BANK_TRANSFER: 'Bank Transfer', CASH: 'Cash', CHEQUE: 'Cheque' };

const SalarySheetLedgerPage = () => {
  const navigate = useNavigate();
  const [sheets, setSheets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [monthFilter, setMonthFilter] = useState('');

  const [selectedIds, setSelectedIds] = useState(new Set());
  const [sendingIds, setSendingIds] = useState(new Set());
  const [bulkSending, setBulkSending] = useState(false);
  const [bulkResult, setBulkResult] = useState(null);
  const [sendAllOpen, setSendAllOpen] = useState(false);
  const dropdownRef = useRef(null);

  const load = async () => {
    setLoading(true);
    setSelectedIds(new Set());
    setBulkResult(null);
    try {
      const res = await apiClient.getSalarySheetLedger();
      setSheets(res.data || []);
    } catch (err) {
      console.error('SalarySheetLedgerPage load error:', err);
      setSheets([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    const handler = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setSendAllOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const monthOptions = useMemo(() => {
    const seen = new Set();
    const opts = [];
    sheets.forEach(s => {
      const label = monthLabel(s.paid_at);
      if (!seen.has(label)) { seen.add(label); opts.push(label); }
    });
    return opts;
  }, [sheets]);

  const filtered = useMemo(() => {
    let rows = sheets;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      rows = rows.filter(s => s.staff_name?.toLowerCase().includes(q) || s.designation?.toLowerCase().includes(q));
    }
    if (monthFilter) {
      rows = rows.filter(s => monthLabel(s.paid_at) === monthFilter);
    }
    return rows;
  }, [sheets, search, monthFilter]);

  const unsentFiltered = useMemo(() => filtered.filter(s => !s.notification_sent_at), [filtered]);

  const updateSentAt = (ids) => {
    const now = new Date().toISOString();
    const idSet = new Set(ids);
    setSheets(prev => prev.map(s => idSet.has(s.staff_payment_id) ? { ...s, notification_sent_at: now } : s));
  };

  const handleSendOne = async (staffPaymentId) => {
    setSendingIds(prev => new Set([...prev, staffPaymentId]));
    try {
      await apiClient.resendSalarySheetNotification(staffPaymentId);
      updateSentAt([staffPaymentId]);
    } catch (err) {
      console.error('Send notification error:', err);
      alert(`Failed to send: ${err.message || 'Server error'}`);
    } finally {
      setSendingIds(prev => { const n = new Set(prev); n.delete(staffPaymentId); return n; });
    }
  };

  const handleBulkSend = async (ids, mode = 'selective') => {
    if (!ids.length) return;
    setBulkSending(true);
    setBulkResult(null);
    setSendAllOpen(false);
    try {
      const res = await apiClient.bulkResendSalarySheetNotifications(ids, mode);
      const successIds = (res.results || []).filter(r => r.status === 'success').map(r => r.staff_payment_id);
      updateSentAt(successIds);
      setBulkResult({
        successCount: res.successCount,
        total: res.total,
        errors: (res.results || []).filter(r => r.status === 'error'),
      });
      setSelectedIds(new Set());
    } catch (err) {
      console.error('Bulk send error:', err);
      alert(`Bulk send failed: ${err.message || 'Server error'}`);
    } finally {
      setBulkSending(false);
    }
  };

  const allFilteredSelected = filtered.length > 0 && filtered.every(s => selectedIds.has(s.staff_payment_id));
  const toggleSelectAll = () => {
    setSelectedIds(allFilteredSelected ? new Set() : new Set(filtered.map(s => s.staff_payment_id)));
  };
  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  const selectedCount = selectedIds.size;
  const sentCount = filtered.filter(s => s.notification_sent_at).length;

  return (
    <AdminLayout title="Salary Sheets" subtitle="Ledger of all generated salary sheet PDFs">
      {/* Back link */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate('/admin/salaries')}
          className="flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-800 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Staff Salaries
        </button>
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <FileText className="w-4 h-4 text-violet-500" />
          {loading ? '…' : `${sheets.length} sheet${sheets.length !== 1 ? 's' : ''} total`}
        </div>
      </div>

      {/* Bulk result banner */}
      {bulkResult && (
        <div className={`rounded-xl px-4 py-3 flex items-center justify-between text-sm ${
          bulkResult.errors.length === 0
            ? 'bg-emerald-50 border border-emerald-200 text-emerald-700'
            : 'bg-amber-50 border border-amber-200 text-amber-700'
        }`}>
          <span>
            {bulkResult.successCount} of {bulkResult.total} notification{bulkResult.total !== 1 ? 's' : ''} sent successfully.
            {bulkResult.errors.length > 0 && ` ${bulkResult.errors.length} failed.`}
          </span>
          <button onClick={() => setBulkResult(null)} className="opacity-50 hover:opacity-100 ml-4">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Filters + action bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 flex-wrap">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search by staff name…"
            value={search}
            onChange={e => { setSearch(e.target.value); setSelectedIds(new Set()); }}
            className="pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-100 w-64"
          />
        </div>
        <select
          value={monthFilter}
          onChange={e => { setMonthFilter(e.target.value); setSelectedIds(new Set()); }}
          className="border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-[#137A6B] bg-white text-slate-600"
        >
          <option value="">All months</option>
          {monthOptions.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
        <button onClick={load} className="p-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-500" title="Refresh">
          <RefreshCcw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>

        <div className="flex-1" />

        {/* Send Selected — visible when ≥1 row is checked */}
        {selectedCount > 0 && (
          <button
            disabled={bulkSending}
            onClick={() => handleBulkSend([...selectedIds], 'selective')}
            className="flex items-center gap-2 px-4 py-2 bg-[#137A6B] text-white text-sm font-semibold rounded-xl hover:bg-[#0F6559] disabled:opacity-50 transition-colors"
          >
            {bulkSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Send Selected ({selectedCount})
          </button>
        )}

        {/* Send All dropdown */}
        {!loading && filtered.length > 0 && (
          <div className="relative" ref={dropdownRef}>
            <button
              disabled={bulkSending}
              onClick={() => setSendAllOpen(o => !o)}
              className="flex items-center gap-2 px-4 py-2 border border-slate-200 bg-white text-slate-700 text-sm font-semibold rounded-xl hover:bg-slate-50 disabled:opacity-50 transition-colors"
            >
              {bulkSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Send All
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${sendAllOpen ? 'rotate-180' : ''}`} />
            </button>
            {sendAllOpen && (
              <div className="absolute right-0 top-full mt-1.5 w-60 bg-white rounded-xl border border-slate-200 shadow-lg z-20 overflow-hidden">
                <button
                  disabled={unsentFiltered.length === 0}
                  onClick={() => handleBulkSend(unsentFiltered.map(s => s.staff_payment_id), 'unsent')}
                  className="w-full text-left px-4 py-3 text-sm hover:bg-slate-50 disabled:opacity-40 transition-colors"
                >
                  <p className="font-semibold text-slate-800">Send Unsent Only</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {unsentFiltered.length} sheet{unsentFiltered.length !== 1 ? 's' : ''} not yet sent
                  </p>
                </button>
                <div className="border-t border-slate-100" />
                <button
                  onClick={() => handleBulkSend(filtered.map(s => s.staff_payment_id), 'all')}
                  className="w-full text-left px-4 py-3 text-sm hover:bg-slate-50 transition-colors"
                >
                  <p className="font-semibold text-slate-800">Send All in View</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Resend all {filtered.length} visible sheet{filtered.length !== 1 ? 's' : ''}
                  </p>
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20 gap-2 text-slate-400">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm">Loading salary sheets…</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 text-slate-400 text-sm">
            {search || monthFilter ? 'No salary sheets match your filters.' : 'No salary sheet PDFs have been generated yet.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="px-4 py-3 w-10">
                    <button onClick={toggleSelectAll} className="text-slate-400 hover:text-[#137A6B] transition-colors">
                      {allFilteredSelected
                        ? <CheckSquare className="w-4 h-4 text-[#137A6B]" />
                        : <Square className="w-4 h-4" />}
                    </button>
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Staff Member</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Month</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">Amount Paid</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Method</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Reference</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Notification</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map(s => {
                  const isSending = sendingIds.has(s.staff_payment_id);
                  const isSelected = selectedIds.has(s.staff_payment_id);
                  const sentAt = s.notification_sent_at;
                  return (
                    <tr
                      key={s.staff_payment_id}
                      className={`hover:bg-slate-50/60 transition-colors ${isSelected ? 'bg-emerald-50/30' : ''}`}
                    >
                      <td className="px-4 py-3">
                        <button
                          onClick={() => toggleSelect(s.staff_payment_id)}
                          className="text-slate-400 hover:text-[#137A6B] transition-colors"
                        >
                          {isSelected
                            ? <CheckSquare className="w-4 h-4 text-[#137A6B]" />
                            : <Square className="w-4 h-4" />}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-slate-600 text-xs whitespace-nowrap">{fmtDate(s.paid_at)}</td>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-slate-800">{s.staff_name}</p>
                        <p className="text-xs text-slate-500">{s.designation || '—'}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-violet-100 text-violet-700">
                          {monthLabel(s.paid_at)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-slate-900">{fmt(s.amount_paid)}</td>
                      <td className="px-4 py-3 text-slate-600 text-xs">{METHOD_LABELS[s.payment_method] || s.payment_method || '—'}</td>
                      <td className="px-4 py-3 text-slate-500 text-xs font-mono">
                        {s.reference_number || <span className="italic text-slate-300">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        {sentAt ? (
                          <div className="flex items-start gap-1.5">
                            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                            <div>
                              <p className="text-xs font-semibold text-emerald-700 leading-tight">Sent</p>
                              <p className="text-[10px] text-slate-400 leading-tight mt-0.5">{fmtDateTime(sentAt)}</p>
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
                        <div className="flex items-center justify-end gap-2">
                          <button
                            disabled={isSending || bulkSending}
                            onClick={() => handleSendOne(s.staff_payment_id)}
                            title={sentAt ? 'Resend WhatsApp + SMS' : 'Send WhatsApp + SMS'}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40 transition-colors"
                          >
                            {isSending
                              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              : <Send className="w-3.5 h-3.5" />}
                            {sentAt ? 'Resend' : 'Send'}
                          </button>
                          <a
                            href={s.salary_sheet_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
                            title="Preview PDF"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            Preview
                          </a>
                          <a
                            href={s.salary_sheet_url}
                            download={`Salary_Sheet_${(s.staff_name || '').replace(/\s+/g, '_')}_${monthLabel(s.paid_at).replace(/\s+/g, '_')}.pdf`}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#137A6B] text-white text-xs font-semibold hover:bg-[#0F6559] transition-colors"
                            title="Download PDF"
                          >
                            <Download className="w-3.5 h-3.5" />
                            Download
                          </a>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-200 bg-slate-50">
                  <td colSpan={4} className="px-4 py-3 text-xs font-bold text-slate-500 uppercase">
                    {filtered.length} record{filtered.length !== 1 ? 's' : ''}
                    {selectedCount > 0 && <span className="text-[#137A6B]"> · {selectedCount} selected</span>}
                    <span className="text-emerald-600"> · {sentCount} sent</span>
                    {unsentFiltered.length > 0 && <span className="text-slate-400"> · {unsentFiltered.length} unsent</span>}
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-slate-800">
                    {fmt(filtered.reduce((s, r) => s + parseFloat(r.amount_paid || 0), 0))}
                  </td>
                  <td colSpan={4} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Empty state */}
      {!loading && sheets.length === 0 && (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-8 text-center">
          <Banknote className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-600 font-medium">No salary sheets yet</p>
          <p className="text-sm text-slate-400 mt-1">Salary sheet PDFs are automatically generated when staff payouts are processed.</p>
          <button
            onClick={() => navigate('/admin/salaries')}
            className="mt-4 bg-[#137A6B] text-white rounded-xl px-5 py-2 text-sm font-bold hover:bg-[#0F6559] transition-colors"
          >
            Go to Staff Salaries
          </button>
        </div>
      )}
    </AdminLayout>
  );
};

export default SalarySheetLedgerPage;
