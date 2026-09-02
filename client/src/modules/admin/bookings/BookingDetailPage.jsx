import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  AlertTriangle,
  CheckCircle,
  Download,
  Loader2,
  Phone,
  RefreshCw,
  Repeat2,
  Search,
  ShieldCheck,
  Upload,
  User,
  Users,
  Wallet,
  XCircle,
  DollarSign,
} from 'lucide-react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import AdminLayout from '../components/AdminLayout';
import apiClient from '../../../api/api';
import { useAdminAuth } from '../../../context/AdminAuthContext';
import { formatMobileNumber } from '../../../utils/phoneFormat';
import CareTimeline from './CareTimeline';
import DateInput from '../../../components/common/DateInput';
import DateTimeInput from '../../../components/common/DateTimeInput';

// ─── helpers ────────────────────────────────────────────────────────────────

const initialPaymentForm = {
  amount_received: '',
  payment_method:  'BANK_TRANSFER',
  bank_account_id: '',
  cheque_number:   '',
  cheque_date:     '',
  reference_number:'',
  notes:           '',
};

const moneyFormatter = new Intl.NumberFormat('en-LK', {
  style: 'currency', currency: 'LKR', maximumFractionDigits: 2,
});

const formatMoney = (v) => moneyFormatter.format(Number(v || 0));

const formatDate = (v) => {
  if (!v) return '-';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
};

const formatDateTime = (v) => {
  if (!v) return '-';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
};

