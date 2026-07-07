import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, XCircle, Loader2, Calendar, User, Activity, Clock, CheckCircle, AlertCircle, Search, RefreshCw, Stethoscope, Baby, Heart, AlertTriangle, Plus } from 'lucide-react';
import AdminLayout from '../components/AdminLayout';
import apiClient from '../../../api/api';
import { useAdminAuth } from '../../../context/AdminAuthContext';
import AdminDirectBookingDrawer from './AdminDirectBookingDrawer';

const STATUS_FILTERS = [
  { key: 'ALL', label: 'All Bookings' },
  { key: 'ACTIVE', label: 'Active' },
  { key: 'EXPIRING_SOON', label: 'Expiring Soon' },
  { key: 'PENDING_TERMINATION', label: 'Pending Termination' },
  { key: 'TERMINATED', label: 'Terminated' },
  { key: 'COMPLETED', label: 'Completed' },
  { key: 'CANCELLED', label: 'Cancelled' },
];

const STATUS_CONFIG = {
  ACTIVE: { color: 'green', icon: CheckCircle, label: 'Active' },
  PENDING_TERMINATION: { color: 'amber', icon: Clock, label: 'Pending Termination' },
  TERMINATED: { color: 'red', icon: XCircle, label: 'Terminated' },
  COMPLETED: { color: 'blue', icon: CheckCircle, label: 'Completed' },
  CANCELLED: { color: 'red', icon: XCircle, label: 'Cancelled' },
};

const STATUS_BADGE_CLASSES = {
  green: 'bg-green-50 text-green-700 ring-1 ring-green-600/20',
  amber: 'bg-amber-50 text-amber-700 ring-1 ring-amber-600/20',
  red: 'bg-red-50 text-red-700 ring-1 ring-red-600/20',
  blue: 'bg-blue-50 text-blue-700 ring-1 ring-blue-600/20',
  gray: 'bg-slate-50 text-slate-600 ring-1 ring-slate-600/20',
};

