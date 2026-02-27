import React, { useState, useEffect } from 'react';
import { Eye, XCircle, Loader2, Calendar, User, Activity, Clock, CheckCircle, AlertCircle, DollarSign,Stethoscope, Baby, Heart } from 'lucide-react';
import AdminLayout from '../components/AdminLayout';
import apiClient from '../../../api/api';
import { useAdminAuth } from '../../../context/AdminAuthContext';

const Bookings = () => {
  const { adminToken } = useAdminAuth();
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedBooking, setSelectedBooking] = useState(null);

  const getStatusBadge = (status) => {
    const statusConfig = {
      active: { color: 'green', icon: CheckCircle, label: 'Active' },
      'termination-pending': { color: 'yellow', icon: Clock, label: 'Termination Pending' },
      terminated: { color: 'blue', icon: CheckCircle, label: 'Terminated' },
      cancelled: { color: 'red', icon: XCircle, label: 'Cancelled' },
    };
    
    const config = statusConfig[status?.toLowerCase()] || { color: 'gray', icon: AlertCircle, label: status };
    const Icon = config.icon;
    
    return (
      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-${config.color}-100 text-${config.color}-800`}>
        <Icon className="w-3 h-3" />
        {config.label}
      </span>
    );
  };

  const getServiceTypeIcon = (serviceType) => {
    const icons = {
      '{NURSE}': Stethoscope,
      '{NANNY}': Baby,
      'HOME_NURSING': Heart,
    };
    return icons[serviceType] || Activity;
  };

  useEffect(() => {
    if (adminToken) {
      fetchBookings();
    }
  }, [adminToken]);

  const fetchBookings = async () => {
    try {
      setLoading(true);
      if (!adminToken) {
        setError('Admin authentication required');
        return;
      }
      const orig = apiClient.token;
      apiClient.setToken(adminToken);
      const response = await apiClient.getActiveBookings();
      apiClient.setToken(orig);

      if (Array.isArray(response)) {
        setBookings(response);
      } else if (response.status === 'success') {
        setBookings(response.data || []);
      } else {
        setError(response.message || 'Failed to load bookings');
      }
    } catch (err) {
      console.error('Error fetching bookings:', err);
      setError(err.message || 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <AdminLayout title="Active Bookings" subtitle="Loading bookings data...">
        <div className="flex flex-col items-center justify-center h-64">
          <Loader2 className="animate-spin w-12 h-12 text-blue-600 mb-4" />
          <p className="text-slate-500">Fetching bookings...</p>
        </div>
      </AdminLayout>
    );
  }

  if (error) {
    return (
      <AdminLayout title="Active Bookings" subtitle="Error loading data">
        <div className="bg-red-50 border border-red-200 rounded-xl p-6">
          <div className="flex items-start gap-4">
            <div className="bg-red-100 rounded-full p-2">
              <XCircle className="w-6 h-6 text-red-600" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-red-800 mb-1">Unable to load bookings</h3>
              <p className="text-red-600 text-sm">{error}</p>
              <button 
                onClick={fetchBookings}
                className="mt-3 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-medium"
              >
                Try Again
              </button>
            </div>
          </div>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout title="Active Bookings" subtitle={`${bookings.length} bookings found`}>
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500 mb-1">Total Bookings</p>
              <p className="text-2xl font-bold text-slate-900">{bookings.length}</p>
            </div>
            <div className="bg-blue-100 rounded-full p-3">
              <Calendar className="w-6 h-6 text-blue-600" />
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500 mb-1">Active</p>
              <p className="text-2xl font-bold text-green-600">{bookings.filter(b => b.status === 'ACTIVE').length}</p>
            </div>
            <div className="bg-green-100 rounded-full p-3">
              <CheckCircle className="w-6 h-6 text-green-600" />
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500 mb-1">Termination Pending</p>
              <p className="text-2xl font-bold text-yellow-600">{bookings.filter(b => b.status === 'TERMINATION-PENDING').length}</p>
            </div>
            <div className="bg-yellow-100 rounded-full p-3">
              <Clock className="w-6 h-6 text-yellow-600" />
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500 mb-1">TERMINATED</p>
              <p className="text-2xl font-bold text-blue-600">{bookings.filter(b => b.status === 'TERMINATED').length}</p>
            </div>
            <div className="bg-blue-100 rounded-full p-3">
              <Activity className="w-6 h-6 text-blue-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Bookings Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
        {bookings.length === 0 ? (
          <div className="p-12 text-center">
            <div className="bg-slate-100 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4">
              <Calendar className="w-8 h-8 text-slate-400" />
            </div>
            <h3 className="text-lg font-semibold text-slate-900 mb-2">No bookings found</h3>
            <p className="text-slate-500">There are no active bookings at the moment.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Booking ID</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Client</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Patient</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Service</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Start Date</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-4 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {bookings.map((b) => {
                  const ServiceIcon = getServiceTypeIcon(b.service_type);
                  return (
                    <tr key={b.booking_id || b.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4">
                        <span className="font-mono text-sm font-medium text-slate-900">#{b.booking_id || b.id}</span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="bg-slate-100 rounded-full w-8 h-8 flex items-center justify-center">
                            <User className="w-4 h-4 text-slate-600" />
                          </div>
                          <span className="text-sm font-medium text-slate-900">{b.client_id}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm text-slate-600">{b.patient_id}</span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <div className="bg-blue-50 rounded-lg p-1.5">
                            <ServiceIcon className="w-4 h-4 text-blue-600" />
                          </div>
                          <span className="text-sm font-medium text-slate-900 capitalize">{b.service_type}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2 text-sm text-slate-600">
                          <Calendar className="w-4 h-4" />
                          {b.start_date ? new Date(b.start_date).toLocaleDateString('en-US', { 
                            month: 'short', 
                            day: 'numeric', 
                            year: 'numeric' 
                          }) : '-'}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        {getStatusBadge(b.status)}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={() => setSelectedBooking(b)}
                          className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg transition-all"
                          title="View details"
                        >
                          <Eye className="w-4 h-4" />
                          View
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Detail Modal */}
      {selectedBooking && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="sticky top-0 bg-white border-b border-slate-200 p-6 rounded-t-2xl">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold text-slate-900">Booking Details</h2>
                  <p className="text-slate-500 text-sm mt-1">Booking ID: #{selectedBooking.booking_id || selectedBooking.id}</p>
                </div>
                <button
                  onClick={() => setSelectedBooking(null)}
                  className="text-slate-400 hover:text-slate-600 transition-colors"
                >
                  <XCircle className="w-6 h-6" />
                </button>
              </div>
            </div>
            <div className="p-6 space-y-6">
              {/* Booking Information */}
              <div className="bg-slate-50 rounded-xl p-6">
                <h3 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-blue-600" />
                  Booking Information
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-slate-500 mb-1">Booking ID</p>
                    <p className="font-mono font-medium text-slate-900">#{selectedBooking.booking_id || selectedBooking.id}</p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-500 mb-1">Status</p>
                    <div>{getStatusBadge(selectedBooking.status)}</div>
                  </div>
                  <div>
                    <p className="text-sm text-slate-500 mb-1">Service Type</p>
                    <div className="flex items-center gap-2">
                      <div className="bg-blue-50 rounded-lg p-1.5">
                        {React.createElement(getServiceTypeIcon(selectedBooking.service_type), { className: "w-4 h-4 text-blue-600" })}
                      </div>
                      <span className="font-medium text-slate-900 capitalize">{selectedBooking.service_type}</span>
                    </div>
                  </div>
                  <div>
                    <p className="text-sm text-slate-500 mb-1">Start Date</p>
                    <p className="font-medium text-slate-900">
                      {selectedBooking.start_date ? new Date(selectedBooking.start_date).toLocaleDateString('en-US', { 
                        weekday: 'long',
                        year: 'numeric', 
                        month: 'long', 
                        day: 'numeric' 
                      }) : '-'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Client & Patient Information */}
              <div className="bg-slate-50 rounded-xl p-6">
                <h3 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
                  <User className="w-5 h-5 text-blue-600" />
                  Client & Patient Information
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-slate-500 mb-1">Client ID</p>
                    <p className="font-medium text-slate-900">{selectedBooking.client_id}</p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-500 mb-1">Patient ID</p>
                    <p className="font-medium text-slate-900">{selectedBooking.patient_id}</p>
                  </div>
                </div>
              </div>

              {/* Raw Data */}
              <div className="bg-slate-50 rounded-xl p-6">
                <h3 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
                  <Activity className="w-5 h-5 text-blue-600" />
                  Complete Data
                </h3>
                <div className="bg-slate-900 rounded-lg p-4 overflow-x-auto">
                  <pre className="text-xs text-green-400 font-mono">
                    {JSON.stringify(selectedBooking, null, 2)}
                  </pre>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
};

export default Bookings;
