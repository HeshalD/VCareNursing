import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import AdminLayout from '../components/AdminLayout';
import apiClient from '../../../api/api';
import {
  User,
  Search,
  Eye,
  CheckCircle,
  XCircle,
  ShieldCheck,
  BadgeCheck,
  ChevronLeft,
  ChevronRight,
  Loader2,
  X,
} from 'lucide-react';

const ITEMS_PER_PAGE = 10;

const STATUS_CONFIG = {
  PENDING:  { dot: 'bg-amber-400',   text: 'text-amber-700',   label: 'Pending' },
  APPROVED: { dot: 'bg-emerald-500', text: 'text-emerald-700', label: 'Approved' },
  REJECTED: { dot: 'bg-red-400',     text: 'text-red-700',     label: 'Rejected' },
};

const StatusBadge = ({ status }) => {
  const cfg = STATUS_CONFIG[status] || { dot: 'bg-slate-400', text: 'text-slate-600', label: status };
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${cfg.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
};

const STATUS_TABS = [
  { value: 'all',      label: 'All' },
  { value: 'pending',  label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
];

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
      <AdminLayout title="Advance Requests" subtitle="Loading…">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
        </div>
      </AdminLayout>
    );
  }

  if (error) {
    return (
      <AdminLayout title="Advance Requests">
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout
      title="Advance Requests"
      subtitle="Review and process staff salary advance requests."
    >
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
        <div className="flex items-center gap-0.5 bg-slate-100 rounded-lg p-1 w-fit flex-wrap">
          {STATUS_TABS.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setStatusFilter(value)}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                statusFilter === value
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {label}
              <span className="ml-1.5 tabular-nums text-slate-400">{counts[value]}</span>
            </button>
          ))}
        </div>

        <div className="relative sm:ml-auto">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            placeholder="Search by name, staff or advance code…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-8 pr-3 py-1.5 text-sm border border-slate-200 rounded-lg bg-white focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none w-64"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {pagedRequests.length === 0 ? (
          <div className="text-center py-16 text-slate-400 text-sm">
            No advance requests match your filters.
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Staff</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Amount</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Requested</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Reviewed By</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pagedRequests.map((request) => (
                    <tr
                      key={request.advance_id}
                      onClick={() => navigate(`/admin/staff-history/${request.staff_profile_id}?advance_id=${request.advance_id}&amount=${request.amount_requested}&staff_name=${encodeURIComponent(request.full_name || '')}`)}
                      className="hover:bg-slate-50 transition-colors cursor-pointer"
                    >
                      {/* Staff */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5 min-w-[160px]">
                          <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0 ring-1 ring-slate-200">
                            <User className="w-4 h-4 text-slate-400" />
                          </div>
                          <div>
                            <p className="font-semibold text-slate-900 leading-tight">{request.full_name || '—'}</p>
                            <p className="text-xs text-slate-400 font-mono">
                              {request.advance_code || (request.staff_code ? `#${request.staff_code}` : '—')}
                            </p>
                          </div>
                        </div>
                      </td>

                      {/* Amount */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <p className="font-semibold text-slate-900 tabular-nums">{formatCurrency(request.amount_requested)}</p>
                        <p className="text-xs text-slate-400 mt-0.5">Bal: {formatCurrency(request.current_balance)}</p>
                      </td>

                      {/* Date */}
                      <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                        {formatDate(request.requested_at)}
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <StatusBadge status={request.status} />
                      </td>

                      {/* Reviewed By */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        {request.reviewed_by_name ? (
                          <div className="flex items-center gap-1.5 text-slate-700 text-xs">
                            <ShieldCheck className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                            <span>{request.reviewed_by_name}</span>
                          </div>
                        ) : (
                          <span className="text-slate-400 text-xs">—</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3">
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
            <div className="border-t border-slate-100 px-4 py-2.5 flex items-center justify-between">
              <p className="text-xs text-slate-400">
                Showing {((currentPage - 1) * ITEMS_PER_PAGE) + 1}–{Math.min(currentPage * ITEMS_PER_PAGE, filteredRequests.length)} of {filteredRequests.length} request{filteredRequests.length !== 1 ? 's' : ''}
              </p>
              {totalPages > 1 && (
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
              )}
            </div>
          </>
        )}
      </div>

      {/* Detail Modal */}
      {selectedRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30" onClick={() => setSelectedRequest(null)} />
          <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-lg border border-slate-200 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
              <h2 className="text-sm font-semibold text-slate-900">Advance Request Details</h2>
              <button onClick={() => setSelectedRequest(null)} className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-md transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-5 py-4 space-y-4">
              <div className="flex items-center gap-2.5 p-4 bg-slate-50 border border-slate-200 rounded-lg">
                <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0 ring-1 ring-slate-200">
                  <User className="w-4 h-4 text-slate-400" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-900">{selectedRequest.full_name || '—'}</p>
                  <p className="text-xs text-slate-400 mt-0.5 font-mono">
                    {selectedRequest.staff_code ? `#${selectedRequest.staff_code}` : 'No staff code assigned'}
                  </p>
                </div>
                <div className="ml-auto">
                  <StatusBadge status={selectedRequest.status} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                  <p className="text-xs text-slate-400 mb-0.5">Amount Requested</p>
                  <p className="text-sm font-semibold text-slate-900">{formatCurrency(selectedRequest.amount_requested)}</p>
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                  <p className="text-xs text-slate-400 mb-0.5">Wallet Balance</p>
                  <p className="text-sm font-semibold text-slate-900">{formatCurrency(selectedRequest.current_balance)}</p>
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                  <p className="text-xs text-slate-400 mb-0.5">Requested On</p>
                  <p className="text-sm text-slate-700">{formatDate(selectedRequest.requested_at)}</p>
                </div>
                {selectedRequest.approved_at && (
                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                    <p className="text-xs text-slate-400 mb-0.5">
                      {selectedRequest.status === 'APPROVED' ? 'Approved On' : 'Reviewed On'}
                    </p>
                    <p className="text-sm text-slate-700">{formatDate(selectedRequest.approved_at)}</p>
                  </div>
                )}
              </div>

              {selectedRequest.reviewed_by_name && (
                <div className="flex items-center gap-2 text-xs text-slate-700 bg-blue-50 border border-blue-200 rounded-lg px-4 py-3">
                  <BadgeCheck className="w-4 h-4 text-blue-500 flex-shrink-0" />
                  <span>Reviewed by <span className="font-medium">{selectedRequest.reviewed_by_name}</span></span>
                </div>
              )}

              {selectedRequest.rejected_reason && (
                <div>
                  <p className="text-xs font-medium text-slate-600 mb-1">Rejection Reason</p>
                  <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30" onClick={() => setShowApproveModal(false)} />
          <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md border border-slate-200 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
              <h2 className="text-sm font-semibold text-slate-900">Approve Advance</h2>
              <button onClick={() => setShowApproveModal(false)} className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-md transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="px-5 py-4">
              <div className="flex items-start gap-2 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3 text-xs text-emerald-800">
                <CheckCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                This will approve the advance and debit the corresponding amount from the staff member's wallet.
              </div>
            </div>
            <div className="flex items-center gap-2 px-5 py-4 border-t border-slate-200 bg-slate-50">
              <button
                onClick={() => setShowApproveModal(false)}
                className="flex-1 px-4 py-2 border border-slate-200 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-100 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmApprove}
                disabled={actionLoading}
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {actionLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <CheckCircle className="w-4 h-4" />
                )}
                {actionLoading ? 'Processing…' : 'Approve'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {showRejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30" onClick={() => setShowRejectModal(false)} />
          <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md border border-slate-200 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
              <h2 className="text-sm font-semibold text-slate-900">Reject Advance</h2>
              <button onClick={() => setShowRejectModal(false)} className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-md transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="px-5 py-4 space-y-4">
              <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-xs text-red-800">
                <XCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                This will reject the advance request. The staff member will be notified via WhatsApp and SMS.
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Reason <span className="text-slate-400 font-normal">(optional)</span>
                </label>
                <textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="e.g. Insufficient wallet balance to support this advance"
                  rows={3}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white text-slate-800 placeholder-slate-400 outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 transition-colors resize-none"
                />
              </div>
            </div>
            <div className="flex items-center gap-2 px-5 py-4 border-t border-slate-200 bg-slate-50">
              <button
                onClick={() => setShowRejectModal(false)}
                className="flex-1 px-4 py-2 border border-slate-200 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-100 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmReject}
                disabled={actionLoading}
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {actionLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <XCircle className="w-4 h-4" />
                )}
                {actionLoading ? 'Processing…' : 'Reject'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
};

export default AdvanceRequests;
