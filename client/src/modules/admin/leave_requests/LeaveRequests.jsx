import React, { useState, useEffect, useMemo } from 'react';
import AdminLayout from '../components/AdminLayout';
import apiClient from '../../../api/api';
import {
  CalendarOff, CheckCircle, XCircle, Clock, Search, Filter, AlertTriangle,
  ArrowLeftRight, CalendarDays, User, Users,
} from 'lucide-react';

const fmt = (d) =>
  d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

const dayCount = (start, end) => {
  if (!start || !end) return 0;
  const ms = new Date(end) - new Date(start);
  return Math.floor(ms / (1000 * 60 * 60 * 24)) + 1;
};

const STATUS_CONFIG = {
  PENDING: { label: 'Pending', badge: 'bg-amber-100 text-amber-800 border-amber-200', icon: Clock },
  APPROVED: { label: 'Approved', badge: 'bg-emerald-100 text-emerald-800 border-emerald-200', icon: CheckCircle },
  REJECTED: { label: 'Rejected', badge: 'bg-rose-100 text-rose-800 border-rose-200', icon: XCircle },
};

const StatusBadge = ({ status }) => {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.PENDING;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${cfg.badge}`}>
      <Icon className="w-3 h-3" />
      {cfg.label}
    </span>
  );
};

const LeaveRequests = () => {
  const [leaves, setLeaves] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('PENDING');

  // Review modal state
  const [reviewLeave, setReviewLeave] = useState(null);
  const [conflicts, setConflicts] = useState([]);
  const [conflictsLoading, setConflictsLoading] = useState(false);
  const [rejectMode, setRejectMode] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [busy, setBusy] = useState(false);

  // Inline swap state
  const [swapConflict, setSwapConflict] = useState(null); // the conflict booking being swapped
  const [candidates, setCandidates] = useState([]);
  const [candidatesLoading, setCandidatesLoading] = useState(false);
  const [candidateSearch, setCandidateSearch] = useState('');
  const [swapBusy, setSwapBusy] = useState(false);
  const [swapError, setSwapError] = useState('');
  const [swappedBookings, setSwappedBookings] = useState({}); // booking_id -> replacement staff name

  useEffect(() => {
    fetchLeaves();
  }, []);

  const fetchLeaves = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await apiClient.getAllLeaves();
      setLeaves(res.data || []);
    } catch (err) {
      console.error('Leave requests fetch error:', err);
      setError(`Failed to fetch leave requests: ${err.message || 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  const counts = useMemo(() => ({
    PENDING: leaves.filter((l) => l.status === 'PENDING').length,
    APPROVED: leaves.filter((l) => l.status === 'APPROVED').length,
    REJECTED: leaves.filter((l) => l.status === 'REJECTED').length,
  }), [leaves]);

  const filteredLeaves = leaves.filter((l) => {
    const matchesSearch =
      !searchTerm ||
      l.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      l.staff_code?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || l.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const filteredCandidates = useMemo(() => {
    const q = candidateSearch.trim().toLowerCase();
    const list = q
      ? candidates.filter((s) =>
          s.full_name?.toLowerCase().includes(q) ||
          s.designation?.toLowerCase().includes(q) ||
          s.staff_code?.toLowerCase().includes(q))
      : candidates;
    // Available staff first, then unavailable
    return [...list].sort((a, b) => Number(a.unavailable) - Number(b.unavailable));
  }, [candidates, candidateSearch]);

  const loadConflicts = async (leaveId) => {
    try {
      setConflictsLoading(true);
      const res = await apiClient.getLeaveConflicts(leaveId);
      setConflicts(res.data?.conflicts || []);
    } catch (err) {
      console.error('getLeaveConflicts error:', err);
    } finally {
      setConflictsLoading(false);
    }
  };

  const openReview = async (leave) => {
    setReviewLeave(leave);
    setRejectMode(false);
    setRejectReason('');
    setConflicts([]);
    setSwapConflict(null);
    setCandidates([]);
    setCandidateSearch('');
    setSwapError('');
    setSwappedBookings({});
    if (leave.status === 'PENDING') {
      await loadConflicts(leave.leave_id);
    }
  };

  const closeReview = () => {
    setReviewLeave(null);
    setConflicts([]);
    setRejectMode(false);
    setRejectReason('');
    setSwapConflict(null);
    setCandidates([]);
    setCandidateSearch('');
    setSwapError('');
    setSwappedBookings({});
  };

  const openSwap = async (conflict) => {
    setSwapConflict(conflict);
    setCandidateSearch('');
    setSwapError('');
    if (candidates.length === 0) {
      try {
        setCandidatesLoading(true);
        const res = await apiClient.getLeaveReplacementCandidates(reviewLeave.leave_id);
        setCandidates(res.data?.candidates || []);
      } catch (err) {
        console.error('getLeaveReplacementCandidates error:', err);
        setSwapError(err.message || 'Failed to load staff list.');
      } finally {
        setCandidatesLoading(false);
      }
    }
  };

  const closeSwap = () => {
    setSwapConflict(null);
    setCandidateSearch('');
    setSwapError('');
  };

  const confirmSwap = async (candidate) => {
    if (candidate.unavailable) return;
    try {
      setSwapBusy(true);
      setSwapError('');
      await apiClient.swapBookingStaff(swapConflict.booking_id, {
        new_staff_id: candidate.staff_profile_id,
        swap_reason: `Replacement for ${reviewLeave.full_name} (approved leave ${fmt(reviewLeave.start_date)} – ${fmt(reviewLeave.end_date)})`,
        new_staff_start_date: reviewLeave.start_date,
      });
      setSwappedBookings((prev) => ({ ...prev, [swapConflict.booking_id]: candidate.full_name }));
      closeSwap();
      // Refresh conflicts + candidate availability now that an assignment changed
      setCandidates([]);
      await loadConflicts(reviewLeave.leave_id);
    } catch (err) {
      console.error('swapBookingStaff error:', err);
      setSwapError(err.message || 'Failed to schedule swap.');
    } finally {
      setSwapBusy(false);
    }
  };

  const handleApprove = async () => {
    try {
      setBusy(true);
      await apiClient.approveLeave(reviewLeave.leave_id);
      closeReview();
      await fetchLeaves();
    } catch (err) {
      console.error('approveLeave error:', err);
      alert(err.message || 'Failed to approve leave.');
    } finally {
      setBusy(false);
    }
  };

  const handleReject = async () => {
    try {
      setBusy(true);
      await apiClient.rejectLeave(reviewLeave.leave_id, rejectReason.trim() || null);
      closeReview();
      await fetchLeaves();
    } catch (err) {
      console.error('rejectLeave error:', err);
      alert(err.message || 'Failed to reject leave.');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <AdminLayout title="Leave Requests" subtitle="Loading...">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
        </div>
      </AdminLayout>
    );
  }

  if (error) {
    return (
      <AdminLayout title="Leave Requests" subtitle="Error occurred">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3">
          <XCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
          <span className="text-red-800 text-sm">{error}</span>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout
      title="Leave Requests"
      subtitle={`${filteredLeaves.length} request${filteredLeaves.length !== 1 ? 's' : ''} — staff time-off requests`}
    >
      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {([
          ['PENDING', 'Pending', 'text-amber-600 border-amber-200'],
          ['APPROVED', 'Approved', 'text-emerald-600 border-emerald-200'],
          ['REJECTED', 'Rejected', 'text-rose-600 border-rose-200'],
        ]).map(([key, label, cls]) => {
          const isActive = statusFilter === key;
          return (
            <button
              key={key}
              onClick={() => setStatusFilter(isActive ? 'all' : key)}
              className={`bg-white rounded-lg border p-4 text-left transition-all hover:shadow-sm ${
                isActive ? `ring-2 ${cls} border-transparent` : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <p className={`text-3xl font-bold ${cls.split(' ')[0]}`}>{counts[key]}</p>
              <p className="text-sm text-slate-500 mt-1">{label}</p>
            </button>
          );
        })}
      </div>

      {/* Search + Filter */}
      <div className="bg-white rounded-lg border border-slate-200 p-4 mb-4 flex flex-col md:flex-row gap-3">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search by staff name or code..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-slate-400" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All</option>
            <option value="PENDING">Pending</option>
            <option value="APPROVED">Approved</option>
            <option value="REJECTED">Rejected</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        {filteredLeaves.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <CalendarOff className="w-10 h-10 text-slate-300" />
            <p className="text-slate-500 text-sm">No leave requests found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  {['Staff', 'Dates', 'Days', 'Reason', 'Requested', 'Status', ''].map((h) => (
                    <th key={h} className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredLeaves.map((leave) => (
                  <tr key={leave.leave_id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4">
                      <p className="text-sm font-semibold text-slate-900">{leave.full_name || '—'}</p>
                      <p className="text-xs text-slate-500 mt-0.5 font-mono">{leave.staff_code || ''}</p>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-700">
                      {fmt(leave.start_date)} <span className="text-slate-400">→</span> {fmt(leave.end_date)}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-700">{dayCount(leave.start_date, leave.end_date)}</td>
                    <td className="px-6 py-4 text-sm text-slate-600 max-w-xs truncate">{leave.reason || '—'}</td>
                    <td className="px-6 py-4 text-sm text-slate-500">{fmt(leave.requested_at)}</td>
                    <td className="px-6 py-4"><StatusBadge status={leave.status} /></td>
                    <td className="px-6 py-4 text-right pr-6">
                      <button
                        onClick={() => openReview(leave)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
                      >
                        {leave.status === 'PENDING' ? 'Review' : 'View'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Review modal */}
      {reviewLeave && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={closeReview} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg border border-slate-200 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-5 border-b border-slate-200 flex items-start justify-between">
              <div>
                <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
                  <User className="w-4 h-4 text-slate-400" />
                  {reviewLeave.full_name}
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  {fmt(reviewLeave.start_date)} → {fmt(reviewLeave.end_date)} · {dayCount(reviewLeave.start_date, reviewLeave.end_date)} day(s)
                </p>
              </div>
              <StatusBadge status={reviewLeave.status} />
            </div>

            <div className="px-6 py-5 space-y-4">
              {reviewLeave.reason && (
                <div>
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Reason</p>
                  <p className="text-sm text-slate-700">{reviewLeave.reason}</p>
                </div>
              )}

              {reviewLeave.status !== 'PENDING' && (
                <div className="text-sm text-slate-600">
                  {reviewLeave.status === 'APPROVED' ? 'Approved' : 'Rejected'} by{' '}
                  <span className="font-medium text-slate-900">{reviewLeave.reviewed_by_name || 'Admin'}</span>
                  {reviewLeave.reviewed_at ? ` on ${fmt(reviewLeave.reviewed_at)}` : ''}.
                  {reviewLeave.status === 'REJECTED' && reviewLeave.rejected_reason && (
                    <span className="block mt-1 text-rose-600">Reason: {reviewLeave.rejected_reason}</span>
                  )}
                </div>
              )}

              {/* Conflicts list (only for pending, when not picking a replacement) */}
              {reviewLeave.status === 'PENDING' && !swapConflict && (
                <div>
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Assignments in this range</p>
                  {conflictsLoading ? (
                    <div className="flex items-center gap-2 text-sm text-slate-500 py-2">
                      <div className="w-4 h-4 border-2 border-slate-300 border-t-transparent rounded-full animate-spin" />
                      Checking assignments...
                    </div>
                  ) : conflicts.length === 0 ? (
                    <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-700">
                      <CheckCircle className="w-4 h-4 flex-shrink-0" />
                      No assignments in this range — safe to approve.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
                        <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                        This staff member is assigned to {conflicts.length} booking{conflicts.length === 1 ? '' : 's'} in this range. Consider scheduling a replacement swap before approving.
                      </div>
                      {conflicts.map((c) => {
                        const swappedTo = swappedBookings[c.booking_id];
                        return (
                          <div key={c.assignment_id} className="rounded-lg border border-slate-200 p-3 flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-slate-900">{c.client_name || '—'}</p>
                              <p className="text-xs text-slate-500 mt-0.5">{c.patient_name || ''} · {c.service_type || ''}</p>
                              <p className="text-xs text-slate-400 mt-0.5">
                                <CalendarDays className="w-3 h-3 inline mr-1" />
                                {fmt(c.service_start_date)} → {c.service_end_date ? fmt(c.service_end_date) : 'Ongoing'}
                              </p>
                            </div>
                            {swappedTo ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 rounded-lg flex-shrink-0">
                                <CheckCircle className="w-3.5 h-3.5" />
                                Swap → {swappedTo}
                              </span>
                            ) : (
                              <button
                                onClick={() => openSwap(c)}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors flex-shrink-0"
                                title="Schedule a replacement swap"
                              >
                                <ArrowLeftRight className="w-3.5 h-3.5" />
                                Schedule swap
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Inline replacement picker */}
              {reviewLeave.status === 'PENDING' && swapConflict && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
                      Replacement for {swapConflict.client_name || 'booking'}
                    </p>
                    <button onClick={closeSwap} className="text-xs font-semibold text-slate-500 hover:text-slate-700">← Back</button>
                  </div>
                  <p className="text-xs text-slate-500 mb-3">
                    Replacement starts {fmt(reviewLeave.start_date)}. Staff already booked or on leave in this range can't be selected.
                  </p>

                  <div className="relative mb-3">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      autoFocus
                      placeholder="Search staff by name, designation, or code..."
                      value={candidateSearch}
                      onChange={(e) => setCandidateSearch(e.target.value)}
                      className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  {swapError && (
                    <div className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-700 mb-3">
                      <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                      {swapError}
                    </div>
                  )}

                  {candidatesLoading ? (
                    <div className="flex items-center gap-2 text-sm text-slate-500 py-4 justify-center">
                      <div className="w-4 h-4 border-2 border-slate-300 border-t-transparent rounded-full animate-spin" />
                      Loading staff...
                    </div>
                  ) : filteredCandidates.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 text-slate-400 gap-2">
                      <Users className="w-7 h-7 text-slate-300" />
                      <p className="text-sm">No staff match your search.</p>
                    </div>
                  ) : (
                    <div className="max-h-72 overflow-y-auto space-y-1.5 pr-1">
                      {filteredCandidates.map((s) => (
                        <div
                          key={s.staff_profile_id}
                          className={`rounded-lg border p-3 flex items-center justify-between gap-3 ${
                            s.unavailable ? 'border-slate-100 bg-slate-50 opacity-70' : 'border-slate-200'
                          }`}
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-slate-900 truncate">{s.full_name}</p>
                            <p className="text-xs text-slate-500 mt-0.5">
                              {s.designation || '—'}{s.staff_code ? ` · ${s.staff_code}` : ''}
                            </p>
                            {s.unavailable && (
                              <p className="text-xs text-amber-600 mt-0.5 flex items-center gap-1">
                                <AlertTriangle className="w-3 h-3 flex-shrink-0" /> {s.unavailable_reason}
                              </p>
                            )}
                          </div>
                          {s.unavailable ? (
                            <span className="text-xs font-semibold text-slate-400 flex-shrink-0">Unavailable</span>
                          ) : (
                            <button
                              onClick={() => confirmSwap(s)}
                              disabled={swapBusy}
                              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 flex-shrink-0"
                            >
                              {swapBusy ? <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : 'Select'}
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Reject reason input */}
              {rejectMode && (
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">Rejection reason</label>
                  <textarea
                    rows={3}
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    placeholder="Let the staff member know why this was rejected..."
                    className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                  />
                </div>
              )}
            </div>

            {reviewLeave.status === 'PENDING' && !swapConflict && (
              <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-200">
                {!rejectMode ? (
                  <>
                    <button
                      onClick={() => setRejectMode(true)}
                      disabled={busy}
                      className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-rose-700 bg-rose-50 rounded-lg hover:bg-rose-100 transition-colors disabled:opacity-50"
                    >
                      <XCircle className="w-4 h-4" />
                      Reject
                    </button>
                    <button
                      onClick={handleApprove}
                      disabled={busy}
                      className="inline-flex items-center gap-2 px-5 py-2 text-white text-sm font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 transition-colors disabled:opacity-50"
                    >
                      {busy ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                      Approve
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => setRejectMode(false)}
                      disabled={busy}
                      className="px-4 py-2 text-sm font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
                    >
                      Back
                    </button>
                    <button
                      onClick={handleReject}
                      disabled={busy}
                      className="inline-flex items-center gap-2 px-5 py-2 text-white text-sm font-semibold rounded-lg bg-rose-600 hover:bg-rose-700 transition-colors disabled:opacity-50"
                    >
                      {busy ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <XCircle className="w-4 h-4" />}
                      Confirm Rejection
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </AdminLayout>
  );
};

export default LeaveRequests;
