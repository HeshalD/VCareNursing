import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { XCircle, Loader2, Calendar, User, Clock, Search, RefreshCw, AlertTriangle, Plus, ChevronRight, Building2 } from 'lucide-react';
import AdminLayout from '../components/AdminLayout';
import apiClient from '../../../api/api';
import { useAdminAuth } from '../../../context/AdminAuthContext';
import AdminDirectBookingDrawer from './AdminDirectBookingDrawer';
import useAutoRefresh from '../../../hooks/useAutoRefresh';

const STATUS_TABS = [
  { key: 'ALL',                label: 'All' },
  { key: 'PENDING',            label: 'Pending' },
  { key: 'ACTIVE',             label: 'Active' },
  { key: 'EXPIRING_SOON',      label: 'Expiring Soon' },
  { key: 'PENDING_TERMINATION', label: 'Pending Termination' },
  { key: 'TERMINATED',         label: 'Terminated' },
  { key: 'COMPLETED',          label: 'Completed' },
  { key: 'CANCELLED',          label: 'Cancelled' },
];

const TYPE_TABS = [
  { key: 'ALL',        label: 'All Types' },
  { key: 'SHIFT_BASED', label: 'Shift Based' },
  { key: 'VISITING',   label: 'Visiting' },
  { key: 'LIVE_IN',    label: 'Live-In' },
];

const STATUS_CONFIG = {
  PENDING:             { dot: 'bg-yellow-400', label: 'Pending' },
  ACTIVE:              { dot: 'bg-green-500',  label: 'Active' },
  PENDING_TERMINATION: { dot: 'bg-amber-400',  label: 'Pending Termination' },
  TERMINATED:          { dot: 'bg-red-400',    label: 'Terminated' },
  COMPLETED:           { dot: 'bg-gray-400',   label: 'Completed' },
  CANCELLED:           { dot: 'bg-red-400',    label: 'Cancelled' },
};

const BOOKING_TYPE_LABEL = {
  SHIFT_BASED: 'Shift Based',
  VISITING:    'Visiting',
  LIVE_IN:     'Live-In',
};

