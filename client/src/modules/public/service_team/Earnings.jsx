import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Wallet,
  TrendingUp,
  CalendarDays,
  ArrowUpRight,
  ArrowDownRight,
  ArrowDownLeft,
  Clock3,
  BadgeCheck,
  CircleAlert,
  X,
  BadgeDollarSign,
  Activity,
  Info,
  ChevronLeft,
  ChevronRight,
  MinusCircle,
} from 'lucide-react';
import apiClient from '../../../api/api';
import { useAuth } from '../../../context/AuthContext';
import StaffSidebar from './StaffSidebar';

const STATUS_META = {
  APPROVED: { labelKey: 'statusMeta.approved', className: 'bg-emerald-50 text-emerald-700 border-emerald-100' },
  PENDING:  { labelKey: 'statusMeta.pending',  className: 'bg-amber-50 text-amber-700 border-amber-100'   },
  REJECTED: { labelKey: 'statusMeta.rejected', className: 'bg-rose-50 text-rose-700 border-rose-100'      },
};

const formatCurrency = (value) => `LKR ${Number(value || 0).toLocaleString()}`;

const formatDate = (value) =>
  value
    ? new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    : '—';

const formatDateTime = (value) => {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
};

const LedgerRow = ({ entry }) => {
  const { t } = useTranslation('earnings');
  const isCredit   = entry.transaction_type === 'CREDIT';
  const isAdvance  = entry.category === 'STAFF_ADVANCE';
  const isDeduction = entry.category === 'STAFF_DEDUCTION';
  const isRevocation = entry.category === 'STAFF_SALARY' && entry.transaction_type === 'DEBIT';

  return (
    <tr className="hover:bg-slate-50/70 transition-colors">
      <td className="px-4 py-3 text-sm text-slate-500 whitespace-nowrap">
        {formatDateTime(entry.created_at)}
      </td>
      <td className="px-4 py-3">
        {isCredit ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
            <ArrowUpRight className="h-3 w-3" />
            {t('ledgerTypes.earned')}
          </span>
        ) : isAdvance ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
            <Wallet className="h-3 w-3" />
            {t('ledgerTypes.advance')}
          </span>
        ) : isDeduction ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-semibold text-rose-700">
            <MinusCircle className="h-3 w-3" />
            {t('ledgerTypes.deduction')}
          </span>
        ) : isRevocation ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-semibold text-rose-700">
            <MinusCircle className="h-3 w-3" />
            {t('ledgerTypes.revoked')}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-semibold text-rose-700">
            <ArrowDownLeft className="h-3 w-3" />
            {t('ledgerTypes.payout')}
          </span>
        )}
      </td>
      <td className="px-4 py-3">
        {isCredit ? (
          <div>
            <p className="text-sm font-medium text-slate-800">{entry.client_name || t('ledgerDescriptions.dailySalary')}</p>
            {entry.patient_name && <p className="text-xs text-slate-400">{t('ledgerDescriptions.careProfile')}{entry.patient_name}</p>}
            {entry.service_type  && <p className="text-xs text-slate-400">{entry.service_type}</p>}
          </div>
        ) : isAdvance ? (
          <div>
            <p className="text-sm font-medium text-slate-800">{t('ledgerDescriptions.salaryAdvance')}</p>
            {entry.reviewed_by_name && (
              <p className="text-xs text-slate-400">{t('ledgerDescriptions.approvedBy')}{entry.reviewed_by_name}</p>
            )}
          </div>
        ) : isDeduction ? (
          <div>
            <p className="text-sm font-medium text-slate-800">{entry.reason || t('ledgerDescriptions.manualDeduction')}</p>
          </div>
        ) : isRevocation ? (
          <div>
            <p className="text-sm font-medium text-slate-800">{t('ledgerDescriptions.salaryRevoked')}</p>
            {entry.notes && <p className="text-xs text-slate-400 italic">{entry.notes}</p>}
          </div>
        ) : (
          <div>
            <p className="text-sm font-medium text-slate-800">
              {t('ledgerDescriptions.payout')}{entry.company_account_name ? ` ${t('ledgerDescriptions.via')} ${entry.company_account_name}` : ''}
            </p>
            {entry.staff_bank_name && (
              <p className="text-xs text-slate-400">
                {t('ledgerDescriptions.to')}{entry.staff_bank_name}
                {entry.staff_account_number && ` ···${entry.staff_account_number.slice(-4)}`}
              </p>
            )}
            {entry.payout_notes && <p className="text-xs text-slate-400 italic">{entry.payout_notes}</p>}
          </div>
        )}
      </td>
      <td className={`px-4 py-3 text-right font-semibold whitespace-nowrap ${isCredit ? 'text-emerald-700' : 'text-rose-600'}`}>
        {isCredit ? '+' : '-'}{formatCurrency(entry.amount)}
      </td>
      <td className="px-4 py-3 text-right text-sm font-medium text-slate-700 whitespace-nowrap">
        {formatCurrency(entry.running_balance)}
      </td>
    </tr>
  );
};

