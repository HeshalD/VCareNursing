import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  BadgeDollarSign,
  Briefcase,
  CalendarDays,
  ChevronDown,
  ChevronUp,
  Loader2,
  Star,
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

const SummaryCard = ({ icon: Icon, label, value, sub, tone }) => {
  const tones = {
    blue: 'bg-blue-50 border-blue-100 text-blue-700',
    emerald: 'bg-emerald-50 border-emerald-100 text-emerald-700',
    violet: 'bg-violet-50 border-violet-100 text-violet-700',
    amber: 'bg-amber-50 border-amber-100 text-amber-700',
  };
  return (
    <div className={`rounded-2xl border p-5 ${tones[tone] || tones.blue}`}>
      <div className="flex items-center gap-2 mb-3">
        <Icon className="h-5 w-5" />
        <span className="text-xs font-semibold uppercase tracking-wide">{label}</span>
      </div>
      <p className="text-2xl font-bold text-slate-900">{value}</p>
      {sub && <p className="mt-1 text-xs text-slate-500">{sub}</p>}
    </div>
  );
};

const BookingRow = ({ booking }) => {
  const [expanded, setExpanded] = useState(false);

  const statusTone = (s) => {
    const n = String(s || '').toUpperCase();
    if (n === 'ACTIVE') return 'bg-emerald-100 text-emerald-700';
    if (n === 'COMPLETED') return 'bg-blue-100 text-blue-700';
    if (n === 'CANCELLED') return 'bg-rose-100 text-rose-700';
    return 'bg-slate-100 text-slate-600';
  };

  return (
    <>
      <tr
        className="hover:bg-slate-50 cursor-pointer transition-colors"
        onClick={() => setExpanded((p) => !p)}
      >
        <td className="px-4 py-3">
          <div className="font-medium text-slate-900">{booking.client_name || '-'}</div>
          <div className="text-xs text-slate-500">{booking.patient_name || '-'}</div>
        </td>
        <td className="px-4 py-3 text-sm text-slate-600">
          {booking.service_type || '-'}
          {booking.service_model && (
            <span className="ml-1 text-xs text-slate-400">({booking.service_model})</span>
          )}
        </td>
        <td className="px-4 py-3 text-sm text-slate-600">
          <div>{formatDate(booking.service_start_date)}</div>
          <div className="text-xs text-slate-400">→ {formatDate(booking.service_end_date)}</div>
        </td>
        <td className="px-4 py-3 text-sm text-slate-600">{formatMoney(booking.daily_rate)}/day</td>
        <td className="px-4 py-3 text-sm text-slate-600 text-center">{booking.days_credited}</td>
        <td className="px-4 py-3">
          <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${statusTone(booking.assignment_status)}`}>
            {booking.assignment_status || '-'}
          </span>
        </td>
        <td className="px-4 py-3 text-right font-semibold text-emerald-700">
          {formatMoney(booking.total_earned_from_booking)}
        </td>
        <td className="px-4 py-3 text-slate-400 text-center">
          {expanded ? <ChevronUp className="h-4 w-4 mx-auto" /> : <ChevronDown className="h-4 w-4 mx-auto" />}
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={8} className="bg-slate-50 px-6 py-4 border-t border-slate-100">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">Amount Allocated</p>
                <p className="font-medium text-slate-800">{formatMoney(booking.amount_allocated)}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">First Earning</p>
                <p className="font-medium text-slate-800">{formatDate(booking.first_earning_date)}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">Last Earning</p>
                <p className="font-medium text-slate-800">{formatDate(booking.last_earning_date)}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">Booking Started</p>
                <p className="font-medium text-slate-800">{formatDate(booking.booking_start_date)}</p>
              </div>
            </div>
            <p className="mt-3 text-xs text-slate-400">
              Each day of service generates one salary credit. This booking produced{' '}
              <strong>{booking.days_credited}</strong> daily credit(s) at{' '}
              <strong>{formatMoney(booking.daily_rate)}/day</strong>.
            </p>
          </td>
        </tr>
      )}
    </>
  );
};

export default function TotalEarningsBreakdownPage() {
  const { staffProfileId } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await apiClient.getStaffTotalEarningsBreakdown(staffProfileId);
        if (res.status === 'success') setData(res.data);
        else setError(res.message || 'Failed to load');
      } catch (err) {
        setError(err.message || 'Failed to load');
      } finally {
        setLoading(false);
      }
    })();
  }, [staffProfileId]);

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
            <h1 className="text-xl font-bold text-slate-900">Total Earnings Breakdown</h1>
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
            <div className="grid gap-4 sm:grid-cols-3">
              <SummaryCard
                icon={BadgeDollarSign}
                label="Total All-Time Earned"
                value={formatMoney(data.summary.total_earned)}
                sub="Sum of all daily salary credits"
                tone="emerald"
              />
              <SummaryCard
                icon={Briefcase}
                label="Bookings Worked"
                value={data.summary.total_bookings}
                sub="Unique bookings with earnings"
                tone="blue"
              />
              <SummaryCard
                icon={CalendarDays}
                label="Total Days Credited"
                value={data.summary.total_days_credited}
                sub="Total daily salary entries"
                tone="violet"
              />
            </div>

            {/* How earnings are calculated */}
            <div className="rounded-2xl border border-blue-100 bg-blue-50 px-5 py-4 text-sm text-blue-800">
              <strong>How this is calculated:</strong> Every day a staff member is on an active
              booking, the system automatically generates one salary credit equal to their daily
              rate. The table below shows the total credits earned from each booking. Click any row
              to expand for more details.
            </div>

            {/* Breakdown Table */}
            {data.bookings.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-slate-500">
                No earnings recorded yet.
              </div>
            ) : (
              <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100">
                  <h2 className="font-semibold text-slate-900">Earnings by Booking</h2>
                  <p className="text-xs text-slate-500 mt-0.5">Click a row to see period details</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50">
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Client / Patient</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Service Type</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Assignment Period</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Daily Rate</th>
                        <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-slate-500">Days</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Status</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">Total Earned</th>
                        <th className="px-4 py-3 w-8" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {data.bookings.map((b) => (
                        <BookingRow key={b.booking_id || Math.random()} booking={b} />
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-slate-200 bg-slate-50">
                        <td colSpan={6} className="px-4 py-3 text-sm font-semibold text-slate-700 text-right">
                          Grand Total
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-emerald-700 text-base">
                          {formatMoney(data.summary.total_earned)}
                        </td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </AdminLayout>
  );
}
