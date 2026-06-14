import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle,
  Clock,
  Download,
  FileText,
  History,
  Loader2,
  Mail,
  MapPin,
  Phone,
  RefreshCw,
  Repeat2,
  ShieldCheck,
  CircleDollarSign,
  Upload,
  User,
  Wallet,
  Users,
  XCircle,
  AlertTriangle,
  DollarSign,
  Activity,
} from 'lucide-react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import AdminLayout from '../components/AdminLayout';
import apiClient from '../../../api/api';
import { useAdminAuth } from '../../../context/AdminAuthContext';

const initialPaymentForm = {
  amount_received: '',
  payment_method: 'BANK_TRANSFER',
  bank_account_id: '',
  cheque_number: '',
  cheque_date: '',
  reference_number: '',
  notes: '',
};

const moneyFormatter = new Intl.NumberFormat('en-LK', {
  style: 'currency',
  currency: 'LKR',
  maximumFractionDigits: 2,
});

const formatMoney = (value) => moneyFormatter.format(Number(value || 0));

const formatDate = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

const formatDateTime = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
};

const toDatetimeLocalValue = (value = new Date()) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const offsetMs = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
};

const toDateInputValue = (value = new Date()) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return date.toISOString().slice(0, 10);
};

const addDays = (date, days) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

const statusStyles = {
  active: 'bg-emerald-100 text-emerald-700',
  completed: 'bg-blue-100 text-blue-700',
  cancelled: 'bg-rose-100 text-rose-700',
  terminated: 'bg-rose-100 text-rose-700',
  pending_termination: 'bg-amber-100 text-amber-700',
  pending: 'bg-slate-100 text-slate-700',
};

const sectionCard = 'bg-white rounded-2xl border border-slate-200 shadow-sm';

const DetailRow = ({ label, value, mono = false }) => (
  <div>
    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">{label}</p>
    <p className={`text-sm text-slate-900 ${mono ? 'font-mono' : 'font-medium'}`}>{value ?? '-'}</p>
  </div>
);

