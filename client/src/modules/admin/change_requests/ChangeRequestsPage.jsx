import React, { useState, useEffect, useCallback } from 'react';
import {
  ClipboardList, User, CheckCircle, X,
  AlertCircle, History, Loader2, ChevronRight
} from 'lucide-react';
import AdminLayout from '../components/AdminLayout';
import apiClient from '../../../api/api';
import { formatMobileNumber } from '../../../utils/phoneFormat';
import { useAdminAuth } from '../../../context/AdminAuthContext';

const STATUS_TABS = ['PENDING', 'UNDER_REVIEW', 'APPROVED', 'REJECTED'];

const STATUS_CONFIG = {
  PENDING:      { dot: 'bg-amber-400',   text: 'text-amber-700',   label: 'Pending' },
  UNDER_REVIEW: { dot: 'bg-blue-400',    text: 'text-blue-700',    label: 'Under Review' },
  APPROVED:     { dot: 'bg-emerald-500', text: 'text-emerald-700', label: 'Approved' },
  REJECTED:     { dot: 'bg-red-400',     text: 'text-red-700',     label: 'Rejected' },
};

const LOG_ACTION_CONFIG = {
  SUBMITTED: { dot: 'bg-slate-400',   text: 'text-slate-600',   label: 'Submitted' },
  CLAIMED:   { dot: 'bg-blue-400',    text: 'text-blue-700',    label: 'Claimed' },
  APPROVED:  { dot: 'bg-emerald-500', text: 'text-emerald-700', label: 'Approved' },
  REJECTED:  { dot: 'bg-red-400',     text: 'text-red-700',     label: 'Rejected' },
};

const REQUEST_TYPE_LABELS = {
  PROFILE_UPDATE:     'Profile Update',
  BANK_ACCOUNT_ADD:   'Add Bank Account',
  BANK_ACCOUNT_EDIT:  'Edit Bank Account',
  BANK_ACCOUNT_REMOVE:'Remove Bank Account',
};