const SERVICE_ICONS = {
  '{NURSE}': Stethoscope,
  '{NANNY}': Baby,
  'HOME_NURSING': Heart,
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

const Bookings = () => {
  const { adminToken } = useAdminAuth();
  const navigate = useNavigate();
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [bookingDetails, setBookingDetails] = useState({});
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [showDirectBooking, setShowDirectBooking] = useState(false);

  useEffect(() => {
    if (adminToken) fetchBookings();
  }, [adminToken]);

  const fetchBookings = async () => {
    try {
      setLoading(true);
      setError('');
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
        setError(response.message || 'Failed to load bookings');
        return;
      }

      setBookings(bookingsData);

      const detailsPromises = bookingsData.map(async (booking) => {
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
      const detailsMap = {};
      detailsResults.forEach(({ bookingId, details }) => {
        if (details) detailsMap[bookingId] = details;
      });
      setBookingDetails(detailsMap);
    } catch (err) {
      setError(err.message || 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const filteredBookings = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return bookings.filter((b) => {
      const details = bookingDetails[b.booking_id];
      if (statusFilter === 'EXPIRING_SOON') {
        if (!b.is_expiring_soon) return false;
      } else {
        const matchesStatus = statusFilter === 'ALL' || b.status === statusFilter;
        if (!matchesStatus) return false;
      }
      if (!q) return true;
      const bookingCode = (b.booking_code || String(b.booking_id)).toLowerCase();
      const clientName = (details?.client_name || b.client_name || `client ${b.client_id}`).toLowerCase();
      const patientName = (details?.patient_name || b.patient_name || `patient ${b.patient_id}`).toLowerCase();
      return bookingCode.includes(q) || clientName.includes(q) || patientName.includes(q);
    });
  }, [bookings, bookingDetails, searchQuery, statusFilter]);

  const statusCounts = useMemo(() => {
    const counts = { ALL: bookings.length, EXPIRING_SOON: 0 };
    bookings.forEach((b) => {
      counts[b.status] = (counts[b.status] || 0) + 1;
      if (b.is_expiring_soon) counts.EXPIRING_SOON++;
    });
    return counts;
  }, [bookings]);

  const getStatusBadge = (status) => {
    const config = STATUS_CONFIG[status?.toUpperCase()] || { color: 'gray', icon: AlertCircle, label: status };
    const Icon = config.icon;
    const classes = STATUS_BADGE_CLASSES[config.color];
    return (
      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${classes}`}>
        <Icon className="w-3 h-3" />
        {config.label}
      </span>
    );
  };

  const getServiceIcon = (serviceType) => SERVICE_ICONS[serviceType] || Activity;

  if (loading) {
    return (
      <AdminLayout title="Bookings" subtitle="Loading...">
        <div className="flex flex-col items-center justify-center h-64 gap-3">
          <Loader2 className="animate-spin w-10 h-10 text-blue-600" />
          <p className="text-slate-500 text-sm">Fetching bookings...</p>
        </div>
      </AdminLayout>
    );
  }

  if (error) {
    return (
      <AdminLayout title="Bookings" subtitle="Error loading data">
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 flex items-start gap-4">
          <div className="bg-red-100 rounded-full p-2 shrink-0">
            <XCircle className="w-5 h-5 text-red-600" />
          </div>
          <div>
            <h3 className="font-semibold text-red-800 mb-1">Unable to load bookings</h3>
            <p className="text-red-600 text-sm mb-3">{error}</p>
            <button onClick={fetchBookings} className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-medium">
              Try Again
            </button>
          </div>
        </div>
      </AdminLayout>
    );
  }

  return (
    <>
    <AdminLayout
      title="Bookings"
      subtitle={`${bookings.length} total bookings`}
      actions={
        <button
          onClick={() => setShowDirectBooking(true)}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4" />
          New Booking
        </button>
      }
    >
      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        {[
          { label: 'Total', value: bookings.length, color: 'blue', icon: Calendar },
          { label: 'Active', value: statusCounts['ACTIVE'] || 0, color: 'green', icon: CheckCircle },
          { label: 'Expiring Soon', value: statusCounts['EXPIRING_SOON'] || 0, color: 'orange', icon: AlertTriangle, onClick: () => setStatusFilter('EXPIRING_SOON') },
          { label: 'Pending Termination', value: statusCounts['PENDING_TERMINATION'] || 0, color: 'amber', icon: Clock },
          { label: 'Terminated', value: (statusCounts['TERMINATED'] || 0) + (statusCounts['COMPLETED'] || 0), color: 'slate', icon: Activity },
        ].map(({ label, value, color, icon: Icon, onClick }) => (
          <div
            key={label}
            onClick={onClick}
            className={`bg-white rounded-xl border p-5 flex items-center justify-between ${onClick ? 'cursor-pointer hover:border-orange-300 hover:shadow-sm transition-all' : ''} ${statusFilter === 'EXPIRING_SOON' && label === 'Expiring Soon' ? 'border-orange-400 ring-1 ring-orange-300' : 'border-slate-200'}`}
          >
            <div>
              <p className="text-xs font-medium text-slate-500 mb-1">{label}</p>
              <p className={`text-2xl font-bold text-${color}-600`}>{value}</p>
            </div>
            <div className={`bg-${color}-50 rounded-xl p-2.5`}>
              <Icon className={`w-5 h-5 text-${color}-500`} />
            </div>
          </div>
        ))}
      </div>

      {/* Search + Filters Bar */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 mb-4 flex flex-col md:flex-row gap-3 items-start md:items-center justify-between">
        {/* Search */}
        <div className="relative w-full md:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Search by client, booking ID, care profile..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder-slate-400"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
              <XCircle className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Status Filter Pills */}
        <div className="flex items-center gap-2 flex-wrap">
          {STATUS_FILTERS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setStatusFilter(key)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all whitespace-nowrap ${
                statusFilter === key
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {label}
              {statusCounts[key] !== undefined && (
                <span className={`ml-1.5 ${statusFilter === key ? 'opacity-80' : 'text-slate-400'}`}>
                  ({statusCounts[key] || 0})
                </span>
              )}
            </button>
          ))}
          <button
            onClick={fetchBookings}
            className="ml-1 p-1.5 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-blue-50 transition-colors"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Bookings Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
        {filteredBookings.length === 0 ? (
          <div className="py-16 text-center">
            <div className="bg-slate-100 rounded-full w-14 h-14 flex items-center justify-center mx-auto mb-4">
              <Calendar className="w-7 h-7 text-slate-400" />
            </div>
            <h3 className="text-base font-semibold text-slate-800 mb-1">No bookings found</h3>
            <p className="text-slate-500 text-sm">
              {searchQuery || statusFilter !== 'ALL' ? 'Try adjusting your search or filters.' : 'No bookings available yet.'}
            </p>
          </div>
        ) : (
          <>
            <div className="px-6 py-3 border-b border-slate-100 flex items-center justify-between">
              <p className="text-xs text-slate-500">
                Showing <span className="font-semibold text-slate-700">{filteredBookings.length}</span> of <span className="font-semibold text-slate-700">{bookings.length}</span> bookings
              </p>
            </div>
            <div className="overflow-x-auto hidden md:block">
              <table className="w-full">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-6 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Booking ID</th>
                    <th className="px-6 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Client</th>
                    <th className="px-6 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Care Profile</th>
                    <th className="px-6 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Service</th>
                    <th className="px-6 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Start Date</th>
                    <th className="px-6 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3.5 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredBookings.map((b) => {
                    const ServiceIcon = getServiceIcon(b.service_type);
                    const details = bookingDetails[b.booking_id];
                    return (
                      <tr key={b.booking_id || b.id} className={`hover:bg-slate-50/70 transition-colors group ${b.is_expiring_soon ? 'bg-orange-50/40' : ''}`}>
                        <td className="px-6 py-4">
                          <span className="font-mono text-sm font-semibold text-slate-700">{b.booking_code || `#${b.booking_id}`}</span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="bg-gradient-to-br from-blue-100 to-blue-50 rounded-full w-8 h-8 flex items-center justify-center shrink-0">
                              <User className="w-4 h-4 text-blue-600" />
                            </div>
                            <div>
                              <p className="text-sm font-medium text-slate-900 leading-none mb-0.5">
                                {details?.client_name || `Client #${b.client_id}`}
                              </p>
                              {details?.client_address && (
                                <p className="text-xs text-slate-400 truncate max-w-[160px]">{details.client_address}</p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-sm font-medium text-slate-800">{details?.patient_name || `#${b.patient_id}`}</p>
                          {details?.patient_age && (
                            <p className="text-xs text-slate-400">Age {details.patient_age}</p>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <div className="bg-blue-50 rounded-lg p-1.5 shrink-0">
                              <ServiceIcon className="w-3.5 h-3.5 text-blue-600" />
                            </div>
                            <span className="text-sm text-slate-700 capitalize">{b.service_type?.replace(/_/g, ' ').replace(/[{}]/g, '') || '—'}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-sm text-slate-700">
                            {b.start_date ? new Date(b.start_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                          </p>
                          {formatTime(details?.service_start_time) && (
                            <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-400">
                              <Clock className="w-3 h-3" />
                              {formatTime(details.service_start_time)}
                            </p>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-col gap-1.5">
                            {getStatusBadge(b.status)}
                            {b.is_expiring_soon && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-orange-50 text-orange-700 ring-1 ring-orange-400/30">
                                <AlertTriangle className="w-3 h-3" />
                                {b.balance_days_remaining !== null && b.balance_days_remaining <= 0
                                  ? 'Balance exhausted'
                                  : `~${b.balance_days_remaining}d left`}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <button
                            onClick={() => navigate(`/admin/bookings/${b.booking_id}/detail`)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            View
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile card list */}
            <div className="md:hidden p-3 space-y-3">
              {filteredBookings.map((b) => {
                const ServiceIcon = getServiceIcon(b.service_type);
                const details = bookingDetails[b.booking_id];
                return (
                  <div
                    key={b.booking_id || b.id}
                    onClick={() => navigate(`/admin/bookings/${b.booking_id}/detail`)}
                    className={`rounded-xl border p-4 space-y-3 active:bg-slate-50 transition-colors ${b.is_expiring_soon ? 'border-orange-300 bg-orange-50/40' : 'border-slate-200 bg-white'}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-sm font-semibold text-slate-700">{b.booking_code || `#${b.booking_id}`}</span>
                      {getStatusBadge(b.status)}
                    </div>
                    <div className="flex items-center gap-2.5">
                      <div className="bg-gradient-to-br from-blue-100 to-blue-50 rounded-full w-8 h-8 flex items-center justify-center shrink-0">
                        <User className="w-4 h-4 text-blue-600" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-900 truncate">{details?.client_name || `Client #${b.client_id}`}</p>
                        <p className="text-xs text-slate-500 truncate">{details?.patient_name || `Care profile #${b.patient_id}`}</p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="inline-flex items-center gap-1.5 text-slate-600 capitalize">
                        <ServiceIcon className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                        {b.service_type?.replace(/_/g, ' ').replace(/[{}]/g, '') || '—'}
                      </span>
                      <span className="text-slate-500 shrink-0">
                        {b.start_date ? new Date(b.start_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                      </span>
                    </div>
                    {b.is_expiring_soon && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-orange-50 text-orange-700 ring-1 ring-orange-400/30">
                        <AlertTriangle className="w-3 h-3" />
                        {b.balance_days_remaining !== null && b.balance_days_remaining <= 0
                          ? 'Balance exhausted'
                          : `~${b.balance_days_remaining}d left`}
                      </span>
                    )}
                  </div>
                );
              })}
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