const formatTime = (t) => {
  if (!t) return null;
  const m = String(t).match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const period = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${m[2]} ${period}`;
};

const StatusBadge = ({ status }) => {
  const cfg = STATUS_CONFIG[status?.toUpperCase()] || { dot: 'bg-gray-400', label: status || 'Unknown' };
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-700">
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
};

const TypeChip = ({ type }) => {
  if (!type) return <span className="text-gray-400 text-xs">—</span>;
  return (
    <span className="inline-flex items-center rounded bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600">
      {BOOKING_TYPE_LABEL[type] || type}
    </span>
  );
};

const Bookings = () => {
  const { adminToken } = useAdminAuth();
  const navigate = useNavigate();
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [bookingDetails, setBookingDetails] = useState({});
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [hospitalizedOnly, setHospitalizedOnly] = useState(false);
  const [showDirectBooking, setShowDirectBooking] = useState(false);

  useEffect(() => {
    if (adminToken) fetchBookings();
  }, [adminToken]);

  const fetchBookings = async ({ silent = false } = {}) => {
    try {
      if (!silent) setLoading(true);
      if (!silent) setError('');
      const orig = apiClient.token;
      apiClient.setToken(adminToken);
      const response = await apiClient.getAllBookings();
      apiClient.setToken(orig);

      let bookingsData = [];
      if (Array.isArray(response)) {
        bookingsData = response;
      } else if (response.status === 'success') {
        bookingsData = response.data || [];
      } else {
        if (!silent) setError(response.message || 'Failed to load bookings');
        return;
      }

      setBookings(bookingsData);

      // On a silent poll, only fetch details for bookings we haven't seen yet —
      // re-fetching every booking's detail every 5s would be a heavy N+1 poll.
      const knownIds = silent ? new Set(Object.keys(bookingDetails).map(String)) : new Set();
      const toFetch = bookingsData.filter((b) => !knownIds.has(String(b.booking_id)));

      const detailsPromises = toFetch.map(async (booking) => {
        try {
          apiClient.setToken(adminToken);
          const detailResponse = await apiClient.getBookingById(booking.booking_id);
          apiClient.setToken(orig);
          return { bookingId: booking.booking_id, details: detailResponse.data };
        } catch {
          return { bookingId: booking.booking_id, details: null };
        }
      });

      const detailsResults = await Promise.all(detailsPromises);
      setBookingDetails((prev) => {
        const next = silent ? { ...prev } : {};
        detailsResults.forEach(({ bookingId, details }) => {
          if (details) next[bookingId] = details;
        });
        return next;
      });
    } catch (err) {
      if (!silent) setError(err.message || 'Unknown error');
      else console.error('Bookings silent refresh error:', err);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  // Booking status/staff assignment changes continuously across coordinators,
  // so keep the list current; pause while the direct-booking drawer is open.
  useAutoRefresh(() => fetchBookings({ silent: true }), {
    intervalMs: 5000,
    enabled: !!adminToken && !showDirectBooking,
  });

  const filteredBookings = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return bookings.filter((b) => {
      const details = bookingDetails[b.booking_id];

      if (statusFilter === 'EXPIRING_SOON') {
        if (!b.is_expiring_soon) return false;
      } else if (statusFilter !== 'ALL') {
        if (b.status !== statusFilter) return false;
      }

      if (typeFilter !== 'ALL' && b.service_model !== typeFilter) return false;

      if (hospitalizedOnly && !b.is_hospitalized) return false;

      if (!q) return true;
      const bookingCode = (b.booking_code || String(b.booking_id)).toLowerCase();
      const clientName = (details?.client_name || b.client_name || `client ${b.client_id}`).toLowerCase();
      const patientName = (details?.patient_name || b.patient_name || `patient ${b.patient_id}`).toLowerCase();
      return bookingCode.includes(q) || clientName.includes(q) || patientName.includes(q);
    });
  }, [bookings, bookingDetails, searchQuery, statusFilter, typeFilter, hospitalizedOnly]);

  const statusCounts = useMemo(() => {
    const counts = { ALL: bookings.length, EXPIRING_SOON: 0, PENDING: 0 };
    bookings.forEach((b) => {
      counts[b.status] = (counts[b.status] || 0) + 1;
      if (b.is_expiring_soon) counts.EXPIRING_SOON++;
    });
    return counts;
  }, [bookings]);

  const typeCounts = useMemo(() => {
    const counts = { ALL: bookings.length };
    bookings.forEach((b) => {
      if (b.service_model) counts[b.service_model] = (counts[b.service_model] || 0) + 1;
    });
    return counts;
  }, [bookings]);

  const hospitalizedCount = useMemo(
    () => bookings.filter((b) => b.is_hospitalized).length,
    [bookings],
  );

  if (loading) {
    return (
      <AdminLayout title="Bookings" subtitle="Loading…">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
        </div>
      </AdminLayout>
    );
  }

  if (error) {
    return (
      <AdminLayout title="Bookings" subtitle="Error loading data">
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm flex items-center justify-between">
          <span>{error}</span>
          <button onClick={fetchBookings} className="text-red-600 underline text-xs ml-4">Retry</button>
        </div>
      </AdminLayout>
    );
  }

  return (
    <>
      <AdminLayout
        title="Bookings"
        subtitle={`${bookings.length} total booking${bookings.length !== 1 ? 's' : ''}`}
        actions={
          <button
            onClick={() => setShowDirectBooking(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-500 transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Booking
          </button>
        }
      >
        {/* Toolbar */}
        <div className="flex flex-col gap-3 mb-4">
          {/* Row 1: status tabs + search */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex items-center gap-0.5 bg-slate-100 rounded-lg p-1 w-fit flex-wrap">
              {STATUS_TABS.map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setStatusFilter(key)}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all whitespace-nowrap ${
                    statusFilter === key
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {label}
                  <span className="ml-1.5 tabular-nums text-slate-400">
                    {statusCounts[key] ?? 0}
                  </span>
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2 sm:ml-auto">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by client, booking code…"
                  className="pl-8 pr-3 py-1.5 text-sm border border-slate-200 rounded-lg bg-white focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none w-56"
                />
              </div>
              <button
                onClick={fetchBookings}
                className="p-1.5 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-blue-50 transition-colors border border-slate-200 bg-white"
                title="Refresh"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Row 2: booking type tabs + hospitalized filter */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-0.5 bg-slate-100 rounded-lg p-1 w-fit flex-wrap">
              {TYPE_TABS.map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setTypeFilter(key)}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all whitespace-nowrap ${
                    typeFilter === key
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {label}
                  <span className="ml-1.5 tabular-nums text-slate-400">
                    {typeCounts[key] ?? 0}
                  </span>
                </button>
              ))}
            </div>

            <button
              onClick={() => setHospitalizedOnly((v) => !v)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap border transition-all ${
                hospitalizedOnly
                  ? 'bg-red-50 text-red-700 border-red-200'
                  : 'bg-white text-slate-500 border-slate-200 hover:text-slate-700'
              }`}
            >
              <Building2 className="w-3.5 h-3.5" />
              Hospitalized
              <span className="tabular-nums text-slate-400">{hospitalizedCount}</span>
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          {filteredBookings.length === 0 ? (
            <div className="py-16 text-center">
              <div className="bg-slate-100 rounded-full w-12 h-12 flex items-center justify-center mx-auto mb-3">
                <Calendar className="w-6 h-6 text-slate-400" />
              </div>
              <h3 className="text-sm font-semibold text-slate-800 mb-1">No bookings found</h3>
              <p className="text-slate-400 text-xs">
                {searchQuery || statusFilter !== 'ALL' || typeFilter !== 'ALL'
                  ? 'Try adjusting your search or filters.'
                  : 'No bookings available yet.'}
              </p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto hidden md:block">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50">
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Booking</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Client</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Care Profile</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Type</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Start Date</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredBookings.map((b) => {
                      const details = bookingDetails[b.booking_id];
                      return (
                        <tr
                          key={b.booking_id || b.id}
                          onClick={() => navigate(`/admin/bookings/${b.booking_id}/detail`)}
                          className="hover:bg-slate-50 cursor-pointer transition-colors"
                        >
                          {/* Booking code */}
                          <td className="px-4 py-3">
                            <p className="font-mono text-sm font-semibold text-slate-800">
                              {b.booking_code || `#${b.booking_id}`}
                            </p>
                            {b.is_expiring_soon && (
                              <span className="inline-flex items-center gap-1 mt-1 text-[11px] font-medium text-amber-600">
                                <AlertTriangle className="w-3 h-3" />
                                {b.balance_days_remaining != null && b.balance_days_remaining <= 0
                                  ? 'Balance exhausted'
                                  : `~${b.balance_days_remaining}d left`}
                              </span>
                            )}
                            {b.is_hospitalized && (
                              <span className="inline-flex items-center gap-1 mt-1 text-[11px] font-medium text-red-600" title={b.hospital_name || ''}>
                                <Building2 className="w-3 h-3" />
                                {b.hospital_name ? b.hospital_name : 'Hospitalized'}
                              </span>
                            )}
                          </td>

                          {/* Client */}
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2.5 min-w-[160px]">
                              <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0 ring-1 ring-slate-200">
                                <User className="w-3.5 h-3.5 text-slate-400" />
                              </div>
                              <div>
                                <p className="font-medium text-slate-900 leading-tight">
                                  {details?.client_name || `Client #${b.client_id}`}
                                </p>
                                {details?.client_address && (
                                  <p className="text-xs text-slate-400 truncate max-w-[160px]">{details.client_address}</p>
                                )}
                              </div>
                            </div>
                          </td>

                          {/* Care profile */}
                          <td className="px-4 py-3">
                            <p className="text-slate-700">{details?.patient_name || `#${b.patient_id}`}</p>
                            {details?.patient_age && (
                              <p className="text-xs text-slate-400">Age {details.patient_age}</p>
                            )}
                          </td>

                          {/* Booking type */}
                          <td className="px-4 py-3 whitespace-nowrap">
                            <TypeChip type={b.service_model} />
                          </td>

                          {/* Start date */}
                          <td className="px-4 py-3 whitespace-nowrap">
                            <p className="text-slate-700">
                              {b.start_date
                                ? new Date(b.start_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                                : '—'}
                            </p>
                            {formatTime(details?.service_start_time) && (
                              <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-400">
                                <Clock className="w-3 h-3" />
                                {formatTime(details.service_start_time)}
                              </p>
                            )}
                          </td>

                          {/* Status */}
                          <td className="px-4 py-3 whitespace-nowrap">
                            <StatusBadge status={b.status} />
                          </td>

                          {/* Arrow */}
                          <td className="px-4 py-3 text-right">
                            <ChevronRight className="w-4 h-4 text-slate-300 ml-auto" />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile cards */}
              <div className="md:hidden p-3 space-y-2">
                {filteredBookings.map((b) => {
                  const details = bookingDetails[b.booking_id];
                  return (
                    <div
                      key={b.booking_id || b.id}
                      onClick={() => navigate(`/admin/bookings/${b.booking_id}/detail`)}
                      className="rounded-lg border border-slate-200 bg-white p-3.5 space-y-2.5 active:bg-slate-50 transition-colors"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-sm font-semibold text-slate-800">
                          {b.booking_code || `#${b.booking_id}`}
                        </span>
                        <StatusBadge status={b.status} />
                      </div>
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0 ring-1 ring-slate-200">
                          <User className="w-3.5 h-3.5 text-slate-400" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-900 truncate">
                            {details?.client_name || `Client #${b.client_id}`}
                          </p>
                          <p className="text-xs text-slate-500 truncate">
                            {details?.patient_name || `Care profile #${b.patient_id}`}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <TypeChip type={b.service_model} />
                        <span className="text-xs text-slate-500">
                          {b.start_date
                            ? new Date(b.start_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                            : '—'}
                        </span>
                      </div>
                      {b.is_expiring_soon && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-600">
                          <AlertTriangle className="w-3 h-3" />
                          {b.balance_days_remaining != null && b.balance_days_remaining <= 0
                            ? 'Balance exhausted'
                            : `~${b.balance_days_remaining}d left`}
                        </span>
                      )}
                      {b.is_hospitalized && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-red-600">
                          <Building2 className="w-3 h-3" />
                          {b.hospital_name ? b.hospital_name : 'Hospitalized'}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="border-t border-slate-100 px-4 py-2.5 text-xs text-slate-400">
                Showing {filteredBookings.length} of {bookings.length} booking{bookings.length !== 1 ? 's' : ''}
              </div>
            </>
          )}
        </div>
      </AdminLayout>

      <AdminDirectBookingDrawer
        open={showDirectBooking}
        onClose={() => setShowDirectBooking(false)}
        onSuccess={() => fetchBookings()}
      />
    </>
  );
};

export default Bookings;
