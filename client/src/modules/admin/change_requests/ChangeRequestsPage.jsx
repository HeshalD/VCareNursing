import React, { useState, useEffect, useCallback } from 'react';
import {
  ClipboardList, User, Clock, CheckCircle, XCircle, Eye,
  ChevronRight, AlertCircle, Building2, ArrowRightLeft, History
} from 'lucide-react';
import AdminLayout from '../components/AdminLayout';
import apiClient from '../../../api/api';
import { useAdminAuth } from '../../../context/AdminAuthContext';

const STATUS_TABS = ['PENDING', 'UNDER_REVIEW', 'APPROVED', 'REJECTED'];

const STATUS_CONFIG = {
  PENDING:      { label: 'Pending',      cls: 'bg-amber-100 text-amber-800 border-amber-200' },
  UNDER_REVIEW: { label: 'Under Review', cls: 'bg-blue-100 text-blue-800 border-blue-200' },
  APPROVED:     { label: 'Approved',     cls: 'bg-green-100 text-green-800 border-green-200' },
  REJECTED:     { label: 'Rejected',     cls: 'bg-red-100 text-red-800 border-red-200' },
};

const REQUEST_TYPE_LABELS = {
  PROFILE_UPDATE:     'Profile Update',
  BANK_ACCOUNT_ADD:   'Add Bank Account',
  BANK_ACCOUNT_EDIT:  'Edit Bank Account',
  BANK_ACCOUNT_REMOVE:'Remove Bank Account',
};

const StatusBadge = ({ status }) => {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.PENDING;
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
};

const fmt = (d) => d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

