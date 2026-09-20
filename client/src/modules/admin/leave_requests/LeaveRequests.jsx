import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import AdminLayout from '../components/AdminLayout';
import apiClient from '../../../api/api';
import {
  CheckCircle, XCircle, Search, AlertTriangle,
  ArrowLeftRight, CalendarDays, User, Loader2, X,
  Plus, LogIn, ChevronDown, CalendarPlus,
} from 'lucide-react';

const fmt = (d) =>
  d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

const dayCount = (start, end) => {
  if (!start || !end) return 0;
  const ms = new Date(end) - new Date(start);
  return Math.floor(ms / (1000 * 60 * 60 * 24)) + 1;
};

const STATUS_CONFIG = {
  PENDING:  { dot: 'bg-amber-400',   text: 'text-amber-700',   label: 'Pending' },
  APPROVED: { dot: 'bg-emerald-500', text: 'text-emerald-700', label: 'Approved' },
  REJECTED: { dot: 'bg-red-400',     text: 'text-red-700',     label: 'Rejected' },
};

const StatusBadge = ({ status }) => {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.PENDING;
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${cfg.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
};

// Colour-coded "time left" badge for staff currently on leave. Hotter colour = sooner
// they're due back; anything beyond 5 days falls back to a neutral pill.
const EXPIRY_BADGES = [
  { label: 'Expires today',    cls: 'bg-red-100 text-red-700 ring-red-200' },
  { label: 'Expires tomorrow', cls: 'bg-orange-100 text-orange-700 ring-orange-200' },
  { label: 'Expires in 2 days', cls: 'bg-amber-100 text-amber-700 ring-amber-200' },
  { label: 'Expires in 3 days', cls: 'bg-yellow-100 text-yellow-700 ring-yellow-200' },
  { label: 'Expires in 4 days', cls: 'bg-sky-100 text-sky-700 ring-sky-200' },
  { label: 'Expires in 5 days', cls: 'bg-blue-100 text-blue-700 ring-blue-200' },
];

const ExpiryBadge = ({ daysRemaining }) => {
  const n = Math.max(0, Number(daysRemaining));
  const cfg = EXPIRY_BADGES[n] || { label: `Expires in ${n} days`, cls: 'bg-slate-100 text-slate-600 ring-slate-200' };
  return (
    <span className={`inline-block rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
};

const StaffLink = ({ id, children }) =>
  id ? (
    <Link to={`/admin/staff/${id}/detail`} className="hover:text-blue-600 hover:underline transition-colors">
      {children}
    </Link>
  ) : (
    <>{children}</>
  );

const STATUS_TABS = ['All', 'Pending', 'Approved', 'Rejected'];
const TAB_TO_STATUS = { Pending: 'PENDING', Approved: 'APPROVED', Rejected: 'REJECTED' };

const VIEW_TABS = ['Requests', 'On Leave', 'Expired'];

const addDays = (iso, n) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

const diffDays = (fromISO, toISO) =>
  Math.round((new Date(`${toISO}T00:00:00Z`) - new Date(`${fromISO}T00:00:00Z`)) / 86400000);

const todayISO = () => {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

// An approved leave is expired once its end date has passed or the staff member was
// reported back (early or on schedule).
const isExpiredLeave = (l, today) =>
  l.status === 'APPROVED' && (Boolean(l.actual_return_date) || (l.end_date && l.end_date < today));

const LeaveRequests = () => {
  const [view, setView] = useState('Requests');
  const [leaves, setLeaves] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('PENDING');

  // On Leave tab
  const [onLeaveStaff, setOnLeaveStaff] = useState([]);
  const [onLeaveLoading, setOnLeaveLoading] = useState(false);
  const [returningId, setReturningId] = useState(null);

  // Extend leave modal (Expired tab)
  const [extendLeave, setExtendLeave] = useState(null);
  const [extendDate, setExtendDate] = useState('');
  const [extendMin, setExtendMin] = useState('');
  const [extendDays, setExtendDays] = useState('');
  const [extendBusy, setExtendBusy] = useState(false);
  const [extendError, setExtendError] = useState('');

  // Log Leave (admin-create) modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [staffOptions, setStaffOptions] = useState([]);
  const [staffOptionsLoading, setStaffOptionsLoading] = useState(false);
  const [staffPickerOpen, setStaffPickerOpen] = useState(false);
  const [staffPickerSearch, setStaffPickerSearch] = useState('');
  const [selectedStaff, setSelectedStaff] = useState(null);
  const [newLeave, setNewLeave] = useState({ start_date: '', end_date: '', reason: '' });
  const [addBusy, setAddBusy] = useState(false);
  const [addError, setAddError] = useState('');

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
    fetchOnLeaveStaff();
  }, []);

  useEffect(() => {
    if (view === 'On Leave') fetchOnLeaveStaff();
  }, [view]);

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

  const fetchOnLeaveStaff = async () => {
    try {
      setOnLeaveLoading(true);
      const res = await apiClient.getOnLeaveStaff();
      setOnLeaveStaff(res.data || []);
    } catch (err) {
      console.error('On-leave staff fetch error:', err);
    } finally {
      setOnLeaveLoading(false);
    }
  };

  const openAddModal = async () => {
    setShowAddModal(true);
    setAddError('');
    setSelectedStaff(null);
    setStaffPickerSearch('');
    setNewLeave({ start_date: '', end_date: '', reason: '' });
    if (staffOptions.length === 0) {
      try {
        setStaffOptionsLoading(true);
        const res = await apiClient.getLeaveStaffOptions();
        setStaffOptions(res.data || []);
      } catch (err) {
        console.error('getLeaveStaffOptions error:', err);
        setAddError(err.message || 'Failed to load staff list.');
      } finally {
        setStaffOptionsLoading(false);
      }
    }
  };

  const closeAddModal = () => {
    setShowAddModal(false);
    setStaffPickerOpen(false);
  };

  const filteredStaffOptions = useMemo(() => {
    const q = staffPickerSearch.trim().toLowerCase();
    if (!q) return staffOptions;
    return staffOptions.filter((s) =>
      s.full_name?.toLowerCase().includes(q) ||
      s.designation?.toLowerCase().includes(q) ||
      s.staff_code?.toLowerCase().includes(q));
  }, [staffOptions, staffPickerSearch]);

  const submitAddLeave = async () => {
    if (!selectedStaff || !newLeave.start_date || !newLeave.end_date) {
      setAddError('Please select a staff member and both dates.');
      return;
    }
    try {
      setAddBusy(true);
      setAddError('');
      await apiClient.adminCreateLeave({
        staff_profile_id: selectedStaff.staff_profile_id,
        start_date: newLeave.start_date,
        end_date: newLeave.end_date,
        reason: newLeave.reason.trim() || null,
      });
      closeAddModal();
      await fetchLeaves();
      if (view === 'On Leave') await fetchOnLeaveStaff();
    } catch (err) {
      console.error('adminCreateLeave error:', err);
      setAddError(err.message || 'Failed to log leave.');
    } finally {
      setAddBusy(false);
    }
  };

  const handleReportBack = async (leave) => {
    try {
      setReturningId(leave.leave_id);
      await apiClient.reportLeaveBack(leave.leave_id);
      await fetchOnLeaveStaff();
      await fetchLeaves();
    } catch (err) {
      console.error('reportLeaveBack error:', err);
      alert(err.message || 'Failed to report staff back.');
    } finally {
      setReturningId(null);
    }
  };

  const openExtend = (leave) => {
    const next = new Date(`${leave.end_date}T00:00:00`);
    next.setDate(next.getDate() + 1);
    const pad = (n) => String(n).padStart(2, '0');
    const nextISO = `${next.getFullYear()}-${pad(next.getMonth() + 1)}-${pad(next.getDate())}`;
    const today = todayISO();
    const minDate = nextISO > today ? nextISO : today;
    setExtendLeave(leave);
    setExtendDate(minDate);
    setExtendMin(minDate);
    setExtendDays(String(diffDays(leave.end_date, minDate)));
    setExtendError('');
  };

  // Days and date are two views of the same value: days counts from the leave's current
  // end date, so editing either one recalculates the other.
  const handleExtendDaysChange = (value) => {
    setExtendDays(value);
    const n = parseInt(value, 10);
    if (Number.isInteger(n) && n > 0) setExtendDate(addDays(extendLeave.end_date, n));
  };

  const handleExtendDateChange = (value) => {
    setExtendDate(value);
    setExtendDays(value ? String(diffDays(extendLeave.end_date, value)) : '');
  };

  const submitExtend = async () => {
    if (!extendDate) {
      setExtendError('Please choose a new end date.');
      return;
    }
    try {
      setExtendBusy(true);
      setExtendError('');
      await apiClient.extendLeave(extendLeave.leave_id, extendDate);
      setExtendLeave(null);
      await fetchLeaves();
      await fetchOnLeaveStaff();
    } catch (err) {
      console.error('extendLeave error:', err);
      setExtendError(err.message || 'Failed to extend leave.');
    } finally {
      setExtendBusy(false);
    }
  };

  const counts = useMemo(() => ({
    All: leaves.length,
    Pending: leaves.filter((l) => l.status === 'PENDING').length,
    Approved: leaves.filter((l) => l.status === 'APPROVED').length,
    Rejected: leaves.filter((l) => l.status === 'REJECTED').length,
  }), [leaves]);

  const expiredLeaves = useMemo(() => {
    const today = todayISO();
    const q = searchTerm.toLowerCase();
    return leaves
      .filter((l) => isExpiredLeave(l, today))
      .filter((l) => !q || l.full_name?.toLowerCase().includes(q) || l.staff_code?.toLowerCase().includes(q))
      .sort((a, b) => (b.actual_return_date || b.end_date).localeCompare(a.actual_return_date || a.end_date));
  }, [leaves, searchTerm]);

  const expiredCount = useMemo(() => {
    const today = todayISO();
    return leaves.filter((l) => isExpiredLeave(l, today)).length;
  }, [leaves]);

  const activeTab = statusFilter === 'all'
    ? 'All'
    : STATUS_TABS.find((t) => TAB_TO_STATUS[t] === statusFilter) || 'All';

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
      <AdminLayout title="Staff Leaves" subtitle="Loading…">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
        </div>
      </AdminLayout>
    );
  }

  if (error) {
    return (
      <AdminLayout title="Staff Leaves">
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout
      title="Staff Leaves"
      subtitle="Leave requests, staff currently on leave, and expired leaves."
    >
      {/* View switch + actions */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
        <div className="flex items-center gap-0.5 bg-slate-100 rounded-lg p-1 w-fit">
          {VIEW_TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setView(tab)}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                view === tab ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {tab}
              {tab === 'On Leave' && onLeaveStaff.length > 0 && (
                <span className="ml-1.5 tabular-nums text-slate-400">{onLeaveStaff.length}</span>
              )}
              {tab === 'Expired' && expiredCount > 0 && (
                <span className="ml-1.5 tabular-nums text-slate-400">{expiredCount}</span>
              )}
            </button>
          ))}
        </div>

        <button
          onClick={openAddModal}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-500 transition-colors sm:ml-auto"
        >
          <Plus className="w-3.5 h-3.5" />
          Log Leave
        </button>
      </div>

      {view === 'Requests' && (
        <>
          {/* Toolbar */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
            <div className="flex items-center gap-0.5 bg-slate-100 rounded-lg p-1 w-fit flex-wrap">
              {STATUS_TABS.map((tab) => (
                <button
                  key={tab}
                  onClick={() => setStatusFilter(tab === 'All' ? 'all' : TAB_TO_STATUS[tab])}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                    activeTab === tab
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {tab}
                  <span className="ml-1.5 tabular-nums text-slate-400">{counts[tab]}</span>
                </button>
              ))}
            </div>

            <div className="relative sm:ml-auto">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                placeholder="Search by staff name or code…"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8 pr-3 py-1.5 text-sm border border-slate-200 rounded-lg bg-white focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none w-64"
              />
            </div>
          </div>

          {/* Table */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            {filteredLeaves.length === 0 ? (
              <div className="text-center py-16 text-slate-400 text-sm">
                No leave requests match your filters.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50">
                      {['Staff', 'Dates', 'Days', 'Reason', 'Requested', 'Status', ''].map((h) => (
                        <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredLeaves.map((leave) => (
                      <tr key={leave.leave_id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3">
                          <p className="font-semibold text-slate-900 leading-tight"><StaffLink id={leave.staff_profile_id}>{leave.full_name || '—'}</StaffLink></p>
                          <p className="text-xs text-slate-400 mt-0.5 font-mono"><StaffLink id={leave.staff_profile_id}>{leave.staff_code || ''}</StaffLink>{leave.gender ?` · ${leave.gender === 'MALE' ? 'Male' : leave.gender === 'FEMALE' ? 'Female' : leave.gender}` : ''}</p>
                        </td>
                        <td className="px-4 py-3 text-slate-700 whitespace-nowrap">
                          {fmt(leave.start_date)} <span className="text-slate-400">→</span> {fmt(leave.end_date)}
                          {leave.actual_return_date && (
                            <span className="block text-xs text-emerald-600 mt-0.5">Returned {fmt(leave.actual_return_date)}</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate-700 tabular-nums">{dayCount(leave.start_date, leave.end_date)}</td>
                        <td className="px-4 py-3 text-slate-600 max-w-xs truncate">{leave.reason || '—'}</td>
                        <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                          {fmt(leave.requested_at)}
                          {leave.source === 'ADMIN' && (
                            <span className="block text-xs text-slate-400 mt-0.5">Logged by admin</span>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap"><StatusBadge status={leave.status} /></td>
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => openReview(leave)}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-blue-600 border border-slate-200 rounded-lg hover:bg-blue-50 hover:border-blue-200 transition-colors"
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

            {filteredLeaves.length > 0 && (
              <div className="border-t border-slate-100 px-4 py-2.5 text-xs text-slate-400">
                Showing {filteredLeaves.length} of {leaves.length} request{leaves.length !== 1 ? 's' : ''}
              </div>
            )}
          </div>
        </>
      )}

      {view === 'On Leave' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          {onLeaveLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
            </div>
          ) : onLeaveStaff.length === 0 ? (
            <div className="text-center py-16 text-slate-400 text-sm">
              No staff members are currently on leave.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    {['Staff', 'Leave Period', 'Expires', 'Reason', ''].map((h) => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {onLeaveStaff.map((s) => (
                    <tr key={s.leave_id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3">
                        <p className="font-semibold text-slate-900 leading-tight"><StaffLink id={s.staff_profile_id}>{s.full_name}</StaffLink></p>
                        <p className="text-xs text-slate-400 mt-0.5 font-mono"><StaffLink id={s.staff_profile_id}>{s.staff_code || ''}</StaffLink>{s.designation ? ` · ${s.designation}` : ''}</p>
                      </td>
                      <td className="px-4 py-3 text-slate-700 whitespace-nowrap">
                        {fmt(s.start_date)} <span className="text-slate-400">→</span> {fmt(s.end_date)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <ExpiryBadge daysRemaining={s.days_remaining} />
                      </td>
                      <td className="px-4 py-3 text-slate-600 max-w-xs truncate">{s.reason || '—'}</td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => handleReportBack(s)}
                          disabled={returningId === s.leave_id}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 border border-slate-200 rounded-lg hover:bg-emerald-50 hover:border-emerald-200 transition-colors disabled:opacity-50"
                        >
                          {returningId === s.leave_id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LogIn className="w-3.5 h-3.5" />}
                          Report Back
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {view === 'Expired' && (
        <>
          <div className="flex justify-end mb-4">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                placeholder="Search by staff name or code…"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8 pr-3 py-1.5 text-sm border border-slate-200 rounded-lg bg-white focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none w-64"
              />
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            {expiredLeaves.length === 0 ? (
              <div className="text-center py-16 text-slate-400 text-sm">
                No expired leaves.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50">
                      {['Staff', 'Leave Period', 'Days', 'Reason', 'Outcome', ''].map((h) => (
                        <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {expiredLeaves.map((leave) => {
                      const returnedEarly = leave.actual_return_date && leave.actual_return_date <= leave.end_date;
                      return (
                        <tr key={leave.leave_id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-3">
                            <p className="font-semibold text-slate-900 leading-tight"><StaffLink id={leave.staff_profile_id}>{leave.full_name || '—'}</StaffLink></p>
                            <p className="text-xs text-slate-400 mt-0.5 font-mono"><StaffLink id={leave.staff_profile_id}>{leave.staff_code || ''}</StaffLink>{leave.designation ? ` · ${leave.designation}` : ''}</p>
                          </td>
                          <td className="px-4 py-3 text-slate-700 whitespace-nowrap">
                            {fmt(leave.start_date)} <span className="text-slate-400">→</span> {fmt(leave.end_date)}
                          </td>
                          <td className="px-4 py-3 text-slate-700 tabular-nums">{dayCount(leave.start_date, leave.end_date)}</td>
                          <td className="px-4 py-3 text-slate-600 max-w-xs truncate">{leave.reason || '—'}</td>
                          <td className="px-4 py-3 whitespace-nowrap text-xs">
                            {leave.actual_return_date ? (
                              <>
                                <span className="font-medium text-emerald-700">
                                  {returnedEarly ? 'Returned early' : 'Reported back'}
                                </span>
                                <span className="block text-slate-400 mt-0.5">
                                  {fmt(leave.actual_return_date)}{leave.returned_by_name ? ` · ${leave.returned_by_name}` : ''}
                                </span>
                              </>
                            ) : (
                              <>
                                <span className="font-medium text-slate-600">Expired, not reported back</span>
                                <span className="block text-slate-400 mt-0.5">Ended {fmt(leave.end_date)}</span>
                              </>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right whitespace-nowrap">
                            {!leave.actual_return_date && (
                              <>
                                <button
                                  onClick={() => openExtend(leave)}
                                  title="Extend this leave and restore staff dashboard access"
                                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 mr-2 text-xs font-semibold text-amber-700 border border-slate-200 rounded-lg hover:bg-amber-50 hover:border-amber-200 transition-colors"
                                >
                                  <CalendarPlus className="w-3.5 h-3.5" />
                                  Extend Leave
                                </button>
                                <button
                                  onClick={() => handleReportBack(leave)}
                                  disabled={returningId === leave.leave_id}
                                  title="Mark as reported back and restore staff dashboard access"
                                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 mr-2 text-xs font-semibold text-emerald-700 border border-slate-200 rounded-lg hover:bg-emerald-50 hover:border-emerald-200 transition-colors disabled:opacity-50"
                                >
                                  {returningId === leave.leave_id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LogIn className="w-3.5 h-3.5" />}
                                  Mark Report Back
                                </button>
                              </>
                            )}
                            <button
                              onClick={() => openReview(leave)}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-blue-600 border border-slate-200 rounded-lg hover:bg-blue-50 hover:border-blue-200 transition-colors"
                            >
                              View
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {expiredLeaves.length > 0 && (
              <div className="border-t border-slate-100 px-4 py-2.5 text-xs text-slate-400">
                {expiredLeaves.length} expired leave{expiredLeaves.length !== 1 ? 's' : ''}
              </div>
            )}
          </div>
        </>
      )}

      {/* Review modal */}
      {reviewLeave && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30" onClick={closeReview} />
          <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-lg border border-slate-200 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-slate-200 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                  <User className="w-4 h-4 text-slate-400" />
                  <StaffLink id={reviewLeave.staff_profile_id}>{reviewLeave.full_name}</StaffLink>
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  {fmt(reviewLeave.start_date)} → {fmt(reviewLeave.end_date)} · {dayCount(reviewLeave.start_date, reviewLeave.end_date)} day(s)
                </p>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                <StatusBadge status={reviewLeave.status} />
                <button onClick={closeReview} className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-md transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="px-5 py-4 space-y-4">
              {reviewLeave.reason && (
                <div>
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Reason</p>
                  <p className="text-sm text-slate-700">{reviewLeave.reason}</p>
                </div>
              )}

              {reviewLeave.status !== 'PENDING' && (
                <div className="text-sm text-slate-600">
                  {reviewLeave.status === 'APPROVED' ? 'Approved' : 'Rejected'} by{' '}
                  <span className="font-medium text-slate-900">{reviewLeave.reviewed_by_name || 'Admin'}</span>
                  {reviewLeave.reviewed_at ? ` on ${fmt(reviewLeave.reviewed_at)}` : ''}.
                  {reviewLeave.status === 'REJECTED' && reviewLeave.rejected_reason && (
                    <span className="block mt-1 text-red-600">Reason: {reviewLeave.rejected_reason}</span>
                  )}
                </div>
              )}

              {/* Conflicts list (only for pending, when not picking a replacement) */}
              {reviewLeave.status === 'PENDING' && !swapConflict && (
                <div>
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Assignments in this range</p>
                  {conflictsLoading ? (
                    <div className="flex items-center gap-2 text-sm text-slate-500 py-2">
                      <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
                      Checking assignments…
                    </div>
                  ) : conflicts.length === 0 ? (
                    <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-800">
                      <CheckCircle className="w-4 h-4 flex-shrink-0" />
                      No assignments in this range — safe to approve.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
                        <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                        This staff member is assigned to {conflicts.length} booking{conflicts.length === 1 ? '' : 's'} in this range. Consider scheduling a replacement swap before approving.
                      </div>
                      {conflicts.map((c) => {
                        const swappedTo = swappedBookings[c.booking_id];
                        return (
                          <div key={c.assignment_id} className="rounded-lg border border-slate-200 p-3 flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-slate-900">{c.client_name || '—'}</p>
                              <p className="text-xs text-slate-400 mt-0.5">{c.patient_name || ''} · {c.service_type || ''}</p>
                              <p className="text-xs text-slate-400 mt-0.5">
                                <CalendarDays className="w-3 h-3 inline mr-1" />
                                {fmt(c.service_start_date)} → {c.service_end_date ? fmt(c.service_end_date) : 'Ongoing'}
                              </p>
                            </div>
                            {swappedTo ? (
                              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 flex-shrink-0">
                                <CheckCircle className="w-3.5 h-3.5" />
                                Swap → {swappedTo}
                              </span>
                            ) : (
                              <button
                                onClick={() => openSwap(c)}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-blue-600 border border-slate-200 rounded-lg hover:bg-blue-50 hover:border-blue-200 transition-colors flex-shrink-0"
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
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                      Replacement for {swapConflict.client_name || 'booking'}
                    </p>
                    <button onClick={closeSwap} className="text-xs font-semibold text-slate-500 hover:text-slate-700">← Back</button>
                  </div>
                  <p className="text-xs text-slate-500 mb-3">
                    Replacement starts {fmt(reviewLeave.start_date)}. Staff already booked or on leave in this range can't be selected.
                  </p>

                  <div className="relative mb-3">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      autoFocus
                      placeholder="Search staff by name, designation, or code…"
                      value={candidateSearch}
                      onChange={(e) => setCandidateSearch(e.target.value)}
                      className="w-full pl-8 pr-3 py-2 text-sm border border-slate-300 rounded-lg bg-white text-slate-800 placeholder-slate-400 outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 transition-colors"
                    />
                  </div>

                  {swapError && (
                    <div className="px-4 py-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg mb-3">
                      {swapError}
                    </div>
                  )}

                  {candidatesLoading ? (
                    <div className="flex items-center gap-2 text-sm text-slate-500 py-4 justify-center">
                      <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
                      Loading staff…
                    </div>
                  ) : filteredCandidates.length === 0 ? (
                    <div className="text-center py-8 text-slate-400 text-sm">
                      No staff match your search.
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
                            <p className="text-xs text-slate-400 mt-0.5">
                              {s.designation || '—'}{s.staff_code ? ` · ${s.staff_code}` : ''}{s.gender ? ` · ${s.gender === 'MALE' ? 'Male' : s.gender === 'FEMALE' ? 'Female' : s.gender}` : ''}
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
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-500 transition-colors disabled:opacity-50 flex-shrink-0"
                            >
                              {swapBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Select'}
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
                  <label className="block text-xs font-medium text-slate-600 mb-1">Rejection reason</label>
                  <textarea
                    rows={3}
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    placeholder="Let the staff member know why this was rejected…"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white text-slate-800 placeholder-slate-400 outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 transition-colors resize-none"
                  />
                </div>
              )}
            </div>

            {reviewLeave.status === 'PENDING' && !swapConflict && (
              <div className="flex items-center gap-2 px-5 py-4 border-t border-slate-200 bg-slate-50">
                {!rejectMode ? (
                  <>
                    <button
                      onClick={() => setRejectMode(true)}
                      disabled={busy}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2 border border-slate-200 text-red-600 rounded-lg text-sm font-medium hover:bg-red-50 hover:border-red-200 transition-colors disabled:opacity-50"
                    >
                      <XCircle className="w-4 h-4" />
                      Reject
                    </button>
                    <button
                      onClick={handleApprove}
                      disabled={busy}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-500 transition-colors disabled:opacity-50"
                    >
                      {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                      Approve
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => setRejectMode(false)}
                      disabled={busy}
                      className="flex-1 px-4 py-2 border border-slate-200 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-100 transition-colors"
                    >
                      Back
                    </button>
                    <button
                      onClick={handleReject}
                      disabled={busy}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-500 transition-colors disabled:opacity-50"
                    >
                      {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
                      Confirm Rejection
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Extend leave modal */}
      {extendLeave && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30" onClick={() => setExtendLeave(null)} />
          <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-sm border border-slate-200" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-slate-200 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">Extend Leave</h2>
                <p className="text-xs text-slate-400 mt-1">
                  {extendLeave.full_name} · currently {fmt(extendLeave.start_date)} → {fmt(extendLeave.end_date)}
                </p>
              </div>
              <button onClick={() => setExtendLeave(null)} className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-md transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="px-5 py-4 space-y-3">
              {extendError && (
                <div className="px-4 py-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg">{extendError}</div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Extend by (days)</label>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={diffDays(extendLeave.end_date, extendMin)}
                    step={1}
                    value={extendDays}
                    onChange={(e) => handleExtendDaysChange(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">New end date</label>
                  <input
                    type="date"
                    value={extendDate}
                    min={extendMin}
                    onChange={(e) => handleExtendDateChange(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 transition-colors"
                  />
                </div>
              </div>
              <p className="text-xs text-slate-400">
                Days are counted from the current end date ({fmt(extendLeave.end_date)}). Changing either field updates the other.
                {extendDate ? ` New end date: ${fmt(extendDate)}.` : ''}
              </p>
              <p className="text-xs text-slate-400">The staff member's dashboard access will be restored.</p>
            </div>
            <div className="flex items-center gap-2 px-5 py-4 border-t border-slate-200 bg-slate-50">
              <button
                onClick={() => setExtendLeave(null)}
                disabled={extendBusy}
                className="flex-1 px-4 py-2 border border-slate-200 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-100 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={submitExtend}
                disabled={extendBusy}
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-500 transition-colors disabled:opacity-50"
              >
                {extendBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CalendarPlus className="w-4 h-4" />}
                Extend
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Log Leave (admin-create) modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30" onClick={closeAddModal} />
          <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md border border-slate-200 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900">Log Staff Leave</h2>
              <button onClick={closeAddModal} className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-md transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-5 py-4 space-y-4">
              {addError && (
                <div className="px-4 py-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg">
                  {addError}
                </div>
              )}

              {/* Staff picker */}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Staff member</label>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setStaffPickerOpen((v) => !v)}
                    className="w-full flex items-center justify-between px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white text-left focus:ring-2 focus:ring-blue-100 focus:border-blue-500 transition-colors"
                  >
                    <span className={selectedStaff ? 'text-slate-900' : 'text-slate-400'}>
                      {selectedStaff ? selectedStaff.full_name : 'Select a staff member…'}
                    </span>
                    <ChevronDown className="w-4 h-4 text-slate-400" />
                  </button>

                  {staffPickerOpen && (
                    <div className="absolute z-10 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-64 overflow-y-auto">
                      <div className="p-2 sticky top-0 bg-white border-b border-slate-100">
                        <div className="relative">
                          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                          <input
                            type="text"
                            autoFocus
                            placeholder="Search staff…"
                            value={staffPickerSearch}
                            onChange={(e) => setStaffPickerSearch(e.target.value)}
                            className="w-full pl-7 pr-2 py-1.5 text-sm border border-slate-200 rounded-md outline-none focus:border-blue-400"
                          />
                        </div>
                      </div>
                      {staffOptionsLoading ? (
                        <div className="flex items-center justify-center py-6">
                          <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
                        </div>
                      ) : filteredStaffOptions.length === 0 ? (
                        <div className="text-center py-6 text-slate-400 text-xs">No staff match your search.</div>
                      ) : (
                        filteredStaffOptions.map((s) => (
                          <button
                            key={s.staff_profile_id}
                            type="button"
                            onClick={() => { setSelectedStaff(s); setStaffPickerOpen(false); }}
                            className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 transition-colors"
                          >
                            <p className="font-medium text-slate-900">{s.full_name}</p>
                            <p className="text-xs text-slate-400">{s.staff_code || ''}{s.designation ? ` · ${s.designation}` : ''}</p>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Start date</label>
                  <input
                    type="date"
                    value={newLeave.start_date}
                    onChange={(e) => setNewLeave((v) => ({ ...v, start_date: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">End date</label>
                  <input
                    type="date"
                    value={newLeave.end_date}
                    min={newLeave.start_date || undefined}
                    onChange={(e) => setNewLeave((v) => ({ ...v, end_date: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 transition-colors"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Reason (optional)</label>
                <textarea
                  rows={3}
                  value={newLeave.reason}
                  onChange={(e) => setNewLeave((v) => ({ ...v, reason: e.target.value }))}
                  placeholder="e.g. Medical leave, personal leave…"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white text-slate-800 placeholder-slate-400 outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 transition-colors resize-none"
                />
              </div>

              <p className="text-xs text-slate-400">
                This leave will be logged as approved immediately — use this for leave you're recording on the staff member's behalf.
              </p>
            </div>

            <div className="flex items-center gap-2 px-5 py-4 border-t border-slate-200 bg-slate-50">
              <button
                onClick={closeAddModal}
                disabled={addBusy}
                className="flex-1 px-4 py-2 border border-slate-200 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-100 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={submitAddLeave}
                disabled={addBusy}
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-500 transition-colors disabled:opacity-50"
              >
                {addBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                Log Leave
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
};

export default LeaveRequests;
