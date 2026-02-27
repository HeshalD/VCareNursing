import React, { useState, useEffect } from 'react';
import apiClient from '../../api/api';
import { useAuth } from '../../context/AuthContext';

const ClientBookings = () => {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const { user } = useAuth();

  useEffect(() => {
    const fetchActiveBookings = async () => {
      try {
        setLoading(true);
        
        // Debug: Log user object to understand its structure
        console.log('User object:', user);
        
        // Call API without clientId (backend will derive from logged-in user)
        const response = await apiClient.getActiveBookingByClientID();
        console.log('API Response:', response);
        setBookings(response.data);
        setError(null);
      } catch (err) {
        console.error('API Error:', err);
        setError(err.message || 'Failed to fetch active bookings');
        setBookings([]);
      } finally {
        setLoading(false);
      }
    };

    if (user) {
      fetchActiveBookings();
    } else {
      setError('User not authenticated');
      setLoading(false);
    }
  }, [user]);

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString();
  };

  const formatTime = (dateString) => {
    return new Date(dateString).toLocaleTimeString();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600 font-medium">Loading your bookings...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl border border-red-100 p-8 max-w-md w-full">
          <div className="text-center">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Unable to Load Bookings</h3>
            <p className="text-gray-600 text-sm">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  if (bookings.length === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-8 max-w-md w-full">
          <div className="text-center">
            <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No Active Bookings</h3>
            <p className="text-gray-600 text-sm mb-6">You don't have any active bookings at the moment.</p>
            <button 
              onClick={() => window.location.href = '/'}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium transition-all transform hover:scale-105 shadow-lg shadow-blue-600/20"
            >
              Browse Services
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 py-8 px-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">My Active Bookings</h1>
          <p className="text-gray-600">Manage and track your current service bookings</p>
        </div>

        {/* Bookings Grid */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {bookings.map((booking) => (
            <div key={booking.booking_id} className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1">
              {/* Header */}
              <div className="bg-gradient-to-r from-blue-500 to-indigo-600 p-4 text-white">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="text-lg font-semibold">Booking #{booking.booking_id}</h3>
                    <p className="text-blue-100 text-sm">Created {formatDate(booking.created_at)}</p>
                  </div>
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-white/20 backdrop-blur-sm border border-white/30">
                    {booking.status}
                  </span>
                </div>
              </div>

              {/* Content */}
              <div className="p-6 space-y-4">
                {/* Service Type */}
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                    <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Service Type</p>
                    <p className="font-semibold text-gray-900">{booking.service_type || 'General Service'}</p>
                  </div>
                </div>

                {/* Date Range */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-500 mb-1">Start Date</p>
                    <p className="font-medium text-gray-900">
                      {booking.start_date ? formatDate(booking.start_date) : 'Not set'}
                    </p>
                  </div>
                </div>

                {/* Staff Assignment */}
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center">
                    <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <p className="text-sm text-gray-500">Staff Assigned</p>
                    <p className="font-medium text-gray-900">
                      {booking.assigned_staff_id || 'Not assigned'}
                    </p>
                  </div>
                </div>

                {/* Payment Status */}
                <div className="flex items-center justify-between pt-4 border-t border-gray-100">
                  <div>
                    <p className="text-sm text-gray-500">Total Amount</p>
                    <p className="text-xl font-bold text-gray-900">
                      {booking.total_amount ? `$${booking.total_amount}` : 'N/A'}
                    </p>
                  </div>
                  <span className={`inline-flex items-center px-3 py-1.5 rounded-full text-xs font-semibold ${
                    booking.payment_status === 'PAID' 
                      ? 'bg-green-100 text-green-800 border border-green-200' 
                      : 'bg-yellow-100 text-yellow-800 border border-yellow-200'
                  }`}>
                    {booking.payment_status || 'PENDING'}
                  </span>
                </div>

                {/* Notes */}
                {booking.notes && (
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-sm text-gray-500 mb-1">Notes</p>
                    <p className="text-sm text-gray-700">{booking.notes}</p>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ClientBookings;