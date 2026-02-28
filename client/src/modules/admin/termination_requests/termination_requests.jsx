import React, { useState, useEffect } from 'react';
import AdminLayout from '../components/AdminLayout';
import apiClient from '../../../api/api';
import { 
  Calendar, 
  User, 
  AlertTriangle,
  Clock,
  MapPin,
  Filter,
  Search,
  Eye,
  CheckCircle,
  XCircle,
  Activity,
  Heart
} from 'lucide-react';

const TerminationRequests = () => {
  const [terminationRequests, setTerminationRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [urgencyFilter, setUrgencyFilter] = useState('all');
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [showApproveForm, setShowApproveForm] = useState(false);
  const [approveForm, setApproveForm] = useState({
    termination_id: '',
    final_end_date: new Date().toISOString().split('T')[0] // Default to today
  });
  const [approveLoading, setApproveLoading] = useState(false);

  useEffect(() => {
    fetchTerminationRequests();
  }, []);

  const fetchTerminationRequests = async () => {
    try {
      setLoading(true);
      const response = await apiClient.getPendingTerminationRequests();
      console.log('Termination requests data:', response.data);
      setTerminationRequests(response.data || []);
    } catch (err) {
      console.error('Termination Requests fetch error:', err);
      setError(`Failed to fetch termination requests: ${err.message || 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  const getUrgencyColor = (urgency) => {
    switch (urgency) {
      case 'IMMEDIATE':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'TODAY':
        return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'FUTURE':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getUrgencyIcon = (urgency) => {
    switch (urgency) {
      case 'IMMEDIATE':
        return <AlertTriangle className="w-4 h-4" />;
      case 'TODAY':
        return <Clock className="w-4 h-4" />;
      case 'FUTURE':
        return <Calendar className="w-4 h-4" />;
      default:
        return <Activity className="w-4 h-4" />;
    }
  };

  const getServiceTypeIcon = (serviceType) => {
    const icons = {
      '{NURSE}': <Heart className="w-4 h-4" />,
      '{NANNY}': <User className="w-4 h-4" />,
      'HOME_NURSING': <Heart className="w-4 h-4" />,
    };
    return icons[serviceType] || <Activity className="w-4 h-4" />;
  };

  const filteredRequests = terminationRequests.filter(request => {
    const matchesSearch = 
      request.client_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      request.patient_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      request.staff_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      request.booking_id?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesUrgency = urgencyFilter === 'all' || request.urgency === urgencyFilter;
    
    return matchesSearch && matchesUrgency;
  });

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const handleApproveRequest = (request) => {
    setApproveForm({
      termination_id: request.termination_id,
      final_end_date: new Date().toISOString().split('T')[0] // Default to today
    });
    setShowApproveForm(true);
  };

  const submitApproval = async () => {
    try {
      setApproveLoading(true);
      await apiClient.approveTerminationRequest(
        approveForm.termination_id,
        approveForm.final_end_date
      );
      
      setShowApproveForm(false);
      setApproveForm({
        termination_id: '',
        final_end_date: new Date().toISOString().split('T')[0]
      });
      
      // Refresh the list
      fetchTerminationRequests();
    } catch (err) {
      console.error('Error approving termination:', err);
      setError(`Failed to approve termination: ${err.message || 'Unknown error'}`);
    } finally {
      setApproveLoading(false);
    }
  };

  if (loading) {
    return (
      <AdminLayout title="Termination Requests" subtitle="Loading...">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      </AdminLayout>
    );
  }

  if (error) {
    return (
      <AdminLayout title="Termination Requests" subtitle="Error occurred">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <XCircle className="w-5 h-5 text-red-600" />
            <span className="text-red-800">{error}</span>
          </div>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout 
      title="Termination Requests" 
      subtitle={`${filteredRequests.length} pending requests`}
    >
      {/* Filters and Search */}
      <div className="bg-white rounded-lg border border-slate-200 p-6 mb-6">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search by client, patient, staff, or booking ID..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-slate-500" />
            <select
              value={urgencyFilter}
              onChange={(e) => setUrgencyFilter(e.target.value)}
              className="px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option key="all" value="all">All Urgency</option>
              <option key="immediate" value="IMMEDIATE">Immediate</option>
              <option key="today" value="TODAY">Today</option>
              <option key="future" value="FUTURE">Future</option>
            </select>
          </div>
        </div>
      </div>

      {/* Termination Requests List */}
      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        {filteredRequests.length === 0 ? (
          <div className="p-8 text-center">
            <AlertTriangle className="w-12 h-12 text-slate-300 mx-auto mb-4" />
            <p className="text-slate-500">No termination requests found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Booking Details
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Client & Patient
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Assigned Staff
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Urgency
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Requested End Date
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Request Date
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-200">
                {filteredRequests.map((request) => (
                  <tr key={request.termination_id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4">
                      <div>
                        <div className="font-mono text-sm font-medium text-slate-900">#{request.booking_id}</div>
                        <div className="flex items-center gap-2 text-sm text-slate-600 mt-1">
                          {getServiceTypeIcon(request.service_type)}
                          <span className="capitalize">{request.service_type?.replace(/[{}]/g, '') || 'General Service'}</span>
                        </div>
                        <div className="text-xs text-slate-400 mt-1">
                          Started: {request.start_date ? new Date(request.start_date).toLocaleDateString() : 'Not set'}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div>
                        <div className="font-medium text-slate-900">{request.client_name}</div>
                        <div className="text-sm text-slate-500">
                          Patient: {request.patient_name}
                        </div>
                        <div className="flex items-start gap-1 text-sm text-slate-500 mt-1">
                          <MapPin className="w-3 h-3 text-slate-400 mt-0.5 flex-shrink-0" />
                          <span className="line-clamp-2">
                            {request.location}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <div className="bg-slate-100 rounded-full w-8 h-8 flex items-center justify-center">
                          <User className="w-4 h-4 text-slate-600" />
                        </div>
                        <div>
                          <span className="text-sm font-medium text-slate-900">
                            {request.staff_name || `Staff #${request.staff_profile_id || 'Not assigned'}`}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border ${getUrgencyColor(request.urgency)}`}>
                        {getUrgencyIcon(request.urgency)}
                        {request.urgency}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-1 text-sm text-slate-600">
                        <Calendar className="w-3 h-3" />
                        {request.requested_end_date ? new Date(request.requested_end_date).toLocaleDateString() : 'Not specified'}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-1 text-sm text-slate-600">
                        <Clock className="w-3 h-3" />
                        {formatDate(request.request_date)}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setSelectedRequest(request)}
                          className="text-blue-600 hover:text-blue-800 transition-colors"
                          title="View Details"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleApproveRequest(request)}
                          className="text-green-600 hover:text-green-800 transition-colors"
                          title="Approve Termination"
                        >
                          <CheckCircle className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Detail Modal */}
      {selectedRequest && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-200">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-slate-900">Termination Request Details</h2>
                <button
                  onClick={() => setSelectedRequest(null)}
                  className="text-slate-400 hover:text-slate-600"
                >
                  <XCircle className="w-6 h-6" />
                </button>
              </div>
            </div>
            
            <div className="p-6 space-y-6">
              {/* Booking Information */}
              <div>
                <h3 className="font-semibold text-slate-900 mb-3">Booking Information</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm text-slate-500">Booking ID</label>
                    <p className="font-mono font-medium">{selectedRequest.booking_id}</p>
                  </div>
                  <div>
                    <label className="text-sm text-slate-500">Service Type</label>
                    <div className="flex items-center gap-2">
                      {getServiceTypeIcon(selectedRequest.service_type)}
                      <span className="font-medium capitalize">{selectedRequest.service_type?.replace(/[{}]/g, '') || 'General Service'}</span>
                    </div>
                  </div>
                  <div>
                    <label className="text-sm text-slate-500">Start Date</label>
                    <p className="font-medium">
                      {selectedRequest.start_date ? new Date(selectedRequest.start_date).toLocaleDateString() : 'Not set'}
                    </p>
                  </div>
                  <div>
                    <label className="text-sm text-slate-500">Request Date</label>
                    <p className="font-medium">{formatDate(selectedRequest.request_date)}</p>
                  </div>
                </div>
              </div>

              {/* Client & Patient Information */}
              <div>
                <h3 className="font-semibold text-slate-900 mb-3">Client & Patient Information</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm text-slate-500">Client Name</label>
                    <p className="font-medium">{selectedRequest.client_name}</p>
                  </div>
                  <div>
                    <label className="text-sm text-slate-500">Patient Name</label>
                    <p className="font-medium">{selectedRequest.patient_name}</p>
                  </div>
                  <div className="col-span-2">
                    <label className="text-sm text-slate-500">Service Location</label>
                    <p className="font-medium">{selectedRequest.location}</p>
                  </div>
                </div>
              </div>

              {/* Staff Information */}
              <div>
                <h3 className="font-semibold text-slate-900 mb-3">Assigned Staff</h3>
                <div className="flex items-center gap-3">
                  <div className="bg-slate-100 rounded-full w-10 h-10 flex items-center justify-center">
                    <User className="w-5 h-5 text-slate-600" />
                  </div>
                  <div>
                    <p className="font-medium">
                      {selectedRequest.staff_name || `Staff #${selectedRequest.staff_profile_id || 'Not assigned'}`}
                    </p>
                    <p className="text-sm text-slate-500">ID: {selectedRequest.staff_profile_id || 'Not assigned'}</p>
                  </div>
                </div>
              </div>

              {/* Termination Details */}
              <div>
                <h3 className="font-semibold text-slate-900 mb-3">Termination Details</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm text-slate-500">Urgency Level</label>
                    <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium border ${getUrgencyColor(selectedRequest.urgency)}`}>
                      {getUrgencyIcon(selectedRequest.urgency)}
                      {selectedRequest.urgency}
                    </span>
                  </div>
                  <div>
                    <label className="text-sm text-slate-500">Requested End Date</label>
                    <p className="font-medium">
                      {selectedRequest.requested_end_date ? new Date(selectedRequest.requested_end_date).toLocaleDateString() : 'Not specified'}
                    </p>
                  </div>
                  <div className="col-span-2">
                    <label className="text-sm text-slate-500">Reason for Termination</label>
                    <p className="font-medium bg-slate-50 p-3 rounded border border-slate-200">
                      {selectedRequest.reason}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Approval Form Modal */}
      {showApproveForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-md w-full shadow-2xl">
            <div className="p-6 border-b border-slate-200">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-slate-900">Approve Termination Request</h2>
                <button
                  onClick={() => setShowApproveForm(false)}
                  className="text-slate-400 hover:text-slate-600"
                >
                  <XCircle className="w-6 h-6" />
                </button>
              </div>
            </div>
            
            <div className="p-6 space-y-6">
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5" />
                  <div>
                    <h4 className="font-semibold text-amber-800">Approve Termination</h4>
                    <p className="text-amber-700 text-sm mt-1">
                      This will finalize the termination and process any applicable refunds. 
                      The staff member will be marked as available for new assignments.
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Termination ID
                  </label>
                  <input
                    type="text"
                    value={approveForm.termination_id}
                    readOnly
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-slate-50 text-slate-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Final End Date <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={approveForm.final_end_date}
                    onChange={(e) => setApproveForm({...approveForm, final_end_date: e.target.value})}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    min={new Date().toISOString().split('T')[0]}
                    required
                  />
                  <p className="text-xs text-slate-500 mt-1">
                    Leave empty to use current date, or select a custom end date
                  </p>
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => setShowApproveForm(false)}
                  className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={submitApproval}
                  disabled={approveLoading}
                  className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {approveLoading ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      Processing...
                    </>
                  ) : (
                    <>
                      <CheckCircle className="w-4 h-4" />
                      Approve Termination
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
};

export default TerminationRequests;