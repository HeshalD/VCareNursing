import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, ArrowLeft, CheckCircle, Download, DollarSign,
  Loader2, MessageCircle, Phone, RefreshCw, Repeat2, Search, SendHorizontal, ShieldCheck,
  Upload, User, UserPlus, Users, Wallet, X, XCircle, Briefcase, History,
} from 'lucide-react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import AdminLayout from '../components/AdminLayout';
import apiClient from '../../../api/api';
import { useAdminAuth } from '../../../context/AdminAuthContext';
import CareTimeline from './CareTimeline';
import StaffScheduleTimeline from '../components/StaffScheduleTimeline';
import vcareLogo from '../../../assets/Logo/VCareLogo.png';

// ─── helpers ────────────────────────────────────────────────────────────────

const initialPaymentForm = {
  amount_received: '', payment_method: 'BANK_TRANSFER', bank_account_id: '',
  cheque_number: '', cheque_date: '', reference_number: '', notes: '',
};

const moneyFmt = new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR', maximumFractionDigits: 2 });
const formatMoney  = (v) => moneyFmt.format(Number(v || 0));
const formatDate   = (v) => { if (!v) return '-'; const d = new Date(v); return isNaN(d) ? '-' : d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }); };
const formatDT     = (v) => { if (!v) return '-'; const d = new Date(v); return isNaN(d) ? '-' : d.toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }); };
// Masked DD/MM/YYYY text input helpers — mirrors the pattern used elsewhere in the admin panel
// (e.g. proxy_user_management.jsx) so typed dates render in local format while staying
// convertible to the ISO (YYYY-MM-DD) strings the backend and native <input type="date"> expect.
const maskDateInput = (raw) => {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
};
const formatDateForBackend = (value) => {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value || '');
  if (!m) return '';
  const [, day, month, year] = m;
  return `${year}-${month}-${day}`;
};
const formatDateForDisplay = (value) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value || '');
  if (!m) return '';
  const [, year, month, day] = m;
  return `${day}/${month}/${year}`;
};
const formatTime   = (t) => { if (!t) return '-'; const m = String(t).match(/^(\d{1,2}):(\d{2})/); if (!m) return '-'; let h = parseInt(m[1], 10); const p = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12; return `${h}:${m[2]} ${p}`; };
const toDTLocal    = (value = new Date()) => { const d = value instanceof Date ? value : new Date(value); if (isNaN(d)) return ''; return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };
const toDateInput  = (value = new Date()) => { const d = value instanceof Date ? value : new Date(value); return isNaN(d) ? '' : d.toISOString().slice(0, 10); };
const addDays      = (date, n) => { const d = new Date(date); d.setDate(d.getDate() + n); return d; };
// 'HH:MM'(:SS) + hours (may be fractional, e.g. shift duration_hours) -> 'HH:MM', wrapping past midnight.
const addHoursToTime = (timeStr, hours) => {
  if (!timeStr) return '';
  const [h, m] = timeStr.split(':').map(Number);
  const totalMins = (h * 60 + m + Math.round((hours || 0) * 60)) % 1440;
  return `${String(Math.floor(totalMins / 60)).padStart(2, '0')}:${String(totalMins % 60).padStart(2, '0')}`;
};
const initials     = (name) => (name || '?').trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();

// Matches Tailwind's `sm` breakpoint (640px). Mobile = below it.
const useIsMobile = (query = '(max-width: 639px)') => {
  const [match, setMatch] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(query).matches
  );
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mql = window.matchMedia(query);
    const onChange = (e) => setMatch(e.matches);
    mql.addEventListener?.('change', onChange);
    return () => mql.removeEventListener?.('change', onChange);
  }, [query]);
  return match;
};

// On mobile the stat cards are only ~120px wide, so long currency strings
// (e.g. "LKR 12,345,678.00") overflow at the base 25px size. Scale the font
// down as the rendered string gets longer. Desktop keeps the full 25px.
const bigStatSize = (text, isMobile) => {
  if (!isMobile) return 25;
  const len = String(text ?? '').length;
  if (len <= 10) return 21;
  if (len <= 12) return 18;
  if (len <= 14) return 16;
  if (len <= 16) return 14;
  if (len <= 18) return 12.5;
  return 11;
};

const NURSE_PALETTE = [
  { tint: '#FAEEE7', solid: '#C2603F', border: '#E6C8B9' },
  { tint: '#F2EAF5', solid: '#8C5AA6', border: '#DCC8E3' },
  { tint: '#E8F1F9', solid: '#3F77B5', border: '#C3D8EC' },
  { tint: '#E4F1ED', solid: '#137A6B', border: '#A8D4CC' },
  { tint: '#FBF3E3', solid: '#B07D2A', border: '#E0CDA0' },
];

const STATUS_META = {
  active:              { bg: '#f0fdf4', col: '#166534', dot: '#22c55e' },
  completed:           { bg: '#f8fafc', col: '#475569', dot: '#94a3b8' },
  cancelled:           { bg: '#fef2f2', col: '#991b1b', dot: '#ef4444' },
  terminated:          { bg: '#fef2f2', col: '#991b1b', dot: '#ef4444' },
  pending_termination: { bg: '#fffbeb', col: '#92400e', dot: '#f59e0b' },
  pending:             { bg: '#f8fafc', col: '#64748b', dot: '#94a3b8' },
};

// ─── small atoms ────────────────────────────────────────────────────────────

const Label = ({ children }) => (
  <div style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: '#9ca3af', marginBottom: 3 }}>{children}</div>
);
const Value = ({ children, mono }) => (
  <div style={{ fontSize: 13.5, fontWeight: 600, color: '#111827', fontFamily: mono ? "'JetBrains Mono',monospace" : 'inherit' }}>{children ?? '-'}</div>
);
const Field = ({ label, value, mono }) => <div><Label>{label}</Label><Value mono={mono}>{value}</Value></div>;

const Card = ({ children, style }) => (
  <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '18px 20px', ...style }}>{children}</div>
);
const CardTitle = ({ children }) => (
  <h3 style={{ margin: '0 0 14px', fontSize: 14, fontWeight: 700, color: '#111827' }}>{children}</h3>
);
const Empty = ({ icon: Icon, text }) => (
  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '32px 16px', textAlign: 'center', border: '1px dashed #e5e7eb', borderRadius: 8, background: '#f9fafb' }}>
    <Icon style={{ width: 20, height: 20, color: '#d1d5db' }} />
    <p style={{ marginTop: 10, fontSize: 13, color: '#9ca3af' }}>{text}</p>
  </div>
);
const Pill = ({ children, tone = 'slate' }) => {
  const map = { slate: { bg: '#f3f4f6', col: '#374151' }, green: { bg: '#f0fdf4', col: '#166534' }, amber: { bg: '#fffbeb', col: '#92400e' }, rose: { bg: '#fef2f2', col: '#991b1b' }, violet: { bg: '#f3f4f6', col: '#374151' } };
  const c = map[tone] || map.slate;
  return <span style={{ display: 'inline-block', fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 6, background: c.bg, color: c.col }}>{children}</span>;
};

// ─── main component ──────────────────────────────────────────────────────────

