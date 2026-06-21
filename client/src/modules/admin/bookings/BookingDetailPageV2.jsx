import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, ArrowLeft, CheckCircle, Download, DollarSign,
  Loader2, Phone, RefreshCw, Repeat2, Search, ShieldCheck,
  Upload, User, Users, Wallet, XCircle, Briefcase, History,
} from 'lucide-react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import AdminLayout from '../components/AdminLayout';
import apiClient from '../../../api/api';
import { useAdminAuth } from '../../../context/AdminAuthContext';
import CareTimeline from './CareTimeline';

// ─── helpers ────────────────────────────────────────────────────────────────

const initialPaymentForm = {
  amount_received: '', payment_method: 'BANK_TRANSFER', bank_account_id: '',
  cheque_number: '', cheque_date: '', reference_number: '', notes: '',
};

const moneyFmt = new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR', maximumFractionDigits: 2 });
const formatMoney  = (v) => moneyFmt.format(Number(v || 0));
const formatDate   = (v) => { if (!v) return '-'; const d = new Date(v); return isNaN(d) ? '-' : d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }); };
const formatDT     = (v) => { if (!v) return '-'; const d = new Date(v); return isNaN(d) ? '-' : d.toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); };
const formatTime   = (t) => { if (!t) return '-'; const m = String(t).match(/^(\d{1,2}):(\d{2})/); if (!m) return '-'; let h = parseInt(m[1], 10); const p = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12; return `${h}:${m[2]} ${p}`; };
const toDTLocal    = (value = new Date()) => { const d = value instanceof Date ? value : new Date(value); if (isNaN(d)) return ''; return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };
const toDateInput  = (value = new Date()) => { const d = value instanceof Date ? value : new Date(value); return isNaN(d) ? '' : d.toISOString().slice(0, 10); };
const addDays      = (date, n) => { const d = new Date(date); d.setDate(d.getDate() + n); return d; };
const initials     = (name) => (name || '?').trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();

const NURSE_PALETTE = [
  { tint: '#FAEEE7', solid: '#C2603F', border: '#E6C8B9' },
  { tint: '#F2EAF5', solid: '#8C5AA6', border: '#DCC8E3' },
  { tint: '#E8F1F9', solid: '#3F77B5', border: '#C3D8EC' },
  { tint: '#E4F1ED', solid: '#137A6B', border: '#A8D4CC' },
  { tint: '#FBF3E3', solid: '#B07D2A', border: '#E0CDA0' },
];

const STATUS_META = {
  active:              { bg: '#E3F1E8', col: '#2F7A53', dot: '#2F8A5B' },
  completed:           { bg: '#E7F0F8', col: '#3A6FA8', dot: '#3F77B5' },
  cancelled:           { bg: '#F7E6E3', col: '#BC4338', dot: '#C2483C' },
  terminated:          { bg: '#F7E6E3', col: '#BC4338', dot: '#C2483C' },
  pending_termination: { bg: '#FBF1DD', col: '#B07A1E', dot: '#C98A2E' },
  pending:             { bg: '#F1EDE5', col: '#7A756A', dot: '#9A9488' },
};

// ─── small atoms ────────────────────────────────────────────────────────────

const Label = ({ children }) => (
  <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.04em', textTransform: 'uppercase', color: '#9A9488', marginBottom: 3 }}>{children}</div>
);
const Value = ({ children, mono }) => (
  <div style={{ fontSize: 14, fontWeight: 600, color: '#2A2722', fontFamily: mono ? "'JetBrains Mono',monospace" : 'inherit' }}>{children ?? '-'}</div>
);
const Field = ({ label, value, mono }) => <div><Label>{label}</Label><Value mono={mono}>{value}</Value></div>;

const Card = ({ children, style }) => (
  <div style={{ background: '#fff', border: '1px solid #ECE7DF', borderRadius: 16, padding: '20px', ...style }}>{children}</div>
);
const CardTitle = ({ children }) => (
  <h3 style={{ margin: '0 0 15px', fontSize: 15.5, fontWeight: 700, color: '#2A2722' }}>{children}</h3>
);
const Empty = ({ icon: Icon, text }) => (
  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '36px 16px', textAlign: 'center', border: '1px dashed #E7E1D6', borderRadius: 14, background: '#FBF9F4' }}>
    <Icon style={{ width: 22, height: 22, color: '#C4BFB5' }} />
    <p style={{ marginTop: 12, fontSize: 13, color: '#9A9488' }}>{text}</p>
  </div>
);
const Pill = ({ children, tone = 'slate' }) => {
  const map = { slate: { bg: '#F1EDE5', col: '#7A756A' }, green: { bg: '#E3F1E8', col: '#2F7A53' }, amber: { bg: '#FBF1DD', col: '#B07A1E' }, rose: { bg: '#F7E6E3', col: '#BC4338' }, violet: { bg: '#EDE5F5', col: '#7A4A94' } };
  const c = map[tone] || map.slate;
  return <span style={{ display: 'inline-block', fontSize: 11.5, fontWeight: 600, padding: '3px 9px', borderRadius: 7, background: c.bg, color: c.col }}>{children}</span>;
};

// ─── main component ──────────────────────────────────────────────────────────

