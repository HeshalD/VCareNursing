import { useEffect, useMemo, useState } from 'react';
import {
  Wallet,
  TrendingUp,
  CalendarDays,
  ArrowUpRight,
  ArrowDownRight,
  Clock3,
  BadgeCheck,
  CircleAlert,
  X,
} from 'lucide-react';
import apiClient from '../../../api/api';
import { useAuth } from '../../../context/AuthContext';
import StaffSidebar from './StaffSidebar';

const STATUS_META = {
  APPROVED: {
    label: 'Approved',
    className: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  },
  PENDING: {
    label: 'Pending',
    className: 'bg-amber-50 text-amber-700 border-amber-100',
  },
  REJECTED: {
    label: 'Rejected',
    className: 'bg-rose-50 text-rose-700 border-rose-100',
  },
};

const formatCurrency = (value) => `LKR ${Number(value || 0).toLocaleString()}`;

const formatDate = (value) =>
  value
    ? new Date(value).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : '—';

const Earnings = () => {
  const { user } = useAuth();
  const [wallet, setWallet] = useState(null);
  const [staffData, setStaffData] = useState(null);
  const [advances, setAdvances] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError('');

        const staffId = user?.staff_id || user?.id;
        if (!staffId) {
          setError('Staff profile not found.');
          return;
        }

        const [walletResponse, staffResponse, advancesResponse] = await Promise.all([
          apiClient.getMyWallet(),
          user?.staff_id
            ? apiClient.getStaffByID(user.staff_id)
            : apiClient.getStaffByUserID(user.id),
          apiClient.getMyAdvances(),
        ]);

        setWallet(walletResponse.data);
        setStaffData(staffResponse.data);
        setAdvances(advancesResponse.data || []);
      } catch (err) {
        console.error('Failed to load earnings data:', err);
        setError('Failed to load earnings data.');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [user?.staff_id, user?.id]);

  const handleRequestAdvance = async () => {
    const parsedAmount = Number(amount);
    if (!parsedAmount || Number.isNaN(parsedAmount) || parsedAmount <= 0) {
      setError('Please enter a valid amount.');
      return;
    }

    try {
      setSubmitting(true);
      setError('');
      await apiClient.requestAdvance({ amount_requested: parsedAmount });
      setSuccessMsg('Advance request submitted successfully.');
      setShowModal(false);
      setAmount('');

      const walletResponse = await apiClient.getMyWallet();
      setWallet(walletResponse.data);

      const advancesResponse = await apiClient.getMyAdvances();
      setAdvances(advancesResponse.data || []);
    } catch (err) {
      console.error('Advance request error:', err);
      setError(err.message || 'Failed to submit advance request.');
    } finally {
      setSubmitting(false);
    }
  };

  const walletBalance = Number(wallet?.balance || 0);
  const thresholdAmount = Number(wallet?.advance_threshold_amount || 15000);
  const canRequestAdvance = walletBalance >= thresholdAmount;

  const totalRequested = useMemo(
    () => {
      const now = new Date();
      const currentMonth = now.getMonth();
      const currentYear = now.getFullYear();

      return advances.reduce((sum, item) => {
        const requestedDate = item?.requested_at ? new Date(item.requested_at) : null;
        const isCurrentMonth =
          requestedDate &&
          requestedDate.getMonth() === currentMonth &&
          requestedDate.getFullYear() === currentYear;

        if (!isCurrentMonth) {
          return sum;
        }

        return sum + Number(item.amount_requested || 0);
      }, 0);
    },
    [advances]
  );

  const approvedCount = useMemo(
    () => advances.filter((item) => item.status === 'APPROVED').length,
    [advances]
  );

  const pendingCount = useMemo(
    () => advances.filter((item) => item.status === 'PENDING').length,
    [advances]
  );

  const staffName = staffData?.full_name || user?.name || 'Staff Member';
  const verificationLabel =
    staffData?.verification_status === 'VERIFIED' ? 'Verified' : 'Pending verification';

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 font-sans text-slate-900 flex">
        <StaffSidebar staffProfileId={staffData?.staff_profile_id} />
        <main className="flex-1 flex items-center justify-center">
          <div className="text-center flex flex-col items-center gap-4">
            <div className="w-12 h-12 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin" />
            <div className="text-sm font-medium text-slate-600">Loading earnings...</div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 flex overflow-hidden">
      <StaffSidebar staffProfileId={staffData?.staff_profile_id} />

      <main className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto px-6 md:px-8 py-6 md:py-8 space-y-6">
          <header className="flex flex-col gap-4 border-b border-slate-200 bg-white px-6 py-6 rounded-2xl shadow-sm">
            <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400 mb-1">
                  Provider Portal
                </p>
                <h1 className="text-3xl md:text-4xl font-semibold tracking-tight text-slate-900">
                  Earnings
                </h1>
                <p className="text-sm text-slate-500 mt-2 max-w-2xl">
                  Track your wallet balance, review advance requests, and submit a new request when eligible.
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

          <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Wallet Balance</p>
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-600">
                  <Wallet className="w-5 h-5" />
                </div>
              </div>
              <p className="text-3xl font-semibold tracking-tight text-slate-900">{formatCurrency(walletBalance)}</p>
              <p className="mt-2 text-sm text-slate-500">
                Threshold for advance requests: {formatCurrency(thresholdAmount)}
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">This Month</p>
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-600">
                  <TrendingUp className="w-5 h-5" />
                </div>
              </div>
              <p className="text-3xl font-semibold tracking-tight text-slate-900">{formatCurrency(totalRequested)}</p>
              <p className="mt-2 text-sm text-slate-500">Advance requests submitted across your current history.</p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Request Status</p>
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-600">
                  <BadgeCheck className="w-5 h-5" />
                </div>
              </div>
              <p className="text-3xl font-semibold tracking-tight text-slate-900">{approvedCount}</p>
              <p className="mt-2 text-sm text-slate-500">Approved requests. Pending: {pendingCount}.</p>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between border-b border-slate-200 px-6 py-5">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Advance Requests</h2>
                <p className="text-sm text-slate-500 mt-1">Your advance request history and current eligibility.</p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => {
                    setError('');
                    setSuccessMsg('');
                    setShowModal(true);
                  }}
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
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
                      Amount
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
                      Requested
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
                      Actioned
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {advances.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-6 py-16 text-center text-sm text-slate-500">
                        No advance requests yet.
                      </td>
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

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-5">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Request Advance</h2>
                <p className="text-sm text-slate-500 mt-1">Enter the amount you need to withdraw.</p>
              </div>
              <button
                onClick={() => {
                  setShowModal(false);
                  setError('');
                  setAmount('');
                }}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                aria-label="Close modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-6 py-5 space-y-4">
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Current Balance</p>
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
                    Minimum balance required for advance requests is {formatCurrency(thresholdAmount)}.
                  </p>
                )}
              </div>
            </div>

            <div className="flex gap-3 border-t border-slate-200 px-6 py-5">
              <button
                onClick={() => {
                  setShowModal(false);
                  setError('');
                  setAmount('');
                }}
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
