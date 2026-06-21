import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Loader2, Briefcase, TrendingUp, Receipt, CalendarClock, Wallet,
  Mail, Phone, CalendarDays, ExternalLink, History,
} from 'lucide-react';
import AdminLayout from '../components/AdminLayout';
import apiClient from '../../../api/api';

const money = (value) =>
  `LKR ${parseFloat(value || 0).toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const compactMoney = (value) =>
  `LKR ${parseFloat(value || 0).toLocaleString('en-LK', { maximumFractionDigits: 0 })}`;

const statusColor = (s) => {
  if (s === 'Active') return 'bg-green-100 text-green-700';
  if (s === 'Inactive') return 'bg-red-100 text-red-700';
  return 'bg-amber-100 text-amber-700';
};

const bookingStatusColor = (s) => {
  const v = (s || '').toUpperCase();
  if (v === 'ACTIVE') return 'bg-green-100 text-green-700';
  if (v === 'COMPLETED') return 'bg-blue-100 text-blue-700';
  if (v === 'TERMINATED' || v === 'CANCELLED') return 'bg-red-100 text-red-700';
  if (v === 'SCHEDULED') return 'bg-amber-100 text-amber-700';
  return 'bg-slate-100 text-slate-600';
};

const formatDate = (d) =>
  d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const formatDateTime = (d) =>
  d ? new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

const SalespersonDetailPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [salesperson, setSalesperson] = useState(null);
  const [assignments, setAssignments] = useState([]);

  useEffect(() => { if (id) load(); }, [id]);

  const load = async () => {
    try {
      setLoading(true);
      setError('');
      const res = await apiClient.getSalespersonBookings(id);
      setSalesperson(res.data?.salesperson || null);
      setAssignments(res.data?.assignments || []);
    } catch (err) {
      setError(err.message || 'Failed to load salesperson');
    } finally {
      setLoading(false);
    }
  };

  // Origin rows = bookings this salesperson brought in (these hold the credited amount).
  const creditedBookings = useMemo(() => assignments.filter((a) => a.is_origin), [assignments]);
  // Current rows = bookings this salesperson is presently assigned to.
  const currentBookings = useMemo(() => assignments.filter((a) => a.is_current), [assignments]);

  const totalSales = parseFloat(salesperson?.total_sales_amount || 0);
  const numSales = parseInt(salesperson?.bookings_brought_count || 0, 10);
  const avgPerSale = numSales > 0 ? totalSales / numSales : 0;
  const maxCredit = useMemo(
    () => creditedBookings.reduce((m, b) => Math.max(m, parseFloat(b.credited_amount || 0)), 0),
    [creditedBookings]
  );

  const goToBooking = (bookingId) => navigate(`/admin/bookings/${bookingId}/detail`);

  return (
    <AdminLayout
      title="Salesperson Details"
      subtitle="Sales performance, credited bookings and current assignments"
      actions={
        <button
          onClick={() => navigate('/admin/salespersons')}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Salespersons
        </button>
      }
    >
      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      {loading ? (
        <div className="flex items-center justify-center gap-2 h-64 text-slate-400">
          <Loader2 className="w-5 h-5 animate-spin" /> Loading salesperson…
        </div>
      ) : !salesperson ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500 shadow-sm">
          Salesperson not found.
        </div>
      ) : (
        <div className="space-y-6">
          {/* Identity header */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="w-14 h-14 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
                <Briefcase className="w-6 h-6 text-blue-600" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-xl font-bold text-slate-900">{salesperson.full_name}</h2>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${statusColor(salesperson.status)}`}>
                    {salesperson.status || '—'}
                  </span>
                </div>
                <p className="text-sm text-slate-500">{salesperson.role || 'Salesperson'}</p>
              </div>
              <div className="grid grid-cols-1 gap-1 text-sm text-slate-500 sm:text-right">
                {salesperson.email && (
                  <span className="inline-flex items-center gap-1.5 sm:justify-end"><Mail className="w-3.5 h-3.5" /> {salesperson.email}</span>
                )}
                {salesperson.phone && (
                  <span className="inline-flex items-center gap-1.5 sm:justify-end"><Phone className="w-3.5 h-3.5" /> {salesperson.phone}</span>
                )}
                {salesperson.joined_date && (
                  <span className="inline-flex items-center gap-1.5 sm:justify-end"><CalendarDays className="w-3.5 h-3.5" /> Joined {formatDate(salesperson.joined_date)}</span>
                )}
              </div>
            </div>
          </div>

          {/* Summary cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <SummaryCard icon={TrendingUp} label="Total Sales Credited" value={compactMoney(totalSales)} tint="green" />
            <SummaryCard icon={Receipt} label="Number of Sales" value={numSales} tint="violet" />
            <SummaryCard icon={CalendarClock} label="Currently Assigned" value={currentBookings.length} tint="blue" />
            <SummaryCard icon={Wallet} label="Average per Sale" value={compactMoney(avgPerSale)} tint="amber" />
          </div>

          {/* Currently assigned bookings */}
          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center gap-2 px-5 py-4 border-b border-slate-100">
              <CalendarClock className="w-4 h-4 text-blue-600" />
              <h3 className="text-base font-semibold text-slate-900">Currently Assigned Bookings</h3>
              <span className="ml-auto text-xs font-medium text-slate-400">{currentBookings.length} booking{currentBookings.length !== 1 ? 's' : ''}</span>
            </div>
            {currentBookings.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-slate-400">Not currently assigned to any bookings.</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {currentBookings.map((b) => (
                  <button
                    key={b.id}
                    onClick={() => goToBooking(b.booking_id)}
                    className="flex w-full items-center justify-between gap-3 px-5 py-3.5 text-left hover:bg-slate-50 transition-colors"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-semibold text-slate-800">{b.booking_code || b.booking_id?.slice(0, 8)}</span>
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${bookingStatusColor(b.booking_status)}`}>
                          {b.booking_status || '—'}
                        </span>
                        {!b.is_origin && (
                          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500">switched in</span>
                        )}
                      </div>
                      <div className="text-xs text-slate-400 truncate mt-0.5">
                        {b.patient_name || b.client_name || '—'}
                        {b.service_type ? ` · ${b.service_type}` : ''}
                        {b.start_date ? ` · starts ${formatDate(b.start_date)}` : ''}
                      </div>
                    </div>
                    <ExternalLink className="w-4 h-4 text-slate-300 shrink-0" />
                  </button>
                ))}
              </div>
            )}
          </section>

          {/* Sales breakdown */}
          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center gap-2 px-5 py-4 border-b border-slate-100">
              <TrendingUp className="w-4 h-4 text-green-600" />
              <h3 className="text-base font-semibold text-slate-900">Sales Breakdown by Booking</h3>
              <span className="ml-auto text-sm font-semibold text-slate-900">{money(totalSales)}</span>
            </div>
            {creditedBookings.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-slate-400">No credited sales yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50 text-slate-500 text-xs uppercase tracking-wide font-semibold">
                      <th className="text-left px-5 py-3">Booking</th>
                      <th className="text-left px-5 py-3">Client / Care Profile</th>
                      <th className="text-left px-5 py-3">Credited On</th>
                      <th className="text-left px-5 py-3 w-40">Share</th>
                      <th className="text-right px-5 py-3">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {creditedBookings.map((b) => {
                      const amt = parseFloat(b.credited_amount || 0);
                      const pct = totalSales > 0 ? (amt / totalSales) * 100 : 0;
                      const barW = maxCredit > 0 ? (amt / maxCredit) * 100 : 0;
                      return (
                        <tr key={b.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                          <td className="px-5 py-3.5">
                            <button onClick={() => goToBooking(b.booking_id)} className="inline-flex items-center gap-1.5 font-mono text-sm font-semibold text-blue-600 hover:text-blue-500">
                              {b.booking_code || b.booking_id?.slice(0, 8)}
                              <ExternalLink className="w-3 h-3" />
                            </button>
                            <div className="mt-0.5">
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${bookingStatusColor(b.booking_status)}`}>
                                {b.booking_status || '—'}
                              </span>
                            </div>
                          </td>
                          <td className="px-5 py-3.5 text-slate-600">
                            <div>{b.client_name || '—'}</div>
                            {b.patient_name && <div className="text-xs text-slate-400">{b.patient_name}</div>}
                          </td>
                          <td className="px-5 py-3.5 text-slate-500">{formatDate(b.assigned_at)}</td>
                          <td className="px-5 py-3.5">
                            <div className="flex items-center gap-2">
                              <div className="h-2 flex-1 rounded-full bg-slate-100 overflow-hidden">
                                <div className="h-full rounded-full bg-green-500" style={{ width: `${barW}%` }} />
                              </div>
                              <span className="text-xs text-slate-400 w-10 text-right">{pct.toFixed(0)}%</span>
                            </div>
                          </td>
                          <td className="px-5 py-3.5 text-right font-semibold text-slate-900">{money(amt)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-50 font-semibold text-slate-900">
                      <td className="px-5 py-3" colSpan={4}>Total</td>
                      <td className="px-5 py-3 text-right">{money(totalSales)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </section>

          {/* Full assignment history (audit) */}
          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center gap-2 px-5 py-4 border-b border-slate-100">
              <History className="w-4 h-4 text-slate-500" />
              <h3 className="text-base font-semibold text-slate-900">Assignment History</h3>
              <span className="ml-auto text-xs font-medium text-slate-400">{assignments.length} record{assignments.length !== 1 ? 's' : ''}</span>
            </div>
            {assignments.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-slate-400">No history yet.</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {assignments.map((a) => (
                  <div key={a.id} className="flex items-center justify-between gap-3 px-5 py-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-sm font-semibold text-slate-800">{a.booking_code || a.booking_id?.slice(0, 8)}</span>
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${a.action === 'CREDITED' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'}`}>
                          {a.action}
                        </span>
                        {a.is_current && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-green-100 text-green-700">CURRENT</span>
                        )}
                      </div>
                      <div className="text-xs text-slate-400 truncate mt-0.5">
                        {formatDateTime(a.assigned_at)}
                        {a.switch_reason ? ` · ${a.switch_reason}` : ''}
                      </div>
                    </div>
                    <div className="text-right shrink-0 text-sm font-semibold text-slate-900">
                      {a.is_origin ? money(a.credited_amount) : '—'}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </AdminLayout>
  );
};

const TINTS = {
  blue: 'bg-blue-50 text-blue-600',
  violet: 'bg-violet-50 text-violet-600',
  green: 'bg-green-50 text-green-600',
  amber: 'bg-amber-50 text-amber-600',
};

const SummaryCard = ({ icon: Icon, label, value, tint }) => (
  <div className="bg-white rounded-xl border border-slate-200 p-5 flex items-center gap-4">
    <div className={`w-11 h-11 rounded-lg flex items-center justify-center ${TINTS[tint] || TINTS.blue}`}>
      <Icon className="w-5 h-5" />
    </div>
    <div className="min-w-0">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-0.5 text-xl font-bold text-slate-900 truncate">{value}</p>
    </div>
  </div>
);

export default SalespersonDetailPage;
