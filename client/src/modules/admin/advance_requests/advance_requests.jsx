import React, { useState, useEffect, useMemo } from 'react';
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
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

const ITEMS_PER_PAGE = 10;

const StatusBadge = ({ status }) => {
  const config = {
    PENDING: { bg: 'bg-amber-50 text-amber-700 border-amber-200', icon: <Clock className="w-3 h-3" />, label: 'Pending' },
    APPROVED: { bg: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: <CheckCircle className="w-3 h-3" />, label: 'Approved' },
    REJECTED: { bg: 'bg-red-50 text-red-700 border-red-200', icon: <XCircle className="w-3 h-3" />, label: 'Rejected' },
  }[status] ?? { bg: 'bg-slate-100 text-slate-600 border-slate-200', icon: null, label: status };

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${config.bg}`}>
      {config.icon}
      {config.label}
    </span>
  );
};

const StatCard = ({ label, value, color }) => (
  <div className="bg-white rounded-xl border border-slate-200 px-5 py-4">
    <p className="text-xs font-medium text-slate-500 mb-1">{label}</p>
    <p className={`text-2xl font-bold ${color}`}>{value}</p>
  </div>
);

const AdvanceRequests = () => {
  const navigate = useNavigate();
  const [advanceRequests, setAdvanceRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [showApproveModal, setShowApproveModal] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [selectedRequestId, setSelectedRequestId] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    fetchAdvanceRequests();
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter]);

  const fetchAdvanceRequests = async () => {
    try {
      setLoading(true);
      const response = await apiClient.getAllAdvances();
      setAdvanceRequests(response.data || []);
    } catch (err) {
      console.error('Advance Requests fetch error:', err);
      setError(`Failed to fetch advance requests: ${err.message || 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  const counts = useMemo(() => ({
    all: advanceRequests.length,
    pending: advanceRequests.filter(r => r.status === 'PENDING').length,
    approved: advanceRequests.filter(r => r.status === 'APPROVED').length,
    rejected: advanceRequests.filter(r => r.status === 'REJECTED').length,
  }), [advanceRequests]);

  const filteredRequests = useMemo(() => {
    return advanceRequests.filter(request => {
      const matchesSearch =
        request.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        request.staff_code?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        request.advance_code?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = statusFilter === 'all' || request.status === statusFilter.toUpperCase();
      return matchesSearch && matchesStatus;
    });
  }, [advanceRequests, searchTerm, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredRequests.length / ITEMS_PER_PAGE));
  const pagedRequests = filteredRequests.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  const formatDate = (dateString) => {
    if (!dateString) return '—';
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('en-GB', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  const formatCurrency = (amount) =>
    `Rs. ${parseFloat(amount || 0).toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const handleApproveRequest = (requestId) => {
    setSelectedRequestId(requestId);
    setShowApproveModal(true);
  };

  const handleRejectRequest = (requestId) => {
    setSelectedRequestId(requestId);
    setRejectReason('');
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
      await apiClient.rejectAdvance(selectedRequestId, rejectReason.trim() || null);
      setShowRejectModal(false);
      setSelectedRequestId(null);
      setRejectReason('');
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
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
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
      subtitle={`${counts.all} total request${counts.all !== 1 ? 's' : ''}`}
    >
      {/* Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <StatCard label="Total" value={counts.all} color="text-slate-800" />
        <StatCard label="Pending" value={counts.pending} color="text-amber-600" />
        <StatCard label="Approved" value={counts.approved} color="text-emerald-600" />
        <StatCard label="Rejected" value={counts.rejected} color="text-red-600" />
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-slate-200 px-5 py-3.5 mb-4 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search by name, staff code or advance code..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Filter className="w-4 h-4 text-slate-400" />
          <div className="flex rounded-lg border border-slate-200 overflow-hidden text-sm">
            {[
              { value: 'all', label: 'All' },
              { value: 'pending', label: 'Pending' },
              { value: 'approved', label: 'Approved' },
              { value: 'rejected', label: 'Rejected' },
            ].map(({ value, label }) => (
              <button
                key={value}
                onClick={() => setStatusFilter(value)}
                className={`px-3.5 py-2 font-medium transition-colors ${
                  statusFilter === value
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {pagedRequests.length === 0 ? (
          <div className="py-16 text-center">
            <Wallet className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 text-sm font-medium">No advance requests found</p>
            <p className="text-slate-400 text-xs mt-1">Try adjusting the search or filter</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Staff</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Amount</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Requested</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Reviewed By</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pagedRequests.map((request) => (
                    <tr
                      key={request.advance_id}
                      onClick={() => navigate(`/admin/staff-history/${request.staff_profile_id}?advance_id=${request.advance_id}&amount=${request.amount_requested}&staff_name=${encodeURIComponent(request.full_name || '')}`)}
                      className="hover:bg-slate-50/70 transition-colors cursor-pointer"
                    >
                      {/* Staff */}
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                            <User className="w-4 h-4 text-blue-600" />
                          </div>
                          <div>
                            <p className="font-medium text-slate-900 leading-tight">{request.full_name || '—'}</p>
                            <p className="text-xs text-slate-400 mt-0.5 font-mono">
                              {request.advance_code || (request.staff_code ? `#${request.staff_code}` : '—')}
                            </p>
                          </div>
                        </div>
                      </td>

                      {/* Amount */}
                      <td className="px-5 py-3.5">
                        <p className="font-semibold text-slate-900">{formatCurrency(request.amount_requested)}</p>
                        <p className="text-xs text-slate-400 mt-0.5">Bal: {formatCurrency(request.current_balance)}</p>
                      </td>

                      {/* Date */}
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-1.5 text-slate-600 text-xs">
                          <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          {formatDate(request.requested_at)}
                        </div>
                      </td>

                      {/* Status */}
                      <td className="px-5 py-3.5">
                        <StatusBadge status={request.status} />
                      </td>

                      {/* Reviewed By */}
                      <td className="px-5 py-3.5">
                        {request.reviewed_by_name ? (
                          <div className="flex items-center gap-1.5 text-slate-700 text-xs">
                            <ShieldCheck className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span>{request.reviewed_by_name}</span>
                          </div>
                        ) : (
                          <span className="text-slate-400 text-xs">—</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
                          <button
                            onClick={() => setSelectedRequest(request)}
                            className="p-1.5 rounded-md text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                            title="View Details"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          {request.status === 'PENDING' && (
                            <>
                              <button
                                onClick={() => handleApproveRequest(request.advance_id)}
                                className="p-1.5 rounded-md text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors"
                                title="Approve"
                              >
                                <CheckCircle className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleRejectRequest(request.advance_id)}
                                className="p-1.5 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                                title="Reject"
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

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="px-5 py-3.5 border-t border-slate-100 flex items-center justify-between">
                <p className="text-xs text-slate-500">
                  Showing {((currentPage - 1) * ITEMS_PER_PAGE) + 1}–{Math.min(currentPage * ITEMS_PER_PAGE, filteredRequests.length)} of {filteredRequests.length}
                </p>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="p-1.5 rounded-md text-slate-500 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1)
                    .filter(p => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
                    .reduce((acc, p, i, arr) => {
                      if (i > 0 && p - arr[i - 1] > 1) acc.push('…');
                      acc.push(p);
                      return acc;
                    }, [])
                    .map((p, i) =>
                      p === '…' ? (
                        <span key={`ellipsis-${i}`} className="px-1 text-slate-400 text-sm">…</span>
                      ) : (
                        <button
                          key={p}
                          onClick={() => setCurrentPage(p)}
                          className={`min-w-[32px] h-8 px-2 rounded-md text-sm font-medium transition-colors ${
                            currentPage === p
                              ? 'bg-blue-600 text-white'
                              : 'text-slate-600 hover:bg-slate-100'
                          }`}
                        >
                          {p}
                        </button>
                      )
                    )}
                  <button
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="p-1.5 rounded-md text-slate-500 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Detail Modal */}
      {selectedRequest && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-lg w-full shadow-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-900">Advance Request Details</h2>
              <button onClick={() => setSelectedRequest(null)} className="text-slate-400 hover:text-slate-600 transition-colors">
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-5">
              <div className="flex items-center gap-3 p-4 bg-slate-50 rounded-lg">
                <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                  <User className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <p className="font-semibold text-slate-900">{selectedRequest.full_name || '—'}</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {selectedRequest.staff_code ? `#${selectedRequest.staff_code}` : 'No staff code assigned'}
                  </p>
                </div>
                <div className="ml-auto">
                  <StatusBadge status={selectedRequest.status} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-50 rounded-lg p-3">
                  <p className="text-xs text-slate-500 mb-1">Amount Requested</p>
                  <p className="font-semibold text-slate-900">{formatCurrency(selectedRequest.amount_requested)}</p>
                </div>
                <div className="bg-slate-50 rounded-lg p-3">
                  <p className="text-xs text-slate-500 mb-1">Wallet Balance</p>
                  <p className="font-semibold text-slate-900">{formatCurrency(selectedRequest.current_balance)}</p>
                </div>
                <div className="bg-slate-50 rounded-lg p-3">
                  <p className="text-xs text-slate-500 mb-1">Requested On</p>
                  <p className="text-sm text-slate-700">{formatDate(selectedRequest.requested_at)}</p>
                </div>
                {selectedRequest.approved_at && (
                  <div className="bg-slate-50 rounded-lg p-3">
                    <p className="text-xs text-slate-500 mb-1">
                      {selectedRequest.status === 'APPROVED' ? 'Approved On' : 'Reviewed On'}
                    </p>
                    <p className="text-sm text-slate-700">{formatDate(selectedRequest.approved_at)}</p>
                  </div>
                )}
              </div>

              {selectedRequest.reviewed_by_name && (
                <div className="flex items-center gap-2 text-sm text-slate-700 bg-blue-50 border border-blue-100 rounded-lg px-4 py-3">
                  <BadgeCheck className="w-4 h-4 text-blue-500 shrink-0" />
                  <span>Reviewed by <span className="font-medium">{selectedRequest.reviewed_by_name}</span></span>
                </div>
              )}

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
              <button onClick={() => setShowApproveModal(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
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
                    <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />Processing...</>
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
              <button onClick={() => setShowRejectModal(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                <XCircle className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
                <XCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                <p className="text-sm text-red-800">
                  This will reject the advance request. The staff member will be notified via WhatsApp and SMS.
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Reason <span className="text-slate-400 font-normal">(optional)</span>
                </label>
                <textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="e.g. Insufficient wallet balance to support this advance"
                  rows={3}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent resize-none"
                />
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
                    <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />Processing...</>
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