const BookingDetailPageV2 = () => {
  const { adminToken } = useAdminAuth();
  const navigate = useNavigate();
  const { bookingId } = useParams();
  const [searchParams] = useSearchParams();
  const isMobile = useIsMobile();

  // data
  const [detail, setDetail]           = useState(null);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState('');
  const [actionLoading, setActionLoading] = useState('');
  const [statementLoading, setStatementLoading] = useState(false);
  const [simDate, setSimDate]         = useState(null);
  const [bankAccounts, setBankAccounts]   = useState([]);
  const [availableStaff, setAvailableStaff] = useState([]);

  // nav
  const [activeSection, setActiveSection] = useState(searchParams.get('section') || 'overview');

  // payment form
  const [paymentForm, setPaymentForm]         = useState(initialPaymentForm);
  const [paymentSlipFile, setPaymentSlipFile] = useState(null);
  const [paymentSubmitting, setPaymentSubmitting] = useState(false);

  // payment receipts (keyed by booking_payment_id)
  const [receipts, setReceipts]               = useState([]);
  const [receiptBusy, setReceiptBusy]         = useState('');
  const [showReceiptSendPopup, setShowReceiptSendPopup] = useState(false);
  const [receiptSendBusy, setReceiptSendBusy] = useState(false);

  // wallet payoff
  const [walletPayoffAmount, setWalletPayoffAmount]       = useState('');
  const [walletPayoffNotes, setWalletPayoffNotes]         = useState('');
  const [walletPayoffSubmitting, setWalletPayoffSubmitting] = useState(false);
  const [walletPayoffError, setWalletPayoffError]         = useState('');

  // swap modal
  const [showSwapModal, setShowSwapModal]             = useState(false);
  const [swapModalStep, setSwapModalStep]             = useState(1);
  const [swapModalSearch, setSwapModalSearch]         = useState('');
  const [swapModalSelectedStaff, setSwapModalSelectedStaff] = useState(null);
  const [swapModalReason, setSwapModalReason]         = useState('');
  const [swapModalStartDate, setSwapModalStartDate]   = useState(toDateInput(new Date()));
  const [swapModalSubmitting, setSwapModalSubmitting] = useState(false);
  const [swapModalError, setSwapModalError]           = useState('');
  const [swapModalPage, setSwapModalPage]             = useState(1);
  const [swapModalDesignation, setSwapModalDesignation] = useState('');
  const [swapModalSlotId, setSwapModalSlotId]         = useState(null); // set => modal targets a shift slot, not the whole booking
  const [swapModalIsAssign, setSwapModalIsAssign]     = useState(false); // true => slot has no current staff (assign, not reassign)

  // scheduled actions for this booking (terminations, completions, swaps, etc.)
  const [bookingScheduledActions, setBookingScheduledActions] = useState([]);

  // shift patterns + per-shift assignment (SHIFT_BASED only)
  const [shiftPattern, setShiftPattern]               = useState(null); // { active, scheduled }
  const [shiftSlots, setShiftSlots]                   = useState([]);
  const [patternHistory, setPatternHistory]           = useState([]);
  const [showPatternModal, setShowPatternModal]       = useState(false);
  const [patternModalShiftCount, setPatternModalShiftCount] = useState(2);
  const [patternModalSlots, setPatternModalSlots]     = useState([]); // [{shift_number, start_time, duration_hours, label}]
  const [patternModalEffectiveDate, setPatternModalEffectiveDate] = useState(toDateInput(new Date()));
  const [patternModalSubmitting, setPatternModalSubmitting] = useState(false);
  const [patternModalError, setPatternModalError]     = useState('');
  const [showPatternHistory, setShowPatternHistory]   = useState(false);

  // salesperson
  const [salesData, setSalesData]                 = useState(null); // { current, origin, history }
  const [salespersonsList, setSalespersonsList]   = useState([]);
  const [salesActionId, setSalesActionId]         = useState('');
  const [salesActionReason, setSalesActionReason] = useState('');
  const [salesActionBusy, setSalesActionBusy]     = useState(false);
  const [salesActionError, setSalesActionError]   = useState('');

  // settlement / actions
  const [actualEndTime, setActualEndTime]   = useState(toDTLocal(new Date()));
  const [reason, setReason]                 = useState('');
  const [settlementAction, setSettlementAction] = useState('WALLET_DEPOSIT');
  const [settlementNote, setSettlementNote] = useState('');

  // actions modal
  const [showActionsModal, setShowActionsModal]     = useState(false);
  const [actionsModalStep, setActionsModalStep]     = useState(1);
  const [actionsModalMode, setActionsModalMode]     = useState(null);
  const [actionsModalLoading, setActionsModalLoading] = useState(false);
  const [actionsModalError, setActionsModalError]   = useState('');

  // termination request approve/reject modal — { mode: 'approve'|'reject', request } | null
  const [termModal, setTermModal]                 = useState(null);
  const [termFinalEndDate, setTermFinalEndDate]   = useState('');
  const [termSettlementAction, setTermSettlementAction] = useState('WALLET_DEPOSIT');
  const [termSettlementNote, setTermSettlementNote] = useState('');
  const [termRejectReason, setTermRejectReason]   = useState('');
  const [termModalLoading, setTermModalLoading]   = useState(false);
  const [termModalError, setTermModalError]       = useState('');

  // statement
  const [statementStartDate, setStatementStartDate] = useState(toDateInput(addDays(new Date(), -30)));
  const [statementEndDate, setStatementEndDate]     = useState(toDateInput(new Date()));
  const [statementPreview, setStatementPreview]     = useState(null);
  const [statementPreviewLoading, setStatementPreviewLoading] = useState(false);

  // daily attendance / manual invoicing
  const [attendanceRecords, setAttendanceRecords]   = useState([]);
  const [dailyInvoiceRecords, setDailyInvoiceRecords] = useState([]);
  const [dayModal, setDayModal]                     = useState(null); // { dateISO, dayNum }
  const [dayModalError, setDayModalError]           = useState('');
  const [dayModalBusy, setDayModalBusy]              = useState('');
  const [attendanceInputs, setAttendanceInputs]      = useState({}); // assignment_id -> { in_time, out_time }
  const [invoiceAmountInput, setInvoiceAmountInput]  = useState('');
  const [invoiceAmountInputsBySlot, setInvoiceAmountInputsBySlot] = useState({}); // shift_slot_id -> amount string
  const [salaryAmountInputs, setSalaryAmountInputs] = useState({}); // attendance_id -> amount string
  const [invoicingModeSaving, setInvoicingModeSaving] = useState(false);

  // ── derived ──────────────────────────────────────────────────────────────

  const bookingSummary  = detail?.booking_summary        || {};
  const clientDetails   = detail?.client_details         || {};
  const patientDetails  = detail?.patient_details        || {};
  const currentStaff    = detail?.current_staff          || {};
  const paymentSummary  = detail?.payment_summary        || {};
  const invoiceSummary  = detail?.invoice_summary        || {};
  const paymentHistory  = Array.isArray(detail?.payment_history)         ? detail.payment_history         : [];
  const staffHistory    = Array.isArray(detail?.staff_assignment_history) ? detail.staff_assignment_history : [];
  const swapHistory     = Array.isArray(detail?.swap_history)            ? detail.swap_history            : [];
  const terminationReqs = Array.isArray(detail?.termination_requests)    ? detail.termination_requests    : [];
  const isShiftBased    = bookingSummary.service_model === 'SHIFT_BASED';

  const activeStaffRow = staffHistory.find(r => (r.status || '').toLowerCase() === 'active') || staffHistory[0] || null;

  const normCurrentStaff = currentStaff?.staff_name || currentStaff?.full_name || currentStaff?.name
    ? { name: currentStaff.staff_name || currentStaff.full_name || currentStaff.name || '-', id: currentStaff.staff_code || currentStaff.staff_profile_id || '-', mobile: currentStaff.staff_mobile || currentStaff.mobile || '-', email: currentStaff.staff_email || currentStaff.email || '-', designation: currentStaff.designation || currentStaff.staff_designation || '-' }
    : activeStaffRow
      ? { name: activeStaffRow.full_name || activeStaffRow.staff_name || '-', id: activeStaffRow.staff_code || activeStaffRow.staff_profile_id || '-', mobile: activeStaffRow.staff_mobile || activeStaffRow.mobile || '-', email: activeStaffRow.staff_email || activeStaffRow.email || '-', designation: activeStaffRow.designation || '-' }
      : null;

  const normPayments = paymentHistory.map(p => ({
    id: p.payment_id || p.id, date: p.payment_date || p.verified_at || p.created_at,
    amount: p.amount_received ?? p.amount ?? 0, method: p.payment_method || p.method || '-',
    reference: p.reference_number || p.reference || p.receipt_no || '-',
    notes: p.notes || '-', slipUrl: p.slip_url || null,
  }));

  // Map each payment row (booking_payment_id) to its generated receipt, if any.
  const receiptByPayment = useMemo(() => {
    const m = {};
    receipts.forEach(r => { if (r.booking_payment_id) m[r.booking_payment_id] = r; });
    return m;
  }, [receipts]);

  const normStaffHistory = staffHistory.map(r => ({
    id: r.assignment_id || r.id, name: r.full_name || r.staff_name || '-',
    staffId: r.staff_code || r.staff_profile_id || '-', colorKey: r.staff_profile_id || r.id,
    designation: r.designation || '-', currentStatus: r.current_status || r.status || '-',
    startDate: r.service_start_date || r.assigned_at || r.created_at,
    endDate: r.service_end_date || r.ended_at || r.end_date,
    dailyRate: r.daily_rate ?? r.rate ?? 0, amountAllocated: r.amount_allocated ?? 0,
  }));

  const normSwapHistory = swapHistory.map(s => ({
    id: s.swap_id || s.id, oldStaffName: s.old_staff_name || s.from_staff_name || '-',
    newStaffName: s.new_staff_name || s.to_staff_name || '-', swappedAt: s.swapped_at || s.created_at,
    reason: s.swap_reason || s.reason || null, billingGap: Boolean(s.billing_gap),
    swappedByMobile: s.swapped_by_mobile || null,
  }));

  const totalPaid     = Number(paymentSummary.total_paid    ?? 0);
  const totalInvoiced = Number(invoiceSummary.total_invoiced ?? 0);
  const dailyRate     = Number(bookingSummary.quote_daily_rate || bookingSummary.daily_rate || 0);

  // Daily attendance / manual invoicing: LIVE_IN staff salary is always automatic.
  // SHIFT_BASED/VISITING bookings are always manual for both salary and client invoicing.
  // LIVE_IN bookings can opt into manual client invoicing via invoicing_mode.
  const isLiveIn          = bookingSummary.service_model === 'LIVE_IN';
  const invoicingMode     = bookingSummary.invoicing_mode || 'AUTO';
  const manualSalaryDay   = !isLiveIn;
  const manualInvoiceDay  = !isLiveIn || invoicingMode === 'MANUAL';
  const dayClickEnabled   = manualSalaryDay || manualInvoiceDay;
  const overdueAmount = totalPaid > totalInvoiced ? 0 : totalInvoiced - totalPaid;
  const remainingBalance = totalPaid - totalInvoiced;
  const walletBalance    = Number(clientDetails.wallet_balance || 0);
  const maxPayoff        = Math.min(walletBalance, overdueAmount);
  const canPayoff        = walletBalance > 0 && overdueAmount > 0;
  const statementClientId = clientDetails.client_profile_id || bookingSummary.client_profile_id || bookingSummary.client_id;
  const lastPaymentDate   = paymentSummary.last_payment_at || paymentSummary.last_payment_date || null;

  const paidDays = dailyRate > 0 ? Math.floor(totalPaid / dailyRate) : 0;
  const plannedDays = useMemo(() => (!dailyRate ? 0 : Math.floor(totalPaid / dailyRate)), [totalPaid, dailyRate]);
  const servedDays = useMemo(() => {
    if (!bookingSummary.start_date) return 0;
    const today = new Date(); today.setHours(0,0,0,0);
    const s = new Date(bookingSummary.start_date); s.setHours(0,0,0,0);
    return Math.max(0, Math.floor((today - s) / 86400000) + 1);
  }, [bookingSummary.start_date]);

  const simServedDays = useMemo(() => {
    if (!simDate || !bookingSummary.start_date) return null;
    const s = new Date(bookingSummary.start_date); s.setHours(0,0,0,0);
    const e = new Date(simDate); e.setHours(0,0,0,0);
    return Math.max(0, Math.floor((e - s) / 86400000) + 1);
  }, [simDate, bookingSummary.start_date]);

  const simOutstanding = useMemo(() => {
    if (simServedDays === null || !dailyRate) return null;
    return Math.max(0, simServedDays * dailyRate - totalPaid);
  }, [simServedDays, dailyRate, totalPaid]);

  // ── Forward-projected settlement balance ──────────────────────────────────
  // `remainingBalance` (totalPaid - totalInvoiced) only reflects invoicing already recorded.
  // Days between the last invoiced day and the chosen completion/termination date still need
  // to be billed, so a prepayment that exactly covers the full period through that date isn't
  // a refundable surplus — it's earmarked for those pending invoices. Project the true
  // settlement balance as the full cost of service through the target date (days served ×
  // daily rate), mirroring the backend's projection in bookingSettlement.js exactly, so the
  // frontend's settlement decision (and required-note gating) never diverges from what the
  // backend will actually validate/apply.
  const servedDaysAsOf = (dateInput) => {
    if (!bookingSummary.start_date || !dateInput) return null;
    const s = new Date(bookingSummary.start_date); s.setHours(0, 0, 0, 0);
    const e = new Date(dateInput); e.setHours(0, 0, 0, 0);
    if (isNaN(e.getTime())) return null;
    return Math.max(0, Math.floor((e - s) / 86400000) + 1);
  };
  const projectedRemainingBalanceAt = (targetDateInput) => {
    if (!targetDateInput || !dailyRate) return remainingBalance;
    const targetServedDays = servedDaysAsOf(targetDateInput);
    if (targetServedDays === null) return remainingBalance;
    return totalPaid - (targetServedDays * dailyRate);
  };
  const actionsTargetDate = actualEndTime ? actualEndTime.slice(0, 10) : toDateInput(new Date());
  const projectedRemainingBalance = projectedRemainingBalanceAt(actionsTargetDate);
  const termFinalEndDateIso = formatDateForBackend(termFinalEndDate);
  const termProjectedRemainingBalance = projectedRemainingBalanceAt(termFinalEndDateIso);

  const staffColorMap = useMemo(() => {
    const map = new Map();
    const sorted = [...staffHistory].sort((a, b) => new Date(a.service_start_date || 0) - new Date(b.service_start_date || 0));
    let idx = 0;
    sorted.forEach(a => { const id = a.staff_profile_id || a.id; if (id && !map.has(id)) { map.set(id, NURSE_PALETTE[idx++ % NURSE_PALETTE.length]); } });
    return map;
  }, [staffHistory]);

  const sortedAllocationHistory = useMemo(() => {
    const sorted = [...normStaffHistory].sort((a, b) => new Date(a.startDate) - new Date(b.startDate));
    const bookingStart = bookingSummary.start_date ? new Date(bookingSummary.start_date) : null;
    if (bookingStart) bookingStart.setHours(0,0,0,0);
    return sorted.map(row => {
      const effectiveEnd = row.endDate || null;
      const startD = row.startDate ? new Date(row.startDate) : null; if (startD) startD.setHours(0,0,0,0);
      const endD = effectiveEnd ? new Date(effectiveEnd) : null; if (endD) endD.setHours(0,0,0,0);
      const dayStart = bookingStart && startD ? Math.max(1, Math.floor((startD - bookingStart) / 86400000) + 1) : null;
      const dayEnd   = bookingStart && endD   ? Math.max(1, Math.floor((endD - bookingStart) / 86400000) + 1)   : null;
      return { ...row, effectiveEnd, dayStart, dayEnd, dayCount: dayStart !== null && dayEnd !== null ? dayEnd - dayStart + 1 : null, isOngoing: !effectiveEnd, color: staffColorMap.get(row.colorKey) || null };
    });
  }, [normStaffHistory, bookingSummary.start_date, staffColorMap]);

  // ── effects ──────────────────────────────────────────────────────────────

  useEffect(() => { if (adminToken && bookingId) { fetchDetail(); fetchDailyRecords(); fetchSalesperson(); fetchReceipts(); } }, [adminToken, bookingId]);
  // Re-run after any action that can create/cancel a scheduled_actions row (complete,
  // terminate, shift pattern change, staff swap/reassign) — not just on mount — otherwise
  // a newly scheduled event (e.g. a future completion date) never reaches CareTimeline
  // until the page is manually refreshed.
  const fetchScheduledActions = () => {
    if (!adminToken || !bookingId) return;
    apiClient.setToken(adminToken);
    return apiClient.getBookingScheduledEvents(bookingId)
      .then(r => setBookingScheduledActions(r?.data || []))
      .catch(() => {});
  };
  useEffect(() => { fetchScheduledActions(); }, [adminToken, bookingId]);
  useEffect(() => { if (detail) setSettlementAction(remainingBalance > 0 ? 'WALLET_DEPOSIT' : 'NO_REFUND'); }, [detail, remainingBalance]);
  useEffect(() => {
    if (!adminToken) return;
    apiClient.setToken(adminToken);
    apiClient.getBankAccounts().then(r => setBankAccounts(r?.data || [])).catch(() => {});
  }, [adminToken]);
  useEffect(() => {
    if (!adminToken || activeSection !== 'staff') return;
    apiClient.setToken(adminToken);
    apiClient.getAllStaff({ status: 'AVAILABLE', limit: 1000, page: 1 }).then(r => setAvailableStaff(r?.data || [])).catch(() => {});
  }, [adminToken, activeSection]);

  // Batched schedule lookup for the staff-picker UIs below (swap modal + shift
  // pattern modal) — lets the admin see each candidate's existing/upcoming
  // commitments before assigning/swapping/reassigning them onto this booking.
  const [staffSchedules, setStaffSchedules] = useState({});
  const [staffSchedulesLoading, setStaffSchedulesLoading] = useState(false);
  useEffect(() => {
    const ids = new Set(availableStaff.map(s => s.staff_profile_id));
    shiftSlots.forEach(s => { if (s.assignment) ids.add(s.assignment.staff_profile_id); });
    const idList = [...ids];
    if (idList.length === 0) { setStaffSchedules({}); return; }
    setStaffSchedulesLoading(true);
    apiClient.getStaffSchedules(idList)
      .then(r => setStaffSchedules(r?.data || {}))
      .catch(() => setStaffSchedules({}))
      .finally(() => setStaffSchedulesLoading(false));
  }, [availableStaff, shiftSlots]);
  useEffect(() => {
    if (!adminToken || activeSection !== 'salesperson') return;
    apiClient.setToken(adminToken);
    apiClient.getSalespersons().then(r => setSalespersonsList(r?.data || [])).catch(() => {});
  }, [adminToken, activeSection]);
  useEffect(() => {
    if (!statementClientId || !adminToken) return;
    let cancelled = false;
    (async () => {
      setStatementPreviewLoading(true);
      try {
        apiClient.setToken(adminToken);
        const res = await apiClient.getClientStatement(statementClientId, { start_date: statementStartDate, end_date: statementEndDate });
        if (!cancelled) setStatementPreview(res);
      } catch { if (!cancelled) setStatementPreview(null); }
      finally { if (!cancelled) setStatementPreviewLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [statementClientId, statementStartDate, statementEndDate, adminToken]);

  useEffect(() => {
    if (!adminToken || !bookingId || !isShiftBased) return;
    fetchShiftData();
  }, [adminToken, bookingId, isShiftBased]);

  const fetchShiftData = async () => {
    try {
      apiClient.setToken(adminToken);
      const [patternRes, slotsRes] = await Promise.all([
        apiClient.getShiftPattern(bookingId),
        apiClient.getShiftSlots(bookingId),
      ]);
      setShiftPattern(patternRes?.data || null);
      setShiftSlots(Array.isArray(slotsRes?.data) ? slotsRes.data : []);
    } catch {
      // non-fatal — the staff tab still renders the rest of the booking
    }
  };

  const fetchPatternHistory = async () => {
    try {
      apiClient.setToken(adminToken);
      const res = await apiClient.getShiftPatternHistory(bookingId);
      setPatternHistory(Array.isArray(res?.data) ? res.data : []);
    } catch {
      setPatternHistory([]);
    }
  };

  // ── actions ──────────────────────────────────────────────────────────────

  const fetchDetail = async () => {
    try {
      setLoading(true); setError('');
      if (!adminToken) { setError('Admin authentication required'); return; }
      apiClient.setToken(adminToken);
      const res = await apiClient.getAdminBookingDetail(bookingId);
      const payload = res?.data ?? res;
      if (payload?.status === 'success') setDetail(payload.data || {});
      else if (payload && typeof payload === 'object' && !payload.status) setDetail(payload);
      else setError(payload?.message || 'Failed to load booking detail');
    } catch (err) { setError(err?.message || 'Unable to load booking detail'); }
    finally { setLoading(false); }
  };

  const fetchReceipts = async () => {
    try {
      if (!adminToken) return;
      apiClient.setToken(adminToken);
      const res = await apiClient.getBookingReceipts(bookingId);
      setReceipts(Array.isArray(res?.receipts) ? res.receipts : []);
    } catch {
      // non-fatal — payments still render without receipt links
    }
  };

  const handleSendReceipt = async (receiptId) => {
    try {
      setReceiptBusy(receiptId); setError('');
      apiClient.setToken(adminToken);
      await apiClient.sendPaymentReceipt(receiptId);
      await fetchReceipts();
    } catch (err) { setError(err?.message || 'Failed to send receipt'); }
    finally { setReceiptBusy(''); }
  };

  const handleSendLatestReceipt = async () => {
    setReceiptSendBusy(true);
    try {
      apiClient.setToken(adminToken);
      const res = await apiClient.getBookingReceipts(bookingId);
      const fresh = Array.isArray(res?.receipts) ? res.receipts : [];
      setReceipts(fresh);
      const latest = fresh[0];
      if (latest) {
        await apiClient.sendPaymentReceipt(latest.receipt_id);
        const res2 = await apiClient.getBookingReceipts(bookingId);
        setReceipts(Array.isArray(res2?.receipts) ? res2.receipts : []);
      }
      setShowReceiptSendPopup(false);
    } catch (err) {
      setError(err?.message || 'Failed to send receipt');
      setShowReceiptSendPopup(false);
    } finally {
      setReceiptSendBusy(false);
    }
  };

  const fetchDailyRecords = async () => {
    try {
      apiClient.setToken(adminToken);
      const [attRes, invRes] = await Promise.all([
        apiClient.getBookingAttendance(bookingId),
        apiClient.getBookingDailyInvoices(bookingId),
      ]);
      setAttendanceRecords(Array.isArray(attRes?.data) ? attRes.data : []);
      setDailyInvoiceRecords(Array.isArray(invRes?.data) ? invRes.data : []);
    } catch {
      // non-fatal — the timeline still renders without these
    }
  };

  const fetchSalesperson = async () => {
    try {
      apiClient.setToken(adminToken);
      const res = await apiClient.getBookingSalesperson(bookingId);
      setSalesData(res?.data || null);
    } catch {
      setSalesData(null);
    }
  };

  // Credit a salesperson (if none yet) or switch the current one (pointer-only).
  const handleSalespersonAssign = async () => {
    if (!salesActionId) return;
    setSalesActionBusy(true); setSalesActionError('');
    try {
      apiClient.setToken(adminToken);
      if (salesData?.current) {
        await apiClient.switchBookingSalesperson(bookingId, salesActionId, salesActionReason.trim() || null);
      } else {
        await apiClient.creditBookingSalesperson(bookingId, salesActionId);
      }
      setSalesActionId(''); setSalesActionReason('');
      await fetchSalesperson();
    } catch (err) {
      setSalesActionError(err?.message || 'Failed to update salesperson');
    } finally {
      setSalesActionBusy(false);
    }
  };

  // Finds staff assignments (raw staff_assignment_history rows) covering a given date
  const getAssignmentsForDate = (dateISO) => {
    const day = new Date(dateISO); day.setHours(12, 0, 0, 0);
    return staffHistory.filter(a => {
      const start = new Date(a.service_start_date); start.setHours(0, 0, 0, 0);
      const end = a.service_end_date ? new Date(a.service_end_date) : null;
      if (end) end.setHours(23, 59, 59, 999);
      return day >= start && (!end || day <= end);
    });
  };

  const openDayModal = (dateISO, dayNum) => {
    const assignments = getAssignmentsForDate(dateISO);
    const inputs = {};
    const invoiceInputs = {};
    assignments.forEach(a => {
      // Prefill from the scheduled shift (SHIFT_BASED) or the assignment's own service
      // start time (VISITING/LIVE_IN) so the admin isn't typing times from scratch —
      // still a plain editable input, so they can correct it if actual times differed.
      let in_time = '', out_time = '', autoFilled = false;
      if (a.shift_start_time) {
        in_time = a.shift_start_time.slice(0, 5);
        if (a.shift_duration_hours) out_time = addHoursToTime(in_time, parseFloat(a.shift_duration_hours));
        autoFilled = true;
      } else if (a.service_start_time) {
        in_time = a.service_start_time.slice(0, 5);
        autoFilled = true;
      }
      inputs[a.assignment_id] = { date: dateISO, in_time, out_time, autoFilled };
      if (a.shift_slot_id) invoiceInputs[a.shift_slot_id] = String(a.daily_rate || dailyRate || '');
    });
    setAttendanceInputs(inputs);
    setInvoiceAmountInputsBySlot(invoiceInputs);
    setInvoiceAmountInput(String(dailyRate || ''));
    setDayModalError('');
    setDayModal({ dateISO, dayNum, assignments });
  };
  const closeDayModal = () => { setDayModal(null); setDayModalError(''); setAttendanceInputs({}); setInvoiceAmountInput(''); setInvoiceAmountInputsBySlot({}); };

  const saveAttendanceTimes = async (assignment) => {
    const assignmentId = assignment.assignment_id;
    const inputs = attendanceInputs[assignmentId] || {};
    const dateISO = inputs.date || dayModal.dateISO;
    if (!inputs.in_time || !inputs.out_time) { setDayModalError('Both in-time and out-time are required'); return; }
    const outDateISO = inputs.out_time < inputs.in_time
      ? (() => { const d = new Date(`${dateISO}T12:00:00`); d.setDate(d.getDate() + 1); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; })()
      : dateISO;
    try {
      setDayModalBusy(`save-${assignmentId}`); setDayModalError('');
      apiClient.setToken(adminToken);
      await apiClient.upsertBookingAttendance(bookingId, {
        assignment_id: assignmentId,
        service_date: dateISO,
        in_time: new Date(`${dateISO}T${inputs.in_time}`).toISOString(),
        out_time: new Date(`${outDateISO}T${inputs.out_time}`).toISOString(),
        shift_slot_id: assignment.shift_slot_id || undefined,
      });
      await fetchDailyRecords();
    } catch (err) { setDayModalError(err?.message || 'Failed to save attendance times'); }
    finally { setDayModalBusy(''); }
  };

  const decideSalary = async (attendanceId, approve, defaultAmount) => {
    try {
      setDayModalBusy(`salary-${attendanceId}`); setDayModalError('');
      apiClient.setToken(adminToken);
      const overrideAmt = salaryAmountInputs[attendanceId];
      const amount = approve ? parseFloat(overrideAmt !== undefined && overrideAmt !== '' ? overrideAmt : defaultAmount) : undefined;
      await apiClient.confirmAttendanceSalary(attendanceId, approve, amount);
      await fetchDailyRecords();
    } catch (err) { setDayModalError(err?.message || 'Failed to confirm salary decision'); }
    finally { setDayModalBusy(''); }
  };

  const decideInvoice = async (approve, shiftSlotId) => {
    const busyKey = shiftSlotId ? `invoice-${shiftSlotId}` : 'invoice';
    try {
      setDayModalBusy(busyKey); setDayModalError('');
      apiClient.setToken(adminToken);
      await apiClient.confirmBookingDailyInvoice(bookingId, {
        service_date: dayModal.dateISO,
        approve,
        amount: approve ? parseFloat(shiftSlotId ? invoiceAmountInputsBySlot[shiftSlotId] : invoiceAmountInput) : undefined,
        shift_slot_id: shiftSlotId || undefined,
      });
      await Promise.all([fetchDailyRecords(), fetchDetail()]);
    } catch (err) { setDayModalError(err?.message || 'Failed to confirm invoice decision'); }
    finally { setDayModalBusy(''); }
  };

  const toggleInvoicingMode = async () => {
    const next = invoicingMode === 'AUTO' ? 'MANUAL' : 'AUTO';
    try {
      setInvoicingModeSaving(true); setError('');
      apiClient.setToken(adminToken);
      await apiClient.updateBookingInvoicingMode(bookingId, next);
      await fetchDetail();
    } catch (err) { setError(err?.message || 'Failed to update invoicing mode'); }
    finally { setInvoicingModeSaving(false); }
  };

  const downloadStatement = async () => {
    if (!statementClientId) { setError('Client profile ID is missing'); return; }
    try {
      setStatementLoading(true);
      apiClient.setToken(adminToken);
      const res = await apiClient.downloadClientStatement(statementClientId, { start_date: statementStartDate, end_date: statementEndDate });
      const blob = res instanceof Blob ? res : new Blob([res], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `statement-${bookingSummary.booking_code || bookingId}.pdf`;
      document.body.appendChild(a); a.click(); a.remove(); window.URL.revokeObjectURL(url);
    } catch (err) { setError(err?.message || 'Failed to generate statement'); }
    finally { setStatementLoading(false); }
  };

  const handleSubmitPayment = async (e) => {
    e.preventDefault();
    try {
      setPaymentSubmitting(true); setError('');
      apiClient.setToken(adminToken);
      await apiClient.recordBookingPayment(bookingId, {
        amount_received: parseFloat(paymentForm.amount_received), payment_method: paymentForm.payment_method,
        bank_account_id: paymentForm.bank_account_id || null, cheque_number: paymentForm.cheque_number || null,
        cheque_date: paymentForm.cheque_date || null, reference_number: paymentForm.reference_number || null, notes: paymentForm.notes || null,
      }, paymentSlipFile);
      setPaymentForm(initialPaymentForm); setPaymentSlipFile(null);
      setShowReceiptSendPopup(true);
      await fetchDetail();
      // Receipt is generated asynchronously server-side; refetch shortly after.
      await fetchReceipts();
      setTimeout(fetchReceipts, 2500);
    } catch (err) { setError(err?.message || 'Failed to record payment'); }
    finally { setPaymentSubmitting(false); }
  };

  const closeSwapModal = () => { setShowSwapModal(false); setSwapModalStep(1); setSwapModalSearch(''); setSwapModalSelectedStaff(null); setSwapModalReason(''); setSwapModalError(''); setSwapModalPage(1); setSwapModalDesignation(''); setSwapModalStartDate(toDateInput(new Date())); setSwapModalSlotId(null); setSwapModalIsAssign(false); };
  const selectSwapStaff = (s) => { setSwapModalSelectedStaff(s); setSwapModalStep(2); };
  const openSlotAssignModal = (slot) => { setSwapModalSlotId(slot.shift_slot_id); setSwapModalIsAssign(!slot.assignment); setShowSwapModal(true); };
  const confirmSwap = async () => {
    if (!swapModalSelectedStaff || (!swapModalSlotId && !swapModalReason.trim())) return;
    try {
      setSwapModalSubmitting(true); setSwapModalError('');
      apiClient.setToken(adminToken);
      let response;
      if (swapModalSlotId) {
        response = swapModalIsAssign
          ? await apiClient.assignStaffToShiftSlot(bookingId, swapModalSlotId, { staff_profile_id: swapModalSelectedStaff.staff_profile_id, service_start_date: swapModalStartDate, notes: swapModalReason.trim() || null })
          : await apiClient.reassignShiftSlotStaff(bookingId, swapModalSlotId, { new_staff_id: swapModalSelectedStaff.staff_profile_id, effective_date: swapModalStartDate, reason: swapModalReason.trim() || null });
      } else {
        response = await apiClient.swapBookingStaff(bookingId, { new_staff_id: swapModalSelectedStaff.staff_profile_id, swap_reason: swapModalReason.trim(), new_staff_start_date: swapModalStartDate });
      }
      closeSwapModal(); await fetchDetail(); await fetchScheduledActions(); if (isShiftBased) await fetchShiftData();
      if (response?.scheduled) {
        window.alert(response.message || 'Change scheduled for the future date.');
      }
    } catch (err) { setSwapModalError(err?.message || 'Failed to update staff assignment'); }
    finally { setSwapModalSubmitting(false); }
  };

  const cascadeStartTimes = (slots, fromIdx = 0) => {
    const result = [...slots];
    for (let i = fromIdx; i < result.length - 1; i++) {
      const [h, m] = (result[i].start_time || '00:00').split(':').map(Number);
      const totalMins = (h * 60 + m + Math.round(parseFloat(result[i].duration_hours || 0) * 60)) % 1440;
      result[i + 1] = { ...result[i + 1], start_time: `${String(Math.floor(totalMins / 60)).padStart(2, '0')}:${String(totalMins % 60).padStart(2, '0')}` };
    }
    return result;
  };
  const buildDefaultSlots = (count) => {
    const dur = (24 / count).toFixed(1);
    const base = Array.from({ length: count }, (_, i) => ({ shift_number: i + 1, start_time: '08:00', duration_hours: dur, label: `Shift ${i + 1}`, staff_profile_id: '' }));
    return cascadeStartTimes(base, 0);
  };
  const openPatternModal = () => {
    const existing = shiftPattern?.active?.slots;
    const count = shiftPattern?.active?.shift_count || 2;
    // Seed each row's staff dropdown from who currently holds that shift number,
    // so changing the pattern doesn't silently drop existing staff — the admin
    // sees and explicitly confirms/changes who's on each shift.
    const staffByShiftNumber = new Map(shiftSlots.map(s => [s.shift_number, s.assignment]));
    setPatternModalShiftCount(count);
    setPatternModalSlots(existing?.length ? existing.map(s => ({
      shift_number: s.shift_number,
      start_time: (s.start_time || '08:00').slice(0, 5),
      duration_hours: String(s.duration_hours),
      label: s.label || `Shift ${s.shift_number}`,
      staff_profile_id: staffByShiftNumber.get(s.shift_number)?.staff_profile_id || '',
    })) : buildDefaultSlots(count));
    setPatternModalEffectiveDate(toDateInput(new Date()));
    setPatternModalError('');
    setShowPatternModal(true);
  };
  const closePatternModal = () => { setShowPatternModal(false); setPatternModalError(''); };
  const handlePatternShiftCountChange = (count) => {
    setPatternModalShiftCount(count);
    setPatternModalSlots(prev => {
      const next = buildDefaultSlots(count);
      for (let i = 0; i < Math.min(prev.length, count); i++) next[i] = prev[i];
      return next;
    });
  };
  const updatePatternSlot = (idx, field, value) => {
    setPatternModalSlots(prev => {
      const updated = prev.map((s, i) => i === idx ? { ...s, [field]: value } : s);
      return (field === 'start_time' || field === 'duration_hours') ? cascadeStartTimes(updated, idx) : updated;
    });
  };
  const submitPatternChange = async () => {
    try {
      setPatternModalSubmitting(true); setPatternModalError('');
      apiClient.setToken(adminToken);
      const response = await apiClient.createShiftPattern(bookingId, {
        shift_count: patternModalShiftCount,
        slots: patternModalSlots.map(s => ({ shift_number: s.shift_number, start_time: `${s.start_time}:00`, duration_hours: parseFloat(s.duration_hours), label: s.label || null })),
        effective_from_date: patternModalEffectiveDate,
      });
      // A pattern change always creates brand-new shift_slot_id rows — even a shift
      // that "looks the same" needs its staff re-assigned against the new slot.
      const createdSlots = response?.data?.pattern?.slots || [];
      for (const s of patternModalSlots) {
        if (!s.staff_profile_id) continue;
        const created = createdSlots.find(c => c.shift_number === s.shift_number);
        if (!created) continue;
        await apiClient.assignStaffToShiftSlot(bookingId, created.shift_slot_id, {
          staff_profile_id: s.staff_profile_id,
          service_start_date: patternModalEffectiveDate,
          notes: null,
        });
      }
      closePatternModal(); await fetchShiftData(); await fetchScheduledActions();
      if (response?.scheduled) window.alert(response.message || 'Shift pattern change scheduled for the future date.');
      if (response?.warnings?.length) window.alert(`Note: ${response.warnings.join(' ')}`);
    } catch (err) { setPatternModalError(err?.message || 'Failed to save shift pattern'); }
    finally { setPatternModalSubmitting(false); }
  };
  const togglePatternHistory = () => { if (!showPatternHistory) fetchPatternHistory(); setShowPatternHistory(v => !v); };

  // availableStaff only lists status=AVAILABLE staff, which excludes anyone already
  // assigned to this booking's current shifts — merge those back in so the pattern
  // modal's dropdowns can keep (or explicitly drop) the current holder of a shift.
  const patternModalStaffOptions = useMemo(() => {
    const map = new Map(availableStaff.map(s => [s.staff_profile_id, s]));
    shiftSlots.forEach(s => {
      if (s.assignment && !map.has(s.assignment.staff_profile_id)) {
        map.set(s.assignment.staff_profile_id, { staff_profile_id: s.assignment.staff_profile_id, full_name: s.assignment.staff_name, designation: '' });
      }
    });
    return [...map.values()].sort((a, b) => (a.full_name || '').localeCompare(b.full_name || ''));
  }, [availableStaff, shiftSlots]);

  const handleWalletPayoff = async (e) => {
    e.preventDefault();
    const amount = parseFloat(walletPayoffAmount);
    if (!amount || amount <= 0) return;
    try {
      setWalletPayoffSubmitting(true); setWalletPayoffError('');
      apiClient.setToken(adminToken);
      await apiClient.walletPayoffBooking(bookingId, amount, walletPayoffNotes || null);
      setWalletPayoffAmount(''); setWalletPayoffNotes(''); await fetchDetail();
    } catch (err) { setWalletPayoffError(err?.message || 'Failed to process wallet payoff'); }
    finally { setWalletPayoffSubmitting(false); }
  };

  // NOTE: gating below (which step shows, whether NO_REFUND requires a note, what
  // settlement_action defaults to) uses `projectedRemainingBalance`, which mirrors the
  // backend's own projection in bookingSettlement.js exactly (same days-through-target-date ×
  // daily-rate formula) — so what the admin is asked to decide here always matches what the
  // backend will actually validate and apply, however far in the future the end date is.
  const openActionsModal = () => { setActionsModalStep(1); setActionsModalMode(null); setActionsModalError(''); setActualEndTime(toDTLocal(new Date())); setReason(''); setSettlementAction(projectedRemainingBalance > 0 ? 'WALLET_DEPOSIT' : 'NO_REFUND'); setSettlementNote(''); setShowActionsModal(true); };
  const closeActionsModal = () => { setShowActionsModal(false); setActionsModalStep(1); setActionsModalMode(null); setActionsModalError(''); };
  const handleActionsBack = () => { setActionsModalError(''); actionsModalStep === 3 && projectedRemainingBalance <= 0 ? setActionsModalStep(1) : setActionsModalStep(s => s - 1); };
  const handleActionsNext = () => {
    if (actionsModalStep === 1) { if (!actionsModalMode) return; setActionsModalStep(projectedRemainingBalance > 0 ? 2 : 3); }
    else if (actionsModalStep === 2) { if (settlementAction === 'NO_REFUND' && !settlementNote.trim()) { setActionsModalError('A settlement note is required when choosing no refund.'); return; } setActionsModalError(''); setActionsModalStep(3); }
  };
  const handleActionsSubmit = async () => {
    if (!bookingId || !actionsModalMode) return;
    try {
      setActionsModalLoading(true); setActionsModalError('');
      const payload = { actual_end_time: actualEndTime ? new Date(actualEndTime).toISOString() : new Date().toISOString(), settlement_action: projectedRemainingBalance > 0 ? settlementAction : 'NO_REFUND', settlement_note: settlementNote.trim() || null, reason: reason.trim() || `${actionsModalMode === 'complete' ? 'Completed' : 'Terminated'} via admin panel` };
      apiClient.setToken(adminToken);
      const response = actionsModalMode === 'complete'
        ? await apiClient.completeBooking(bookingId, payload)
        : await apiClient.adminTerminateBooking(bookingId, payload);
      closeActionsModal(); await fetchDetail(); await fetchScheduledActions();
      if (response?.scheduled) {
        window.alert(response.message || 'This has been scheduled for the future date. The booking stays active and billed until then.');
      }
    } catch (err) { setActionsModalError(err?.message || `Failed to ${actionsModalMode} booking`); }
    finally { setActionsModalLoading(false); }
  };

  const openApproveTermModal = (request) => {
    setTermModal({ mode: 'approve', request });
    const defaultEndDateIso = request.requested_end_date ? new Date(request.requested_end_date).toISOString().split('T')[0] : toDateInput(new Date());
    setTermFinalEndDate(formatDateForDisplay(defaultEndDateIso));
    setTermSettlementAction(projectedRemainingBalanceAt(defaultEndDateIso) > 0 ? 'WALLET_DEPOSIT' : 'NO_REFUND');
    setTermSettlementNote('');
    setTermModalError('');
  };
  const openRejectTermModal = (request) => {
    setTermModal({ mode: 'reject', request });
    setTermRejectReason('');
    setTermModalError('');
  };
  const closeTermModal = () => { setTermModal(null); setTermModalError(''); };

  const submitTermModal = async () => {
    if (!termModal) return;
    apiClient.setToken(adminToken);
    if (termModal.mode === 'approve') {
      if (termSettlementAction === 'NO_REFUND' && !termSettlementNote.trim()) {
        setTermModalError('A settlement note is required when selecting no refund.');
        return;
      }
      try {
        setTermModalLoading(true); setTermModalError('');
        const response = await apiClient.approveTerminationRequest(
          termModal.request.termination_id, termFinalEndDateIso, termSettlementAction, termSettlementNote.trim() || null,
        );
        closeTermModal(); await fetchDetail(); await fetchScheduledActions();
        if (response?.scheduled) {
          window.alert(response.message || 'Termination scheduled for the future date. The booking stays active and billed until then.');
        }
      } catch (err) { setTermModalError(err?.message || 'Failed to approve termination request'); }
      finally { setTermModalLoading(false); }
    } else {
      if (!termRejectReason.trim()) {
        setTermModalError('A reason is required when rejecting a termination request.');
        return;
      }
      try {
        setTermModalLoading(true); setTermModalError('');
        await apiClient.rejectTerminationRequest(termModal.request.termination_id, termRejectReason.trim());
        closeTermModal(); await fetchDetail();
      } catch (err) { setTermModalError(err?.message || 'Failed to reject termination request'); }
      finally { setTermModalLoading(false); }
    }
  };

  // ── tab / status ─────────────────────────────────────────────────────────

  const bookingStatus     = (bookingSummary.status || '').toLowerCase();
  const isTerminated      = bookingStatus === 'terminated';
  const sm                = STATUS_META[bookingStatus] || STATUS_META.pending;
  const scheduledCompletion   = bookingScheduledActions.find(sa => sa.action_type === 'COMPLETION');
  const scheduledTermination  = bookingScheduledActions.find(sa => sa.action_type === 'TERMINATION');
  const scheduledFinalization = scheduledCompletion || scheduledTermination || null;
  const requiresBank      = ['BANK_TRANSFER', 'CASH_DEPOSIT'].includes(paymentForm.payment_method);
  const isCheque          = paymentForm.payment_method === 'CHEQUE';

  const tabs = [
    { id: 'overview',    label: 'Overview' },
    { id: 'payments',    label: 'Payments' },
    { id: 'staff',       label: 'Staff & Swaps' },
    { id: 'salesperson', label: 'Salesperson' },
    { id: 'client',      label: 'Client & Care' },
    { id: 'settlement',  label: 'Settlement' },
    { id: 'termination', label: 'Termination' },
  ];

  const heroName    = patientDetails.patient_name || clientDetails.client_name || 'Booking';
  const heroInitials = initials(heroName);

  // ── input style helper ───────────────────────────────────────────────────
  const inp = { width: '100%', border: '1px solid #e5e7eb', borderRadius: 8, padding: '9px 12px', fontFamily: 'inherit', fontSize: 13.5, color: '#111827', outline: 'none', background: '#fff', boxSizing: 'border-box' };

  // ── loading / error ──────────────────────────────────────────────────────

  if (loading) {
    return (
      <AdminLayout>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '50vh' }}>
          <div style={{ textAlign: 'center' }}>
            <Loader2 style={{ width: 48, height: 48, color: '#137A6B', animation: 'spin 1s linear infinite', margin: '0 auto 16px' }} />
            <p style={{ color: '#9A9488', fontSize: 14 }}>Loading booking details…</p>
          </div>
        </div>
      </AdminLayout>
    );
  }

  if (!detail && error) {
    return (
      <AdminLayout>
        <div style={{ border: '1px solid #F5C9C5', background: '#FDF2F1', borderRadius: 16, padding: 24 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
            <div style={{ background: '#F7E6E3', borderRadius: '50%', padding: 8 }}><XCircle style={{ width: 24, height: 24, color: '#BC4338' }} /></div>
            <div>
              <h3 style={{ margin: '0 0 4px', fontSize: 17, fontWeight: 700, color: '#2A2722' }}>Unable to load booking</h3>
              <p style={{ margin: '0 0 16px', fontSize: 14, color: '#BC4338' }}>{error}</p>
              <button onClick={fetchDetail} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: '#BC4338', border: 'none', borderRadius: 10, padding: '9px 16px', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                <RefreshCw style={{ width: 14, height: 14 }} /> Retry
              </button>
            </div>
          </div>
        </div>
      </AdminLayout>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  RENDER
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <AdminLayout>
      <div className="-m-4 md:-m-8 px-3 sm:px-6 pt-6 pb-14" style={{ background: '#f8fafc', minHeight: '100vh', fontFamily: "'Hanken Grotesk',system-ui,sans-serif" }}>
        <div style={{ maxWidth: 1180, margin: '0 auto' }}>

          {/* ── Error banner ── */}
          {error && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#991b1b' }}>
              <span>{error}</span>
              <button onClick={() => setError('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#991b1b', lineHeight: 1 }}><XCircle style={{ width: 15, height: 15 }} /></button>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════
              HEADER BAR
          ══════════════════════════════════════════════════════ */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 22 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <button
                onClick={() => navigate('/admin/bookings')}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 13px', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: '#374151', cursor: 'pointer' }}
              >
                <ArrowLeft style={{ width: 14, height: 14 }} /> Back to bookings
              </button>
              <img src={vcareLogo} alt="VCare Nursing" style={{ height: isMobile ? 36 : 46, width: 'auto', objectFit: 'contain' }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12, color: '#6b7280', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 6, padding: '6px 10px' }}>
                {bookingSummary.booking_code || '—'}
              </span>
              <button onClick={fetchDetail} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 13px', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: '#374151', cursor: 'pointer' }}>
                <RefreshCw style={{ width: 14, height: 14 }} /> Refresh
              </button>
              {!isTerminated && !normCurrentStaff && (
                <button
                  onClick={() => navigate(`/admin/bookings/${bookingId}/staff-assignment`)}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: '#2563eb', border: 'none', borderRadius: 8, padding: '8px 14px', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: '#fff', cursor: 'pointer' }}
                >
                  <UserPlus style={{ width: 14, height: 14 }} /> Assign Staff
                </button>
              )}
              {!isTerminated && !scheduledFinalization && (
                <button onClick={openActionsModal} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: '#1e293b', border: 'none', borderRadius: 8, padding: '8px 14px', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: '#fff', cursor: 'pointer' }}>
                  <ShieldCheck style={{ width: 14, height: 14 }} /> Actions
                </button>
              )}
            </div>
          </div>

          {/* ══════════════════════════════════════════════════════
              HERO
          ══════════════════════════════════════════════════════ */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap', marginBottom: 20 }}>
            <div style={{ width: 56, height: 56, borderRadius: 12, background: '#e5e7eb', color: '#374151', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 800, flexShrink: 0 }}>
              {heroInitials}
            </div>
            <div style={{ flex: 1, minWidth: 260 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 5 }}>
                <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.2, color: '#111827' }}>
                  {heroName}
                  {bookingSummary.service_type ? ` · ${bookingSummary.service_type}` : ''}
                </h1>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: sm.bg, color: sm.col, borderRadius: 999, padding: '4px 10px', fontSize: 11.5, fontWeight: 600, whiteSpace: 'nowrap' }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: sm.dot }} />
                  {bookingSummary.status || 'Unknown'}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>{bookingSummary.service_model || '—'}</span>
                <span style={{ color: '#d1d5db' }}>·</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: '#f3f4f6', color: '#374151', borderRadius: 6, padding: '3px 9px', fontSize: 11.5, fontWeight: 600 }}>
                  <Briefcase style={{ width: 11, height: 11 }} />
                  {salesData?.current?.salesperson_name || 'Unassigned'}
                </span>
              </div>
              <p style={{ margin: 0, fontSize: 13, color: '#6b7280' }}>
                {[
                  bookingSummary.booking_code,
                  clientDetails.client_name && `for ${clientDetails.client_name}`,
                  bookingSummary.start_date && `Started ${formatDate(bookingSummary.start_date)}`,
                ].filter(Boolean).join(' · ') || '—'}
              </p>
            </div>
          </div>

          {/* ══════════════════════════════════════════════════════
              STAT CARDS
          ══════════════════════════════════════════════════════ */}
          {(() => {
            const displayOutstanding = simOutstanding ?? overdueAmount;
            const displayServed = simServedDays ?? servedDays;
            const overrun = plannedDays && displayServed > plannedDays;
            return (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 18 }}>
                <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '15px 16px' }}>
                  <div style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: '#9ca3af' }}>Total paid</div>
                  <div style={{ fontSize: bigStatSize(formatMoney(totalPaid), isMobile), fontWeight: 800, letterSpacing: '-0.02em', marginTop: 6, color: '#111827', wordBreak: 'break-word' }}>{formatMoney(totalPaid)}</div>
                  <div style={{ fontSize: 12, color: '#6b7280', fontWeight: 500, marginTop: 3 }}>{paidDays} days covered</div>
                </div>
                <div style={{ background: simDate ? '#fffbeb' : '#fff', border: simDate ? '1px solid #fde68a' : '1px solid #e5e7eb', borderRadius: 10, padding: '15px 16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: '#9ca3af' }}>Outstanding</span>
                    {simDate && <span style={{ fontSize: 10, fontWeight: 700, background: '#fde68a', color: '#92400e', borderRadius: 4, padding: '1px 5px' }}>SIM</span>}
                  </div>
                  <div style={{ fontSize: bigStatSize(formatMoney(displayOutstanding), isMobile), fontWeight: 800, letterSpacing: '-0.02em', marginTop: 6, color: displayOutstanding > 0 ? '#dc2626' : '#111827', wordBreak: 'break-word' }}>{formatMoney(displayOutstanding)}</div>
                  <div style={{ fontSize: 12, fontWeight: 500, marginTop: 3, color: displayOutstanding > 0 ? '#dc2626' : '#6b7280' }}>{displayOutstanding > 0 ? `${Math.max(0, (simServedDays ?? servedDays) - paidDays)} days overdue` : 'All clear'}</div>
                </div>
                <div style={{ background: simDate ? '#fffbeb' : '#fff', border: simDate ? '1px solid #fde68a' : '1px solid #e5e7eb', borderRadius: 10, padding: '15px 16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: '#9ca3af' }}>Days served</span>
                    {simDate && <span style={{ fontSize: 10, fontWeight: 700, background: '#fde68a', color: '#92400e', borderRadius: 4, padding: '1px 5px' }}>SIM</span>}
                  </div>
                  <div style={{ fontSize: isMobile ? 20 : 24, fontWeight: 800, letterSpacing: '-0.02em', marginTop: 6, color: '#111827' }}>
                    {displayServed} <span style={{ fontSize: isMobile ? 14 : 15, fontWeight: 500, color: overrun ? '#dc2626' : '#9ca3af' }}>/ {plannedDays || '—'}</span>
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 500, marginTop: 3, color: overrun ? '#dc2626' : '#6b7280' }}>
                    {overrun ? `+${displayServed - plannedDays} overrun` : `of ${plannedDays || '—'} planned`}
                  </div>
                </div>
                <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '15px 16px' }}>
                  <div style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: '#9ca3af' }}>Daily rate</div>
                  <div style={{ fontSize: bigStatSize(formatMoney(dailyRate), isMobile), fontWeight: 800, letterSpacing: '-0.02em', marginTop: 6, color: '#111827', wordBreak: 'break-word' }}>{formatMoney(dailyRate)}</div>
                  <div style={{ fontSize: 12, color: '#6b7280', fontWeight: 500, marginTop: 3 }}>{bookingSummary.service_model || '—'}</div>
                </div>
              </div>
            );
          })()}

          {/* ══════════════════════════════════════════════════════
              INVOICING MODE BANNER — LIVE_IN only, always visible, toggle anytime
          ══════════════════════════════════════════════════════ */}
          {isLiveIn && (
            <div
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap',
                marginBottom: 18, padding: '14px 18px', borderRadius: 10,
                background: '#f8fafc', border: '1px solid #e5e7eb',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 34, height: 34, borderRadius: 8, background: '#e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Wallet style={{ width: 16, height: 16, color: '#374151' }} />
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 13.5, fontWeight: 700, color: '#111827' }}>Daily client invoicing</span>
                    <span style={{ fontSize: 10.5, fontWeight: 600, padding: '2px 7px', borderRadius: 4, background: '#e5e7eb', color: '#374151', letterSpacing: '.03em' }}>
                      {invoicingMode}
                    </span>
                  </div>
                  <div style={{ fontSize: 12.5, color: '#6b7280', marginTop: 2 }}>
                    {invoicingMode === 'AUTO'
                      ? 'Billed automatically every night at 23:59. Staff salary is always automatic for LIVE_IN bookings.'
                      : 'Confirm each day\'s client charge from the care timeline below. Staff salary stays automatic either way.'}
                  </div>
                </div>
              </div>
              <button
                onClick={toggleInvoicingMode}
                disabled={invoicingModeSaving}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 14px', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: '#374151', cursor: invoicingModeSaving ? 'wait' : 'pointer', opacity: invoicingModeSaving ? 0.6 : 1, flexShrink: 0 }}
              >
                {invoicingModeSaving ? 'Saving…' : invoicingMode === 'AUTO' ? 'Switch to Manual' : 'Switch to Auto'}
              </button>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════
              SCHEDULED COMPLETION / TERMINATION NOTICE
          ══════════════════════════════════════════════════════ */}
          {scheduledFinalization && (
            <div
              style={{
                display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 18,
                padding: '14px 18px', borderRadius: 10,
                background: scheduledTermination ? '#FDF2F2' : '#F0F9F4',
                border: `1px solid ${scheduledTermination ? '#F5C9C5' : '#BCE0CC'}`,
              }}
            >
              <AlertTriangle style={{ width: 18, height: 18, color: scheduledTermination ? '#BC4338' : '#1F8B4C', flexShrink: 0, marginTop: 1 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: '#2A2722' }}>
                  {scheduledTermination ? 'Termination scheduled' : 'Completion scheduled'} for {formatDate(scheduledFinalization.effective_date)}
                </div>
                <div style={{ fontSize: 12.5, color: '#6F6A60', marginTop: 2 }}>
                  This booking stays active and billed as normal until then
                  {scheduledFinalization.reason ? ` — ${scheduledFinalization.reason}` : ''}.
                </div>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════
              CARE TIMELINE
          ══════════════════════════════════════════════════════ */}
          {bookingSummary.start_date && (
            <div style={{ marginBottom: 18 }}>
              <CareTimeline
                startDate={bookingSummary.start_date}
                plannedDays={plannedDays}
                dailyRate={dailyRate}
                totalPaid={totalPaid}
                staffAssignments={staffHistory}
                serviceModel={bookingSummary.service_model}
                shiftSlots={shiftSlots}
                scheduledActions={bookingScheduledActions}
                terminationRequests={terminationReqs}
                shiftPatternScheduled={shiftPattern?.scheduled || null}
                bookingStatus={bookingSummary.status}
                completionDate={bookingSummary.actual_end_time}
                simDate={simDate}
                onSimDateChange={setSimDate}
                onDayClick={dayClickEnabled ? openDayModal : undefined}
                attendanceRecords={attendanceRecords}
                dailyInvoiceRecords={dailyInvoiceRecords}
                manualSalaryDay={manualSalaryDay}
                manualInvoiceDay={manualInvoiceDay}
              />
            </div>
          )}

          {/* ══════════════════════════════════════════════════════
              TABS
          ══════════════════════════════════════════════════════ */}
          <div style={{ display: 'flex', gap: 3, marginBottom: 16, background: '#f1f5f9', padding: 4, borderRadius: 10, width: 'fit-content', maxWidth: '100%', flexWrap: 'wrap' }}>
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveSection(tab.id)}
                style={{
                  border: 'none', borderRadius: 7, padding: '8px 14px', fontFamily: 'inherit',
                  fontSize: 12.5, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
                  background: activeSection === tab.id ? '#fff' : 'transparent',
                  color: activeSection === tab.id ? '#111827' : '#64748b',
                  boxShadow: activeSection === tab.id ? '0 1px 3px rgba(0,0,0,.08)' : 'none',
                }}
              >{tab.label}</button>
            ))}
          </div>

          {/* ══════════════════════════════════════════════════════
              TAB: OVERVIEW
          ══════════════════════════════════════════════════════ */}
          {activeSection === 'overview' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16, alignItems: 'start' }}>
                {/* Booking details */}
                <Card>
                  <CardTitle>Booking details</CardTitle>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 15 }}>
                    <Field label="Booking code"  value={bookingSummary.booking_code  || '-'} mono />
                    <Field label="Status"        value={bookingSummary.status        || '-'} />
                    <Field label="Service type"  value={bookingSummary.service_type  || '-'} />
                    <Field label="Service model" value={bookingSummary.service_model || '-'} />
                    <Field label="Start date"    value={formatDate(bookingSummary.start_date)} />
                    <Field label="Start time"    value={formatTime(bookingSummary.service_start_time)} />
                    <Field label="Planned end"   value={formatDate(bookingSummary.scheduled_end_time)} />
                    {bookingSummary.actual_end_time && <Field label="Actual end" value={formatDT(bookingSummary.actual_end_time)} />}
                    <Field label="Created"       value={formatDT(bookingSummary.created_at)} />
                  </div>
                </Card>
                {/* Financial snapshot */}
                <Card>
                  <CardTitle>Financial snapshot</CardTitle>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {[
                      { label: 'Total paid',       value: formatMoney(totalPaid),          green: true },
                      { label: 'Total invoiced',   value: formatMoney(totalInvoiced) },
                      { label: 'Overdue amount',   value: formatMoney(overdueAmount),      red: overdueAmount > 0 },
                      { label: 'Remaining balance',value: formatMoney(remainingBalance) },
                      { label: 'Daily rate',       value: formatMoney(dailyRate) },
                      { label: 'Quoted amount',    value: formatMoney(bookingSummary.amount_quotated ?? 0) },
                      { label: 'Registration fee', value: formatMoney(bookingSummary.registration_fee ?? 0) },
                    ].map(({ label, value, red, green }) => (
                      <div key={label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                        <span style={{ fontSize: 13, color: '#6F6A60' }}>{label}</span>
                        <span style={{ fontSize: 13, fontWeight: 600, color: red ? '#BC4338' : green ? '#2F8A5B' : '#2A2722' }}>{value}</span>
                      </div>
                    ))}
                  </div>
                </Card>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, alignItems: 'start' }}>
                {/* Current assignment */}
                <Card>
                  <CardTitle>Current assignment</CardTitle>
                  {normCurrentStaff ? (
                    <>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 13, marginBottom: 16 }}>
                        <span style={{ width: 11, height: 11, borderRadius: '50%', background: '#3F77B5', flexShrink: 0 }} />
                        <div>
                          <div style={{ fontSize: 15, fontWeight: 700, color: '#2A2722' }}>{normCurrentStaff.name}</div>
                          <div style={{ fontSize: 12.5, color: '#6F6A60', marginTop: 2 }}>{normCurrentStaff.designation}</div>
                        </div>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 13 }}>
                        <Field label="Staff ID"   value={normCurrentStaff.id}     mono />
                        <Field label="Phone"       value={normCurrentStaff.mobile} />
                        <Field label="Email"       value={normCurrentStaff.email}  />
                        <Field label="Daily rate"  value={formatMoney(dailyRate)}  />
                      </div>
                    </>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '28px 16px', textAlign: 'center', border: '1px dashed #E7E1D6', borderRadius: 14, background: '#FBF9F4', gap: 12 }}>
                      <Users style={{ width: 22, height: 22, color: '#C4BFB5' }} />
                      <p style={{ margin: 0, fontSize: 13, color: '#9A9488' }}>No staff currently assigned.</p>
                      {!isTerminated && (
                        <button
                          onClick={() => navigate(`/admin/bookings/${bookingId}/staff-assignment`)}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: '#2563eb', border: 'none', borderRadius: 8, padding: '8px 14px', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, color: '#fff', cursor: 'pointer' }}
                        >
                          <UserPlus style={{ width: 13, height: 13 }} /> Assign Staff
                        </button>
                      )}
                    </div>
                  )}
                </Card>

                {/* Recent payments */}
                <Card>
                  <CardTitle>Recent activity</CardTitle>
                  {normPayments.length === 0 ? (
                    <Empty icon={DollarSign} text="No payments recorded yet." />
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                      {normPayments.slice(0, 4).map((p, i) => (
                        <div key={p.id || i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, background: '#FBF9F4', border: '1px solid #EFEAE0', borderRadius: 11, padding: '11px 13px' }}>
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: '#2A2722' }}>{formatDate(p.date)}</div>
                            <div style={{ fontSize: 11.5, color: '#A39D91', marginTop: 2 }}>{p.method.replace(/_/g, ' ')}</div>
                          </div>
                          <span style={{ fontSize: 13, fontWeight: 700, color: '#2F8A5B' }}>{formatMoney(p.amount)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════
              TAB: PAYMENTS
          ══════════════════════════════════════════════════════ */}
          {activeSection === 'payments' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

              {/* Mini stats */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 14 }}>
                {[
                  { label: 'Total invoiced',  value: formatMoney(invoiceSummary.total_invoiced ?? 0) },
                  { label: 'Outstanding',     value: formatMoney(overdueAmount), red: overdueAmount > 0 },
                  { label: 'Wallet balance',  value: formatMoney(walletBalance), green: walletBalance > 0 },
                  { label: 'Last payment',    value: formatDate(lastPaymentDate) },
                ].map(({ label, value, red, green }) => (
                  <div key={label} style={{ background: '#fff', border: '1px solid #ECE7DF', borderRadius: 14, padding: '15px 16px' }}>
                    <div style={{ fontSize: 11.5, fontWeight: 600, color: '#9A9488', textTransform: 'uppercase', letterSpacing: '.04em' }}>{label}</div>
                    <div style={{ fontSize: 18, fontWeight: 800, marginTop: 5, color: red ? '#BC4338' : green ? '#2F8A5B' : '#2A2722' }}>{value}</div>
                  </div>
                ))}
              </div>

              {/* Payment history + Record payment */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16, alignItems: 'start' }}>
                <Card>
                  <CardTitle>Payment history</CardTitle>
                  {normPayments.length === 0 ? (
                    <Empty icon={DollarSign} text="No payment records for this booking." />
                  ) : (
                    <>
                     <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
                      <div style={{ minWidth: 480 }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '0.95fr 0.9fr 0.8fr 0.75fr 1.25fr', gap: 10, paddingBottom: 9, fontSize: 11, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: '#A39D91', borderBottom: '1px solid #EFEAE0' }}>
                        <span>Date</span><span>Amount</span><span>Method</span><span>Reference</span><span>Receipt</span>
                      </div>
                      {normPayments.map((p, i) => {
                        const rcpt = receiptByPayment[p.id];
                        const rcptBusy = rcpt && receiptBusy === rcpt.receipt_id;
                        return (
                        <div key={p.id || i} style={{ display: 'grid', gridTemplateColumns: '0.95fr 0.9fr 0.8fr 0.75fr 1.25fr', gap: 10, padding: '13px 0', borderBottom: '1px solid #F2EEE6', alignItems: 'center' }}>
                          <div>
                            <div style={{ fontSize: 13.5, fontWeight: 600, color: '#2A2722' }}>{formatDate(p.date)}</div>
                            {p.notes !== '-' && <div style={{ fontSize: 11.5, color: '#A39D91', marginTop: 2 }}>{p.notes}</div>}
                          </div>
                          <div style={{ fontSize: 13.5, fontWeight: 700, color: '#2F8A5B' }}>{formatMoney(p.amount)}</div>
                          <div><span style={{ display: 'inline-block', fontSize: 11.5, fontWeight: 600, color: '#5A554B', background: '#F4F1EA', borderRadius: 7, padding: '3px 9px' }}>{p.method.replace(/_/g, ' ')}</span></div>
                          <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11.5, color: '#6F6A60' }}>
                            {p.reference}
                            {p.slipUrl && <a href={p.slipUrl} target="_blank" rel="noreferrer" style={{ marginLeft: 6, color: '#3F77B5', fontSize: 11 }}>slip</a>}
                          </div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                            {!rcpt ? (
                              <span style={{ fontSize: 11.5, color: '#B8B2A6' }}>—</span>
                            ) : (
                              <>
                                {rcpt.pdf_url ? (
                                  <a href={rcpt.pdf_url} target="_blank" rel="noreferrer"
                                     title={rcpt.receipt_code}
                                     style={{ fontSize: 11.5, fontWeight: 600, color: '#137A6B', textDecoration: 'none', border: '1px solid #CDE5DF', borderRadius: 7, padding: '3px 8px', background: '#F2FAF8' }}>
                                    Download
                                  </a>
                                ) : (
                                  <span style={{ fontSize: 11, color: '#B8862F' }}>Generating…</span>
                                )}
                                <button type="button" disabled={rcptBusy}
                                  onClick={() => handleSendReceipt(rcpt.receipt_id)}
                                  style={{ fontSize: 11.5, fontWeight: 700, fontFamily: 'inherit', color: '#fff', background: rcptBusy ? '#9CC6BC' : '#137A6B', border: 'none', borderRadius: 7, padding: '4px 9px', cursor: rcptBusy ? 'not-allowed' : 'pointer' }}>
                                  {rcptBusy ? 'Sending…' : rcpt.whatsapp_sent ? 'Resend' : 'Send'}
                                </button>
                                {rcpt.whatsapp_sent && (
                                  <span title={rcpt.whatsapp_sent_at ? `Sent ${formatDate(rcpt.whatsapp_sent_at)}` : 'Sent'}
                                        style={{ fontSize: 10.5, fontWeight: 700, color: '#2F8A5B' }}>✓ Sent</span>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                        );
                      })}
                      </div>
                     </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 12, marginTop: 2, borderTop: '1px solid #EFEAE0' }}>
                        <span style={{ fontSize: 13, color: '#6F6A60' }}>{normPayments.length} payment{normPayments.length !== 1 ? 's' : ''}</span>
                        <span style={{ fontSize: 13, fontWeight: 800, color: '#2A2722' }}>{formatMoney(totalPaid)}</span>
                      </div>
                    </>
                  )}
                </Card>

                <Card>
                  <CardTitle>Record a payment</CardTitle>
                  <p style={{ margin: '-10px 0 15px', fontSize: 12.5, color: '#9A9488' }}>Writes to the booking ledger.</p>
                  <form onSubmit={handleSubmitPayment} style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
                    <div>
                      <label style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: '#7A756A', marginBottom: 5 }}>Amount</label>
                      <input required type="number" min="0" step="0.01" placeholder="0.00" value={paymentForm.amount_received} onChange={e => setPaymentForm({ ...paymentForm, amount_received: e.target.value })} style={inp} />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: '#7A756A', marginBottom: 5 }}>Method</label>
                      <select value={paymentForm.payment_method} onChange={e => setPaymentForm({ ...paymentForm, payment_method: e.target.value })} style={inp}>
                        <option value="BANK_TRANSFER">Bank transfer</option>
                        <option value="CASH_DEPOSIT">Cash deposit</option>
                        <option value="CASH">Cash</option>
                        <option value="CHEQUE">Cheque</option>
                      </select>
                    </div>
                    {requiresBank && (
                      <div>
                        <label style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: '#7A756A', marginBottom: 5 }}>Bank account</label>
                        <select required value={paymentForm.bank_account_id} onChange={e => setPaymentForm({ ...paymentForm, bank_account_id: e.target.value })} style={inp}>
                          <option value="">Select account</option>
                          {bankAccounts.map(a => <option key={a.account_id} value={a.account_id}>{a.account_nickname} ({a.bank_name})</option>)}
                        </select>
                      </div>
                    )}
                    {isCheque && (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8 }}>
                        <div>
                          <label style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: '#7A756A', marginBottom: 5 }}>Cheque no.</label>
                          <input required placeholder="000000" value={paymentForm.cheque_number} onChange={e => setPaymentForm({ ...paymentForm, cheque_number: e.target.value })} style={inp} />
                        </div>
                        <div>
                          <label style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: '#7A756A', marginBottom: 5 }}>Cheque date</label>
                          <input required type="date" value={paymentForm.cheque_date} onChange={e => setPaymentForm({ ...paymentForm, cheque_date: e.target.value })} style={inp} />
                        </div>
                      </div>
                    )}
                    <div>
                      <label style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: '#7A756A', marginBottom: 5 }}>Reference (optional)</label>
                      <input placeholder="TRF / receipt no." value={paymentForm.reference_number} onChange={e => setPaymentForm({ ...paymentForm, reference_number: e.target.value })} style={inp} />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: '#7A756A', marginBottom: 5 }}>Notes (optional)</label>
                      <textarea rows={2} placeholder="e.g. 10-day advance" value={paymentForm.notes} onChange={e => setPaymentForm({ ...paymentForm, notes: e.target.value })} style={{ ...inp, resize: 'none' }} />
                    </div>
                    <div style={{ background: '#F6F3EC', border: '1px solid #E7E1D6', borderRadius: 10, padding: 12 }}>
                      <label style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: '#7A756A', marginBottom: 8 }}>Payment slip (optional)</label>
                      <label style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: '#fff', border: '1px solid #E7E1D6', borderRadius: 8, padding: '7px 12px', fontSize: 12, fontWeight: 600, color: '#5A554B', cursor: 'pointer' }}>
                        <Upload style={{ width: 13, height: 13 }} /> Choose file
                        <input type="file" accept="image/*,.pdf" style={{ display: 'none' }} onChange={e => setPaymentSlipFile(e.target.files?.[0] || null)} />
                      </label>
                      {paymentSlipFile && <p style={{ margin: '8px 0 0', fontSize: 12, color: '#6F6A60' }}>{paymentSlipFile.name}</p>}
                    </div>
                    <button type="submit" disabled={paymentSubmitting} style={{ marginTop: 3, width: '100%', background: paymentSubmitting ? '#9ca3af' : '#1e293b', border: 'none', borderRadius: 8, padding: '11px 12px', fontFamily: 'inherit', fontSize: 13.5, fontWeight: 700, color: '#fff', cursor: paymentSubmitting ? 'not-allowed' : 'pointer' }}>
                      {paymentSubmitting ? 'Saving…' : 'Record payment'}
                    </button>
                  </form>
                </Card>
              </div>

              {/* Wallet payoff */}
              <Card>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 15 }}>
                  <div style={{ background: '#EDE5F5', borderRadius: '50%', padding: 8 }}><Wallet style={{ width: 16, height: 16, color: '#7A4A94' }} /></div>
                  <h3 style={{ margin: 0, fontSize: 15.5, fontWeight: 700 }}>Wallet payoff</h3>
                </div>
                {canPayoff && !isTerminated ? (
                  <form onSubmit={handleWalletPayoff} style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
                      {[{ label: 'Wallet balance', value: formatMoney(walletBalance), color: '#2F8A5B' }, { label: 'Overdue amount', value: formatMoney(overdueAmount), color: '#BC4338' }, { label: 'Max payable', value: formatMoney(maxPayoff), color: '#7A4A94' }].map(({ label, value, color }) => (
                        <div key={label} style={{ border: '1px solid #ECE7DF', borderRadius: 12, padding: 12 }}>
                          <div style={{ fontSize: 11.5, color: '#9A9488', marginBottom: 4 }}>{label}</div>
                          <div style={{ fontSize: 14, fontWeight: 700, color }}>{value}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input required type="number" min="0.01" max={maxPayoff.toFixed(2)} step="0.01" placeholder="Amount to pay off" value={walletPayoffAmount} onChange={e => setWalletPayoffAmount(e.target.value)} style={{ ...inp, flex: 1 }} />
                      <button type="button" onClick={() => setWalletPayoffAmount(maxPayoff.toFixed(2))} style={{ border: '1px solid #E2DCD0', borderRadius: 10, padding: '10px 14px', fontSize: 12, fontWeight: 600, color: '#5A554B', background: '#FCFBF8', cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>Max</button>
                    </div>
                    <textarea rows={2} placeholder="Notes (optional)" value={walletPayoffNotes} onChange={e => setWalletPayoffNotes(e.target.value)} style={{ ...inp, resize: 'none' }} />
                    {walletPayoffError && <div style={{ background: '#FDF2F1', border: '1px solid #F5C9C5', borderRadius: 10, padding: '10px 12px', fontSize: 13, color: '#BC4338' }}>{walletPayoffError}</div>}
                    <button type="submit" disabled={walletPayoffSubmitting || !walletPayoffAmount} style={{ width: '100%', background: walletPayoffSubmitting ? '#9ca3af' : '#1e293b', border: 'none', borderRadius: 8, padding: '11px 12px', fontFamily: 'inherit', fontSize: 13.5, fontWeight: 700, color: '#fff', cursor: 'pointer' }}>
                      {walletPayoffSubmitting ? 'Processing…' : 'Pay with wallet'}
                    </button>
                  </form>
                ) : (
                  <div style={{ border: '1px dashed #E7E1D6', borderRadius: 12, background: '#FBF9F4', padding: '24px 16px', textAlign: 'center' }}>
                    <Wallet style={{ width: 22, height: 22, color: '#C4BFB5', margin: '0 auto 10px' }} />
                    <p style={{ margin: 0, fontSize: 13, color: '#9A9488' }}>
                      {isTerminated ? 'Wallet payoff unavailable for terminated bookings.' : overdueAmount <= 0 ? 'No overdue amount.' : 'Client wallet is empty.'}
                    </p>
                  </div>
                )}
              </Card>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════
              TAB: STAFF & SWAPS
          ══════════════════════════════════════════════════════ */}
          {activeSection === 'staff' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {isShiftBased ? (
                <>
                  {/* Shift pattern */}
                  <Card>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 16 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: '#A39D91' }}>Shift pattern</div>
                      {!isTerminated && (
                        <button onClick={openPatternModal} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: '#374151', border: 'none', borderRadius: 8, padding: '8px 13px', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, color: '#fff', cursor: 'pointer', flexShrink: 0 }}>
                          Change Pattern
                        </button>
                      )}
                    </div>
                    {shiftPattern?.active ? (
                      <>
                        <div style={{ fontSize: 13, color: '#5A554B', marginBottom: 10 }}>{shiftPattern.active.shift_count} shifts/day · effective {formatDate(shiftPattern.active.effective_from_date)}</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                          {(shiftPattern.active.slots || []).map(s => (
                            <span key={s.shift_slot_id} style={{ fontSize: 12, fontWeight: 600, color: '#5A554B', background: '#FBF9F4', border: '1px solid #EFEAE0', borderRadius: 999, padding: '5px 11px' }}>
                              {s.label || `Shift ${s.shift_number}`} · {(s.start_time || '').slice(0, 5)} ({s.duration_hours}h)
                            </span>
                          ))}
                        </div>
                        {shiftPattern.scheduled && (
                          <div style={{ marginTop: 12, fontSize: 12.5, color: '#B07A1E', background: '#FBF1DD', border: '1px solid #F3E3BC', borderRadius: 10, padding: '9px 12px' }}>
                            A new {shiftPattern.scheduled.shift_count}-shift pattern takes effect on {formatDate(shiftPattern.scheduled.effective_from_date)}.
                          </div>
                        )}
                      </>
                    ) : <Empty icon={Users} text="No shift pattern defined yet." />}
                    <button onClick={togglePatternHistory} style={{ marginTop: 12, fontSize: 12.5, fontWeight: 600, color: '#8C5AA6', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                      {showPatternHistory ? 'Hide history' : 'View pattern history'}
                    </button>
                    {showPatternHistory && (
                      <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {patternHistory.length === 0 ? <div style={{ fontSize: 12, color: '#A39D91' }}>No history.</div> : patternHistory.map(p => (
                          <div key={p.pattern_id} style={{ fontSize: 12, color: '#6F6A60', background: '#FBF9F4', border: '1px solid #EFEAE0', borderRadius: 8, padding: '7px 10px' }}>
                            {p.shift_count} shifts · {formatDate(p.effective_from_date)} → {p.effective_to_date ? formatDate(p.effective_to_date) : 'ongoing'} · <Pill tone={p.status === 'ACTIVE' ? 'green' : p.status === 'SCHEDULED' ? 'amber' : 'slate'}>{p.status}</Pill>
                          </div>
                        ))}
                      </div>
                    )}
                  </Card>

                  {/* Per-shift staff */}
                  <Card>
                    <CardTitle>Per-shift staff</CardTitle>
                    {shiftSlots.length === 0 ? <Empty icon={Users} text="Define a shift pattern to assign staff." /> : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {shiftSlots.map(slot => (
                          <div key={slot.shift_slot_id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, border: '1px solid #EFEAE0', borderRadius: 12, padding: '12px 14px', background: '#FBF9F4' }}>
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontSize: 13.5, fontWeight: 700, color: '#2A2722' }}>{slot.label || `Shift ${slot.shift_number}`} <span style={{ fontWeight: 500, color: '#A39D91' }}>· {(slot.start_time || '').slice(0, 5)} ({slot.duration_hours}h)</span></div>
                              {slot.assignment ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3, flexWrap: 'wrap' }}>
                                  <div style={{ fontSize: 12.5, color: '#6F6A60' }}>{slot.assignment.staff_name} · {formatMoney(slot.assignment.daily_rate)}/shift</div>
                                  {slot.assignment.status === 'SCHEDULED' && (
                                    <Pill tone="amber">Starts {formatDate(slot.assignment.service_start_date)}</Pill>
                                  )}
                                </div>
                              ) : (
                                <div style={{ fontSize: 12.5, color: '#A39D91', marginTop: 2 }}>Unassigned</div>
                              )}
                            </div>
                            {!isTerminated && (
                              <button onClick={() => openSlotAssignModal(slot)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#374151', border: 'none', borderRadius: 8, padding: '7px 12px', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, color: '#fff', cursor: 'pointer', flexShrink: 0 }}>
                                {slot.assignment ? <><Repeat2 style={{ width: 13, height: 13 }} /> Reassign</> : 'Assign'}
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </Card>
                </>
              ) : (
                /* Current staff */
                <Card>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 16 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: '#A39D91' }}>Currently on duty</div>
                    {!isTerminated && (
                      <button onClick={() => setShowSwapModal(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: '#374151', border: 'none', borderRadius: 8, padding: '8px 13px', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, color: '#fff', cursor: 'pointer', flexShrink: 0 }}>
                        <Repeat2 style={{ width: 14, height: 14 }} /> Initiate Swap
                      </button>
                    )}
                  </div>
                  {normCurrentStaff ? (
                    <>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 13, marginBottom: 16 }}>
                        <div style={{ width: 44, height: 44, borderRadius: 12, background: '#E7F0F8', color: '#3F77B5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 800, flexShrink: 0 }}>
                          {initials(normCurrentStaff.name)}
                        </div>
                        <div>
                          <div style={{ fontSize: 15, fontWeight: 700, color: '#2A2722' }}>{normCurrentStaff.name}</div>
                          <div style={{ fontSize: 12.5, color: '#6F6A60', marginTop: 2 }}>{normCurrentStaff.designation}</div>
                        </div>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 13 }}>
                        <Field label="Staff ID"   value={normCurrentStaff.id}     mono />
                        <Field label="Phone"       value={normCurrentStaff.mobile} />
                        <Field label="Email"       value={normCurrentStaff.email}  />
                        <Field label="Daily rate"  value={formatMoney(dailyRate)}  />
                      </div>
                    </>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '28px 16px', textAlign: 'center', border: '1px dashed #E7E1D6', borderRadius: 14, background: '#FBF9F4', gap: 12 }}>
                      <Users style={{ width: 22, height: 22, color: '#C4BFB5' }} />
                      <p style={{ margin: 0, fontSize: 13, color: '#9A9488' }}>No staff is currently assigned to this booking.</p>
                      {!isTerminated && (
                        <button
                          onClick={() => navigate(`/admin/bookings/${bookingId}/staff-assignment`)}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: '#2563eb', border: 'none', borderRadius: 8, padding: '8px 14px', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, color: '#fff', cursor: 'pointer' }}
                        >
                          <UserPlus style={{ width: 13, height: 13 }} /> Assign Staff
                        </button>
                      )}
                    </div>
                  )}
                </Card>
              )}

              {/* Allocation history */}
              <Card>
                <CardTitle>Allocation history</CardTitle>
                {sortedAllocationHistory.length === 0 ? <Empty icon={Users} text="No allocation history available." /> : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {sortedAllocationHistory.map((row, i) => (
                      <div key={row.id || i} style={{ display: 'flex', alignItems: 'center', gap: 12, borderRadius: 12, padding: '12px 14px', background: row.color ? row.color.tint : '#FBF9F4', border: `1px solid ${row.color ? row.color.border : '#EFEAE0'}`, borderLeft: `4px solid ${row.color ? row.color.solid : '#E7E1D6'}` }}>
                        <div style={{ width: 36, height: 36, borderRadius: 10, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 12, fontWeight: 800, background: row.color ? row.color.solid : '#D5CFC4' }}>
                          {initials(row.name)}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <span style={{ fontSize: 13.5, fontWeight: 700, color: '#2A2722' }}>{row.name}</span>
                            {row.designation !== '-' && <span style={{ fontSize: 12, color: '#A39D91' }}>{row.designation}</span>}
                            {row.isOngoing && <span style={{ fontSize: 10, fontWeight: 700, background: '#E3F1E8', color: '#2F7A53', border: '1px solid #DCEEDD', borderRadius: 999, padding: '2px 7px' }}>Active</span>}
                          </div>
                          <div style={{ fontSize: 12, color: '#6F6A60', marginTop: 3 }}>
                            {formatDate(row.startDate)} <span style={{ color: '#C4BFB5', margin: '0 4px' }}>→</span>
                            {row.effectiveEnd ? formatDate(row.effectiveEnd) : <span style={{ color: '#2F8A5B', fontWeight: 600 }}>Ongoing</span>}
                          </div>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 700, padding: '4px 10px', borderRadius: 8, background: row.color ? row.color.solid : '#E7E1D6', color: row.color ? '#fff' : '#5A554B', marginBottom: 4 }}>
                            Day {row.dayStart ?? '?'} {row.isOngoing ? '→ ongoing' : `→ Day ${row.dayEnd ?? '?'}`}
                          </div>
                          <div style={{ fontSize: 11, color: '#A39D91' }}>
                            {row.dayCount !== null ? `${row.dayCount} day${row.dayCount !== 1 ? 's' : ''}` : row.isOngoing && row.dayStart && plannedDays ? `${plannedDays - row.dayStart + 1} planned` : '—'}
                          </div>
                          {row.amountAllocated > 0 && <div style={{ fontSize: 11, fontWeight: 600, color: '#5A554B', marginTop: 2 }}>{formatMoney(row.amountAllocated)}</div>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>

              {/* Swap history */}
              <Card>
                <CardTitle>Swap history</CardTitle>
                {normSwapHistory.length === 0 ? <Empty icon={Repeat2} text="No swap history for this booking." /> : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
                    {normSwapHistory.map((swap, i) => (
                      <div key={swap.id || i} style={{ background: '#FBF9F4', border: '1px solid #EFEAE0', borderRadius: 12, padding: '14px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 13.5, fontWeight: 700, color: '#2A2722' }}>{swap.oldStaffName}</span>
                            <span style={{ color: '#B6AFA2', fontSize: 16 }}>→</span>
                            <span style={{ fontSize: 13.5, fontWeight: 700, color: '#2A2722' }}>{swap.newStaffName}</span>
                          </div>
                          <Pill tone={swap.billingGap ? 'amber' : 'violet'}>{swap.billingGap ? 'Billing gap' : 'Recorded'}</Pill>
                        </div>
                        <div style={{ fontSize: 12, color: '#A39D91', marginBottom: 5 }}>{formatDT(swap.swappedAt)}</div>
                        <div style={{ fontSize: 13, color: '#5A554B' }}>{swap.reason || 'No reason provided.'}</div>
                        {swap.swappedByMobile && <div style={{ fontSize: 12, color: '#A39D91', marginTop: 5 }}>Swapped by {swap.swappedByMobile}</div>}
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════
              TAB: SALESPERSON
          ══════════════════════════════════════════════════════ */}
          {activeSection === 'salesperson' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Current salesperson + assign/switch control */}
              <Card>
                <CardTitle>Currently credited salesperson</CardTitle>
                {salesData?.current ? (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 13, marginBottom: 16 }}>
                      <div style={{ width: 44, height: 44, borderRadius: 12, background: '#EEF2FF', color: '#4338CA', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 800, flexShrink: 0 }}>
                        {initials(salesData.current.salesperson_name)}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 15, fontWeight: 700, color: '#2A2722' }}>{salesData.current.salesperson_name}</span>
                          {salesData.current.is_origin
                            ? <Pill tone="violet">Brought in</Pill>
                            : <Pill tone="slate">Switched in</Pill>}
                        </div>
                        <div style={{ fontSize: 12.5, color: '#6F6A60', marginTop: 2 }}>{salesData.current.salesperson_role || 'Salesperson'}</div>
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 13 }}>
                      <Field label="Brought in by" value={salesData.origin?.salesperson_name || '—'} />
                      <Field label="Amount credited" value={formatMoney(salesData.origin?.credited_amount || 0)} />
                      <Field label="Assigned on" value={formatDate(salesData.current.assigned_at)} />
                    </div>
                  </>
                ) : (
                  <Empty icon={Briefcase} text="No salesperson is credited for this booking yet." />
                )}

                {!isTerminated && (
                  <div style={{ marginTop: 18, paddingTop: 16, borderTop: '1px solid #EFEAE0' }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#2A2722', marginBottom: 4 }}>
                      {salesData?.current ? 'Switch current salesperson' : 'Credit a salesperson'}
                    </div>
                    <div style={{ fontSize: 12, color: '#9A9488', marginBottom: 10 }}>
                      {salesData?.current
                        ? 'Switching only changes who is currently assigned. The sales amount and booking count stay permanently with the salesperson who brought the booking in.'
                        : 'Credits the booking’s paid amount and a booking count to the selected salesperson.'}
                    </div>
                    {salesActionError && (
                      <div style={{ background: '#FBEAE7', border: '1px solid #F0CFC9', color: '#9A372C', borderRadius: 10, padding: '9px 12px', fontSize: 13, marginBottom: 10 }}>
                        {salesActionError}
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                      <select
                        value={salesActionId}
                        onChange={(e) => setSalesActionId(e.target.value)}
                        style={{ flex: 1, minWidth: 200, border: '1px solid #E7E1D6', borderRadius: 10, padding: '9px 12px', fontFamily: 'inherit', fontSize: 13.5, color: '#2A2722', background: '#fff' }}
                      >
                        <option value="">Select salesperson…</option>
                        {salespersonsList
                          .filter((sp) => sp.id !== salesData?.current?.salesperson_id)
                          .map((sp) => (
                            <option key={sp.id} value={sp.id}>{sp.full_name}{sp.role ? ` — ${sp.role}` : ''}</option>
                          ))}
                      </select>
                      {salesData?.current && (
                        <input
                          type="text"
                          value={salesActionReason}
                          onChange={(e) => setSalesActionReason(e.target.value)}
                          placeholder="Reason (optional)"
                          style={{ flex: 1, minWidth: 200, border: '1px solid #E7E1D6', borderRadius: 10, padding: '9px 12px', fontFamily: 'inherit', fontSize: 13.5, color: '#2A2722' }}
                        />
                      )}
                      <button
                        onClick={handleSalespersonAssign}
                        disabled={!salesActionId || salesActionBusy}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: !salesActionId || salesActionBusy ? '#d1d5db' : '#1e293b', border: 'none', borderRadius: 8, padding: '10px 16px', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: '#fff', cursor: !salesActionId || salesActionBusy ? 'not-allowed' : 'pointer', flexShrink: 0 }}
                      >
                        {salesActionBusy ? <Loader2 style={{ width: 14, height: 14 }} className="animate-spin" /> : <Briefcase style={{ width: 14, height: 14 }} />}
                        {salesData?.current ? 'Switch' : 'Credit'}
                      </button>
                    </div>
                  </div>
                )}
              </Card>

              {/* Salesperson history */}
              <Card>
                <CardTitle>Salesperson history</CardTitle>
                {!salesData || salesData.history.length === 0 ? (
                  <Empty icon={History} text="No salesperson history for this booking." />
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
                    {salesData.history.map((h) => (
                      <div key={h.id} style={{ background: '#FBF9F4', border: '1px solid #EFEAE0', borderRadius: 12, padding: '14px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 6 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <span style={{ fontSize: 13.5, fontWeight: 700, color: '#2A2722' }}>{h.salesperson_name}</span>
                            <Pill tone={h.action === 'CREDITED' ? 'violet' : 'slate'}>{h.action}</Pill>
                            {h.is_current && <Pill tone="green">Current</Pill>}
                          </div>
                          <span style={{ fontSize: 13, fontWeight: 700, color: '#2A2722' }}>
                            {h.is_origin ? formatMoney(h.credited_amount) : '—'}
                          </span>
                        </div>
                        <div style={{ fontSize: 12, color: '#A39D91' }}>{formatDT(h.assigned_at)}</div>
                        {h.switch_reason && <div style={{ fontSize: 13, color: '#5A554B', marginTop: 5 }}>{h.switch_reason}</div>}
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════
              TAB: CLIENT & CARE
          ══════════════════════════════════════════════════════ */}
          {activeSection === 'client' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
              <Card>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                  <div style={{ width: 38, height: 38, borderRadius: 10, background: '#E4F1ED', color: '#137A6B', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800 }}>{initials(clientDetails.client_name || 'C')}</div>
                  <h3 style={{ margin: 0, fontSize: 15.5, fontWeight: 700 }}>Client</h3>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 15 }}>
                  <Field label="Name"      value={clientDetails.client_name} />
                  <Field label="Client ID" value={clientDetails.client_profile_id || bookingSummary.client_id || '-'} mono />
                  <Field label="Phone"     value={clientDetails.client_mobile || clientDetails.mobile || '-'} />
                  <Field label="Email"     value={clientDetails.client_email || clientDetails.email || '-'} />
                  <div style={{ gridColumn: '1/-1' }}><Field label="Address" value={clientDetails.client_address || clientDetails.address || '-'} /></div>
                </div>
              </Card>
              <Card>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                  <div style={{ width: 38, height: 38, borderRadius: 10, background: '#F2E9F4', color: '#8C5AA6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800 }}>{initials(patientDetails.patient_name || 'P')}</div>
                  <h3 style={{ margin: 0, fontSize: 15.5, fontWeight: 700 }}>Care profile</h3>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 15 }}>
                  <Field label="Patient"      value={patientDetails.patient_name} />
                  <Field label="Age"          value={patientDetails.patient_age || '-'} />
                  <Field label="Relationship" value={patientDetails.relationship_to_client || '-'} />
                  <Field label="Mobility"     value={patientDetails.mobility || '-'} />
                  <div style={{ gridColumn: '1/-1' }}><Field label="Medical condition" value={patientDetails.medical_condition || '-'} /></div>
                </div>
              </Card>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════
              TAB: SETTLEMENT
          ══════════════════════════════════════════════════════ */}
          {activeSection === 'settlement' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16, alignItems: 'start' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <Card>
                  <CardTitle>Booking snapshot</CardTitle>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                    {[
                      { label: 'Booking code', value: bookingSummary.booking_code || '-', mono: true },
                      { label: 'Status',       value: bookingSummary.status       || '-' },
                      { label: 'Service',      value: bookingSummary.service_type || '-' },
                      { label: 'Start',        value: formatDate(bookingSummary.start_date) },
                      { label: 'Planned end',  value: formatDate(bookingSummary.scheduled_end_time) },
                    ].map(({ label, value, mono }) => (
                      <div key={label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                        <span style={{ fontSize: 13, color: '#7A756A', whiteSpace: 'nowrap' }}>{label}</span>
                        <span style={{ fontSize: 13, fontWeight: 600, color: '#2A2722', fontFamily: mono ? "'JetBrains Mono',monospace" : 'inherit', textAlign: 'right' }}>{value}</span>
                      </div>
                    ))}
                  </div>
                </Card>

                <Card>
                  <CardTitle>Statement</CardTitle>
                  <p style={{ margin: '-10px 0 14px', fontSize: 12.5, color: '#9A9488' }}>Download the client billing statement.</p>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                    {[
                      { label: '7 days',   fn: () => { const t = new Date(); setStatementStartDate(toDateInput(addDays(t,-7))); setStatementEndDate(toDateInput(t)); } },
                      { label: '30 days',  fn: () => { const t = new Date(); setStatementStartDate(toDateInput(addDays(t,-30))); setStatementEndDate(toDateInput(t)); } },
                      { label: 'All time', fn: () => { setStatementStartDate('2000-01-01'); setStatementEndDate(toDateInput(new Date())); } },
                    ].map(({ label, fn }) => (
                      <button key={label} onClick={fn} style={{ flex: 1, fontSize: 12, fontWeight: 600, border: '1px solid #E7E1D6', borderRadius: 8, padding: '8px 0', color: '#5A554B', background: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>{label}</button>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                    <input type="date" value={statementStartDate} onChange={e => setStatementStartDate(e.target.value)} style={{ ...inp, flex: 1 }} />
                    <input type="date" value={statementEndDate} onChange={e => setStatementEndDate(e.target.value)} style={{ ...inp, flex: 1 }} />
                  </div>
                  <button onClick={downloadStatement} disabled={statementLoading || !statementClientId} style={{ width: '100%', background: statementLoading || !statementClientId ? '#d1d5db' : '#1e293b', border: 'none', borderRadius: 8, padding: '11px 12px', fontFamily: 'inherit', fontSize: 13.5, fontWeight: 700, color: '#fff', cursor: statementLoading || !statementClientId ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                    {statementLoading ? <Loader2 style={{ width: 16, height: 16, animation: 'spin 1s linear infinite' }} /> : <Download style={{ width: 16, height: 16 }} />}
                    Download statement PDF
                  </button>

                  {/* ── Transaction preview ── */}
                  <div style={{ marginTop: 18 }}>
                    <div style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: '#9ca3af', marginBottom: 8 }}>Preview</div>
                    {statementPreviewLoading ? (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px 0', gap: 8, color: '#9ca3af', fontSize: 13 }}>
                        <Loader2 style={{ width: 14, height: 14, animation: 'spin 1s linear infinite' }} /> Loading…
                      </div>
                    ) : !statementPreview ? (
                      <div style={{ textAlign: 'center', padding: '20px 0', fontSize: 12.5, color: '#9ca3af' }}>No data</div>
                    ) : (
                      <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden' }}>
                        {/* Summary strip */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', background: '#f9fafb', borderBottom: '1px solid #e5e7eb', padding: '10px 14px', gap: 8 }}>
                          {[
                            { label: 'Invoiced', value: statementPreview.account_summary?.invoiced_amount },
                            { label: 'Paid', value: statementPreview.account_summary?.amount_paid },
                            { label: 'Balance', value: statementPreview.account_summary?.balance_due },
                          ].map(({ label, value }) => {
                            const n = parseFloat(value || 0);
                            const isBalance = label === 'Balance';
                            const color = isBalance ? (n > 0 ? '#dc2626' : '#16a34a') : '#111827';
                            return (
                              <div key={label}>
                                <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '.05em', textTransform: 'uppercase', color: '#9ca3af', marginBottom: 2 }}>{label}</div>
                                <div style={{ fontSize: 13, fontWeight: 700, color, fontFamily: "'JetBrains Mono',monospace" }}>Rs.{Math.abs(n).toLocaleString()}</div>
                              </div>
                            );
                          })}
                        </div>
                        {/* Ledger table */}
                        {statementPreview.ledger?.length === 0 ? (
                          <div style={{ textAlign: 'center', padding: '16px 0', fontSize: 12.5, color: '#9ca3af' }}>No transactions in this period.</div>
                        ) : (
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                            <thead>
                              <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                                {['Date', 'Description', 'Invoiced', 'Paid', 'Balance'].map(h => (
                                  <th key={h} style={{ padding: '5px 8px', textAlign: h === 'Date' || h === 'Description' ? 'left' : 'right', fontSize: 9.5, fontWeight: 600, letterSpacing: '.05em', textTransform: 'uppercase', color: '#9ca3af' }}>{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {statementPreview.ledger.map((row, i) => {
                                const isInvoice = row.row_type === 'INVOICE';
                                return (
                                  <tr key={row.transaction_id} style={{ borderTop: i > 0 ? '1px solid #f3f4f6' : 'none' }}>
                                    <td style={{ padding: '5px 8px', color: '#6b7280', whiteSpace: 'nowrap', fontSize: 11 }}>
                                      {new Date(row.date).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                                    </td>
                                    <td style={{ padding: '5px 8px', color: '#374151', maxWidth: 130 }}>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                        <span style={{ width: 5, height: 5, borderRadius: '50%', flexShrink: 0, background: isInvoice ? '#f59e0b' : '#22c55e' }} />
                                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 11 }}>{row.details || row.transactions || '—'}</span>
                                      </div>
                                    </td>
                                    <td style={{ padding: '5px 8px', textAlign: 'right', fontFamily: "'JetBrains Mono',monospace", fontSize: 10.5, color: isInvoice ? '#b45309' : '#9ca3af' }}>
                                      {isInvoice ? `Rs.${parseFloat(row.amount_invoiced).toLocaleString()}` : '—'}
                                    </td>
                                    <td style={{ padding: '5px 8px', textAlign: 'right', fontFamily: "'JetBrains Mono',monospace", fontSize: 10.5, color: !isInvoice ? '#16a34a' : '#9ca3af' }}>
                                      {!isInvoice ? `Rs.${parseFloat(row.amount_paid).toLocaleString()}` : '—'}
                                    </td>
                                    <td style={{ padding: '5px 8px', textAlign: 'right', fontFamily: "'JetBrains Mono',monospace", fontSize: 10.5, fontWeight: 600, color: parseFloat(row.balance) > 0 ? '#dc2626' : '#16a34a' }}>
                                      Rs.{Math.abs(parseFloat(row.balance)).toLocaleString()}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        )}
                      </div>
                    )}
                  </div>
                </Card>
              </div>

              {/* Close-out / terminated info */}
              {isTerminated ? (
                <Card>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px 16px', textAlign: 'center' }}>
                    <XCircle style={{ width: 32, height: 32, color: '#F5C9C5', marginBottom: 12 }} />
                    <p style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 700, color: '#2A2722' }}>Booking terminated</p>
                    <p style={{ margin: 0, fontSize: 13, color: '#9A9488' }}>Terminated on {formatDate(bookingSummary.actual_end_time || bookingSummary.updated_at)}</p>
                  </div>
                </Card>
              ) : scheduledFinalization ? (
                <Card>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px 16px', textAlign: 'center' }}>
                    <AlertTriangle style={{ width: 32, height: 32, color: scheduledTermination ? '#F5C9C5' : '#A8D9BE', marginBottom: 12 }} />
                    <p style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 700, color: '#2A2722' }}>
                      {scheduledTermination ? 'Termination' : 'Completion'} scheduled for {formatDate(scheduledFinalization.effective_date)}
                    </p>
                    <p style={{ margin: 0, fontSize: 13, color: '#9A9488' }}>The booking stays active and billed until then.</p>
                  </div>
                </Card>
              ) : (
                <Card>
                  <CardTitle>Close out booking</CardTitle>
                  <p style={{ margin: '-10px 0 18px', fontSize: 12.5, color: '#9A9488' }}>Complete or terminate with a settlement decision.</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div>
                      <label style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: '#7A756A', marginBottom: 5 }}>Actual end time</label>
                      <input type="datetime-local" value={actualEndTime} onChange={e => setActualEndTime(e.target.value)} style={inp} />
                      {actualEndTime && actualEndTime.slice(0, 10) > toDateInput(new Date()) && (
                        <p style={{ margin: '6px 0 0', fontSize: 11.5, color: '#B8893D' }}>
                          Future date — this will be scheduled. The booking stays active and billed until then, then completes/terminates automatically.
                        </p>
                      )}
                    </div>
                    {projectedRemainingBalance > 0 && (
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                          <label style={{ fontSize: 11.5, fontWeight: 600, color: '#7A756A' }}>Outstanding balance</label>
                          {overdueAmount > 0 && <span style={{ fontSize: 11.5, fontWeight: 600, color: '#BC4338', background: '#F7E6E3', borderRadius: 8, padding: '3px 10px' }}>{formatMoney(overdueAmount)} due</span>}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {[
                            { value: 'WALLET_DEPOSIT', title: 'Collect to wallet',        desc: 'Record the shortfall against the client wallet for follow-up.' },
                            { value: 'NO_REFUND',      title: 'Write off · no recovery', desc: 'Close the balance with a note explaining the decision.' },
                          ].map(({ value, title, desc }) => (
                            <div key={value} onClick={() => setSettlementAction(value)} style={{ cursor: 'pointer', borderRadius: 12, padding: '12px 14px', border: settlementAction === value ? '1.5px solid #137A6B' : '1px solid #E7E1D6', background: settlementAction === value ? '#E4F1ED' : '#FCFBF8', transition: 'all .15s' }}>
                              <div style={{ fontSize: 13.5, fontWeight: 700, color: '#2A2722' }}>{title}</div>
                              <div style={{ fontSize: 12, color: '#7A756A', marginTop: 3 }}>{desc}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    <div>
                      <label style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: '#7A756A', marginBottom: 5 }}>Settlement note</label>
                      <textarea rows={3} placeholder="Explain the settlement decision…" value={settlementNote} onChange={e => setSettlementNote(e.target.value)} style={{ ...inp, resize: 'none' }} />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: '#7A756A', marginBottom: 5 }}>Reason (optional)</label>
                      <textarea rows={2} placeholder="Optional admin note" value={reason} onChange={e => setReason(e.target.value)} style={{ ...inp, resize: 'none' }} />
                    </div>
                    <div style={{ display: 'flex', gap: 10 }}>
                      <button onClick={() => { setActionsModalMode('complete'); openActionsModal(); }} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, background: '#1e293b', border: 'none', borderRadius: 8, padding: '11px 12px', fontFamily: 'inherit', fontSize: 13.5, fontWeight: 700, color: '#fff', cursor: 'pointer' }}>
                        <CheckCircle style={{ width: 15, height: 15 }} /> Complete booking
                      </button>
                      <button onClick={() => { setActionsModalMode('terminate'); openActionsModal(); }} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, background: '#fff', border: '1px solid #fca5a5', borderRadius: 8, padding: '11px 12px', fontFamily: 'inherit', fontSize: 13.5, fontWeight: 700, color: '#dc2626', cursor: 'pointer' }}>
                        <XCircle style={{ width: 15, height: 15 }} /> Terminate
                      </button>
                    </div>
                  </div>
                </Card>
              )}
            </div>
          )}

          {/* ══════════════════════════════════════════════════════
              TAB: TERMINATION
          ══════════════════════════════════════════════════════ */}
          {activeSection === 'termination' && (
            <Card>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                <div style={{ background: '#F7E6E3', borderRadius: '50%', padding: 8 }}><AlertTriangle style={{ width: 16, height: 16, color: '#BC4338' }} /></div>
                <h3 style={{ margin: 0, fontSize: 15.5, fontWeight: 700 }}>Termination requests</h3>
              </div>
              {terminationReqs.length === 0 ? <Empty icon={AlertTriangle} text="No termination requests recorded for this booking." /> : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
                  {terminationReqs.map((req, i) => (
                    <div key={req.termination_id || i} style={{ background: '#FBF9F4', border: '1px solid #EFEAE0', borderRadius: 13, padding: '15px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
                        <div>
                          <p style={{ margin: '0 0 2px', fontWeight: 700, fontSize: 13.5, color: '#2A2722' }}>{req.requested_by_name || req.requested_by || 'Termination request'}</p>
                          <p style={{ margin: 0, fontSize: 12, color: '#A39D91' }}>Requested {formatDT(req.requested_at || req.created_at)}</p>
                        </div>
                        <Pill tone={req.status === 'APPROVED' ? 'green' : req.status === 'REJECTED' ? 'rose' : 'amber'}>{req.status || 'Pending'}</Pill>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 13, marginBottom: 10 }}>
                        <Field label="Requested end" value={formatDT(req.requested_end_time || req.requested_end_date)} />
                        <Field label="Approved end"  value={formatDT(req.end_time || req.approved_end_time)} />
                      </div>
                      <p style={{ margin: 0, fontSize: 13, color: '#5A554B' }}>{req.reason || req.request_reason || 'No reason provided.'}</p>
                      {req.status === 'REJECTED' && req.rejection_reason && (
                        <p style={{ margin: '8px 0 0', fontSize: 12.5, color: '#BC4338', background: '#F7E6E3', borderRadius: 8, padding: '8px 10px' }}>
                          Rejected: {req.rejection_reason}
                        </p>
                      )}
                      {(req.status === 'PENDING' || !req.status) && (
                        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                          <button
                            onClick={() => openApproveTermModal(req)}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#137A6B', border: 'none', borderRadius: 8, padding: '7px 14px', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 700, color: '#fff', cursor: 'pointer' }}
                          >
                            <CheckCircle style={{ width: 13, height: 13 }} /> Approve
                          </button>
                          <button
                            onClick={() => openRejectTermModal(req)}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#fff', border: '1px solid #F5C9C5', borderRadius: 8, padding: '7px 14px', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 700, color: '#BC4338', cursor: 'pointer' }}
                          >
                            <XCircle style={{ width: 13, height: 13 }} /> Reject
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}

        </div>
      </div>

      {/* ══════════════════════════════════════════════════════
          ACTIONS MODAL
      ══════════════════════════════════════════════════════ */}
      {showActionsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg flex flex-col max-h-[90vh]">
            <div className="flex items-start justify-between p-6 border-b border-[#ECE7DF] shrink-0">
              <div>
                <h2 className="text-lg font-bold text-[#2A2722]">Close Out Booking</h2>
                <p className="text-sm text-[#9A9488] mt-0.5">
                  {actionsModalStep === 1 ? 'Choose how to close this booking' : actionsModalStep === 2 ? 'Decide what to do with the remaining balance' : 'Review and confirm — this action is irreversible'}
                </p>
              </div>
              <button onClick={closeActionsModal} className="p-1.5 rounded-lg hover:bg-[#F6F3EC] transition ml-4 shrink-0"><XCircle className="h-5 w-5 text-[#A39D91]" /></button>
            </div>
            {(() => {
              const total = projectedRemainingBalance > 0 ? 3 : 2;
              const current = actionsModalStep === 3 ? total : actionsModalStep;
              return (
                <div className="flex items-center gap-2 px-6 pt-4 shrink-0">
                  {Array.from({ length: total }, (_, i) => i + 1).map(s => (
                    <div key={s} className={`h-1.5 flex-1 rounded-full transition-all ${s <= current ? 'bg-gray-800' : 'bg-gray-200'}`} />
                  ))}
                  <span className="text-xs text-[#9A9488] ml-1 shrink-0">Step {current} of {total}</span>
                </div>
              );
            })()}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {actionsModalStep === 1 && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { mode: 'complete', icon: CheckCircle, label: 'Complete', desc: 'Service finished as planned', activeBorder: 'border-gray-700 bg-gray-50', activeIcon: 'text-gray-800' },
                      { mode: 'terminate', icon: XCircle, label: 'Terminate', desc: 'End early before service concludes', activeBorder: 'border-red-400 bg-red-50', activeIcon: 'text-red-600' },
                    ].map(({ mode, icon: Icon, label, desc, activeBorder, activeIcon }) => (
                      <div key={mode} onClick={() => setActionsModalMode(mode)} className={`cursor-pointer rounded-xl p-4 border-2 transition ${actionsModalMode === mode ? activeBorder : 'border-[#E7E1D6] hover:border-slate-300'}`}>
                        <Icon className={`h-5 w-5 mb-2 ${actionsModalMode === mode ? activeIcon : 'text-[#C4BFB5]'}`} />
                        <div className="text-sm font-bold text-[#2A2722]">{label}</div>
                        <div className="text-xs text-[#7A756A] mt-0.5">{desc}</div>
                      </div>
                    ))}
                  </div>
                  {actionsModalMode && (
                    <>
                      <div>
                        <label className="block text-xs font-semibold text-[#7A756A] mb-1.5">Actual end date & time</label>
                        <input type="datetime-local" value={actualEndTime} onChange={e => setActualEndTime(e.target.value)} className="w-full border border-[#E2DCD0] rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#137A6B] bg-[#FCFBF8] text-[#6F6A60]" />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-[#7A756A] mb-1.5">Reason <span className="text-[#C4BFB5] font-normal">(optional)</span></label>
                        <textarea rows={3} value={reason} onChange={e => setReason(e.target.value)} placeholder={actionsModalMode === 'complete' ? 'e.g. Service completed as per contract' : 'e.g. Client requested early termination'} className="w-full border border-[#E2DCD0] rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#137A6B] bg-[#FCFBF8] resize-none" />
                      </div>
                    </>
                  )}
                </>
              )}
              {actionsModalStep === 2 && (
                <>
                  <div className="rounded-xl border border-[#ECE7DF] bg-[#FBF9F4] p-4">
                    <div className="text-xs font-semibold uppercase tracking-wider text-[#9A9488] mb-1">
                      {actionsTargetDate > toDateInput(new Date()) ? 'Projected balance on end date' : 'Remaining balance'}
                    </div>
                    <div className="text-2xl font-extrabold text-[#2A2722] tracking-tight">{formatMoney(projectedRemainingBalance)}</div>
                  </div>
                  <div className="flex flex-col gap-2.5">
                    {[
                      { value: 'WALLET_DEPOSIT', icon: Wallet,     label: 'Credit to client wallet', desc: `Add ${formatMoney(projectedRemainingBalance)} to the client's wallet.`,              activeCls: 'border-violet-400 bg-violet-50',  activeIcon: 'text-violet-600' },
                      { value: 'BANK_REFUND',    icon: DollarSign, label: 'Process bank refund',     desc: `Return ${formatMoney(projectedRemainingBalance)} to the client's bank account.`,   activeCls: 'border-blue-400 bg-blue-50',      activeIcon: 'text-blue-600' },
                      { value: 'NO_REFUND',      icon: XCircle,    label: 'Write off · no refund',   desc: 'Forfeit the remaining balance. A written explanation is required.',          activeCls: 'border-[#BC4338] bg-rose-50',     activeIcon: 'text-[#BC4338]' },
                    ].map(({ value, icon: Icon, label, desc, activeCls, activeIcon }) => (
                      <div key={value} onClick={() => { setSettlementAction(value); setActionsModalError(''); }} className={`cursor-pointer rounded-xl p-4 border-2 transition flex items-start gap-3 ${settlementAction === value ? activeCls : 'border-[#E7E1D6] hover:border-slate-300'}`}>
                        <Icon className={`h-5 w-5 mt-0.5 flex-shrink-0 ${settlementAction === value ? activeIcon : 'text-[#C4BFB5]'}`} />
                        <div><div className="text-sm font-bold text-[#2A2722]">{label}</div><div className="text-xs text-[#7A756A] mt-0.5">{desc}</div></div>
                      </div>
                    ))}
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#7A756A] mb-1.5">Settlement note {settlementAction === 'NO_REFUND' ? <span className="text-[#BC4338] ml-1">*</span> : <span className="text-[#C4BFB5] font-normal ml-1">(optional)</span>}</label>
                    <textarea rows={3} value={settlementNote} onChange={e => { setSettlementNote(e.target.value); setActionsModalError(''); }} placeholder={settlementAction === 'NO_REFUND' ? 'Required — explain why no refund is being issued' : 'Any notes about this settlement…'} className={`w-full border rounded-xl px-3 py-2.5 text-sm outline-none bg-[#FCFBF8] resize-none ${actionsModalError ? 'border-rose-300' : 'border-[#E2DCD0] focus:border-[#137A6B]'}`} />
                  </div>
                  {actionsModalError && <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{actionsModalError}</div>}
                </>
              )}
              {actionsModalStep === 3 && (
                <>
                  <div className="rounded-xl bg-amber-50 border border-amber-200 p-4">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
                      <div>
                        <div className="text-sm font-bold text-amber-900">This action is irreversible</div>
                        <div className="text-xs text-amber-700 mt-1">Once confirmed, this booking will be permanently {actionsModalMode === 'complete' ? 'marked as completed' : 'terminated'}.</div>
                      </div>
                    </div>
                  </div>
                  <div className="rounded-xl border border-[#ECE7DF] bg-[#FBF9F4] p-4">
                    <div className="text-xs font-bold uppercase tracking-wider text-[#9A9488] mb-3">Summary</div>
                    <div className="flex flex-col gap-2.5">
                      {[
                        { label: 'Action', value: actionsModalMode === 'complete' ? 'Complete booking' : 'Terminate booking', colored: actionsModalMode === 'complete' ? '#137A6B' : '#BC4338' },
                        { label: 'Booking', value: bookingSummary.booking_code || bookingId, mono: true },
                        { label: 'End time', value: formatDT(actualEndTime) },
                        ...(projectedRemainingBalance > 0 ? [
                          { label: actionsTargetDate > toDateInput(new Date()) ? 'Projected balance on end date' : 'Remaining balance', value: formatMoney(projectedRemainingBalance) },
                          { label: 'Settlement', value: settlementAction === 'WALLET_DEPOSIT' ? 'Credit to wallet' : settlementAction === 'BANK_REFUND' ? 'Bank refund' : 'Write off (no refund)' },
                        ] : []),
                        ...(reason.trim() ? [{ label: 'Reason', value: reason.trim() }] : []),
                      ].map(({ label, value, mono, colored }) => (
                        <div key={label} className="flex items-center justify-between gap-4">
                          <span className="text-sm text-[#6F6A60]">{label}</span>
                          <span className={`text-sm font-semibold ${mono ? 'font-mono' : ''}`} style={{ color: colored || '#2A2722' }}>{value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  {actionsModalError && <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{actionsModalError}</div>}
                </>
              )}
            </div>
            <div className="flex items-center justify-between px-6 py-4 border-t border-[#ECE7DF] shrink-0">
              <button onClick={actionsModalStep === 1 ? closeActionsModal : handleActionsBack} disabled={actionsModalLoading} className="text-sm font-semibold text-[#7A756A] hover:text-[#2A2722] transition disabled:opacity-40">
                {actionsModalStep === 1 ? 'Cancel' : '← Back'}
              </button>
              {actionsModalStep < 3 ? (
                <button onClick={handleActionsNext} disabled={actionsModalStep === 1 && !actionsModalMode} className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-bold text-white bg-gray-800 hover:bg-gray-900 rounded-xl transition disabled:opacity-40 disabled:cursor-not-allowed">
                  Continue →
                </button>
              ) : (
                <button onClick={handleActionsSubmit} disabled={actionsModalLoading} className={`inline-flex items-center gap-2 px-5 py-2.5 text-sm font-bold text-white rounded-xl transition disabled:opacity-60 ${actionsModalMode === 'complete' ? 'bg-gray-800 hover:bg-gray-900' : 'bg-red-600 hover:bg-red-700'}`}>
                  {actionsModalLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : actionsModalMode === 'complete' ? <CheckCircle className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                  {actionsModalLoading ? 'Processing…' : `Confirm ${actionsModalMode === 'complete' ? 'Complete' : 'Terminate'}`}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          SWAP MODAL
      ══════════════════════════════════════════════════════ */}
      {showSwapModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col">
            <div className="flex items-start justify-between p-6 border-b border-slate-200 shrink-0">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  {swapModalSlotId ? (() => { const slot = shiftSlots.find(s => s.shift_slot_id === swapModalSlotId); return `${swapModalIsAssign ? 'Assign Staff' : 'Reassign Staff'} — ${slot?.label || (slot?.shift_number ? `Shift ${slot.shift_number}` : 'Shift')}`; })() : 'Swap Staff Member'}
                </h2>
                <p className="text-sm text-slate-500 mt-0.5">
                  {swapModalStep === 1
                    ? 'Select a replacement from available staff'
                    : swapModalSlotId
                      ? (swapModalIsAssign ? `Assign ${swapModalSelectedStaff?.full_name} to this shift` : `Confirm: current staff → ${swapModalSelectedStaff?.full_name}`)
                      : `Confirm: ${normCurrentStaff?.name || 'Current staff'} → ${swapModalSelectedStaff?.full_name}`}
                </p>
              </div>
              <button onClick={closeSwapModal} className="p-1.5 rounded-lg hover:bg-slate-100 transition shrink-0 ml-4"><XCircle className="h-5 w-5 text-slate-400" /></button>
            </div>

            {swapModalStep === 1 && (() => {
              const PAGE_SIZE = 4;
              const designations = [...new Set(availableStaff.map(s => s.designation).filter(Boolean))].sort();
              const q = swapModalSearch.toLowerCase();
              const filtered = availableStaff.filter(s =>
                (!q || s.full_name?.toLowerCase().includes(q) || s.designation?.toLowerCase().includes(q) || s.mobile_number?.includes(q)) &&
                (!swapModalDesignation || s.designation === swapModalDesignation)
              );
              const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
              const paginated = filtered.slice((swapModalPage - 1) * PAGE_SIZE, swapModalPage * PAGE_SIZE);
              return (
                <>
                  <div className="px-6 py-3 border-b border-slate-100 shrink-0 space-y-2">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                      <input type="text" autoFocus placeholder="Search by name, designation, or phone..." value={swapModalSearch} onChange={e => { setSwapModalSearch(e.target.value); setSwapModalPage(1); }} className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
                    </div>
                    {designations.length > 0 && (
                      <div className="flex items-center gap-2 flex-wrap">
                        <button onClick={() => { setSwapModalDesignation(''); setSwapModalPage(1); }} className={`px-3 py-1 rounded-full text-xs font-medium transition ${!swapModalDesignation ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>All</button>
                        {designations.map(d => <button key={d} onClick={() => { setSwapModalDesignation(swapModalDesignation === d ? '' : d); setSwapModalPage(1); }} className={`px-3 py-1 rounded-full text-xs font-medium transition ${swapModalDesignation === d ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{d}</button>)}
                      </div>
                    )}
                  </div>
                  <div className="flex-1 overflow-y-auto p-4 space-y-2">
                    {availableStaff.length === 0 ? <Empty icon={Users} text="No available staff found." /> : filtered.length === 0 ? <Empty icon={Users} text="No staff match your filters." /> : (
                      paginated.map(s => (
                        <div key={s.staff_profile_id} className="p-4 rounded-xl border border-slate-200 hover:border-blue-200 hover:bg-blue-50/30 transition">
                          <div className="flex items-center justify-between gap-4">
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center shrink-0 overflow-hidden">
                                {s.profile_picture_url ? <img src={s.profile_picture_url} alt={s.full_name} className="w-10 h-10 object-cover" /> : <User className="w-5 h-5 text-slate-400" />}
                              </div>
                              <div className="min-w-0">
                                <p className="text-sm font-semibold text-slate-900 truncate">{s.full_name}</p>
                                {s.designation && <p className="text-xs text-slate-500">{s.designation}</p>}
                                {s.mobile_number && <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5"><Phone className="w-3 h-3" /> {s.mobile_number}</p>}
                              </div>
                            </div>
                            <div className="flex items-center gap-3 shrink-0">
                              <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/20"><CheckCircle className="w-3 h-3" /> Available</span>
                              <button onClick={() => selectSwapStaff(s)} className="px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition">Select</button>
                            </div>
                          </div>
                          <div className="mt-2.5 pl-[52px]">
                            <StaffScheduleTimeline
                              schedule={staffSchedules[s.staff_profile_id] || []}
                              loading={staffSchedulesLoading}
                              referenceDate={swapModalStartDate}
                              compact
                            />
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                  {filtered.length > PAGE_SIZE && (
                    <div className="flex items-center justify-between px-6 py-3 border-t border-slate-100 shrink-0">
                      <button onClick={() => setSwapModalPage(p => Math.max(1, p - 1))} disabled={swapModalPage === 1} className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition">← Previous</button>
                      <span className="text-xs text-slate-500">Page {swapModalPage} of {totalPages} · {filtered.length} staff</span>
                      <button onClick={() => setSwapModalPage(p => Math.min(totalPages, p + 1))} disabled={swapModalPage === totalPages} className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition">Next →</button>
                    </div>
                  )}
                </>
              );
            })()}

            {swapModalStep === 2 && swapModalSelectedStaff && (
              <>
                <div className="flex-1 overflow-y-auto p-6 space-y-5">
                  <div className={`grid ${swapModalIsAssign ? 'grid-cols-1' : 'grid-cols-3'} gap-3 items-center`}>
                    {!swapModalIsAssign && (
                      <>
                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-center">
                          <p className="text-xs text-slate-500 mb-2 font-medium uppercase tracking-wide">Current</p>
                          <div className="w-12 h-12 rounded-full bg-rose-100 flex items-center justify-center mx-auto mb-2"><User className="w-6 h-6 text-rose-400" /></div>
                          <p className="text-sm font-semibold text-slate-900 truncate">{swapModalSlotId ? (shiftSlots.find(s => s.shift_slot_id === swapModalSlotId)?.assignment?.staff_name || '-') : (normCurrentStaff?.name || '-')}</p>
                        </div>
                        <div className="flex items-center justify-center"><Repeat2 className="w-7 h-7 text-slate-300" /></div>
                      </>
                    )}
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-center">
                      <p className="text-xs text-emerald-600 mb-2 font-medium uppercase tracking-wide">New Staff</p>
                      <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-2 overflow-hidden">
                        {swapModalSelectedStaff.profile_picture_url ? <img src={swapModalSelectedStaff.profile_picture_url} alt={swapModalSelectedStaff.full_name} className="w-12 h-12 object-cover" /> : <User className="w-6 h-6 text-emerald-600" />}
                      </div>
                      <p className="text-sm font-semibold text-slate-900 truncate">{swapModalSelectedStaff.full_name}</p>
                      {swapModalSelectedStaff.mobile_number && <p className="text-xs text-slate-500 mt-0.5">{swapModalSelectedStaff.mobile_number}</p>}
                    </div>
                  </div>
                  <div className="rounded-xl border border-slate-200 p-3.5">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">{swapModalSelectedStaff.full_name}'s schedule</p>
                    <StaffScheduleTimeline
                      schedule={staffSchedules[swapModalSelectedStaff.staff_profile_id] || []}
                      loading={staffSchedulesLoading}
                      referenceDate={swapModalStartDate}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">{swapModalIsAssign ? 'Service start date' : 'New staff start date'} <span className="text-rose-500">*</span></label>
                    <input type="date" value={swapModalStartDate} onChange={e => setSwapModalStartDate(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
                    {swapModalStartDate > toDateInput(new Date()) && (
                      <p className="text-xs text-amber-600 mt-1.5">
                        Future date — this will be scheduled and take effect automatically on that date.
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">{swapModalIsAssign ? 'Notes (optional)' : 'Reason for swap'} {!swapModalIsAssign && <span className="text-rose-500">*</span>}</label>
                    <textarea rows={3} value={swapModalReason} onChange={e => setSwapModalReason(e.target.value)} placeholder="e.g. Staff requested leave, client preference…" className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
                  </div>
                  <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800">After confirming, WhatsApp and SMS notifications will be sent to the relevant staff and the client.</div>
                  {swapModalError && <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-sm text-rose-700">{swapModalError}</div>}
                </div>
                <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 shrink-0">
                  <button onClick={() => setSwapModalStep(1)} className="text-sm font-medium text-slate-600 hover:text-slate-900 transition">← Back</button>
                  <button onClick={confirmSwap} disabled={swapModalSubmitting || (!swapModalIsAssign && !swapModalReason.trim()) || !swapModalStartDate} className="inline-flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-gray-800 hover:bg-gray-900 rounded-lg transition disabled:opacity-60 disabled:cursor-not-allowed">
                    {swapModalSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Repeat2 className="h-4 w-4" />}
                    {swapModalSubmitting ? 'Saving…' : swapModalIsAssign ? 'Confirm Assignment' : 'Confirm Swap'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          SHIFT PATTERN MODAL
      ══════════════════════════════════════════════════════ */}
      {showPatternModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col">
            <div className="flex items-start justify-between p-6 border-b border-slate-200 shrink-0">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Change Shift Pattern</h2>
                <p className="text-sm text-slate-500 mt-0.5">Existing attendance/invoices stay pinned to the pattern active when they were recorded.</p>
              </div>
              <button onClick={closePatternModal} className="p-1.5 rounded-lg hover:bg-slate-100 transition shrink-0 ml-4"><XCircle className="h-5 w-5 text-slate-400" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              {shiftPattern?.active && (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-2">Current pattern &amp; staff</p>
                  <div className="flex flex-wrap gap-2">
                    {(shiftPattern.active.slots || []).map(s => {
                      const slot = shiftSlots.find(ss => ss.shift_number === s.shift_number);
                      return (
                        <span key={s.shift_slot_id} className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-full px-3 py-1.5">
                          {s.label || `Shift ${s.shift_number}`} · {(s.start_time || '').slice(0, 5)} ({s.duration_hours}h)
                          <span className="text-slate-300">—</span>
                          <span className={slot?.assignment ? 'font-semibold text-slate-900' : 'italic text-slate-400'}>
                            {slot?.assignment?.staff_name || 'Unassigned'}
                          </span>
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Number of shifts per day</label>
                <input type="number" min="1" max="6" value={patternModalShiftCount} onChange={e => handlePatternShiftCountChange(Math.max(1, parseInt(e.target.value) || 1))} className="w-32 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
                <p className="text-xs text-slate-400 mt-1.5">Adding shifts creates new, unassigned slots below — assign staff to them just like any other shift.</p>
              </div>
              <div className="space-y-3">
                {patternModalSlots.map((s, idx) => {
                  const currentAssignment = shiftSlots.find(ss => ss.shift_number === s.shift_number)?.assignment;
                  return (
                    <div key={idx} className="rounded-xl border border-slate-200 p-3.5 space-y-3">
                      <div className="grid grid-cols-12 gap-2 items-end">
                        <div className="col-span-2 text-xs font-semibold text-slate-500 pb-2.5">Shift {s.shift_number}</div>
                        <div className="col-span-3">
                          <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
                            Start time {idx > 0 && <span className="normal-case font-normal text-blue-400 tracking-normal">(auto)</span>}
                          </label>
                          <input type="time" value={s.start_time} onChange={e => updatePatternSlot(idx, 'start_time', e.target.value)} className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-blue-500" />
                        </div>
                        <div className="col-span-3">
                          <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">Duration (h)</label>
                          <input type="number" min="0.5" step="0.5" value={s.duration_hours} onChange={e => updatePatternSlot(idx, 'duration_hours', e.target.value)} className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-blue-500" />
                        </div>
                        <div className="col-span-4">
                          <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">Label</label>
                          <input type="text" value={s.label} onChange={e => updatePatternSlot(idx, 'label', e.target.value)} className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-blue-500" />
                        </div>
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
                          Staff member
                          {currentAssignment && (
                            <span className="normal-case font-normal text-slate-400"> · currently {currentAssignment.staff_name}</span>
                          )}
                        </label>
                        <select value={s.staff_profile_id} onChange={e => updatePatternSlot(idx, 'staff_profile_id', e.target.value)} className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-blue-500">
                          <option value="">— Unassigned (assign later) —</option>
                          {patternModalStaffOptions.map(st => (
                            <option key={st.staff_profile_id} value={st.staff_profile_id}>
                              {st.full_name}{st.designation ? ` — ${st.designation}` : ''}
                            </option>
                          ))}
                        </select>
                        {s.staff_profile_id && (
                          <div className="mt-1.5">
                            <StaffScheduleTimeline
                              schedule={staffSchedules[s.staff_profile_id] || []}
                              loading={staffSchedulesLoading}
                              referenceDate={patternModalEffectiveDate}
                              compact
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Effective from <span className="text-rose-500">*</span></label>
                <input type="date" value={patternModalEffectiveDate} onChange={e => setPatternModalEffectiveDate(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
                <p className="text-xs text-slate-400 mt-1.5">Used as both the pattern's effective date and each assigned staff member's shift start date.</p>
                {patternModalEffectiveDate > toDateInput(new Date()) && (
                  <p className="text-xs text-amber-600 mt-1.5">Future date — this pattern will be scheduled and take effect automatically on that date. The current pattern keeps running until then.</p>
                )}
              </div>
              {patternModalError && <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-sm text-rose-700">{patternModalError}</div>}
            </div>
            <div className="flex items-center justify-end px-6 py-4 border-t border-slate-200 shrink-0">
              <button onClick={submitPatternChange} disabled={patternModalSubmitting || !patternModalEffectiveDate} className="inline-flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-gray-800 hover:bg-gray-900 rounded-lg transition disabled:opacity-60 disabled:cursor-not-allowed">
                {patternModalSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {patternModalSubmitting ? 'Saving…' : 'Save Pattern'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          DAY DETAIL MODAL — attendance + manual invoicing
      ══════════════════════════════════════════════════════ */}
      {dayModal && (() => {
        const dateRecords = attendanceRecords.filter(r => r.service_date?.slice(0, 10) === dayModal.dateISO);
        const dateInvoiceRecords = dailyInvoiceRecords.filter(r => r.service_date?.slice(0, 10) === dayModal.dateISO);
        const invoiceRecord = dateInvoiceRecords.find(r => !r.shift_slot_id) || dateInvoiceRecords[0];
        const slotIds = [...new Set(dayModal.assignments.map(a => a.shift_slot_id).filter(Boolean))];
        const fmtTime = (ts) => ts ? new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—';
        const thCls = 'px-3 py-2 text-left text-[10.5px] font-semibold uppercase tracking-wider text-gray-400';
        const tdCls = 'px-3 py-3 text-sm text-gray-700 align-middle';

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[92vh] flex flex-col" style={{ border: '1px solid #e5e7eb' }}>

              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 shrink-0" style={{ borderBottom: '1px solid #e5e7eb' }}>
                <div>
                  <h2 className="text-base font-semibold text-gray-900">Day {dayModal.dayNum} &mdash; {formatDate(dayModal.dateISO)}</h2>
                  <p className="text-xs text-gray-400 mt-0.5">Log attendance and confirm daily charges</p>
                </div>
                <button onClick={closeDayModal} className="p-1.5 rounded-lg hover:bg-gray-100 transition ml-4">
                  <XCircle className="h-5 w-5 text-gray-400" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto">
                {dayModalError && (
                  <div className="mx-6 mt-4 rounded-lg bg-red-50 border border-red-200 px-4 py-2.5 text-xs text-red-700">{dayModalError}</div>
                )}

                {/* ── Staff Attendance Table ── */}
                {manualSalaryDay && (
                  <div className="px-6 pt-5 pb-2">
                    <p className="text-[10.5px] font-semibold uppercase tracking-widest text-gray-400 mb-3">Staff Attendance</p>
                    {dayModal.assignments.length === 0 ? (
                      <p className="text-sm text-gray-400 py-4 text-center">No staff assigned on this day.</p>
                    ) : (
                      <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden' }}>
                        <table className="w-full text-sm border-collapse">
                          <thead style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                            <tr>
                              <th className={thCls}>Staff</th>
                              <th className={thCls}>Date</th>
                              <th className={thCls}>In</th>
                              <th className={thCls}>Out</th>
                              <th className={thCls}>Hours</th>
                              <th className={thCls}>Action</th>
                            </tr>
                          </thead>
                          <tbody>
                            {dayModal.assignments.map((a, idx) => {
                              const record = dateRecords.find(r => r.assignment_id === a.assignment_id);
                              const staffName = a.full_name || a.staff_name || 'Staff';
                              const shiftLabel = a.shift_label || (a.shift_number ? `Shift ${a.shift_number}` : null);
                              const inputs = attendanceInputs[a.assignment_id] || { date: dayModal.dateISO, in_time: '', out_time: '' };
                              const rowBorder = idx > 0 ? { borderTop: '1px solid #f3f4f6' } : {};

                              if (record && record.salary_status !== 'PENDING') {
                                const paid = record.salary_status === 'PAID';
                                return (
                                  <tr key={a.assignment_id} style={rowBorder}>
                                    <td className={tdCls}>
                                      <span className="font-medium text-gray-900">{staffName}</span>
                                      {shiftLabel && <span className="ml-2 text-[10px] font-semibold bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">{shiftLabel}</span>}
                                    </td>
                                    <td className={tdCls + ' text-gray-500 text-xs'}>{record.service_date?.slice(0, 10)}</td>
                                    <td className={tdCls + ' tabular-nums'}>{fmtTime(record.in_time)}</td>
                                    <td className={tdCls + ' tabular-nums'}>{fmtTime(record.out_time)}</td>
                                    <td className={tdCls + ' tabular-nums'}>{record.hours_served}h</td>
                                    <td className={tdCls}>
                                      <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded ${paid ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                                        <span className={`w-1.5 h-1.5 rounded-full ${paid ? 'bg-green-500' : 'bg-gray-400'}`} />
                                        {paid ? `Paid Rs.${Number(record.salary_amount).toLocaleString()}` : 'Skipped'}
                                      </span>
                                    </td>
                                  </tr>
                                );
                              }

                              if (record && record.hours_served !== null) {
                                return (
                                  <tr key={a.assignment_id} style={rowBorder}>
                                    <td className={tdCls}>
                                      <span className="font-medium text-gray-900">{staffName}</span>
                                      {shiftLabel && <span className="ml-2 text-[10px] font-semibold bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">{shiftLabel}</span>}
                                    </td>
                                    <td className={tdCls + ' text-gray-500 text-xs'}>{record.service_date?.slice(0, 10)}</td>
                                    <td className={tdCls + ' tabular-nums'}>{fmtTime(record.in_time)}</td>
                                    <td className={tdCls + ' tabular-nums'}>{fmtTime(record.out_time)}</td>
                                    <td className={tdCls + ' tabular-nums'}>{record.hours_served}h</td>
                                    <td className={tdCls}>
                                      <div className="flex items-center gap-1.5">
                                        <input
                                          type="number" min="0" step="0.01"
                                          value={salaryAmountInputs[record.attendance_id] ?? (a.daily_rate ?? '')}
                                          onChange={e => setSalaryAmountInputs(p => ({ ...p, [record.attendance_id]: e.target.value }))}
                                          className="rounded border border-gray-200 px-2 py-1 text-xs outline-none focus:border-blue-500 w-24"
                                          placeholder="0.00"
                                        />
                                        <button onClick={() => decideSalary(record.attendance_id, true, a.daily_rate)} disabled={dayModalBusy === `salary-${record.attendance_id}`} className="px-2.5 py-1 text-[11px] font-semibold text-white bg-gray-800 hover:bg-gray-900 rounded transition disabled:opacity-50">Pay</button>
                                        <button onClick={() => decideSalary(record.attendance_id, false)} disabled={dayModalBusy === `salary-${record.attendance_id}`} className="px-2.5 py-1 text-[11px] font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 rounded transition disabled:opacity-50">Skip</button>
                                      </div>
                                    </td>
                                  </tr>
                                );
                              }

                              return (
                                <tr key={a.assignment_id} style={{ ...rowBorder, background: '#fafafa' }}>
                                  <td className={tdCls}>
                                    <span className="font-medium text-gray-900">{staffName}</span>
                                    {shiftLabel && <span className="ml-2 text-[10px] font-semibold bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">{shiftLabel}</span>}
                                  </td>
                                  <td className={tdCls}>
                                    <input type="date" value={inputs.date || dayModal.dateISO} onChange={e => setAttendanceInputs(p => ({ ...p, [a.assignment_id]: { ...inputs, date: e.target.value } }))} className="rounded border border-gray-200 px-2 py-1 text-xs outline-none focus:border-blue-500 w-32" />
                                  </td>
                                  <td className={tdCls}>
                                    <input type="time" value={inputs.in_time} onChange={e => setAttendanceInputs(p => ({ ...p, [a.assignment_id]: { ...inputs, in_time: e.target.value, autoFilled: false } }))} className="rounded border border-gray-200 px-2 py-1 text-xs outline-none focus:border-blue-500 w-24" />
                                    {inputs.autoFilled && inputs.in_time && <span className="block text-[10px] text-blue-400 mt-0.5">from schedule</span>}
                                  </td>
                                  <td className={tdCls}>
                                    <input type="time" value={inputs.out_time} onChange={e => setAttendanceInputs(p => ({ ...p, [a.assignment_id]: { ...inputs, out_time: e.target.value, autoFilled: false } }))} className="rounded border border-gray-200 px-2 py-1 text-xs outline-none focus:border-blue-500 w-24" />
                                    {inputs.autoFilled && inputs.out_time && <span className="block text-[10px] text-blue-400 mt-0.5">from schedule</span>}
                                  </td>
                                  <td className={tdCls + ' text-gray-300'}>—</td>
                                  <td className={tdCls}>
                                    <button onClick={() => saveAttendanceTimes(a)} disabled={dayModalBusy === `save-${a.assignment_id}`} className="px-3 py-1 text-[11px] font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded transition disabled:opacity-50">Save</button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}

                {/* ── Client Invoice Table ── */}
                {manualInvoiceDay && (
                  <div className="px-6 pt-5 pb-6">
                    <p className="text-[10.5px] font-semibold uppercase tracking-widest text-gray-400 mb-3">Client Invoice</p>
                    <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden' }}>
                      <table className="w-full text-sm border-collapse">
                        <thead style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                          <tr>
                            <th className={thCls}>{isShiftBased ? 'Shift' : 'Day'}</th>
                            <th className={thCls}>Amount (Rs.)</th>
                            <th className={thCls}>Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {isShiftBased && slotIds.length > 0 ? slotIds.map((slotId, idx) => {
                            const slotAssignment = dayModal.assignments.find(a => a.shift_slot_id === slotId);
                            const shiftLabel = slotAssignment?.shift_label || (slotAssignment?.shift_number ? `Shift ${slotAssignment.shift_number}` : 'Shift');
                            const slotInvoiceRecord = dateInvoiceRecords.find(r => r.shift_slot_id === slotId);
                            const busyKey = `invoice-${slotId}`;
                            const rowBorder = idx > 0 ? { borderTop: '1px solid #f3f4f6' } : {};
                            if (slotInvoiceRecord && slotInvoiceRecord.status !== 'PENDING') {
                              const invoiced = slotInvoiceRecord.status === 'INVOICED';
                              return (
                                <tr key={slotId} style={rowBorder}>
                                  <td className={tdCls + ' font-medium text-gray-900'}>{shiftLabel}</td>
                                  <td className={tdCls + ' tabular-nums'}>{invoiced ? `Rs.${Number(slotInvoiceRecord.amount).toLocaleString()}` : '—'}</td>
                                  <td className={tdCls}>
                                    <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded ${invoiced ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                                      <span className={`w-1.5 h-1.5 rounded-full ${invoiced ? 'bg-green-500' : 'bg-gray-400'}`} />
                                      {invoiced ? 'Invoiced' : 'Skipped'}
                                    </span>
                                  </td>
                                </tr>
                              );
                            }
                            return (
                              <tr key={slotId} style={{ ...rowBorder, background: '#fafafa' }}>
                                <td className={tdCls + ' font-medium text-gray-900'}>{shiftLabel}</td>
                                <td className={tdCls}>
                                  <input type="number" min="0" step="0.01" value={invoiceAmountInputsBySlot[slotId] || ''} onChange={e => setInvoiceAmountInputsBySlot(p => ({ ...p, [slotId]: e.target.value }))} className="rounded border border-gray-200 px-2 py-1 text-xs outline-none focus:border-blue-500 w-32" placeholder="0.00" />
                                </td>
                                <td className={tdCls}>
                                  <div className="flex gap-1.5">
                                    <button onClick={() => decideInvoice(true, slotId)} disabled={dayModalBusy === busyKey || !invoiceAmountInputsBySlot[slotId]} className="px-2.5 py-1 text-[11px] font-semibold text-white bg-gray-800 hover:bg-gray-900 rounded transition disabled:opacity-50">Confirm</button>
                                    <button onClick={() => decideInvoice(false, slotId)} disabled={dayModalBusy === busyKey} className="px-2.5 py-1 text-[11px] font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 rounded transition disabled:opacity-50">Skip</button>
                                  </div>
                                </td>
                              </tr>
                            );
                          }) : (
                            <tr>
                              <td className={tdCls + ' font-medium text-gray-900'}>Day {dayModal.dayNum}</td>
                              {invoiceRecord && invoiceRecord.status !== 'PENDING' ? (
                                <>
                                  <td className={tdCls + ' tabular-nums'}>{invoiceRecord.status === 'INVOICED' ? `Rs.${Number(invoiceRecord.amount).toLocaleString()}` : '—'}</td>
                                  <td className={tdCls}>
                                    <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded ${invoiceRecord.status === 'INVOICED' ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                                      <span className={`w-1.5 h-1.5 rounded-full ${invoiceRecord.status === 'INVOICED' ? 'bg-green-500' : 'bg-gray-400'}`} />
                                      {invoiceRecord.status === 'INVOICED' ? 'Invoiced' : 'Skipped'}
                                    </span>
                                  </td>
                                </>
                              ) : (
                                <>
                                  <td className={tdCls} style={{ background: '#fafafa' }}>
                                    <input type="number" min="0" step="0.01" value={invoiceAmountInput} onChange={e => setInvoiceAmountInput(e.target.value)} className="rounded border border-gray-200 px-2 py-1 text-xs outline-none focus:border-blue-500 w-32" placeholder="0.00" />
                                  </td>
                                  <td className={tdCls} style={{ background: '#fafafa' }}>
                                    <div className="flex gap-1.5">
                                      <button onClick={() => decideInvoice(true)} disabled={dayModalBusy === 'invoice' || !invoiceAmountInput} className="px-2.5 py-1 text-[11px] font-semibold text-white bg-gray-800 hover:bg-gray-900 rounded transition disabled:opacity-50">Confirm</button>
                                      <button onClick={() => decideInvoice(false)} disabled={dayModalBusy === 'invoice'} className="px-2.5 py-1 text-[11px] font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 rounded transition disabled:opacity-50">Skip</button>
                                    </div>
                                  </td>
                                </>
                              )}
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

              </div>
            </div>
          </div>
        );
      })()}

      {showReceiptSendPopup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-sm rounded-xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-green-100">
                  <MessageCircle className="h-4 w-4 text-green-600" />
                </div>
                <h3 className="text-sm font-semibold text-gray-900">Send Payment Receipt?</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowReceiptSendPopup(false)}
                className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="px-5 py-4">
              <p className="text-sm text-gray-600">
                Payment recorded. Would you like to send the receipt to the client via WhatsApp?
              </p>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-gray-100 px-5 py-3">
              <button
                type="button"
                onClick={() => setShowReceiptSendPopup(false)}
                className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
              >
                Skip for now
              </button>
              <button
                type="button"
                onClick={handleSendLatestReceipt}
                disabled={receiptSendBusy}
                className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-4 py-2 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-60"
              >
                {receiptSendBusy
                  ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Sending…</>
                  : <><SendHorizontal className="h-3.5 w-3.5" /> Yes, send now</>
                }
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          TERMINATION REQUEST APPROVE / REJECT MODAL
      ══════════════════════════════════════════════════════ */}
      {termModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[85vh] flex flex-col">
            <div className="flex items-start justify-between p-6 border-b border-slate-200 shrink-0">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  {termModal.mode === 'approve' ? 'Approve Termination Request' : 'Reject Termination Request'}
                </h2>
                <p className="text-sm text-slate-500 mt-0.5">
                  {termModal.mode === 'approve'
                    ? 'Finalises the termination and processes settlement. Staff will be released.'
                    : 'The booking remains active and the client will be notified.'}
                </p>
              </div>
              <button onClick={closeTermModal} className="p-1.5 rounded-lg hover:bg-slate-100 transition shrink-0 ml-4"><XCircle className="h-5 w-5 text-slate-400" /></button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              {termModal.mode === 'approve' ? (
                <>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                      <p className="text-xs text-slate-500 mb-0.5">Total Paid</p>
                      <p className="text-sm font-semibold text-slate-900">{formatMoney(totalPaid)}</p>
                    </div>
                    <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                      <p className="text-xs text-slate-500 mb-0.5">Total Invoiced</p>
                      <p className="text-sm font-semibold text-slate-900">{formatMoney(totalInvoiced)}</p>
                    </div>
                    <div className={`rounded-lg border p-3 ${termProjectedRemainingBalance > 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-100'}`}>
                      <p className="text-xs text-slate-500 mb-0.5">
                        {termFinalEndDateIso && termFinalEndDateIso > toDateInput(new Date()) ? 'Projected Balance (end date)' : 'Remaining Balance'}
                      </p>
                      <p className={`text-sm font-semibold ${termProjectedRemainingBalance > 0 ? 'text-emerald-700' : 'text-slate-400'}`}>{formatMoney(termProjectedRemainingBalance)}</p>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Official End Date <span className="text-rose-500">*</span></label>
                    <input
                      type="text"
                      inputMode="numeric"
                      placeholder="DD/MM/YYYY"
                      maxLength={10}
                      value={termFinalEndDate}
                      onChange={e => setTermFinalEndDate(maskDateInput(e.target.value))}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    />
                    {termFinalEndDateIso && termFinalEndDateIso > toDateInput(new Date()) && (
                      <p className="text-xs text-amber-600 mt-1.5">Future date — the booking stays active and billed until then, then terminates automatically.</p>
                    )}
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">Settlement Action</label>
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${termSettlementAction === 'WALLET_DEPOSIT' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                        {termSettlementAction === 'WALLET_DEPOSIT' ? 'Refund available' : 'No refund'}
                      </span>
                    </div>
                    <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <label className={`flex cursor-pointer items-start gap-3 rounded-lg bg-white p-3 text-sm text-slate-700 ring-1 transition ${termSettlementAction === 'WALLET_DEPOSIT' ? 'ring-green-400' : 'ring-slate-200 hover:ring-green-300'}`}>
                        <input type="radio" name="termSettlementAction" value="WALLET_DEPOSIT" checked={termSettlementAction === 'WALLET_DEPOSIT'} onChange={e => setTermSettlementAction(e.target.value)} className="mt-1 accent-green-600" />
                        <div>
                          <div className="flex items-center gap-1.5"><Wallet className="w-3.5 h-3.5 text-emerald-600" /><span className="font-semibold text-slate-900">Deposit to wallet</span></div>
                          <span className="block text-xs text-slate-500 mt-0.5">Return the remaining balance to the client's VCare wallet.</span>
                        </div>
                      </label>
                      <label className={`flex cursor-pointer items-start gap-3 rounded-lg bg-white p-3 text-sm text-slate-700 ring-1 transition ${termSettlementAction === 'NO_REFUND' ? 'ring-amber-400' : 'ring-slate-200 hover:ring-amber-300'}`}>
                        <input type="radio" name="termSettlementAction" value="NO_REFUND" checked={termSettlementAction === 'NO_REFUND'} onChange={e => setTermSettlementAction(e.target.value)} className="mt-1 accent-amber-500" />
                        <div>
                          <div className="flex items-center gap-1.5"><XCircle className="w-3.5 h-3.5 text-amber-600" /><span className="font-semibold text-slate-900">No refund</span></div>
                          <span className="block text-xs text-slate-500 mt-0.5">Retain the remaining balance with the booking record.</span>
                        </div>
                      </label>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1.5">
                      Settlement Note {termSettlementAction === 'NO_REFUND' && <span className="text-rose-500">*</span>}
                    </label>
                    <textarea
                      value={termSettlementNote}
                      onChange={e => setTermSettlementNote(e.target.value)}
                      rows={3}
                      placeholder={termSettlementAction === 'NO_REFUND' ? 'Required — explain why no refund is being issued' : 'Optional note about the settlement decision'}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 resize-none"
                    />
                  </div>
                </>
              ) : (
                <div>
                  <div className="flex items-center gap-2 text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 mb-4">
                    <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />
                    The booking will remain active and the client will be notified of the rejection.
                  </div>
                  <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1.5">
                    Reason for Rejection <span className="text-rose-500">*</span>
                  </label>
                  <textarea
                    value={termRejectReason}
                    onChange={e => setTermRejectReason(e.target.value)}
                    rows={4}
                    placeholder="Explain why this termination request is being rejected — this will be shared with the client"
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 resize-none"
                  />
                </div>
              )}

              {termModalError && <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-sm text-rose-700">{termModalError}</div>}
            </div>

            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-200 shrink-0">
              <button onClick={closeTermModal} className="px-4 py-2 text-sm font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">Cancel</button>
              <button
                onClick={submitTermModal}
                disabled={termModalLoading || (termModal.mode === 'approve' ? !termFinalEndDateIso : !termRejectReason.trim())}
                className={`inline-flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed ${termModal.mode === 'approve' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}`}
              >
                {termModalLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : termModal.mode === 'approve' ? <CheckCircle className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                {termModalLoading ? 'Saving…' : termModal.mode === 'approve' ? 'Confirm Approval' : 'Confirm Rejection'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
};

export default BookingDetailPageV2;
