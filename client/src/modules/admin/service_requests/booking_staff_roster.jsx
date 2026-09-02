import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import {
  ArrowLeft, ArrowRight, Search, UserCheck, UserX, Home, User, Clock,
  AlertCircle, Stethoscope, Star, ChevronDown, ChevronUp,
  BadgeCheck, Send, Check, Loader2, X, CheckCircle, CalendarClock,
  TriangleAlert, FileText,
} from 'lucide-react';
import AdminLayout from '../components/AdminLayout';
import apiClient from '../../../api/api';
import { formatMobileNumber } from '../../../utils/phoneFormat';
import StaffScheduleTimeline from '../components/StaffScheduleTimeline';
import RequestPipelineStepper from '../components/RequestPipelineStepper';

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt = (d) =>
  d ? new Date(d).toLocaleDateString('en-LK', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const money = (v) =>
  v != null ? `LKR ${parseFloat(v).toLocaleString('en-LK', { minimumFractionDigits: 2 })}` : '—';
const humanize = (v) =>
  v == null || v === ''
    ? v
    : String(v).replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
const mkInitials = (name) =>
  name ? name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase() : '?';

// Status dot colours — only the dot is coloured, not the badge background
const STATUS_DOT = {
  AVAILABLE:   'bg-green-500',
  ASSIGNED:    'bg-blue-500',
  UNAVAILABLE: 'bg-red-400',
};

const REQUEST_STATUS_DOT = {
  NEW_LEAD:  'bg-blue-400',
  PENDING:   'bg-yellow-400',
  CONFIRMED: 'bg-green-500',
  ASSIGNED:  'bg-blue-500',
  COMPLETED: 'bg-gray-400',
  CANCELLED: 'bg-red-400',
};

// ── Main component ────────────────────────────────────────────────────────────

const BookingStaffRosterPage = () => {
  const navigate  = useNavigate();
  const location  = useLocation();
  const { bookingId } = useParams();

  const [booking, setBooking] = useState(location.state?.booking || null);
  const [request, setRequest] = useState(location.state?.request || null);
  const [quote,   setQuote]   = useState(location.state?.quote   || null);
  const [staff,   setStaff]   = useState([]);
  const [error,   setError]   = useState('');
  const [detailsOpen, setDetailsOpen] = useState(false);

  const [searchTerm,   setSearchTerm]   = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [genderFilter, setGenderFilter] = useState('all');
  const [liveInFilter, setLiveInFilter] = useState('all');
  const [roleFilter,   setRoleFilter]   = useState('all');

  const STAFF_PAGE_SIZE = 12;
  const [staffLoading, setStaffLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({
    current_page: 1, total_pages: 1, total_count: 0, has_next: false, has_prev: false,
  });

  const preferredStaffId =
    request?.preferred_staff_id ||
    booking?.preferred_staff_id ||
    booking?.preferred_staff?.staff_profile_id ||
    null;

  const requestId = request?.request_id || booking?.request_id || null;

  const [sentCandidateIds,   setSentCandidateIds]   = useState(new Set());
  const [sendingCandidateId, setSendingCandidateId] = useState(null);
  const [candidateNotice,    setCandidateNotice]    = useState(null);

  const isShiftBased = (request?.service_model || booking?.service_model) === 'SHIFT_BASED';
  const [selectedQueue, setSelectedQueue] = useState([]);
  const toggleQueueStaff = (member) => {
    setSelectedQueue((prev) =>
      prev.some((m) => m.staff_profile_id === member.staff_profile_id)
        ? prev.filter((m) => m.staff_profile_id !== member.staff_profile_id)
        : [...prev, member]
    );
  };

  const [warnModal, setWarnModal] = useState(null);

  const buildWarnings = (members) => {
    const reqGender    = request?.preferred_gender || booking?.preferred_gender;
    const serviceModel = request?.service_model    || booking?.service_model;
    const warnings = [];
    for (const m of members) {
      if (reqGender && reqGender !== 'NO_PREFERENCE' && m.gender && m.gender !== reqGender) {
        warnings.push(`${m.full_name}'s gender (${humanize(m.gender)}) does not match the client's preferred gender (${humanize(reqGender)}).`);
      }
      if (serviceModel === 'LIVE_IN' && m.willing_to_live_in === false) {
        warnings.push(`${m.full_name} is not willing to live-in, but this is a live-in booking.`);
      }
    }
    return warnings;
  };

  const selectStaff = (member) => {
    const warnings = buildWarnings([member]);
    const proceed  = () => navigate(`/admin/bookings/${bookingId}/staff-assignment`, {
      state: { booking, request, quote, selectedStaff: member },
    });
    warnings.length > 0 ? setWarnModal({ warnings, onConfirm: proceed }) : proceed();
  };

  const proceedWithQueue = () => {
    if (selectedQueue.length === 0) return;
    const warnings = buildWarnings(selectedQueue);
    const proceed  = () => navigate(`/admin/bookings/${bookingId}/staff-assignment`, {
      state: { booking, request, quote, selectedStaffQueue: selectedQueue },
    });
    warnings.length > 0 ? setWarnModal({ warnings, onConfirm: proceed }) : proceed();
  };

  useEffect(() => {
    if (!requestId) return;
    (async () => {
      try {
        const res = await apiClient.getSentCandidates(requestId);
        setSentCandidateIds(new Set((res.data || []).map((r) => r.staff_profile_id)));
      } catch { /* non-fatal */ }
    })();
  }, [requestId]);

  const handleSendCandidate = async (member) => {
    if (!requestId) return;
    setSendingCandidateId(member.staff_profile_id);
    setCandidateNotice(null);
    try {
      await apiClient.sendCandidateProfile(requestId, member.staff_profile_id);
      setSentCandidateIds((prev) => new Set(prev).add(member.staff_profile_id));
      setCandidateNotice({ type: 'success', text: `${member.full_name}'s profile sent to ${request?.payer_name || booking?.client_name || 'the client'}.` });
    } catch (err) {
      if (/already been sent/i.test(err?.message || '')) {
        setSentCandidateIds((prev) => new Set(prev).add(member.staff_profile_id));
      }
      setCandidateNotice({ type: 'error', text: err?.message || 'Failed to send candidate profile.' });
    } finally {
      setSendingCandidateId(null);
    }
  };

  const fetchBookingDetails = async () => {
    if (booking) return;
    try {
      setError('');
      const bookingRes = await apiClient.getAdminBookingDetail(bookingId);
      if (bookingRes?.data) {
        setBooking(bookingRes.data);
        if (!request && bookingRes.data.request_id) {
          try {
            const reqRes = await apiClient.getServiceRequestById(bookingRes.data.request_id);
            setRequest(reqRes.data || null);
          } catch { /* non-fatal */ }
        }
      }
    } catch (err) {
      setError(err.message || 'Failed to load staff roster');
    }
  };

  useEffect(() => { fetchBookingDetails(); }, [bookingId]);

  const fetchStaff = async (targetPage = page) => {
    try {
      setStaffLoading(true);
      setError('');
      const params = { page: targetPage, limit: STAFF_PAGE_SIZE };
      if (statusFilter !== 'all') params.status = statusFilter;
      if (roleFilter   !== 'all') params.role   = roleFilter;
      if (debouncedSearch) params.search = debouncedSearch;
      const res = await apiClient.getAllStaff(params);
      setStaff(res.data || []);
      setPagination(res.pagination || {
        current_page: targetPage, total_pages: 1, total_count: (res.data || []).length, has_next: false, has_prev: false,
      });
    } catch (err) {
      setError(err.message || 'Failed to load staff roster');
    } finally {
      setStaffLoading(false);
    }
  };

  // Debounce the free-text search box (matches staff code — with or without the
  // "EMP-" prefix — full name, phone number, or designation server-side).
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(searchTerm.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [searchTerm]);

  useEffect(() => { fetchStaff(page); }, [page, statusFilter, roleFilter, debouncedSearch]);

  // Batched schedule lookup for whoever's on the current page — lets the admin see
  // each candidate's existing/upcoming commitments before picking them for this booking.
  const [schedules, setSchedules] = useState({});
  const [schedulesLoading, setSchedulesLoading] = useState(false);
  const [expandedScheduleId, setExpandedScheduleId] = useState(null);

  useEffect(() => {
    const ids = staff.map((m) => m.staff_profile_id);
    if (ids.length === 0) { setSchedules({}); return; }
    setSchedulesLoading(true);
    apiClient.getStaffSchedules(ids)
      .then((res) => setSchedules(res?.data || {}))
      .catch(() => setSchedules({}))
      .finally(() => setSchedulesLoading(false));
  }, [staff]);

  const changeStatusFilter = (v) => { setStatusFilter(v); setPage(1); };
  const changeRoleFilter   = (v) => { setRoleFilter(v);   setPage(1); };

  const filteredStaff = useMemo(() =>
    staff.filter((m) => {
      const matchesGender = genderFilter === 'all' || m.gender === genderFilter;
      const matchesLiveIn = liveInFilter === 'all' ||
        (liveInFilter === 'yes' ? m.willing_to_live_in === true : m.willing_to_live_in === false);
      return matchesGender && matchesLiveIn;
    }),
  [staff, genderFilter, liveInFilter]);

  const activeFilters = [statusFilter, genderFilter, liveInFilter, roleFilter].filter((f) => f !== 'all').length;
  const clearFilters  = () => { setStatusFilter('all'); setRoleFilter('all'); setGenderFilter('all'); setLiveInFilter('all'); setSearchTerm(''); setDebouncedSearch(''); setPage(1); };

  // Derived display values
  const clientName   = request?.payer_name       || booking?.client_name   || '—';
  const patientName  = request?.patient_name     || booking?.patient_name  || '—';
  const serviceModel = request?.service_model    || booking?.service_model;
  const serviceType  = request?.service_type     || booking?.service_type;
  const prefGender   = request?.preferred_gender || booking?.preferred_gender;
  const startDate    = request?.start_date       || booking?.start_date;
  const reqStatus    = request?.status           || booking?.status;
  const requestCode  = request?.service_request_code || request?.request_code || null;

  // Same 5-phase pipeline shown on ServiceRequestSummaryPage — this page is
  // reached once a booking already exists, so it's normally sitting at
  // "Booking Created" (4) while staff are picked, moving to "Staff Assigned"
  // (5) once the request/booking status reflects that.
  const pipelineCompletedCount = useMemo(() => {
    const quotationSent = Boolean(quote) || (request?.status && request.status !== 'NEW_LEAD');
    const paymentMade =
      (parseFloat(quote?.total_paid) || 0) > 0 ||
      (parseFloat(booking?.amount_paid) || 0) > 0;
    const bookingCreated = Boolean(booking) || request?.status === 'BOOKING_CREATED';
    const staffAssigned =
      request?.status === 'ASSIGNED' || request?.status === 'COMPLETED' || booking?.status === 'ACTIVE';
    let count = 1; // New Lead is always true once a request exists
    if (quotationSent) count = 2;
    if (paymentMade) count = 3;
    if (bookingCreated) count = 4;
    if (staffAssigned) count = 5;
    return count;
  }, [request, booking, quote]);

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <AdminLayout
      title="Staff Roster"
      subtitle="Select a staff member to assign to this booking."
      actions={
        <button
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-2 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
      }
    >

      <RequestPipelineStepper completedCount={pipelineCompletedCount} />

      {/* ── Toasts ── */}
      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-md border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700">
          <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
          <span className="flex-1">{error}</span>
        </div>
      )}
      {candidateNotice && (
        <div className="mb-4 flex items-center gap-2 rounded-md border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700">
          {candidateNotice.type === 'success'
            ? <CheckCircle className="h-4 w-4 shrink-0 text-green-500" />
            : <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />}
          <span className="flex-1">{candidateNotice.text}</span>
          <button onClick={() => setCandidateNotice(null)} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* ── Booking context panel ── */}
      {(request || booking) && (
        <div className="mb-4 overflow-hidden rounded-lg border border-gray-200 bg-white">

          {/* Summary strip — always visible */}
          <div className="flex items-center justify-between gap-4 px-5 py-3">
            <div className="flex min-w-0 flex-wrap items-center gap-x-5 gap-y-1">
              <div className="flex items-center gap-2 shrink-0">
                <FileText className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                <span className="font-semibold text-sm text-gray-900">{clientName}</span>
                {requestCode && (
                  <span className="font-mono text-xs text-gray-400">{requestCode}</span>
                )}
              </div>
              <span className="hidden h-3 w-px bg-gray-200 sm:block" />
              <span className="text-sm text-gray-500">
                Patient: <span className="font-medium text-gray-700">{patientName}</span>
              </span>
              {serviceType && (
                <Chip>{humanize(serviceType)}</Chip>
              )}
              {serviceModel && serviceModel !== 'NO_PREFERENCE' && (
                <Chip>{humanize(serviceModel)}</Chip>
              )}
              {prefGender && prefGender !== 'NO_PREFERENCE' && (
                <Chip>{humanize(prefGender)} preferred</Chip>
              )}
              {startDate && (
                <span className="text-xs text-gray-400">From {fmt(startDate)}</span>
              )}
              {reqStatus && (
                <span className="inline-flex items-center gap-1.5 rounded bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                  <span className={`h-1.5 w-1.5 rounded-full ${REQUEST_STATUS_DOT[reqStatus] || 'bg-gray-400'}`} />
                  {humanize(reqStatus)}
                </span>
              )}
            </div>
            <button
              onClick={() => setDetailsOpen((v) => !v)}
              className="shrink-0 inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline"
            >
              {detailsOpen ? 'Hide' : 'Details'}
              {detailsOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>
          </div>

          {/* Expanded details */}
          {detailsOpen && (
            <div className="border-t border-gray-100 px-5 pb-5 pt-4">
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
                <section>
                  <SectionHeading icon={User} label="Client / Payer" />
                  <dl className="mt-3 space-y-3">
                    <DetailRow label="Name"     value={request?.payer_name      || booking?.client_name} />
                    <DetailRow label="Mobile"   value={formatMobileNumber(request?.payer_mobile    || booking?.client_mobile)} />
                    <DetailRow label="Location" value={request?.location_address || booking?.client_address} />
                  </dl>
                </section>
                <section>
                  <SectionHeading icon={Stethoscope} label="Care Profile" />
                  <dl className="mt-3 space-y-3">
                    <DetailRow label="Patient"      value={request?.patient_name || booking?.patient_name} />
                    <DetailRow label="Age"          value={request?.patient_age  ?? booking?.patient_age} />
                    <DetailRow label="Relationship" value={request?.relationship_to_client || booking?.relationship_to_client} />
                  </dl>
                </section>
                <section>
                  <SectionHeading icon={BadgeCheck} label="Service" />
                  <dl className="mt-3 space-y-3">
                    <DetailRow label="Type"        value={request?.service_type || booking?.service_type} />
                    <DetailRow label="Model"       value={humanize(serviceModel)} />
                    <DetailRow label="Gender pref" value={humanize(prefGender)} />
                    <DetailRow label="Start date"  value={fmt(startDate)} />
                  </dl>
                </section>
              </div>

              {(request?.patient_condition || booking?.medical_condition) && (
                <div className="mt-4 rounded-md border border-gray-100 bg-gray-50 px-4 py-3">
                  <p className="text-[11px] font-medium uppercase tracking-wider text-gray-400">Condition</p>
                  <p className="mt-1 text-sm leading-relaxed text-gray-700">
                    {request?.patient_condition || booking?.medical_condition}
                  </p>
                </div>
              )}

              {request?.remarks && (
                <div className="mt-3 rounded-md border border-gray-200 bg-gray-50 px-4 py-3">
                  <p className="text-[11px] font-medium uppercase tracking-wider text-gray-400">Remarks</p>
                  <p className="mt-1 text-sm leading-relaxed text-gray-700">{request.remarks}</p>
                </div>
              )}

              {/* Quote strip — total_paid / remaining_amount are aggregated fields that may
                  not be present on the quote from the list; fall back to booking.amount_paid */}
              {quote && (
                <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <QuoteStat label="Estimate"  value={quote.estimate_number} />
                  <QuoteStat label="Total"     value={money(quote.total_amount)} />
                  <QuoteStat label="Paid"      value={money(quote.total_paid ?? booking?.amount_paid)} />
                  <QuoteStat
                    label="Remaining"
                    value={money(
                      quote.remaining_amount ??
                      (parseFloat(quote.total_amount || 0) - parseFloat(booking?.amount_paid || 0))
                    )}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Filters bar ── */}
      <div className="mb-4 rounded-lg border border-gray-200 bg-white px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search by name, staff ID (EMP-0081), or phone…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full rounded-md border border-gray-200 bg-white py-1.5 pl-9 pr-3 text-sm text-gray-800 placeholder-gray-400 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </div>
          <FilterSelect value={statusFilter} onChange={changeStatusFilter}>
            <option value="all">All statuses</option>
            <option value="AVAILABLE">Available</option>
            <option value="ASSIGNED">Assigned</option>
            <option value="UNAVAILABLE">Unavailable</option>
          </FilterSelect>
          <FilterSelect value={roleFilter} onChange={changeRoleFilter}>
            <option value="all">All roles</option>
            <option value="NURSE">Nurse</option>
            <option value="CARETAKER">Caregiver</option>
            <option value="NANNY">Nanny</option>
            <option value="NURSING_ASSISTANT">Nursing Assistant</option>
            <option value="PHYSIOTHERAPIST">Physiotherapist</option>
            <option value="COUNSELLOR">Counsellor</option>
          </FilterSelect>
          <FilterSelect value={genderFilter} onChange={setGenderFilter}>
            <option value="all">Any gender</option>
            <option value="MALE">Male</option>
            <option value="FEMALE">Female</option>
          </FilterSelect>
          <FilterSelect value={liveInFilter} onChange={setLiveInFilter}>
            <option value="all">Any live-in</option>
            <option value="yes">Willing to live-in</option>
            <option value="no">Not willing</option>
          </FilterSelect>
          {activeFilters > 0 && (
            <button onClick={clearFilters} className="text-sm font-medium text-blue-600 hover:underline">
              Clear ({activeFilters})
            </button>
          )}
        </div>
        <p className="mt-2 text-xs text-gray-400">
          Showing{' '}
          <span className="font-semibold text-gray-600">{filteredStaff.length}</span>
          {' '}of{' '}
          <span className="font-semibold text-gray-600">{pagination.total_count}</span>
          {' '}staff members
        </p>
      </div>

      {/* ── Shift queue banner ── */}
      {isShiftBased && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-200 bg-gray-50 px-5 py-3">
          <p className="text-sm text-gray-600">
            {selectedQueue.length === 0 ? (
              <>
                <span className="font-semibold text-gray-800">Shift-based booking</span>
                {' — add one staff per shift in order, then proceed.'}
              </>
            ) : (
              <>
                <span className="font-semibold text-gray-800">{selectedQueue.length} staff queued:</span>
                {' '}{selectedQueue.map((m) => m.full_name).join(' → ')}
              </>
            )}
          </p>
          <button
            onClick={proceedWithQueue}
            disabled={selectedQueue.length === 0}
            className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300 transition-colors"
          >
            Proceed to assignment ({selectedQueue.length})
          </button>
        </div>
      )}

      {/* ── Staff table ── */}
      {staffLoading ? (
        <div className="flex items-center justify-center rounded-lg border border-gray-200 bg-white py-16">
          <Loader2 className="h-5 w-5 animate-spin text-gray-300" />
          <span className="ml-3 text-sm text-gray-400">Loading staff roster…</span>
        </div>
      ) : filteredStaff.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white py-14 text-center">
          <AlertCircle className="mx-auto mb-3 h-8 w-8 text-gray-200" />
          <p className="font-semibold text-gray-600">No staff match your filters</p>
          <p className="mt-1 text-sm text-gray-400">Try adjusting the search or filters above.</p>
          {activeFilters > 0 && (
            <button onClick={clearFilters} className="mt-3 text-sm font-medium text-blue-600 hover:underline">
              Clear all filters
            </button>
          )}
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Staff</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Contact</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Role</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Location</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Rating</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Schedule</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredStaff.map((member) => {
                  const isPreferred = member.staff_profile_id === preferredStaffId;
                  const roles = Array.isArray(member.role)
                    ? member.role
                    : String(member.role || '').replace(/[{}"]/g, '').split(',').filter(Boolean);
                  const queueIndex = selectedQueue.findIndex((m) => m.staff_profile_id === member.staff_profile_id);
                  const inQueue    = queueIndex !== -1;
                  const isSent     = sentCandidateIds.has(member.staff_profile_id);
                  const isSending  = sendingCandidateId === member.staff_profile_id;
                  const ini        = mkInitials(member.full_name);
                  const dotCls     = STATUS_DOT[member.current_status] || 'bg-gray-400';
                  const statusLabel = humanize(member.current_status) || 'Unknown';

                  const memberSchedule = schedules[member.staff_profile_id] || [];
                  const hasConflict = startDate && memberSchedule.some((e) => {
                    const ref = String(startDate).slice(0, 10);
                    const s = (e.service_start_date || '').slice(0, 10);
                    const en = e.service_end_date ? e.service_end_date.slice(0, 10) : null;
                    return s && s <= ref && (!en || en >= ref);
                  });
                  const isExpanded = expandedScheduleId === member.staff_profile_id;

                  return (
                    <React.Fragment key={member.staff_profile_id}>
                      <tr className={isPreferred ? 'bg-yellow-50/40' : undefined}>
                        {/* Staff */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5 min-w-[180px]">
                            {member.profile_picture_url ? (
                              <img src={member.profile_picture_url} alt={member.full_name}
                                className="w-8 h-8 rounded-full object-cover flex-shrink-0 ring-1 ring-gray-200" />
                            ) : (
                              <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0 ring-1 ring-gray-200 text-xs font-semibold text-gray-500">
                                {ini}
                              </div>
                            )}
                            <div>
                              <div className="flex items-center gap-1.5">
                                <p className="font-semibold text-gray-900 leading-tight">{member.full_name}</p>
                                {isPreferred && (
                                  <Star className="h-3 w-3 fill-yellow-400 text-yellow-400 shrink-0" title="Client's preferred staff" />
                                )}
                              </div>
                              {(member.staff_code || member.gender) && (
                                <p className="text-xs text-gray-400 font-mono">
                                  {member.staff_code}{member.staff_code && member.gender ? ' · ' : ''}{member.gender ? (member.gender === 'MALE' ? 'Male' : member.gender === 'FEMALE' ? 'Female' : member.gender) : ''}
                                </p>
                              )}
                              <p className="text-xs text-gray-500">{member.designation || 'Staff Member'}</p>
                            </div>
                          </div>
                        </td>

                        {/* Contact */}
                        <td className="px-4 py-3 whitespace-nowrap">
                          <p className="text-gray-700">{formatMobileNumber(member.mobile_number) || '—'}</p>
                          <p className="text-xs text-gray-400">{humanize(member.gender)}</p>
                        </td>

                        {/* Role */}
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1">
                            {roles.length > 0 ? roles.map((r) => (
                              <span key={r} className="rounded bg-gray-100 px-1.5 py-0.5 text-[11px] font-medium text-gray-600">
                                {humanize(r)}
                              </span>
                            )) : '—'}
                            {member.willing_to_live_in && (
                              <span className="flex items-center gap-1 rounded bg-gray-100 px-1.5 py-0.5 text-[11px] font-medium text-gray-600">
                                <Home className="h-2.5 w-2.5" /> Live-in
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Location */}
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className="text-gray-600">{member.location || member.home_address || '—'}</span>
                        </td>

                        {/* Status */}
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className="inline-flex items-center gap-1.5 rounded bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600">
                            <span className={`h-1.5 w-1.5 rounded-full ${dotCls}`} />
                            {statusLabel}
                          </span>
                          {member.current_status === 'ASSIGNED' && (
                            <p className="mt-1 flex items-center gap-1 text-xs text-gray-400">
                              <CalendarClock className="h-3 w-3 shrink-0" />
                              {member.active_assignment_end_date
                                ? <>Free {new Date(member.active_assignment_end_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</>
                                : 'End date not set'}
                            </p>
                          )}
                        </td>

                        {/* Rating */}
                        <td className="px-4 py-3 whitespace-nowrap">
                          {member.average_rating != null ? (
                            <span className="flex items-center gap-1">
                              <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                              <span className="text-xs font-semibold text-gray-700">{parseFloat(member.average_rating).toFixed(1)}</span>
                              {member.total_reviews > 0 && (
                                <span className="text-xs text-gray-400">({member.total_reviews})</span>
                              )}
                            </span>
                          ) : (
                            <span className="text-xs text-gray-400">No reviews</span>
                          )}
                        </td>

                        {/* Schedule */}
                        <td className="px-4 py-3 whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => setExpandedScheduleId(isExpanded ? null : member.staff_profile_id)}
                            className={`flex items-center gap-1.5 text-xs font-medium transition-colors ${
                              hasConflict ? 'text-rose-600' : 'text-gray-500 hover:text-gray-700'
                            }`}
                          >
                            <CalendarClock className="h-3.5 w-3.5 shrink-0" />
                            {schedulesLoading
                              ? 'Checking…'
                              : hasConflict
                                ? 'Busy on start date'
                                : memberSchedule.length > 0
                                  ? `${memberSchedule.length} other${memberSchedule.length === 1 ? '' : 's'}`
                                  : 'Clear'}
                            {(memberSchedule.length > 0 || schedulesLoading) && (
                              isExpanded ? <ChevronUp className="h-3.5 w-3.5 shrink-0" /> : <ChevronDown className="h-3.5 w-3.5 shrink-0" />
                            )}
                          </button>
                        </td>

                        {/* Actions */}
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-2">
                            {isShiftBased ? (
                              <button
                                onClick={() => toggleQueueStaff(member)}
                                className={`whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                                  inQueue
                                    ? 'bg-gray-800 text-white hover:bg-gray-900'
                                    : 'bg-blue-600 text-white hover:bg-blue-700'
                                }`}
                              >
                                {inQueue ? `✓ Shift ${queueIndex + 1}` : 'Add to shifts'}
                              </button>
                            ) : (
                              <button
                                onClick={() => selectStaff(member)}
                                className="whitespace-nowrap rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 transition-colors"
                              >
                                Select
                              </button>
                            )}

                            {requestId && (
                              isSent ? (
                                <span className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-500">
                                  <Check className="h-3.5 w-3.5 text-gray-400" /> Sent
                                </span>
                              ) : (
                                <button
                                  onClick={() => handleSendCandidate(member)}
                                  disabled={isSending}
                                  title="Send this candidate's profile to the client via WhatsApp"
                                  className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60 transition-colors"
                                >
                                  {isSending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                                </button>
                              )
                            )}
                          </div>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr>
                          <td colSpan={8} className="border-t border-gray-100 bg-gray-50 px-4 py-3">
                            <StaffScheduleTimeline schedule={memberSchedule} loading={schedulesLoading} referenceDate={startDate} compact />
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="border-t border-gray-100 px-4 py-2.5 text-xs text-gray-400">
            Showing {filteredStaff.length} of {pagination.total_count} staff member{pagination.total_count !== 1 ? 's' : ''}
          </div>
        </div>
      )}

      {/* ── Pagination ── */}
      {!staffLoading && pagination.total_pages > 1 && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white px-5 py-3">
          <p className="text-sm text-gray-500">
            Page{' '}
            <span className="font-semibold text-gray-800">{pagination.current_page}</span>
            {' '}of{' '}
            <span className="font-semibold text-gray-800">{pagination.total_pages}</span>
          </p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={!pagination.has_prev}
              className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 transition-colors"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Prev
            </button>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={!pagination.has_next}
              className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 transition-colors"
            >
              Next <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* ── Mismatch warning modal ── */}
      {warnModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 p-4">
          <div className="w-full max-w-md rounded-lg border border-gray-200 bg-white shadow-lg">
            <div className="flex items-start gap-3 border-b border-gray-100 px-5 py-4">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-yellow-500" />
              <div>
                <p className="font-semibold text-sm text-gray-900">Requirements mismatch</p>
                <p className="mt-0.5 text-xs text-gray-500">The selected staff may not be the best fit for this booking.</p>
              </div>
            </div>
            <ul className="space-y-2 px-5 py-4">
              {warnModal.warnings.map((w, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                  <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-gray-400" />
                  {w}
                </li>
              ))}
            </ul>
            <div className="flex items-center justify-end gap-2 border-t border-gray-100 px-5 py-3">
              <button
                onClick={() => setWarnModal(null)}
                className="rounded-md border border-gray-200 px-4 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Go back
              </button>
              <button
                onClick={() => { setWarnModal(null); warnModal.onConfirm(); }}
                className="rounded-md bg-gray-800 px-4 py-1.5 text-sm font-semibold text-white hover:bg-gray-900 transition-colors"
              >
                Proceed anyway
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
};

// ── Sub-components ────────────────────────────────────────────────────────────

const SectionHeading = ({ icon: Icon, label }) => (
  <div className="flex items-center gap-2">
    <Icon className="h-3.5 w-3.5 text-gray-400" />
    <span className="text-[11px] font-medium uppercase tracking-wider text-gray-400">{label}</span>
  </div>
);

const DetailRow = ({ label, value }) => (
  <div>
    <p className="text-[11px] font-medium uppercase tracking-wider text-gray-400">{label}</p>
    <p className="mt-0.5 text-sm font-medium text-gray-800">
      {value != null && value !== '' ? String(value) : <span className="font-normal text-gray-300">—</span>}
    </p>
  </div>
);

const QuoteStat = ({ label, value }) => (
  <div className="rounded-md border border-gray-100 bg-gray-50 px-3 py-2.5">
    <p className="text-[11px] font-medium uppercase tracking-wider text-gray-400">{label}</p>
    <p className="mt-0.5 text-sm font-semibold text-gray-800">{value}</p>
  </div>
);

const Chip = ({ children }) => (
  <span className="rounded bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">{children}</span>
);

const FilterSelect = ({ value, onChange, children }) => (
  <select
    value={value}
    onChange={(e) => onChange(e.target.value)}
    className="rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-sm text-gray-600 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
  >
    {children}
  </select>
);

export default BookingStaffRosterPage;
