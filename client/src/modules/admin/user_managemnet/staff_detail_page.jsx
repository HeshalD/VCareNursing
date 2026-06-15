import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Activity,
  AlertCircle,
  ArrowLeft,
  BadgeDollarSign,
  Briefcase,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  DollarSign,
  History,
  Landmark,
  Loader2,
  Mail,
  MapPin,
  MinusCircle,
  Pencil,
  Phone,
  Plus,
  RefreshCw,
  Save,
  ShieldCheck,
  Star,
  ToggleLeft,
  ToggleRight,
  Trash2,
  User,
  Users,
  Wallet,
  XCircle,
} from 'lucide-react';
import AdminLayout from '../components/AdminLayout';
import apiClient from '../../../api/api';
import { useAdminAuth } from '../../../context/AdminAuthContext';

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
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
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

const safeArray = (value) => (Array.isArray(value) ? value : []);

const statusTone = (value) => {
  const normalized = String(value || '').toLowerCase();
  if (normalized === 'available' || normalized === 'active' || normalized === 'completed' || normalized === 'verified') return 'bg-emerald-100 text-emerald-700';
  if (normalized === 'unavailable' || normalized === 'inactive' || normalized === 'cancelled' || normalized === 'terminated') return 'bg-rose-100 text-rose-700';
  if (normalized === 'assigned') return 'bg-blue-100 text-blue-700';
  if (normalized === 'pending' || normalized === 'pending_termination') return 'bg-amber-100 text-amber-700';
  return 'bg-slate-100 text-slate-700';
};

const StatCard = ({ icon: Icon, label, value, tone = 'slate', onClick }) => {
  const toneMap = {
    slate: 'bg-slate-100 text-slate-700',
    blue: 'bg-blue-100 text-blue-700',
    emerald: 'bg-emerald-100 text-emerald-700',
    amber: 'bg-amber-100 text-amber-700',
    rose: 'bg-rose-100 text-rose-700',
    violet: 'bg-violet-100 text-violet-700',
  };

  return (
    <div
      className={`rounded-2xl border border-slate-200 bg-white p-4 shadow-sm ${onClick ? 'cursor-pointer hover:shadow-md hover:border-slate-300 transition-all' : ''}`}
      onClick={onClick}
      title={onClick ? 'Click to see breakdown' : undefined}
    >
      <div className={`mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl ${toneMap[tone] || toneMap.slate}`}>
        <Icon className="h-5 w-5" />
      </div>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-bold text-slate-900">{value}</p>
      {onClick && <p className="mt-1 text-xs text-blue-500">View breakdown →</p>}
    </div>
  );
};

