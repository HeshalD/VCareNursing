import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Eye, XCircle, Loader2, Calendar, Activity, Clock, CheckCircle,
  FileText, Download, MessageSquare, Stethoscope, Baby, Heart,
  ChevronDown, ChevronRight, Infinity as InfinityIcon, Trash2, Search,
  X, CheckSquare, Square, Archive,
} from 'lucide-react';
import AdminLayout from '../components/AdminLayout';
import apiClient from '../../../api/api';
import { useAdminAuth } from '../../../context/AdminAuthContext';

const PAGE_SIZE = 10;

const fmt = (n) =>
  Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtDate = (d) =>
  new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

const getStatusBadge = (status) => {
  const map = {
    ACTIVE: { bg: 'bg-green-100', text: 'text-green-800', label: 'Active' },
    active: { bg: 'bg-green-100', text: 'text-green-800', label: 'Active' },
    PENDING_TERMINATION: { bg: 'bg-yellow-100', text: 'text-yellow-800', label: 'Pending Termination' },
    pending_termination: { bg: 'bg-yellow-100', text: 'text-yellow-800', label: 'Pending Termination' },
    TERMINATED: { bg: 'bg-red-100', text: 'text-red-800', label: 'Terminated' },
    terminated: { bg: 'bg-red-100', text: 'text-red-800', label: 'Terminated' },
    COMPLETED: { bg: 'bg-blue-100', text: 'text-blue-800', label: 'Completed' },
    completed: { bg: 'bg-blue-100', text: 'text-blue-800', label: 'Completed' },
    CANCELLED: { bg: 'bg-red-100', text: 'text-red-800', label: 'Cancelled' },
    cancelled: { bg: 'bg-red-100', text: 'text-red-800', label: 'Cancelled' },
  };
  const c = map[status] || { bg: 'bg-slate-100', text: 'text-slate-700', label: status };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${c.bg} ${c.text}`}>
      {c.label}
    </span>
  );
};

const getServiceIcon = (serviceType) => {
  const icons = { '{NURSE}': Stethoscope, '{NANNY}': Baby, HOME_NURSING: Heart };
  return icons[serviceType] || Activity;
};

// ─── Shared zip helper ───────────────────────────────────────────────────────

const triggerZip = async (files, zipName) => {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  files.forEach(({ blob, filename }) => zip.file(filename, blob));
  const content = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(content);
  const a = document.createElement('a');
  a.href = url;
  a.download = zipName;
  document.body.appendChild(a);
  a.click();
  URL.revokeObjectURL(url);
  document.body.removeChild(a);
};

// ─── Bookings bulk action modal ───────────────────────────────────────────────

const BOOKING_BULK_CFG = {
  save: {
    title: (n) => `Generate ${n} Statement${n > 1 ? 's' : ''}`,
    doneTitle: 'Generation Complete',
    doneSummary: (ok, total) => `${ok} saved to history · ${total - ok} failed`,
    btnLabel: (n) => `Generate ${n} Statement${n > 1 ? 's' : ''}`,
    runningLabel: (done, total) => `${done} / ${total} done…`,
    statusLabel: { loading: 'Generating…', success: 'Saved', error: 'Failed', pending: 'Queued' },
    accentBtn: 'bg-blue-600 hover:bg-blue-700',
    bar: 'bg-blue-500',
  },
  download: {
    title: (n) => `Download ${n} Statement${n > 1 ? 's' : ''} as ZIP`,
    doneTitle: 'ZIP Download Ready',
    doneSummary: (ok, total) => `${ok} fetched · ${total - ok} failed`,
    btnLabel: (n) => `Download ZIP (${n} PDF${n > 1 ? 's' : ''})`,
    runningLabel: (done, total) => `${done} / ${total} done…`,
    statusLabel: { loading: 'Fetching…', success: 'Ready', error: 'Failed', pending: 'Queued' },
    accentBtn: 'bg-violet-600 hover:bg-violet-700',
    bar: 'bg-violet-500',
  },
  whatsapp: {
    title: (n) => `Send ${n} Statement${n > 1 ? 's' : ''} via WhatsApp`,
    doneTitle: 'WhatsApp Send Complete',
    doneSummary: (ok, total) => `${ok} sent · ${total - ok} failed`,
    btnLabel: (n) => `Send ${n} via WhatsApp`,
    runningLabel: (done, total) => `${done} / ${total} done…`,
    statusLabel: { loading: 'Sending…', success: 'Sent', error: 'Failed', pending: 'Queued' },
    accentBtn: 'bg-green-600 hover:bg-green-700',
    bar: 'bg-green-500',
  },
};

const BulkBookingModal = ({ bookings, params, periodLabel, adminToken, mode, onClose, onSuccess }) => {
  const cfg = BOOKING_BULK_CFG[mode];
  const [results, setResults] = useState(() =>
    bookings.map((b) => ({ booking: b, status: 'pending' }))
  );
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const blobsRef = useRef([]);

  const run = async () => {
    setRunning(true);
    blobsRef.current = [];

    for (let i = 0; i < bookings.length; i++) {
      setResults((prev) => prev.map((r, idx) => (idx === i ? { ...r, status: 'loading' } : r)));
      try {
        const orig = apiClient.token;
        apiClient.setToken(adminToken);

        if (mode === 'whatsapp') {
          await apiClient.sendClientStatementToWhatsApp(bookings[i].client_profile_id, params);
        } else {
          const blob = await apiClient.downloadClientStatement(bookings[i].client_profile_id, params);
          if (mode === 'download') {
            const safe = bookings[i].client_name.replace(/[^a-zA-Z0-9_-]/g, '_');
            blobsRef.current.push({ blob, filename: `Statement_${safe}.pdf` });
          }
        }

        apiClient.setToken(orig);
        setResults((prev) => prev.map((r, idx) => (idx === i ? { ...r, status: 'success' } : r)));
      } catch (err) {
        setResults((prev) => prev.map((r, idx) => (idx === i ? { ...r, status: 'error', error: err.message } : r)));
      }
    }

    if (mode === 'download' && blobsRef.current.length > 0) {
      const label = (periodLabel || 'Bulk').replace(/[^a-zA-Z0-9_-]/g, '_');
      await triggerZip(blobsRef.current, `Statements_${label}_${new Date().toISOString().slice(0, 10)}.zip`);
    }

    setRunning(false);
    setDone(true);
  };

  const successCount = results.filter((r) => r.status === 'success').length;
  const doneCount = results.filter((r) => ['success', 'error'].includes(r.status)).length;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[85vh] flex flex-col">
        <div className="p-6 border-b border-slate-200 flex items-start justify-between shrink-0">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              {done ? cfg.doneTitle : cfg.title(bookings.length)}
            </h2>
            <p className="text-sm text-slate-500 mt-0.5">
              {done ? cfg.doneSummary(successCount, bookings.length) : `Period: ${periodLabel}`}
            </p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>

        {running && (
          <div className="h-1 bg-slate-100">
            <div className={`h-1 ${cfg.bar} transition-all duration-300`}
              style={{ width: `${(doneCount / bookings.length) * 100}%` }} />
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {results.map((r) => (
            <div key={r.booking.booking_id}
              className={`flex items-center gap-3 p-3 rounded-xl border transition-colors ${
                r.status === 'success' ? 'bg-emerald-50 border-emerald-100' :
                r.status === 'error' ? 'bg-rose-50 border-rose-100' :
                r.status === 'loading' ? 'bg-blue-50 border-blue-200' :
                'bg-slate-50 border-slate-200'}`}
            >
              <div className="shrink-0 w-5 flex justify-center">
                {r.status === 'success' && <CheckCircle className="w-4 h-4 text-emerald-600" />}
                {r.status === 'error' && <XCircle className="w-4 h-4 text-red-500" />}
                {r.status === 'loading' && <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />}
                {r.status === 'pending' && <div className="w-4 h-4 rounded-full border-2 border-slate-300" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-800 truncate">{r.booking.client_name}</p>
                <p className="text-xs text-slate-500 truncate">
                  {r.booking.patient_name}{r.booking.booking_code ? ` · ${r.booking.booking_code}` : ''}
                </p>
              </div>
              <span className={`text-xs font-medium shrink-0 ${
                r.status === 'success' ? 'text-emerald-700' :
                r.status === 'error' ? 'text-rose-600' :
                r.status === 'loading' ? 'text-blue-600' : 'text-slate-400'}`}>
                {cfg.statusLabel[r.status]}
              </span>
            </div>
          ))}
        </div>

        <div className="p-6 border-t border-slate-200 flex items-center justify-between shrink-0 gap-3">
          {done ? (
            <>
              <span className="text-sm text-slate-500">{cfg.doneSummary(successCount, bookings.length)}</span>
              <button onClick={() => { onSuccess(); onClose(); }}
                className={`${cfg.accentBtn} text-white rounded-xl px-6 py-2.5 text-sm font-bold transition-colors`}>
                Done
              </button>
            </>
          ) : (
            <>
              <button onClick={onClose} disabled={running}
                className="px-5 py-2.5 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50">
                Cancel
              </button>
              <button onClick={run} disabled={running}
                className={`${cfg.accentBtn} text-white rounded-xl px-6 py-2.5 text-sm font-bold transition-colors disabled:opacity-60 flex items-center gap-2`}>
                {running && <Loader2 className="w-4 h-4 animate-spin" />}
                {running ? cfg.runningLabel(doneCount, bookings.length) : cfg.btnLabel(bookings.length)}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

// ─── History bulk action modal ────────────────────────────────────────────────

const HISTORY_BULK_CFG = {
  download: {
    title: (n) => `Download ${n} Statement${n > 1 ? 's' : ''} as ZIP`,
    doneTitle: 'ZIP Download Ready',
    doneSummary: (ok, total) => `${ok} downloaded · ${total - ok} failed`,
    btnLabel: (n) => `Download ZIP (${n} PDF${n > 1 ? 's' : ''})`,
    runningLabel: (done, total) => `${done} / ${total} done…`,
    statusLabel: { loading: 'Fetching…', success: 'Ready', error: 'Failed', pending: 'Queued' },
    accentBtn: 'bg-violet-600 hover:bg-violet-700',
    bar: 'bg-violet-500',
  },
  whatsapp: {
    title: (n) => `Resend ${n} Statement${n > 1 ? 's' : ''} via WhatsApp`,
    doneTitle: 'WhatsApp Resend Complete',
    doneSummary: (ok, total) => `${ok} sent · ${total - ok} failed`,
    btnLabel: (n) => `Resend ${n} via WhatsApp`,
    runningLabel: (done, total) => `${done} / ${total} done…`,
    statusLabel: { loading: 'Sending…', success: 'Sent', error: 'Failed', pending: 'Queued' },
    accentBtn: 'bg-green-600 hover:bg-green-700',
    bar: 'bg-green-500',
  },
};

const BulkHistoryModal = ({ statements, adminToken, mode, onClose, onSuccess }) => {
  const cfg = HISTORY_BULK_CFG[mode];
  const [results, setResults] = useState(() =>
    statements.map((s) => ({ statement: s, status: 'pending' }))
  );
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const blobsRef = useRef([]);

  const run = async () => {
    setRunning(true);
    blobsRef.current = [];

    for (let i = 0; i < statements.length; i++) {
      const s = statements[i];
      setResults((prev) => prev.map((r, idx) => (idx === i ? { ...r, status: 'loading' } : r)));
      try {
        if (mode === 'whatsapp') {
          const orig = apiClient.token;
          apiClient.setToken(adminToken);
          await apiClient.resendStatementWhatsApp(s.statement_id);
          apiClient.setToken(orig);
        } else {
          let blob;
          if (s.pdf_url) {
            const res = await fetch(s.pdf_url);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            blob = await res.blob();
          } else {
            // Download-only statements have no stored PDF — regenerate on the fly
            const orig = apiClient.token;
            apiClient.setToken(adminToken);
            blob = await apiClient.downloadClientStatement(s.client_id, {
              start_date: s.period_start,
              end_date: s.period_end,
            });
            apiClient.setToken(orig);
          }
          const safe = (s.client_name || 'Client').replace(/[^a-zA-Z0-9_-]/g, '_');
          blobsRef.current.push({ blob, filename: `${s.statement_code || 'Statement'}_${safe}.pdf` });
        }
        setResults((prev) => prev.map((r, idx) => (idx === i ? { ...r, status: 'success' } : r)));
      } catch (err) {
        setResults((prev) => prev.map((r, idx) => (idx === i ? { ...r, status: 'error', error: err.message } : r)));
      }
    }

    if (mode === 'download' && blobsRef.current.length > 0) {
      await triggerZip(blobsRef.current, `Statements_History_${new Date().toISOString().slice(0, 10)}.zip`);
    }

    setRunning(false);
    setDone(true);
  };

  const successCount = results.filter((r) => r.status === 'success').length;
  const doneCount = results.filter((r) => ['success', 'error'].includes(r.status)).length;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[85vh] flex flex-col">
        <div className="p-6 border-b border-slate-200 flex items-start justify-between shrink-0">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              {done ? cfg.doneTitle : cfg.title(statements.length)}
            </h2>
            <p className="text-sm text-slate-500 mt-0.5">
              {done ? cfg.doneSummary(successCount, statements.length) : `${statements.length} statement${statements.length > 1 ? 's' : ''} selected from history`}
            </p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>

        {running && (
          <div className="h-1 bg-slate-100">
            <div className={`h-1 ${cfg.bar} transition-all duration-300`}
              style={{ width: `${(doneCount / statements.length) * 100}%` }} />
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {results.map((r) => (
            <div key={r.statement.statement_id}
              className={`flex items-center gap-3 p-3 rounded-xl border transition-colors ${
                r.status === 'success' ? 'bg-emerald-50 border-emerald-100' :
                r.status === 'error' ? 'bg-rose-50 border-rose-100' :
                r.status === 'loading' ? 'bg-blue-50 border-blue-200' :
                'bg-slate-50 border-slate-200'}`}
            >
              <div className="shrink-0 w-5 flex justify-center">
                {r.status === 'success' && <CheckCircle className="w-4 h-4 text-emerald-600" />}
                {r.status === 'error' && <XCircle className="w-4 h-4 text-red-500" />}
                {r.status === 'loading' && <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />}
                {r.status === 'pending' && <div className="w-4 h-4 rounded-full border-2 border-slate-300" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-800 truncate">{r.statement.client_name || '—'}</p>
                <p className="text-xs text-slate-500 truncate">
                  {r.statement.statement_code}
                  {r.statement.period_start ? ` · ${fmtDate(r.statement.period_start)} – ${fmtDate(r.statement.period_end)}` : ''}
                </p>
                {r.status === 'error' && r.error && (
                  <p className="text-xs text-rose-500 mt-0.5 truncate">{r.error}</p>
                )}
              </div>
              <span className={`text-xs font-medium shrink-0 ${
                r.status === 'success' ? 'text-emerald-700' :
                r.status === 'error' ? 'text-rose-600' :
                r.status === 'loading' ? 'text-blue-600' : 'text-slate-400'}`}>
                {cfg.statusLabel[r.status]}
              </span>
            </div>
          ))}
        </div>

        <div className="p-6 border-t border-slate-200 flex items-center justify-between shrink-0 gap-3">
          {done ? (
            <>
              <span className="text-sm text-slate-500">{cfg.doneSummary(successCount, statements.length)}</span>
              <button onClick={() => { onSuccess(); onClose(); }}
                className={`${cfg.accentBtn} text-white rounded-xl px-6 py-2.5 text-sm font-bold transition-colors`}>
                Done
              </button>
            </>
          ) : (
            <>
              <button onClick={onClose} disabled={running}
                className="px-5 py-2.5 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50">
                Cancel
              </button>
              <button onClick={run} disabled={running}
                className={`${cfg.accentBtn} text-white rounded-xl px-6 py-2.5 text-sm font-bold transition-colors disabled:opacity-60 flex items-center gap-2`}>
                {running && <Loader2 className="w-4 h-4 animate-spin" />}
                {running ? cfg.runningLabel(doneCount, statements.length) : cfg.btnLabel(statements.length)}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

// ─── Main component ───────────────────────────────────────────────────────────

const Statements = () => {
  const { adminToken } = useAdminAuth();
  const navigate = useNavigate();

  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Date range
  const [globalStartDate, setGlobalStartDate] = useState('');
  const [globalEndDate, setGlobalEndDate] = useState('');
  const [selectedMonth, setSelectedMonth] = useState('');
  const [isAllTime, setIsAllTime] = useState(false);
  const [isFromBookingStart, setIsFromBookingStart] = useState(false);
  const [fromBookingStartEndMonth, setFromBookingStartEndMonth] = useState('');

  // Expand/collapse per booking_id
  const [expandedBookings, setExpandedBookings] = useState(new Set());

  // Cached transactions per client_profile_id
  const [clientTransactions, setClientTransactions] = useState({});

  // Load-more page size per client_profile_id
  const [txVisible, setTxVisible] = useState({});

  // Per-booking action loading: `${booking_id}-download` or `-whatsapp`
  const [actionLoading, setActionLoading] = useState({});

  // History
  const [savedStatements, setSavedStatements] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Search
  const [bookingSearch, setBookingSearch] = useState('');
  const [historySearch, setHistorySearch] = useState('');

  // Status filter
  const [bookingStatusFilter, setBookingStatusFilter] = useState('');

  // Bookings bulk selection + modal
  const [selected, setSelected] = useState(new Set());
  const [bulkAction, setBulkAction] = useState(null); // 'save' | 'download' | 'whatsapp'

  // History bulk selection + modal
  const [selectedHistory, setSelectedHistory] = useState(new Set());
  const [historyBulkAction, setHistoryBulkAction] = useState(null); // 'download' | 'whatsapp'

  const hasActivePeriod =
    isAllTime ||
    (!!globalStartDate && !!globalEndDate) ||
    (isFromBookingStart && !!fromBookingStartEndMonth);

  // Last 24 months, most recent first
  const monthOptions = useMemo(() => {
    const opts = [];
    const now = new Date();
    for (let i = 0; i < 24; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      opts.push({
        value: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
        label: d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }),
      });
    }
    return opts;
  }, []);

  const filteredBookings = useMemo(() => {
    const q = bookingSearch.trim().toLowerCase();
    return bookings.filter((b) => {
      if (bookingStatusFilter && b.status !== bookingStatusFilter) return false;
      if (!q) return true;
      return [b.client_name, b.client_mobile, b.patient_name, b.staff_name, b.staff_mobile, b.booking_code, b.service_type]
        .some((v) => v && String(v).toLowerCase().includes(q));
    });
  }, [bookings, bookingSearch, bookingStatusFilter]);

  const filteredHistory = useMemo(() => {
    const q = historySearch.trim().toLowerCase();
    if (!q) return savedStatements;
    return savedStatements.filter((s) =>
      [s.client_name, s.statement_code, s.period_start, s.period_end, s.delivery_method]
        .some((v) => v && String(v).toLowerCase().includes(q))
    );
  }, [savedStatements, historySearch]);

  // Bookings selection helpers
  const selectedBookings = useMemo(
    () => bookings.filter((b) => selected.has(b.booking_id)),
    [bookings, selected]
  );

  const allChecked =
    filteredBookings.length > 0 && filteredBookings.every((b) => selected.has(b.booking_id));

  const toggleSelect = (bookingId) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(bookingId) ? next.delete(bookingId) : next.add(bookingId);
      return next;
    });
  };

  const toggleAll = () => {
    if (allChecked) {
      setSelected((prev) => {
        const next = new Set(prev);
        filteredBookings.forEach((b) => next.delete(b.booking_id));
        return next;
      });
    } else {
      setSelected((prev) => {
        const next = new Set(prev);
        filteredBookings.forEach((b) => next.add(b.booking_id));
        return next;
      });
    }
  };

  // History selection helpers
  const selectedHistoryItems = useMemo(
    () => savedStatements.filter((s) => selectedHistory.has(s.statement_id)),
    [savedStatements, selectedHistory]
  );

  const allHistoryChecked =
    filteredHistory.length > 0 && filteredHistory.every((s) => selectedHistory.has(s.statement_id));

  const toggleSelectHistory = (statementId) => {
    setSelectedHistory((prev) => {
      const next = new Set(prev);
      next.has(statementId) ? next.delete(statementId) : next.add(statementId);
      return next;
    });
  };

  const toggleAllHistory = () => {
    if (allHistoryChecked) {
      setSelectedHistory((prev) => {
        const next = new Set(prev);
        filteredHistory.forEach((s) => next.delete(s.statement_id));
        return next;
      });
    } else {
      setSelectedHistory((prev) => {
        const next = new Set(prev);
        filteredHistory.forEach((s) => next.add(s.statement_id));
        return next;
      });
    }
  };

  const periodLabel = isAllTime
    ? 'All Time'
    : isFromBookingStart && fromBookingStartEndMonth
    ? `Booking Start – ${monthOptions.find((m) => m.value === fromBookingStartEndMonth)?.label || fromBookingStartEndMonth}`
    : globalStartDate && globalEndDate
    ? `${fmtDate(globalStartDate)} – ${fmtDate(globalEndDate)}`
    : null;

  // Changing the period: clear cache + collapse all so user re-expands for fresh data
  const applyRange = (start, end, month, allTime, fromStart = false, fromStartEndMonth = '') => {
    setGlobalStartDate(start);
    setGlobalEndDate(end);
    setSelectedMonth(month);
    setIsAllTime(allTime);
    setIsFromBookingStart(fromStart);
    setFromBookingStartEndMonth(fromStartEndMonth);
    setSelected(new Set());
    setClientTransactions({});
    setTxVisible({});
    setExpandedBookings(new Set());
  };

  const handleMonthSelect = (monthStr) => {
    if (!monthStr) { applyRange('', '', '', false); return; }
    const [year, month] = monthStr.split('-').map(Number);
    const start = new Date(year, month - 1, 1).toISOString().split('T')[0];
    const end = new Date(year, month, 0).toISOString().split('T')[0];
    applyRange(start, end, monthStr, false);
  };

  const handleAllTime = () => applyRange('', '', '', true);
  const handleClear = () => applyRange('', '', '', false);
  const handleStartChange = (val) => applyRange(val, globalEndDate, '', false);
  const handleEndChange = (val) => applyRange(globalStartDate, val, '', false);

  const handleFromBookingStartMonth = (monthStr) => {
    if (!monthStr) { applyRange('', '', '', false); return; }
    const [year, month] = monthStr.split('-').map(Number);
    const end = new Date(year, month, 0).toISOString().split('T')[0];
    applyRange('', end, '', false, true, monthStr);
  };

  // Fetch transactions for one client (lazy, called on expand)
  const fetchForClient = async (clientId) => {
    if (!clientId) return;
    setClientTransactions((prev) => ({
      ...prev,
      [clientId]: { loading: true, ledger: [], summary: null, error: null },
    }));
    try {
      const orig = apiClient.token;
      apiClient.setToken(adminToken);
      const params = isAllTime ? {} : isFromBookingStart ? { end_date: globalEndDate } : { start_date: globalStartDate, end_date: globalEndDate };
      const res = await apiClient.getClientStatement(clientId, params);
      apiClient.setToken(orig);
      setClientTransactions((prev) => ({
        ...prev,
        [clientId]: {
          loading: false,
          ledger: res.ledger || [],
          summary: res.account_summary || null,
          error: null,
        },
      }));
    } catch (err) {
      setClientTransactions((prev) => ({
        ...prev,
        [clientId]: { loading: false, ledger: [], summary: null, error: err.message },
      }));
    }
  };

  const toggleBooking = (bookingId, clientProfileId) => {
    const isExpanding = !expandedBookings.has(bookingId);
    setExpandedBookings((prev) => {
      const next = new Set(prev);
      if (next.has(bookingId)) next.delete(bookingId);
      else next.add(bookingId);
      return next;
    });
    if (isExpanding && hasActivePeriod && clientProfileId && !clientTransactions[clientProfileId]) {
      fetchForClient(clientProfileId);
    }
  };

  const loadMore = (clientId, total) => {
    setTxVisible((prev) => ({
      ...prev,
      [clientId]: Math.min((prev[clientId] || PAGE_SIZE) + PAGE_SIZE, total),
    }));
  };

  const fetchSavedStatements = async () => {
    setHistoryLoading(true);
    try {
      const orig = apiClient.token;
      apiClient.setToken(adminToken);
      const res = await apiClient.getSavedStatements({ limit: 100 });
      apiClient.setToken(orig);
      setSavedStatements(res.data || []);
    } catch (err) {
      console.error('Error fetching statement history:', err);
    } finally {
      setHistoryLoading(false);
    }
  };

  const fetchBookings = async () => {
    try {
      setLoading(true);
      const orig = apiClient.token;
      apiClient.setToken(adminToken);
      const response = await apiClient.getAllBookings();
      apiClient.setToken(orig);
      let data = [];
      if (Array.isArray(response)) data = response;
      else if (response.status === 'success') data = response.data || [];
      else { setError(response.message || 'Failed to load bookings'); return; }
      setBookings(data);
    } catch (err) {
      setError(err.message || 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (adminToken) {
      fetchBookings();
      fetchSavedStatements();
    }
  }, [adminToken]);

  const handleDownload = async (booking) => {
    if (!hasActivePeriod) { alert('Please select a date range above first.'); return; }
    const key = `${booking.booking_id}-download`;
    setActionLoading((prev) => ({ ...prev, [key]: true }));
    try {
      const orig = apiClient.token;
      apiClient.setToken(adminToken);
      const params = isAllTime ? {} : isFromBookingStart ? { end_date: globalEndDate } : { start_date: globalStartDate, end_date: globalEndDate };
      const response = await apiClient.downloadClientStatement(booking.client_profile_id, params);
      apiClient.setToken(orig);
      const blob = new Blob([response], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Statement_${booking.client_name.replace(/\s+/g, '_')}_${isAllTime ? 'AllTime' : `${globalStartDate}_to_${globalEndDate}`}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      fetchSavedStatements();
    } catch (err) {
      alert('Failed to download statement. Please try again.');
    } finally {
      setActionLoading((prev) => ({ ...prev, [key]: false }));
    }
  };

  const handleHistoryDownload = async (s) => {
    const key = `history-${s.statement_id}`;
    setActionLoading((prev) => ({ ...prev, [key]: true }));
    try {
      const orig = apiClient.token;
      apiClient.setToken(adminToken);
      const response = await apiClient.downloadClientStatement(s.client_id, {
        start_date: s.period_start,
        end_date: s.period_end,
      });
      apiClient.setToken(orig);
      const blob = new Blob([response], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Statement_${(s.client_name || 'Client').replace(/\s+/g, '_')}_${s.statement_code}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      alert('Failed to download statement. Please try again.');
    } finally {
      setActionLoading((prev) => ({ ...prev, [key]: false }));
    }
  };

  const handleHistoryDelete = async (s) => {
    if (!window.confirm(`Delete statement ${s.statement_code} for ${s.client_name}? This cannot be undone.`)) return;
    const key = `history-del-${s.statement_id}`;
    setActionLoading((prev) => ({ ...prev, [key]: true }));
    try {
      const orig = apiClient.token;
      apiClient.setToken(adminToken);
      await apiClient.deleteStatement(s.statement_id);
      apiClient.setToken(orig);
      fetchSavedStatements();
    } catch (err) {
      alert('Failed to delete statement. Please try again.');
    } finally {
      setActionLoading((prev) => ({ ...prev, [key]: false }));
    }
  };

  const handleHistoryWhatsApp = async (s) => {
    const key = `history-wa-${s.statement_id}`;
    setActionLoading((prev) => ({ ...prev, [key]: true }));
    try {
      const orig = apiClient.token;
      apiClient.setToken(adminToken);
      await apiClient.resendStatementWhatsApp(s.statement_id);
      apiClient.setToken(orig);
      alert(`Statement sent to ${s.client_name} via WhatsApp.`);
      fetchSavedStatements();
    } catch (err) {
      alert('Failed to send via WhatsApp. Please try again.');
    } finally {
      setActionLoading((prev) => ({ ...prev, [key]: false }));
    }
  };

  if (loading) {
    return (
      <AdminLayout title="Client Statements" subtitle="Loading bookings...">
        <div className="flex flex-col items-center justify-center h-64">
          <Loader2 className="animate-spin w-10 h-10 text-blue-600 mb-3" />
          <p className="text-slate-500 text-sm">Fetching bookings...</p>
        </div>
      </AdminLayout>
    );
  }

  if (error) {
    return (
      <AdminLayout title="Client Statements" subtitle="Error loading data">
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 flex items-start gap-4">
          <div className="bg-red-100 rounded-full p-2 shrink-0">
            <XCircle className="w-5 h-5 text-red-600" />
          </div>
          <div>
            <h3 className="font-semibold text-red-800 mb-1">Unable to load bookings</h3>
            <p className="text-red-600 text-sm">{error}</p>
            <button
              onClick={fetchBookings}
              className="mt-3 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm font-medium"
            >
              Try Again
            </button>
          </div>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout title="Client Statements" subtitle={`${bookings.length} bookings`} >
      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Total Bookings', value: bookings.length, color: 'blue', Icon: FileText },
          { label: 'Active', value: bookings.filter((b) => b.status === 'ACTIVE').length, color: 'green', Icon: CheckCircle },
          { label: 'Pending Termination', value: bookings.filter((b) => b.status === 'PENDING_TERMINATION').length, color: 'yellow', Icon: Clock },
          { label: 'Terminated', value: bookings.filter((b) => b.status === 'TERMINATED').length, color: 'red', Icon: Activity },
        ].map(({ label, value, color, Icon }) => (
          <div key={label} className="bg-white rounded-xl border border-slate-200 p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500 mb-1">{label}</p>
                <p className={`text-2xl font-bold text-${color}-600`}>{value}</p>
              </div>
              <div className={`bg-${color}-100 rounded-full p-2.5`}>
                <Icon className={`w-5 h-5 text-${color}-600`} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Global date range controls */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <Calendar className="w-4 h-4 text-blue-600" />
          <h3 className="text-sm font-semibold text-slate-800">Statement Period</h3>
          <span className="text-xs text-slate-400">— select a period to preview transactions inside each booking</span>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          {/* Month quick-select */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-600">Quick Select Month</label>
            <select
              value={selectedMonth}
              onChange={(e) => handleMonthSelect(e.target.value)}
              disabled={isAllTime || isFromBookingStart}
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-[170px] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <option value="">-- Select Month --</option>
              {monthOptions.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>

          <span className="text-slate-300 text-xs self-end pb-2">or</span>

          {/* Manual dates */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-600">From</label>
            <input
              type="date"
              value={globalStartDate}
              onChange={(e) => handleStartChange(e.target.value)}
              disabled={isAllTime || isFromBookingStart}
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-40 disabled:cursor-not-allowed"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-600">To</label>
            <input
              type="date"
              value={globalEndDate}
              onChange={(e) => handleEndChange(e.target.value)}
              disabled={isAllTime || isFromBookingStart}
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-40 disabled:cursor-not-allowed"
            />
          </div>

          <span className="text-slate-300 text-xs self-end pb-2">or</span>

          {/* All Time */}
          <button
            onClick={isAllTime ? handleClear : handleAllTime}
            className={`self-end px-4 py-2 rounded-lg text-sm font-medium border transition-colors flex items-center gap-1.5 ${
              isAllTime
                ? 'bg-purple-600 text-white border-purple-600 hover:bg-purple-700'
                : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
            }`}
          >
            <InfinityIcon className="w-3.5 h-3.5" />
            {isAllTime ? 'All Time (active)' : 'All Time'}
          </button>

          <span className="text-slate-300 text-xs self-end pb-2">or</span>

          {/* From Booking Start to end of month */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-600">Booking Start → End of Month</label>
            <select
              value={fromBookingStartEndMonth}
              onChange={(e) => handleFromBookingStartMonth(e.target.value)}
              disabled={isAllTime}
              className={`px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 min-w-[190px] disabled:opacity-40 disabled:cursor-not-allowed ${
                isFromBookingStart
                  ? 'border-indigo-400 ring-2 ring-indigo-200 focus:ring-indigo-400'
                  : 'border-slate-300 focus:ring-blue-500'
              }`}
            >
              <option value="">-- Select End Month --</option>
              {monthOptions.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>

          {/* Clear */}
          {(hasActivePeriod) && !isAllTime && (
            <button
              onClick={handleClear}
              className="self-end px-3 py-2 text-sm text-slate-500 border border-slate-200 rounded-lg hover:bg-slate-50 flex items-center gap-1.5"
            >
              <XCircle className="w-3.5 h-3.5" />
              Clear
            </button>
          )}
        </div>

        {periodLabel && (
          <p className="mt-3 text-xs text-slate-500">
            Active period:{' '}
            <span className="font-semibold text-slate-700">{periodLabel}</span>
            <span className="ml-2 text-slate-400">— click any booking below to expand transactions</span>
          </p>
        )}
        {!hasActivePeriod && (
          <p className="mt-3 text-xs text-slate-400">
            Select a month, enter a custom date range, or choose All Time to enable transaction previews.
          </p>
        )}
      </div>

      {/* Booking Cards */}
      <div className="mb-8">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={toggleAll} className="p-0.5 text-slate-400 hover:text-blue-600 transition-colors">
              {allChecked
                ? <CheckSquare className="w-4 h-4 text-blue-600" />
                : <Square className="w-4 h-4" />}
            </button>
            <h3 className="text-sm font-semibold text-slate-700">
              Booking Statements
              <span className="ml-2 text-xs font-normal text-slate-400">
                {hasActivePeriod
                  ? '— click a row to expand transactions, or check to select'
                  : '— select a period above to enable transaction previews'}
              </span>
            </h3>
          </div>
          <div className="flex items-center gap-2 ml-auto">
            {/* Status filter pills */}
            <div className="flex items-center gap-1">
              {[
                { label: 'All', value: '' },
                { label: 'Active', value: 'ACTIVE' },
                { label: 'Completed', value: 'COMPLETED' },
                { label: 'Terminated', value: 'TERMINATED' },
                { label: 'Pending', value: 'PENDING_TERMINATION' },
              ].map(({ label, value }) => (
                <button
                  key={value}
                  onClick={() => setBookingStatusFilter(value)}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                    bookingStatusFilter === value
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {label}
                  <span className="ml-1 opacity-70">
                    ({value === '' ? bookings.length : bookings.filter((b) => b.status === value).length})
                  </span>
                </button>
              ))}
            </div>
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
              <input
                type="text"
                value={bookingSearch}
                onChange={(e) => setBookingSearch(e.target.value)}
                placeholder="Search bookings…"
                className="pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 w-44"
              />
            </div>
          </div>
        </div>

        {/* Bookings selection action bar */}
        {selected.size > 0 && (
          <div className={`flex items-center justify-between gap-3 mb-3 px-4 py-2.5 rounded-xl border ${
            hasActivePeriod ? 'bg-blue-50 border-blue-200' : 'bg-amber-50 border-amber-200'
          }`}>
            <div className="flex items-center gap-2">
              <span className={`text-sm font-semibold ${hasActivePeriod ? 'text-blue-800' : 'text-amber-800'}`}>
                {selected.size} booking{selected.size > 1 ? 's' : ''} selected
              </span>
              <button
                onClick={() => setSelected(new Set())}
                className="text-xs text-slate-400 hover:text-slate-600 underline"
              >
                Clear
              </button>
            </div>
            {!hasActivePeriod ? (
              <span className="text-xs text-amber-700">Select a date period above to generate statements</span>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setBulkAction('save')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs font-bold rounded-lg hover:bg-blue-700 transition-colors"
                >
                  <FileText className="w-3.5 h-3.5" />
                  Generate {selected.size}
                </button>
                <button
                  onClick={() => setBulkAction('download')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 text-white text-xs font-bold rounded-lg hover:bg-violet-700 transition-colors"
                >
                  <Archive className="w-3.5 h-3.5" />
                  ZIP
                </button>
                <button
                  onClick={() => setBulkAction('whatsapp')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white text-xs font-bold rounded-lg hover:bg-green-700 transition-colors"
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  WhatsApp
                </button>
              </div>
            )}
          </div>
        )}

        <div className="rounded-xl border border-slate-200 overflow-hidden bg-white divide-y divide-slate-100">
          {filteredBookings.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 gap-2">
              <FileText className="w-8 h-8 text-slate-200" />
              <p className="text-sm text-slate-400">{bookingSearch ? 'No bookings match your search' : 'No bookings found'}</p>
            </div>
          ) : (
            filteredBookings.map((booking) => {
              const isExpanded = expandedBookings.has(booking.booking_id);
              const txData = clientTransactions[booking.client_profile_id];
              const dlKey = `${booking.booking_id}-download`;
              const ServiceIcon = getServiceIcon(booking.service_type);
              const visibleCount = txVisible[booking.client_profile_id] || PAGE_SIZE;
              const ledger = txData?.ledger || [];
              const shownLedger = ledger.slice(0, visibleCount);
              const hasMore = visibleCount < ledger.length;
              const remaining = ledger.length - visibleCount;

              return (
                <div key={booking.booking_id}>
                  {/* Booking header row — clickable to expand */}
                  <div
                    onClick={() => toggleBooking(booking.booking_id, booking.client_profile_id)}
                    className={`px-5 py-4 flex items-start gap-4 cursor-pointer hover:bg-slate-50 transition-colors ${
                      selected.has(booking.booking_id) ? 'bg-blue-50/40' : ''
                    }`}
                  >
                    {/* Checkbox */}
                    <div
                      className="pt-0.5 shrink-0"
                      onClick={(e) => { e.stopPropagation(); toggleSelect(booking.booking_id); }}
                    >
                      {selected.has(booking.booking_id)
                        ? <CheckSquare className="w-4 h-4 text-blue-600" />
                        : <Square className="w-4 h-4 text-slate-300 hover:text-slate-500 transition-colors" />}
                    </div>
                    {/* Chevron */}
                    <div className="pt-0.5 text-slate-400 shrink-0">
                      {hasActivePeriod ? (
                        isExpanded ? (
                          <ChevronDown className="w-4 h-4 text-blue-500" />
                        ) : (
                          <ChevronRight className="w-4 h-4" />
                        )
                      ) : (
                        <ChevronRight className="w-4 h-4 opacity-30" />
                      )}
                    </div>

                    {/* Booking info grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-x-6 gap-y-2 flex-1 min-w-0">
                      <div>
                        <p className="text-xs text-slate-400 mb-0.5">Client</p>
                        <p className="text-sm font-semibold text-slate-900 truncate">{booking.client_name}</p>
                        <p className="text-xs text-slate-500 truncate">{booking.client_mobile}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-400 mb-0.5">Care Profile</p>
                        <p className="text-sm font-medium text-slate-900 truncate">{booking.patient_name}</p>
                        <p className="text-xs text-slate-500">Age {booking.patient_age}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-400 mb-0.5">Service</p>
                        <div className="flex items-center gap-1">
                          <ServiceIcon className="w-3 h-3 text-slate-400 shrink-0" />
                          <p className="text-sm font-medium text-slate-900 truncate">{booking.service_type}</p>
                        </div>
                        <p className="text-xs text-slate-500 truncate">{booking.service_model}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-400 mb-0.5">Staff</p>
                        {booking.staff_name ? (
                          <>
                            <p className="text-sm font-medium text-slate-900 truncate">{booking.staff_name}</p>
                            <p className="text-xs text-slate-500 truncate">{booking.staff_mobile}</p>
                          </>
                        ) : (
                          <p className="text-xs text-slate-400 italic">Not assigned</p>
                        )}
                      </div>
                      <div>
                        <p className="text-xs text-slate-400 mb-0.5">Start Date</p>
                        <p className="text-sm text-slate-900">{fmtDate(booking.start_date)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-400 mb-0.5">Status</p>
                        {getStatusBadge(booking.status)}
                        {/* Show summary hint when collapsed but data is cached */}
                        {!isExpanded && txData && !txData.loading && txData.summary && (
                          <p className="text-xs text-slate-400 mt-1">
                            {ledger.length} txn
                            {txData.summary.balance_due != null && (
                              <> · Bal: <span className={Number(txData.summary.balance_due) < 0 ? 'text-rose-500' : 'text-emerald-600'}>
                                LKR {fmt(txData.summary.balance_due)}
                              </span></>
                            )}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Action buttons — stop propagation so they don't toggle */}
                    <div
                      className="flex flex-col gap-1.5 shrink-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        onClick={() => navigate(`/admin/bookings/${booking.booking_id}/detail`)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-slate-100 text-slate-700 text-xs font-medium rounded-lg hover:bg-slate-200 transition-colors"
                      >
                        <Eye className="w-3 h-3" />
                        View
                      </button>
                      <button
                        onClick={() => handleDownload(booking)}
                        disabled={actionLoading[dlKey]}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-60"
                      >
                        {actionLoading[dlKey] ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
                        {actionLoading[dlKey] ? 'PDF...' : 'PDF'}
                      </button>
                    </div>
                  </div>

                  {/* Transactions panel — only when expanded */}
                  {isExpanded && (
                    <div className="border-t border-slate-100 bg-slate-50">
                      {/* Panel header with summary */}
                      <div className="px-5 py-3 flex items-center justify-between border-b border-slate-100">
                        <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                          Transactions · {periodLabel}
                        </span>
                        {txData?.summary && !txData.loading && (
                          <div className="flex items-center gap-4 text-xs">
                            <span className="text-slate-500">
                              Opening: <span className="font-medium text-slate-700">LKR {fmt(txData.summary.opening_balance)}</span>
                            </span>
                            <span className="text-rose-600 font-medium">
                              Invoiced: LKR {fmt(txData.summary.invoiced_amount)}
                            </span>
                            <span className="text-emerald-600 font-medium">
                              Paid: LKR {fmt(txData.summary.amount_paid)}
                            </span>
                            <span className={`font-bold ${Number(txData.summary.balance_due) < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                              Balance: LKR {fmt(txData.summary.balance_due)}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Content */}
                      {!txData || txData.loading ? (
                        <div className="flex items-center justify-center gap-2 py-8">
                          <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                          <span className="text-xs text-slate-400">Loading transactions...</span>
                        </div>
                      ) : txData.error ? (
                        <div className="px-5 py-4 flex items-center gap-3">
                          <XCircle className="w-4 h-4 text-red-400 shrink-0" />
                          <span className="text-xs text-red-500">Failed to load: {txData.error}</span>
                          <button
                            onClick={() => fetchForClient(booking.client_profile_id)}
                            className="text-xs text-blue-500 hover:underline ml-auto"
                          >
                            Retry
                          </button>
                        </div>
                      ) : ledger.length === 0 ? (
                        <div className="px-5 py-8 text-center">
                          <FileText className="w-6 h-6 text-slate-200 mx-auto mb-2" />
                          <p className="text-xs text-slate-400">No transactions in this period</p>
                        </div>
                      ) : (
                        <>
                          <div className="overflow-x-auto">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="bg-slate-100 text-slate-500 font-semibold uppercase tracking-wide">
                                  <th className="px-5 py-2 text-left">Date</th>
                                  <th className="px-5 py-2 text-left">Category</th>
                                  <th className="px-5 py-2 text-left">Details</th>
                                  <th className="px-5 py-2 text-right">Invoice (LKR)</th>
                                  <th className="px-5 py-2 text-right">Payment (LKR)</th>
                                  <th className="px-5 py-2 text-right">Balance (LKR)</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {shownLedger.map((tx) => (
                                  <tr
                                    key={tx.transaction_id}
                                    className={
                                      tx.row_type === 'INVOICE'
                                        ? 'hover:bg-rose-50/60'
                                        : 'hover:bg-emerald-50/60'
                                    }
                                  >
                                    <td className="px-5 py-2 text-slate-600 whitespace-nowrap">{fmtDate(tx.date)}</td>
                                    <td className="px-5 py-2 text-slate-600">{tx.transactions || '—'}</td>
                                    <td className="px-5 py-2 text-slate-500 max-w-[180px] truncate" title={tx.details}>
                                      {tx.details || '—'}
                                    </td>
                                    <td className="px-5 py-2 text-right font-medium text-rose-600">
                                      {tx.amount_invoiced ? fmt(tx.amount_invoiced) : '—'}
                                    </td>
                                    <td className="px-5 py-2 text-right font-medium text-emerald-600">
                                      {tx.amount_paid ? fmt(tx.amount_paid) : '—'}
                                    </td>
                                    <td className="px-5 py-2 text-right font-semibold text-slate-800">
                                      {fmt(tx.balance)}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>

                          {/* Load more */}
                          {hasMore && (
                            <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-between">
                              <span className="text-xs text-slate-400">
                                Showing {shownLedger.length} of {ledger.length} transactions
                              </span>
                              <button
                                onClick={() => loadMore(booking.client_profile_id, ledger.length)}
                                className="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
                              >
                                Load {Math.min(PAGE_SIZE, remaining)} more
                                <ChevronDown className="w-3 h-3" />
                              </button>
                            </div>
                          )}
                          {!hasMore && ledger.length > PAGE_SIZE && (
                            <div className="px-5 py-2 border-t border-slate-100">
                              <span className="text-xs text-slate-400">All {ledger.length} transactions shown</span>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Statement History */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {/* History header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={toggleAllHistory} className="p-0.5 text-slate-400 hover:text-blue-600 transition-colors">
              {allHistoryChecked
                ? <CheckSquare className="w-4 h-4 text-blue-600" />
                : <Square className="w-4 h-4" />}
            </button>
            <div>
              <h3 className="text-base font-semibold text-slate-800">Statement History</h3>
              <p className="text-xs text-slate-400 mt-0.5">All statements generated through the system</p>
            </div>
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
              <input
                type="text"
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
                placeholder="Search statements…"
                className="pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 w-52"
              />
            </div>
            <button
              onClick={fetchSavedStatements}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 shrink-0"
            >
              <Activity className="w-3.5 h-3.5" />
              Refresh
            </button>
          </div>
        </div>

        {/* History selection action bar */}
        {selectedHistory.size > 0 && (
          <div className="flex items-center justify-between gap-3 px-6 py-2.5 bg-blue-50 border-b border-blue-100">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-blue-800">
                {selectedHistory.size} statement{selectedHistory.size > 1 ? 's' : ''} selected
              </span>
              <button
                onClick={() => setSelectedHistory(new Set())}
                className="text-xs text-slate-400 hover:text-slate-600 underline"
              >
                Clear
              </button>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setHistoryBulkAction('download')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 text-white text-xs font-bold rounded-lg hover:bg-violet-700 transition-colors"
              >
                <Archive className="w-3.5 h-3.5" />
                ZIP ({selectedHistory.size})
              </button>
              <button
                onClick={() => setHistoryBulkAction('whatsapp')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white text-xs font-bold rounded-lg hover:bg-green-700 transition-colors"
              >
                <MessageSquare className="w-3.5 h-3.5" />
                WhatsApp ({selectedHistory.size})
              </button>
            </div>
          </div>
        )}

        {historyLoading ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
          </div>
        ) : filteredHistory.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 gap-2">
            <FileText className="w-8 h-8 text-slate-200" />
            <p className="text-xs text-slate-400">{historySearch ? 'No statements match your search' : 'No statements generated yet'}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                  <th className="pl-5 py-3 w-8"></th>
                  {['Code', 'Client', 'Period', 'Summary', 'Delivery', 'Generated', ''].map((h) => (
                    <th key={h} className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredHistory.map((s) => (
                  <tr key={s.statement_id} className={`hover:bg-slate-50 ${selectedHistory.has(s.statement_id) ? 'bg-blue-50/40' : ''}`}>
                    <td className="pl-5 py-3 w-8">
                      <button
                        onClick={() => toggleSelectHistory(s.statement_id)}
                        className="text-slate-300 hover:text-blue-600 transition-colors"
                      >
                        {selectedHistory.has(s.statement_id)
                          ? <CheckSquare className="w-4 h-4 text-blue-600" />
                          : <Square className="w-4 h-4" />}
                      </button>
                    </td>
                    <td className="px-5 py-3">
                      <span className="font-mono text-sm font-semibold text-slate-800">{s.statement_code}</span>
                    </td>
                    <td className="px-5 py-3 text-sm font-medium text-slate-900">{s.client_name || '—'}</td>
                    <td className="px-5 py-3 text-xs text-slate-600 whitespace-nowrap">
                      {fmtDate(s.period_start)} – {fmtDate(s.period_end)}
                    </td>
                    <td className="px-5 py-3 text-xs whitespace-nowrap">
                      <span className="text-emerald-600 font-medium">Paid: LKR {Number(s.total_paid).toLocaleString()}</span>
                      <span className="mx-1 text-slate-300">·</span>
                      <span className={Number(s.balance_due) < 0 ? 'text-rose-600 font-medium' : 'text-slate-500'}>
                        Bal: LKR {Number(s.balance_due).toLocaleString()}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${
                        s.delivery_method === 'WHATSAPP' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'
                      }`}>
                        {s.delivery_method === 'WHATSAPP'
                          ? <MessageSquare className="w-3 h-3" />
                          : <Download className="w-3 h-3" />}
                        {s.delivery_method === 'WHATSAPP' ? 'WhatsApp' : 'Download'}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-xs text-slate-500 whitespace-nowrap">
                      {new Date(s.created_at).toLocaleDateString('en-GB', {
                        day: 'numeric', month: 'short', year: 'numeric',
                        hour: '2-digit', minute: '2-digit',
                      })}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center justify-end gap-1.5">
                        {s.pdf_url && (
                          <a
                            href={s.pdf_url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50"
                          >
                            <Eye className="w-3 h-3" />
                            View
                          </a>
                        )}
                        <button
                          onClick={() => handleHistoryDownload(s)}
                          disabled={actionLoading[`history-${s.statement_id}`]}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 disabled:opacity-60"
                        >
                          {actionLoading[`history-${s.statement_id}`]
                            ? <Loader2 className="w-3 h-3 animate-spin" />
                            : <Download className="w-3 h-3" />}
                          {actionLoading[`history-${s.statement_id}`] ? 'PDF...' : 'Download'}
                        </button>
                        <button
                          onClick={() => handleHistoryWhatsApp(s)}
                          disabled={actionLoading[`history-wa-${s.statement_id}`]}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-green-700 border border-green-200 rounded-lg hover:bg-green-50 disabled:opacity-60"
                        >
                          {actionLoading[`history-wa-${s.statement_id}`]
                            ? <Loader2 className="w-3 h-3 animate-spin" />
                            : <MessageSquare className="w-3 h-3" />}
                          {actionLoading[`history-wa-${s.statement_id}`] ? 'Sending...' : 'WA'}
                        </button>
                        <button
                          onClick={() => handleHistoryDelete(s)}
                          disabled={actionLoading[`history-del-${s.statement_id}`]}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 disabled:opacity-60"
                        >
                          {actionLoading[`history-del-${s.statement_id}`]
                            ? <Loader2 className="w-3 h-3 animate-spin" />
                            : <Trash2 className="w-3 h-3" />}
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

      {/* Bookings bulk action modal */}
      {bulkAction && (
        <BulkBookingModal
          mode={bulkAction}
          bookings={selectedBookings}
          params={
            isAllTime ? {} :
            isFromBookingStart ? { end_date: globalEndDate } :
            { start_date: globalStartDate, end_date: globalEndDate }
          }
          periodLabel={periodLabel}
          adminToken={adminToken}
          onClose={() => setBulkAction(null)}
          onSuccess={() => {
            setSelected(new Set());
            fetchSavedStatements();
          }}
        />
      )}

      {/* History bulk action modal */}
      {historyBulkAction && (
        <BulkHistoryModal
          mode={historyBulkAction}
          statements={selectedHistoryItems}
          adminToken={adminToken}
          onClose={() => setHistoryBulkAction(null)}
          onSuccess={() => {
            setSelectedHistory(new Set());
            fetchSavedStatements();
          }}
        />
      )}
    </AdminLayout>
  );
};

export default Statements;
