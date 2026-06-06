import React, { useState, useEffect } from 'react';
import AdminLayout from '../components/AdminLayout';
import apiClient from '../../../api/api';
import { 
  DollarSign,
  User, 
  AlertTriangle,
  Clock,
  Filter,
  Search,
  Eye,
  CheckCircle,
  XCircle,
  Activity,
  Wallet,
  Calendar
} from 'lucide-react';

const AdvanceRequests = () => {
  const [advanceRequests, setAdvanceRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('pending');
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [showApproveModal, setShowApproveModal] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [selectedRequestId, setSelectedRequestId] = useState(null);

  useEffect(() => {
    fetchAdvanceRequests();
  }, [statusFilter]);

  const fetchAdvanceRequests = async () => {
    try {
      setLoading(true);
      let response;
      
      if (statusFilter === 'pending') {
        response = await apiClient.getPendingAdvances();
      } else {
        response = await apiClient.getAllAdvances();
      }
      
      console.log('Advance requests data:', response.data);
      setAdvanceRequests(response.data || []);
    } catch (err) {
      console.error('Advance Requests fetch error:', err);
      setError(`Failed to fetch advance requests: ${err.message || 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'PENDING':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'APPROVED':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'REJECTED':
        return 'bg-red-100 text-red-800 border-red-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'PENDING':
        return <Clock className="w-4 h-4" />;
      case 'APPROVED':
        return <CheckCircle className="w-4 h-4" />;
      case 'REJECTED':
        return <XCircle className="w-4 h-4" />;
      default:
        return <Activity className="w-4 h-4" />;
    }
  };

  const filteredRequests = advanceRequests.filter(request => {
    const matchesSearch = 
      request.staff_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      request.staff_profile_id?.toString().includes(searchTerm.toLowerCase()) ||
      request.advance_id?.toString().includes(searchTerm.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || request.status === statusFilter.toUpperCase();
    
    return matchesSearch && matchesStatus;
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

  const formatCurrency = (amount_requested) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount_requested || 0);
  };

  const handleApproveRequest = (requestId) => {
    setSelectedRequestId(requestId);
    setShowApproveModal(true);
  };

  const handleRejectRequest = (requestId) => {
    setSelectedRequestId(requestId);
    setShowRejectModal(true);
  };

  const confirmApprove = async () => {
    try {
      setActionLoading(true);
      await apiClient.approveAdvance(selectedRequestId);
      
      setShowApproveModal(false);
      setSelectedRequestId(null);
      
      // Refresh the list
      fetchAdvanceRequests();
    } catch (err) {
      console.error('Error approving advance:', err);
      setError(`Failed to approve advance: ${err.message || 'Unknown error'}`);
    } finally {
      setActionLoading(false);
    }
  };

  const confirmReject = async () => {
    try {
      setActionLoading(true);
      await apiClient.rejectAdvance(selectedRequestId);
      
      setShowRejectModal(false);
      setSelectedRequestId(null);
      
      // Refresh the list
      fetchAdvanceRequests();
    } catch (err) {
      console.error('Error rejecting advance:', err);
      setError(`Failed to reject advance: ${err.message || 'Unknown error'}`);
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <AdminLayout title="Advance Requests" subtitle="Loading...">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      </AdminLayout>
    );
  }

  if (error) {
    return (
      <AdminLayout title="Advance Requests" subtitle="Error occurred">
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
      title="Advance Requests" 
      subtitle={`${filteredRequests.length} ${statusFilter === 'all' ? 'total' : statusFilter} requests`}
    >
      {/* Filters and Search */}
      <div className="bg-white rounded-lg border border-slate-200 p-6 mb-6">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search by staff name, ID, or advance ID..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-slate-500" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="pending">Pending Only</option>
              <option value="all">All Requests</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>
        </div>
      </div>

      {/* Advance Requests List */}
      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        {filteredRequests.length === 0 ? (
          <div className="p-8 text-center">
            <Wallet className="w-12 h-12 text-slate-300 mx-auto mb-4" />
            <p className="text-slate-500">No advance requests found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Advance Details
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Staff Information
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Amount
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Status
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
                  <tr key={request.advance_id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4">
                      <div>
                        <div className="font-mono text-sm font-medium text-slate-900">
                          #{request.advance_id}
                        </div>
                        <div className="text-xs text-slate-400 mt-1">
                          Type: {request.advance_type || 'Standard Advance'}
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
                            {request.staff_name || `Staff #${request.staff_code || request.staff_profile_id || 'Unknown'}`}
                          </span>
                          <div className="text-xs text-slate-500">
                            ID: {request.staff_code || request.staff_profile_id || 'N/A'}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-1">
                        <span className="font-semibold text-green-600">
                          {formatCurrency(request.amount_requested)}
                        </span>
                      </div>
                      {request.reason && (
                        <div className="text-xs text-slate-500 mt-1 max-w-xs truncate">
                          {request.reason}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border ${getStatusColor(request.status)}`}>
                        {getStatusIcon(request.status)}
                        {request.status}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-1 text-sm text-slate-600">
                        <Calendar className="w-3 h-3" />
                        {formatDate(request.created_at)}
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
                        {request.status === 'PENDING' && (
                          <>
                            <button
                              onClick={() => handleApproveRequest(request.advance_id)}
                              className="text-green-600 hover:text-green-800 transition-colors"
                              title="Approve Advance"
                            >
                              <CheckCircle className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleRejectRequest(request.advance_id)}
                              className="text-red-600 hover:text-red-800 transition-colors"
                              title="Reject Advance"
                            >
                              <XCircle className="w-4 h-4" />
                            </button>
                          </>
                        )}
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
                <h2 className="text-xl font-bold text-slate-900">Advance Request Details</h2>
                <button
                  onClick={() => setSelectedRequest(null)}
                  className="text-slate-400 hover:text-slate-600"
                >
                  <XCircle className="w-6 h-6" />
                </button>
              </div>
            </div>
            
            <div className="p-6 space-y-6">
              {/* Advance Information */}
              <div>
                <h3 className="font-semibold text-slate-900 mb-3">Advance Information</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm text-slate-500">Advance ID</label>
                    <p className="font-mono font-medium">{selectedRequest.advance_id}</p>
                  </div>
                  <div>
                    <label className="text-sm text-slate-500">Status</label>
                    <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium border ${getStatusColor(selectedRequest.status)}`}>
                      {getStatusIcon(selectedRequest.status)}
                      {selectedRequest.status}
                    </span>
                  </div>
                  <div>
                    <label className="text-sm text-slate-500">Amount</label>
                    <p className="font-semibold text-green-600 text-lg">
                      {formatCurrency(selectedRequest.amount_requested)}
                    </p>
                  </div>
                  <div>
                    <label className="text-sm text-slate-500">Advance Type</label>
                    <p className="font-medium">{selectedRequest.advance_type || 'Standard Advance'}</p>
                  </div>
                  <div>
                    <label className="text-sm text-slate-500">Request Date</label>
                    <p className="font-medium">{formatDate(selectedRequest.created_at)}</p>
                  </div>
                  {selectedRequest.processed_at && (
                    <div>
                      <label className="text-sm text-slate-500">Processed Date</label>
                      <p className="font-medium">{formatDate(selectedRequest.processed_at)}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Staff Information */}
              <div>
                <h3 className="font-semibold text-slate-900 mb-3">Staff Information</h3>
                <div className="flex items-center gap-3">
                  <div className="bg-slate-100 rounded-full w-10 h-10 flex items-center justify-center">
                    <User className="w-5 h-5 text-slate-600" />
                  </div>
                  <div>
                    <p className="font-medium">
                      {selectedRequest.staff_name || `Staff #${selectedRequest.staff_code || selectedRequest.staff_profile_id || 'Unknown'}`}
                    </p>
                    <p className="text-sm text-slate-500">ID: {selectedRequest.staff_code || selectedRequest.staff_profile_id || 'N/A'}</p>
                  </div>
                </div>
              </div>

              {/* Reason */}
              {selectedRequest.reason && (
                <div>
                  <h3 className="font-semibold text-slate-900 mb-3">Reason for Advance</h3>
                  <p className="font-medium bg-slate-50 p-3 rounded border border-slate-200">
                    {selectedRequest.reason}
                  </p>
                </div>
              )}

              {/* Notes */}
              {selectedRequest.notes && (
                <div>
                  <h3 className="font-semibold text-slate-900 mb-3">Additional Notes</h3>
                  <p className="font-medium bg-slate-50 p-3 rounded border border-slate-200">
                    {selectedRequest.notes}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Approve Modal */}
      {showApproveModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-md w-full shadow-2xl">
            <div className="p-6 border-b border-slate-200">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-slate-900">Approve Advance Request</h2>
                <button
                  onClick={() => setShowApproveModal(false)}
                  className="text-slate-400 hover:text-slate-600"
                >
                  <XCircle className="w-6 h-6" />
                </button>
              </div>
            </div>
            
            <div className="p-6 space-y-6">
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-green-600 mt-0.5" />
                  <div>
                    <h4 className="font-semibold text-green-800">Approve Advance</h4>
                    <p className="text-green-700 text-sm mt-1">
                      This will approve the advance request and process the payment to the staff member.
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Advance ID
                  </label>
                  <input
                    type="text"
                    value={selectedRequestId}
                    readOnly
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-slate-50 text-slate-500"
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => setShowApproveModal(false)}
                  className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmApprove}
                  disabled={actionLoading}
                  className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {actionLoading ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      Processing...
                    </>
                  ) : (
                    <>
                      <CheckCircle className="w-4 h-4" />
                      Approve Advance
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {showRejectModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-md w-full shadow-2xl">
            <div className="p-6 border-b border-slate-200">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-slate-900">Reject Advance Request</h2>
                <button
                  onClick={() => setShowRejectModal(false)}
                  className="text-slate-400 hover:text-slate-600"
                >
                  <XCircle className="w-6 h-6" />
                </button>
              </div>
            </div>
            
            <div className="p-6 space-y-6">
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <XCircle className="w-5 h-5 text-red-600 mt-0.5" />
                  <div>
                    <h4 className="font-semibold text-red-800">Reject Advance</h4>
                    <p className="text-red-700 text-sm mt-1">
                      This will reject the advance request. The staff member will be notified of the rejection.
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Advance ID
                  </label>
                  <input
                    type="text"
                    value={selectedRequestId}
                    readOnly
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-slate-50 text-slate-500"
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => setShowRejectModal(false)}
                  className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmReject}
                  disabled={actionLoading}
                  className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {actionLoading ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      Processing...
                    </>
                  ) : (
                    <>
                      <XCircle className="w-4 h-4" />
                      Reject Advance
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

export default AdvanceRequests;