const BookingDetailPageV2 = () => {
  const { adminToken } = useAdminAuth();
  const navigate = useNavigate();
  const { bookingId } = useParams();
  const [searchParams] = useSearchParams();

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

  // statement
  const [statementStartDate, setStatementStartDate] = useState(toDateInput(addDays(new Date(), -30)));
  const [statementEndDate, setStatementEndDate]     = useState(toDateInput(new Date()));

  // daily attendance / manual invoicing
  const [attendanceRecords, setAttendanceRecords]   = useState([]);
  const [dailyInvoiceRecords, setDailyInvoiceRecords] = useState([]);
  const [dayModal, setDayModal]                     = useState(null); // { dateISO, dayNum }
  const [dayModalError, setDayModalError]           = useState('');
  const [dayModalBusy, setDayModalBusy]              = useState('');
  const [attendanceInputs, setAttendanceInputs]      = useState({}); // assignment_id -> { in_time, out_time }
  const [invoiceAmountInput, setInvoiceAmountInput]  = useState('');
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
  useEffect(() => {
    if (!adminToken || activeSection !== 'salesperson') return;
    apiClient.setToken(adminToken);
    apiClient.getSalespersons().then(r => setSalespersonsList(r?.data || [])).catch(() => {});
  }, [adminToken, activeSection]);

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
    assignments.forEach(a => { inputs[a.assignment_id] = { in_time: '', out_time: '' }; });
    setAttendanceInputs(inputs);
    setInvoiceAmountInput(String(dailyRate || ''));
    setDayModalError('');
    setDayModal({ dateISO, dayNum, assignments });
  };
  const closeDayModal = () => { setDayModal(null); setDayModalError(''); setAttendanceInputs({}); setInvoiceAmountInput(''); };

  const saveAttendanceTimes = async (assignmentId) => {
    const inputs = attendanceInputs[assignmentId] || {};
    if (!inputs.in_time || !inputs.out_time) { setDayModalError('Both in-time and out-time are required'); return; }
    try {
      setDayModalBusy(`save-${assignmentId}`); setDayModalError('');
      apiClient.setToken(adminToken);
      await apiClient.upsertBookingAttendance(bookingId, {
        assignment_id: assignmentId,
        service_date: dayModal.dateISO,
        in_time: new Date(inputs.in_time).toISOString(),
        out_time: new Date(inputs.out_time).toISOString(),
      });
      await fetchDailyRecords();
    } catch (err) { setDayModalError(err?.message || 'Failed to save attendance times'); }
    finally { setDayModalBusy(''); }
  };

  const decideSalary = async (attendanceId, approve) => {
    try {
      setDayModalBusy(`salary-${attendanceId}`); setDayModalError('');
      apiClient.setToken(adminToken);
      await apiClient.confirmAttendanceSalary(attendanceId, approve);
      await fetchDailyRecords();
    } catch (err) { setDayModalError(err?.message || 'Failed to confirm salary decision'); }
    finally { setDayModalBusy(''); }
  };

  const decideInvoice = async (approve) => {
    try {
      setDayModalBusy('invoice'); setDayModalError('');
      apiClient.setToken(adminToken);
      await apiClient.confirmBookingDailyInvoice(bookingId, {
        service_date: dayModal.dateISO,
        approve,
        amount: approve ? parseFloat(invoiceAmountInput) : undefined,
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
      await fetchDetail();
      // Receipt is generated asynchronously server-side; refetch shortly after.
      await fetchReceipts();
      setTimeout(fetchReceipts, 2500);
    } catch (err) { setError(err?.message || 'Failed to record payment'); }
    finally { setPaymentSubmitting(false); }
  };

  const closeSwapModal = () => { setShowSwapModal(false); setSwapModalStep(1); setSwapModalSearch(''); setSwapModalSelectedStaff(null); setSwapModalReason(''); setSwapModalError(''); setSwapModalPage(1); setSwapModalDesignation(''); setSwapModalStartDate(toDateInput(new Date())); };
  const selectSwapStaff = (s) => { setSwapModalSelectedStaff(s); setSwapModalStep(2); };
  const confirmSwap = async () => {
    if (!swapModalSelectedStaff || !swapModalReason.trim()) return;
    try {
      setSwapModalSubmitting(true); setSwapModalError('');
      apiClient.setToken(adminToken);
      const response = await apiClient.swapBookingStaff(bookingId, { new_staff_id: swapModalSelectedStaff.staff_profile_id, swap_reason: swapModalReason.trim(), new_staff_start_date: swapModalStartDate });
      closeSwapModal(); await fetchDetail();
      if (response?.scheduled) {
        window.alert(response.message || 'Staff swap scheduled for the future date.');
      }
    } catch (err) { setSwapModalError(err?.message || 'Failed to swap staff'); }
    finally { setSwapModalSubmitting(false); }
  };

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

  const openActionsModal = () => { setActionsModalStep(1); setActionsModalMode(null); setActionsModalError(''); setActualEndTime(toDTLocal(new Date())); setReason(''); setSettlementAction(remainingBalance > 0 ? 'WALLET_DEPOSIT' : 'NO_REFUND'); setSettlementNote(''); setShowActionsModal(true); };
  const closeActionsModal = () => { setShowActionsModal(false); setActionsModalStep(1); setActionsModalMode(null); setActionsModalError(''); };
  const handleActionsBack = () => { setActionsModalError(''); actionsModalStep === 3 && remainingBalance <= 0 ? setActionsModalStep(1) : setActionsModalStep(s => s - 1); };
  const handleActionsNext = () => {
    if (actionsModalStep === 1) { if (!actionsModalMode) return; setActionsModalStep(remainingBalance > 0 ? 2 : 3); }
    else if (actionsModalStep === 2) { if (settlementAction === 'NO_REFUND' && !settlementNote.trim()) { setActionsModalError('A settlement note is required when choosing no refund.'); return; } setActionsModalError(''); setActionsModalStep(3); }
  };
  const handleActionsSubmit = async () => {
    if (!bookingId || !actionsModalMode) return;
    try {
      setActionsModalLoading(true); setActionsModalError('');
      const payload = { actual_end_time: actualEndTime ? new Date(actualEndTime).toISOString() : new Date().toISOString(), settlement_action: remainingBalance > 0 ? settlementAction : 'NO_REFUND', settlement_note: settlementNote.trim() || null, reason: reason.trim() || `${actionsModalMode === 'complete' ? 'Completed' : 'Terminated'} via admin panel` };
      apiClient.setToken(adminToken);
      const response = actionsModalMode === 'complete'
        ? await apiClient.completeBooking(bookingId, payload)
        : await apiClient.adminTerminateBooking(bookingId, payload);
      closeActionsModal(); await fetchDetail();
      if (response?.scheduled) {
        window.alert(response.message || 'This has been scheduled for the future date. The booking stays active and billed until then.');
      }
    } catch (err) { setActionsModalError(err?.message || `Failed to ${actionsModalMode} booking`); }
    finally { setActionsModalLoading(false); }
  };

  // ── tab / status ─────────────────────────────────────────────────────────

  const bookingStatus     = (bookingSummary.status || '').toLowerCase();
  const isTerminated      = bookingStatus === 'terminated';
  const sm                = STATUS_META[bookingStatus] || STATUS_META.pending;
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
  const inp = { width: '100%', border: '1px solid #E2DCD0', borderRadius: 10, padding: '10px 12px', fontFamily: 'inherit', fontSize: 14, color: '#2A2722', outline: 'none', background: '#FCFBF8', boxSizing: 'border-box' };

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
      {/* Full-bleed warm background */}
      <div style={{ margin: '-32px -32px -32px -32px', background: '#F6F3EC', minHeight: '100vh', padding: '26px 24px 60px', fontFamily: "'Hanken Grotesk',system-ui,sans-serif" }}>
        <div style={{ maxWidth: 1180, margin: '0 auto' }}>

          {/* ── Error banner ── */}
          {error && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, background: '#FDF2F1', border: '1px solid #F5C9C5', borderRadius: 12, padding: '12px 16px', marginBottom: 16, fontSize: 13.5, color: '#BC4338' }}>
              <span>{error}</span>
              <button onClick={() => setError('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#BC4338', lineHeight: 1 }}><XCircle style={{ width: 16, height: 16 }} /></button>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════
              HEADER BAR
          ══════════════════════════════════════════════════════ */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 22 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <button
                onClick={() => navigate('/admin/bookings')}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: '#fff', border: '1px solid #E7E1D6', borderRadius: 10, padding: '9px 13px', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: '#5A554B', cursor: 'pointer' }}
              >
                <ArrowLeft style={{ width: 14, height: 14 }} /> Back to bookings
              </button>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 34, height: 34, borderRadius: 9, background: '#137A6B', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 20, fontWeight: 700, lineHeight: 1 }}>+</div>
                <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-0.01em', color: '#2A2722' }}>VCare</div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12.5, color: '#8A8478', background: '#fff', border: '1px solid #E7E1D6', borderRadius: 8, padding: '7px 11px' }}>
                {bookingSummary.booking_code || '—'}
              </span>
              <button onClick={fetchDetail} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: '#fff', border: '1px solid #E7E1D6', borderRadius: 10, padding: '9px 13px', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: '#5A554B', cursor: 'pointer' }}>
                <RefreshCw style={{ width: 14, height: 14 }} /> Refresh
              </button>
              {!isTerminated && (
                <button onClick={openActionsModal} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: '#137A6B', border: 'none', borderRadius: 10, padding: '9px 15px', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: '#fff', cursor: 'pointer' }}>
                  <ShieldCheck style={{ width: 14, height: 14 }} /> Actions
                </button>
              )}
            </div>
          </div>

          {/* ══════════════════════════════════════════════════════
              HERO
          ══════════════════════════════════════════════════════ */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 18, flexWrap: 'wrap', marginBottom: 20 }}>
            <div style={{ width: 62, height: 62, borderRadius: 16, background: '#E4F1ED', color: '#137A6B', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 800, flexShrink: 0 }}>
              {heroInitials}
            </div>
            <div style={{ flex: 1, minWidth: 260 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 6 }}>
                <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.15, color: '#2A2722' }}>
                  {heroName}
                  {bookingSummary.service_type ? ` · ${bookingSummary.service_type}` : ''}
                </h1>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: sm.bg, color: sm.col, borderRadius: 999, padding: '5px 12px', fontSize: 12.5, fontWeight: 700, whiteSpace: 'nowrap' }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: sm.dot }} />
                  {bookingSummary.status || 'Unknown'}
                </span>
              </div>
              <div style={{ fontSize: 15, fontWeight: 600, color: '#3A362F', marginBottom: 6 }}>{bookingSummary.service_model || '—'}</div>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: '#EEF2FF', color: '#4338CA', border: '1px solid #E0E7FF', borderRadius: 999, padding: '5px 11px', fontSize: 12.5, fontWeight: 700, marginBottom: 8 }}>
                <Briefcase style={{ width: 13, height: 13 }} />
                Salesperson: {salesData?.current?.salesperson_name || 'Unassigned'}
              </div>
              <p style={{ margin: 0, fontSize: 14, color: '#6F6A60' }}>
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
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 18 }}>
                <div style={{ background: '#fff', border: '1px solid #ECE7DF', borderRadius: 16, padding: '17px 18px' }}>
                  <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: '.04em', textTransform: 'uppercase', color: '#9A9488' }}>Total paid</div>
                  <div style={{ fontSize: 25, fontWeight: 800, letterSpacing: '-0.02em', marginTop: 7, color: '#2F8A5B' }}>{formatMoney(totalPaid)}</div>
                  <div style={{ fontSize: 12.5, color: '#2F8A5B', fontWeight: 600, marginTop: 4 }}>{paidDays} days covered</div>
                </div>
                <div style={{ background: simDate ? '#FEF9C3' : '#fff', border: simDate ? '1px solid #FDE047' : '1px solid #ECE7DF', borderRadius: 16, padding: '17px 18px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: '.04em', textTransform: 'uppercase', color: '#9A9488' }}>Outstanding</span>
                    {simDate && <span style={{ fontSize: 10, fontWeight: 700, background: '#FDE047', color: '#854D0E', borderRadius: 999, padding: '1px 6px' }}>SIM</span>}
                  </div>
                  <div style={{ fontSize: 25, fontWeight: 800, letterSpacing: '-0.02em', marginTop: 7, color: displayOutstanding > 0 ? '#BC4338' : '#2A2722' }}>{formatMoney(displayOutstanding)}</div>
                  <div style={{ fontSize: 12.5, fontWeight: 600, marginTop: 4, color: displayOutstanding > 0 ? '#BC4338' : '#9A9488' }}>{displayOutstanding > 0 ? `${Math.max(0, (simServedDays ?? servedDays) - paidDays)} days overdue` : 'All clear'}</div>
                </div>
                <div style={{ background: simDate ? '#FEF9C3' : '#fff', border: simDate ? '1px solid #FDE047' : '1px solid #ECE7DF', borderRadius: 16, padding: '17px 18px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: '.04em', textTransform: 'uppercase', color: '#9A9488' }}>Days served</span>
                    {simDate && <span style={{ fontSize: 10, fontWeight: 700, background: '#FDE047', color: '#854D0E', borderRadius: 999, padding: '1px 6px' }}>SIM</span>}
                  </div>
                  <div style={{ fontSize: 25, fontWeight: 800, letterSpacing: '-0.02em', marginTop: 7, color: '#2A2722' }}>
                    {displayServed} <span style={{ fontSize: 16, fontWeight: 600, color: overrun ? '#C2483C' : '#9A9488' }}>/ {plannedDays || '—'}</span>
                  </div>
                  <div style={{ fontSize: 12.5, fontWeight: 600, marginTop: 4, color: overrun ? '#C2483C' : '#6F6A60' }}>
                    {overrun ? `+${displayServed - plannedDays} overrun` : `of ${plannedDays || '—'} planned`}
                  </div>
                </div>
                <div style={{ background: '#fff', border: '1px solid #ECE7DF', borderRadius: 16, padding: '17px 18px' }}>
                  <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: '.04em', textTransform: 'uppercase', color: '#9A9488' }}>Daily rate</div>
                  <div style={{ fontSize: 25, fontWeight: 800, letterSpacing: '-0.02em', marginTop: 7, color: '#2A2722' }}>{formatMoney(dailyRate)}</div>
                  <div style={{ fontSize: 12.5, color: '#6F6A60', fontWeight: 600, marginTop: 4 }}>{bookingSummary.service_model || '—'}</div>
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
                marginBottom: 18, padding: '16px 20px', borderRadius: 16,
                background: invoicingMode === 'AUTO' ? '#E4F1ED' : '#FBF1DD',
                border: `1px solid ${invoicingMode === 'AUTO' ? '#BFE0D5' : '#EAD7A8'}`,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
                <div style={{ width: 38, height: 38, borderRadius: 10, background: invoicingMode === 'AUTO' ? '#137A6B' : '#C98A2E', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Wallet style={{ width: 18, height: 18, color: '#fff' }} />
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                    <span style={{ fontSize: 15, fontWeight: 800, color: '#2A2722' }}>Daily client invoicing</span>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 999, background: invoicingMode === 'AUTO' ? '#137A6B' : '#C98A2E', color: '#fff', letterSpacing: '.03em' }}>
                      {invoicingMode}
                    </span>
                  </div>
                  <div style={{ fontSize: 13, color: '#6F6A60', marginTop: 2 }}>
                    {invoicingMode === 'AUTO'
                      ? 'Billed automatically every night at 23:59. Staff salary is always automatic for LIVE_IN bookings.'
                      : 'Confirm each day\'s client charge from the care timeline below. Staff salary stays automatic either way.'}
                  </div>
                </div>
              </div>
              <button
                onClick={toggleInvoicingMode}
                disabled={invoicingModeSaving}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: invoicingMode === 'AUTO' ? '#fff' : '#2A2722', border: invoicingMode === 'AUTO' ? '1px solid #BFE0D5' : 'none', borderRadius: 10, padding: '10px 16px', fontFamily: 'inherit', fontSize: 13, fontWeight: 700, color: invoicingMode === 'AUTO' ? '#137A6B' : '#fff', cursor: invoicingModeSaving ? 'wait' : 'pointer', opacity: invoicingModeSaving ? 0.6 : 1, flexShrink: 0 }}
              >
                {invoicingModeSaving ? 'Saving…' : invoicingMode === 'AUTO' ? 'Switch to Manual' : 'Switch to Auto'}
              </button>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════
              CARE TIMELINE
          ══════════════════════════════════════════════════════ */}
          {bookingSummary.start_date && plannedDays > 0 && (
            <div style={{ marginBottom: 18 }}>
              <CareTimeline
                startDate={bookingSummary.start_date}
                plannedDays={plannedDays}
                dailyRate={dailyRate}
                totalPaid={totalPaid}
                staffAssignments={staffHistory}
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
          <div style={{ display: 'flex', gap: 7, marginBottom: 16, background: '#EEE9E0', padding: 5, borderRadius: 13, width: 'fit-content', maxWidth: '100%', flexWrap: 'wrap' }}>
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveSection(tab.id)}
                style={{
                  border: 'none', borderRadius: 9, padding: '9px 15px', fontFamily: 'inherit',
                  fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
                  background: activeSection === tab.id ? '#fff' : 'transparent',
                  color: activeSection === tab.id ? '#2A2722' : '#7A756A',
                  boxShadow: activeSection === tab.id ? '0 1px 3px rgba(40,33,22,.12)' : 'none',
                }}
              >{tab.label}</button>
            ))}
          </div>

          {/* ══════════════════════════════════════════════════════
              TAB: OVERVIEW
          ══════════════════════════════════════════════════════ */}
          {activeSection === 'overview' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 16, alignItems: 'start' }}>
                {/* Booking details */}
                <Card>
                  <CardTitle>Booking details</CardTitle>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 15 }}>
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

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'start' }}>
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
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 13 }}>
                        <Field label="Staff ID"   value={normCurrentStaff.id}     mono />
                        <Field label="Phone"       value={normCurrentStaff.mobile} />
                        <Field label="Email"       value={normCurrentStaff.email}  />
                        <Field label="Daily rate"  value={formatMoney(dailyRate)}  />
                      </div>
                    </>
                  ) : (
                    <Empty icon={Users} text="No staff currently assigned." />
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
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14 }}>
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
              <div style={{ display: 'grid', gridTemplateColumns: '1.55fr 1fr', gap: 16, alignItems: 'start' }}>
                <Card>
                  <CardTitle>Payment history</CardTitle>
                  {normPayments.length === 0 ? (
                    <Empty icon={DollarSign} text="No payment records for this booking." />
                  ) : (
                    <>
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
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
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
                    <button type="submit" disabled={paymentSubmitting} style={{ marginTop: 3, width: '100%', background: paymentSubmitting ? '#ccc' : '#137A6B', border: 'none', borderRadius: 10, padding: 12, fontFamily: 'inherit', fontSize: 14, fontWeight: 700, color: '#fff', cursor: paymentSubmitting ? 'not-allowed' : 'pointer' }}>
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
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
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
                    <button type="submit" disabled={walletPayoffSubmitting || !walletPayoffAmount} style={{ width: '100%', background: walletPayoffSubmitting ? '#ccc' : '#7A4A94', border: 'none', borderRadius: 10, padding: 12, fontFamily: 'inherit', fontSize: 14, fontWeight: 700, color: '#fff', cursor: 'pointer' }}>
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
              {/* Current staff */}
              <Card>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 16 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: '#A39D91' }}>Currently on duty</div>
                  {!isTerminated && (
                    <button onClick={() => setShowSwapModal(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: '#8C5AA6', border: 'none', borderRadius: 10, padding: '9px 14px', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: '#fff', cursor: 'pointer', flexShrink: 0 }}>
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
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 13 }}>
                      <Field label="Staff ID"   value={normCurrentStaff.id}     mono />
                      <Field label="Phone"       value={normCurrentStaff.mobile} />
                      <Field label="Email"       value={normCurrentStaff.email}  />
                      <Field label="Daily rate"  value={formatMoney(dailyRate)}  />
                    </div>
                  </>
                ) : <Empty icon={Users} text="No staff is currently assigned to this booking." />}
              </Card>

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
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 13 }}>
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
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: !salesActionId || salesActionBusy ? '#C7C2B8' : '#4338CA', border: 'none', borderRadius: 10, padding: '10px 16px', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: '#fff', cursor: !salesActionId || salesActionBusy ? 'not-allowed' : 'pointer', flexShrink: 0 }}
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
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <Card>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                  <div style={{ width: 38, height: 38, borderRadius: 10, background: '#E4F1ED', color: '#137A6B', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800 }}>{initials(clientDetails.client_name || 'C')}</div>
                  <h3 style={{ margin: 0, fontSize: 15.5, fontWeight: 700 }}>Client</h3>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 15 }}>
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
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 15 }}>
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
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: 16, alignItems: 'start' }}>
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
                  <button onClick={downloadStatement} disabled={statementLoading || !statementClientId} style={{ width: '100%', background: statementLoading || !statementClientId ? '#ccc' : '#2A2722', border: 'none', borderRadius: 10, padding: 12, fontFamily: 'inherit', fontSize: 14, fontWeight: 700, color: '#fff', cursor: statementLoading || !statementClientId ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                    {statementLoading ? <Loader2 style={{ width: 16, height: 16, animation: 'spin 1s linear infinite' }} /> : <Download style={{ width: 16, height: 16 }} />}
                    Download statement PDF
                  </button>
                </Card>
              </div>

              {/* Close-out / terminated info */}
              {!isTerminated ? (
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
                    {remainingBalance > 0 && (
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
                      <button onClick={() => { setActionsModalMode('complete'); openActionsModal(); }} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, background: '#137A6B', border: 'none', borderRadius: 10, padding: 12, fontFamily: 'inherit', fontSize: 13.5, fontWeight: 700, color: '#fff', cursor: 'pointer' }}>
                        <CheckCircle style={{ width: 15, height: 15 }} /> Complete booking
                      </button>
                      <button onClick={() => { setActionsModalMode('terminate'); openActionsModal(); }} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, background: '#fff', border: '1px solid #E3B5AF', borderRadius: 10, padding: 12, fontFamily: 'inherit', fontSize: 13.5, fontWeight: 700, color: '#BC4338', cursor: 'pointer' }}>
                        <XCircle style={{ width: 15, height: 15 }} /> Terminate
                      </button>
                    </div>
                  </div>
                </Card>
              ) : (
                <Card>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px 16px', textAlign: 'center' }}>
                    <XCircle style={{ width: 32, height: 32, color: '#F5C9C5', marginBottom: 12 }} />
                    <p style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 700, color: '#2A2722' }}>Booking terminated</p>
                    <p style={{ margin: 0, fontSize: 13, color: '#9A9488' }}>Terminated on {formatDate(bookingSummary.actual_end_time || bookingSummary.updated_at)}</p>
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
                    <div key={req.termination_request_id || i} style={{ background: '#FBF9F4', border: '1px solid #EFEAE0', borderRadius: 13, padding: '15px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
                        <div>
                          <p style={{ margin: '0 0 2px', fontWeight: 700, fontSize: 13.5, color: '#2A2722' }}>{req.requested_by_name || req.requested_by || 'Termination request'}</p>
                          <p style={{ margin: 0, fontSize: 12, color: '#A39D91' }}>Requested {formatDT(req.requested_at || req.created_at)}</p>
                        </div>
                        <Pill tone={req.status === 'APPROVED' ? 'green' : req.status === 'REJECTED' ? 'rose' : 'amber'}>{req.status || 'Pending'}</Pill>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 13, marginBottom: 10 }}>
                        <Field label="Requested end" value={formatDT(req.requested_end_time || req.requested_end_date)} />
                        <Field label="Approved end"  value={formatDT(req.end_time || req.approved_end_time)} />
                      </div>
                      <p style={{ margin: 0, fontSize: 13, color: '#5A554B' }}>{req.reason || req.request_reason || 'No reason provided.'}</p>
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
              const total = remainingBalance > 0 ? 3 : 2;
              const current = actionsModalStep === 3 ? total : actionsModalStep;
              return (
                <div className="flex items-center gap-2 px-6 pt-4 shrink-0">
                  {Array.from({ length: total }, (_, i) => i + 1).map(s => (
                    <div key={s} className={`h-1.5 flex-1 rounded-full transition-all ${s <= current ? 'bg-[#137A6B]' : 'bg-[#E7E1D6]'}`} />
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
                      { mode: 'complete', icon: CheckCircle, label: 'Complete', desc: 'Service finished as planned', activeBorder: 'border-[#137A6B] bg-[#E4F1ED]', activeIcon: 'text-[#137A6B]' },
                      { mode: 'terminate', icon: XCircle, label: 'Terminate', desc: 'End early before service concludes', activeBorder: 'border-[#BC4338] bg-rose-50', activeIcon: 'text-[#BC4338]' },
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
                    <div className="text-xs font-semibold uppercase tracking-wider text-[#9A9488] mb-1">Remaining balance</div>
                    <div className="text-2xl font-extrabold text-[#2A2722] tracking-tight">{formatMoney(remainingBalance)}</div>
                  </div>
                  <div className="flex flex-col gap-2.5">
                    {[
                      { value: 'WALLET_DEPOSIT', icon: Wallet,     label: 'Credit to client wallet', desc: `Add ${formatMoney(remainingBalance)} to the client's wallet.`,              activeCls: 'border-violet-400 bg-violet-50',  activeIcon: 'text-violet-600' },
                      { value: 'BANK_REFUND',    icon: DollarSign, label: 'Process bank refund',     desc: `Return ${formatMoney(remainingBalance)} to the client's bank account.`,   activeCls: 'border-blue-400 bg-blue-50',      activeIcon: 'text-blue-600' },
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
                        ...(remainingBalance > 0 ? [
                          { label: 'Remaining balance', value: formatMoney(remainingBalance) },
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
                <button onClick={handleActionsNext} disabled={actionsModalStep === 1 && !actionsModalMode} className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-bold text-white bg-[#137A6B] hover:bg-[#0F6559] rounded-xl transition disabled:opacity-40 disabled:cursor-not-allowed">
                  Continue →
                </button>
              ) : (
                <button onClick={handleActionsSubmit} disabled={actionsModalLoading} className={`inline-flex items-center gap-2 px-5 py-2.5 text-sm font-bold text-white rounded-xl transition disabled:opacity-60 ${actionsModalMode === 'complete' ? 'bg-[#137A6B] hover:bg-[#0F6559]' : 'bg-[#BC4338] hover:bg-[#A03830]'}`}>
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
                <h2 className="text-lg font-semibold text-slate-900">Swap Staff Member</h2>
                <p className="text-sm text-slate-500 mt-0.5">
                  {swapModalStep === 1 ? 'Select a replacement from available staff' : `Confirm: ${normCurrentStaff?.name || 'Current staff'} → ${swapModalSelectedStaff?.full_name}`}
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
                        <div key={s.staff_profile_id} className="flex items-center justify-between gap-4 p-4 rounded-xl border border-slate-200 hover:border-blue-200 hover:bg-blue-50/30 transition">
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
                  <div className="grid grid-cols-3 gap-3 items-center">
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-center">
                      <p className="text-xs text-slate-500 mb-2 font-medium uppercase tracking-wide">Current</p>
                      <div className="w-12 h-12 rounded-full bg-rose-100 flex items-center justify-center mx-auto mb-2"><User className="w-6 h-6 text-rose-400" /></div>
                      <p className="text-sm font-semibold text-slate-900 truncate">{normCurrentStaff?.name || '-'}</p>
                    </div>
                    <div className="flex items-center justify-center"><Repeat2 className="w-7 h-7 text-slate-300" /></div>
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-center">
                      <p className="text-xs text-emerald-600 mb-2 font-medium uppercase tracking-wide">New Staff</p>
                      <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-2 overflow-hidden">
                        {swapModalSelectedStaff.profile_picture_url ? <img src={swapModalSelectedStaff.profile_picture_url} alt={swapModalSelectedStaff.full_name} className="w-12 h-12 object-cover" /> : <User className="w-6 h-6 text-emerald-600" />}
                      </div>
                      <p className="text-sm font-semibold text-slate-900 truncate">{swapModalSelectedStaff.full_name}</p>
                      {swapModalSelectedStaff.mobile_number && <p className="text-xs text-slate-500 mt-0.5">{swapModalSelectedStaff.mobile_number}</p>}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">New staff start date <span className="text-rose-500">*</span></label>
                    <input type="date" value={swapModalStartDate} onChange={e => setSwapModalStartDate(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
                    {swapModalStartDate > toDateInput(new Date()) && (
                      <p className="text-xs text-amber-600 mt-1.5">
                        Future date — the swap will be scheduled. {normCurrentStaff?.name || 'Current staff'} keeps working until then; the new staff is reserved in the meantime.
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Reason for swap <span className="text-rose-500">*</span></label>
                    <textarea rows={3} value={swapModalReason} onChange={e => setSwapModalReason(e.target.value)} placeholder="e.g. Staff requested leave, client preference…" className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
                  </div>
                  <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800">After confirming, WhatsApp and SMS notifications will be sent to the current staff, new staff, and the client.</div>
                  {swapModalError && <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-sm text-rose-700">{swapModalError}</div>}
                </div>
                <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 shrink-0">
                  <button onClick={() => setSwapModalStep(1)} className="text-sm font-medium text-slate-600 hover:text-slate-900 transition">← Back</button>
                  <button onClick={confirmSwap} disabled={swapModalSubmitting || !swapModalReason.trim() || !swapModalStartDate} className="inline-flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-violet-600 hover:bg-violet-700 rounded-lg transition disabled:opacity-60 disabled:cursor-not-allowed">
                    {swapModalSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Repeat2 className="h-4 w-4" />}
                    {swapModalSubmitting ? 'Swapping…' : 'Confirm Swap'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          DAY DETAIL MODAL — attendance + manual invoicing
      ══════════════════════════════════════════════════════ */}
      {dayModal && (() => {
        const dateRecords = attendanceRecords.filter(r => r.service_date?.slice(0, 10) === dayModal.dateISO);
        const invoiceRecord = dailyInvoiceRecords.find(r => r.service_date?.slice(0, 10) === dayModal.dateISO);

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-xl max-h-[85vh] flex flex-col">
              <div className="flex items-start justify-between p-6 border-b border-slate-200 shrink-0">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Day {dayModal.dayNum} · {formatDate(dayModal.dateISO)}</h2>
                  <p className="text-sm text-slate-500 mt-0.5">Log attendance and confirm daily charges</p>
                </div>
                <button onClick={closeDayModal} className="p-1.5 rounded-lg hover:bg-slate-100 transition shrink-0 ml-4"><XCircle className="h-5 w-5 text-slate-400" /></button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-5">
                {dayModalError && <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-sm text-rose-700">{dayModalError}</div>}

                {/* ── Staff attendance (always automatic for LIVE_IN) ── */}
                {manualSalaryDay && (
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900 mb-3">Staff attendance</h3>
                    {dayModal.assignments.length === 0 ? (
                      <p className="text-sm text-slate-500">No staff assigned on this day.</p>
                    ) : (
                      <div className="space-y-3">
                        {dayModal.assignments.map(a => {
                          const record = dateRecords.find(r => r.assignment_id === a.assignment_id);
                          const staffName = a.full_name || a.staff_name || 'Staff';
                          const inputs = attendanceInputs[a.assignment_id] || { in_time: '', out_time: '' };

                          if (record && record.salary_status !== 'PENDING') {
                            const paid = record.salary_status === 'PAID';
                            return (
                              <div key={a.assignment_id} className={`rounded-xl border p-4 ${paid ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-slate-50'}`}>
                                <p className="text-sm font-semibold text-slate-900">{staffName}</p>
                                <p className="text-xs text-slate-600 mt-1">{record.hours_served}h served · {paid ? `Paid Rs.${Number(record.salary_amount).toLocaleString()}` : 'Salary skipped'} — decided by {record.decided_by_name}</p>
                              </div>
                            );
                          }

                          if (record && record.hours_served !== null) {
                            const hours = Number(record.hours_served);
                            return (
                              <div key={a.assignment_id} className="rounded-xl border border-slate-200 p-4">
                                <div className="flex items-center justify-between gap-3">
                                  <p className="text-sm font-semibold text-slate-900">{staffName}</p>
                                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${hours >= 12 ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{hours}h served</span>
                                </div>
                                <p className="text-xs text-slate-500 mt-1">The 12h figure is informational only — confirming is always your call.</p>
                                <div className="flex gap-2 mt-3">
                                  <button onClick={() => decideSalary(record.attendance_id, true)} disabled={dayModalBusy === `salary-${record.attendance_id}`} className="flex-1 px-3 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition disabled:opacity-60">Confirm & Pay Salary</button>
                                  <button onClick={() => decideSalary(record.attendance_id, false)} disabled={dayModalBusy === `salary-${record.attendance_id}`} className="flex-1 px-3 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition disabled:opacity-60">Skip — No Pay</button>
                                </div>
                              </div>
                            );
                          }

                          return (
                            <div key={a.assignment_id} className="rounded-xl border border-slate-200 p-4">
                              <p className="text-sm font-semibold text-slate-900 mb-2">{staffName}</p>
                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">In-time</label>
                                  <input type="datetime-local" value={inputs.in_time} onChange={e => setAttendanceInputs(p => ({ ...p, [a.assignment_id]: { ...inputs, in_time: e.target.value } }))} className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-blue-500" />
                                </div>
                                <div>
                                  <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">Out-time</label>
                                  <input type="datetime-local" value={inputs.out_time} onChange={e => setAttendanceInputs(p => ({ ...p, [a.assignment_id]: { ...inputs, out_time: e.target.value } }))} className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-blue-500" />
                                </div>
                              </div>
                              <button onClick={() => saveAttendanceTimes(a.assignment_id)} disabled={dayModalBusy === `save-${a.assignment_id}`} className="mt-3 w-full px-3 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition disabled:opacity-60">Save times</button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* ── Client invoice ── */}
                {manualInvoiceDay && (
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900 mb-3">Client invoice</h3>
                    {invoiceRecord && invoiceRecord.status !== 'PENDING' ? (
                      <div className={`rounded-xl border p-4 ${invoiceRecord.status === 'INVOICED' ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-slate-50'}`}>
                        <p className="text-sm text-slate-700">
                          {invoiceRecord.status === 'INVOICED' ? `Invoiced Rs.${Number(invoiceRecord.amount).toLocaleString()}` : 'Charge skipped for this day'} — decided by {invoiceRecord.decided_by_name}
                        </p>
                      </div>
                    ) : (
                      <div className="rounded-xl border border-slate-200 p-4">
                        <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">Amount (Rs.)</label>
                        <input type="number" min="0" step="0.01" value={invoiceAmountInput} onChange={e => setInvoiceAmountInput(e.target.value)} className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-blue-500 mb-3" />
                        <div className="flex gap-2">
                          <button onClick={() => decideInvoice(true)} disabled={dayModalBusy === 'invoice' || !invoiceAmountInput} className="flex-1 px-3 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition disabled:opacity-60">Confirm & Invoice Client</button>
                          <button onClick={() => decideInvoice(false)} disabled={dayModalBusy === 'invoice'} className="flex-1 px-3 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition disabled:opacity-60">Skip — Don't Charge</button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </AdminLayout>
  );
};

export default BookingDetailPageV2;
