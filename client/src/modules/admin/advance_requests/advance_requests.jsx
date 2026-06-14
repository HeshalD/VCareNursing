import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import AdminLayout from '../components/AdminLayout';
import apiClient from '../../../api/api';
import {
  User,
  Clock,
  Filter,
  Search,
  Eye,
  CheckCircle,
  XCircle,
  Wallet,
  Calendar,
  ShieldCheck,
  BadgeCheck,
} from 'lucide-react';

const AdvanceRequests = () => {
  const navigate = useNavigate();
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
      const response = statusFilter === 'pending'
        ? await apiClient.getPendingAdvances()
        : await apiClient.getAllAdvances();
      setAdvanceRequests(response.data || []);
    } catch (err) {
      console.error('Advance Requests fetch error:', err);
      setError(`Failed to fetch advance requests: ${err.message || 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  const getStatusConfig = (status) => {
    switch (status) {
      case 'PENDING':
        return { bg: 'bg-amber-50 text-amber-700 border-amber-200', icon: <Clock className="w-3.5 h-3.5" /> };
      case 'APPROVED':
        return { bg: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: <CheckCircle className="w-3.5 h-3.5" /> };
      case 'REJECTED':
        return { bg: 'bg-red-50 text-red-700 border-red-200', icon: <XCircle className="w-3.5 h-3.5" /> };
      default:
        return { bg: 'bg-slate-100 text-slate-600 border-slate-200', icon: null };
    }
  };

  const filteredRequests = advanceRequests.filter(request => {
    const matchesSearch =
      request.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      request.staff_code?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || request.status === statusFilter.toUpperCase();
    return matchesSearch && matchesStatus;
  });

  const formatDate = (dateString) => {
    if (!dateString) return '—';
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('en-GB', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatCurrency = (amount) => {
    return `Rs. ${parseFloat(amount || 0).toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
        </div>
      </AdminLayout>
    );
  }

  if (error) {
    return (
      <AdminLayout title="Advance Requests" subtitle="Error occurred">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3">
          <XCircle className="w-5 h-5 text-red-600 shrink-0" />
          <span className="text-red-800 text-sm">{error}</span>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout
      title="Advance Requests"
      subtitle={`${filteredRequests.length} ${statusFilter === 'all' ? 'total' : statusFilter} request${filteredRequests.length !== 1 ? 's' : ''}`}
    >
      {/* Filters */}
      <div className="bg-white rounded-xl border border-slate-200 px-5 py-4 mb-5 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search by name or staff code..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-slate-400 shrink-0" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="text-sm px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="pending">Pending Only</option>
            <option value="all">All Requests</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {filteredRequests.length === 0 ? (
          <div className="py-16 text-center">
            <Wallet className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 text-sm">No advance requests found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Staff</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Amount Requested</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Requested On</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Reviewed By</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredRequests.map((request) => {
                  const statusConfig = getStatusConfig(request.status);
                  return (
                    <tr
                      key={request.advance_id}
                      onClick={() => navigate(`/admin/staff-history/${request.staff_profile_id}?advance_id=${request.advance_id}&amount=${request.amount_requested}&staff_name=${encodeURIComponent(request.full_name || '')}`)}
                      className="hover:bg-slate-50 transition-colors cursor-pointer"
                    >
                      {/* Staff */}
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                            <User className="w-4 h-4 text-blue-600" />
                          </div>
                          <div>
                            <p className="text-xs font-mono font-medium text-slate-500 mb-0.5">{request.advance_code}</p>
                            <p className="font-medium text-slate-900">{request.full_name || '—'}</p>
                            <p className="text-xs text-slate-400 mt-0.5">
                              {request.staff_code ? `#${request.staff_code}` : 'No code'}
                            </p>
                          </div>
                        </div>
                      </td>

                      {/* Amount */}
                      <td className="px-5 py-4">
                        <p className="font-semibold text-slate-900">{formatCurrency(request.amount_requested)}</p>
                        <p className="text-xs text-slate-400 mt-0.5">
                          Balance: {formatCurrency(request.current_balance)}
                        </p>
                      </td>

                      {/* Date */}
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-1.5 text-slate-600">
                          <Calendar className="w-3.5 h-3.5 text-slate-400" />
                          {formatDate(request.requested_at)}
                        </div>
                      </td>

                      {/* Status */}
                      <td className="px-5 py-4">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${statusConfig.bg}`}>
                          {statusConfig.icon}
                          {request.status}
                        </span>
                      </td>

                      {/* Reviewed By */}
                      <td className="px-5 py-4">
                        {request.reviewed_by_name ? (
                          <div className="flex items-center gap-1.5 text-slate-700">
                            <ShieldCheck className="w-3.5 h-3.5 text-slate-400" />
                            <span>{request.reviewed_by_name}</span>
                          </div>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                          <button
                            onClick={() => setSelectedRequest(request)}
                            className="p-1.5 rounded-md text-slate-500 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                            title="View Details"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          {request.status === 'PENDING' && (
                            <>
                              <button
                                onClick={() => handleApproveRequest(request.advance_id)}
                                className="p-1.5 rounded-md text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 transition-colors"
                                title="Approve"
                              >
                                <CheckCircle className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleRejectRequest(request.advance_id)}
                                className="p-1.5 rounded-md text-slate-500 hover:text-red-600 hover:bg-red-50 transition-colors"
                                title="Reject"
                              >
                                <XCircle className="w-4 h-4" />
                              </button>
                            </>
                          )}
                        </div>
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
      {selectedRequest && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-lg w-full shadow-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-900">Advance Request Details</h2>
              <button onClick={() => setSelectedRequest(null)} className="text-slate-400 hover:text-slate-600">
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-5">
              {/* Staff */}
              <div className="flex items-center gap-3 p-4 bg-slate-50 rounded-lg">
                <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                  <User className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <p className="font-semibold text-slate-900">{selectedRequest.full_name || '—'}</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {selectedRequest.staff_code ? `Staff Code: #${selectedRequest.staff_code}` : 'No staff code assigned'}
                  </p>
                </div>
              </div>

              {/* Key details grid */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-slate-500 mb-1">Amount Requested</p>
                  <p className="font-semibold text-slate-900 text-lg">{formatCurrency(selectedRequest.amount_requested)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-1">Wallet Balance</p>
                  <p className="font-semibold text-slate-900 text-lg">{formatCurrency(selectedRequest.current_balance)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-1">Status</p>
                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${getStatusConfig(selectedRequest.status).bg}`}>
                    {getStatusConfig(selectedRequest.status).icon}
                    {selectedRequest.status}
                  </span>
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-1">Requested On</p>
                  <p className="text-sm text-slate-700">{formatDate(selectedRequest.requested_at)}</p>
                </div>
                {selectedRequest.approved_at && (
                  <div>
                    <p className="text-xs text-slate-500 mb-1">Approved On</p>
                    <p className="text-sm text-slate-700">{formatDate(selectedRequest.approved_at)}</p>
                  </div>
                )}
                {selectedRequest.reviewed_by_name && (
                  <div>
                    <p className="text-xs text-slate-500 mb-1">Reviewed By</p>
                    <div className="flex items-center gap-1.5 text-sm text-slate-700">
                      <BadgeCheck className="w-4 h-4 text-blue-500" />
                      {selectedRequest.reviewed_by_name}
                    </div>
                  </div>
                )}
              </div>

              {/* Rejection reason */}
              {selectedRequest.rejected_reason && (
                <div>
                  <p className="text-xs text-slate-500 mb-1.5">Rejection Reason</p>
                  <p className="text-sm text-slate-700 bg-red-50 border border-red-100 rounded-lg px-4 py-3">
                    {selectedRequest.rejected_reason}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Approve Modal */}
      {showApproveModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-md w-full shadow-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-900">Approve Advance</h2>
              <button onClick={() => setShowApproveModal(false)} className="text-slate-400 hover:text-slate-600">
                <XCircle className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6">
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 flex items-start gap-3 mb-6">
                <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                <p className="text-sm text-emerald-800">
                  This will approve the advance and debit the corresponding amount from the staff member's wallet.
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowApproveModal(false)}
                  className="flex-1 px-4 py-2 text-sm border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmApprove}
                  disabled={actionLoading}
                  className="flex-1 px-4 py-2 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors font-medium disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {actionLoading ? (
                    <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>Processing...</>
                  ) : (
                    <><CheckCircle className="w-4 h-4" />Approve</>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {showRejectModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-md w-full shadow-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-900">Reject Advance</h2>
              <button onClick={() => setShowRejectModal(false)} className="text-slate-400 hover:text-slate-600">
                <XCircle className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6">
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3 mb-6">
                <XCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                <p className="text-sm text-red-800">
                  This will reject the advance request. The staff member will be notified.
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowRejectModal(false)}
                  className="flex-1 px-4 py-2 text-sm border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmReject}
                  disabled={actionLoading}
                  className="flex-1 px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {actionLoading ? (
                    <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>Processing...</>
                  ) : (
                    <><XCircle className="w-4 h-4" />Reject</>
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
