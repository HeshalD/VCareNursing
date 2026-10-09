import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { XCircle, Loader2, Calendar, User, Clock, Search, RefreshCw, AlertTriangle, Plus, ChevronRight, ChevronLeft, Building2, Trash2, Lock, Mars, Venus } from 'lucide-react';
import AdminLayout from '../components/AdminLayout';
import FilterableTh from '../components/FilterableTh';
import { ClientLink, PatientLink, StaffLink } from '../components/EntityLinks';
import apiClient from '../../../api/api';
import { useAdminAuth } from '../../../context/AdminAuthContext';
import AdminDirectBookingDrawer from './AdminDirectBookingDrawer';
import useAutoRefresh from '../../../hooks/useAutoRefresh';
import useDebouncedValue from '../../../hooks/useDebouncedValue';

const PAGE_SIZE = 25;

const STATUS_TABS = [
  { key: 'ALL',                label: 'All' },
  { key: 'PENDING',            label: 'Pending' },
  { key: 'ACTIVE',             label: 'Active' },
  { key: 'EXPIRING_SOON',      label: 'Expiring Soon' },
  { key: 'PENDING_TERMINATION', label: 'Pending Termination' },
  { key: 'PAUSED',             label: 'Paused' },
  { key: 'SCHEDULED',          label: 'Scheduled to Start' },
  { key: 'TERMINATED',         label: 'Terminated' },
  { key: 'COMPLETED',          label: 'Completed' },
  { key: 'CANCELLED',          label: 'Cancelled' },
];

const TYPE_TABS = [
  { key: 'ALL',        label: 'All Types' },
  { key: 'SHIFT_BASED', label: 'Shift Based' },
  { key: 'VISITING',   label: 'Visit' },
  { key: 'LIVE_IN',    label: 'Live-In' },
];

const STATUS_CONFIG = {
  PENDING:             { dot: 'bg-yellow-400', label: 'Pending' },
  ACTIVE:              { dot: 'bg-green-500',  label: 'Active' },
  PENDING_TERMINATION: { dot: 'bg-amber-400',  label: 'Pending Termination' },
  PAUSED:              { dot: 'bg-amber-500',  label: 'Paused' },
  SCHEDULED:           { dot: 'bg-blue-400',   label: 'Scheduled to Start' },
  TERMINATED:          { dot: 'bg-red-400',    label: 'Terminated' },
  COMPLETED:           { dot: 'bg-gray-400',   label: 'Completed' },
  CANCELLED:           { dot: 'bg-red-400',    label: 'Cancelled' },
};