const toDatetimeLocalValue = (value = new Date()) => {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

const toDateInputValue = (value = new Date()) => {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
};

const addDays = (date, days) => {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
};

// ─── nurse colour palette — mirrors CareTimeline.jsx ────────────────────────

const NURSE_COLOR_PALETTE = [
  { tint: '#FAEEE7', solid: '#C2603F', border: '#E6C8B9' },
  { tint: '#F2EAF5', solid: '#8C5AA6', border: '#DCC8E3' },
  { tint: '#E8F1F9', solid: '#3F77B5', border: '#C3D8EC' },
  { tint: '#E4F1ED', solid: '#137A6B', border: '#A8D4CC' },
  { tint: '#FBF3E3', solid: '#B07D2A', border: '#E0CDA0' },
];

// ─── status colours ──────────────────────────────────────────────────────────

const STATUS_STYLES = {
  active:              'bg-emerald-100 text-emerald-700',
  completed:           'bg-blue-100 text-blue-700',
  cancelled:           'bg-rose-100 text-rose-700',
  terminated:          'bg-rose-100 text-rose-700',
  pending_termination: 'bg-amber-100 text-amber-700',
  pending:             'bg-slate-100 text-slate-700',
};

// ─── small shared components ─────────────────────────────────────────────────

const DetailRow = ({ label, value, mono = false }) => (
  <div>
    <p className="text-xs font-semibold uppercase tracking-wide text-[#9A9488] mb-1">{label}</p>
    <p className={`text-sm text-[#2A2722] ${mono ? 'font-mono' : 'font-medium'}`}>{value ?? '-'}</p>
  </div>
);

const Pill = ({ children, tone = 'slate' }) => {
  const palette = {
    slate:  'bg-slate-100 text-slate-700',
    blue:   'bg-blue-100 text-blue-700',
    green:  'bg-emerald-100 text-emerald-700',
    amber:  'bg-amber-100 text-amber-700',
    rose:   'bg-rose-100 text-rose-700',
    violet: 'bg-violet-100 text-violet-700',
  };
  return (
    <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${palette[tone] || palette.slate}`}>
      {children}
    </span>
  );
};

const EmptyState = ({ icon: Icon, text }) => (
  <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[#E7E1D6] bg-[#FBF9F4] px-4 py-10 text-center">
    <Icon className="h-6 w-6 text-[#C4BFB5]" />
    <p className="mt-3 text-sm text-[#9A9488]">{text}</p>
  </div>
);

// Card wrapper used by every tab panel section
const Card = ({ children, className = '' }) => (
  <div className={`bg-white border border-[#ECE7DF] rounded-2xl p-5 ${className}`}>{children}</div>
);

const CardTitle = ({ children }) => (
  <h3 className="text-[15px] font-bold text-[#2A2722] mb-4 tracking-tight">{children}</h3>
);

// ─── main component ───────────────────────────────────────────────────────────

const BookingDetailPage = () => {
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
  const [simDate, setSimDate]         = useState(null); // YYYY-MM-DD or null — drives Care Timeline simulation
  const [bankAccounts, setBankAccounts]   = useState([]);
  const [availableStaff, setAvailableStaff] = useState([]);

  // navigation
  const [activeSection, setActiveSection] = useState(searchParams.get('section') || 'payments');

  // payment form
  const [paymentForm, setPaymentForm]           = useState(initialPaymentForm);
  const [paymentSlipFile, setPaymentSlipFile]   = useState(null);
  const [paymentSubmitting, setPaymentSubmitting] = useState(false);

  // wallet payoff
  const [walletPayoffAmount, setWalletPayoffAmount]       = useState('');
  const [walletPayoffNotes, setWalletPayoffNotes]         = useState('');
  const [walletPayoffSubmitting, setWalletPayoffSubmitting] = useState(false);
  const [walletPayoffError, setWalletPayoffError]         = useState('');

  // staff swap modal
  const [showSwapModal, setShowSwapModal]               = useState(false);
  const [swapModalStep, setSwapModalStep]               = useState(1);
  const [swapModalSearch, setSwapModalSearch]           = useState('');
  const [swapModalSelectedStaff, setSwapModalSelectedStaff] = useState(null);
  const [swapModalReason, setSwapModalReason]           = useState('');
  const [swapModalStartDate, setSwapModalStartDate]     = useState(toDateInputValue(new Date()));
  const [swapModalSubmitting, setSwapModalSubmitting]   = useState(false);
  const [swapModalError, setSwapModalError]             = useState('');
  const [swapModalPage, setSwapModalPage]               = useState(1);
  const [swapModalDesignation, setSwapModalDesignation] = useState('');

  // settlement / actions
  const [actualEndTime, setActualEndTime]   = useState(toDatetimeLocalValue(new Date()));
  const [reason, setReason]                 = useState('');
  const [settlementAction, setSettlementAction] = useState('WALLET_DEPOSIT');
  const [settlementNote, setSettlementNote] = useState('');

  // actions modal (complete / terminate)
  const [showActionsModal, setShowActionsModal]     = useState(false);
  const [actionsModalStep, setActionsModalStep]     = useState(1);
  const [actionsModalMode, setActionsModalMode]     = useState(null); // 'complete' | 'terminate'
  const [actionsModalLoading, setActionsModalLoading] = useState(false);
  const [actionsModalError, setActionsModalError]   = useState('');

  // statement export
  const [statementStartDate, setStatementStartDate] = useState(toDateInputValue(addDays(new Date(), -30)));
  const [statementEndDate, setStatementEndDate]     = useState(toDateInputValue(new Date()));

  // ── derived data ────────────────────────────────────────────────────────────

  const bookingSummary      = detail?.booking_summary        || {};
  const clientDetails       = detail?.client_details         || {};
  const patientDetails      = detail?.patient_details        || {};
  const currentStaff        = detail?.current_staff          || {};
  const paymentSummary      = detail?.payment_summary        || {};
  const invoiceSummary      = detail?.invoice_summary        || {};
  const paymentHistory      = Array.isArray(detail?.payment_history)          ? detail.payment_history          : [];
  const staffHistory        = Array.isArray(detail?.staff_assignment_history)  ? detail.staff_assignment_history  : [];
  const swapHistory         = Array.isArray(detail?.swap_history)              ? detail.swap_history              : [];
  const terminationRequests = Array.isArray(detail?.termination_requests)      ? detail.termination_requests      : [];

  const activeStaffRow = staffHistory.find((r) => (r.status || '').toLowerCase() === 'active') || staffHistory[0] || null;

  const normalizedCurrentStaff = currentStaff?.staff_name || currentStaff?.full_name || currentStaff?.name
    ? {
        name:        currentStaff.staff_name || currentStaff.full_name || currentStaff.name || '-',
        id:          currentStaff.staff_code || currentStaff.staff_profile_id || currentStaff.staff_id || currentStaff.id || '-',
        mobile:      currentStaff.staff_mobile || currentStaff.mobile || '-',
        email:       currentStaff.staff_email  || currentStaff.email  || '-',
        designation: currentStaff.designation  || currentStaff.staff_designation || '-',
      }
    : activeStaffRow
      ? {
          name:        activeStaffRow.full_name || activeStaffRow.staff_name || '-',
          id:          activeStaffRow.staff_code || activeStaffRow.staff_profile_id || activeStaffRow.staff_id || '-',
          mobile:      activeStaffRow.staff_mobile || activeStaffRow.mobile || '-',
          email:       activeStaffRow.staff_email  || activeStaffRow.email  || '-',
          designation: activeStaffRow.designation  || '-',
        }
      : null;

  const normalizedPaymentHistory = paymentHistory.map((p) => ({
    id:         p.payment_id || p.id,
    sourceType: p.source_type || p.source || 'BOOKING',
    date:       p.payment_date || p.verified_at || p.created_at,
    amount:     p.amount_received ?? p.amount ?? p.paid_amount ?? 0,
    method:     p.payment_method || p.method || '-',
    reference:  p.reference_number || p.reference_no || p.reference || p.receipt_no || '-',
    notes:      p.notes || '-',
    status:     p.status || '-',
    slipUrl:    p.slip_url || null,
  }));

  const normalizedStaffHistory = staffHistory.map((r) => ({
    id:              r.assignment_id || r.booking_staff_assignment_id || r.id,
    name:            r.full_name || r.staff_name || '-',
    staffId:         r.staff_code || r.staff_profile_id || r.staff_id || '-',
    colorKey:        r.staff_profile_id || r.staffId || r.id,
    designation:     r.designation || '-',
    currentStatus:   r.current_status || r.status || '-',
    startDate:       r.service_start_date || r.assigned_at || r.created_at,
    endDate:         r.service_end_date   || r.ended_at    || r.end_date,
    dailyRate:       r.daily_rate       ?? r.rate ?? 0,
    amountAllocated: r.amount_allocated ?? r.allocated_amount ?? 0,
  }));

  const normalizedSwapHistory = swapHistory.map((s) => ({
    id:             s.swap_id || s.id,
    oldStaffName:   s.old_staff_name || s.from_staff_name || '-',
    newStaffName:   s.new_staff_name || s.to_staff_name   || '-',
    swappedAt:      s.swapped_at || s.created_at,
    reason:         s.swap_reason || s.reason || s.note || null,
    billingGap:     Boolean(s.billing_gap),
    swappedByMobile:s.swapped_by_mobile || null,
  }));

  const totalPaid     = Number(paymentSummary.total_paid    ?? 0);
  const totalInvoiced = Number(invoiceSummary.total_invoiced ?? 0);
  const dailyRate     = Number(bookingSummary.quote_daily_rate || bookingSummary.daily_rate || 0);
  const overdueAmount = totalPaid > totalInvoiced ? 0 : totalInvoiced - totalPaid;
  const remainingBalance = totalPaid - totalInvoiced;
  const walletBalance    = Number(clientDetails.wallet_balance || 0);
  const maxPayoff        = Math.min(walletBalance, overdueAmount);
  const canPayoff        = walletBalance > 0 && overdueAmount > 0;
  const statementClientId = clientDetails.client_profile_id || bookingSummary.client_profile_id || bookingSummary.client_id;

  // Header identity links: the hero name opens whichever profile it is showing
  // (care profile when the booking has one, else the client it fell back to).
  const heroName          = patientDetails.patient_name || clientDetails.client_name || 'Booking';
  const clientProfilePath = statementClientId ? `/admin/users/${statementClientId}/detail` : null;
  const heroProfilePath   = patientDetails.patient_id
    ? `/admin/patients/${patientDetails.patient_id}/detail`
    : clientProfilePath;
  const lastInvoiceDate  = invoiceSummary.last_invoice_at   || invoiceSummary.last_invoice_date || null;
  const lastPaymentDate  = paymentSummary.last_payment_at   || paymentSummary.last_payment_date || null;
  const requiresBankAccount = ['BANK_TRANSFER', 'CASH_DEPOSIT'].includes(paymentForm.payment_method);
  const isCheque            = paymentForm.payment_method === 'CHEQUE';

  const plannedDays = useMemo(() => {
    if (!dailyRate || dailyRate === 0) return 0;
    return Math.floor(totalPaid / dailyRate);
  }, [totalPaid, dailyRate]);

  const servedDays = useMemo(() => {
    if (!bookingSummary.start_date) return 0;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const s = new Date(bookingSummary.start_date); s.setHours(0, 0, 0, 0);
    return Math.max(0, Math.floor((today - s) / 86400000) + 1);
  }, [bookingSummary.start_date]);

  const paidDays = dailyRate > 0 ? Math.floor(totalPaid / dailyRate) : 0;

  // Simulated values — recalculate served days and outstanding from the sim date
  const simServedDays = useMemo(() => {
    if (!simDate || !bookingSummary.start_date) return null;
    const s = new Date(bookingSummary.start_date); s.setHours(0, 0, 0, 0);
    const e = new Date(simDate); e.setHours(0, 0, 0, 0);
    return Math.max(0, Math.floor((e - s) / 86400000) + 1);
  }, [simDate, bookingSummary.start_date]);

  const simOutstanding = useMemo(() => {
    if (simServedDays === null || !dailyRate) return null;
    return Math.max(0, simServedDays * dailyRate - totalPaid);
  }, [simServedDays, dailyRate, totalPaid]);

  // Colour map keyed by staff_profile_id, sorted by assignment start date — mirrors CareTimeline
  const staffColorMap = useMemo(() => {
    const map = new Map();
    const sorted = [...staffHistory].sort(
      (a, b) => new Date(a.service_start_date || a.assigned_at || 0) - new Date(b.service_start_date || b.assigned_at || 0)
    );
    let idx = 0;
    sorted.forEach((a) => {
      const id = a.staff_profile_id || a.staffId || a.id;
      if (id && !map.has(id)) {
        map.set(id, NURSE_COLOR_PALETTE[idx % NURSE_COLOR_PALETTE.length]);
        idx++;
      }
    });
    return map;
  }, [staffHistory]);

  // Allocation history sorted chronologically with effective end dates computed
  const sortedAllocationHistory = useMemo(() => {
    const sorted = [...normalizedStaffHistory].sort(
      (a, b) => new Date(a.startDate) - new Date(b.startDate)
    );
    const bookingStart = bookingSummary.start_date ? new Date(bookingSummary.start_date) : null;
    if (bookingStart) bookingStart.setHours(0, 0, 0, 0);

    return sorted.map((row) => {
      // service_end_date is set by the backend on swap/completion — null means ongoing
      const effectiveEnd = row.endDate || null;

      const startD = row.startDate ? new Date(row.startDate) : null;
      if (startD) startD.setHours(0, 0, 0, 0);
      const endD = effectiveEnd ? new Date(effectiveEnd) : null;
      if (endD) endD.setHours(0, 0, 0, 0);

      const dayStart = bookingStart && startD
        ? Math.max(1, Math.floor((startD - bookingStart) / 86400000) + 1)
        : null;
      const dayEnd = bookingStart && endD
        ? Math.max(1, Math.floor((endD - bookingStart) / 86400000) + 1)
        : null;

      return {
        ...row,
        effectiveEnd,
        dayStart,
        dayEnd,
        dayCount: dayStart !== null && dayEnd !== null ? dayEnd - dayStart + 1 : null,
        isOngoing: !effectiveEnd,
        color: staffColorMap.get(row.colorKey) || null,
      };
    });
  }, [normalizedStaffHistory, bookingSummary.start_date, staffColorMap]);

  // ── effects ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (adminToken && bookingId) fetchBookingDetail();
  }, [adminToken, bookingId]);

  useEffect(() => {
    if (detail) {
      setSettlementAction(remainingBalance > 0 ? 'WALLET_DEPOSIT' : 'NO_REFUND');
    }
  }, [detail, remainingBalance]);

  useEffect(() => {
    if (!adminToken) return;
    apiClient.setToken(adminToken);
    apiClient.getBankAccounts()
      .then((r) => setBankAccounts(r?.data || []))
      .catch(() => {});
  }, [adminToken]);

  useEffect(() => {
    if (!adminToken || activeSection !== 'staff') return;
    apiClient.setToken(adminToken);
    apiClient.getAllStaff({ status: 'AVAILABLE', limit: 1000, page: 1 })
      .then((r) => setAvailableStaff(r?.data || []))
      .catch(() => {});
  }, [adminToken, activeSection]);

  // ── data fetchers / actions ──────────────────────────────────────────────────

  const fetchBookingDetail = async () => {
    try {
      setLoading(true);
      setError('');
      if (!adminToken) { setError('Admin authentication required'); return; }
      apiClient.setToken(adminToken);
      const response = await apiClient.getAdminBookingDetail(bookingId);
      const payload = response?.data ?? response;
      if (payload?.status === 'success') {
        setDetail(payload.data || {});
      } else if (payload && typeof payload === 'object' && !payload.status) {
        setDetail(payload);
      } else {
        setError(payload?.message || 'Failed to load booking detail');
      }
    } catch (err) {
      setError(err?.message || 'Unable to load booking detail');
    } finally {
      setLoading(false);
    }
  };

  const downloadStatement = async () => {
    if (!statementClientId) { setError('Client profile ID is missing for statement generation'); return; }
    try {
      setStatementLoading(true);
      apiClient.setToken(adminToken);
      const response = await apiClient.downloadClientStatement(statementClientId, {
        start_date: statementStartDate,
        end_date:   statementEndDate,
      });
      const blob = response instanceof Blob ? response : new Blob([response], { type: 'application/pdf' });
      const url  = window.URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url; a.download = `statement-${bookingSummary.booking_code || bookingId}.pdf`;
      document.body.appendChild(a); a.click(); a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError(err?.message || 'Failed to generate statement');
    } finally {
      setStatementLoading(false);
    }
  };

  const handleSubmitBookingPayment = async (e) => {
    e.preventDefault();
    try {
      setPaymentSubmitting(true); setError('');
      apiClient.setToken(adminToken);
      await apiClient.recordBookingPayment(bookingId, {
        amount_received:  parseFloat(paymentForm.amount_received),
        payment_method:   paymentForm.payment_method,
        bank_account_id:  paymentForm.bank_account_id  || null,
        cheque_number:    paymentForm.cheque_number     || null,
        cheque_date:      paymentForm.cheque_date       || null,
        reference_number: paymentForm.reference_number  || null,
        notes:            paymentForm.notes             || null,
      }, paymentSlipFile);
      setPaymentForm(initialPaymentForm); setPaymentSlipFile(null);
      await fetchBookingDetail();
    } catch (err) {
      setError(err?.message || 'Failed to record booking payment');
    } finally {
      setPaymentSubmitting(false);
    }
  };

  const handleSwapModalClose = () => {
    setShowSwapModal(false); setSwapModalStep(1); setSwapModalSearch('');
    setSwapModalSelectedStaff(null); setSwapModalReason(''); setSwapModalError('');
    setSwapModalPage(1); setSwapModalDesignation('');
    setSwapModalStartDate(toDateInputValue(new Date()));
  };

  const handleSwapModalSelectStaff = (s) => { setSwapModalSelectedStaff(s); setSwapModalStep(2); };

  const handleSwapModalConfirm = async () => {
    if (!swapModalSelectedStaff || !swapModalReason.trim()) return;
    try {
      setSwapModalSubmitting(true); setSwapModalError('');
      apiClient.setToken(adminToken);
      await apiClient.swapBookingStaff(bookingId, {
        new_staff_id:         swapModalSelectedStaff.staff_profile_id,
        swap_reason:          swapModalReason.trim(),
        new_staff_start_date: swapModalStartDate,
      });
      handleSwapModalClose();
      await fetchBookingDetail();
    } catch (err) {
      setSwapModalError(err?.message || 'Failed to swap staff member');
    } finally {
      setSwapModalSubmitting(false);
    }
  };

  const handleWalletPayoff = async (e) => {
    e.preventDefault();
    const amount = parseFloat(walletPayoffAmount);
    if (!amount || amount <= 0) return;
    try {
      setWalletPayoffSubmitting(true); setWalletPayoffError('');
      apiClient.setToken(adminToken);
      await apiClient.walletPayoffBooking(bookingId, amount, walletPayoffNotes || null);
      setWalletPayoffAmount(''); setWalletPayoffNotes('');
      await fetchBookingDetail();
    } catch (err) {
      setWalletPayoffError(err?.message || 'Failed to process wallet payoff');
    } finally {
      setWalletPayoffSubmitting(false);
    }
  };

  const submitAdminAction = async (mode) => {
    if (!bookingId) return;
    if (remainingBalance > 0 && settlementAction === 'NO_REFUND' && !settlementNote.trim()) {
      setError('Settlement note is required when selecting no refund for a remaining balance.');
      return;
    }
    try {
      setActionLoading(mode); setError('');
      const payload = {
        actual_end_time:   actualEndTime ? new Date(actualEndTime).toISOString() : new Date().toISOString(),
        settlement_action: remainingBalance > 0 ? settlementAction : 'NO_REFUND',
        settlement_note:   settlementNote.trim(),
        reason:            reason.trim() || `${mode === 'complete' ? 'Completed' : 'Terminated'} from admin booking page`,
      };
      apiClient.setToken(adminToken);
      if (mode === 'complete') { await apiClient.completeBooking(bookingId, payload); }
      else                     { await apiClient.adminTerminateBooking(bookingId, payload); }
      await fetchBookingDetail();
    } catch (err) {
      setError(err?.message || `Failed to ${mode} booking`);
    } finally {
      setActionLoading('');
    }
  };

  const handleActionsModalOpen = () => {
    setActionsModalStep(1);
    setActionsModalMode(null);
    setActionsModalError('');
    setActualEndTime(toDatetimeLocalValue(new Date()));
    setReason('');
    setSettlementAction(remainingBalance > 0 ? 'WALLET_DEPOSIT' : 'NO_REFUND');
    setSettlementNote('');
    setShowActionsModal(true);
  };

  const handleActionsModalClose = () => {
    setShowActionsModal(false);
    setActionsModalStep(1);
    setActionsModalMode(null);
    setActionsModalError('');
  };

  const handleActionsModalBack = () => {
    setActionsModalError('');
    if (actionsModalStep === 3 && remainingBalance <= 0) {
      setActionsModalStep(1);
    } else {
      setActionsModalStep((s) => s - 1);
    }
  };

  const handleActionsModalNext = () => {
    if (actionsModalStep === 1) {
      if (!actionsModalMode) return;
      setActionsModalStep(remainingBalance > 0 ? 2 : 3);
    } else if (actionsModalStep === 2) {
      if (settlementAction === 'NO_REFUND' && !settlementNote.trim()) {
        setActionsModalError('A settlement note is required when choosing no refund.');
        return;
      }
      setActionsModalError('');
      setActionsModalStep(3);
    }
  };

  const handleActionsModalSubmit = async () => {
    if (!bookingId || !actionsModalMode) return;
    try {
      setActionsModalLoading(true);
      setActionsModalError('');
      const payload = {
        actual_end_time:   actualEndTime ? new Date(actualEndTime).toISOString() : new Date().toISOString(),
        settlement_action: remainingBalance > 0 ? settlementAction : 'NO_REFUND',
        settlement_note:   settlementNote.trim() || null,
        reason:            reason.trim() || `${actionsModalMode === 'complete' ? 'Completed' : 'Terminated'} via admin panel`,
      };
      apiClient.setToken(adminToken);
      if (actionsModalMode === 'complete') {
        await apiClient.completeBooking(bookingId, payload);
      } else {
        await apiClient.adminTerminateBooking(bookingId, payload);
      }
      handleActionsModalClose();
      await fetchBookingDetail();
    } catch (err) {
      setActionsModalError(err?.message || `Failed to ${actionsModalMode} booking`);
    } finally {
      setActionsModalLoading(false);
    }
  };

  // ── tab config ───────────────────────────────────────────────────────────────

  const bookingStatus       = (bookingSummary.status || '').toLowerCase();
  const isTerminatedBooking = bookingStatus === 'terminated';
  const statusTone          = STATUS_STYLES[bookingStatus] || 'bg-slate-100 text-slate-700';

  const sectionTabs = [
    { id: 'payments',    label: 'Payments' },
    { id: 'staff',       label: 'Staff & Swaps' },
    { id: 'client',      label: 'Client & Care' },
    { id: 'settlement',  label: 'Settlement' },
    { id: 'termination', label: 'Termination' },
    { id: 'overview',    label: 'Overview' },
  ];

  // ── loading / error states ───────────────────────────────────────────────────

  if (loading) {
    return (
      <AdminLayout title="Booking Detail" subtitle="Loading booking information...">
        <div className="flex min-h-[50vh] items-center justify-center">
          <div className="text-center">
            <Loader2 className="mx-auto mb-4 h-12 w-12 animate-spin text-blue-600" />
            <p className="text-sm text-slate-500">Fetching booking detail</p>
          </div>
        </div>
      </AdminLayout>
    );
  }

  if (!detail && error) {
    return (
      <AdminLayout title="Booking Detail" subtitle="Unable to load booking information">
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6">
          <div className="flex items-start gap-4">
            <div className="rounded-full bg-rose-100 p-2"><XCircle className="h-6 w-6 text-rose-600" /></div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-rose-900">Unable to load booking detail</h3>
              <p className="mt-1 text-sm text-rose-700">{error}</p>
              <button onClick={fetchBookingDetail} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700">
                <RefreshCw className="h-4 w-4" /> Retry
              </button>
            </div>
          </div>
        </div>
      </AdminLayout>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  //  RENDER
  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <AdminLayout
      title={`Booking ${bookingSummary.booking_code || 'Detail'}`}
      subtitle="Admin detail view for booking records, billing, staffing, and settlement actions"
    >
      <div className="space-y-5">

        {/* ── Inline error banner ── */}
        {error && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 flex items-center justify-between gap-3">
            <span>{error}</span>
            <button onClick={() => setError('')} className="text-rose-400 hover:text-rose-600">
              <XCircle className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════
            HERO
        ═══════════════════════════════════════════════════════════════════ */}
        <div className="bg-white border border-[#ECE7DF] rounded-2xl p-6">
          {/* top bar */}
          <div className="flex items-center justify-between gap-4 flex-wrap mb-5">
            <div className="flex items-center gap-3">
              <button
                onClick={() => navigate('/admin/bookings')}
                className="inline-flex items-center gap-2 bg-white border border-[#E7E1D6] rounded-lg px-3 py-2 text-sm font-semibold text-[#5A554B] hover:bg-[#F6F3EC] transition"
              >
                <ArrowLeft className="h-4 w-4" /> Back
              </button>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs text-[#8A8478] bg-white border border-[#E7E1D6] rounded-lg px-3 py-2">
                {bookingSummary.booking_code || '—'}
              </span>
              <button
                onClick={fetchBookingDetail}
                className="inline-flex items-center gap-2 bg-white border border-[#E7E1D6] rounded-lg px-3 py-2 text-sm font-semibold text-[#5A554B] hover:bg-[#F6F3EC] transition"
              >
                <RefreshCw className="h-4 w-4" /> Refresh
              </button>
              {!isTerminatedBooking && (
                <button
                  onClick={handleActionsModalOpen}
                  className="inline-flex items-center gap-2 bg-[#137A6B] border-none rounded-lg px-4 py-2 text-sm font-semibold text-white hover:bg-[#0F6559] transition"
                >
                  <ShieldCheck className="h-4 w-4" /> Actions
                </button>
              )}
            </div>
          </div>

          {/* hero text */}
          <div className="flex items-center gap-3 flex-wrap mb-2">
            <h1 className="text-2xl font-extrabold text-[#2A2722] tracking-tight">
              {heroProfilePath ? (
                <button
                  type="button"
                  onClick={() => navigate(heroProfilePath)}
                  title={patientDetails.patient_id ? 'Open care profile' : 'Open client profile'}
                  className="hover:text-[#137A6B] hover:underline underline-offset-4 transition-colors"
                >
                  {heroName}
                </button>
              ) : heroName}
              {bookingSummary.service_type ? ` · ${bookingSummary.service_type}` : ''}
            </h1>
            <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${statusTone}`}>
              <span className="w-1.5 h-1.5 rounded-full bg-current opacity-60" />
              {bookingSummary.status || 'Unknown'}
            </span>
          </div>
          <p className="text-sm text-[#6F6A60] flex flex-wrap items-center gap-1.5">
            {(() => {
              const parts = [];
              if (bookingSummary.service_model) parts.push(<span key="model">{bookingSummary.service_model}</span>);
              if (clientDetails.client_name) {
                parts.push(
                  <span key="client">
                    for{' '}
                    {clientProfilePath ? (
                      <button
                        type="button"
                        onClick={() => navigate(clientProfilePath)}
                        title="Open client profile"
                        className="font-semibold hover:text-[#137A6B] hover:underline underline-offset-2 transition-colors"
                      >
                        {clientDetails.client_name}
                      </button>
                    ) : clientDetails.client_name}
                  </span>
                );
              }
              if (bookingSummary.start_date) parts.push(<span key="start">Started {formatDate(bookingSummary.start_date)}</span>);
              if (!parts.length) return '—';
              return parts.map((p, i) => (
                <React.Fragment key={i}>
                  {i > 0 && <span className="text-[#C9C3B7]">·</span>}
                  {p}
                </React.Fragment>
              ));
            })()}
          </p>
        </div>

        {/* ═══════════════════════════════════════════════════════════════════
            STAT CARDS
        ═══════════════════════════════════════════════════════════════════ */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Total paid */}
          <div className="bg-white border border-[#ECE7DF] rounded-2xl p-[17px]">
            <div className="text-xs font-semibold uppercase tracking-wider text-[#9A9488]">Total paid</div>
            <div className="text-2xl font-extrabold text-[#2A2722] mt-1.5 tracking-tight leading-none">{formatMoney(totalPaid)}</div>
            <div className="text-xs font-semibold text-[#2F8A5B] mt-1">{paidDays} days covered</div>
          </div>

          {/* Outstanding — shows simulated amount when sim is active */}
          {(() => {
            const displayOutstanding = simOutstanding ?? overdueAmount;
            const displayOverdueDays = simServedDays !== null
              ? Math.max(0, simServedDays - paidDays)
              : Math.max(0, servedDays - paidDays);
            return (
              <div
                className="rounded-2xl p-[17px]"
                style={{
                  background: simDate ? '#FEF9C3' : 'white',
                  border: simDate ? '1px solid #FDE047' : '1px solid #ECE7DF',
                }}
              >
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-semibold uppercase tracking-wider text-[#9A9488]">Outstanding</span>
                  {simDate && <span className="text-[10px] font-bold bg-yellow-200 text-yellow-800 px-1.5 rounded-full">SIM</span>}
                </div>
                <div className={`text-2xl font-extrabold mt-1.5 tracking-tight leading-none ${displayOutstanding > 0 ? 'text-[#BC4338]' : 'text-[#2A2722]'}`}>
                  {formatMoney(displayOutstanding)}
                </div>
                <div className={`text-xs font-semibold mt-1 ${displayOutstanding > 0 ? 'text-[#BC4338]' : 'text-[#9A9488]'}`}>
                  {displayOutstanding > 0 ? `${displayOverdueDays} days overdue` : 'All clear'}
                </div>
              </div>
            );
          })()}

          {/* Days served — shows simulated count when sim is active */}
          {(() => {
            const displayServed = simServedDays ?? servedDays;
            const overrun = plannedDays && displayServed > plannedDays;
            return (
              <div
                className="rounded-2xl p-[17px]"
                style={{
                  background: simDate ? '#FEF9C3' : 'white',
                  border: simDate ? '1px solid #FDE047' : '1px solid #ECE7DF',
                }}
              >
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-semibold uppercase tracking-wider text-[#9A9488]">Days served</span>
                  {simDate && <span className="text-[10px] font-bold bg-yellow-200 text-yellow-800 px-1.5 rounded-full">SIM</span>}
                </div>
                <div className="text-2xl font-extrabold text-[#2A2722] mt-1.5 tracking-tight leading-none">
                  {displayServed} <span className={`text-base font-semibold ${overrun ? 'text-[#C2483C]' : 'text-[#9A9488]'}`}>/ {plannedDays || '—'}</span>
                </div>
                <div className={`text-xs font-semibold mt-1 ${overrun ? 'text-[#C2483C]' : 'text-[#6F6A60]'}`}>
                  {overrun ? `+${displayServed - plannedDays} overrun` : `of ${plannedDays || '—'} planned`}
                </div>
              </div>
            );
          })()}

          {/* Daily rate */}
          <div className="bg-white border border-[#ECE7DF] rounded-2xl p-[17px]">
            <div className="text-xs font-semibold uppercase tracking-wider text-[#9A9488]">Daily rate</div>
            <div className="text-2xl font-extrabold text-[#2A2722] mt-1.5 tracking-tight leading-none">{formatMoney(dailyRate)}</div>
            <div className="text-xs font-semibold text-[#6F6A60] mt-1">{bookingSummary.service_model || '—'}</div>
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════════════════
            CARE TIMELINE
        ═══════════════════════════════════════════════════════════════════ */}
        {bookingSummary.start_date && plannedDays > 0 && (
          <CareTimeline
            startDate={bookingSummary.start_date}
            plannedDays={plannedDays}
            dailyRate={dailyRate}
            totalPaid={totalPaid}
            staffAssignments={staffHistory}
            simDate={simDate}
            onSimDateChange={setSimDate}
          />
        )}

        {/* ═══════════════════════════════════════════════════════════════════
            TAB SWITCHER (pill style)
        ═══════════════════════════════════════════════════════════════════ */}
        <div className="bg-[#EEE9E0] rounded-xl p-1 flex gap-1 flex-wrap w-fit max-w-full">
          {sectionTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveSection(tab.id)}
              className={
                activeSection === tab.id
                  ? 'bg-white rounded-lg px-4 py-2 text-[13.5px] font-semibold text-[#2A2722] shadow-sm transition whitespace-nowrap'
                  : 'px-4 py-2 text-[13.5px] font-semibold text-[#7A756A] rounded-lg hover:text-[#2A2722] transition whitespace-nowrap'
              }
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* ═══════════════════════════════════════════════════════════════════
            TAB: PAYMENTS
        ═══════════════════════════════════════════════════════════════════ */}
        {activeSection === 'payments' && (
          <div className="flex flex-col gap-4">

            {/* Main 2-col grid */}
            <div className="grid grid-cols-1 lg:grid-cols-[1.55fr_1fr] gap-4 items-start">

              {/* Payment history */}
              <Card>
                <CardTitle>Payment history</CardTitle>
                {paymentHistory.length === 0 ? (
                  <EmptyState icon={DollarSign} text="No payment records are available for this booking." />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="border-b border-[#EFEAE0]">
                          {['Date', 'Amount', 'Method', 'Reference'].map((h) => (
                            <th key={h} className="pb-2.5 pr-3 text-left text-xs font-bold uppercase tracking-wider text-[#A39D91]">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#F2EEE6]">
                        {normalizedPaymentHistory.map((p, i) => (
                          <tr key={p.id || i}>
                            <td className="py-3 pr-3">
                              <div className="text-[13.5px] font-semibold text-[#2A2722]">{formatDate(p.date)}</div>
                              {p.notes !== '-' && <div className="text-[11.5px] text-[#A39D91]">{p.notes}</div>}
                            </td>
                            <td className="py-3 pr-3 text-sm font-bold text-[#2A2722]">{formatMoney(p.amount)}</td>
                            <td className="py-3 pr-3">
                              <span className="inline-block text-xs font-semibold text-[#5A554B] bg-[#F4F1EA] rounded-lg px-2 py-1">
                                {p.method.replace(/_/g, ' ')}
                              </span>
                            </td>
                            <td className="py-3 font-mono text-xs text-[#6F6A60]">
                              {p.reference}
                              {p.slipUrl && (
                                <a href={p.slipUrl} target="_blank" rel="noreferrer" className="ml-2 text-blue-600 underline text-[11px]">slip</a>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div className="flex items-center justify-between pt-3 mt-1 border-t border-[#EFEAE0]">
                      <span className="text-sm text-[#6F6A60]">{paymentHistory.length} payment{paymentHistory.length !== 1 ? 's' : ''} recorded</span>
                      <span className="text-sm font-extrabold text-[#2A2722]">{formatMoney(totalPaid)}</span>
                    </div>
                  </div>
                )}
              </Card>

              {/* Record payment form */}
              <Card>
                <CardTitle>Record a payment</CardTitle>
                <p className="text-xs text-[#9A9488] -mt-3 mb-4">Adds to the booking ledger.</p>
                <form onSubmit={handleSubmitBookingPayment} className="flex flex-col gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-[#7A756A] mb-1.5">Amount received</label>
                    <input
                      required type="number" min="0" step="0.01"
                      value={paymentForm.amount_received}
                      onChange={(e) => setPaymentForm({ ...paymentForm, amount_received: e.target.value })}
                      onWheel={(e) => e.target.blur()}
                      placeholder="0.00"
                      className="w-full border border-[#E2DCD0] rounded-xl px-3 py-2.5 text-sm text-[#2A2722] outline-none focus:border-[#137A6B] bg-[#FCFBF8]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#7A756A] mb-1.5">Payment method</label>
                    <select
                      value={paymentForm.payment_method}
                      onChange={(e) => setPaymentForm({ ...paymentForm, payment_method: e.target.value })}
                      className="w-full border border-[#E2DCD0] rounded-xl px-3 py-2.5 text-sm text-[#2A2722] outline-none focus:border-[#137A6B] bg-[#FCFBF8]"
                    >
                      <option value="BANK_TRANSFER">Bank transfer</option>
                      <option value="CASH_DEPOSIT">Cash deposit</option>
                      <option value="CASH">Cash</option>
                      <option value="CHEQUE">Cheque</option>
                    </select>
                  </div>
                  {requiresBankAccount && (
                    <div>
                      <label className="block text-xs font-semibold text-[#7A756A] mb-1.5">Bank account</label>
                      <select
                        required
                        value={paymentForm.bank_account_id}
                        onChange={(e) => setPaymentForm({ ...paymentForm, bank_account_id: e.target.value })}
                        className="w-full border border-[#E2DCD0] rounded-xl px-3 py-2.5 text-sm text-[#2A2722] outline-none focus:border-[#137A6B] bg-[#FCFBF8]"
                      >
                        <option value="">Select bank account</option>
                        {bankAccounts.map((a) => (
                          <option key={a.account_id} value={a.account_id}>
                            {a.account_nickname} ({a.bank_name})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  {isCheque && (
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs font-semibold text-[#7A756A] mb-1.5">Cheque no.</label>
                        <input
                          required value={paymentForm.cheque_number}
                          onChange={(e) => setPaymentForm({ ...paymentForm, cheque_number: e.target.value })}
                          placeholder="000000"
                          className="w-full border border-[#E2DCD0] rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#137A6B] bg-[#FCFBF8]"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-[#7A756A] mb-1.5">Cheque date</label>
                        <DateInput
                          required value={paymentForm.cheque_date}
                          onChange={(e) => setPaymentForm({ ...paymentForm, cheque_date: e.target.value })}
                          className="w-full border border-[#E2DCD0] rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#137A6B] bg-[#FCFBF8] text-[#6F6A60]"
                        />
                      </div>
                    </div>
                  )}
                  <div>
                    <label className="block text-xs font-semibold text-[#7A756A] mb-1.5">Reference (optional)</label>
                    <input
                      value={paymentForm.reference_number}
                      onChange={(e) => setPaymentForm({ ...paymentForm, reference_number: e.target.value })}
                      placeholder="TRF / receipt no."
                      className="w-full border border-[#E2DCD0] rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#137A6B] bg-[#FCFBF8]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#7A756A] mb-1.5">Notes (optional)</label>
                    <textarea
                      rows={2} value={paymentForm.notes}
                      onChange={(e) => setPaymentForm({ ...paymentForm, notes: e.target.value })}
                      placeholder="e.g. 10-day advance"
                      className="w-full border border-[#E2DCD0] rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#137A6B] bg-[#FCFBF8] resize-none"
                    />
                  </div>
                  <div className="rounded-xl border border-[#E7E1D6] p-3">
                    <label className="block text-xs font-semibold text-[#7A756A] mb-2">Payment slip (optional)</label>
                    <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-[#E7E1D6] bg-[#F6F3EC] px-3 py-2 text-xs font-semibold text-[#5A554B] hover:bg-[#EEE9E0] transition">
                      <Upload className="h-3.5 w-3.5" /> Choose file
                      <input type="file" accept="image/*,.pdf,.doc,.docx" className="hidden"
                        onChange={(e) => setPaymentSlipFile(e.target.files?.[0] || null)} />
                    </label>
                    {paymentSlipFile && <p className="mt-2 text-xs text-[#6F6A60]">Selected: {paymentSlipFile.name}</p>}
                  </div>
                  <button
                    type="submit" disabled={paymentSubmitting}
                    className="mt-1 w-full bg-[#137A6B] text-white rounded-xl py-3 text-sm font-bold hover:bg-[#0F6559] disabled:bg-slate-300 disabled:cursor-not-allowed transition"
                  >
                    {paymentSubmitting ? 'Saving...' : 'Record payment'}
                  </button>
                </form>
              </Card>
            </div>

            {/* Mini stat cards row */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { label: 'Total invoiced',  value: formatMoney(invoiceSummary.total_invoiced ?? 0) },
                { label: 'Outstanding',     value: formatMoney(invoiceSummary.overdue_amount ?? overdueAmount), red: overdueAmount > 0 },
                { label: 'Wallet balance',  value: formatMoney(walletBalance), green: walletBalance > 0 },
                { label: 'Last payment',    value: formatDate(lastPaymentDate) },
              ].map(({ label, value, red, green }) => (
                <div key={label} className="bg-white border border-[#ECE7DF] rounded-xl p-4">
                  <div className="text-xs font-semibold uppercase tracking-wider text-[#9A9488]">{label}</div>
                  <div className={`text-lg font-extrabold mt-1.5 ${red ? 'text-[#BC4338]' : green ? 'text-[#2F8A5B]' : 'text-[#2A2722]'}`}>{value}</div>
                </div>
              ))}
            </div>

            {/* Wallet payoff */}
            <Card>
              <div className="flex items-center gap-2 mb-4">
                <div className="rounded-full bg-violet-100 p-2 text-violet-600"><Wallet className="h-4 w-4" /></div>
                <h3 className="text-[15px] font-bold text-[#2A2722]">Wallet payoff</h3>
              </div>
              {canPayoff && !isTerminatedBooking ? (
                <form onSubmit={handleWalletPayoff} className="flex flex-col gap-3">
                  <div className="grid grid-cols-3 gap-3">
                    <div className="rounded-xl border border-[#ECE7DF] p-3">
                      <p className="text-xs text-[#9A9488]">Wallet balance</p>
                      <p className="text-sm font-bold text-[#2F8A5B] mt-1">{formatMoney(walletBalance)}</p>
                    </div>
                    <div className="rounded-xl border border-[#ECE7DF] p-3">
                      <p className="text-xs text-[#9A9488]">Overdue amount</p>
                      <p className="text-sm font-bold text-[#BC4338] mt-1">{formatMoney(overdueAmount)}</p>
                    </div>
                    <div className="rounded-xl border border-[#ECE7DF] p-3">
                      <p className="text-xs text-[#9A9488]">Max payable</p>
                      <p className="text-sm font-bold text-violet-700 mt-1">{formatMoney(maxPayoff)}</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <input
                      required type="number" min="0.01" max={maxPayoff.toFixed(2)} step="0.01"
                      value={walletPayoffAmount} onChange={(e) => setWalletPayoffAmount(e.target.value)}
                      onWheel={(e) => e.target.blur()}
                      placeholder="Amount to pay off"
                      className="flex-1 border border-[#E2DCD0] rounded-xl px-3 py-2.5 text-sm outline-none focus:border-violet-500 bg-[#FCFBF8]"
                    />
                    <button type="button" onClick={() => setWalletPayoffAmount(maxPayoff.toFixed(2))}
                      className="border border-[#E2DCD0] rounded-xl px-3 py-2 text-xs font-semibold text-[#5A554B] hover:bg-[#F6F3EC]">
                      Max
                    </button>
                  </div>
                  <textarea rows={2} value={walletPayoffNotes} onChange={(e) => setWalletPayoffNotes(e.target.value)}
                    placeholder="Notes (optional)"
                    className="w-full border border-[#E2DCD0] rounded-xl px-3 py-2.5 text-sm outline-none focus:border-violet-500 bg-[#FCFBF8] resize-none"
                  />
                  {walletPayoffError && (
                    <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{walletPayoffError}</div>
                  )}
                  <button type="submit" disabled={walletPayoffSubmitting || !walletPayoffAmount || parseFloat(walletPayoffAmount) <= 0}
                    className="w-full bg-violet-600 text-white rounded-xl py-3 text-sm font-bold hover:bg-violet-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition">
                    {walletPayoffSubmitting ? 'Processing...' : 'Pay with wallet'}
                  </button>
                </form>
              ) : (
                <div className="rounded-xl border border-dashed border-[#E7E1D6] bg-[#FBF9F4] px-4 py-6 text-center">
                  <Wallet className="mx-auto h-6 w-6 text-[#C4BFB5]" />
                  <p className="mt-2 text-sm text-[#9A9488]">
                    {isTerminatedBooking ? 'Wallet payoff is not available for terminated bookings.'
                      : overdueAmount <= 0 ? 'No overdue amount on this booking.'
                      : 'Client wallet balance is empty.'}
                  </p>
                </div>
              )}
            </Card>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════
            TAB: STAFF & SWAPS
        ═══════════════════════════════════════════════════════════════════ */}
        {activeSection === 'staff' && (
          <div className="flex flex-col gap-4">

            {/* Current staff + swap trigger */}
            <Card>
              <div className="flex items-start justify-between gap-4 mb-4">
                <div className="text-xs font-bold uppercase tracking-wider text-[#A39D91]">Currently on duty</div>
                {!isTerminatedBooking && (
                  <button
                    onClick={() => setShowSwapModal(true)}
                    className="inline-flex items-center gap-2 bg-[#8C5AA6] text-white rounded-xl px-4 py-2 text-sm font-bold hover:bg-[#7A4A94] transition flex-shrink-0"
                  >
                    <Repeat2 className="h-4 w-4" /> Initiate Swap
                  </button>
                )}
              </div>
              {normalizedCurrentStaff ? (
                <>
                  <div className="flex items-center gap-4 mb-4">
                    <div className="w-12 h-12 rounded-xl bg-[#E7F0F8] text-[#3F77B5] flex items-center justify-center text-lg font-extrabold flex-shrink-0">
                      {(normalizedCurrentStaff.name || '?').split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <div className="text-base font-bold text-[#2A2722]">{normalizedCurrentStaff.name}</div>
                      <div className="text-sm text-[#6F6A60]">{normalizedCurrentStaff.designation}</div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <DetailRow label="Staff ID"  value={normalizedCurrentStaff.id}     mono />
                    <DetailRow label="Phone"      value={formatMobileNumber(normalizedCurrentStaff.mobile)} />
                    <DetailRow label="Email"      value={normalizedCurrentStaff.email}  />
                    <DetailRow label="Daily rate" value={formatMoney(dailyRate)} />
                  </div>
                </>
              ) : (
                <EmptyState icon={Users} text="No staff is currently assigned to this booking." />
              )}
            </Card>

            {/* Allocation history */}
            <Card>
              <CardTitle>Allocation history</CardTitle>
              {sortedAllocationHistory.length === 0 ? (
                <EmptyState icon={Users} text="No staff allocation history is available." />
              ) : (
                <div className="flex flex-col gap-2">
                  {sortedAllocationHistory.map((row, i) => (
                    <div
                      key={row.id || i}
                      className="flex items-center gap-3 rounded-xl p-3.5"
                      style={{
                        background: row.color ? row.color.tint : '#FBF9F4',
                        border: `1px solid ${row.color ? row.color.border : '#EFEAE0'}`,
                        borderLeft: `4px solid ${row.color ? row.color.solid : '#E7E1D6'}`,
                      }}
                    >
                      {/* Avatar */}
                      <div
                        className="w-9 h-9 rounded-xl flex-shrink-0 flex items-center justify-center text-white text-xs font-extrabold"
                        style={{ background: row.color ? row.color.solid : '#D5CFC4' }}
                      >
                        {(row.name || '?').split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()}
                      </div>

                      {/* Name + date range */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[13.5px] font-bold text-[#2A2722]">{row.name}</span>
                          {row.designation !== '-' && (
                            <span className="text-xs text-[#A39D91]">{row.designation}</span>
                          )}
                          {row.isOngoing && (
                            <span className="text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-100 px-1.5 py-0.5 rounded-full">
                              Active
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-[#6F6A60] mt-0.5">
                          {formatDate(row.startDate)}
                          <span className="mx-1.5 text-[#C4BFB5]">→</span>
                          {row.effectiveEnd
                            ? formatDate(row.effectiveEnd)
                            : <span className="text-emerald-600 font-semibold">Ongoing</span>}
                        </div>
                      </div>

                      {/* Day range + stats */}
                      <div className="text-right flex-shrink-0 flex flex-col items-end gap-1">
                        <div
                          className="text-xs font-bold px-2.5 py-1 rounded-lg"
                          style={{
                            background: row.color ? row.color.solid : '#E7E1D6',
                            color: row.color ? 'white' : '#5A554B',
                          }}
                        >
                          Day {row.dayStart ?? '?'}{' '}
                          {row.isOngoing
                            ? '→ ongoing'
                            : `→ Day ${row.dayEnd ?? '?'}`}
                        </div>
                        <div className="text-[11px] text-[#A39D91]">
                          {row.dayCount !== null
                            ? `${row.dayCount} day${row.dayCount !== 1 ? 's' : ''}`
                            : row.isOngoing && row.dayStart !== null && plannedDays
                              ? `${plannedDays - row.dayStart + 1} planned`
                              : '—'}
                        </div>
                        {row.amountAllocated > 0 && (
                          <div className="text-[11px] font-semibold text-[#5A554B]">{formatMoney(row.amountAllocated)}</div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {/* Swap history */}
            <Card>
              <CardTitle>Swap history</CardTitle>
              {normalizedSwapHistory.length === 0 ? (
                <EmptyState icon={Repeat2} text="No staff swap history has been recorded for this booking." />
              ) : (
                <div className="flex flex-col gap-3">
                  {normalizedSwapHistory.map((swap, i) => (
                    <div key={swap.id || i} className="flex items-start gap-4 bg-[#FBF9F4] border border-[#EFEAE0] rounded-xl p-4">
                      <div className="flex items-center gap-2 flex-shrink-0 pt-0.5">
                        <span className="text-sm font-bold text-[#2A2722]">{swap.oldStaffName}</span>
                        <span className="text-[#B6AFA2] text-base">→</span>
                        <span className="text-sm font-bold text-[#2A2722]">{swap.newStaffName}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs text-[#A39D91] mb-1">{formatDateTime(swap.swappedAt)}</div>
                        <div className="text-sm text-[#5A554B]">{swap.reason || 'No reason provided.'}</div>
                        {swap.swappedByMobile && (
                          <div className="text-xs text-[#A39D91] mt-1">Swapped by {formatMobileNumber(swap.swappedByMobile)}</div>
                        )}
                      </div>
                      <Pill tone={swap.billingGap ? 'amber' : 'violet'}>
                        {swap.billingGap ? 'Billing gap' : 'Recorded'}
                      </Pill>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════
            TAB: CLIENT & CARE
        ═══════════════════════════════════════════════════════════════════ */}
        {activeSection === 'client' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Client card */}
            <Card>
              <div className="flex items-center gap-3 mb-5">
                <div className="w-10 h-10 rounded-xl bg-[#E4F1ED] text-[#137A6B] flex items-center justify-center text-sm font-extrabold flex-shrink-0">
                  {(clientDetails.client_name || 'C').split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()}
                </div>
                <h3 className="text-[15px] font-bold text-[#2A2722]">Client</h3>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <DetailRow label="Name"      value={clientDetails.client_name} />
                <DetailRow label="Client ID" value={clientDetails.client_profile_id || bookingSummary.client_id || '-'} mono />
                <DetailRow label="Phone"     value={formatMobileNumber(clientDetails.client_mobile || clientDetails.mobile) || '-'} />
                <DetailRow label="Email"     value={clientDetails.client_email  || clientDetails.email  || '-'} />
                <div className="col-span-2">
                  <DetailRow label="Address" value={clientDetails.client_address || clientDetails.address || '-'} />
                </div>
              </div>
            </Card>

            {/* Care profile card */}
            <Card>
              <div className="flex items-center gap-3 mb-5">
                <div className="w-10 h-10 rounded-xl bg-[#F2E9F4] text-[#8C5AA6] flex items-center justify-center text-sm font-extrabold flex-shrink-0">
                  {(patientDetails.patient_name || 'P').split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()}
                </div>
                <h3 className="text-[15px] font-bold text-[#2A2722]">Care profile</h3>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <DetailRow label="Patient"      value={patientDetails.patient_name} />
                <DetailRow label="Age"          value={patientDetails.patient_age || '-'} />
                <DetailRow label="Relationship" value={patientDetails.relationship_to_client || '-'} />
                <DetailRow label="Mobility"     value={patientDetails.mobility || '-'} />
                <div className="col-span-2">
                  <DetailRow label="Condition" value={patientDetails.medical_condition || '-'} />
                </div>
              </div>
            </Card>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════
            TAB: SETTLEMENT
        ═══════════════════════════════════════════════════════════════════ */}
        {activeSection === 'settlement' && (
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.5fr] gap-4 items-start">

            {/* Left column: snapshot + statement */}
            <div className="flex flex-col gap-4">
              <Card>
                <CardTitle>Booking snapshot</CardTitle>
                <div className="flex flex-col gap-3">
                  {[
                    { label: 'Booking code', value: bookingSummary.booking_code || '-', mono: true },
                    { label: 'Status',       value: bookingSummary.status       || '-' },
                    { label: 'Service',      value: bookingSummary.service_type || '-' },
                    { label: 'Start',        value: formatDate(bookingSummary.start_date) },
                    { label: 'Planned end',  value: formatDate(bookingSummary.scheduled_end_time) },
                  ].map(({ label, value, mono }) => (
                    <div key={label} className="flex items-center justify-between gap-4">
                      <span className="text-sm text-[#7A756A] whitespace-nowrap">{label}</span>
                      <span className={`text-sm font-semibold text-[#2A2722] ${mono ? 'font-mono' : ''} text-right`}>{value}</span>
                    </div>
                  ))}
                </div>
              </Card>

              <Card>
                <CardTitle>Statement</CardTitle>
                <p className="text-xs text-[#9A9488] -mt-3 mb-4">Download the client billing statement.</p>
                <div className="flex gap-2 mb-3">
                  {[
                    { label: '7 days',   fn: () => { const t = new Date(); setStatementStartDate(toDateInputValue(addDays(t, -7)));  setStatementEndDate(toDateInputValue(t)); } },
                    { label: '30 days',  fn: () => { const t = new Date(); setStatementStartDate(toDateInputValue(addDays(t, -30))); setStatementEndDate(toDateInputValue(t)); } },
                    { label: 'All time', fn: () => { setStatementStartDate('2000-01-01'); setStatementEndDate(toDateInputValue(new Date())); } },
                  ].map(({ label, fn }) => (
                    <button key={label} type="button" onClick={fn}
                      className="flex-1 text-xs font-semibold border border-[#E7E1D6] rounded-lg py-2 text-[#5A554B] hover:bg-[#F6F3EC] transition">
                      {label}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2 mb-3">
                  <DateInput value={statementStartDate} onChange={(e) => setStatementStartDate(e.target.value)}
                    className="flex-1 border border-[#E2DCD0] rounded-xl px-3 py-2 text-sm outline-none focus:border-[#137A6B] bg-[#FCFBF8] text-[#6F6A60]" />
                  <DateInput value={statementEndDate} onChange={(e) => setStatementEndDate(e.target.value)}
                    className="flex-1 border border-[#E2DCD0] rounded-xl px-3 py-2 text-sm outline-none focus:border-[#137A6B] bg-[#FCFBF8] text-[#6F6A60]" />
                </div>
                <button onClick={downloadStatement} disabled={statementLoading || !statementClientId}
                  className="w-full bg-[#2A2722] text-white rounded-xl py-2.5 text-sm font-bold hover:bg-[#1A1714] disabled:opacity-60 disabled:cursor-not-allowed transition flex items-center justify-center gap-2">
                  {statementLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                  Download statement PDF
                </button>
              </Card>
            </div>

            {/* Right column: close-out form (hidden for terminated bookings) */}
            {!isTerminatedBooking ? (
              <Card>
                <CardTitle>Close out booking</CardTitle>
                <p className="text-xs text-[#9A9488] -mt-3 mb-5">Complete or terminate with a settlement decision for the remaining balance.</p>
                <div className="flex flex-col gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-[#7A756A] mb-1.5">Actual end time</label>
                    <DateTimeInput value={actualEndTime} onChange={(e) => setActualEndTime(e.target.value)}
                      className="w-full border border-[#E2DCD0] rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#137A6B] bg-[#FCFBF8] text-[#6F6A60]" />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-xs font-semibold text-[#7A756A] whitespace-nowrap">Outstanding balance</label>
                      {overdueAmount > 0 && (
                        <span className="text-xs font-semibold text-[#BC4338] bg-[#F7E6E3] rounded-lg px-2.5 py-1 whitespace-nowrap">{formatMoney(overdueAmount)} due</span>
                      )}
                    </div>
                    {remainingBalance > 0 ? (
                      <div className="flex flex-col gap-2">
                        {[
                          { value: 'WALLET_DEPOSIT', title: 'Collect to wallet',    desc: 'Record the shortfall against the client wallet for follow-up.' },
                          { value: 'NO_REFUND',      title: 'Write off · no recovery', desc: 'Close the balance with a note explaining the decision.' },
                        ].map(({ value, title, desc }) => (
                          <div
                            key={value}
                            onClick={() => setSettlementAction(value)}
                            className={`cursor-pointer rounded-xl p-3.5 transition ${settlementAction === value
                              ? 'border-[1.5px] border-[#137A6B] bg-[#E4F1ED]'
                              : 'border border-[#E7E1D6] bg-[#FCFBF8] hover:border-slate-300'}`}
                          >
                            <div className="text-sm font-bold text-[#2A2722]">{title}</div>
                            <div className="text-xs text-[#7A756A] mt-1">{desc}</div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="rounded-xl border border-[#E7E1D6] bg-[#FBF9F4] p-3 text-sm text-[#6F6A60]">
                        No settlement action required — no remaining balance.
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[#7A756A] mb-1.5">Settlement note</label>
                    <textarea rows={3} value={settlementNote} onChange={(e) => setSettlementNote(e.target.value)}
                      placeholder="Explain the settlement decision…"
                      className="w-full border border-[#E2DCD0] rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#137A6B] bg-[#FCFBF8] resize-none" />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[#7A756A] mb-1.5">Reason (optional)</label>
                    <textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)}
                      placeholder="Optional admin note"
                      className="w-full border border-[#E2DCD0] rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#137A6B] bg-[#FCFBF8] resize-none" />
                  </div>

                  <div className="flex gap-3">
                    <button onClick={() => submitAdminAction('complete')} disabled={actionLoading === 'complete'}
                      className="flex-1 flex items-center justify-center gap-2 bg-[#137A6B] text-white rounded-xl py-3 text-sm font-bold hover:bg-[#0F6559] disabled:opacity-60 disabled:cursor-not-allowed transition">
                      {actionLoading === 'complete' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                      Complete booking
                    </button>
                    <button onClick={() => submitAdminAction('terminate')} disabled={actionLoading === 'terminate'}
                      className="flex-1 flex items-center justify-center gap-2 bg-white border border-[#E3B5AF] text-[#BC4338] rounded-xl py-3 text-sm font-bold hover:bg-rose-50 disabled:opacity-60 disabled:cursor-not-allowed transition">
                      {actionLoading === 'terminate' ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                      Terminate booking
                    </button>
                  </div>
                </div>
              </Card>
            ) : (
              <Card>
                <div className="flex flex-col items-center justify-center py-10 text-center">
                  <XCircle className="h-8 w-8 text-rose-300 mb-3" />
                  <p className="text-sm font-semibold text-[#2A2722]">Booking terminated</p>
                  <p className="text-xs text-[#9A9488] mt-1">
                    Terminated on {formatDate(bookingSummary.actual_end_time || bookingSummary.updated_at)}
                  </p>
                </div>
              </Card>
            )}
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════
            TAB: TERMINATION
        ═══════════════════════════════════════════════════════════════════ */}
        {activeSection === 'termination' && (
          <Card>
            <div className="flex items-center gap-3 mb-4">
              <div className="rounded-full bg-rose-100 p-2 text-rose-600"><AlertTriangle className="h-4 w-4" /></div>
              <h3 className="text-[15px] font-bold text-[#2A2722]">Termination requests</h3>
            </div>
            {terminationRequests.length === 0 ? (
              <EmptyState icon={AlertTriangle} text="No termination requests are pending or recorded for this booking." />
            ) : (
              <div className="flex flex-col gap-3">
                {terminationRequests.map((req, i) => (
                  <div key={req.termination_request_id || req.id || i} className="bg-[#FBF9F4] border border-[#EFEAE0] rounded-xl p-4">
                    <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
                      <div>
                        <p className="font-semibold text-[#2A2722]">{req.requested_by_name || req.requested_by || 'Termination request'}</p>
                        <p className="text-xs text-[#A39D91]">Requested {formatDateTime(req.requested_at || req.created_at)}</p>
                      </div>
                      <Pill tone={req.status === 'APPROVED' ? 'green' : req.status === 'REJECTED' ? 'rose' : 'amber'}>
                        {req.status || 'Pending'}
                      </Pill>
                    </div>
                    <div className="grid grid-cols-2 gap-4 mb-3">
                      <DetailRow label="Requested end" value={formatDateTime(req.requested_end_time || req.requested_end_date)} />
                      <DetailRow label="Approved end"  value={formatDateTime(req.end_time || req.approved_end_time)} />
                    </div>
                    <p className="text-sm text-[#5A554B]">{req.reason || req.request_reason || 'No reason provided.'}</p>
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}

        {/* ═══════════════════════════════════════════════════════════════════
            TAB: OVERVIEW
        ═══════════════════════════════════════════════════════════════════ */}
        {activeSection === 'overview' && (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card>
                <CardTitle>Booking details</CardTitle>
                <div className="grid grid-cols-2 gap-4">
                  <DetailRow label="Booking code"   value={bookingSummary.booking_code || '-'} mono />
                  <DetailRow label="Status"         value={bookingSummary.status || '-'} />
                  <DetailRow label="Service type"   value={bookingSummary.service_type || '-'} />
                  <DetailRow label="Service model"  value={bookingSummary.service_model || '-'} />
                  <DetailRow label="Start date"     value={formatDate(bookingSummary.start_date)} />
                  <DetailRow label="Planned end"    value={formatDate(bookingSummary.scheduled_end_time)} />
                  {bookingSummary.actual_end_time && (
                    <DetailRow label="Actual end"   value={formatDateTime(bookingSummary.actual_end_time)} />
                  )}
                  <DetailRow label="Created"        value={formatDateTime(bookingSummary.created_at)} />
                </div>
              </Card>

              <Card>
                <CardTitle>Financial snapshot</CardTitle>
                <div className="flex flex-col gap-3">
                  {[
                    { label: 'Total paid',         value: formatMoney(totalPaid) },
                    { label: 'Total invoiced',      value: formatMoney(totalInvoiced) },
                    { label: 'Remaining balance',   value: formatMoney(remainingBalance) },
                    { label: 'Overdue amount',      value: formatMoney(overdueAmount), red: overdueAmount > 0 },
                    { label: 'Daily rate',          value: formatMoney(dailyRate) },
                    { label: 'Amount quotated',     value: formatMoney(bookingSummary.amount_quotated ?? 0) },
                    { label: 'Registration fee',    value: formatMoney(bookingSummary.registration_fee ?? 0) },
                  ].map(({ label, value, red }) => (
                    <div key={label} className="flex items-center justify-between gap-4">
                      <span className="text-sm text-[#6F6A60]">{label}</span>
                      <span className={`text-sm font-semibold ${red ? 'text-[#BC4338]' : 'text-[#2A2722]'}`}>{value}</span>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          </div>
        )}

      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          ACTIONS MODAL — Complete / Terminate booking
      ═══════════════════════════════════════════════════════════════════ */}
      {showActionsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg flex flex-col max-h-[90vh]">

            {/* Header */}
            <div className="flex items-start justify-between p-6 border-b border-[#ECE7DF] shrink-0">
              <div>
                <h2 className="text-lg font-bold text-[#2A2722]">Close Out Booking</h2>
                <p className="text-sm text-[#9A9488] mt-0.5">
                  {actionsModalStep === 1
                    ? 'Choose how to close this booking'
                    : actionsModalStep === 2
                    ? 'Decide what to do with the remaining balance'
                    : 'Review and confirm — this action is irreversible'}
                </p>
              </div>
              <button onClick={handleActionsModalClose} className="p-1.5 rounded-lg hover:bg-[#F6F3EC] transition ml-4 shrink-0">
                <XCircle className="h-5 w-5 text-[#A39D91]" />
              </button>
            </div>

            {/* Step progress bar */}
            {(() => {
              const total = remainingBalance > 0 ? 3 : 2;
              const current = actionsModalStep === 3 ? total : actionsModalStep;
              return (
                <div className="flex items-center gap-2 px-6 pt-4 shrink-0">
                  {Array.from({ length: total }, (_, i) => i + 1).map((s) => (
                    <div
                      key={s}
                      className={`h-1.5 flex-1 rounded-full transition-all ${s <= current ? 'bg-[#137A6B]' : 'bg-[#E7E1D6]'}`}
                    />
                  ))}
                  <span className="text-xs text-[#9A9488] ml-1 shrink-0">Step {current} of {total}</span>
                </div>
              );
            })()}

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">

              {/* ── Step 1: Choose action ── */}
              {actionsModalStep === 1 && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { mode: 'complete',   icon: CheckCircle, label: 'Complete',   desc: 'Service finished as planned',        activeBorder: 'border-[#137A6B] bg-[#E4F1ED]', activeIcon: 'text-[#137A6B]' },
                      { mode: 'terminate',  icon: XCircle,     label: 'Terminate',  desc: 'End early before service concludes', activeBorder: 'border-[#BC4338] bg-rose-50',    activeIcon: 'text-[#BC4338]' },
                    ].map(({ mode, icon: Icon, label, desc, activeBorder, activeIcon }) => (
                      <div
                        key={mode}
                        onClick={() => setActionsModalMode(mode)}
                        className={`cursor-pointer rounded-xl p-4 border-2 transition ${actionsModalMode === mode ? activeBorder : 'border-[#E7E1D6] hover:border-slate-300'}`}
                      >
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
                        <DateTimeInput
                          value={actualEndTime}
                          onChange={(e) => setActualEndTime(e.target.value)}
                          className="w-full border border-[#E2DCD0] rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#137A6B] bg-[#FCFBF8] text-[#6F6A60]"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-[#7A756A] mb-1.5">
                          Reason <span className="text-[#C4BFB5] font-normal">(optional)</span>
                        </label>
                        <textarea
                          rows={3}
                          value={reason}
                          onChange={(e) => setReason(e.target.value)}
                          placeholder={actionsModalMode === 'complete' ? 'e.g. Service completed as per contract' : 'e.g. Client requested early termination'}
                          className="w-full border border-[#E2DCD0] rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#137A6B] bg-[#FCFBF8] resize-none"
                        />
                      </div>
                    </>
                  )}
                </>
              )}

              {/* ── Step 2: Settlement ── */}
              {actionsModalStep === 2 && (
                <>
                  <div className="rounded-xl border border-[#ECE7DF] bg-[#FBF9F4] p-4">
                    <div className="text-xs font-semibold uppercase tracking-wider text-[#9A9488] mb-1">Client's remaining balance</div>
                    <div className="text-2xl font-extrabold text-[#2A2722] tracking-tight">{formatMoney(remainingBalance)}</div>
                    <div className="text-xs text-[#7A756A] mt-1">The client has prepaid more than the amount invoiced so far.</div>
                  </div>

                  <div className="flex flex-col gap-2.5">
                    {[
                      { value: 'WALLET_DEPOSIT', icon: Wallet,      label: 'Credit to client wallet',  desc: `Add ${formatMoney(remainingBalance)} to the client's wallet for future services.`,                                                         activeCls: 'border-violet-400 bg-violet-50', activeIcon: 'text-violet-600' },
                      { value: 'BANK_REFUND',    icon: DollarSign,  label: 'Process bank refund',      desc: `Return ${formatMoney(remainingBalance)} to the client's bank account. You will complete the transfer separately.`,                         activeCls: 'border-blue-400 bg-blue-50',    activeIcon: 'text-blue-600'   },
                      { value: 'NO_REFUND',      icon: XCircle,     label: 'Write off · no refund',    desc: 'Forfeit the remaining balance. A written explanation is required.',                                                                          activeCls: 'border-[#BC4338] bg-rose-50',   activeIcon: 'text-[#BC4338]'  },
                    ].map(({ value, icon: Icon, label, desc, activeCls, activeIcon }) => (
                      <div
                        key={value}
                        onClick={() => { setSettlementAction(value); setActionsModalError(''); }}
                        className={`cursor-pointer rounded-xl p-4 border-2 transition flex items-start gap-3 ${settlementAction === value ? activeCls : 'border-[#E7E1D6] hover:border-slate-300'}`}
                      >
                        <Icon className={`h-5 w-5 mt-0.5 flex-shrink-0 ${settlementAction === value ? activeIcon : 'text-[#C4BFB5]'}`} />
                        <div>
                          <div className="text-sm font-bold text-[#2A2722]">{label}</div>
                          <div className="text-xs text-[#7A756A] mt-0.5">{desc}</div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[#7A756A] mb-1.5">
                      Settlement note
                      {settlementAction === 'NO_REFUND'
                        ? <span className="text-[#BC4338] ml-1">*</span>
                        : <span className="text-[#C4BFB5] font-normal ml-1">(optional)</span>}
                    </label>
                    <textarea
                      rows={3}
                      value={settlementNote}
                      onChange={(e) => { setSettlementNote(e.target.value); setActionsModalError(''); }}
                      placeholder={settlementAction === 'NO_REFUND' ? 'Required — explain why no refund is being issued' : 'Any additional notes about this settlement…'}
                      className={`w-full border rounded-xl px-3 py-2.5 text-sm outline-none bg-[#FCFBF8] resize-none ${actionsModalError ? 'border-rose-300 focus:border-rose-400' : 'border-[#E2DCD0] focus:border-[#137A6B]'}`}
                    />
                  </div>

                  {actionsModalError && (
                    <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{actionsModalError}</div>
                  )}
                </>
              )}

              {/* ── Step 3: Confirmation ── */}
              {actionsModalStep === 3 && (
                <>
                  <div className="rounded-xl bg-amber-50 border border-amber-200 p-4">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
                      <div>
                        <div className="text-sm font-bold text-amber-900">This action is irreversible</div>
                        <div className="text-xs text-amber-700 mt-1">
                          Once confirmed, this booking will be permanently{' '}
                          {actionsModalMode === 'complete' ? 'marked as completed' : 'terminated'}.
                          The assigned staff member will be freed and marked as available.
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-xl border border-[#ECE7DF] bg-[#FBF9F4] p-4">
                    <div className="text-xs font-bold uppercase tracking-wider text-[#9A9488] mb-3">Summary</div>
                    <div className="flex flex-col gap-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-[#6F6A60]">Action</span>
                        <span className={`text-sm font-bold ${actionsModalMode === 'complete' ? 'text-[#137A6B]' : 'text-[#BC4338]'}`}>
                          {actionsModalMode === 'complete' ? 'Complete booking' : 'Terminate booking'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-[#6F6A60]">Booking</span>
                        <span className="text-sm font-semibold font-mono text-[#2A2722]">{bookingSummary.booking_code || bookingId}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-[#6F6A60]">End time</span>
                        <span className="text-sm font-semibold text-[#2A2722]">{formatDateTime(actualEndTime)}</span>
                      </div>
                      {remainingBalance > 0 && (
                        <>
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-[#6F6A60]">Remaining balance</span>
                            <span className="text-sm font-bold text-[#2A2722]">{formatMoney(remainingBalance)}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-[#6F6A60]">Settlement</span>
                            <span className="text-sm font-semibold text-[#2A2722]">
                              {settlementAction === 'WALLET_DEPOSIT' ? 'Credit to wallet'
                               : settlementAction === 'BANK_REFUND'  ? 'Bank refund'
                               : 'Write off (no refund)'}
                            </span>
                          </div>
                        </>
                      )}
                      {reason.trim() && (
                        <div className="flex items-start justify-between gap-4">
                          <span className="text-sm text-[#6F6A60] shrink-0">Reason</span>
                          <span className="text-sm font-semibold text-[#2A2722] text-right">{reason.trim()}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {actionsModalError && (
                    <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{actionsModalError}</div>
                  )}
                </>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-6 py-4 border-t border-[#ECE7DF] shrink-0">
              <button
                onClick={actionsModalStep === 1 ? handleActionsModalClose : handleActionsModalBack}
                disabled={actionsModalLoading}
                className="text-sm font-semibold text-[#7A756A] hover:text-[#2A2722] transition disabled:opacity-40"
              >
                {actionsModalStep === 1 ? 'Cancel' : '← Back'}
              </button>
              {actionsModalStep < 3 ? (
                <button
                  onClick={handleActionsModalNext}
                  disabled={actionsModalStep === 1 && !actionsModalMode}
                  className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-bold text-white bg-[#137A6B] hover:bg-[#0F6559] rounded-xl transition disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Continue →
                </button>
              ) : (
                <button
                  onClick={handleActionsModalSubmit}
                  disabled={actionsModalLoading}
                  className={`inline-flex items-center gap-2 px-5 py-2.5 text-sm font-bold text-white rounded-xl transition disabled:opacity-60 disabled:cursor-not-allowed ${
                    actionsModalMode === 'complete' ? 'bg-[#137A6B] hover:bg-[#0F6559]' : 'bg-[#BC4338] hover:bg-[#A03830]'
                  }`}
                >
                  {actionsModalLoading
                    ? <Loader2 className="h-4 w-4 animate-spin" />
                    : actionsModalMode === 'complete' ? <CheckCircle className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                  {actionsModalLoading ? 'Processing…' : `Confirm ${actionsModalMode === 'complete' ? 'Complete' : 'Terminate'}`}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          STAFF SWAP MODAL (unchanged logic)
      ═══════════════════════════════════════════════════════════════════ */}
      {showSwapModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col">

            <div className="flex items-start justify-between p-6 border-b border-slate-200 shrink-0">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Swap Staff Member</h2>
                <p className="text-sm text-slate-500 mt-0.5">
                  {swapModalStep === 1
                    ? 'Select a replacement from the available staff list'
                    : `Confirm: ${normalizedCurrentStaff?.name || 'Current staff'} → ${swapModalSelectedStaff?.full_name}`}
                </p>
              </div>
              <button onClick={handleSwapModalClose} className="p-1.5 rounded-lg hover:bg-slate-100 transition shrink-0 ml-4">
                <XCircle className="h-5 w-5 text-slate-400" />
              </button>
            </div>

            {swapModalStep === 1 && (() => {
              const PAGE_SIZE = 4;
              const designations = [...new Set(availableStaff.map((s) => s.designation).filter(Boolean))].sort();
              const q = swapModalSearch.toLowerCase();
              const filtered = availableStaff.filter((s) =>
                (!q || s.full_name?.toLowerCase().includes(q) || s.staff_code?.toLowerCase().includes(q) || s.designation?.toLowerCase().includes(q) || s.mobile_number?.includes(q)) &&
                (!swapModalDesignation || s.designation === swapModalDesignation)
              );
              const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
              const paginated  = filtered.slice((swapModalPage - 1) * PAGE_SIZE, swapModalPage * PAGE_SIZE);

              return (
                <>
                  <div className="px-6 py-3 border-b border-slate-100 shrink-0 space-y-2">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                      <input
                        type="text" autoFocus
                        placeholder="Search by name, designation, or phone..."
                        value={swapModalSearch}
                        onChange={(e) => { setSwapModalSearch(e.target.value); setSwapModalPage(1); }}
                        className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                    {designations.length > 0 && (
                      <div className="flex items-center gap-2 flex-wrap">
                        <button
                          onClick={() => { setSwapModalDesignation(''); setSwapModalPage(1); }}
                          className={`px-3 py-1 rounded-full text-xs font-medium transition ${!swapModalDesignation ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                        >All</button>
                        {designations.map((d) => (
                          <button key={d}
                            onClick={() => { setSwapModalDesignation(swapModalDesignation === d ? '' : d); setSwapModalPage(1); }}
                            className={`px-3 py-1 rounded-full text-xs font-medium transition ${swapModalDesignation === d ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                          >{d}</button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex-1 overflow-y-auto p-4 space-y-2">
                    {availableStaff.length === 0 ? (
                      <EmptyState icon={Users} text="No available staff members found." />
                    ) : filtered.length === 0 ? (
                      <EmptyState icon={Users} text="No staff match your filters." />
                    ) : (
                      paginated.map((s) => (
                        <div key={s.staff_profile_id} className="flex items-center justify-between gap-4 p-4 rounded-xl border border-slate-200 hover:border-blue-200 hover:bg-blue-50/30 transition">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center shrink-0 overflow-hidden">
                              {s.profile_picture_url
                                ? <img src={s.profile_picture_url} alt={s.full_name} className="w-10 h-10 object-cover" />
                                : <User className="w-5 h-5 text-slate-400" />}
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-slate-900 truncate">
                                {s.full_name}
                                {s.staff_code && <span className="ml-2 text-[10px] font-semibold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">{s.staff_code}</span>}
                              </p>
                              {(s.designation || s.gender) && <p className="text-xs text-slate-500">{s.designation}{s.designation && s.gender ? ' · ' : ''}{s.gender ? (s.gender === 'MALE' ? 'Male' : s.gender === 'FEMALE' ? 'Female' : s.gender) : ''}</p>}
                              {s.mobile_number && (
                                <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                                  <Phone className="w-3 h-3" /> {formatMobileNumber(s.mobile_number)}
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                            <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/20">
                              <CheckCircle className="w-3 h-3" /> Available
                            </span>
                            <button onClick={() => handleSwapModalSelectStaff(s)}
                              className="px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition">
                              Select
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  {filtered.length > PAGE_SIZE && (
                    <div className="flex items-center justify-between px-6 py-3 border-t border-slate-100 shrink-0">
                      <button onClick={() => setSwapModalPage((p) => Math.max(1, p - 1))} disabled={swapModalPage === 1}
                        className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition">
                        ← Previous
                      </button>
                      <span className="text-xs text-slate-500">Page {swapModalPage} of {totalPages} · {filtered.length} staff</span>
                      <button onClick={() => setSwapModalPage((p) => Math.min(totalPages, p + 1))} disabled={swapModalPage === totalPages}
                        className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition">
                        Next →
                      </button>
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
                      <div className="w-12 h-12 rounded-full bg-rose-100 flex items-center justify-center mx-auto mb-2">
                        <User className="w-6 h-6 text-rose-400" />
                      </div>
                      <p className="text-sm font-semibold text-slate-900 truncate">{normalizedCurrentStaff?.name || '-'}</p>
                    </div>
                    <div className="flex items-center justify-center">
                      <Repeat2 className="w-7 h-7 text-slate-300" />
                    </div>
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-center">
                      <p className="text-xs text-emerald-600 mb-2 font-medium uppercase tracking-wide">New Staff</p>
                      <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-2 overflow-hidden">
                        {swapModalSelectedStaff.profile_picture_url
                          ? <img src={swapModalSelectedStaff.profile_picture_url} alt={swapModalSelectedStaff.full_name} className="w-12 h-12 object-cover" />
                          : <User className="w-6 h-6 text-emerald-600" />}
                      </div>
                      <p className="text-sm font-semibold text-slate-900 truncate">{swapModalSelectedStaff.full_name}</p>
                      {swapModalSelectedStaff.mobile_number && (
                        <p className="text-xs text-slate-500 mt-0.5">{formatMobileNumber(swapModalSelectedStaff.mobile_number)}</p>
                      )}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
                      New staff start date <span className="text-rose-500">*</span>
                    </label>
                    <DateInput
                      value={swapModalStartDate}
                      onChange={(e) => setSwapModalStartDate(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    />
                    <p className="text-xs text-slate-400 mt-1">
                      The calendar simulation will show this nurse from this date onwards once the swap is saved.
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
                      Reason for swap <span className="text-rose-500">*</span>
                    </label>
                    <textarea
                      rows={3} value={swapModalReason} onChange={(e) => setSwapModalReason(e.target.value)}
                      placeholder="e.g. Staff requested leave, client preference, medical reasons..."
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    />
                  </div>

                  <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800">
                    After confirming, WhatsApp and SMS notifications will be sent to the current staff, new staff, and the client.
                  </div>

                  {swapModalError && (
                    <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-sm text-rose-700">{swapModalError}</div>
                  )}
                </div>

                <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 shrink-0">
                  <button onClick={() => setSwapModalStep(1)} className="text-sm font-medium text-slate-600 hover:text-slate-900 transition">
                    ← Back
                  </button>
                  <button
                    onClick={handleSwapModalConfirm}
                    disabled={swapModalSubmitting || !swapModalReason.trim() || !swapModalStartDate}
                    className="inline-flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-violet-600 hover:bg-violet-700 rounded-lg transition disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {swapModalSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Repeat2 className="h-4 w-4" />}
                    {swapModalSubmitting ? 'Swapping...' : 'Confirm Swap'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </AdminLayout>
  );
};

export default BookingDetailPage;
