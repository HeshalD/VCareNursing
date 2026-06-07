import React, { useState, useEffect } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import AdminLayout from '../components/AdminLayout';
import apiClient from '../../../api/api';
import {
  ArrowLeft,
  User,
  Star,
  Calendar,
  Briefcase,
  Users,
  Activity,
  TrendingUp,
  Wallet,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Clock,
  RefreshCw,
  MapPin,
  Phone,
  Heart,
  BadgeCheck,
} from 'lucide-react';

const formatCurrency = (amount) =>
  `Rs. ${parseFloat(amount || 0).toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const formatDate = (dateString) => {
  if (!dateString) return '—';
  const d = new Date(dateString);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB', { year: 'numeric', month: 'short', day: 'numeric' });
};

const calcDays = (start, end) => {
  if (!start) return null;
  const s = new Date(start);
  const e = end ? new Date(end) : new Date();
  const days = Math.round((e - s) / (1000 * 60 * 60 * 24));
  return days >= 0 ? days : null;
};

const getTenure = (createdAt) => {
  if (!createdAt) return '—';
  const months = Math.floor((new Date() - new Date(createdAt)) / (1000 * 60 * 60 * 24 * 30));
  if (months < 1) return 'Less than a month';
  if (months < 12) return `${months} month${months > 1 ? 's' : ''}`;
  const years = Math.floor(months / 12);
  const rem = months % 12;
  return rem > 0 ? `${years}y ${rem}m` : `${years} year${years > 1 ? 's' : ''}`;
};

const BookingStatusBadge = ({ bookingStatus, assignmentStatus }) => {
  const status = bookingStatus || assignmentStatus;
  const config = {
    ACTIVE: { bg: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: <Activity className="w-3 h-3" />, label: 'Active' },
    COMPLETED: { bg: 'bg-blue-50 text-blue-700 border-blue-200', icon: <CheckCircle className="w-3 h-3" />, label: 'Completed' },
    TERMINATED: { bg: 'bg-red-50 text-red-700 border-red-200', icon: <XCircle className="w-3 h-3" />, label: 'Terminated' },
    PENDING_TERMINATION: { bg: 'bg-orange-50 text-orange-700 border-orange-200', icon: <AlertTriangle className="w-3 h-3" />, label: 'Pending Termination' },
    PENDING: { bg: 'bg-amber-50 text-amber-700 border-amber-200', icon: <Clock className="w-3 h-3" />, label: 'Pending' },
  };
  const c = config[status] || { bg: 'bg-slate-100 text-slate-600 border-slate-200', icon: null, label: status || '—' };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${c.bg}`}>
      {c.icon}{c.label}
    </span>
  );
};

const StarRating = ({ rating }) => (
  <div className="flex items-center gap-0.5">
    {[1, 2, 3, 4, 5].map(i => (
      <Star key={i} className={`w-3.5 h-3.5 ${i <= rating ? 'text-amber-400 fill-amber-400' : 'text-slate-200 fill-slate-200'}`} />
    ))}
  </div>
);

