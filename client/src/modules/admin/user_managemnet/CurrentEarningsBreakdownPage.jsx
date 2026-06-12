import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Activity,
  ArrowLeft,
  ArrowUpRight,
  ArrowDownLeft,
  BadgeDollarSign,
  ChevronLeft,
  ChevronRight,
  Info,
  Loader2,
  Wallet,
} from 'lucide-react';
import AdminLayout from '../components/AdminLayout';
import apiClient from '../../../api/api';

const moneyFormatter = new Intl.NumberFormat('en-LK', {
  style: 'currency',
  currency: 'LKR',
  maximumFractionDigits: 2,
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

const SummaryCard = ({ icon: Icon, label, value, sub, tone }) => {
  const tones = {
    emerald: 'bg-emerald-50 border-emerald-100',
    rose: 'bg-rose-50 border-rose-100',
    amber: 'bg-amber-50 border-amber-100',
    blue: 'bg-blue-50 border-blue-100',
  };
  const iconTones = {
    emerald: 'text-emerald-600',
    rose: 'text-rose-600',
    amber: 'text-amber-600',
    blue: 'text-blue-600',
  };
  return (
    <div className={`rounded-2xl border p-5 ${tones[tone] || tones.blue}`}>
      <div className={`flex items-center gap-2 mb-3 ${iconTones[tone] || iconTones.blue}`}>
        <Icon className="h-5 w-5" />
        <span className="text-xs font-semibold uppercase tracking-wide">{label}</span>
      </div>
      <p className="text-2xl font-bold text-slate-900">{value}</p>
      {sub && <p className="mt-1 text-xs text-slate-500">{sub}</p>}
    </div>
  );
};

const LedgerRow = ({ entry }) => {
  const isCredit = entry.transaction_type === 'CREDIT';

  return (
    <tr className="hover:bg-slate-50 transition-colors">
      <td className="px-4 py-3 text-sm text-slate-500 whitespace-nowrap">
        {formatDateTime(entry.created_at)}
      </td>
      <td className="px-4 py-3">
        {isCredit ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
            <ArrowUpRight className="h-3 w-3" />
            Earned
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-semibold text-rose-700">
            <ArrowDownLeft className="h-3 w-3" />
            Payout
          </span>
        )}
      </td>
      <td className="px-4 py-3">
        {isCredit ? (
          <div>
            <p className="text-sm font-medium text-slate-800">
              {entry.client_name || 'Daily Salary'}
            </p>
            {entry.patient_name && (
              <p className="text-xs text-slate-400">Care Profile: {entry.patient_name}</p>
            )}
            {entry.service_type && (
              <p className="text-xs text-slate-400">{entry.service_type}</p>
            )}
          </div>
        ) : (
          <div>
            <p className="text-sm font-medium text-slate-800">
              Payout{entry.company_account_name ? ` via ${entry.company_account_name}` : ''}
            </p>
            {entry.staff_bank_name && (
              <p className="text-xs text-slate-400">
                To: {entry.staff_bank_name}
                {entry.staff_account_number && ` ···${entry.staff_account_number.slice(-4)}`}
              </p>
            )}
            {entry.payout_notes && (
              <p className="text-xs text-slate-400 italic">{entry.payout_notes}</p>
            )}
            {entry.paid_by_email && (
              <p className="text-xs text-slate-400">By: {entry.paid_by_email}</p>
            )}
          </div>
        )}
      </td>
      <td className={`px-4 py-3 text-right font-semibold whitespace-nowrap ${isCredit ? 'text-emerald-700' : 'text-rose-600'}`}>
        {isCredit ? '+' : '-'}{formatMoney(entry.amount)}
      </td>
      <td className="px-4 py-3 text-right text-sm font-medium text-slate-700 whitespace-nowrap">
        {formatMoney(entry.running_balance)}
      </td>
    </tr>
  );
};

export default function CurrentEarningsBreakdownPage() {
  const { staffProfileId } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);
  const [page, setPage] = useState(1);

  const fetchData = async (p = 1) => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.getStaffCurrentEarningsBreakdown(staffProfileId, { page: p, limit: 50 });
      if (res.status === 'success') setData(res.data);
      else setError(res.message || 'Failed to load');
    } catch (err) {
      setError(err.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData(page);
  }, [staffProfileId, page]);

  const totalPages = data?.pagination?.total_pages || 1;

  return (
    <AdminLayout>
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(`/admin/staff/${staffProfileId}/detail`)}
            className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Staff Profile
          </button>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Current Earnings Breakdown</h1>
            {data?.staff_name && (
              <p className="text-sm text-slate-500">{data.staff_name}</p>
            )}
          </div>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
          </div>
        )}

        {error && (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-center text-rose-700">
            {error}
          </div>
        )}

        {data && (
          <>
            {/* Summary Cards */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <SummaryCard
                icon={BadgeDollarSign}
                label="Current Balance"
                value={formatMoney(data.summary.current_earnings)}
                sub="Unpaid earnings owed to staff"
                tone="emerald"
              />
              <SummaryCard
                icon={Activity}
                label="Total Earned (All Time)"
                value={formatMoney(data.summary.total_earned)}
                sub="Sum of all salary credits"
                tone="blue"
              />
              <SummaryCard
                icon={ArrowDownLeft}
                label="Total Paid Out"
                value={formatMoney(data.summary.total_paid_out)}
                sub="Sum of all payouts recorded"
                tone="rose"
              />
              <SummaryCard
                icon={Wallet}
                label="Advances Approved"
                value={formatMoney(data.summary.total_advances_approved)}
                sub="From wallet (separate system)"
                tone="amber"
              />
            </div>

            {/* Explanation callout */}
            <div className="rounded-2xl border border-blue-100 bg-blue-50 px-5 py-4 flex gap-3">
              <Info className="h-5 w-5 text-blue-500 shrink-0 mt-0.5" />
              <div className="text-sm text-blue-800 space-y-1">
                <p>
                  <strong>Current Balance</strong> = Total Earned − Total Paid Out. The ledger below
                  shows every event that contributed to this balance, with a running total after each
                  entry so you can trace exactly how it was built.
                </p>
                <p>
                  <strong>Advances</strong> are debited from a separate wallet balance and are shown
                  in their own section below — they do not directly reduce the current earnings
                  balance shown above.
                </p>
              </div>
            </div>

            {/* Ledger Table */}
            <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <h2 className="font-semibold text-slate-900">Earnings & Payouts Ledger</h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Chronological record of all earnings and payouts with running balance
                  </p>
                </div>
                <div className="flex items-center gap-4 text-xs text-slate-500">
                  <span className="inline-flex items-center gap-1">
                    <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
                    Earning (Credit)
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="h-2.5 w-2.5 rounded-full bg-rose-400" />
                    Payout (Debit)
                  </span>
                </div>
              </div>

              {data.ledger.length === 0 ? (
                <div className="p-10 text-center text-slate-500">No transactions recorded yet.</div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-100 bg-slate-50">
                          <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 whitespace-nowrap">Date & Time</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Type</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Description</th>
                          <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">Amount</th>
                          <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500 whitespace-nowrap">Running Balance</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {data.ledger.map((entry) => (
                          <LedgerRow key={entry.transaction_id} entry={entry} />
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Pagination */}
                  {totalPages > 1 && (
                    <div className="flex items-center justify-between px-5 py-4 border-t border-slate-100 bg-slate-50">
                      <p className="text-sm text-slate-500">
                        Page {page} of {totalPages} ({data.pagination.total_count} entries)
                      </p>
                      <div className="flex gap-2">
                        <button
                          disabled={page <= 1}
                          onClick={() => setPage((p) => p - 1)}
                          className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        >
                          <ChevronLeft className="h-4 w-4" />
                          Previous
                        </button>
                        <button
                          disabled={page >= totalPages}
                          onClick={() => setPage((p) => p + 1)}
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
            </div>

            {/* Approved Advances Section */}
            <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100">
                <h2 className="font-semibold text-slate-900">Approved Advance Requests</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Advances are issued from the staff wallet balance, separate from the earnings ledger above
                </p>
              </div>
              {data.advances.length === 0 ? (
                <div className="p-8 text-center text-slate-500 text-sm">
                  No approved advances on record.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50">
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Approved Date</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Amount</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Requested On</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Approved By</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {data.advances.map((adv) => (
                        <tr key={adv.advance_id} className="hover:bg-slate-50">
                          <td className="px-4 py-3 text-slate-700">{formatDate(adv.approved_at)}</td>
                          <td className="px-4 py-3 font-semibold text-amber-700">{formatMoney(adv.amount_requested)}</td>
                          <td className="px-4 py-3 text-slate-500">{formatDate(adv.requested_at)}</td>
                          <td className="px-4 py-3 text-slate-600">{adv.reviewed_by_name || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-slate-200 bg-slate-50">
                        <td className="px-4 py-3 text-sm font-semibold text-slate-700 text-right">Total</td>
                        <td className="px-4 py-3 font-bold text-amber-700">
                          {formatMoney(data.summary.total_advances_approved)}
                        </td>
                        <td colSpan={2} />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </AdminLayout>
  );
}