const StatusDot = ({ config, status }) => {
  const cfg = config[status] || { dot: 'bg-slate-400', text: 'text-slate-600', label: status || '—' };
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${cfg.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
};

const fmt = (d) => d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

const SectionHeader = ({ title }) => (
  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">{title}</p>
);

const primaryBtnCls = 'inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed';

// Renders the requested_changes JSONB in a human-readable way
const DiffDisplay = ({ requestType, changes }) => {
  if (!changes) return <p className="text-sm text-slate-400">No changes data.</p>;

  if (requestType === 'PROFILE_UPDATE' || requestType === 'BANK_ACCOUNT_EDIT') {
    const entries = Object.entries(changes);
    if (entries.length === 0) return null;
    return (
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide w-1/3">Field</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide w-1/3">Current Value</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide w-1/3">Requested Value</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {entries.map(([field, diff]) => (
              <tr key={field}>
                <td className="px-4 py-2.5 font-medium text-slate-600 capitalize">{field.replace(/_/g, ' ')}</td>
                <td className="px-4 py-2.5 text-slate-500">{String(diff?.old_value ?? '—')}</td>
                <td className="px-4 py-2.5 font-medium text-emerald-700">{String(diff?.new_value ?? '—')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (requestType === 'BANK_ACCOUNT_ADD') {
    return (
      <div className="bg-white border border-slate-200 rounded-lg divide-y divide-slate-100">
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
      <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 flex items-start gap-3">
        <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
        <p className="text-sm text-red-700">
          Request to deactivate bank account ID: <span className="font-mono font-semibold">{changes.staff_bank_account_id}</span>
        </p>
      </div>
    );
  }

  return <pre className="text-xs bg-slate-50 border border-slate-200 rounded-lg p-3 overflow-auto">{JSON.stringify(changes, null, 2)}</pre>;
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
      {/* Status tabs */}
      <div className="flex gap-0.5 bg-slate-100 rounded-lg p-1 w-fit mb-4">
        {STATUS_TABS.map(s => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
              statusFilter === s ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {STATUS_CONFIG[s].label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
          </div>
        ) : requests.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 gap-3">
            <ClipboardList className="w-8 h-8 text-slate-200" />
            <p className="text-sm text-slate-400">No {STATUS_CONFIG[statusFilter].label.toLowerCase()} requests</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Staff Name</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Request Type</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Submitted</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Reviewer</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {requests.map(req => (
                  <tr key={req.request_id} className="hover:bg-slate-50 cursor-pointer transition-colors" onClick={() => openDetail(req)}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0 ring-1 ring-slate-200">
                          <User className="w-4 h-4 text-slate-400" />
                        </div>
                        <div>
                          <p className="font-semibold text-slate-900 leading-tight">{req.staff_name}</p>
                          <p className="text-xs text-slate-400">{formatMobileNumber(req.staff_mobile)}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {req.change_request_code && (
                        <p className="text-xs font-mono text-slate-400 mb-0.5">{req.change_request_code}</p>
                      )}
                      <span className="text-slate-700">{REQUEST_TYPE_LABELS[req.request_type] || req.request_type}</span>
                    </td>
                    <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{fmt(req.created_at)}</td>
                    <td className="px-4 py-3 whitespace-nowrap"><StatusDot config={STATUS_CONFIG} status={req.status} /></td>
                    <td className="px-4 py-3 text-slate-600">{req.reviewer_name || '—'}</td>
                    <td className="px-4 py-3 text-right">
                      <ChevronRight className="w-4 h-4 text-slate-300 ml-auto" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!loading && requests.length > 0 && (
          <div className="border-t border-slate-100 px-4 py-2.5 text-xs text-slate-400">
            Showing {requests.length} request{requests.length !== 1 ? 's' : ''}
          </div>
        )}
      </div>

      {/* Detail Drawer */}
      {selectedRequest && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/30" onClick={closeDetail} />

          <div className="w-full max-w-2xl bg-white flex flex-col shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 flex-shrink-0">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">Change Request Detail</h2>
                <p className="text-xs font-mono text-slate-500 mt-0.5">
                  {selectedRequest.change_request_code || selectedRequest.request_id}
                </p>
              </div>
              <button onClick={closeDetail} className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-md transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
              {/* Staff + Meta */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-50 border border-slate-100 rounded-lg p-3.5">
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-2">Staff Member</p>
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center ring-1 ring-slate-200">
                      <User className="w-4 h-4 text-slate-400" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{selectedRequest.staff_name}</p>
                      <p className="text-xs text-slate-400">{formatMobileNumber(selectedRequest.staff_mobile)}</p>
                    </div>
                  </div>
                </div>
                <div className="bg-slate-50 border border-slate-100 rounded-lg p-3.5 space-y-1.5">
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Request Info</p>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">Type</span>
                    <span className="font-medium text-slate-800">{REQUEST_TYPE_LABELS[selectedRequest.request_type]}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-slate-500">Status</span>
                    <StatusDot config={STATUS_CONFIG} status={selectedRequest.status} />
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">Submitted</span>
                    <span className="text-slate-700">{fmt(selectedRequest.created_at)}</span>
                  </div>
                </div>
              </div>

              {/* Requested Changes */}
              <div>
                <SectionHeader title="Requested Changes" />
                <DiffDisplay
                  requestType={selectedRequest.request_type}
                  changes={selectedRequest.requested_changes}
                />
              </div>

              {/* Review Notes (if resolved) */}
              {selectedRequest.review_notes && (
                <div>
                  <SectionHeader title="Review Notes" />
                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                    <p className="text-sm text-slate-700 italic">"{selectedRequest.review_notes}"</p>
                  </div>
                </div>
              )}

              {/* Action Area */}
              {actionError && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 flex items-center gap-3">
                  <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                  <p className="text-sm text-red-700">{actionError}</p>
                </div>
              )}

              {selectedRequest.status === 'PENDING' && (
                <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 flex items-center justify-between gap-4">
                  <p className="text-sm text-blue-700">Claim this request to start the review. No one else will be able to review it once claimed.</p>
                  <button onClick={handleClaim} disabled={actionLoading} className={`${primaryBtnCls} flex-shrink-0`}>
                    {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ClipboardList className="w-4 h-4" />}
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
                <div>
                  <SectionHeader title="Your Decision" />
                  <textarea
                    rows={3}
                    value={reviewNotes}
                    onChange={e => setReviewNotes(e.target.value)}
                    placeholder="Add review notes (optional)…"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 resize-none bg-white"
                  />
                  <div className="flex gap-2 mt-3">
                    <button
                      onClick={() => handleResolve('REJECT')}
                      disabled={actionLoading}
                      className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />}
                      Reject
                    </button>
                    <button
                      onClick={() => handleResolve('APPROVE')}
                      disabled={actionLoading}
                      className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                      Approve &amp; Apply
                    </button>
                  </div>
                </div>
              )}

              {/* Audit Log */}
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <History className="w-3.5 h-3.5" /> Audit Log
                </p>
                {logsLoading ? (
                  <div className="flex justify-center py-4">
                    <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
                  </div>
                ) : logs.length === 0 ? (
                  <p className="text-sm text-slate-400">No log entries.</p>
                ) : (
                  <div className="space-y-1.5">
                    {logs.map(log => (
                      <div key={log.log_id} className="flex items-start gap-3 rounded-lg border border-slate-100 px-4 py-2.5">
                        <div className="flex-shrink-0 mt-0.5">
                          <StatusDot config={LOG_ACTION_CONFIG} status={log.action} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-slate-700">by <span className="font-semibold">{log.performed_by_name}</span></p>
                          {log.notes && <p className="text-xs text-slate-500 mt-0.5 italic">"{log.notes}"</p>}
                        </div>
                        <span className="text-xs text-slate-400 flex-shrink-0">{fmt(log.created_at)}</span>
                      </div>
                    ))}
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