const Earnings = () => {
  const { t } = useTranslation('earnings');
  const { user } = useAuth();
  const [wallet, setWallet]       = useState(null);
  const [staffData, setStaffData] = useState(null);
  const [advances, setAdvances]   = useState([]);
  const [breakdown, setBreakdown] = useState(null);
  const [ledgerPage, setLedgerPage] = useState(1);

  const [showModal, setShowModal] = useState(false);
  const [amount, setAmount]       = useState('');
  const [loading, setLoading]     = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]         = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const fetchBreakdown = async (p = 1) => {
    try {
      const res = await apiClient.getMyCurrentEarningsBreakdown({ page: p, limit: 50 });
      if (res.status === 'success') setBreakdown(res.data);
    } catch {
      // non-fatal — ledger section just won't render
    }
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError('');

        const staffId = user?.staff_id || user?.id;
        if (!staffId) { setError(t('errors.staffNotFound')); return; }

        const [walletResponse, staffResponse, advancesResponse] = await Promise.all([
          apiClient.getMyWallet(),
          user?.staff_id ? apiClient.getStaffByID(user.staff_id) : apiClient.getStaffByUserID(user.id),
          apiClient.getMyAdvances(),
        ]);

        setWallet(walletResponse.data);
        setStaffData(staffResponse.data);
        setAdvances(advancesResponse.data || []);
        await fetchBreakdown(1);
      } catch (err) {
        console.error('Failed to load earnings data:', err);
        setError(t('errors.loadFailed'));
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [user?.staff_id, user?.id]);

  const handleLedgerPage = (p) => {
    setLedgerPage(p);
    fetchBreakdown(p);
  };

  const handleRequestAdvance = async () => {
    const parsedAmount = Number(amount);
    if (!parsedAmount || Number.isNaN(parsedAmount) || parsedAmount <= 0) {
      setError(t('errors.invalidAmount'));
      return;
    }
    try {
      setSubmitting(true);
      setError('');
      await apiClient.requestAdvance({ amount_requested: parsedAmount });
      setSuccessMsg(t('success.advanceSubmitted'));
      setShowModal(false);
      setAmount('');
      const [walletResponse, advancesResponse] = await Promise.all([
        apiClient.getMyWallet(),
        apiClient.getMyAdvances(),
      ]);
      setWallet(walletResponse.data);
      setAdvances(advancesResponse.data || []);
    } catch (err) {
      console.error('Advance request error:', err);
      setError(err.message || t('errors.submitFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  const walletBalance    = Number(wallet?.balance || 0);
  const thresholdAmount  = Number(wallet?.advance_threshold_amount || 15000);
  const canRequestAdvance = walletBalance >= thresholdAmount;

  const totalRequested = useMemo(() => {
    const now = new Date();
    return advances.reduce((sum, item) => {
      const d = item?.requested_at ? new Date(item.requested_at) : null;
      const isCurrentMonth = d && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      return isCurrentMonth ? sum + Number(item.amount_requested || 0) : sum;
    }, 0);
  }, [advances]);

  const approvedCount = useMemo(() => advances.filter((i) => i.status === 'APPROVED').length, [advances]);
  const pendingCount  = useMemo(() => advances.filter((i) => i.status === 'PENDING').length,  [advances]);

  const staffName        = staffData?.full_name || user?.name || t('staffFallbackName');
  const verificationLabel = staffData?.verification_status === 'VERIFIED' ? t('verification.verified') : t('verification.pending');

  const totalLedgerPages = breakdown?.pagination?.total_pages || 1;

  const mergedLedger = useMemo(() => {
    const ledgerEntries = (breakdown?.ledger || []).map((e) => ({ ...e }));
    const advanceEntries = (breakdown?.advances || []).map((a) => ({
      transaction_id: a.advance_id,
      category: 'STAFF_ADVANCE',
      transaction_type: 'DEBIT',
      amount: a.amount_requested,
      reviewed_by_name: a.reviewed_by_name,
      created_at: a.approved_at,
      running_balance: null,
    }));

    const combined = [...ledgerEntries, ...advanceEntries].sort(
      (a, b) => new Date(a.created_at) - new Date(b.created_at)
    );

    let balance = 0;
    combined.forEach((entry) => {
      balance += entry.transaction_type === 'CREDIT' ? parseFloat(entry.amount) : -parseFloat(entry.amount);
      entry.running_balance = balance;
    });

    return combined.reverse();
  }, [breakdown?.ledger, breakdown?.advances]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 font-sans text-slate-900 flex flex-col md:flex-row">
        <StaffSidebar staffProfileId={staffData?.staff_profile_id} title={t('header.title')} />
        <main className="flex-1 flex items-center justify-center">
          <div className="text-center flex flex-col items-center gap-4">
            <div className="w-12 h-12 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin" />
            <div className="text-sm font-medium text-slate-600">{t('loading')}</div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="h-screen bg-slate-50 font-sans text-slate-900 flex flex-col md:flex-row overflow-hidden">
      <StaffSidebar staffProfileId={staffData?.staff_profile_id} title={t('header.title')} />

      <main className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto px-6 md:px-8 py-6 md:py-8 space-y-6">

          {/* Header */}
          <header className="flex flex-col gap-4 border-b border-slate-200 bg-white px-6 py-6 rounded-2xl shadow-sm">
            <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400 mb-1">{t('header.portalLabel')}</p>
                <h1 className="text-3xl md:text-4xl font-semibold tracking-tight text-slate-900">{t('header.title')}</h1>
                <p className="text-sm text-slate-500 mt-2 max-w-2xl">
                  {t('header.subtitle')}
                </p>
              </div>
              <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-900 text-white">
                  <Wallet className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-900">{staffName}</p>
                  <p className="text-xs text-slate-500">{verificationLabel}</p>
                </div>
              </div>
            </div>
          </header>

          {error && (
            <div className="flex items-center gap-3 rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-rose-700">
              <CircleAlert className="w-5 h-5 flex-shrink-0" />
              <span className="text-sm font-medium">{error}</span>
            </div>
          )}
          {successMsg && (
            <div className="flex items-center gap-3 rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-emerald-700">
              <BadgeCheck className="w-5 h-5 flex-shrink-0" />
              <span className="text-sm font-medium">{successMsg}</span>
            </div>
          )}

          {/* Earnings Summary Cards */}
          <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-3 text-emerald-600">
                <BadgeDollarSign className="h-5 w-5" />
                <span className="text-xs font-semibold uppercase tracking-wide">{t('summaryCards.currentBalance.label')}</span>
              </div>
              <p className="text-2xl font-bold text-slate-900">{formatCurrency(breakdown?.summary?.current_earnings ?? walletBalance)}</p>
              <p className="mt-1 text-xs text-slate-500">{t('summaryCards.currentBalance.sub')}</p>
            </div>

            <div className="rounded-2xl border border-blue-100 bg-blue-50 p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-3 text-blue-600">
                <Activity className="h-5 w-5" />
                <span className="text-xs font-semibold uppercase tracking-wide">{t('summaryCards.totalEarned.label')}</span>
              </div>
              <p className="text-2xl font-bold text-slate-900">{formatCurrency(breakdown?.summary?.total_earned)}</p>
              <p className="mt-1 text-xs text-slate-500">{t('summaryCards.totalEarned.sub')}</p>
            </div>

            <div className="rounded-2xl border border-rose-100 bg-rose-50 p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-3 text-rose-600">
                <ArrowDownLeft className="h-5 w-5" />
                <span className="text-xs font-semibold uppercase tracking-wide">{t('summaryCards.totalPaidOut.label')}</span>
              </div>
              <p className="text-2xl font-bold text-slate-900">{formatCurrency(breakdown?.summary?.total_paid_out)}</p>
              <p className="mt-1 text-xs text-slate-500">{t('summaryCards.totalPaidOut.sub')}</p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">{t('summaryCards.walletBalance.label')}</p>
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-600">
                  <Wallet className="w-5 h-5" />
                </div>
              </div>
              <p className="text-2xl font-bold text-slate-900">{formatCurrency(walletBalance)}</p>
              <p className="mt-1 text-xs text-slate-500">{t('summaryCards.walletBalance.sub', { amount: formatCurrency(thresholdAmount) })}</p>
            </div>
          </section>

          {/* How it's calculated */}
          <div className="rounded-2xl border border-blue-100 bg-blue-50 px-5 py-4 flex gap-3">
            <Info className="h-5 w-5 text-blue-500 shrink-0 mt-0.5" />
            <div className="text-sm text-blue-800 space-y-1">
              <p>
                <strong>Current Balance</strong> = Total Earned − Total Paid Out. The ledger below shows every
                event that contributed to this balance, with a running total after each entry so you can
                trace exactly how it was built.
              </p>
              <p>
                <strong>Wallet Balance</strong> is a separate advance-eligible balance.{' '}
                <strong>Advances</strong> are issued from the wallet and shown in their own section below.
              </p>
            </div>
          </div>

          {/* Earnings & Payouts Ledger */}
          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-slate-900">Earnings &amp; Payouts Ledger</h2>
                <p className="text-xs text-slate-500 mt-0.5">Chronological record with running balance</p>
              </div>
              <div className="flex items-center gap-4 text-xs text-slate-500">
                <span className="inline-flex items-center gap-1">
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
                  Earning
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="h-2.5 w-2.5 rounded-full bg-rose-400" />
                  Payout
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
                  Advance
                </span>
              </div>
            </div>

            {mergedLedger.length === 0 ? (
              <div className="p-10 text-center text-slate-500 text-sm">No transactions recorded yet.</div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50">
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 whitespace-nowrap">Date &amp; Time</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Type</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Description</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">Amount</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500 whitespace-nowrap">Running Balance</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {mergedLedger.map((entry, i) => (
                        <LedgerRow key={entry.transaction_id ?? i} entry={entry} />
                      ))}
                    </tbody>
                  </table>
                </div>

                {totalLedgerPages > 1 && (
                  <div className="flex items-center justify-between px-5 py-4 border-t border-slate-100 bg-slate-50">
                    <p className="text-sm text-slate-500">
                      Page {ledgerPage} of {totalLedgerPages} ({breakdown.pagination.total_count} entries)
                    </p>
                    <div className="flex gap-2">
                      <button
                        disabled={ledgerPage <= 1}
                        onClick={() => handleLedgerPage(ledgerPage - 1)}
                        className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        <ChevronLeft className="h-4 w-4" />
                        Previous
                      </button>
                      <button
                        disabled={ledgerPage >= totalLedgerPages}
                        onClick={() => handleLedgerPage(ledgerPage + 1)}
                        className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        Next
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </section>

          {/* Advance Requests */}
          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between border-b border-slate-200 px-6 py-5">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Advance Requests</h2>
                <p className="text-sm text-slate-500 mt-1">
                  {approvedCount} approved · {pendingCount} pending · This month: {formatCurrency(totalRequested)}
                </p>
              </div>
              <button
                onClick={() => { setError(''); setSuccessMsg(''); setShowModal(true); }}
                disabled={!canRequestAdvance}
                className={`inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors ${
                  canRequestAdvance
                    ? 'bg-slate-900 text-white hover:bg-slate-800'
                    : 'cursor-not-allowed bg-slate-100 text-slate-400'
                }`}
              >
                <ArrowUpRight className="w-4 h-4" />
                Request Advance
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50">
                  <tr>
                    {['Amount', 'Status', 'Requested', 'Actioned'].map((h) => (
                      <th key={h} className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {advances.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-6 py-16 text-center text-sm text-slate-500">No advance requests yet.</td>
                    </tr>
                  ) : (
                    advances.map((advance) => {
                      const meta = STATUS_META[advance.status] || STATUS_META.PENDING;
                      return (
                        <tr key={advance.advance_id} className="hover:bg-slate-50/70 transition-colors">
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                                <ArrowDownRight className="w-4 h-4" />
                              </div>
                              <div>
                                <p className="text-sm font-semibold text-slate-900">{formatCurrency(advance.amount_requested)}</p>
                                <p className="text-xs text-slate-500">Advance request</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${meta.className}`}>
                              {meta.label}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-sm text-slate-600">
                            <div className="flex items-center gap-2">
                              <CalendarDays className="w-4 h-4 text-slate-400" />
                              {formatDate(advance.requested_at)}
                            </div>
                          </td>
                          <td className="px-6 py-4 text-sm text-slate-600">
                            <div className="flex items-center gap-2">
                              <Clock3 className="w-4 h-4 text-slate-400" />
                              {advance.approved_at ? formatDate(advance.approved_at) : '—'}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </section>

        </div>
      </main>

      {/* Advance Request Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-5">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Request Advance</h2>
                <p className="text-sm text-slate-500 mt-1">Enter the amount you need to withdraw.</p>
              </div>
              <button
                onClick={() => { setShowModal(false); setError(''); setAmount(''); }}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                aria-label="Close modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-6 py-5 space-y-4">
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Wallet Balance</p>
                <p className="mt-1 text-lg font-semibold text-slate-900">{formatCurrency(walletBalance)}</p>
              </div>

              {error && (
                <div className="flex items-center gap-3 rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-rose-700">
                  <CircleAlert className="w-5 h-5 flex-shrink-0" />
                  <span className="text-sm font-medium">{error}</span>
                </div>
              )}

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">Amount (LKR)</label>
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="e.g. 5000"
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition-colors focus:border-slate-900"
                />
                {!canRequestAdvance && (
                  <p className="mt-2 text-xs text-slate-500">
                    Minimum wallet balance required: {formatCurrency(thresholdAmount)}.
                  </p>
                )}
              </div>
            </div>

            <div className="flex gap-3 border-t border-slate-200 px-6 py-5">
              <button
                onClick={() => { setShowModal(false); setError(''); setAmount(''); }}
                className="flex-1 rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={handleRequestAdvance}
                disabled={submitting}
                className="flex-1 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting ? 'Submitting...' : 'Submit Request'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Earnings;