export default function StaffWorkingHistory() {
  const { staffProfileId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const advanceId = searchParams.get('advance_id');
  const advanceAmount = searchParams.get('amount');
  const staffNameParam = searchParams.get('staff_name');

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [historyFilter, setHistoryFilter] = useState('ALL');

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const res = await apiClient.getAdminStaffDetail(staffProfileId);
        setData(res.data);
      } catch (err) {
        setError(err.message || 'Failed to load staff details');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [staffProfileId]);

  if (loading) {
    return (
      <AdminLayout title="Staff Working History" subtitle="Loading...">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
        </div>
      </AdminLayout>
    );
  }

  if (error || !data) {
    return (
      <AdminLayout title="Staff Working History" subtitle="Error">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3">
          <XCircle className="w-5 h-5 text-red-600 shrink-0" />
          <span className="text-red-800 text-sm">{error || 'Staff not found'}</span>
        </div>
      </AdminLayout>
    );
  }

  const { profile, earnings, stats, current_assignment, booking_history, reviews } = data;

  const walletBalance = parseFloat(earnings?.current_earnings || 0);
  const threshold = parseFloat(profile?.advance_threshold_amount || 15000);
  const thresholdPct = Math.min((walletBalance / threshold) * 100, 100);
  const meetsThreshold = walletBalance >= threshold;

  const filteredHistory = historyFilter === 'ALL'
    ? booking_history
    : booking_history.filter(b => (b.booking_status || b.status) === historyFilter);

  const uniqueClientsInHistory = [...new Set(booking_history.map(b => b.client_name).filter(Boolean))];
  const uniquePatientsInHistory = [...new Set(booking_history.map(b => b.patient_name).filter(Boolean))];

  return (
    <AdminLayout
      title="Staff Working History"
      subtitle={profile?.full_name || staffNameParam || 'Staff Member'}
    >
      {/* Back button */}
      <button
        onClick={() => navigate('/admin/advance-requests')}
        className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-800 mb-5 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Advance Requests
      </button>

      {/* Advance context banner */}
      {advanceAmount && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl px-5 py-4 mb-5 flex items-center gap-3">
          <Wallet className="w-5 h-5 text-blue-600 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-blue-900">
              Advance Request Under Review — {formatCurrency(advanceAmount)}
            </p>
            <p className="text-xs text-blue-700 mt-0.5">
              Review this staff member's working history before approving or rejecting.
            </p>
          </div>
        </div>
      )}

      {/* ── Profile header ── */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 mb-5">
        <div className="flex flex-col sm:flex-row items-start gap-5">
          <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
            <User className="w-8 h-8 text-blue-600" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <h2 className="text-xl font-bold text-slate-900">{profile.full_name}</h2>
              {profile.staff_code && (
                <span className="text-xs font-mono bg-slate-100 text-slate-600 px-2 py-0.5 rounded">
                  #{profile.staff_code}
                </span>
              )}
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${
                profile.current_status === 'AVAILABLE'
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : profile.current_status === 'ASSIGNED'
                  ? 'bg-blue-50 text-blue-700 border-blue-200'
                  : 'bg-slate-100 text-slate-600 border-slate-200'
              }`}>
                {profile.current_status || 'Unknown'}
              </span>
            </div>
            {profile.designation && (
              <p className="text-sm text-slate-500 mb-2">{profile.designation}</p>
            )}
            <div className="flex flex-wrap items-center gap-4 text-sm text-slate-500">
              {profile.average_rating > 0 && (
                <div className="flex items-center gap-1.5">
                  <StarRating rating={Math.round(profile.average_rating)} />
                  <span className="font-medium text-slate-700">{parseFloat(profile.average_rating).toFixed(1)}</span>
                  <span className="text-slate-400">({profile.total_reviews} review{profile.total_reviews !== 1 ? 's' : ''})</span>
                </div>
              )}
              {profile.mobile_number && (
                <div className="flex items-center gap-1">
                  <Phone className="w-3.5 h-3.5" />
                  {profile.mobile_number}
                </div>
              )}
              {profile.location && (
                <div className="flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5" />
                  {profile.location}
                </div>
              )}
              <div className="flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5" />
                <span>Joined {formatDate(profile.created_at)} · {getTenure(profile.created_at)} tenure</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Stats row ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-5">
        {[
          {
            icon: <Briefcase className="w-5 h-5 text-blue-600" />,
            bg: 'bg-blue-50',
            label: 'Total Assignments',
            value: stats?.total_assignments ?? booking_history.length,
          },
          {
            icon: <Users className="w-5 h-5 text-purple-600" />,
            bg: 'bg-purple-50',
            label: 'Unique Clients',
            value: stats?.unique_clients ?? uniqueClientsInHistory.length,
          },
          {
            icon: <Heart className="w-5 h-5 text-rose-600" />,
            bg: 'bg-rose-50',
            label: 'Unique Patients',
            value: stats?.unique_patients ?? uniquePatientsInHistory.length,
          },
          {
            icon: <RefreshCw className="w-5 h-5 text-orange-600" />,
            bg: 'bg-orange-50',
            label: 'Times Swapped Out',
            value: stats?.swap_out_count ?? 0,
            note: (stats?.swap_out_count ?? 0) > 0 ? 'Replaced mid-booking' : null,
          },
        ].map(({ icon, bg, label, value, note }) => (
          <div key={label} className="bg-white rounded-xl border border-slate-200 p-4">
            <div className={`w-9 h-9 rounded-lg ${bg} flex items-center justify-center mb-3`}>
              {icon}
            </div>
            <p className="text-2xl font-bold text-slate-900">{value}</p>
            <p className="text-xs text-slate-500 mt-0.5">{label}</p>
            {note && <p className="text-xs text-orange-500 mt-0.5">{note}</p>}
          </div>
        ))}
      </div>

      {/* ── Financial overview ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
        {/* Wallet & threshold */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-slate-900 text-sm">Wallet & Advance Eligibility</h3>
            {meetsThreshold
              ? <span className="flex items-center gap-1 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full"><BadgeCheck className="w-3.5 h-3.5" />Eligible</span>
              : <span className="flex items-center gap-1 text-xs text-red-700 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full"><AlertTriangle className="w-3.5 h-3.5" />Not Eligible</span>
            }
          </div>
          <div className="flex justify-between text-sm mb-1.5">
            <span className="text-slate-500">Current Balance</span>
            <span className="font-semibold text-slate-900">{formatCurrency(walletBalance)}</span>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-2 mb-1.5">
            <div
              className={`h-2 rounded-full transition-all ${meetsThreshold ? 'bg-emerald-500' : 'bg-amber-400'}`}
              style={{ width: `${thresholdPct}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-slate-400">
            <span>Rs. 0</span>
            <span>Threshold: {formatCurrency(threshold)}</span>
          </div>
          {advanceAmount && (
            <div className="mt-3 pt-3 border-t border-slate-100 flex justify-between text-sm">
              <span className="text-slate-500">Amount Requested</span>
              <span className="font-semibold text-blue-600">{formatCurrency(advanceAmount)}</span>
            </div>
          )}
        </div>

        {/* Earnings summary */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="font-semibold text-slate-900 text-sm mb-4">Earnings Summary</h3>
          <div className="space-y-2.5">
            {[
              { label: 'Total Earned (all time)', value: formatCurrency(earnings?.total_earned), color: 'text-slate-900' },
              { label: 'Total Paid Out', value: formatCurrency(earnings?.total_paid_out), color: 'text-slate-900' },
              { label: 'Outstanding Balance', value: formatCurrency(earnings?.outstanding), color: 'text-emerald-700 font-semibold' },
            ].map(({ label, value, color }) => (
              <div key={label} className="flex justify-between text-sm">
                <span className="text-slate-500">{label}</span>
                <span className={color}>{value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Current assignment ── */}
      {current_assignment && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-5 mb-5">
          <div className="flex items-center gap-2 mb-3">
            <Activity className="w-4 h-4 text-emerald-600" />
            <h3 className="font-semibold text-emerald-900 text-sm">Currently Assigned</h3>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-xs text-emerald-700 mb-0.5">Client</p>
              <p className="font-medium text-slate-900">{current_assignment.client_name || '—'}</p>
            </div>
            <div>
              <p className="text-xs text-emerald-700 mb-0.5">Patient</p>
              <p className="font-medium text-slate-900">{current_assignment.patient_name || '—'}</p>
            </div>
            <div>
              <p className="text-xs text-emerald-700 mb-0.5">Since</p>
              <p className="font-medium text-slate-900">{formatDate(current_assignment.service_start_date)}</p>
            </div>
            <div>
              <p className="text-xs text-emerald-700 mb-0.5">Daily Rate</p>
              <p className="font-medium text-slate-900">{formatCurrency(current_assignment.daily_rate)}</p>
            </div>
          </div>
        </div>
      )}

      {/* ── Booking history ── */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden mb-5">
        <div className="px-5 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h3 className="font-semibold text-slate-900">Booking History</h3>
          <div className="flex gap-1">
            {['ALL', 'ACTIVE', 'COMPLETED', 'TERMINATED'].map(f => (
              <button
                key={f}
                onClick={() => setHistoryFilter(f)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                  historyFilter === f
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                {f === 'ALL' ? 'All' : f.charAt(0) + f.slice(1).toLowerCase()}
              </button>
            ))}
          </div>
        </div>

        {filteredHistory.length === 0 ? (
          <div className="py-12 text-center">
            <Briefcase className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="text-slate-500 text-sm">No bookings found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Client / Patient</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Service</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Period</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Duration</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Daily Rate</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Earnings</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredHistory.map((b) => {
                  const days = calcDays(b.service_start_date, b.service_end_date);
                  return (
                    <tr key={b.assignment_id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-5 py-3.5">
                        <p className="font-medium text-slate-900">{b.client_name || '—'}</p>
                        <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1">
                          <Heart className="w-3 h-3" />{b.patient_name || '—'}
                        </p>
                      </td>
                      <td className="px-5 py-3.5">
                        <p className="text-slate-700">{b.service_type || '—'}</p>
                        <p className="text-xs text-slate-400 mt-0.5">{b.service_model || '—'}</p>
                      </td>
                      <td className="px-5 py-3.5">
                        <p className="text-slate-700">{formatDate(b.service_start_date)}</p>
                        <p className="text-xs text-slate-400 mt-0.5">
                          {b.service_end_date ? `→ ${formatDate(b.service_end_date)}` : '→ Ongoing'}
                        </p>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="text-slate-700">
                          {days !== null ? `${days} day${days !== 1 ? 's' : ''}` : '—'}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-slate-700">
                        {formatCurrency(b.daily_rate)}
                      </td>
                      <td className="px-5 py-3.5">
                        <p className="font-medium text-slate-900">{formatCurrency(b.total_salary_paid ?? b.total_salary)}</p>
                        {b.amount_allocated && (
                          <p className="text-xs text-slate-400 mt-0.5">Allocated: {formatCurrency(b.amount_allocated)}</p>
                        )}
                      </td>
                      <td className="px-5 py-3.5">
                        <BookingStatusBadge bookingStatus={b.booking_status} assignmentStatus={b.status} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Client reviews ── */}
      {reviews?.recent?.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-slate-900">Client Reviews</h3>
            <div className="flex items-center gap-2">
              <StarRating rating={Math.round(profile.average_rating)} />
              <span className="text-sm font-semibold text-slate-700">
                {parseFloat(profile.average_rating).toFixed(1)}
              </span>
              <span className="text-xs text-slate-400">({profile.total_reviews} total)</span>
            </div>
          </div>

          {/* Rating distribution */}
          {reviews.distribution?.length > 0 && (
            <div className="mb-4 space-y-1.5">
              {[5, 4, 3, 2, 1].map(star => {
                const entry = reviews.distribution.find(d => parseInt(d.rating) === star);
                const count = entry ? parseInt(entry.count) : 0;
                const pct = profile.total_reviews > 0 ? (count / profile.total_reviews) * 100 : 0;
                return (
                  <div key={star} className="flex items-center gap-2 text-xs">
                    <span className="w-3 text-right text-slate-500">{star}</span>
                    <Star className="w-3 h-3 text-amber-400 fill-amber-400 shrink-0" />
                    <div className="flex-1 bg-slate-100 rounded-full h-1.5">
                      <div className="h-1.5 rounded-full bg-amber-400" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="w-5 text-slate-400">{count}</span>
                  </div>
                );
              })}
            </div>
          )}

          <div className="space-y-3">
            {reviews.recent.slice(0, 5).map(review => (
              <div key={review.review_id} className="flex gap-3 p-3 bg-slate-50 rounded-lg">
                <div className="shrink-0">
                  <StarRating rating={review.rating} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-medium text-slate-700">{review.client_name || 'Anonymous'}</p>
                    <p className="text-xs text-slate-400 shrink-0">{formatDate(review.created_at)}</p>
                  </div>
                  {review.review_text && (
                    <p className="text-sm text-slate-600 mt-1">{review.review_text}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {reviews?.recent?.length === 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 text-center">
          <Star className="w-8 h-8 text-slate-200 mx-auto mb-2" />
          <p className="text-sm text-slate-400">No client reviews yet</p>
        </div>
      )}
    </AdminLayout>
  );
}