const Pill = ({ children, tone = 'slate' }) => {
  const palette = {
    slate: 'bg-slate-100 text-slate-700',
    blue: 'bg-blue-100 text-blue-700',
    green: 'bg-emerald-100 text-emerald-700',
    amber: 'bg-amber-100 text-amber-700',
    rose: 'bg-rose-100 text-rose-700',
    violet: 'bg-violet-100 text-violet-700',
  };

  return <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${palette[tone] || palette.slate}`}>{children}</span>;
};

const BookingDetailPage = () => {
  const { adminToken } = useAdminAuth();
  const navigate = useNavigate();
  const { bookingId } = useParams();
  const [searchParams] = useSearchParams();

  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionLoading, setActionLoading] = useState('');
  const [statementLoading, setStatementLoading] = useState(false);
  const [activeSection, setActiveSection] = useState(searchParams.get('section') || 'overview');
  const [bankAccounts, setBankAccounts] = useState([]);
  const [availableStaff, setAvailableStaff] = useState([]);
  const [paymentSlipFile, setPaymentSlipFile] = useState(null);
  const [paymentForm, setPaymentForm] = useState(initialPaymentForm);
  const [paymentSubmitting, setPaymentSubmitting] = useState(false);
  const [walletPayoffAmount, setWalletPayoffAmount] = useState('');
  const [walletPayoffNotes, setWalletPayoffNotes] = useState('');
  const [walletPayoffSubmitting, setWalletPayoffSubmitting] = useState(false);
  const [walletPayoffError, setWalletPayoffError] = useState('');
  const [swapForm, setSwapForm] = useState({
    new_staff_id: '',
    swap_reason: '',
    arrival_time: '',
  });
  const [swapSubmitting, setSwapSubmitting] = useState(false);
  const [actualEndTime, setActualEndTime] = useState(toDatetimeLocalValue(new Date()));
  const [reason, setReason] = useState('');
  const [settlementAction, setSettlementAction] = useState('WALLET_DEPOSIT');
  const [settlementNote, setSettlementNote] = useState('');
  const [statementStartDate, setStatementStartDate] = useState(toDateInputValue(addDays(new Date(), -30)));
  const [statementEndDate, setStatementEndDate] = useState(toDateInputValue(new Date()));

  const bookingSummary = detail?.booking_summary || {};
  const clientDetails = detail?.client_details || {};
  const patientDetails = detail?.patient_details || {};
  const currentStaff = detail?.current_staff || {};
  const paymentSummary = detail?.payment_summary || {};
  const invoiceSummary = detail?.invoice_summary || {};
  const paymentHistory = Array.isArray(detail?.payment_history) ? detail.payment_history : [];
  const staffHistory = Array.isArray(detail?.staff_assignment_history) ? detail.staff_assignment_history : [];
  const swapHistory = Array.isArray(detail?.swap_history) ? detail.swap_history : [];
  const terminationRequests = Array.isArray(detail?.termination_requests) ? detail.termination_requests : [];

  const activeStaffRow = staffHistory.find((row) => (row.status || '').toLowerCase() === 'active') || staffHistory[0] || null;
  const normalizedCurrentStaff = currentStaff?.staff_name || currentStaff?.full_name || currentStaff?.name
    ? {
        name: currentStaff.staff_name || currentStaff.full_name || currentStaff.name || '-',
        id: currentStaff.staff_code || currentStaff.staff_profile_id || currentStaff.staff_id || currentStaff.id || '-',
        mobile: currentStaff.staff_mobile || currentStaff.mobile || '-',
        email: currentStaff.staff_email || currentStaff.email || '-',
        designation: currentStaff.designation || currentStaff.staff_designation || '-',
      }
    : activeStaffRow
      ? {
          name: activeStaffRow.full_name || activeStaffRow.staff_name || '-',
          id: activeStaffRow.staff_code || activeStaffRow.staff_profile_id || activeStaffRow.staff_id || '-',
          mobile: activeStaffRow.staff_mobile || activeStaffRow.mobile || '-',
          email: activeStaffRow.staff_email || activeStaffRow.email || '-',
          designation: activeStaffRow.designation || '-',
        }
      : null;

  const normalizedPaymentHistory = paymentHistory.map((payment) => ({
    id: payment.payment_id || payment.id,
    sourceType: payment.source_type || payment.source || 'BOOKING',
    date: payment.payment_date || payment.verified_at || payment.created_at,
    amount: payment.amount_received ?? payment.amount ?? payment.paid_amount ?? 0,
    method: payment.payment_method || payment.method || '-',
    reference: payment.reference_number || payment.reference_no || payment.reference || payment.receipt_no || '-',
    notes: payment.notes || '-',
    status: payment.status || '-',
  }));

  const normalizedStaffHistory = staffHistory.map((row) => ({
    id: row.assignment_id || row.booking_staff_assignment_id || row.id,
    name: row.full_name || row.staff_name || '-',
    staffId: row.staff_code || row.staff_profile_id || row.staff_id || '-',
    designation: row.designation || '-',
    currentStatus: row.current_status || row.status || '-',
    startDate: row.service_start_date || row.assigned_at || row.created_at,
    endDate: row.service_end_date || row.ended_at || row.end_date,
    dailyRate: row.daily_rate ?? row.rate ?? 0,
    amountAllocated: row.amount_allocated ?? row.allocated_amount ?? 0,
  }));

  const normalizedSwapHistory = swapHistory.map((swap) => ({
    id: swap.swap_id || swap.id,
    oldStaffName: swap.old_staff_name || swap.from_staff_name || '-',
    newStaffName: swap.new_staff_name || swap.to_staff_name || '-',
    oldStaffId: swap.old_staff_id || swap.from_staff_id || null,
    newStaffId: swap.new_staff_id || swap.to_staff_id || null,
    swappedAt: swap.swapped_at || swap.created_at,
    reason: swap.swap_reason || swap.reason || swap.note || null,
    arrivalTime: swap.arrival_time || null,
    billingGap: Boolean(swap.billing_gap),
    swappedByMobile: swap.swapped_by_mobile || null,
  }));

  const totalPaid = Number(paymentSummary.total_paid ?? 0);
  const totalInvoiced = Number(invoiceSummary.total_invoiced ?? 0);
  const dailyRate = Number(bookingSummary.quote_daily_rate || bookingSummary.daily_rate || 0);
  const remainingBalance = totalPaid - totalInvoiced;
  const remainingDays = dailyRate > 0 ? remainingBalance / dailyRate : null;
  const overdueAmount = totalPaid > totalInvoiced ? 0 : totalInvoiced - totalPaid;
  const statementClientId = clientDetails.client_profile_id || bookingSummary.client_profile_id || bookingSummary.client_id;
  const lastInvoiceDate = invoiceSummary.last_invoice_at || invoiceSummary.last_invoice_date || null;
  const lastPaymentDate = paymentSummary.last_payment_at || paymentSummary.last_payment_date || null;
  const requiresBankAccount = ['BANK_TRANSFER', 'CASH_DEPOSIT'].includes(paymentForm.payment_method);
  const isCheque = paymentForm.payment_method === 'CHEQUE';
  const selectedSwapStaff = availableStaff.find((staff) => staff.staff_profile_id === swapForm.new_staff_id) || null;

  useEffect(() => {
    if (adminToken && bookingId) {
      fetchBookingDetail();
    }
  }, [adminToken, bookingId]);

  useEffect(() => {
    if (detail) {
      setSettlementAction(remainingBalance > 0 ? 'WALLET_DEPOSIT' : 'NO_REFUND');
    }
  }, [detail, remainingBalance]);

  useEffect(() => {
    if (!adminToken) {
      return;
    }

    const loadBankAccounts = async () => {
      try {
        const originalToken = apiClient.token;
        apiClient.setToken(adminToken);
        const response = await apiClient.getBankAccounts();
        apiClient.setToken(originalToken);
        setBankAccounts(response?.data || []);
      } catch (fetchError) {
        console.error('Failed to load bank accounts for booking payment form:', fetchError);
      }
    };

    loadBankAccounts();
  }, [adminToken]);

  useEffect(() => {
    if (!adminToken || activeSection !== 'staff') {
      return;
    }

    const loadAvailableStaff = async () => {
      try {
        const originalToken = apiClient.token;
        apiClient.setToken(adminToken);
        const response = await apiClient.getAllStaff({ status: 'AVAILABLE', limit: 1000, page: 1 });
        apiClient.setToken(originalToken);
        setAvailableStaff(response?.data || []);
      } catch (fetchError) {
        console.error('Failed to load available staff for swap form:', fetchError);
      }
    };

    loadAvailableStaff();
  }, [adminToken, activeSection]);

  const fetchBookingDetail = async () => {
    try {
      setLoading(true);
      setError('');

      if (!adminToken) {
        setError('Admin authentication required');
        return;
      }

      const originalToken = apiClient.token;
      apiClient.setToken(adminToken);
      const response = await apiClient.getAdminBookingDetail(bookingId);
      apiClient.setToken(originalToken);

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
    if (!statementClientId) {
      setError('Client profile ID is missing for statement generation');
      return;
    }

    try {
      setStatementLoading(true);
      const originalToken = apiClient.token;
      apiClient.setToken(adminToken);
      const response = await apiClient.downloadClientStatement(statementClientId, {
        start_date: statementStartDate,
        end_date: statementEndDate,
      });
      apiClient.setToken(originalToken);

      const blob = response instanceof Blob ? response : new Blob([response], { type: 'application/pdf' });
      const downloadUrl = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = downloadUrl;
      anchor.download = `statement-booking-${bookingSummary.booking_code || bookingSummary.booking_id || bookingId}.pdf`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(downloadUrl);
    } catch (err) {
      setError(err?.message || 'Failed to generate statement');
    } finally {
      setStatementLoading(false);
    }
  };

  const handleSubmitBookingPayment = async (event) => {
    event.preventDefault();

    try {
      setPaymentSubmitting(true);
      setError('');

      const paymentPayload = {
        amount_received: parseFloat(paymentForm.amount_received),
        payment_method: paymentForm.payment_method,
        bank_account_id: paymentForm.bank_account_id || null,
        cheque_number: paymentForm.cheque_number || null,
        cheque_date: paymentForm.cheque_date || null,
        reference_number: paymentForm.reference_number || null,
        notes: paymentForm.notes || null,
      };

      const originalToken = apiClient.token;
      apiClient.setToken(adminToken);
      await apiClient.recordBookingPayment(bookingId, paymentPayload, paymentSlipFile);
      apiClient.setToken(originalToken);

      setPaymentForm(initialPaymentForm);
      setPaymentSlipFile(null);
      await fetchBookingDetail();
    } catch (submitError) {
      setError(submitError?.message || 'Failed to record booking payment');
    } finally {
      setPaymentSubmitting(false);
    }
  };

  const handleSubmitStaffSwap = async (event) => {
    event.preventDefault();

    if (!swapForm.new_staff_id) {
      setError('Please select a staff member to swap in.');
      return;
    }

    const currentStaffName = normalizedCurrentStaff?.name || bookingSummary.staff_name || 'current staff';
    const nextStaffName = selectedSwapStaff?.full_name || 'selected staff';
    const confirmed = window.confirm(`Swap ${currentStaffName} with ${nextStaffName}? This will update the booking immediately.`);

    if (!confirmed) {
      return;
    }

    try {
      setSwapSubmitting(true);
      setError('');

      const payload = {
        new_staff_id: swapForm.new_staff_id,
        swap_reason: swapForm.swap_reason || null,
        arrival_time: swapForm.arrival_time ? new Date(swapForm.arrival_time).toISOString() : null,
      };

      const originalToken = apiClient.token;
      apiClient.setToken(adminToken);
      await apiClient.swapBookingStaff(bookingId, payload);
      apiClient.setToken(originalToken);

      setSwapForm({
        new_staff_id: '',
        swap_reason: '',
        arrival_time: '',
      });
      await fetchBookingDetail();
    } catch (submitError) {
      setError(submitError?.message || 'Failed to swap staff member');
    } finally {
      setSwapSubmitting(false);
    }
  };

  const handleWalletPayoff = async (event) => {
    event.preventDefault();
    const amount = parseFloat(walletPayoffAmount);
    if (!amount || amount <= 0) return;

    try {
      setWalletPayoffSubmitting(true);
      setWalletPayoffError('');
      const originalToken = apiClient.token;
      apiClient.setToken(adminToken);
      await apiClient.walletPayoffBooking(bookingId, amount, walletPayoffNotes || null);
      apiClient.setToken(originalToken);
      setWalletPayoffAmount('');
      setWalletPayoffNotes('');
      await fetchBookingDetail();
    } catch (submitError) {
      setWalletPayoffError(submitError?.message || 'Failed to process wallet payoff');
    } finally {
      setWalletPayoffSubmitting(false);
    }
  };

  const submitAdminAction = async (mode) => {
    if (!bookingId) {
      return;
    }

    if (remainingBalance > 0 && settlementAction === 'NO_REFUND' && !settlementNote.trim()) {
      setError('Settlement note is required when selecting no refund for a remaining balance.');
      return;
    }

    try {
      setActionLoading(mode);
      setError('');

      const payload = {
        actual_end_time: actualEndTime ? new Date(actualEndTime).toISOString() : new Date().toISOString(),
        settlement_action: remainingBalance > 0 ? settlementAction : 'NO_REFUND',
        settlement_note: settlementNote.trim(),
        reason: reason.trim() || `${mode === 'complete' ? 'Completed' : 'Terminated'} from admin booking page`,
      };

      const originalToken = apiClient.token;
      apiClient.setToken(adminToken);
      if (mode === 'complete') {
        await apiClient.completeBooking(bookingId, payload);
      } else {
        await apiClient.adminTerminateBooking(bookingId, payload);
      }
      apiClient.setToken(originalToken);

      await fetchBookingDetail();
    } catch (err) {
      setError(err?.message || `Failed to ${mode} booking`);
    } finally {
      setActionLoading('');
    }
  };

  const bookingStatus = (bookingSummary.status || '').toLowerCase();
  const isTerminatedBooking = bookingStatus === 'terminated';
  const statusTone = statusStyles[bookingStatus] || 'bg-slate-100 text-slate-700';

  const summaryCards = useMemo(() => ([
    { label: 'Total paid', value: formatMoney(totalPaid), icon: DollarSign, tone: 'green' },
    { label: 'Total invoiced', value: formatMoney(totalInvoiced), icon: FileText, tone: 'blue' },
    { label: 'Remaining balance', value: formatMoney(remainingBalance), icon: WalletIcon, tone: 'violet' },
    { label: 'Overdue amount', value: formatMoney(overdueAmount), icon: AlertTriangle, tone: 'rose' },
  ]), [totalPaid, totalInvoiced, remainingBalance, overdueAmount]);

  const sectionTabs = [
    { id: 'overview', label: 'Overview', icon: CalendarDays },
    { id: 'client', label: 'Client', icon: User },
    { id: 'payments', label: 'Payments', icon: DollarSign },
    { id: 'staff', label: 'Staff', icon: Users },
    { id: 'swaps', label: 'Swaps', icon: Repeat2 },
    { id: 'termination', label: 'Termination', icon: AlertTriangle },
    { id: 'statements', label: 'Statements', icon: FileText },
    ...(!isTerminatedBooking ? [{ id: 'actions', label: 'Actions', icon: ShieldCheck }] : []),
  ];

  useEffect(() => {
    if (isTerminatedBooking && activeSection === 'actions') {
      setActiveSection('overview');
    }
  }, [activeSection, isTerminatedBooking]);

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

  if (error) {
    return (
      <AdminLayout title="Booking Detail" subtitle="Unable to load booking information">
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6">
          <div className="flex items-start gap-4">
            <div className="rounded-full bg-rose-100 p-2">
              <XCircle className="h-6 w-6 text-rose-600" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-rose-900">Unable to load booking detail</h3>
              <p className="mt-1 text-sm text-rose-700">{error}</p>
              <button
                onClick={fetchBookingDetail}
                className="mt-4 inline-flex items-center gap-2 rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-rose-700"
              >
                <RefreshCw className="h-4 w-4" />
                Retry
              </button>
            </div>
          </div>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout
      title={`Booking ${bookingSummary.booking_code || bookingSummary.booking_id || bookingId}`}
      subtitle="Admin detail view for booking records, billing, staffing, and settlement actions"
    >
      <div className="space-y-6">
        <div className="rounded-lg bg-white border border-slate-200 p-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-start gap-4">
              <button
                onClick={() => navigate('/admin/bookings')}
                className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </button>
              <div>
                <h1 className="text-xl font-semibold text-slate-900">{clientDetails.client_name || 'Client booking record'}</h1>
                <p className="text-sm text-slate-500 mt-1">{bookingSummary.service_type || '-'} • {formatDate(bookingSummary.start_date)}</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Pill tone="slate">Booking detail</Pill>
              <span className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold ${statusTone}`}>
                {bookingSummary.status || 'Unknown'}
              </span>
              <div className="hidden md:flex items-center gap-2">
                <button
                  onClick={fetchBookingDetail}
                  className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  <RefreshCw className="h-4 w-4" />
                  Refresh
                </button>
                {!isTerminatedBooking && (
                  <button
                    onClick={() => document.getElementById('admin-actions')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                    className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
                  >
                    <ShieldCheck className="h-4 w-4" />
                    Actions
                  </button>
                )}
              </div>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
              <p className="text-xs text-slate-500">Service</p>
              <p className="text-sm font-semibold text-slate-900">{bookingSummary.service_type || '-'}</p>
            </div>
            <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
              <p className="text-xs text-slate-500">Start date</p>
              <p className="text-sm font-semibold text-slate-900">{formatDate(bookingSummary.start_date)}</p>
            </div>
            <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
              <p className="text-xs text-slate-500">Client</p>
              <p className="text-sm font-semibold text-slate-900">{clientDetails.client_name || `Client #${bookingSummary.client_id || '-'}`}</p>
            </div>
            <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
              <p className="text-xs text-slate-500">Care Profile</p>
              <p className="text-sm font-semibold text-slate-900">{patientDetails.patient_name || `Care Profile #${bookingSummary.patient_id || '-'}`}</p>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4 sm:p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-slate-900">Sections</h2>
              <p className="text-sm text-slate-500">Select one section to keep the page focused and clean.</p>
            </div>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {sectionTabs.map((section) => {
              const Icon = section.icon;
              const isActive = activeSection === section.id;

              return (
                <button
                  key={section.id}
                  type="button"
                  onClick={() => setActiveSection(section.id)}
                  className={`inline-flex min-w-[6.5rem] items-center justify-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition whitespace-nowrap ${isActive ? 'border-blue-600 bg-blue-600 text-white shadow-sm' : 'border-slate-200 bg-white text-slate-600 hover:border-blue-300 hover:text-blue-700'}`}
                >
                  <Icon className="h-4 w-4" />
                  <span>{section.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <section className="rounded-lg border border-slate-200 bg-white p-5 sm:p-6">
          {activeSection === 'overview' && (
            <div className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {summaryCards.map((card) => {
                  const Icon = card.icon;
                  const toneClass = {
                    green: 'bg-emerald-100 text-emerald-700',
                    blue: 'bg-blue-100 text-blue-700',
                    violet: 'bg-violet-100 text-violet-700',
                    rose: 'bg-rose-100 text-rose-700',
                  };

                  return (
                    <div key={card.label} className="rounded-lg border border-slate-100 bg-slate-50 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-xs text-slate-500">{card.label}</p>
                          <p className="mt-1 text-lg font-semibold text-slate-900">{card.value}</p>
                        </div>
                        <div className={`rounded-md p-2 ${toneClass[card.tone] || toneClass.blue}`}>
                          <Icon className="h-5 w-5" />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">Booking details</h3>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <DetailRow label="Booking status" value={bookingSummary.status || '-'} />
                    <DetailRow label="Service type" value={bookingSummary.service_type || '-'} />
                    <DetailRow label="Start date" value={formatDate(bookingSummary.start_date)} />
                    <DetailRow label="End date" value={formatDate(bookingSummary.end_date)} />
                    <DetailRow label="Created" value={formatDateTime(bookingSummary.created_at)} />
                    <DetailRow label="Updated" value={formatDateTime(bookingSummary.updated_at)} />
                  </div>
                </div>

                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">Financial snapshot</h3>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between gap-4"><span className="text-sm text-slate-600">Total paid</span><span className="font-semibold text-slate-900">{formatMoney(totalPaid)}</span></div>
                    <div className="flex items-center justify-between gap-4"><span className="text-sm text-slate-600">Total invoiced</span><span className="font-semibold text-slate-900">{formatMoney(totalInvoiced)}</span></div>
                    <div className="flex items-center justify-between gap-4"><span className="text-sm text-slate-600">Remaining balance</span><span className="font-semibold text-slate-900">{formatMoney(remainingBalance)}</span></div>
                    <div className="flex items-center justify-between gap-4"><span className="text-sm text-slate-600">Overdue amount</span><span className="font-semibold text-slate-900">{formatMoney(overdueAmount)}</span></div>
                    <div className="flex items-center justify-between gap-4"><span className="text-sm text-slate-600">Remaining days</span><span className="font-semibold text-slate-900">{remainingDays === null ? '-' : remainingDays.toFixed(2)}</span></div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeSection === 'client' && (
            <div className="grid gap-6 md:grid-cols-2">
              <div>
                <div className="mb-4 flex items-center gap-3">
                  <div className="rounded-full bg-blue-100 p-2 text-blue-600"><User className="h-4 w-4" /></div>
                  <h3 className="text-base font-semibold text-slate-900">Client details</h3>
                </div>
                <div className="grid gap-4 rounded-lg border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2">
                  <DetailRow label="Name" value={clientDetails.client_name} />
                  <DetailRow label="Client profile" value={clientDetails.client_profile_id || bookingSummary.client_id || '-'} mono />
                  <DetailRow label="Phone" value={clientDetails.mobile || clientDetails.client_mobile || '-'} />
                  <DetailRow label="Email" value={clientDetails.email || '-'} />
                  <div className="sm:col-span-2"><DetailRow label="Address" value={clientDetails.address || clientDetails.client_address || '-'} /></div>
                </div>
              </div>
              <div>
                <div className="mb-4 flex items-center gap-3">
                  <div className="rounded-full bg-violet-100 p-2 text-violet-600"><Activity className="h-4 w-4" /></div>
                  <h3 className="text-base font-semibold text-slate-900">Care profile details</h3>
                </div>
                <div className="grid gap-4 rounded-lg border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2">
                  <DetailRow label="Name" value={patientDetails.patient_name} />
                  <DetailRow label="Patient ID" value={patientDetails.patient_id || bookingSummary.patient_id || '-'} mono />
                  <DetailRow label="Age" value={patientDetails.patient_age || '-'} />
                  <DetailRow label="Relationship" value={patientDetails.relationship_to_client || '-'} />
                  <div className="sm:col-span-2"><DetailRow label="Medical condition" value={patientDetails.medical_condition || '-'} /></div>
                </div>
              </div>
            </div>
          )}

          {activeSection === 'payments' && (
            <div className="space-y-6">
              <div>
                <div className="mb-4 flex items-center gap-3">
                  <div className="rounded-full bg-blue-100 p-2 text-blue-600"><DollarSign className="h-4 w-4" /></div>
                  <h3 className="text-base font-semibold text-slate-900">Payment history</h3>
                </div>
                {paymentHistory.length === 0 ? (
                  <EmptyState icon={DollarSign} text="No payment records are available for this booking." />
                ) : (
                  <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
                    <table className="min-w-full text-sm">
                      <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                        <tr>
                          <th className="px-4 py-3">Date</th>
                          <th className="px-4 py-3">Amount</th>
                          <th className="px-4 py-3">Method</th>
                          <th className="px-4 py-3">Source</th>
                          <th className="px-4 py-3">Reference</th>
                          <th className="px-4 py-3">Notes</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {normalizedPaymentHistory.map((payment, index) => (
                          <tr key={payment.id || index}>
                            <td className="px-4 py-3 text-slate-700">{formatDateTime(payment.date)}</td>
                            <td className="px-4 py-3 font-semibold text-slate-900">{formatMoney(payment.amount)}</td>
                            <td className="px-4 py-3 text-slate-700">{payment.method}</td>
                            <td className="px-4 py-3 text-slate-700">
                              <Pill tone={payment.sourceType === 'QUOTE' ? 'blue' : 'violet'}>
                                {payment.sourceType === 'QUOTE' ? 'Quotation' : 'Booking'}
                              </Pill>
                            </td>
                            <td className="px-4 py-3 text-slate-700">{payment.reference}</td>
                            <td className="px-4 py-3 text-slate-700">{payment.notes}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
              <div>
                <div className="mb-4 flex items-center gap-3">
                  <div className="rounded-full bg-amber-100 p-2 text-amber-600"><FileText className="h-4 w-4" /></div>
                  <h3 className="text-base font-semibold text-slate-900">Invoice snapshot</h3>
                </div>
                <div className="mb-4 rounded-lg border border-slate-200 bg-white p-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <h4 className="text-sm font-semibold text-slate-900">Record payment</h4>
                    <Pill tone="slate">Booking ledger</Pill>
                  </div>
                  <form onSubmit={handleSubmitBookingPayment} className="space-y-3">
                    <input
                      required
                      type="number"
                      min="0"
                      step="0.01"
                      value={paymentForm.amount_received}
                      onChange={(e) => setPaymentForm({ ...paymentForm, amount_received: e.target.value })}
                      placeholder="Amount received"
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500"
                    />

                    <select
                      value={paymentForm.payment_method}
                      onChange={(e) => setPaymentForm({ ...paymentForm, payment_method: e.target.value })}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500"
                    >
                      <option value="BANK_TRANSFER">BANK_TRANSFER</option>
                      <option value="CASH_DEPOSIT">CASH_DEPOSIT</option>
                      <option value="CASH">CASH</option>
                      <option value="CHEQUE">CHEQUE</option>
                    </select>

                    {requiresBankAccount && (
                      <select
                        required
                        value={paymentForm.bank_account_id}
                        onChange={(e) => setPaymentForm({ ...paymentForm, bank_account_id: e.target.value })}
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500"
                      >
                        <option value="">Select bank account</option>
                        {bankAccounts.map((account) => (
                          <option key={account.account_id} value={account.account_id}>
                            {account.account_nickname} ({account.bank_name})
                          </option>
                        ))}
                      </select>
                    )}

                    {isCheque && (
                      <>
                        <input
                          required
                          value={paymentForm.cheque_number}
                          onChange={(e) => setPaymentForm({ ...paymentForm, cheque_number: e.target.value })}
                          placeholder="Cheque Number"
                          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500"
                        />
                        <input
                          required
                          type="date"
                          value={paymentForm.cheque_date}
                          onChange={(e) => setPaymentForm({ ...paymentForm, cheque_date: e.target.value })}
                          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500"
                        />
                      </>
                    )}

                    <input
                      value={paymentForm.reference_number}
                      onChange={(e) => setPaymentForm({ ...paymentForm, reference_number: e.target.value })}
                      placeholder="Reference number (optional)"
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500"
                    />

                    <div className="rounded-lg border border-slate-200 p-3">
                      <label className="mb-2 block text-xs font-medium text-slate-600">Upload Payment Slip (optional)</label>
                      <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-slate-300 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100">
                        <Upload className="h-3.5 w-3.5" /> Choose File
                        <input
                          type="file"
                          accept="image/*,.pdf,.doc,.docx"
                          className="hidden"
                          onChange={(e) => setPaymentSlipFile(e.target.files?.[0] || null)}
                        />
                      </label>
                      {paymentSlipFile && <p className="mt-2 text-xs text-slate-600">Selected: {paymentSlipFile.name}</p>}
                    </div>

                    <textarea
                      value={paymentForm.notes}
                      onChange={(e) => setPaymentForm({ ...paymentForm, notes: e.target.value })}
                      placeholder="Notes (optional)"
                      rows={3}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500"
                    />

                    <button
                      type="submit"
                      disabled={paymentSubmitting}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                    >
                      <CircleDollarSign className="h-4 w-4" />
                      {paymentSubmitting ? 'Saving payment...' : 'Record Booking Payment'}
                    </button>
                  </form>
                </div>
                <div className="grid gap-4 rounded-lg border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2">
                  <DetailRow label="Invoices total" value={formatMoney(invoiceSummary.total_invoiced ?? 0)} />
                  <DetailRow label="Outstanding" value={formatMoney(invoiceSummary.overdue_amount ?? overdueAmount)} />
                  <DetailRow label="Remaining to invoice" value={formatMoney(invoiceSummary.remaining_to_invoice ?? remainingBalance)} />
                  <DetailRow label="Last invoice" value={formatDateTime(lastInvoiceDate)} />
                </div>
                <div className="mt-4 rounded-lg border border-slate-200 bg-white p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">Payment position</p>
                      <p className="text-sm text-slate-500">Last payment: {formatDateTime(lastPaymentDate)}</p>
                    </div>
                    <Pill tone={remainingBalance > 0 ? 'green' : 'amber'}>{remainingBalance > 0 ? 'Refund available' : 'No refund due'}</Pill>
                  </div>
                </div>
              </div>

              {(() => {
                const walletBalance = Number(clientDetails.wallet_balance || 0);
                const maxPayoff = Math.min(walletBalance, overdueAmount);
                const canPayoff = walletBalance > 0 && overdueAmount > 0 && !isTerminatedBooking;

                return (
                  <div>
                    <div className="mb-4 flex items-center gap-3">
                      <div className="rounded-full bg-violet-100 p-2 text-violet-600"><Wallet className="h-4 w-4" /></div>
                      <h3 className="text-base font-semibold text-slate-900">Wallet payoff</h3>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-white p-4">
                      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                        <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                          <p className="text-xs text-slate-500">Wallet balance</p>
                          <p className={`mt-1 text-sm font-semibold ${walletBalance > 0 ? 'text-emerald-700' : 'text-slate-400'}`}>{formatMoney(walletBalance)}</p>
                        </div>
                        <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                          <p className="text-xs text-slate-500">Overdue amount</p>
                          <p className={`mt-1 text-sm font-semibold ${overdueAmount > 0 ? 'text-rose-700' : 'text-slate-400'}`}>{formatMoney(overdueAmount)}</p>
                        </div>
                        <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                          <p className="text-xs text-slate-500">Max payable</p>
                          <p className={`mt-1 text-sm font-semibold ${maxPayoff > 0 ? 'text-violet-700' : 'text-slate-400'}`}>{formatMoney(maxPayoff)}</p>
                        </div>
                      </div>

                      {canPayoff ? (
                        <form onSubmit={handleWalletPayoff} className="space-y-3">
                          <div className="flex gap-2">
                            <input
                              required
                              type="number"
                              min="0.01"
                              max={maxPayoff.toFixed(2)}
                              step="0.01"
                              value={walletPayoffAmount}
                              onChange={(e) => setWalletPayoffAmount(e.target.value)}
                              placeholder="Amount to pay off"
                              className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-violet-500"
                            />
                            <button
                              type="button"
                              onClick={() => setWalletPayoffAmount(maxPayoff.toFixed(2))}
                              className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100"
                            >
                              Max
                            </button>
                          </div>
                          <textarea
                            value={walletPayoffNotes}
                            onChange={(e) => setWalletPayoffNotes(e.target.value)}
                            placeholder="Notes (optional)"
                            rows={2}
                            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-violet-500"
                          />
                          {walletPayoffError && (
                            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                              {walletPayoffError}
                            </div>
                          )}
                          <button
                            type="submit"
                            disabled={walletPayoffSubmitting || !walletPayoffAmount || parseFloat(walletPayoffAmount) <= 0}
                            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                          >
                            <Wallet className="h-4 w-4" />
                            {walletPayoffSubmitting ? 'Processing...' : 'Pay with wallet'}
                          </button>
                        </form>
                      ) : (
                        <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center">
                          <Wallet className="mx-auto h-6 w-6 text-slate-300" />
                          <p className="mt-2 text-sm text-slate-500">
                            {isTerminatedBooking
                              ? 'Wallet payoff is not available for terminated bookings.'
                              : overdueAmount <= 0
                                ? 'No overdue amount on this booking.'
                                : 'Client wallet balance is empty.'}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {activeSection === 'staff' && (
            <div className="space-y-6">
              <div className="grid gap-6 xl:grid-cols-3">
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <div className="mb-4 flex items-center gap-3">
                    <div className="rounded-full bg-emerald-100 p-2 text-emerald-600"><Users className="h-4 w-4" /></div>
                    <h3 className="text-base font-semibold text-slate-900">Current staff</h3>
                  </div>
                  <div className="space-y-4">
                    <DetailRow label="Name" value={normalizedCurrentStaff?.name || '-'} />
                    <DetailRow label="Staff ID" value={normalizedCurrentStaff?.id || '-'} mono />
                    <DetailRow label="Designation" value={normalizedCurrentStaff?.designation || '-'} />
                    <DetailRow label="Phone" value={normalizedCurrentStaff?.mobile || '-'} />
                    <DetailRow label="Email" value={normalizedCurrentStaff?.email || '-'} />
                  </div>
                </div>

                <div className="rounded-lg border border-slate-200 bg-white p-4">
                  <div className="mb-4 flex items-center gap-3">
                    <div className="rounded-full bg-violet-100 p-2 text-violet-600"><Repeat2 className="h-4 w-4" /></div>
                    <h3 className="text-base font-semibold text-slate-900">Swap staff</h3>
                  </div>
                  <form onSubmit={handleSubmitStaffSwap} className="space-y-3">
                    <div>
                      <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">New staff member</label>
                      <select
                        required
                        value={swapForm.new_staff_id}
                        onChange={(e) => setSwapForm({ ...swapForm, new_staff_id: e.target.value })}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                      >
                        <option value="">Select available staff</option>
                        {availableStaff.map((staff) => (
                          <option key={staff.staff_profile_id} value={staff.staff_profile_id}>
                            {staff.full_name} {staff.designation ? `(${staff.designation})` : ''}
                          </option>
                        ))}
                      </select>
                      <p className="mt-1 text-xs text-slate-500">
                        {availableStaff.length} available staff member{availableStaff.length === 1 ? '' : 's'} loaded.
                      </p>
                    </div>

                    <div>
                      <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">Arrival time</label>
                      <input
                        type="datetime-local"
                        value={swapForm.arrival_time}
                        onChange={(e) => setSwapForm({ ...swapForm, arrival_time: e.target.value })}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                      />
                    </div>

                    <div>
                      <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">Swap reason</label>
                      <textarea
                        value={swapForm.swap_reason}
                        onChange={(e) => setSwapForm({ ...swapForm, swap_reason: e.target.value })}
                        rows="3"
                        placeholder="Optional reason for the swap"
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                      />
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                      The swap will only submit after you confirm the action in the browser prompt.
                    </div>

                    <button
                      type="submit"
                      disabled={swapSubmitting}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      {swapSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Repeat2 className="h-4 w-4" />}
                      {swapSubmitting ? 'Swapping staff...' : 'Confirm Swap'}
                    </button>
                  </form>
                </div>

                <div className="rounded-lg border border-slate-200 bg-white p-4">
                  <div className="mb-4 flex items-center gap-3">
                    <div className="rounded-full bg-blue-100 p-2 text-blue-600"><History className="h-4 w-4" /></div>
                    <h3 className="text-base font-semibold text-slate-900">Allocation history</h3>
                  </div>
                  {normalizedStaffHistory.length === 0 ? (
                    <EmptyState icon={Users} text="No staff allocation history is available for this booking." />
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-sm">
                        <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
                          <tr>
                            <th className="pb-3 pr-4">Assigned</th>
                            <th className="pb-3 pr-4">Ended</th>
                            <th className="pb-3 pr-4">Staff</th>
                            <th className="pb-3 pr-4">Rate</th>
                            <th className="pb-3 pr-4">Allocated</th>
                            <th className="pb-3 pr-4">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200">
                          {normalizedStaffHistory.map((row, index) => (
                            <tr key={row.id || index} className="align-top">
                              <td className="py-3 pr-4 text-slate-700">{formatDateTime(row.startDate)}</td>
                              <td className="py-3 pr-4 text-slate-700">{formatDateTime(row.endDate)}</td>
                              <td className="py-3 pr-4 text-slate-900">
                                <div className="font-medium">{row.name || `Staff #${row.staffId || '-'}`}</div>
                                <div className="text-xs text-slate-500">{row.designation || row.staffId || ''}</div>
                              </td>
                              <td className="py-3 pr-4 text-slate-700">{formatMoney(row.dailyRate)}</td>
                              <td className="py-3 pr-4 text-slate-700">{formatMoney(row.amountAllocated)}</td>
                              <td className="py-3 pr-4 text-slate-700">{row.currentStatus || '-'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="mb-4 flex items-center gap-3">
                  <div className="rounded-full bg-violet-100 p-2 text-violet-600"><Repeat2 className="h-4 w-4" /></div>
                  <h3 className="text-base font-semibold text-slate-900">Swap history</h3>
                </div>
                {swapHistory.length === 0 ? (
                  <EmptyState icon={Repeat2} text="No staff swap history has been recorded for this booking." />
                ) : (
                  <div className="space-y-3">
                    {normalizedSwapHistory.map((swap, index) => (
                      <div key={swap.id || index} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <p className="font-semibold text-slate-900">
                              {swap.oldStaffName || `Staff #${swap.oldStaffId || '-'}`}
                              <span className="mx-2 text-slate-400">→</span>
                              {swap.newStaffName || `Staff #${swap.newStaffId || '-'}`}
                            </p>
                            <p className="text-xs text-slate-500">{formatDateTime(swap.swappedAt)}</p>
                          </div>
                          <Pill tone={swap.billingGap ? 'amber' : 'violet'}>{swap.billingGap ? 'Billing gap' : 'Recorded'}</Pill>
                        </div>
                        <p className="mt-3 text-sm text-slate-600">{swap.reason || 'No reason provided.'}</p>
                        {swap.swappedByMobile && <p className="mt-2 text-xs text-slate-500">Swapped by {swap.swappedByMobile}</p>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeSection === 'swaps' && (
            <div>
              <div className="mb-4 flex items-center gap-3">
                <div className="rounded-full bg-violet-100 p-2 text-violet-600"><Repeat2 className="h-4 w-4" /></div>
                <h3 className="text-base font-semibold text-slate-900">Swap history</h3>
              </div>
              {swapHistory.length === 0 ? (
                <EmptyState icon={Repeat2} text="No staff swap history has been recorded for this booking." />
              ) : (
                <div className="space-y-3">
                    {normalizedSwapHistory.map((swap, index) => (
                      <div key={swap.id || index} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="font-semibold text-slate-900">
                              {swap.oldStaffName || `Staff #${swap.oldStaffId || '-'}`}
                            <span className="mx-2 text-slate-400">→</span>
                              {swap.newStaffName || `Staff #${swap.newStaffId || '-'}`}
                          </p>
                            <p className="text-xs text-slate-500">{formatDateTime(swap.swappedAt)}</p>
                        </div>
                          <Pill tone={swap.billingGap ? 'amber' : 'violet'}>{swap.billingGap ? 'Billing gap' : 'Recorded'}</Pill>
                      </div>
                        <p className="mt-3 text-sm text-slate-600">{swap.reason || 'No reason provided.'}</p>
                        {swap.swappedByMobile && <p className="mt-2 text-xs text-slate-500">Swapped by {swap.swappedByMobile}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeSection === 'termination' && (
            <div>
              <div className="mb-4 flex items-center gap-3">
                <div className="rounded-full bg-rose-100 p-2 text-rose-600"><AlertTriangle className="h-4 w-4" /></div>
                <h3 className="text-base font-semibold text-slate-900">Termination requests</h3>
              </div>
              {terminationRequests.length === 0 ? (
                <EmptyState icon={AlertTriangle} text="No termination requests are pending or recorded for this booking." />
              ) : (
                <div className="space-y-3">
                  {terminationRequests.map((request, index) => (
                    <div key={request.termination_request_id || request.id || index} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="font-semibold text-slate-900">{request.requested_by_name || request.requested_by || 'Termination request'}</p>
                          <p className="text-xs text-slate-500">Requested {formatDateTime(request.requested_at || request.created_at)}</p>
                        </div>
                        <Pill tone={request.status === 'APPROVED' ? 'green' : request.status === 'REJECTED' ? 'rose' : 'amber'}>
                          {request.status || 'Pending'}
                        </Pill>
                      </div>
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        <DetailRow label="Requested end" value={formatDateTime(request.requested_end_time || request.requested_end_date)} />
                        <DetailRow label="Approved end" value={formatDateTime(request.end_time || request.approved_end_time)} />
                      </div>
                      <p className="mt-3 text-sm text-slate-600">{request.reason || request.request_reason || 'No reason provided.'}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeSection === 'statements' && (
            <div className="max-w-2xl">
              <div className="mb-4 flex items-center gap-3">
                <div className="rounded-full bg-slate-900 p-2 text-white"><FileText className="h-4 w-4" /></div>
                <h3 className="text-base font-semibold text-slate-900">Statement export</h3>
              </div>
              <div className="space-y-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
                <div>
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">Preset</label>
                  <div className="grid grid-cols-3 gap-2">
                    <button type="button" onClick={() => { const today = new Date(); setStatementStartDate(toDateInputValue(addDays(today, -7))); setStatementEndDate(toDateInputValue(today)); }} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-blue-300 hover:text-blue-700">7 days</button>
                    <button type="button" onClick={() => { const today = new Date(); setStatementStartDate(toDateInputValue(addDays(today, -30))); setStatementEndDate(toDateInputValue(today)); }} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-blue-300 hover:text-blue-700">30 days</button>
                    <button type="button" onClick={() => { const today = new Date(); setStatementStartDate('2000-01-01'); setStatementEndDate(toDateInputValue(today)); }} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-blue-300 hover:text-blue-700">All time</button>
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">Start date</label>
                    <input type="date" value={statementStartDate} onChange={(e) => setStatementStartDate(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
                  </div>
                  <div>
                    <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">End date</label>
                    <input type="date" value={statementEndDate} onChange={(e) => setStatementEndDate(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
                  </div>
                </div>
                <button onClick={downloadStatement} disabled={statementLoading || !statementClientId} className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70">
                  {statementLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                  Download statement PDF
                </button>
              </div>
            </div>
          )}

          {!isTerminatedBooking && activeSection === 'actions' && (
            <div className="grid gap-6 xl:grid-cols-3">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <h3 className="text-base font-semibold text-slate-900">Action snapshot</h3>
                <div className="mt-4 space-y-4">
                  <DetailRow label="Booking Code" value={bookingSummary.booking_code || bookingSummary.booking_id || bookingId} mono />
                  <DetailRow label="Status" value={bookingSummary.status || '-'} />
                  <DetailRow label="Service" value={bookingSummary.service_type || '-'} />
                  <DetailRow label="Start" value={formatDate(bookingSummary.start_date)} />
                  <DetailRow label="End" value={formatDate(bookingSummary.end_date)} />
                </div>
              </div>

              <div className="xl:col-span-2 rounded-lg border border-slate-200 bg-white p-4" id="admin-actions">
                <h3 className="text-base font-semibold text-slate-900">Admin actions</h3>
                <p className="mt-1 text-sm text-slate-500">Finish or terminate the booking with a settlement note.</p>
                <div className="mt-4 space-y-4">
                  <div>
                    <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">Actual end time</label>
                    <input type="datetime-local" value={actualEndTime} onChange={(e) => setActualEndTime(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
                  </div>
                  <div>
                    <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">Reason</label>
                    <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows="3" placeholder="Optional admin note describing why the booking is being completed or terminated" className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
                  </div>
                  <div>
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">Settlement action</label>
                      <Pill tone={remainingBalance > 0 ? 'green' : 'amber'}>{remainingBalance > 0 ? 'Balance available' : 'No balance due'}</Pill>
                    </div>
                    {remainingBalance > 0 ? (
                      <div className="space-y-2 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                        <label className="flex cursor-pointer items-start gap-3 rounded-xl bg-white p-3 text-sm text-slate-700 ring-1 ring-slate-200 transition hover:ring-blue-300">
                          <input type="radio" name="settlementAction" value="WALLET_DEPOSIT" checked={settlementAction === 'WALLET_DEPOSIT'} onChange={(e) => setSettlementAction(e.target.value)} className="mt-1" />
                          <span><span className="block font-semibold text-slate-900">Deposit to wallet</span><span className="block text-xs text-slate-500">Return the remaining balance to the client wallet.</span></span>
                        </label>
                        <label className="flex cursor-pointer items-start gap-3 rounded-xl bg-white p-3 text-sm text-slate-700 ring-1 ring-slate-200 transition hover:ring-blue-300">
                          <input type="radio" name="settlementAction" value="NO_REFUND" checked={settlementAction === 'NO_REFUND'} onChange={(e) => setSettlementAction(e.target.value)} className="mt-1" />
                          <span><span className="block font-semibold text-slate-900">No refund</span><span className="block text-xs text-slate-500">Keep the balance with the booking record and record a note.</span></span>
                        </label>
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">No refund settlement is needed because there is no remaining balance.</div>
                    )}
                  </div>
                  <div>
                    <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">Settlement note</label>
                    <textarea value={settlementNote} onChange={(e) => setSettlementNote(e.target.value)} rows="3" placeholder="Explain the settlement decision, especially when no refund is selected" className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
                  </div>
                  <div className="flex flex-col gap-3 sm:flex-row">
                    <button onClick={() => submitAdminAction('complete')} disabled={actionLoading === 'complete'} className="inline-flex flex-1 items-center justify-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-70">
                      {actionLoading === 'complete' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                      Complete booking
                    </button>
                    <button onClick={() => submitAdminAction('terminate')} disabled={actionLoading === 'terminate'} className="inline-flex flex-1 items-center justify-center gap-2 rounded-md bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-70">
                      {actionLoading === 'terminate' ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                      Terminate booking
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>
      </div>
    </AdminLayout>
  );
};

const EmptyState = ({ icon: Icon, text }) => (
  <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center">
    <Icon className="h-6 w-6 text-slate-400" />
    <p className="mt-3 text-sm text-slate-500">{text}</p>
  </div>
);

const WalletIcon = ({ className }) => <DollarSign className={className} />;

export default BookingDetailPage;