const SectionButton = ({ active, icon: Icon, label, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className={`flex min-w-[140px] items-center gap-2 rounded-xl border px-4 py-3 text-left transition-all duration-200 ${active ? 'border-blue-600 bg-blue-600 text-white shadow-lg shadow-blue-100' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'}`}
  >
    <Icon className="h-4 w-4" />
    <span className="text-sm font-semibold">{label}</span>
  </button>
);

const InfoRow = ({ label, value, mono = false }) => (
  <div>
    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
    <p className={`mt-1 text-sm text-slate-900 ${mono ? 'font-mono' : 'font-medium'}`}>{value ?? '-'}</p>
  </div>
);

const Card = ({ title, subtitle, children }) => (
  <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
    {(title || subtitle) && (
      <div className="border-b border-slate-200 px-5 py-4">
        {title && <h3 className="text-base font-bold text-slate-900">{title}</h3>}
        {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
      </div>
    )}
    <div className="p-5">{children}</div>
  </div>
);

const EmptyState = ({ title, subtitle }) => (
  <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-slate-500">
    <p className="font-semibold text-slate-700">{title}</p>
    {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
  </div>
);

const StaffDetailPage = () => {
  const { adminToken, isLoading: authLoading } = useAdminAuth();
  const navigate = useNavigate();
  const { staffProfileId } = useParams();

  const [detail, setDetail] = useState(null);
  const [earningsSummary, setEarningsSummary] = useState(null);
  const [earningsTransactions, setEarningsTransactions] = useState([]);
  const [currentBooking, setCurrentBooking] = useState(null);
  const [bookingHistory, setBookingHistory] = useState([]);
  const [payoutsSummary, setPayoutsSummary] = useState(null);
  const [payouts, setPayouts] = useState([]);
  const [bankAccounts, setBankAccounts] = useState([]);
  const [companyBankAccounts, setCompanyBankAccounts] = useState([]);
  const [payoutForm, setPayoutForm] = useState({
    amount: '',
    company_bank_account_id: '',
    staff_bank_account_id: '',
    payment_method: 'BANK_TRANSFER',
    reference_number: '',
    notes: '',
  });
  const [bankModal, setBankModal] = useState({
    isOpen: false,
    mode: 'add',
    editing: null,
    form: { account_holder_name: '', bank_name: '', branch_name: '', account_number: '', currency: 'LKR' },
    saving: false,
    error: '',
  });
  const [deletingBankId, setDeletingBankId] = useState(null);
  const [sectionErrors, setSectionErrors] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeSection, setActiveSection] = useState('overview');
  const [refreshing, setRefreshing] = useState(false);
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [payoutSubmitting, setPayoutSubmitting] = useState(false);
  const [payoutSubmitError, setPayoutSubmitError] = useState('');
  const [payoutSubmitSuccess, setPayoutSubmitSuccess] = useState('');
  const [changeRequests, setChangeRequests] = useState([]);
  const [expandedRequestId, setExpandedRequestId] = useState(null);
  const [requestLogs, setRequestLogs] = useState({});
  const [loadingLogs, setLoadingLogs] = useState({});
  const [deductions, setDeductions] = useState([]);
  const [deductionForm, setDeductionForm] = useState({ amount: '', reason: '' });
  const [deductionSubmitting, setDeductionSubmitting] = useState(false);
  const [deductionError, setDeductionError] = useState('');
  const [deductionSuccess, setDeductionSuccess] = useState('');

  const profile = detail?.profile || {};
  const overviewEarnings = detail?.earnings || {};
  const overviewCurrentBooking = detail?.current_assignment || null;
  const overviewBookingHistory = safeArray(detail?.booking_history);
  const overviewReviews = detail?.reviews || {};
  const overviewPayoutSummary = detail?.payout_summary || {};

  const sectionConfig = useMemo(() => ([
    { id: 'overview', label: 'Overview', icon: Users },
    { id: 'earnings', label: 'Earnings', icon: BadgeDollarSign },
    { id: 'current-booking', label: 'Current Booking', icon: CalendarDays },
    { id: 'booking-history', label: 'Booking History', icon: History },
    { id: 'reviews', label: 'Reviews', icon: Star },
    { id: 'payouts', label: 'Payouts', icon: Wallet },
    { id: 'deductions', label: 'Deductions', icon: MinusCircle },
    { id: 'bank-accounts', label: 'Bank Accounts', icon: Landmark },
    { id: 'change-history', label: 'Change History', icon: ClipboardList },
  ]), []);

  const totalEarned = Number(earningsSummary?.total_earned ?? overviewEarnings.total_earned ?? 0);
  const totalPaidOut = Number(earningsSummary?.total_paid_out ?? overviewEarnings.total_paid_out ?? 0);
  const currentEarnings = Number(earningsSummary?.current_earnings ?? overviewEarnings.current_earnings ?? profile.current_earnings ?? 0);
  const outstandingPayable = Number(earningsSummary?.outstanding_payable ?? overviewEarnings.outstanding ?? currentEarnings ?? 0);
  const totalReviews = Number(profile.total_reviews || overviewReviews.total_reviews || 0);
  const averageRating = Number(profile.average_rating || overviewReviews.average_rating || 0);
  const totalBookings = overviewBookingHistory.length;
  const activeStatus = String(profile.current_status || '').toLowerCase();
  const isActive = Boolean(profile.is_active);
  const currentAssignment = currentBooking || overviewCurrentBooking;
  const sectionLoadErrors = sectionErrors;

  const runAdminRequest = async (fn) => {
    const originalToken = apiClient.token;
    apiClient.setToken(adminToken);
    try {
      return await fn();
    } finally {
      apiClient.setToken(originalToken);
    }
  };

  const loadPage = async () => {
    if (!adminToken || !staffProfileId) {
      setLoading(false);
      if (!authLoading) {
        setError('Admin authentication required.');
      }
      return;
    }

    setLoading(true);
    setError('');
    setSectionErrors({});

    const results = await Promise.allSettled([
      runAdminRequest(() => apiClient.getAdminStaffDetail(staffProfileId)),
      runAdminRequest(() => apiClient.getStaffEarningsSummary(staffProfileId)),
      runAdminRequest(() => apiClient.getStaffEarningsTransactions(staffProfileId, { page: 1, limit: 50 })),
      runAdminRequest(() => apiClient.getStaffCurrentBooking(staffProfileId)),
      runAdminRequest(() => apiClient.getStaffBookingHistory(staffProfileId, { page: 1, limit: 20 })),
      runAdminRequest(() => apiClient.getStaffPayoutsSummary(staffProfileId)),
      runAdminRequest(() => apiClient.getStaffPayouts(staffProfileId, { page: 1, limit: 20 })),
      runAdminRequest(() => apiClient.getStaffBankAccounts(staffProfileId)),
      runAdminRequest(() => apiClient.getBankAccounts()),
      runAdminRequest(() => apiClient.getAllChangeRequests({ staff_profile_id: staffProfileId })),
      runAdminRequest(() => apiClient.getStaffDeductions(staffProfileId, { page: 1, limit: 50 })),
    ]);

    const nextErrors = {};
    const [detailRes, earningsRes, earningsTxRes, currentBookingRes, historyRes, payoutsSummaryRes, payoutsRes, bankAccountsRes, companyBankAccountsRes, changeRequestsRes, deductionsRes] = results;

    if (detailRes.status === 'fulfilled') {
      setDetail(detailRes.value?.data || null);
    } else {
      setError(detailRes.reason?.message || 'Failed to load staff detail');
      setLoading(false);
      return;
    }

    if (earningsRes.status === 'fulfilled') {
      setEarningsSummary(earningsRes.value?.data || null);
    } else {
      nextErrors.earnings = earningsRes.reason?.message || 'Failed to load earnings summary';
    }

    if (earningsTxRes.status === 'fulfilled') {
      setEarningsTransactions(safeArray(earningsTxRes.value?.data));
    } else {
      nextErrors.earningsTransactions = earningsTxRes.reason?.message || 'Failed to load earnings transactions';
    }

    if (currentBookingRes.status === 'fulfilled') {
      setCurrentBooking(currentBookingRes.value?.data || null);
    } else {
      nextErrors.currentBooking = currentBookingRes.reason?.message || 'Failed to load current booking';
    }

    if (historyRes.status === 'fulfilled') {
      setBookingHistory(safeArray(historyRes.value?.data));
    } else {
      nextErrors.bookingHistory = historyRes.reason?.message || 'Failed to load booking history';
    }

    if (payoutsSummaryRes.status === 'fulfilled') {
      setPayoutsSummary(payoutsSummaryRes.value?.data || null);
    } else {
      nextErrors.payoutsSummary = payoutsSummaryRes.reason?.message || 'Failed to load payouts summary';
    }

    if (payoutsRes.status === 'fulfilled') {
      setPayouts(safeArray(payoutsRes.value?.data));
    } else {
      nextErrors.payouts = payoutsRes.reason?.message || 'Failed to load payouts';
    }

    if (bankAccountsRes.status === 'fulfilled') {
      setBankAccounts(safeArray(bankAccountsRes.value?.data));
    } else {
      nextErrors.bankAccounts = bankAccountsRes.reason?.message || 'Failed to load bank accounts';
    }

    if (companyBankAccountsRes.status === 'fulfilled') {
      const fetchedCompanyBankAccounts = safeArray(companyBankAccountsRes.value?.data);
      setCompanyBankAccounts(fetchedCompanyBankAccounts);
      if (!payoutForm.company_bank_account_id && fetchedCompanyBankAccounts.length > 0) {
        setPayoutForm((current) => ({
          ...current,
          company_bank_account_id: fetchedCompanyBankAccounts[0].account_id || '',
        }));
      }
    } else {
      nextErrors.companyBankAccounts = companyBankAccountsRes.reason?.message || 'Failed to load company bank accounts';
    }

    if (changeRequestsRes.status === 'fulfilled') {
      setChangeRequests(safeArray(changeRequestsRes.value?.data));
    } else {
      nextErrors.changeRequests = changeRequestsRes.reason?.message || 'Failed to load change requests';
    }

    if (deductionsRes.status === 'fulfilled') {
      setDeductions(safeArray(deductionsRes.value?.data));
    } else {
      nextErrors.deductions = deductionsRes.reason?.message || 'Failed to load deductions';
    }

    setSectionErrors(nextErrors);
    setLoading(false);
  };

  useEffect(() => {
    loadPage();
  }, [adminToken, staffProfileId]);

  const handleToggleAccount = async () => {
    try {
      setStatusUpdating(true);
      if (isActive) {
        await runAdminRequest(() => apiClient.deactivateStaffAccount(staffProfileId));
      } else {
        await runAdminRequest(() => apiClient.reactivateStaffAccount(staffProfileId));
      }
      await loadPage();
    } catch (toggleError) {
      setError(toggleError?.message || 'Failed to update staff account status');
    } finally {
      setStatusUpdating(false);
    }
  };

  const refreshData = async () => {
    try {
      setRefreshing(true);
      await loadPage();
    } finally {
      setRefreshing(false);
    }
  };

  const handlePayoutFieldChange = (field) => (event) => {
    const { value } = event.target;
    setPayoutForm((current) => ({
      ...current,
      [field]: value,
    }));
    setPayoutSubmitError('');
    setPayoutSubmitSuccess('');
  };

  useEffect(() => {
    if (!payoutForm.company_bank_account_id && companyBankAccounts.length > 0) {
      setPayoutForm((current) => ({
        ...current,
        company_bank_account_id: companyBankAccounts[0].account_id || '',
      }));
    }
  }, [companyBankAccounts, payoutForm.company_bank_account_id]);

  const submitPayout = async (event) => {
    event.preventDefault();
    setPayoutSubmitError('');
    setPayoutSubmitSuccess('');

    try {
      setPayoutSubmitting(true);
      await runAdminRequest(() => apiClient.createStaffPayout(staffProfileId, {
        amount: payoutForm.amount,
        company_bank_account_id: payoutForm.company_bank_account_id || null,
        staff_bank_account_id: payoutForm.staff_bank_account_id || null,
        payment_method: payoutForm.payment_method,
        reference_number: payoutForm.reference_number,
        notes: payoutForm.notes,
      }));

      setPayoutSubmitSuccess('Payout recorded successfully.');
      setPayoutForm({
        amount: '',
        company_bank_account_id: '',
        staff_bank_account_id: '',
        payment_method: 'BANK_TRANSFER',
        reference_number: '',
        notes: '',
      });
      await loadPage();
    } catch (submitError) {
      setPayoutSubmitError(submitError?.message || 'Failed to record payout');
    } finally {
      setPayoutSubmitting(false);
    }
  };

  const overviewCards = [
    { icon: BadgeDollarSign, label: 'Current Earnings', value: formatMoney(currentEarnings), tone: 'emerald', onClick: () => navigate(`/admin/staff/${staffProfileId}/current-earnings`) },
    { icon: DollarSign, label: 'Total Earned', value: formatMoney(totalEarned), tone: 'blue', onClick: () => navigate(`/admin/staff/${staffProfileId}/total-earnings`) },
    { icon: Wallet, label: 'Total Paid Out', value: formatMoney(totalPaidOut), tone: 'violet' },
    { icon: Activity, label: 'Outstanding Payable', value: formatMoney(outstandingPayable), tone: 'rose' },
  ];

  const renderOverview = () => (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {overviewCards.map((card) => <StatCard key={card.label} {...card} />)}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Staff Information" subtitle="Basic profile and account status">
          <div className="flex items-start gap-4">
            <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl bg-slate-100 text-2xl font-bold text-slate-600">
              {profile.profile_picture_url ? (
                <img src={profile.profile_picture_url} alt={profile.full_name || 'Staff'} className="h-full w-full object-cover" />
              ) : (
                <span>{(profile.full_name || 'S').charAt(0)}</span>
              )}
            </div>
            <div className="flex-1">
              <div className="flex flex-wrap items-center gap-3">
                <h3 className="text-xl font-bold text-slate-900">{profile.full_name || 'Staff profile'}</h3>
                <span className={`rounded-full px-3 py-1 text-xs font-bold ${isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                  {isActive ? 'Active account' : 'Deactivated'}
                </span>
                <span className={`rounded-full px-3 py-1 text-xs font-bold ${statusTone(activeStatus)}`}>
                  {profile.current_status || 'UNKNOWN'}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap gap-4 text-sm text-slate-600">
                <span className="inline-flex items-center gap-2"><Phone className="h-4 w-4" /> {profile.mobile_number || profile.email || '-'}</span>
                <span className="inline-flex items-center gap-2"><Mail className="h-4 w-4" /> {profile.email || '-'}</span>
                <span className="inline-flex items-center gap-2"><MapPin className="h-4 w-4" /> {profile.location || profile.home_address || '-'}</span>
              </div>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <InfoRow label="Designation" value={profile.designation || '-'} />
                <InfoRow label="Verification" value={profile.verification_status || '-'} />
                <InfoRow label="Live In" value={profile.willing_to_live_in ? 'Yes' : 'No'} />
                <InfoRow label="Member Since" value={formatDate(profile.created_at)} />
                <InfoRow label="Average Rating" value={averageRating ? `${averageRating.toFixed(1)} / 5` : '-'} />
                <InfoRow label="Total Reviews" value={totalReviews} />
              </div>
            </div>
          </div>
        </Card>

        <Card title="Account Control" subtitle="Deactivate or reactivate this staff account">
          <div className="space-y-4">
            <div className="rounded-2xl bg-slate-50 p-4">
              <div className="flex items-center gap-3">
                {isActive ? <ToggleRight className="h-5 w-5 text-emerald-600" /> : <ToggleLeft className="h-5 w-5 text-rose-600" />}
                <div>
                  <p className="font-semibold text-slate-900">{isActive ? 'Account enabled' : 'Account disabled'}</p>
                  <p className="text-sm text-slate-500">{isActive ? 'This staff member can sign in.' : 'This staff member cannot sign in.'}</p>
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={handleToggleAccount}
              disabled={statusUpdating}
              className={`inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-white disabled:opacity-60 ${isActive ? 'bg-rose-600 hover:bg-rose-700' : 'bg-emerald-600 hover:bg-emerald-700'}`}
            >
              {statusUpdating ? <Loader2 className="h-4 w-4 animate-spin" /> : isActive ? <ShieldCheck className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
              {isActive ? 'Deactivate Account' : 'Reactivate Account'}
            </button>
          </div>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Current Booking Snapshot" subtitle="Live assignment returned from the current-booking route">
          {currentAssignment ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <InfoRow label="Booking ID" value={currentAssignment.booking_id || '-'} mono />
              <InfoRow label="Assignment Status" value={currentAssignment.status || '-'} />
              <InfoRow label="Service Type" value={currentAssignment.service_type || currentAssignment.booking_status || '-'} />
              <InfoRow label="Client" value={currentAssignment.client_name || '-'} />
              <InfoRow label="Patient" value={currentAssignment.patient_name || '-'} />
              <InfoRow label="Start Date" value={formatDate(currentAssignment.service_start_date || currentAssignment.start_date)} />
              <InfoRow label="End Date" value={formatDate(currentAssignment.service_end_date)} />
              <InfoRow label="Daily Rate" value={formatMoney(currentAssignment.daily_rate || currentAssignment.booking_daily_rate)} />
            </div>
          ) : (
            <EmptyState title="No active booking" subtitle="This staff member does not currently have an active assignment." />
          )}
        </Card>

        <Card title="Quick Activity" subtitle="Recent bookings and reviews from the combined admin detail payload">
          <div className="space-y-4">
            <div>
              <p className="mb-2 text-sm font-semibold text-slate-700">Recent bookings</p>
              {safeArray(overviewBookingHistory).slice(0, 3).length ? (
                <div className="space-y-3">
                  {safeArray(overviewBookingHistory).slice(0, 3).map((row, index) => (
                    <div key={row.assignment_id || index} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="font-semibold text-slate-900">{row.client_name || 'Client'}</p>
                          <p className="text-sm text-slate-500">{row.patient_name || '-'} • {row.status || '-'}</p>
                        </div>
                        <span className="text-sm font-semibold text-slate-700">{formatMoney(row.amount_allocated || row.daily_rate)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-500">No booking history available yet.</p>
              )}
            </div>
            <div>
              <p className="mb-2 text-sm font-semibold text-slate-700">Recent reviews</p>
              {safeArray(overviewReviews.recent).slice(0, 3).length ? (
                <div className="space-y-3">
                  {safeArray(overviewReviews.recent).slice(0, 3).map((review, index) => (
                    <div key={review.review_id || index} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="font-semibold text-slate-900">{review.client_name || 'Client'}</p>
                          {review.review_code && (
                            <p className="text-xs font-mono text-slate-400">{review.review_code}</p>
                          )}
                        </div>
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700">
                          <Star className="h-3 w-3" /> {review.rating || '-'}
                        </span>
                      </div>
                      <p className="mt-2 text-sm text-slate-600">{review.review_text || '-'}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-500">No reviews available yet.</p>
              )}
            </div>
          </div>
        </Card>
      </div>
    </div>
  );

  const renderEarnings = () => (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-4">
        <StatCard icon={BadgeDollarSign} label="Current Earnings" value={formatMoney(currentEarnings)} tone="emerald" onClick={() => navigate(`/admin/staff/${staffProfileId}/current-earnings`)} />
        <StatCard icon={DollarSign} label="Total Earned" value={formatMoney(totalEarned)} tone="blue" onClick={() => navigate(`/admin/staff/${staffProfileId}/total-earnings`)} />
        <StatCard icon={Wallet} label="Total Paid Out" value={formatMoney(totalPaidOut)} tone="violet" />
        <StatCard icon={Activity} label="Outstanding" value={formatMoney(outstandingPayable)} tone="rose" />
      </div>

      <Card title="Earnings Transactions" subtitle="All salary accrual and payout rows from the earnings-transactions route">
        {sectionLoadErrors.earningsTransactions ? (
          <EmptyState title="Failed to load earnings transactions" subtitle={sectionLoadErrors.earningsTransactions} />
        ) : safeArray(earningsTransactions).length === 0 ? (
          <EmptyState title="No earnings transactions" subtitle="Salary accrual and payout rows will appear here." />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50">
                <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3">Transaction</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Reference</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {earningsTransactions.map((transaction, index) => (
                  <tr key={transaction.transaction_id || index} className="hover:bg-slate-50/60">
                    <td className="px-4 py-3 font-medium text-slate-900">{transaction.transaction_id || '-'}</td>
                    <td className="px-4 py-3 text-slate-600">{formatDateTime(transaction.created_at)}</td>
                    <td className="px-4 py-3"><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">{transaction.category || '-'}</span></td>
                    <td className="px-4 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${transaction.transaction_type === 'DEBIT' ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}`}>{transaction.transaction_type || '-'}</span></td>
                    <td className="px-4 py-3 text-slate-600">{transaction.reference_number || transaction.payment_method || '-'}</td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-900">{formatMoney(transaction.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );

  const renderCurrentBooking = () => (
    <div className="space-y-6">
      {currentAssignment ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard icon={CalendarDays} label="Assignment Status" value={currentAssignment.status || '-'} tone="blue" />
          <StatCard icon={Briefcase} label="Service Type" value={currentAssignment.service_type || '-'} tone="violet" />
          <StatCard icon={User} label="Client" value={currentAssignment.client_name || '-'} tone="emerald" />
          <StatCard icon={CalendarDays} label="Start Date" value={formatDate(currentAssignment.service_start_date || currentAssignment.start_date)} tone="amber" />
        </div>
      ) : null}

      <Card title="Current Assignment" subtitle="Live booking assignment loaded from the current-booking route">
        {sectionLoadErrors.currentBooking ? (
          <EmptyState title="Failed to load current booking" subtitle={sectionLoadErrors.currentBooking} />
        ) : currentAssignment ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <InfoRow label="Assignment ID" value={currentAssignment.assignment_id || '-'} mono />
            <InfoRow label="Booking ID" value={currentAssignment.booking_id || '-'} mono />
            <InfoRow label="Client Name" value={currentAssignment.client_name || '-'} />
            <InfoRow label="Patient Name" value={currentAssignment.patient_name || '-'} />
            <InfoRow label="Service Start" value={formatDate(currentAssignment.service_start_date || currentAssignment.start_date)} />
            <InfoRow label="Service End" value={formatDate(currentAssignment.service_end_date)} />
            <InfoRow label="Daily Rate" value={formatMoney(currentAssignment.daily_rate || currentAssignment.booking_daily_rate)} />
            <InfoRow label="Assigned On" value={formatDateTime(currentAssignment.assigned_on)} />
          </div>
        ) : (
          <EmptyState title="No active booking" subtitle="This staff member is not currently assigned to a booking." />
        )}
      </Card>
    </div>
  );

  const renderBookingHistory = () => (
    <Card title="Booking History" subtitle="Assignment-centric booking history returned by the booking-history route">
      {sectionLoadErrors.bookingHistory ? (
        <EmptyState title="Failed to load booking history" subtitle={sectionLoadErrors.bookingHistory} />
      ) : safeArray(bookingHistory).length === 0 ? (
        <EmptyState title="No booking history" subtitle="Previous booking assignments will appear here." />
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">Booking</th>
                <th className="px-4 py-3">Client</th>
                <th className="px-4 py-3">Care Profile</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Start</th>
                <th className="px-4 py-3">End</th>
                <th className="px-4 py-3 text-right">Days Worked</th>
                <th className="px-4 py-3 text-right">Salary</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {bookingHistory.map((row, index) => (
                <tr key={row.assignment_id || index} className="hover:bg-slate-50/60">
                  <td className="px-4 py-3 font-medium text-slate-900">{row.booking_id || row.assignment_id || '-'}</td>
                  <td className="px-4 py-3 text-slate-600">{row.client_name || '-'}</td>
                  <td className="px-4 py-3 text-slate-600">{row.patient_name || '-'}</td>
                  <td className="px-4 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusTone(row.status)}`}>{row.status || '-'}</span></td>
                  <td className="px-4 py-3 text-slate-600">{formatDate(row.service_start_date)}</td>
                  <td className="px-4 py-3 text-slate-600">{formatDate(row.service_end_date)}</td>
                  <td className="px-4 py-3 text-right">
                    {(() => {
                      if (!row.service_start_date) return <span className="text-slate-400">-</span>;
                      const start = new Date(row.service_start_date);
                      const end = row.service_end_date ? new Date(row.service_end_date) : new Date();
                      const days = Math.max(1, Math.ceil((end - start) / 86400000));
                      return (
                        <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
                          {days} {days === 1 ? 'day' : 'days'}
                        </span>
                      );
                    })()}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-emerald-700">{formatMoney(row.total_salary_paid || row.total_salary)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );

  const renderReviews = () => {
    const distribution = safeArray(overviewReviews.distribution);
    const recentReviews = safeArray(overviewReviews.recent);

    return (
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-3">
          <StatCard icon={Star} label="Average Rating" value={averageRating ? averageRating.toFixed(1) : '-'} tone="amber" />
          <StatCard icon={Users} label="Total Reviews" value={totalReviews} tone="violet" />
          <StatCard icon={Activity} label="Visible Ratings" value={distribution.length} tone="slate" />
        </div>

        <Card title="Rating Distribution" subtitle="Aggregate rating split from the reviews route">
          {distribution.length === 0 ? (
            <EmptyState title="No ratings yet" subtitle="Rating distribution will appear when reviews are available." />
          ) : (
            <div className="space-y-3">
              {distribution.map((item) => (
                <div key={item.rating} className="flex items-center gap-4">
                  <div className="w-16 text-sm font-semibold text-slate-700">{item.rating} star</div>
                  <div className="h-3 flex-1 rounded-full bg-slate-100">
                    <div className="h-3 rounded-full bg-amber-500" style={{ width: `${Math.min(100, Number(item.count || 0) * 15)}%` }} />
                  </div>
                  <div className="w-12 text-right text-sm font-semibold text-slate-900">{item.count}</div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card title="Recent Reviews" subtitle="Latest visible reviews for this staff member">
          {recentReviews.length === 0 ? (
            <EmptyState title="No reviews available" subtitle="Recent staff reviews will appear here." />
          ) : (
            <div className="space-y-4">
              {recentReviews.map((review, index) => (
                <div key={review.review_id || index} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold text-slate-900">{review.client_name || 'Client'}</p>
                      {review.review_code && (
                        <p className="text-xs font-mono font-medium text-slate-400">{review.review_code}</p>
                      )}
                      <p className="text-sm text-slate-500">{formatDateTime(review.created_at)}</p>
                    </div>
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700">
                      <Star className="h-3 w-3" /> {review.rating || '-'}
                    </span>
                  </div>
                  <p className="mt-3 whitespace-pre-wrap text-sm text-slate-600">{review.review_text || '-'}</p>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    );
  };

  const renderPayouts = () => (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard icon={Wallet} label="All Time Paid" value={formatMoney(payoutsSummary?.all_time_paid ?? overviewPayoutSummary.total_payouts ?? 0)} tone="blue" />
        <StatCard icon={BadgeDollarSign} label="Paid This Month" value={formatMoney(payoutsSummary?.paid_this_month ?? 0)} tone="emerald" />
        <StatCard icon={Activity} label="Outstanding" value={formatMoney(payoutsSummary?.outstanding ?? currentEarnings)} tone="rose" />
      </div>

      <Card title="Record New Payout" subtitle="Enter a payout transfer that will be written to the payroll ledger">
        <form onSubmit={submitPayout} className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <label className="space-y-2 text-sm font-medium text-slate-700">
              <span>Amount *</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={payoutForm.amount}
                onChange={handlePayoutFieldChange('amount')}
                className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none transition focus:border-blue-500"
                placeholder="0.00"
                required
              />
            </label>
            <label className="space-y-2 text-sm font-medium text-slate-700">
              <span>Company Bank Account</span>
              <select
                value={payoutForm.company_bank_account_id}
                onChange={handlePayoutFieldChange('company_bank_account_id')}
                className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none transition focus:border-blue-500"
              >
                <option value="">Select company bank account</option>
                {companyBankAccounts.map((account) => (
                  <option key={account.account_id} value={account.account_id}>
                    {account.account_nickname || account.account_holder_name || account.bank_name || 'Company Bank Account'}
                    {account.account_number ? ` - ${account.account_number}` : ''}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-2 text-sm font-medium text-slate-700">
              <span>Staff Bank Account ID</span>
              <select
                value={payoutForm.staff_bank_account_id}
                onChange={handlePayoutFieldChange('staff_bank_account_id')}
                className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none transition focus:border-blue-500"
              >
                <option value="">Select staff bank account</option>
                {safeArray(bankAccounts).map((account) => (
                  <option key={account.staff_bank_account_id} value={account.staff_bank_account_id}>
                    {account.account_holder_name || account.bank_name || 'Bank Account'}
                    {account.account_number ? ` - ${account.account_number}` : ''}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-2 text-sm font-medium text-slate-700">
              <span>Payment Method</span>
              <input
                type="text"
                value={payoutForm.payment_method}
                onChange={handlePayoutFieldChange('payment_method')}
                className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none transition focus:border-blue-500"
                placeholder="BANK_TRANSFER"
              />
            </label>
            <label className="space-y-2 text-sm font-medium text-slate-700">
              <span>Reference Number</span>
              <input
                type="text"
                value={payoutForm.reference_number}
                onChange={handlePayoutFieldChange('reference_number')}
                className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none transition focus:border-blue-500"
                placeholder="Optional reference"
              />
            </label>
            <label className="space-y-2 text-sm font-medium text-slate-700 md:col-span-2 xl:col-span-1">
              <span>Notes</span>
              <input
                type="text"
                value={payoutForm.notes}
                onChange={handlePayoutFieldChange('notes')}
                className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none transition focus:border-blue-500"
                placeholder="Optional notes"
              />
            </label>
          </div>

          {payoutSubmitError && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {payoutSubmitError}
            </div>
          )}

          {payoutSubmitSuccess && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              {payoutSubmitSuccess}
            </div>
          )}

          <div className="flex flex-wrap gap-3">
            <button
              type="submit"
              disabled={payoutSubmitting}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
            >
              {payoutSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <BadgeDollarSign className="h-4 w-4" />}
              Record Payout
            </button>
            <button
              type="button"
              onClick={() => setPayoutForm({
                amount: '',
                company_bank_account_id: '',
                staff_bank_account_id: '',
                payment_method: 'BANK_TRANSFER',
                reference_number: '',
                notes: '',
              })}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Reset
            </button>
          </div>
        </form>
      </Card>

      <Card title="Payout History" subtitle="Recorded salary payments loaded from the payouts route">
        {sectionLoadErrors.payouts ? (
          <EmptyState title="Failed to load payouts" subtitle={sectionLoadErrors.payouts} />
        ) : safeArray(payouts).length === 0 ? (
          <EmptyState title="No payouts recorded" subtitle="Recorded salary payouts will appear here." />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50">
                <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3">Payout</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Method</th>
                  <th className="px-4 py-3">Reference</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {payouts.map((payout, index) => (
                  <tr key={payout.staff_payment_id || index} className="hover:bg-slate-50/60">
                    <td className="px-4 py-3 font-medium text-slate-900">{payout.staff_payment_id || '-'}</td>
                    <td className="px-4 py-3 text-slate-600">{formatDateTime(payout.paid_at)}</td>
                    <td className="px-4 py-3 text-slate-600">{payout.payment_method || '-'}</td>
                    <td className="px-4 py-3 text-slate-600">{payout.reference_number || '-'}</td>
                    <td className="px-4 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusTone(payout.status)}`}>{payout.status || '-'}</span></td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-900">{formatMoney(payout.amount_paid)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );

  const handleExpandRequest = async (requestId) => {
    if (expandedRequestId === requestId) {
      setExpandedRequestId(null);
      return;
    }
    setExpandedRequestId(requestId);
    if (!requestLogs[requestId]) {
      setLoadingLogs((prev) => ({ ...prev, [requestId]: true }));
      try {
        const res = await runAdminRequest(() => apiClient.getChangeRequestLogs(requestId));
        setRequestLogs((prev) => ({ ...prev, [requestId]: safeArray(res?.data) }));
      } catch {
        setRequestLogs((prev) => ({ ...prev, [requestId]: [] }));
      } finally {
        setLoadingLogs((prev) => ({ ...prev, [requestId]: false }));
      }
    }
  };

  const requestTypeBadge = (type) => {
    const map = {
      PROFILE_UPDATE: 'bg-blue-100 text-blue-700',
      BANK_ACCOUNT_ADD: 'bg-emerald-100 text-emerald-700',
      BANK_ACCOUNT_EDIT: 'bg-amber-100 text-amber-700',
      BANK_ACCOUNT_REMOVE: 'bg-rose-100 text-rose-700',
    };
    return map[type] || 'bg-slate-100 text-slate-700';
  };

  const requestTypeLabel = (type) => {
    const map = {
      PROFILE_UPDATE: 'Profile Update',
      BANK_ACCOUNT_ADD: 'Bank Add',
      BANK_ACCOUNT_EDIT: 'Bank Edit',
      BANK_ACCOUNT_REMOVE: 'Bank Remove',
    };
    return map[type] || type;
  };

  const auditActionStyle = (action) => {
    const map = {
      SUBMITTED: { dot: 'bg-slate-500', badge: 'bg-slate-100 text-slate-700' },
      CLAIMED: { dot: 'bg-blue-500', badge: 'bg-blue-100 text-blue-700' },
      APPROVED: { dot: 'bg-emerald-500', badge: 'bg-emerald-100 text-emerald-700' },
      REJECTED: { dot: 'bg-rose-500', badge: 'bg-rose-100 text-rose-700' },
    };
    return map[action] || { dot: 'bg-slate-400', badge: 'bg-slate-100 text-slate-700' };
  };

  const renderChangeDiff = (requestType, requestedChanges) => {
    if (!requestedChanges) return <p className="text-sm text-slate-500">No change data available.</p>;

    if (requestType === 'PROFILE_UPDATE' || requestType === 'BANK_ACCOUNT_EDIT') {
      return (
        <div className="space-y-2">
          {Object.entries(requestedChanges).map(([field, change]) => (
            <div key={field} className="flex flex-wrap items-center gap-2 rounded-lg bg-white border border-slate-200 px-3 py-2 text-sm">
              <span className="w-44 font-semibold text-slate-600 capitalize">{field.replace(/_/g, ' ')}</span>
              <span className="text-rose-600 line-through">{String(change?.old_value ?? '—')}</span>
              <span className="text-slate-400">→</span>
              <span className="font-medium text-emerald-700">{String(change?.new_value ?? '—')}</span>
            </div>
          ))}
        </div>
      );
    }

    if (requestType === 'BANK_ACCOUNT_ADD') {
      return (
        <div className="space-y-2">
          {Object.entries(requestedChanges).map(([field, value]) => (
            <div key={field} className="flex items-center gap-2 rounded-lg bg-white border border-slate-200 px-3 py-2 text-sm">
              <span className="w-44 font-semibold text-slate-600 capitalize">{field.replace(/_/g, ' ')}</span>
              <span className="font-medium text-emerald-700">{String(value ?? '—')}</span>
            </div>
          ))}
        </div>
      );
    }

    if (requestType === 'BANK_ACCOUNT_REMOVE') {
      return (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          Remove bank account ID: <span className="font-mono font-semibold">{requestedChanges.staff_bank_account_id}</span>
        </div>
      );
    }

    return <pre className="overflow-x-auto rounded-lg bg-slate-100 p-3 text-xs">{JSON.stringify(requestedChanges, null, 2)}</pre>;
  };

  const renderChangeHistory = () => {
    const approvedCount = changeRequests.filter((r) => r.status === 'APPROVED').length;
    const rejectedCount = changeRequests.filter((r) => r.status === 'REJECTED').length;
    const pendingCount = changeRequests.filter((r) => r.status === 'PENDING' || r.status === 'UNDER_REVIEW').length;

    return (
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-4">
          <StatCard icon={ClipboardList} label="Total Requests" value={changeRequests.length} tone="slate" />
          <StatCard icon={ClipboardList} label="Pending / Under Review" value={pendingCount} tone="amber" />
          <StatCard icon={ClipboardList} label="Approved" value={approvedCount} tone="emerald" />
          <StatCard icon={ClipboardList} label="Rejected" value={rejectedCount} tone="rose" />
        </div>

        <Card title="Change Request History" subtitle="All profile and bank account change requests submitted by this staff member">
          {sectionLoadErrors.changeRequests ? (
            <EmptyState title="Failed to load change requests" subtitle={sectionLoadErrors.changeRequests} />
          ) : changeRequests.length === 0 ? (
            <EmptyState title="No change requests" subtitle="This staff member has not submitted any change requests yet." />
          ) : (
            <div className="space-y-3">
              {changeRequests.map((req) => {
                const isExpanded = expandedRequestId === req.request_id;
                const logs = requestLogs[req.request_id] || [];
                const isLoadingLog = loadingLogs[req.request_id];

                return (
                  <div key={req.request_id} className="overflow-hidden rounded-2xl border border-slate-200">
                    <button
                      type="button"
                      onClick={() => handleExpandRequest(req.request_id)}
                      className="flex w-full items-start gap-4 px-4 py-4 text-left transition-colors hover:bg-slate-50"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="mb-2 flex flex-wrap items-center gap-2">
                          <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${requestTypeBadge(req.request_type)}`}>
                            {requestTypeLabel(req.request_type)}
                          </span>
                          <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${statusTone(req.status)}`}>
                            {req.status?.replace(/_/g, ' ')}
                          </span>
                          <span className="font-mono text-xs text-slate-400">#{String(req.request_id || '').slice(-8)}</span>
                        </div>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600">
                          <span>Submitted: {formatDateTime(req.created_at)}</span>
                          {req.reviewer_name && (
                            <span>
                              Reviewer: <span className="font-semibold text-slate-800">{req.reviewer_name}</span>
                            </span>
                          )}
                          {req.reviewed_at && <span>Resolved: {formatDateTime(req.reviewed_at)}</span>}
                        </div>
                        {req.review_notes && (
                          <p className="mt-1 text-sm italic text-slate-500">"{req.review_notes}"</p>
                        )}
                      </div>
                      <div className="mt-1 flex-shrink-0">
                        {isExpanded
                          ? <ChevronUp className="h-4 w-4 text-slate-400" />
                          : <ChevronDown className="h-4 w-4 text-slate-400" />}
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="space-y-5 border-t border-slate-200 bg-slate-50/60 px-4 py-4">
                        <div>
                          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Requested Changes</p>
                          {renderChangeDiff(req.request_type, req.requested_changes)}
                        </div>

                        <div>
                          <p className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">Audit Trail</p>
                          {isLoadingLog ? (
                            <div className="flex items-center gap-2 text-sm text-slate-500">
                              <Loader2 className="h-4 w-4 animate-spin" /> Loading logs...
                            </div>
                          ) : logs.length === 0 ? (
                            <p className="text-sm text-slate-500">No audit log entries found.</p>
                          ) : (
                            <div className="relative space-y-4 pl-5">
                              <div className="absolute bottom-2 left-2 top-2 w-px bg-slate-200" />
                              {logs.map((log, idx) => {
                                const style = auditActionStyle(log.action);
                                return (
                                  <div key={log.log_id || idx} className="relative flex gap-3">
                                    <div className={`absolute -left-[13px] mt-1.5 h-2.5 w-2.5 rounded-full ring-2 ring-white ${style.dot}`} />
                                    <div className="flex-1">
                                      <div className="flex flex-wrap items-center gap-2">
                                        <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${style.badge}`}>
                                          {log.action}
                                        </span>
                                        <span className="text-sm font-semibold text-slate-800">
                                          {log.performed_by_name || 'Unknown'}
                                        </span>
                                        <span className="text-xs text-slate-500">{formatDateTime(log.created_at)}</span>
                                      </div>
                                      {log.notes && (
                                        <p className="mt-1 text-sm italic text-slate-600">"{log.notes}"</p>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>
    );
  };

  const submitDeduction = async (event) => {
    event.preventDefault();
    setDeductionError('');
    setDeductionSuccess('');
    try {
      setDeductionSubmitting(true);
      await runAdminRequest(() => apiClient.createStaffDeduction(staffProfileId, {
        amount: deductionForm.amount,
        reason: deductionForm.reason,
      }));
      setDeductionSuccess('Deduction applied. WhatsApp and SMS sent to staff member.');
      setDeductionForm({ amount: '', reason: '' });
      await loadPage();
    } catch (err) {
      setDeductionError(err?.message || 'Failed to apply deduction');
    } finally {
      setDeductionSubmitting(false);
    }
  };

  const renderDeductions = () => {
    const totalDeducted = deductions.reduce((sum, d) => sum + parseFloat(d.amount || 0), 0);

    return (
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2">
          <StatCard icon={MinusCircle} label="Total Deducted" value={formatMoney(totalDeducted)} tone="rose" />
          <StatCard icon={Activity} label="Total Entries" value={deductions.length} tone="slate" />
        </div>

        <Card title="Apply Deduction" subtitle="Deduct an amount from this staff member's earnings. A WhatsApp message and SMS will be sent automatically.">
          <form onSubmit={submitDeduction} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-2 text-sm font-medium text-slate-700">
                <span>Amount (LKR) <span className="text-rose-500">*</span></span>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={deductionForm.amount}
                  onChange={(e) => { setDeductionForm((f) => ({ ...f, amount: e.target.value })); setDeductionError(''); setDeductionSuccess(''); }}
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none transition focus:border-rose-500"
                  placeholder="0.00"
                  required
                />
              </label>
              <label className="space-y-2 text-sm font-medium text-slate-700">
                <span>Reason for Deduction <span className="text-rose-500">*</span></span>
                <input
                  type="text"
                  value={deductionForm.reason}
                  onChange={(e) => { setDeductionForm((f) => ({ ...f, reason: e.target.value })); setDeductionError(''); setDeductionSuccess(''); }}
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none transition focus:border-rose-500"
                  placeholder="e.g. Uniform deposit, Advance repayment…"
                  required
                />
              </label>
            </div>

            {deductionError && (
              <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                <AlertCircle className="h-4 w-4 flex-shrink-0" /> {deductionError}
              </div>
            )}
            {deductionSuccess && (
              <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                <Check className="h-4 w-4 flex-shrink-0" /> {deductionSuccess}
              </div>
            )}

            <button
              type="submit"
              disabled={deductionSubmitting}
              className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-60"
            >
              {deductionSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <MinusCircle className="h-4 w-4" />}
              Apply Deduction
            </button>
          </form>
        </Card>

        <Card title="Deduction History" subtitle="All deductions applied to this staff member">
          {sectionLoadErrors.deductions ? (
            <EmptyState title="Failed to load deductions" subtitle={sectionLoadErrors.deductions} />
          ) : deductions.length === 0 ? (
            <EmptyState title="No deductions recorded" subtitle="Applied deductions will appear here." />
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50">
                  <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Reason</th>
                    <th className="px-4 py-3">Recorded By</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {deductions.map((d, index) => (
                    <tr key={d.transaction_id || index} className="hover:bg-slate-50/60">
                      <td className="px-4 py-3 text-slate-600">{formatDateTime(d.created_at)}</td>
                      <td className="px-4 py-3 text-slate-900">{d.reason || '-'}</td>
                      <td className="px-4 py-3 text-slate-600">{d.recorded_by || 'Admin'}</td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusTone(d.status)}`}>{d.status || '-'}</span>
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-rose-700">{formatMoney(d.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    );
  };

  const openAddBankModal = () => setBankModal({
    isOpen: true, mode: 'add', editing: null,
    form: { account_holder_name: '', bank_name: '', branch_name: '', account_number: '', currency: 'LKR' },
    saving: false, error: '',
  });

  const openEditBankModal = (account) => setBankModal({
    isOpen: true, mode: 'edit', editing: account.staff_bank_account_id,
    form: {
      account_holder_name: account.account_holder_name || '',
      bank_name: account.bank_name || '',
      branch_name: account.branch_name || '',
      account_number: account.account_number || '',
      currency: account.currency || 'LKR',
    },
    saving: false, error: '',
  });

  const handleBankModalSave = async () => {
    const { form, mode, editing } = bankModal;
    if (!form.account_holder_name || !form.bank_name || !form.account_number) {
      setBankModal((p) => ({ ...p, error: 'Account holder name, bank name and account number are required.' }));
      return;
    }
    setBankModal((p) => ({ ...p, saving: true, error: '' }));
    try {
      if (mode === 'add') {
        await runAdminRequest(() => apiClient.createStaffBankAccount(staffProfileId, form));
      } else {
        await runAdminRequest(() => apiClient.updateStaffBankAccount(staffProfileId, editing, form));
      }
      const res = await runAdminRequest(() => apiClient.getStaffBankAccounts(staffProfileId));
      setBankAccounts(safeArray(res?.data));
      setBankModal((p) => ({ ...p, isOpen: false }));
    } catch (err) {
      setBankModal((p) => ({ ...p, saving: false, error: err?.message || 'Failed to save bank account.' }));
    }
  };

  const handleDeleteBankAccount = async (bankAccountId) => {
    setDeletingBankId(bankAccountId);
    try {
      await runAdminRequest(() => apiClient.deleteStaffBankAccount(staffProfileId, bankAccountId));
      const res = await runAdminRequest(() => apiClient.getStaffBankAccounts(staffProfileId));
      setBankAccounts(safeArray(res?.data));
    } catch {
      // silently ignore; list stays unchanged
    } finally {
      setDeletingBankId(null);
    }
  };

  const renderBankAccounts = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-bold text-slate-900">Staff Bank Accounts</h3>
          <p className="text-sm text-slate-500">Personal bank account records for this staff member</p>
        </div>
        <button
          type="button"
          onClick={openAddBankModal}
          className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-500 transition-all"
        >
          <Plus className="h-4 w-4" /> Add Account
        </button>
      </div>

      {sectionLoadErrors.bankAccounts ? (
        <EmptyState title="Failed to load bank accounts" subtitle={sectionLoadErrors.bankAccounts} />
      ) : safeArray(bankAccounts).length === 0 ? (
        <EmptyState title="No bank accounts saved" subtitle="Use the Add Account button to add a bank account for this staff member." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {bankAccounts.map((account, index) => (
            <div key={account.staff_bank_account_id || index} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <h4 className="font-semibold text-slate-900 truncate">{account.account_holder_name || account.bank_name || 'Bank Account'}</h4>
                  <p className="text-sm text-slate-500">{account.bank_name || '-'}{account.branch_name ? ` • ${account.branch_name}` : ''}</p>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold flex-shrink-0 ${account.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                  {account.is_active ? 'Active' : 'Inactive'}
                </span>
              </div>
              <div className="space-y-1.5 text-sm text-slate-600 mb-4">
                <p><span className="font-semibold text-slate-900">Account No:</span> {account.account_number || '-'}</p>
                <p><span className="font-semibold text-slate-900">Currency:</span> {account.currency || 'LKR'}</p>
                <p><span className="font-semibold text-slate-900">Created:</span> {formatDate(account.created_at)}</p>
                {account.is_verified && (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                    <Check className="h-3 w-3" /> Verified
                  </span>
                )}
              </div>
              <div className="flex gap-2 border-t border-slate-200 pt-3">
                <button
                  type="button"
                  onClick={() => openEditBankModal(account)}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-blue-50 hover:border-blue-200 hover:text-blue-700 transition-all"
                >
                  <Pencil className="h-3.5 w-3.5" /> Edit
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteBankAccount(account.staff_bank_account_id)}
                  disabled={deletingBankId === account.staff_bank_account_id}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-rose-50 hover:border-rose-200 hover:text-rose-700 transition-all disabled:opacity-50"
                >
                  {deletingBankId === account.staff_bank_account_id
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : <Trash2 className="h-3.5 w-3.5" />}
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Bank Account Modal */}
      {bankModal.isOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
            <div className="flex items-start gap-3 mb-5">
              <div className="p-2 bg-blue-100 rounded-xl">
                <Landmark className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  {bankModal.mode === 'add' ? 'Add Bank Account' : 'Edit Bank Account'}
                </h3>
                <p className="text-sm text-slate-500">For {profile.full_name || 'this staff member'}</p>
              </div>
            </div>

            {bankModal.error && (
              <div className="mb-4 bg-rose-50 border border-rose-200 text-rose-700 px-3 py-2 rounded-xl text-sm flex items-center gap-2">
                <AlertCircle className="h-4 w-4 flex-shrink-0" /> {bankModal.error}
              </div>
            )}

            <div className="space-y-3 mb-5">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Account Holder Name <span className="text-rose-500">*</span>
                </label>
                <input
                  value={bankModal.form.account_holder_name}
                  onChange={(e) => setBankModal((p) => ({ ...p, form: { ...p.form, account_holder_name: e.target.value } }))}
                  placeholder="e.g. John Perera"
                  className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-100"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Bank Name <span className="text-rose-500">*</span>
                </label>
                <input
                  value={bankModal.form.bank_name}
                  onChange={(e) => setBankModal((p) => ({ ...p, form: { ...p.form, bank_name: e.target.value } }))}
                  placeholder="e.g. Commercial Bank"
                  className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-100"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Branch Name</label>
                <input
                  value={bankModal.form.branch_name}
                  onChange={(e) => setBankModal((p) => ({ ...p, form: { ...p.form, branch_name: e.target.value } }))}
                  placeholder="e.g. Colombo 03"
                  className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-100"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Account Number <span className="text-rose-500">*</span>
                  </label>
                  <input
                    value={bankModal.form.account_number}
                    onChange={(e) => setBankModal((p) => ({ ...p, form: { ...p.form, account_number: e.target.value } }))}
                    placeholder="1234567890"
                    className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Currency</label>
                  <select
                    value={bankModal.form.currency}
                    onChange={(e) => setBankModal((p) => ({ ...p, form: { ...p.form, currency: e.target.value } }))}
                    className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm outline-none transition focus:border-blue-500"
                  >
                    <option value="LKR">LKR</option>
                    <option value="USD">USD</option>
                    <option value="EUR">EUR</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setBankModal((p) => ({ ...p, isOpen: false }))}
                className="flex-1 rounded-xl border border-slate-200 bg-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-200 transition-all"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleBankModalSave}
                disabled={bankModal.saving}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-500 transition-all shadow-lg shadow-blue-600/20 disabled:opacity-60"
              >
                {bankModal.saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {bankModal.mode === 'add' ? 'Add Account' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  if (loading || authLoading) {
    return (
      <AdminLayout title="Staff Details" subtitle="Loading staff profile...">
        <div className="flex min-h-[45vh] items-center justify-center rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center gap-3 text-slate-600">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm font-medium">Loading staff detail...</span>
          </div>
        </div>
      </AdminLayout>
    );
  }

  if (error) {
    return (
      <AdminLayout title="Staff Details" subtitle="Unable to load staff profile">
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-rose-700">
          <p className="font-semibold">{error}</p>
          <button
            type="button"
            onClick={() => navigate('/admin/users')}
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700"
          >
            <ArrowLeft className="h-4 w-4" /> Back to staff roster
          </button>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout
      title="Staff Details"
      subtitle="Admin dashboard view of the full staff profile, earnings, bookings, payouts, and bank details"
      actions={(
        <>
          <button
            type="button"
            onClick={refreshData}
            disabled={refreshing}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} /> Refresh
          </button>
          <button
            type="button"
            onClick={() => navigate('/admin/users')}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            <ArrowLeft className="h-4 w-4" /> Back to roster
          </button>
        </>
      )}
    >
      <div className="space-y-6">
        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 px-6 py-6 text-white">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
              <div className="flex items-start gap-4">
                <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl bg-white/10 text-2xl font-bold">
                  {profile.profile_picture_url ? (
                    <img src={profile.profile_picture_url} alt={profile.full_name || 'Staff'} className="h-full w-full object-cover" />
                  ) : (
                    <span>{(profile.full_name || 'S').charAt(0)}</span>
                  )}
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-3">
                    <h1 className="text-2xl font-bold">{profile.full_name || 'Staff profile'}</h1>
                    <span className={`rounded-full px-3 py-1 text-xs font-bold ${isActive ? 'bg-emerald-400/20 text-emerald-200' : 'bg-rose-400/20 text-rose-200'}`}>
                      {isActive ? 'Active' : 'Inactive'}
                    </span>
                    <span className={`rounded-full px-3 py-1 text-xs font-bold ${statusTone(activeStatus)}`}>
                      {profile.current_status || 'UNKNOWN'}
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-4 text-sm text-slate-200">
                    <span className="inline-flex items-center gap-2"><Phone className="h-4 w-4" /> {profile.mobile_number || profile.email || '-'}</span>
                    <span className="inline-flex items-center gap-2"><Mail className="h-4 w-4" /> {profile.email || '-'}</span>
                    <span className="inline-flex items-center gap-2"><MapPin className="h-4 w-4" /> {profile.location || profile.home_address || '-'}</span>
                    <span className="inline-flex items-center gap-2"><Briefcase className="h-4 w-4" /> {profile.designation || '-'}</span>
                  </div>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:min-w-[360px]">
                <div
                  className="rounded-2xl bg-white/10 p-4 backdrop-blur cursor-pointer hover:bg-white/20 transition-colors"
                  onClick={() => navigate(`/admin/staff/${staffProfileId}/current-earnings`)}
                  title="Click to see current earnings breakdown"
                >
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-300">Current Earnings</p>
                  <p className="mt-1 text-2xl font-bold">{formatMoney(currentEarnings)}</p>
                  <p className="mt-1 text-xs text-white/60">View breakdown →</p>
                </div>
                <div className="rounded-2xl bg-white/10 p-4 backdrop-blur">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-300">Outstanding Payable</p>
                  <p className="mt-1 text-2xl font-bold">{formatMoney(outstandingPayable)}</p>
                </div>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={handleToggleAccount}
                disabled={statusUpdating}
                className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60 ${isActive ? 'bg-rose-600 hover:bg-rose-700' : 'bg-emerald-600 hover:bg-emerald-700'}`}
              >
                {statusUpdating ? <Loader2 className="h-4 w-4 animate-spin" /> : isActive ? <ToggleLeft className="h-4 w-4" /> : <ToggleRight className="h-4 w-4" />}
                {isActive ? 'Deactivate Account' : 'Reactivate Account'}
              </button>
              <button
                type="button"
                onClick={() => setActiveSection('earnings')}
                className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white hover:bg-white/20"
              >
                <BadgeDollarSign className="h-4 w-4" /> View Earnings
              </button>
            </div>
          </div>

          <div className="grid gap-4 p-6 lg:grid-cols-4">
            <StatCard icon={BadgeDollarSign} label="Current Earnings" value={formatMoney(currentEarnings)} tone="emerald" onClick={() => navigate(`/admin/staff/${staffProfileId}/current-earnings`)} />
            <StatCard icon={DollarSign} label="Total Earned" value={formatMoney(totalEarned)} tone="blue" onClick={() => navigate(`/admin/staff/${staffProfileId}/total-earnings`)} />
            <StatCard icon={Wallet} label="Paid Out" value={formatMoney(totalPaidOut)} tone="violet" />
            <StatCard icon={Activity} label="Bookings" value={totalBookings} tone="amber" />
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex gap-3 overflow-x-auto pb-1">
            {sectionConfig.map((section) => (
              <SectionButton
                key={section.id}
                active={activeSection === section.id}
                icon={section.icon}
                label={section.label}
                onClick={() => setActiveSection(section.id)}
              />
            ))}
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          {activeSection === 'overview' && renderOverview()}
          {activeSection === 'earnings' && renderEarnings()}
          {activeSection === 'current-booking' && renderCurrentBooking()}
          {activeSection === 'booking-history' && renderBookingHistory()}
          {activeSection === 'reviews' && renderReviews()}
          {activeSection === 'payouts' && renderPayouts()}
          {activeSection === 'deductions' && renderDeductions()}
          {activeSection === 'bank-accounts' && renderBankAccounts()}
          {activeSection === 'change-history' && renderChangeHistory()}
        </div>
      </div>
    </AdminLayout>
  );
};

export default StaffDetailPage;