const BOOKING_TYPE_LABEL = {
  SHIFT_BASED: 'Shift Based',
  VISITING:    'Visit',
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

const shortDate = (iso) => (iso ? new Date(`${String(iso).slice(0, 10)}T00:00:00`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : null);

const StatusBadge = ({ status, pausedSince, scheduledStart }) => {
  // OVERDUE bookings are still running — display them as Active with a
  // separate "Overdue balance" flag rather than a distinct lifecycle status.
  const isOverdueBalance = status?.toUpperCase() === 'OVERDUE';
  const effectiveStatus = isOverdueBalance ? 'ACTIVE' : status?.toUpperCase();
  const cfg = STATUS_CONFIG[effectiveStatus] || { dot: 'bg-gray-400', label: status || 'Unknown' };
  // When it started / starts — the one date that matters for these two states.
  const when = effectiveStatus === 'PAUSED' && pausedSince ? `since ${shortDate(pausedSince)}`
    : effectiveStatus === 'SCHEDULED' && scheduledStart ? `on ${shortDate(scheduledStart)}`
    : null;
  return (
    <span className="inline-flex items-center gap-1.5 flex-wrap">
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-700">
        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${cfg.dot}`} />
        {cfg.label}
        {when && <span className="font-normal text-gray-500">{when}</span>}
      </span>
      {isOverdueBalance && (
        <span className="inline-flex items-center gap-1 rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-semibold text-red-700 ring-1 ring-inset ring-red-200">
          Overdue balance
        </span>
      )}
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

const GenderIcon = ({ gender }) => {
  const cfg = {
    MALE:   { Icon: Mars,  className: 'text-blue-500' },
    FEMALE: { Icon: Venus, className: 'text-pink-500' },
  }[gender?.toUpperCase()];

  if (!cfg) return null;

  const { Icon, className } = cfg;
  return <Icon className={`w-3 h-3 flex-shrink-0 ${className}`} aria-label={gender} title={gender} />;
};

const StaffList = ({ staff }) => {
  if (!staff || staff.length === 0) {
    return <span className="text-gray-400 text-xs">Unassigned</span>;
  }
  return (
    <div className="space-y-1">
      {staff.map((s) => (
        <div key={s.staff_profile_id} className="flex items-center gap-1.5">
          <GenderIcon gender={s.gender} />
          <span className="text-slate-700"><StaffLink id={s.staff_profile_id}>{s.full_name}</StaffLink></span>
          {s.staff_code && (
            <span className="font-mono font-bold text-xs text-black">{s.staff_code}</span>
          )}
        </div>
      ))}
    </div>
  );
};

const Bookings = () => {
  const { adminToken, isSuperAdmin } = useAdminAuth();
  const navigate = useNavigate();
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [counts, setCounts] = useState({});
  const [pagination, setPagination] = useState({ total: 0, page: 1, total_pages: 1 });
  const [page, setPage] = useState(1);
  const [refreshing, setRefreshing] = useState(false);
  const requestIdRef = useRef(0);
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearch = useDebouncedValue(searchQuery, 400);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [hospitalizedOnly, setHospitalizedOnly] = useState(false);
  const [salespersonFilter, setSalespersonFilter] = useState('ALL');
  const [showDirectBooking, setShowDirectBooking] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [deleting, setDeleting] = useState(false);

  const closeDeleteModal = () => {
    setDeleteTarget(null);
    setDeletePassword('');
    setDeleteError('');
    setDeleting(false);
  };

  const confirmHardDelete = async () => {
    if (!deleteTarget || !deletePassword) return;
    setDeleting(true);
    setDeleteError('');
    try {
      const orig = apiClient.token;
      apiClient.setToken(adminToken);
      await apiClient.hardDeleteBooking(deleteTarget.booking_id, deletePassword);
      apiClient.setToken(orig);
      closeDeleteModal();
      fetchBookings();
    } catch (err) {
      setDeleteError(err.message || 'Failed to delete booking.');
      setDeleting(false);
    }
  };

  const fetchBookings = async ({ silent = false } = {}) => {
    const requestId = ++requestIdRef.current;
    try {
      if (!silent) {
        setRefreshing(true);
        setError('');
      }
      const orig = apiClient.token;
      apiClient.setToken(adminToken);
      let response;
      try {
        response = await apiClient.getAllBookings({
          page,
          limit: PAGE_SIZE,
          search: debouncedSearch.trim(),
          status: statusFilter !== 'ALL' ? statusFilter : '',
          service_model: typeFilter !== 'ALL' ? typeFilter : '',
          hospitalized: hospitalizedOnly,
          salesperson: salespersonFilter !== 'ALL' ? salespersonFilter : '',
        });
      } finally {
        apiClient.setToken(orig);
      }

      // A newer request (filter/page change) superseded this one.
      if (requestId !== requestIdRef.current) return;

      if (response.status !== 'success') {
        if (!silent) setError(response.message || 'Failed to load bookings');
        return;
      }

      setBookings(response.data || []);
      setCounts(response.counts || {});
      setPagination(response.pagination || { total: 0, page: 1, total_pages: 1 });
      // Rows were removed (e.g. a delete or status change) and this page no longer exists.
      if (response.pagination && page > response.pagination.total_pages) {
        setPage(response.pagination.total_pages);
      }
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      if (!silent) setError(err.message || 'Unknown error');
      else console.error('Bookings silent refresh error:', err);
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  };

  // Re-query the backend whenever the page, search or any filter changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (adminToken) fetchBookings();
  }, [adminToken, page, debouncedSearch, statusFilter, typeFilter, hospitalizedOnly, salespersonFilter]);

  // Changing any filter or the search text sends the user back to the first page.
  const withPageReset = (setter) => (value) => {
    setter(value);
    setPage(1);
  };

  // Booking status/staff assignment changes continuously across coordinators,
  // so keep the list current; pause while the direct-booking drawer is open.
  useAutoRefresh(() => fetchBookings({ silent: true }), {
    intervalMs: 5000,
    enabled: !!adminToken && !showDirectBooking,
  });

  const salespersonCounts = { ALL: counts.ALL ?? 0, ASSIGNED: counts.ASSIGNED ?? 0, UNASSIGNED: counts.UNASSIGNED ?? 0 };
  const statusCounts = counts;
  const typeCounts = counts;
  const hospitalizedCount = counts.hospitalized ?? 0;
  const filteredBookings = bookings;

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
          <button onClick={() => fetchBookings()} className="text-red-600 underline text-xs ml-4">Retry</button>
        </div>
      </AdminLayout>
    );
  }

  return (
    <>
      <AdminLayout
        title="Bookings"
        subtitle={`${counts.ALL ?? 0} total booking${counts.ALL !== 1 ? 's' : ''}`}
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
                  onClick={() => withPageReset(setStatusFilter)(key)}
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
                  onChange={(e) => withPageReset(setSearchQuery)(e.target.value)}
                  placeholder="Search by client, booking code, employee code, staff name…"
                  className="pl-8 pr-3 py-1.5 text-sm border border-slate-200 rounded-lg bg-white focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none w-56"
                />
              </div>
              <button
                onClick={() => fetchBookings()}
                className="p-1.5 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-blue-50 transition-colors border border-slate-200 bg-white"
                title="Refresh"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          {/* Row 2: booking type tabs + hospitalized filter */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-0.5 bg-slate-100 rounded-lg p-1 w-fit flex-wrap">
              {TYPE_TABS.map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => withPageReset(setTypeFilter)(key)}
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

            <div className="flex items-center gap-0.5 bg-slate-100 rounded-lg p-1 w-fit flex-wrap">
              {[
                { key: 'ALL', label: 'All Salespersons' },
                { key: 'ASSIGNED', label: 'Salesperson Assigned' },
                { key: 'UNASSIGNED', label: 'No Salesperson' },
              ].map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => withPageReset(setSalespersonFilter)(key)}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all whitespace-nowrap ${
                    salespersonFilter === key
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {label}
                  <span className="ml-1.5 tabular-nums text-slate-400">{salespersonCounts[key]}</span>
                </button>
              ))}
            </div>

            <button
              onClick={() => withPageReset(setHospitalizedOnly)(!hospitalizedOnly)}
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
        <div className={`bg-white border border-slate-200 rounded-xl overflow-hidden transition-opacity ${refreshing ? 'opacity-60' : ''}`}>
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
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Staff</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Coordinator</th>
                      <FilterableTh
                        label="Salesperson"
                        className="text-left px-4 py-3 text-xs"
                        value={salespersonFilter}
                        onChange={withPageReset(setSalespersonFilter)}
                        options={[
                          { key: 'ALL', label: 'All Salespersons', count: salespersonCounts.ALL },
                          { key: 'ASSIGNED', label: 'Salesperson Assigned', count: salespersonCounts.ASSIGNED },
                          { key: 'UNASSIGNED', label: 'No Salesperson', count: salespersonCounts.UNASSIGNED },
                        ]}
                      />
                      <FilterableTh
                        label="Type"
                        className="text-left px-4 py-3 text-xs"
                        value={typeFilter}
                        onChange={withPageReset(setTypeFilter)}
                        options={TYPE_TABS.map(({ key, label }) => ({ key, label, count: typeCounts[key] ?? 0 }))}
                      />
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Start Date</th>
                      <FilterableTh
                        label="Status"
                        className="text-left px-4 py-3 text-xs"
                        value={statusFilter}
                        onChange={withPageReset(setStatusFilter)}
                        options={STATUS_TABS.map(({ key, label }) => ({ key, label, count: statusCounts[key] ?? 0 }))}
                      />
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredBookings.map((b) => {
                      const details = b;
                      return (
                        <tr
                          key={b.booking_id || b.id}
                          onClick={() => navigate(`/admin/bookings/${b.booking_id}/detail`)}
                          className="hover:bg-slate-50 cursor-pointer transition-colors"
                        >
                          {/* Booking code */}
                          <td className="px-4 py-3">
                            <p className="font-mono text-sm font-semibold text-slate-800">
                              <Link
                                to={`/admin/bookings/${b.booking_id}/detail`}
                                onClick={(e) => e.stopPropagation()}
                                className="hover:text-blue-600 hover:underline transition-colors"
                              >
                                {b.booking_code || `#${b.booking_id}`}
                              </Link>
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
                                  <ClientLink id={b.client_id}>{details?.client_name || details?.client_code || 'Unknown client'}</ClientLink>
                                </p>
                                {details?.client_address && (
                                  <p className="text-xs text-slate-400 truncate max-w-[160px]">{details.client_address}</p>
                                )}
                              </div>
                            </div>
                          </td>

                          {/* Care profile */}
                          <td className="px-4 py-3">
                            <p className="text-slate-700"><PatientLink id={b.patient_id}>{details?.patient_name || `#${b.patient_id}`}</PatientLink></p>
                            {details?.patient_age && (
                              <p className="text-xs text-slate-400">Age {details.patient_age}</p>
                            )}
                          </td>

                          {/* Staff */}
                          <td className="px-4 py-3">
                            <StaffList staff={details?.current_staff} />
                          </td>

                          {/* Coordinator */}
                          <td className="px-4 py-3">
                            {b.coordinator_name ? (
                              <span className="text-slate-700">{b.coordinator_name}</span>
                            ) : (
                              <span className="text-xs text-slate-400">Unassigned</span>
                            )}
                          </td>

                          {/* Salesperson */}
                          <td className="px-4 py-3">
                            {b.salesperson_name ? (
                              <span className="text-slate-700">{b.salesperson_name}</span>
                            ) : (
                              <span className="text-xs text-slate-400">Unassigned</span>
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
                            <StatusBadge status={b.status} pausedSince={b.paused_since} scheduledStart={b.scheduled_start_date} />
                          </td>

                          {/* Arrow */}
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-2">
                              {isSuperAdmin && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); setDeleteTarget(b); }}
                                  className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                                  title="Permanently delete this booking"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                              <ChevronRight className="w-4 h-4 text-slate-300" />
                            </div>
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
                  const details = b;
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
                        <StatusBadge status={b.status} pausedSince={b.paused_since} scheduledStart={b.scheduled_start_date} />
                      </div>
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0 ring-1 ring-slate-200">
                          <User className="w-3.5 h-3.5 text-slate-400" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-900 truncate">
                            <ClientLink id={b.client_id}>{details?.client_name || details?.client_code || 'Unknown client'}</ClientLink>
                          </p>
                          <p className="text-xs text-slate-500 truncate">
                            <PatientLink id={b.patient_id}>{details?.patient_name || `Care profile #${b.patient_id}`}</PatientLink>
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
                      {details?.current_staff?.length > 0 && (
                        <div className="text-xs">
                          <StaffList staff={details.current_staff} />
                        </div>
                      )}
                      {b.coordinator_name && (
                        <p className="text-xs text-slate-500">Coordinator: <span className="text-slate-700">{b.coordinator_name}</span></p>
                      )}
                      <p className="text-xs text-slate-500">
                        Salesperson: <span className="text-slate-700">{b.salesperson_name || 'Unassigned'}</span>
                      </p>
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
                      {isSuperAdmin && (
                        <button
                          onClick={(e) => { e.stopPropagation(); setDeleteTarget(b); }}
                          className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-red-600"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Delete booking
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="border-t border-slate-100 px-4 py-2.5 flex items-center justify-between gap-3 text-xs text-slate-400">
                <span>
                  Showing {(pagination.page - 1) * PAGE_SIZE + 1}–{(pagination.page - 1) * PAGE_SIZE + filteredBookings.length} of {pagination.total} booking{pagination.total !== 1 ? 's' : ''}
                </span>
                {pagination.total_pages > 1 && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={pagination.page <= 1 || refreshing}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" /> Prev
                    </button>
                    <span className="tabular-nums text-slate-500">
                      Page {pagination.page} of {pagination.total_pages}
                    </span>
                    <button
                      onClick={() => setPage((p) => Math.min(pagination.total_pages, p + 1))}
                      disabled={pagination.page >= pagination.total_pages || refreshing}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Next <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
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

      {deleteTarget && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl">
            <div className="p-6 space-y-4">
              <div className="flex items-start gap-3">
                <div className="bg-red-100 rounded-full p-2 flex-shrink-0">
                  <AlertTriangle className="w-5 h-5 text-red-600" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Permanently delete this booking?</h3>
                  <p className="text-sm text-slate-500 mt-1">
                    This will irreversibly delete{' '}
                    <span className="font-mono font-semibold text-slate-700">
                      {deleteTarget.booking_code || `#${deleteTarget.booking_id}`}
                    </span>{' '}
                    and every related record — staff assignments, attendance, payments, transactions,
                    quotation, invoices, and rentals. This cannot be undone.
                  </p>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Confirm with your password
                </label>
                <div className="relative">
                  <Lock className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="password"
                    autoFocus
                    value={deletePassword}
                    onChange={(e) => setDeletePassword(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && deletePassword && !deleting) confirmHardDelete(); }}
                    placeholder="Your login password"
                    className="w-full pl-8 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:border-red-400 focus:ring-2 focus:ring-red-100 outline-none"
                  />
                </div>
                {deleteError && (
                  <p className="text-xs text-red-600 mt-1.5">{deleteError}</p>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  onClick={closeDeleteModal}
                  disabled={deleting}
                  className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmHardDelete}
                  disabled={!deletePassword || deleting}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  Permanently Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default Bookings;
