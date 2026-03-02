import React, { useState, useEffect } from 'react';
import { Eye, XCircle, Loader2, Calendar, User, Activity, Clock, CheckCircle, AlertCircle, DollarSign, Stethoscope, Baby, Heart, FileText, Download, MessageSquare } from 'lucide-react';
import AdminLayout from '../components/AdminLayout';
import apiClient from '../../../api/api';
import { useAdminAuth } from '../../../context/AdminAuthContext';

const Statements = () => {
  const { adminToken } = useAdminAuth();
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [bookingDetails, setBookingDetails] = useState({});
  const [showAllBookings, setShowAllBookings] = useState(false);
  const [dateRangeModal, setDateRangeModal] = useState(false);
  const [selectedBookingForStatement, setSelectedBookingForStatement] = useState(null);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [generatedPDF, setGeneratedPDF] = useState(null);
  const [pdfLoading, setPdfLoading] = useState(false);

  const getStatusBadge = (status) => {
    const statusConfig = {
      active: { color: 'green', icon: CheckCircle, label: 'Active' },
      pending_termination: { color: 'yellow', icon: Clock, label: 'PENDING TERMINATION' },
      terminated: { color: 'red', icon: CheckCircle, label: 'Terminated' },
      completed: { color: 'blue', icon: CheckCircle, label: 'Completed' },
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
  }, [adminToken, showAllBookings]);

  const fetchBookings = async () => {
    try {
      setLoading(true);
      if (!adminToken) {
        setError('Admin authentication required');
        return;
      }
      const orig = apiClient.token;
      apiClient.setToken(adminToken);
      
      // Always get all bookings for statements page
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
      
      // Fetch detailed information for each booking
      const detailsPromises = bookingsData.map(async (booking) => {
        try {
          apiClient.setToken(adminToken);
          const detailResponse = await apiClient.getBookingById(booking.booking_id);
          apiClient.setToken(orig);
          return { bookingId: booking.booking_id, details: detailResponse.data };
        } catch (err) {
          console.error(`Error fetching details for booking ${booking.booking_id}:`, err);
          return { bookingId: booking.booking_id, details: null };
        }
      });

      const detailsResults = await Promise.all(detailsPromises);
      const detailsMap = {};
      detailsResults.forEach(result => {
        if (result.details) {
          detailsMap[result.bookingId] = result.details;
        }
      });
      
      setBookingDetails(detailsMap);
    } catch (err) {
      console.error('Error fetching bookings:', err);
      setError(err.message || 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadStatement = async (clientId, clientName) => {
    try {
      const orig = apiClient.token;
      apiClient.setToken(adminToken);
      
      // Get current date and end date (last month)
      const endDate = new Date();
      const startDate = new Date();
      startDate.setMonth(startDate.getMonth() - 1);
      
      const response = await apiClient.downloadClientStatement(clientId, {
        start_date: startDate.toISOString().split('T')[0],
        end_date: endDate.toISOString().split('T')[0]
      });
      
      apiClient.setToken(orig);
      
      // Create blob and download
      const blob = new Blob([response], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Statement_${clientName.replace(/\s+/g, '_')}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
    } catch (err) {
      console.error('Error downloading statement:', err);
      alert('Failed to download statement. Please try again.');
    }
  };

  const openDateRangeModal = (booking) => {
    setSelectedBookingForStatement(booking);
    // Set default dates (last month to today)
    const endDate = new Date();
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - 1);
    setStartDate(startDate.toISOString().split('T')[0]);
    setEndDate(endDate.toISOString().split('T')[0]);
    setDateRangeModal(true);
  };

  const generateStatement = async () => {
    if (!selectedBookingForStatement || !startDate || !endDate) {
      alert('Please select start and end dates');
      return;
    }

    try {
      setPdfLoading(true);
      const orig = apiClient.token;
      apiClient.setToken(adminToken);
      
      const response = await apiClient.downloadClientStatement(selectedBookingForStatement.client_profile_id, {
        start_date: startDate,
        end_date: endDate
      });
      
      apiClient.setToken(orig);
      
      // Store the PDF blob for both download and WhatsApp
      const blob = new Blob([response], { type: 'application/pdf' });
      setGeneratedPDF(blob);
      
    } catch (err) {
      console.error('Error generating statement:', err);
      alert('Failed to generate statement. Please try again.');
    } finally {
      setPdfLoading(false);
    }
  };

  const downloadStatement = () => {
    if (!generatedPDF || !selectedBookingForStatement) return;
    
    const url = window.URL.createObjectURL(generatedPDF);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Statement_${selectedBookingForStatement.client_name.replace(/\s+/g, '_')}_${startDate}_to_${endDate}.pdf`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  };

  const sendViaWhatsApp = () => {
    if (!selectedBookingForStatement) return;
    
    // Placeholder for WhatsApp functionality
    alert(`WhatsApp integration coming soon!\n\nWould send statement to: ${selectedBookingForStatement.client_mobile}\nClient: ${selectedBookingForStatement.client_name}\nPeriod: ${startDate} to ${endDate}`);
    
    // TODO: Implement actual WhatsApp integration
    // This could involve:
    // 1. Uploading PDF to cloud storage
    // 2. Generating WhatsApp message with download link
    // 3. Using WhatsApp Business API to send message
  };

  const closeDateRangeModal = () => {
    setDateRangeModal(false);
    setSelectedBookingForStatement(null);
    setGeneratedPDF(null);
    setStartDate('');
    setEndDate('');
  };

  if (loading) {
    return (
      <AdminLayout title="Client Statements" subtitle="Loading bookings data...">
        <div className="flex flex-col items-center justify-center h-64">
          <Loader2 className="animate-spin w-12 h-12 text-blue-600 mb-4" />
          <p className="text-slate-500">Fetching bookings...</p>
        </div>
      </AdminLayout>
    );
  }

  if (error) {
    return (
      <AdminLayout title="Client Statements" subtitle="Error loading data">
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
    <AdminLayout title="Client Statements" subtitle={`${bookings.length} bookings found`}>
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500 mb-1">Total Bookings</p>
              <p className="text-2xl font-bold text-slate-800">{bookings.length}</p>
            </div>
            <div className="bg-blue-100 rounded-full p-3">
              <FileText className="w-6 h-6 text-blue-600" />
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500 mb-1">Active Bookings</p>
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
              <p className="text-2xl font-bold text-yellow-600">{bookings.filter(b => b.status === 'PENDING_TERMINATION').length}</p>
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
              <p className="text-2xl font-bold text-red-600">{bookings.filter(b => b.status === 'TERMINATED').length}</p>
            </div>
            <div className="bg-red-100 rounded-full p-3">
              <Activity className="w-6 h-6 text-red-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Bookings Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200">
          <h3 className="text-lg font-semibold text-slate-800">Client Bookings</h3>
          <p className="text-sm text-slate-500 mt-1">Click on download to get client statement</p>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Client</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Patient</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Service</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Staff</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Start Date</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-slate-200">
              {bookings.map((booking) => {
                const details = bookingDetails[booking.booking_id];
                const ServiceIcon = getServiceTypeIcon(booking.service_type);
                
                return (
                  <tr key={booking.booking_id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <div className="text-sm font-medium text-slate-900">{booking.client_name}</div>
                        <div className="text-xs text-slate-500">{booking.client_mobile}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <div className="text-sm font-medium text-slate-900">{booking.patient_name}</div>
                        <div className="text-xs text-slate-500">Age: {booking.patient_age}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <ServiceIcon className="w-4 h-4 text-slate-400" />
                        <div>
                          <div className="text-sm font-medium text-slate-900">{booking.service_type}</div>
                          <div className="text-xs text-slate-500">{booking.service_model}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {booking.staff_name ? (
                        <div>
                          <div className="text-sm font-medium text-slate-900">{booking.staff_name}</div>
                          <div className="text-xs text-slate-500">{booking.staff_mobile}</div>
                        </div>
                      ) : (
                        <span className="text-sm text-slate-400">Not assigned</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-slate-400" />
                        <span className="text-sm text-slate-900">
                          {new Date(booking.start_date).toLocaleDateString()}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {getStatusBadge(booking.status)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => openDateRangeModal(booking)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 transition-colors"
                        >
                          <Download className="w-3 h-3" />
                          Statement
                        </button>
                        <button
                          onClick={() => setSelectedBooking(booking)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 bg-slate-100 text-slate-700 text-xs font-medium rounded-lg hover:bg-slate-200 transition-colors"
                        >
                          <Eye className="w-3 h-3" />
                          View
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Booking Details Modal */}
      {selectedBooking && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-200">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-slate-900">Booking Details</h3>
                <button
                  onClick={() => setSelectedBooking(null)}
                  className="text-slate-400 hover:text-slate-600 transition-colors"
                >
                  <XCircle className="w-5 h-5" />
                </button>
              </div>
            </div>
            
            <div className="p-6">
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <h4 className="text-sm font-medium text-slate-500 mb-2">Client Information</h4>
                  <div className="space-y-2">
                    <div>
                      <span className="text-sm font-medium text-slate-900">Name:</span>
                      <span className="text-sm text-slate-600 ml-2">{selectedBooking.client_name}</span>
                    </div>
                    <div>
                      <span className="text-sm font-medium text-slate-900">Mobile:</span>
                      <span className="text-sm text-slate-600 ml-2">{selectedBooking.client_mobile}</span>
                    </div>
                    <div>
                      <span className="text-sm font-medium text-slate-900">Address:</span>
                      <span className="text-sm text-slate-600 ml-2">{selectedBooking.client_address}</span>
                    </div>
                  </div>
                </div>
                
                <div>
                  <h4 className="text-sm font-medium text-slate-500 mb-2">Patient Information</h4>
                  <div className="space-y-2">
                    <div>
                      <span className="text-sm font-medium text-slate-900">Name:</span>
                      <span className="text-sm text-slate-600 ml-2">{selectedBooking.patient_name}</span>
                    </div>
                    <div>
                      <span className="text-sm font-medium text-slate-900">Age:</span>
                      <span className="text-sm text-slate-600 ml-2">{selectedBooking.patient_age}</span>
                    </div>
                    <div>
                      <span className="text-sm font-medium text-slate-900">Relationship:</span>
                      <span className="text-sm text-slate-600 ml-2">{selectedBooking.relationship_to_client}</span>
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="mt-6">
                <h4 className="text-sm font-medium text-slate-500 mb-2">Service Details</h4>
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <div>
                      <span className="text-sm font-medium text-slate-900">Service Type:</span>
                      <span className="text-sm text-slate-600 ml-2">{selectedBooking.service_type}</span>
                    </div>
                    <div>
                      <span className="text-sm font-medium text-slate-900">Service Model:</span>
                      <span className="text-sm text-slate-600 ml-2">{selectedBooking.service_model}</span>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div>
                      <span className="text-sm font-medium text-slate-900">Start Date:</span>
                      <span className="text-sm text-slate-600 ml-2">
                        {new Date(selectedBooking.start_date).toLocaleDateString()}
                      </span>
                    </div>
                    <div>
                      <span className="text-sm font-medium text-slate-900">Status:</span>
                      <span className="ml-2">{getStatusBadge(selectedBooking.status)}</span>
                    </div>
                  </div>
                </div>
              </div>
              
              {selectedBooking.staff_name && (
                <div className="mt-6">
                  <h4 className="text-sm font-medium text-slate-500 mb-2">Assigned Staff</h4>
                  <div className="space-y-2">
                    <div>
                      <span className="text-sm font-medium text-slate-900">Name:</span>
                      <span className="text-sm text-slate-600 ml-2">{selectedBooking.staff_name}</span>
                    </div>
                    <div>
                      <span className="text-sm font-medium text-slate-900">Mobile:</span>
                      <span className="text-sm text-slate-600 ml-2">{selectedBooking.staff_mobile}</span>
                    </div>
                    <div>
                      <span className="text-sm font-medium text-slate-900">Email:</span>
                      <span className="text-sm text-slate-600 ml-2">{selectedBooking.staff_email}</span>
                    </div>
                  </div>
                </div>
              )}
              
              <div className="mt-6 flex gap-3">
                <button
                  onClick={() => openDateRangeModal(selectedBooking)}
                  className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
                >
                  <Download className="w-4 h-4" />
                  Generate Statement
                </button>
                <button
                  onClick={() => setSelectedBooking(null)}
                  className="flex-1 inline-flex items-center justify-center px-4 py-2 bg-slate-100 text-slate-700 font-medium rounded-lg hover:bg-slate-200 transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Date Range Modal */}
      {dateRangeModal && selectedBookingForStatement && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-md w-full">
            <div className="p-6 border-b border-slate-200">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-slate-900">Generate Statement</h3>
                <button
                  onClick={closeDateRangeModal}
                  className="text-slate-400 hover:text-slate-600 transition-colors"
                >
                  <XCircle className="w-5 h-5" />
                </button>
              </div>
            </div>
            
            <div className="p-6">
              <div className="mb-6">
                <h4 className="text-sm font-medium text-slate-500 mb-2">Client Information</h4>
                <div className="bg-slate-50 rounded-lg p-3">
                  <p className="font-medium text-slate-900">{selectedBookingForStatement.client_name}</p>
                  <p className="text-sm text-slate-600">{selectedBookingForStatement.client_mobile}</p>
                </div>
              </div>

              <div className="space-y-4 mb-6">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Start Date
                  </label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    End Date
                  </label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>

              {!generatedPDF ? (
                <button
                  onClick={generateStatement}
                  disabled={pdfLoading || !startDate || !endDate}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {pdfLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <FileText className="w-4 h-4" />
                      Generate Statement
                    </>
                  )}
                </button>
              ) : (
                <div className="space-y-3">
                  <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                    <p className="text-sm font-medium text-green-800">Statement generated successfully!</p>
                    <p className="text-xs text-green-600 mt-1">Period: {startDate} to {endDate}</p>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={downloadStatement}
                      className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      <Download className="w-4 h-4" />
                      Download
                    </button>
                    <button
                      onClick={sendViaWhatsApp}
                      className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700 transition-colors"
                    >
                      <MessageSquare className="w-4 h-4" />
                      WhatsApp
                    </button>
                  </div>
                  
                  <button
                    onClick={closeDateRangeModal}
                    className="w-full inline-flex items-center justify-center px-4 py-2 bg-slate-100 text-slate-700 font-medium rounded-lg hover:bg-slate-200 transition-colors"
                  >
                    Close
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
};

export default Statements;