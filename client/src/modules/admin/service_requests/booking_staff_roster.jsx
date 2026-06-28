import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import {
  ArrowLeft, Search, UserCheck, UserX, Home, User, Clock,
  MapPin, Phone, Mail, AlertCircle, Stethoscope, Calendar,
  FileText, Star, ChevronDown, ChevronUp, BadgeCheck,
  Send, Check, Loader2, X, CheckCircle
} from 'lucide-react';
import AdminLayout from '../components/AdminLayout';
import apiClient from '../../../api/api';

const statusColor = {
  AVAILABLE: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  ASSIGNED: 'bg-blue-50 text-blue-700 border-blue-200',
  UNAVAILABLE: 'bg-red-50 text-red-700 border-red-200',
};

const statusIcon = {
  AVAILABLE: <UserCheck className="w-3.5 h-3.5" />,
  ASSIGNED: <Clock className="w-3.5 h-3.5" />,
  UNAVAILABLE: <UserX className="w-3.5 h-3.5" />,
};

const fmt = (date) => date ? new Date(date).toLocaleDateString('en-LK', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const money = (v) => v != null ? `LKR ${parseFloat(v).toLocaleString('en-LK', { minimumFractionDigits: 2 })}` : '—';
const humanize = (v) =>
  v == null || v === ''
    ? v
    : String(v).replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

const requestStatusStyle = {
  NEW_LEAD: 'bg-blue-50 text-blue-700 border-blue-200',
  PENDING: 'bg-amber-50 text-amber-700 border-amber-200',
  CONFIRMED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  ASSIGNED: 'bg-purple-50 text-purple-700 border-purple-200',
  COMPLETED: 'bg-slate-100 text-slate-700 border-slate-200',
  CANCELLED: 'bg-red-50 text-red-700 border-red-200',
};

const BookingStaffRosterPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { bookingId } = useParams();

  const [booking, setBooking] = useState(location.state?.booking || null);
  const [request, setRequest] = useState(location.state?.request || null);
  const [quote, setQuote] = useState(location.state?.quote || null);
  const [staff, setStaff] = useState([]);
  const [error, setError] = useState('');
  const [detailsOpen, setDetailsOpen] = useState(true);

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [genderFilter, setGenderFilter] = useState('all');
  const [liveInFilter, setLiveInFilter] = useState('all');
  const [roleFilter, setRoleFilter] = useState('all');

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

  // Service request this roster belongs to — needed to send candidate profiles to the client.
  const requestId = request?.request_id || booking?.request_id || null;

  // Candidate profiles already sent to the client for this service request (one-time per staff)
  const [sentCandidateIds, setSentCandidateIds] = useState(new Set());
  const [sendingCandidateId, setSendingCandidateId] = useState(null);
  const [candidateNotice, setCandidateNotice] = useState(null); // { type: 'success' | 'error', text }

  // SHIFT_BASED bookings need one staff member per shift — build an ordered queue here
  // instead of the single-select flow LIVE_IN/VISITING use, then hand the whole queue
  // to the assignment page to pre-fill shift 1, 2, 3... in order.
  const isShiftBased = (request?.service_model || booking?.service_model) === 'SHIFT_BASED';
  const [selectedQueue, setSelectedQueue] = useState([]);
  const toggleQueueStaff = (member) => {
    setSelectedQueue((prev) =>
      prev.some((m) => m.staff_profile_id === member.staff_profile_id)
        ? prev.filter((m) => m.staff_profile_id !== member.staff_profile_id)
        : [...prev, member]
    );
  };
  const proceedWithQueue = () => {
    if (selectedQueue.length === 0) return;
    navigate(`/admin/bookings/${bookingId}/staff-assignment`, {
      state: { booking, request, quote, selectedStaffQueue: selectedQueue }
    });
  };

  useEffect(() => {
    if (!requestId) return;
    (async () => {
      try {
        const res = await apiClient.getSentCandidates(requestId);
        setSentCandidateIds(new Set((res.data || []).map((r) => r.staff_profile_id)));
      } catch (err) {
        console.error('Failed to load sent candidates:', err);
      }
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
      if (roleFilter !== 'all') params.role = roleFilter;

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

  useEffect(() => { fetchStaff(page); }, [page, statusFilter, roleFilter]);

  const changeStatusFilter = (v) => { setStatusFilter(v); setPage(1); };
  const changeRoleFilter = (v) => { setRoleFilter(v); setPage(1); };

  const filteredStaff = useMemo(() => {
    return staff.filter((m) => {
      const matchesSearch = !searchTerm ||
        [m.full_name, m.designation, m.home_address, m.location, m.email, m.mobile_number]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(searchTerm.toLowerCase()));
      const matchesGender = genderFilter === 'all' || m.gender === genderFilter;
      const matchesLiveIn = liveInFilter === 'all' ||
        (liveInFilter === 'yes' ? m.willing_to_live_in === true : m.willing_to_live_in === false);
      return matchesSearch && matchesGender && matchesLiveIn;
    });
  }, [staff, searchTerm, genderFilter, liveInFilter]);

  const selectStaff = (member) => {
    navigate(`/admin/bookings/${bookingId}/staff-assignment`, {
      state: { booking, request, quote, selectedStaff: member }
    });
  };

  const activeFilters = [statusFilter, genderFilter, liveInFilter, roleFilter].filter((f) => f !== 'all').length;

  return (
    <AdminLayout
      title="Staff Roster"
      subtitle="Review the service request and assign the most suitable staff member."
      actions={
        <button
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
      }
    >
      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      {candidateNotice && (
        <div className={`mb-4 flex items-center gap-2 rounded-lg border px-4 py-3 text-sm ${
          candidateNotice.type === 'success'
            ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
            : 'border-red-200 bg-red-50 text-red-800'
        }`}>
          {candidateNotice.type === 'success' ? <CheckCircle className="h-4 w-4 flex-shrink-0" /> : <AlertCircle className="h-4 w-4 flex-shrink-0" />}
          <span className="flex-1">{candidateNotice.text}</span>
          <button onClick={() => setCandidateNotice(null)} className="opacity-60 hover:opacity-100">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* ── Service Request Details ── */}
      {(request || booking) && (
        <div className="mb-6 rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <button
            onClick={() => setDetailsOpen((v) => !v)}
            className="flex w-full items-center justify-between px-5 py-4 text-left hover:bg-slate-50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <FileText className="h-4 w-4 text-slate-400" />
              <div>
                <p className="text-sm font-semibold text-slate-900">
                  Service Request Details
                  {request?.request_id && (
                    <span className="ml-2 font-normal text-slate-400 text-xs">#{request.request_id}</span>
                  )}
                </p>
                {!detailsOpen && (
                  <p className="text-xs text-slate-500">
                    {request?.payer_name || booking?.client_name || '—'} &middot;{' '}
                    {request?.patient_name || booking?.patient_name || '—'} &middot;{' '}
                    {request?.service_type || booking?.service_type || '—'}
                  </p>
                )}
              </div>
            </div>
            {detailsOpen
              ? <ChevronUp className="h-4 w-4 text-slate-400" />
              : <ChevronDown className="h-4 w-4 text-slate-400" />}
          </button>

          {detailsOpen && (
            <div className="border-t border-slate-100 px-5 pb-5 pt-4">
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">

                {/* Client / Payer */}
                <section>
                  <SectionHeading icon={User} label="Client / Payer" />
                  <dl className="mt-3 space-y-3">
                    <DetailField label="Name" value={request?.payer_name || booking?.client_name} />
                    <DetailField label="Mobile" value={request?.payer_mobile || booking?.client_mobile} />
                    <DetailField label="Location" value={request?.location_address || booking?.client_address} />
                  </dl>
                </section>

                {/* Patient */}
                <section>
                  <SectionHeading icon={Stethoscope} label="Care Profile" />
                  <dl className="mt-3 space-y-3">
                    <DetailField label="Name" value={request?.patient_name || booking?.patient_name} />
                    <DetailField label="Age" value={request?.patient_age ?? booking?.patient_age} />
                    <DetailField label="Relationship" value={request?.relationship_to_client || booking?.relationship_to_client} />
                  </dl>
                </section>

                {/* Service Requirements */}
                <section>
                  <SectionHeading icon={BadgeCheck} label="Service Requirements" />
                  <dl className="mt-3 space-y-3">
                    <DetailField label="Service Type" value={request?.service_type || booking?.service_type} />
                    <DetailField label="Service Model" value={humanize(request?.service_model || booking?.service_model)} />
                    <DetailField label="Preferred Gender" value={humanize(request?.preferred_gender || booking?.preferred_gender)} />
                    <DetailField label="Start Date" value={fmt(request?.start_date || booking?.start_date)} />
                    <div>
                      <dt className="text-xs font-medium text-slate-400">Status</dt>
                      <dd className="mt-1">
                        {(() => {
                          const s = request?.status || booking?.status;
                          return s ? (
                            <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${requestStatusStyle[s] || 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                              {humanize(s)}
                            </span>
                          ) : <span className="text-sm text-slate-400">—</span>;
                        })()}
                      </dd>
                    </div>
                  </dl>
                </section>
              </div>

              {(request?.patient_condition || booking?.medical_condition) && (
                <div className="mt-4 rounded-lg border border-slate-100 bg-slate-50 px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Condition</p>
                  <p className="mt-1 text-sm leading-relaxed text-slate-700">{request?.patient_condition || booking?.medical_condition}</p>
                </div>
              )}

              {(request?.remarks) && (
                <div className="mt-4 rounded-lg border border-amber-100 bg-amber-50 px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-amber-600">Remarks</p>
                  <p className="mt-1 text-sm leading-relaxed text-amber-900">{request.remarks}</p>
                </div>
              )}

              {/* Quote strip */}
              {quote && (
                <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <QuoteStat label="Estimate" value={quote.estimate_number} />
                  <QuoteStat label="Total" value={money(quote.total_amount)} />
                  <QuoteStat label="Paid" value={money(quote.total_paid)} accent="text-emerald-700" />
                  <QuoteStat label="Remaining" value={money(quote.remaining_amount)} accent="text-amber-700" />
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Filters ── */}
      <div className="mb-4 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[180px] flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Search staff…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full rounded-lg border border-slate-200 py-1.5 pl-8 pr-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            />
          </div>
          <FilterSelect value={statusFilter} onChange={changeStatusFilter}>
            <option value="all">All Statuses</option>
            <option value="AVAILABLE">Available</option>
            <option value="ASSIGNED">Assigned</option>
            <option value="UNAVAILABLE">Unavailable</option>
          </FilterSelect>
          <FilterSelect value={roleFilter} onChange={changeRoleFilter}>
            <option value="all">All Roles</option>
            <option value="NURSE">Nurse</option>
            <option value="CARETAKER">Caregiver</option>
            <option value="NANNY">Nanny</option>
          </FilterSelect>
          <FilterSelect value={genderFilter} onChange={setGenderFilter}>
            <option value="all">All Genders</option>
            <option value="MALE">Male</option>
            <option value="FEMALE">Female</option>
          </FilterSelect>
          <FilterSelect value={liveInFilter} onChange={setLiveInFilter}>
            <option value="all">Any Live-in</option>
            <option value="yes">Willing to Live-in</option>
            <option value="no">Not Willing</option>
          </FilterSelect>
          {activeFilters > 0 && (
            <button
              onClick={() => { setStatusFilter('all'); setRoleFilter('all'); setGenderFilter('all'); setLiveInFilter('all'); setSearchTerm(''); setPage(1); }}
              className="text-sm font-medium text-blue-600 hover:underline"
            >
              Clear
            </button>
          )}
        </div>
        <p className="mt-2 text-xs text-slate-400">
          Showing <span className="font-medium text-slate-600">{filteredStaff.length}</span> of{' '}
          <span className="font-medium text-slate-600">{pagination.total_count}</span> staff
        </p>
      </div>

      {/* ── Shift staff queue (SHIFT_BASED only) ── */}
      {isShiftBased && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-violet-200 bg-violet-50 px-5 py-3">
          <div className="text-sm text-violet-800">
            {selectedQueue.length === 0 ? (
              <span>This is a shift-based booking — add one staff member per shift, in order, then proceed.</span>
            ) : (
              <span>
                <span className="font-semibold">{selectedQueue.length}</span> staff queued for shifts:{' '}
                {selectedQueue.map((m) => m.full_name).join(' → ')}
              </span>
            )}
          </div>
          <button
            onClick={proceedWithQueue}
            disabled={selectedQueue.length === 0}
            className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            Proceed to shift assignment ({selectedQueue.length})
          </button>
        </div>
      )}

      {/* ── Staff List ── */}
      {staffLoading ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 shadow-sm">
          Loading staff roster…
        </div>
      ) : filteredStaff.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-slate-500 shadow-sm">
          <AlertCircle className="mx-auto mb-3 h-8 w-8 text-slate-300" />
          <p className="font-medium text-slate-600">No staff match the selected filters.</p>
          <p className="mt-1 text-sm">Try adjusting the search or filter criteria above.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          {/* Table header */}
          <div className="hidden grid-cols-[2.5rem_1fr_10rem_8rem_8rem_7rem_10rem] items-center gap-4 border-b border-slate-100 bg-slate-50 px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 lg:grid">
            <span />
            <span>Staff Member</span>
            <span>Role</span>
            <span>Status</span>
            <span>Gender</span>
            <span>Mobile</span>
            <span />
          </div>

          <ul className="divide-y divide-slate-100">
            {filteredStaff.map((member) => {
              const isPreferred = member.staff_profile_id === preferredStaffId;
              const roles = Array.isArray(member.role)
                ? member.role
                : String(member.role || '').replace(/[{}"]/g, '').split(',').filter(Boolean);
              const initials = member.full_name
                ? member.full_name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()
                : '?';

              return (
                <li
                  key={member.staff_profile_id}
                  className={`flex flex-col gap-4 px-5 py-4 transition-colors hover:bg-slate-50 lg:grid lg:grid-cols-[2.5rem_1fr_10rem_8rem_8rem_7rem_10rem] lg:items-center lg:gap-4 ${isPreferred ? 'bg-amber-50 hover:bg-amber-50' : ''}`}
                >
                  {/* Avatar */}
                  <div className="hidden lg:flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-200 text-xs font-bold text-slate-600 overflow-hidden">
                    {member.profile_picture_url
                      ? <img src={member.profile_picture_url} alt={member.full_name} className="h-9 w-9 object-cover" />
                      : initials}
                  </div>

                  {/* Name + meta */}
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="flex lg:hidden h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-200 text-xs font-bold text-slate-600 overflow-hidden">
                        {member.profile_picture_url
                          ? <img src={member.profile_picture_url} alt={member.full_name} className="h-8 w-8 object-cover" />
                          : initials}
                      </div>
                      <span className="font-semibold text-slate-900 truncate">{member.full_name}</span>
                      {isPreferred && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                          <Star className="h-3 w-3" /> Preferred
                        </span>
                      )}
                      {member.willing_to_live_in && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-teal-200 bg-teal-50 px-2 py-0.5 text-xs font-medium text-teal-700">
                          <Home className="h-3 w-3" /> Live-in
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500 truncate">
                      {member.designation || 'Staff Member'}
                      {(member.location || member.home_address) && (
                        <span className="ml-2 inline-flex items-center gap-1 text-slate-400">
                          <MapPin className="h-3 w-3" />
                          {member.location || member.home_address}
                        </span>
                      )}
                    </p>
                    {/* Mobile row – visible on small screens only */}
                    {member.email && (
                      <p className="mt-0.5 text-xs text-slate-400 lg:hidden truncate">
                        <Mail className="inline h-3 w-3 mr-1" />{member.email}
                      </p>
                    )}
                  </div>

                  {/* Role tags */}
                  <div className="flex flex-wrap gap-1">
                    {roles.length > 0
                      ? roles.map((r) => (
                          <span key={r} className="rounded-md border border-slate-200 bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                            {humanize(r)}
                          </span>
                        ))
                      : <span className="text-xs text-slate-400">—</span>}
                  </div>

                  {/* Status */}
                  <div>
                    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${statusColor[member.current_status] || 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                      {statusIcon[member.current_status] || <AlertCircle className="w-3.5 h-3.5" />}
                      {humanize(member.current_status) || 'Unknown'}
                    </span>
                  </div>

                  {/* Gender */}
                  <div className="text-sm text-slate-700">
                    <span className="flex items-center gap-1.5">
                      <User className="h-3.5 w-3.5 text-slate-400" />
                      {humanize(member.gender) || '—'}
                    </span>
                  </div>

                  {/* Mobile */}
                  <div className="text-sm text-slate-700">
                    {member.mobile_number
                      ? <span className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5 text-slate-400" />{member.mobile_number}</span>
                      : <span className="text-slate-400">—</span>}
                  </div>

                  {/* Action */}
                  <div className="flex flex-col items-stretch gap-2 lg:items-end">
                    {isShiftBased ? (() => {
                      const queueIndex = selectedQueue.findIndex((m) => m.staff_profile_id === member.staff_profile_id);
                      const queued = queueIndex !== -1;
                      return (
                        <button
                          onClick={() => toggleQueueStaff(member)}
                          className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                            queued
                              ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                              : isPreferred
                                ? 'bg-amber-500 text-white hover:bg-amber-600'
                                : 'bg-blue-600 text-white hover:bg-blue-700'
                          }`}
                        >
                          {queued ? `✓ Shift ${queueIndex + 1} · Remove` : 'Add to shifts'}
                        </button>
                      );
                    })() : (
                      <button
                        onClick={() => selectStaff(member)}
                        className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                          isPreferred
                            ? 'bg-amber-500 text-white hover:bg-amber-600'
                            : 'bg-blue-600 text-white hover:bg-blue-700'
                        }`}
                      >
                        Select
                      </button>
                    )}
                    {requestId && (
                      sentCandidateIds.has(member.staff_profile_id) ? (
                        <span
                          className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700"
                          title="This profile has already been sent to the client"
                        >
                          <Check className="h-3.5 w-3.5" /> Sent to client
                        </span>
                      ) : (
                        <button
                          onClick={() => handleSendCandidate(member)}
                          disabled={sendingCandidateId === member.staff_profile_id}
                          className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-emerald-200 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-60 disabled:cursor-not-allowed"
                          title="Send this candidate's profile to the client via WhatsApp"
                        >
                          {sendingCandidateId === member.staff_profile_id
                            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            : <Send className="h-3.5 w-3.5" />}
                          Send to client
                        </button>
                      )
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* ── Pagination ── */}
      {!staffLoading && pagination.total_pages > 1 && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <p className="text-sm text-slate-500">
            Page <span className="font-semibold text-slate-900">{pagination.current_page}</span> of{' '}
            <span className="font-semibold text-slate-900">{pagination.total_pages}</span>
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={!pagination.has_prev}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Previous
            </button>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={!pagination.has_next}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </AdminLayout>
  );
};

/* ── Small sub-components ── */

const SectionHeading = ({ icon: Icon, label }) => (
  <div className="flex items-center gap-2">
    <Icon className="h-3.5 w-3.5 text-slate-400" />
    <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</span>
  </div>
);

const DetailField = ({ label, value }) => (
  <div>
    <dt className="text-xs font-medium text-slate-400">{label}</dt>
    <dd className="mt-1 text-sm font-medium text-slate-800">
      {value != null && value !== '' ? String(value) : <span className="font-normal text-slate-400">—</span>}
    </dd>
  </div>
);

const QuoteStat = ({ label, value, accent = 'text-slate-900' }) => (
  <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
    <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
    <p className={`mt-1 text-sm font-semibold ${accent}`}>{value}</p>
  </div>
);

const FilterSelect = ({ value, onChange, children, className = '' }) => (
  <select
    value={value}
    onChange={(e) => onChange(e.target.value)}
    className={`rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-600 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 ${className}`}
  >
    {children}
  </select>
);

export default BookingStaffRosterPage;