// Renders the requested_changes JSONB in a human-readable way
const DiffDisplay = ({ requestType, changes }) => {
  if (!changes) return <p className="text-sm text-slate-400">No changes data.</p>;

  if (requestType === 'PROFILE_UPDATE' || requestType === 'BANK_ACCOUNT_EDIT') {
    const entries = Object.entries(changes);
    if (entries.length === 0) return null;
    return (
      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase w-1/3">Field</th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase w-1/3">Current Value</th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase w-1/3">Requested Value</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {entries.map(([field, diff]) => (
              <tr key={field}>
                <td className="px-4 py-2.5 font-medium text-slate-600 capitalize">{field.replace(/_/g, ' ')}</td>
                <td className="px-4 py-2.5 text-slate-500">{String(diff?.old_value ?? '—')}</td>
                <td className="px-4 py-2.5 font-semibold text-emerald-700">{String(diff?.new_value ?? '—')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (requestType === 'BANK_ACCOUNT_ADD') {
    return (
      <div className="rounded-lg border border-slate-200 divide-y divide-slate-100">
        {Object.entries(changes).map(([field, value]) => (
          <div key={field} className="flex items-center justify-between px-4 py-2.5">
            <span className="text-sm text-slate-500 capitalize">{field.replace(/_/g, ' ')}</span>
            <span className="text-sm font-medium text-slate-900">{String(value ?? '—')}</span>
          </div>
        ))}
      </div>
    );
  }

  if (requestType === 'BANK_ACCOUNT_REMOVE') {
    return (
      <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 flex items-start gap-3">
        <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
        <p className="text-sm text-rose-700">
          Request to deactivate bank account ID: <span className="font-mono font-semibold">{changes.staff_bank_account_id}</span>
        </p>
      </div>
    );
  }

  return <pre className="text-xs bg-slate-50 rounded p-3 overflow-auto">{JSON.stringify(changes, null, 2)}</pre>;
};

const LOG_ACTION_CONFIG = {
  SUBMITTED:    { cls: 'bg-slate-100 text-slate-700', label: 'Submitted' },
  CLAIMED:      { cls: 'bg-blue-100 text-blue-700',   label: 'Claimed' },
  APPROVED:     { cls: 'bg-green-100 text-green-700', label: 'Approved' },
  REJECTED:     { cls: 'bg-red-100 text-red-700',     label: 'Rejected' },
};

const ChangeRequestsPage = () => {
  const { adminUser } = useAdminAuth();

  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('PENDING');

  const [selectedRequest, setSelectedRequest] = useState(null);
  const [logs, setLogs] = useState([]);
  const [logsLoading, setLogsLoading] = useState(false);

  const [actionLoading, setActionLoading] = useState(false);
  const [reviewNotes, setReviewNotes] = useState('');
  const [actionError, setActionError] = useState(null);

  const fetchRequests = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.getAllChangeRequests({ status: statusFilter });
      setRequests(res.data || []);
    } catch (err) {
      console.error('ChangeRequests fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { fetchRequests(); }, [fetchRequests]);

  const openDetail = async (req) => {
    setSelectedRequest(req);
    setReviewNotes('');
    setActionError(null);
    setLogsLoading(true);
    try {
      const res = await apiClient.getChangeRequestLogs(req.request_id);
      setLogs(res.data || []);
    } catch {
      setLogs([]);
    } finally {
      setLogsLoading(false);
    }
  };

  const closeDetail = () => { setSelectedRequest(null); setLogs([]); setActionError(null); };

  const handleClaim = async () => {
    setActionLoading(true);
    setActionError(null);
    try {
      await apiClient.claimChangeRequest(selectedRequest.request_id);
      await fetchRequests();
      // Re-open with fresh data
      const updated = requests.find(r => r.request_id === selectedRequest.request_id);
      if (updated) openDetail(updated);
      else closeDetail();
    } catch (err) {
      setActionError(err.message || 'Failed to claim request.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleResolve = async (action) => {
    setActionLoading(true);
    setActionError(null);
    try {
      await apiClient.resolveChangeRequest(selectedRequest.request_id, { action, review_notes: reviewNotes });
      await fetchRequests();
      closeDetail();
    } catch (err) {
      setActionError(err.message || 'Failed to resolve request.');
    } finally {
      setActionLoading(false);
    }
  };

  const currentAdminId = adminUser?.id || adminUser?.user_id;
  const isMyReview = selectedRequest?.reviewer_user_id === currentAdminId;

  return (
    <AdminLayout
      title="Change Requests"
      subtitle={`${requests.length} ${STATUS_CONFIG[statusFilter]?.label.toLowerCase() || ''} request${requests.length !== 1 ? 's' : ''}`}
    >
      {/* Status Tabs */}
      <div className="flex space-x-1 bg-slate-200 p-1 rounded-xl w-fit mb-6">
        {STATUS_TABS.map(s => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${statusFilter === s ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            {STATUS_CONFIG[s].label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
          </div>
        ) : requests.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 gap-3">
            <ClipboardList className="w-10 h-10 text-slate-300" />
            <p className="text-slate-500 text-sm">No {STATUS_CONFIG[statusFilter].label.toLowerCase()} requests</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  {['Staff Name', 'Request Type', 'Submitted', 'Status', 'Reviewer', ''].map(h => (
                    <th key={h} className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {requests.map(req => (
                  <tr key={req.request_id} className="hover:bg-slate-50 transition-colors cursor-pointer" onClick={() => openDetail(req)}>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0">
                          <User className="w-4 h-4 text-slate-500" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-slate-900">{req.staff_name}</p>
                          <p className="text-xs text-slate-400">{req.staff_mobile}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {req.change_request_code && (
                        <p className="text-xs font-mono font-medium text-slate-400 mb-0.5">{req.change_request_code}</p>
                      )}
                      <span className="text-sm text-slate-700">{REQUEST_TYPE_LABELS[req.request_type] || req.request_type}</span>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-500">{fmt(req.created_at)}</td>
                    <td className="px-6 py-4"><StatusBadge status={req.status} /></td>
                    <td className="px-6 py-4 text-sm text-slate-600">{req.reviewer_name || '—'}</td>
                    <td className="px-6 py-4 text-right">
                      <Eye className="w-4 h-4 text-slate-400 inline" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Detail Drawer */}
      {selectedRequest && (
        <div className="fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <div className="flex-1 bg-black/40" onClick={closeDetail} />

          {/* Panel */}
          <div className="w-full max-w-2xl bg-white shadow-2xl flex flex-col overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 flex-shrink-0">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Change Request Detail</h2>
                <p className="text-sm font-mono font-semibold text-slate-700 mt-0.5">
                  {selectedRequest.change_request_code || selectedRequest.request_id}
                </p>
                {selectedRequest.change_request_code && (
                  <p className="text-xs text-slate-400 font-mono">{selectedRequest.request_id}</p>
                )}
              </div>
              <button onClick={closeDetail} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100">
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Staff + Meta */}
              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-lg border border-slate-200 p-4">
                  <p className="text-xs font-semibold text-slate-400 uppercase mb-2">Staff Member</p>
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center">
                      <User className="w-4 h-4 text-slate-500" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{selectedRequest.staff_name}</p>
                      <p className="text-xs text-slate-400">{selectedRequest.staff_mobile}</p>
                    </div>
                  </div>
                </div>
                <div className="rounded-lg border border-slate-200 p-4 space-y-2">
                  <p className="text-xs font-semibold text-slate-400 uppercase mb-2">Request Info</p>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">Type</span>
                    <span className="font-medium">{REQUEST_TYPE_LABELS[selectedRequest.request_type]}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">Status</span>
                    <StatusBadge status={selectedRequest.status} />
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">Submitted</span>
                    <span className="text-slate-700">{fmt(selectedRequest.created_at)}</span>
                  </div>
                </div>
              </div>

              {/* Requested Changes */}
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase mb-3">Requested Changes</p>
                <DiffDisplay
                  requestType={selectedRequest.request_type}
                  changes={selectedRequest.requested_changes}
                />
              </div>

              {/* Review Notes (if resolved) */}
              {selectedRequest.review_notes && (
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                  <p className="text-xs font-semibold text-slate-400 uppercase mb-1">Review Notes</p>
                  <p className="text-sm text-slate-700 italic">"{selectedRequest.review_notes}"</p>
                </div>
              )}

              {/* Action Area */}
              {actionError && (
                <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 flex items-center gap-3">
                  <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />
                  <p className="text-sm text-rose-700">{actionError}</p>
                </div>
              )}

              {selectedRequest.status === 'PENDING' && (
                <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 flex items-center justify-between gap-4">
                  <p className="text-sm text-blue-700">Claim this request to start the review. No one else will be able to review it once claimed.</p>
                  <button
                    onClick={handleClaim}
                    disabled={actionLoading}
                    className="flex-shrink-0 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
                  >
                    {actionLoading ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <ClipboardList className="w-4 h-4" />}
                    Claim Review
                  </button>
                </div>
              )}

              {selectedRequest.status === 'UNDER_REVIEW' && !isMyReview && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 flex items-center gap-3">
                  <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                  <p className="text-sm text-amber-700">
                    This request is currently being reviewed by <span className="font-semibold">{selectedRequest.reviewer_name}</span>.
                  </p>
                </div>
              )}

              {selectedRequest.status === 'UNDER_REVIEW' && isMyReview && (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-4">
                  <p className="text-xs font-semibold text-slate-500 uppercase">Your Decision</p>
                  <textarea
                    rows={3}
                    value={reviewNotes}
                    onChange={e => setReviewNotes(e.target.value)}
                    placeholder="Add review notes (optional)..."
                    className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none bg-white"
                  />
                  <div className="flex gap-3">
                    <button
                      onClick={() => handleResolve('REJECT')}
                      disabled={actionLoading}
                      className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg border border-red-300 bg-white px-4 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50 transition-colors"
                    >
                      {actionLoading ? <div className="w-4 h-4 border-2 border-red-600 border-t-transparent rounded-full animate-spin" /> : <XCircle className="w-4 h-4" />}
                      Reject
                    </button>
                    <button
                      onClick={() => handleResolve('APPROVE')}
                      disabled={actionLoading}
                      className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
                    >
                      {actionLoading ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                      Approve & Apply
                    </button>
                  </div>
                </div>
              )}

              {/* Audit Log */}
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase mb-3 flex items-center gap-2">
                  <History className="w-3.5 h-3.5" /> Audit Log
                </p>
                {logsLoading ? (
                  <div className="flex justify-center py-4">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-slate-400" />
                  </div>
                ) : logs.length === 0 ? (
                  <p className="text-sm text-slate-400">No log entries.</p>
                ) : (
                  <div className="space-y-2">
                    {logs.map(log => {
                      const cfg = LOG_ACTION_CONFIG[log.action] || { cls: 'bg-slate-100 text-slate-700', label: log.action };
                      return (
                        <div key={log.log_id} className="flex items-start gap-3 rounded-lg border border-slate-100 px-4 py-3">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold flex-shrink-0 mt-0.5 ${cfg.cls}`}>
                            {cfg.label}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-slate-700">by <span className="font-semibold">{log.performed_by_name}</span></p>
                            {log.notes && <p className="text-xs text-slate-500 mt-0.5 italic">"{log.notes}"</p>}
                          </div>
                          <span className="text-xs text-slate-400 flex-shrink-0">{fmt(log.created_at)}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
};

export default ChangeRequestsPage;
