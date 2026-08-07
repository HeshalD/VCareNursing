import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, RefreshCw, Users, CalendarDays, CircleDollarSign, Clock3,
  AlertCircle, StickyNote, Plus, Trash2, Pencil, Check, X, Briefcase, Search,
  CheckCircle,
} from 'lucide-react';
import AdminLayout from '../components/AdminLayout';
import apiClient from '../../../api/api';
import StaffScheduleTimeline from '../components/StaffScheduleTimeline';
import RequestPipelineStepper from '../components/RequestPipelineStepper';

const money = (value) =>
  `LKR ${parseFloat(value || 0).toLocaleString('en-LK', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

// Formats raw digits typed by the user into a DD/MM/YYYY masked string
const maskDateInput = (raw) => {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
};

// Converts a DD/MM/YYYY string into YYYY-MM-DD for the backend (empty string if invalid/incomplete)
const formatDateForBackend = (value) => {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value || '');
  if (!match) return '';
  const [, day, month, year] = match;
  return `${year}-${month}-${day}`;
};

// Converts a backend date (often a full UTC timestamp, e.g. "2026-07-13T18:30:00.000Z"
// for a local 14/07 date) into DD/MM/YYYY for display/editing. Must go through
// Date so the value resolves in the browser's timezone — slicing the raw ISO
// string reads the UTC day, which is one day early for timezones ahead of UTC.
const formatDateForDisplay = (value) => {
  if (!value) return '';
  const d = new Date(value);
  if (isNaN(d)) return '';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

const NOTE_TYPE_LABEL = {
  GENERAL: 'General',
  MEDICAL: 'Medical',
  BILLING: 'Billing',
  URGENT:  'Urgent',
};

const BookingStaffAssignmentPage = () => {
  const { bookingId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState('');
  const [success,    setSuccess]    = useState('');
  const [formData,   setFormData]   = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const [assignment, setAssignment] = useState({
    staff_profile_id:    location.state?.selectedStaff?.staff_profile_id || '',
    service_start_date:  '',
    service_start_time:  '',
    assigned_hours:      '',
    daily_rate:          '',
    ot_rate:             '',
    notes:               '',
    salesperson_id:      '',
    is_hospitalized:     false,
    hospital_name:       '',
  });

  const [salespersons, setSalespersons] = useState([]);

  const cascadeStartTimes = (slots, fromIdx = 0) => {
    const result = [...slots];
    for (let i = fromIdx; i < result.length - 1; i++) {
      const [h, m] = (result[i].start_time || '00:00').split(':').map(Number);
      const totalMins = (h * 60 + m + Math.round(parseFloat(result[i].duration_hours || 0) * 60)) % 1440;
      result[i + 1] = { ...result[i + 1], start_time: `${String(Math.floor(totalMins / 60)).padStart(2, '0')}:${String(totalMins % 60).padStart(2, '0')}` };
    }
    return result;
  };

  const buildDefaultShiftSlots = (count) => {
    const dur = (24 / count).toFixed(1);
    const base = Array.from({ length: count }, (_, i) => ({
      shift_number: i + 1,
      start_time: '08:00',
      duration_hours: dur,
      label: `Shift ${i + 1}`,
      staff_profile_id: '',
      daily_rate: '',
    }));
    return cascadeStartTimes(base, 0);
  };

  const [shiftSlots, setShiftSlots] = useState(() => {
    // Resuming a paused SHIFT_BASED booking passes the exact pre-pause shift times/
    // labels/staff (see BookingDetailPageV2.handleResume) — restores "left off
    // exactly as it was", still fully editable including swapping staff.
    const restored = location.state?.selectedShiftSlots;
    if (Array.isArray(restored) && restored.length > 0) {
      return restored.map((s, i) => ({
        shift_number: s.shift_number || i + 1,
        start_time: (s.start_time || '08:00').slice(0, 5),
        duration_hours: s.duration_hours != null ? String(s.duration_hours) : '',
        label: s.label || `Shift ${s.shift_number || i + 1}`,
        staff_profile_id: s.staff_profile_id || '',
        daily_rate: '',
      }));
    }
    const queue = location.state?.selectedStaffQueue;
    if (Array.isArray(queue) && queue.length > 0) {
      return buildDefaultShiftSlots(queue.length).map((s, i) => ({
        ...s,
        staff_profile_id: queue[i]?.staff_profile_id || '',
      }));
    }
    return buildDefaultShiftSlots(2);
  });

  const [notes,          setNotes]          = useState([]);
  const [notesLoading,   setNotesLoading]   = useState(false);
  const [noteText,       setNoteText]       = useState('');
  const [noteType,       setNoteType]       = useState('GENERAL');
  const [noteSubmitting, setNoteSubmitting] = useState(false);
  const [noteError,      setNoteError]      = useState('');
  const [editingNoteId,  setEditingNoteId]  = useState(null);
  const [editNoteText,   setEditNoteText]   = useState('');
  const [editNoteType,   setEditNoteType]   = useState('GENERAL');

  const selectedStaff = useMemo(
    () =>
      formData?.available_staff?.find((s) => s.staff_profile_id === assignment.staff_profile_id) ||
      location.state?.selectedStaff ||
      null,
    [formData, assignment.staff_profile_id, location.state],
  );

  const isShiftBased = formData?.booking?.service_model === 'SHIFT_BASED';
  const isLiveIn     = formData?.booking?.service_model === 'LIVE_IN';

  // How many shifts the client's payments cover — amount paid ÷ per-shift rate.
  // (bookings.amount_paid mirrors verified quote payments on conversion; fall back
  // to payment_info.total_verified for bookings where it hasn't been synced.)
  const shiftsPaid = useMemo(() => {
    const rate = parseFloat(formData?.booking?.shift_rate) || 0;
    if (!rate) return null;
    const paid = parseFloat(formData?.booking?.amount_paid) || parseFloat(formData?.payment_info?.total_verified) || 0;
    return Math.floor(paid / rate);
  }, [formData]);

  const handleShiftCountChange = (count) => {
    setShiftSlots((prev) => {
      const next = buildDefaultShiftSlots(count);
      for (let i = 0; i < Math.min(prev.length, count); i++) next[i] = prev[i];
      return next;
    });
  };

  const updateShiftSlot = (idx, field, value) =>
    setShiftSlots((prev) => {
      const updated = prev.map((s, i) => (i === idx ? { ...s, [field]: value } : s));
      return (field === 'start_time' || field === 'duration_hours') ? cascadeStartTimes(updated, idx) : updated;
    });

  const fetchData = async () => {
    try {
      setLoading(true);
      setError('');
      const response = await apiClient.getBookingAssignmentFormData(bookingId);
      setFormData(response.data || null);
      setAssignment((cur) => ({
        ...cur,
        service_start_date: cur.service_start_date || formatDateForDisplay(response.data?.booking?.start_date) || '',
        daily_rate:         cur.daily_rate          || response.data?.booking?.quote_daily_rate || '',
        is_hospitalized:    response.data?.booking?.is_hospitalized || false,
        hospital_name:      response.data?.booking?.hospital_name || '',
      }));
    } catch (err) {
      setError(err.message || 'Failed to load assignment form');
    } finally {
      setLoading(false);
    }
  };

  const fetchSalespersons = async () => {
    try {
      const response = await apiClient.getSalespersons();
      setSalespersons(response.data || []);
    } catch { /* non-fatal */ }
  };

  const fetchNotes = async () => {
    try {
      setNotesLoading(true);
      const response = await apiClient.getBookingNotes(bookingId);
      setNotes(response.data || []);
    } catch { /* non-fatal */ } finally {
      setNotesLoading(false);
    }
  };

  useEffect(() => {
    if (bookingId) { fetchData(); fetchNotes(); fetchSalespersons(); }
  }, [bookingId]);

  // Pre-select the salesperson currently assigned to this booking's client, so the
  // admin doesn't have to look it up manually — still fully changeable via the picker.
  useEffect(() => {
    const clientId = formData?.booking?.client_id;
    if (!clientId) return;
    apiClient.getClientSalesperson(clientId)
      .then((response) => {
        const currentSalespersonId = response?.data?.current?.salesperson_id;
        if (!currentSalespersonId) return;
        setAssignment((prev) => (prev.salesperson_id ? prev : { ...prev, salesperson_id: currentSalespersonId }));
      })
      .catch(() => { /* non-fatal */ });
  }, [formData?.booking?.client_id]);

  // Batched schedule lookup for every candidate on this form — lets the admin see
  // each staff member's existing/upcoming commitments before assigning them here.
  const [schedules, setSchedules] = useState({});
  const [schedulesLoading, setSchedulesLoading] = useState(false);

  useEffect(() => {
    const ids = (formData?.available_staff || []).map((s) => s.staff_profile_id);
    if (ids.length === 0) { setSchedules({}); return; }
    setSchedulesLoading(true);
    apiClient.getStaffSchedules(ids)
      .then((res) => setSchedules(res?.data || {}))
      .catch(() => setSchedules({}))
      .finally(() => setSchedulesLoading(false));
  }, [formData]);

  const handleSubmitShiftBased = async () => {
    if (!assignment.service_start_date) { setError('Service start date is required'); return; }
    const isoStartDate = formatDateForBackend(assignment.service_start_date);
    if (!isoStartDate) { setError('Enter a valid Service Start Date as DD/MM/YYYY'); return; }
    if (shiftSlots.some((s) => !s.staff_profile_id || !s.start_time || !s.duration_hours)) {
      setError('Every shift needs a start time, duration, and assigned staff member');
      return;
    }
    setSubmitting(true); setError(''); setSuccess('');
    try {
      const patternRes = await apiClient.createShiftPattern(bookingId, {
        shift_count: shiftSlots.length,
        slots: shiftSlots.map((s) => ({
          shift_number:   s.shift_number,
          start_time:     `${s.start_time}:00`,
          duration_hours: parseFloat(s.duration_hours),
          label:          s.label || null,
        })),
        effective_from_date: isoStartDate,
      });

      // Use slots from the create response — avoids a second round-trip and works
      // for SCHEDULED patterns (PENDING bookings with a future start date) where
      // GET /shift-slots only returns ACTIVE pattern slots.
      const createdSlots = patternRes?.data?.pattern?.slots || [];

      for (const slot of shiftSlots) {
        const created = createdSlots.find((c) => c.shift_number === slot.shift_number);
        if (!created) continue;
        await apiClient.assignStaffToShiftSlot(bookingId, created.shift_slot_id, {
          staff_profile_id:   slot.staff_profile_id,
          service_start_date: isoStartDate,
          daily_rate:         slot.daily_rate ? parseFloat(slot.daily_rate) : null,
          notes:              assignment.notes || null,
        });
      }

      if (assignment.salesperson_id) {
        try { await apiClient.creditBookingSalesperson(bookingId, assignment.salesperson_id); }
        catch { /* non-fatal */ }
      }

      try {
        await apiClient.updateBookingHospitalization(bookingId, {
          is_hospitalized: assignment.is_hospitalized,
          hospital_name:   assignment.hospital_name || null,
        });
      } catch { /* non-fatal */ }

      setSuccess('Shift pattern created and staff assigned successfully.');
      setTimeout(() => navigate(`/admin/bookings/${bookingId}/detail`), 1500);
    } catch (err) {
      setError(err.message || 'Failed to set up shifts');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (isShiftBased) { await handleSubmitShiftBased(); return; }
    if (!assignment.staff_profile_id) { setError('Select a staff member'); return; }
    const isoStartDate = formatDateForBackend(assignment.service_start_date);
    if (!isoStartDate) { setError('Enter a valid Service Start Date as DD/MM/YYYY'); return; }
    try {
      setSubmitting(true); setError(''); setSuccess('');
      await apiClient.assignStaffToBooking(bookingId, {
        staff_profile_id:   assignment.staff_profile_id,
        service_start_date: isoStartDate,
        service_start_time: assignment.service_start_time || null,
        assigned_hours:     isLiveIn ? 24 : (assignment.assigned_hours ? parseFloat(assignment.assigned_hours) : null),
        daily_rate:         assignment.daily_rate  ? parseFloat(assignment.daily_rate)  : null,
        ot_rate:            assignment.ot_rate     ? parseFloat(assignment.ot_rate)     : null,
        notes:              assignment.notes       || null,
        salesperson_id:     assignment.salesperson_id || null,
      });
      try {
        await apiClient.updateBookingHospitalization(bookingId, {
          is_hospitalized: assignment.is_hospitalized,
          hospital_name:   assignment.hospital_name || null,
        });
      } catch { /* non-fatal */ }
      setSuccess('Staff assigned successfully.');
      setTimeout(() => navigate(`/admin/bookings/${bookingId}/detail`), 1500);
    } catch (err) {
      setError(err.message || 'Failed to assign staff');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddNote = async () => {
    if (!noteText.trim()) return;
    try {
      setNoteSubmitting(true); setNoteError('');
      const response = await apiClient.addBookingNote(bookingId, { note_text: noteText, note_type: noteType });
      setNotes((prev) => [response.data, ...prev]);
      setNoteText(''); setNoteType('GENERAL');
    } catch (err) {
      setNoteError(err.message || 'Failed to add note');
    } finally {
      setNoteSubmitting(false);
    }
  };

  const handleDeleteNote = async (noteId) => {
    try {
      await apiClient.deleteBookingNote(bookingId, noteId);
      setNotes((prev) => prev.filter((n) => n.note_id !== noteId));
    } catch (err) {
      setNoteError(err.message || 'Failed to delete note');
    }
  };

  const startEdit  = (note) => { setEditingNoteId(note.note_id); setEditNoteText(note.note_text); setEditNoteType(note.note_type); };
  const cancelEdit = ()     => { setEditingNoteId(null); setEditNoteText(''); setEditNoteType('GENERAL'); };

  // Same 5-phase pipeline shown on ServiceRequestSummaryPage / BookingStaffRosterPage
  // — this page is reached once a booking already exists, so it's normally sitting
  // at "Booking Created" (4) while the form is filled in, moving to "Staff Assigned"
  // (5) once submission flips the booking's status to ACTIVE.
  const pipelineCompletedCount = useMemo(() => {
    const booking = formData?.booking;
    if (!booking) return 4;
    const quotationSent = Boolean(booking.request_id) || Boolean(booking.quote_id);
    const paymentMade = (parseFloat(booking.amount_paid) || 0) > 0;
    const staffAssigned = booking.booking_status === 'ACTIVE';
    let count = 1; // New Lead is always true once a request exists
    if (quotationSent) count = 2;
    if (paymentMade) count = 3;
    count = Math.max(count, 4); // a booking already exists on this page
    if (staffAssigned) count = 5;
    return count;
  }, [formData]);

  const handleSaveEdit = async (noteId) => {
    if (!editNoteText.trim()) return;
    try {
      const response = await apiClient.updateBookingNote(bookingId, noteId, {
        note_text: editNoteText, note_type: editNoteType,
      });
      setNotes((prev) => prev.map((n) => (n.note_id === noteId ? response.data : n)));
      cancelEdit();
    } catch (err) {
      setNoteError(err.message || 'Failed to update note');
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <AdminLayout
      title="Staff Assignment"
      subtitle="Complete the final assignment form for the selected booking."
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
      {success && (
        <div className="mb-4 flex items-center gap-2 rounded-md border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700">
          <CheckCircle className="h-4 w-4 shrink-0 text-green-500" />
          <span className="flex-1">{success}</span>
        </div>
      )}

      {loading ? (
        <div className="rounded-lg border border-gray-200 bg-white p-6 text-sm text-gray-400">
          Loading assignment form…
        </div>
      ) : !formData ? (
        <div className="rounded-lg border border-gray-200 bg-white p-6 text-sm text-gray-400">
          Assignment data not found.
        </div>
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-5">

            {/* ── Left column ── */}
            <div className="space-y-5 lg:col-span-4">

              {/* Booking summary */}
              <div className="rounded-lg border border-gray-200 bg-white p-5">
                <h3 className="text-sm font-semibold text-gray-800">Booking Summary</h3>
                <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <Stat label="Client"       value={formData.booking.client_name} />
                  <Stat label="Care Profile" value={formData.booking.patient_name} />
                  <Stat label="Service"      value={formData.booking.service_type} />
                  <Stat label="Status"       value={formData.booking.booking_status} />
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <Stat
                    label="Start Date"
                    value={
                      formData.booking.start_date
                        ? new Date(formData.booking.start_date).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })
                        : 'N/A'
                    }
                  />
                  <Stat label="Paid"       value={money(formData.booking.amount_paid)} />
                  <Stat label="Quoted"     value={money(formData.booking.amount_quotated)} />
                  {isShiftBased ? (
                    <>
                      <Stat label="Shift Rate" value={money(formData.booking.shift_rate || 0)} />
                      <Stat
                        label="Shifts Paid"
                        value={shiftsPaid !== null ? `${shiftsPaid} shift${shiftsPaid !== 1 ? 's' : ''}` : 'N/A'}
                      />
                    </>
                  ) : (
                    <Stat label="Daily Rate" value={money(formData.booking.quote_daily_rate || 0)} />
                  )}
                </div>
              </div>

              {/* Assignment form */}
              <form onSubmit={handleSubmit} className="rounded-lg border border-gray-200 bg-white p-5 space-y-5">
                <h3 className="text-sm font-semibold text-gray-800">
                  {isShiftBased ? 'Shift Pattern & Staff' : 'Assignment Details'}
                </h3>

                {/* Staff member select (non-shift) */}
                {!isShiftBased && (
                  <FormField label="Staff Member">
                    <StaffPicker
                      staff={formData.available_staff}
                      value={assignment.staff_profile_id}
                      onChange={(id) => setAssignment({ ...assignment, staff_profile_id: id })}
                    />
                    {assignment.staff_profile_id && (
                      <div className="mt-2 rounded-md border border-gray-100 bg-gray-50 p-2.5">
                        <StaffScheduleTimeline
                          schedule={schedules[assignment.staff_profile_id] || []}
                          loading={schedulesLoading}
                          referenceDate={formatDateForBackend(assignment.service_start_date)}
                          compact
                        />
                      </div>
                    )}
                  </FormField>
                )}

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <FormField label="Service Start Date">
                    <input
                      required
                      type="text"
                      inputMode="numeric"
                      placeholder="DD/MM/YYYY"
                      maxLength={10}
                      value={assignment.service_start_date}
                      onChange={(e) => setAssignment({ ...assignment, service_start_date: maskDateInput(e.target.value) })}
                      className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    />
                    {isShiftBased && (
                      <p className="mt-1 text-xs text-gray-400">Used as the shift pattern's effective date and each shift's start date.</p>
                    )}
                  </FormField>

                  {!isShiftBased && (
                    <FormField label="Service Start Time">
                      <input
                        type="time"
                        value={assignment.service_start_time}
                        onChange={(e) => setAssignment({ ...assignment, service_start_time: e.target.value })}
                        className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                      />
                      <p className="mt-1 text-xs text-gray-400">Sent in the booking confirmation to staff and client.</p>
                    </FormField>
                  )}

                  {!isShiftBased && !isLiveIn && (
                    <FormField label="Assigned Hours (per day)">
                      <input
                        type="number"
                        min="0"
                        max="24"
                        step="0.5"
                        value={assignment.assigned_hours}
                        onChange={(e) => setAssignment({ ...assignment, assigned_hours: e.target.value })}
                        onWheel={(e) => e.currentTarget.blur()}
                        className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                        placeholder="e.g. 8"
                      />
                      <p className="mt-1 text-xs text-gray-400">Expected hours worked per day — used to compare against logged attendance.</p>
                    </FormField>
                  )}

                  {!isShiftBased && (
                    <>
                      <FormField label="Daily Rate (Staff)">
                        <input
                          required
                          type="number"
                          min="0"
                          step="0.01"
                          value={assignment.daily_rate}
                          onChange={(e) => setAssignment({ ...assignment, daily_rate: e.target.value })}
                          onWheel={(e) => e.currentTarget.blur()}
                          className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                        />
                      </FormField>
                      <FormField label="OT Rate">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={assignment.ot_rate}
                          onChange={(e) => setAssignment({ ...assignment, ot_rate: e.target.value })}
                          onWheel={(e) => e.currentTarget.blur()}
                          className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                        />
                      </FormField>
                    </>
                  )}

                  <FormField label="Notes" className={!isShiftBased ? 'sm:col-span-2' : ''}>
                    <input
                      value={assignment.notes}
                      onChange={(e) => setAssignment({ ...assignment, notes: e.target.value })}
                      className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                      placeholder="Optional note for this assignment"
                    />
                  </FormField>
                </div>

                {/* Hospitalization status */}
                <div className="rounded-md border border-gray-200 bg-gray-50 p-4">
                  <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                    <input
                      type="checkbox"
                      checked={assignment.is_hospitalized}
                      onChange={(e) => setAssignment({
                        ...assignment,
                        is_hospitalized: e.target.checked,
                        hospital_name: e.target.checked ? assignment.hospital_name : '',
                      })}
                      className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    Patient is currently hospitalized
                  </label>
                  {assignment.is_hospitalized && (
                    <input
                      type="text"
                      value={assignment.hospital_name}
                      onChange={(e) => setAssignment({ ...assignment, hospital_name: e.target.value })}
                      placeholder="Hospital name"
                      className="mt-2.5 w-full rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    />
                  )}
                </div>

                {/* Shift slots (SHIFT_BASED) */}
                {isShiftBased && (
                  <div className="rounded-md border border-gray-200 overflow-hidden">
                    {/* Header row */}
                    <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50 px-4 py-2.5">
                      <p className="text-[11px] font-medium uppercase tracking-wider text-gray-400">Shift Schedule</p>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500">Shifts per day</span>
                        <select
                          value={shiftSlots.length}
                          onChange={(e) => handleShiftCountChange(parseInt(e.target.value, 10))}
                          className="rounded-md border border-gray-200 bg-white px-2.5 py-1 text-sm text-gray-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                        >
                          {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}
                        </select>
                      </div>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-gray-100 bg-gray-50">
                            <th className="px-4 py-2.5 text-left text-[11px] font-medium uppercase tracking-wider text-gray-400 w-16">Shift</th>
                            <th className="px-3 py-2.5 text-left text-[11px] font-medium uppercase tracking-wider text-gray-400">Label</th>
                            <th className="px-3 py-2.5 text-left text-[11px] font-medium uppercase tracking-wider text-gray-400 w-32">Start Time</th>
                            <th className="px-3 py-2.5 text-left text-[11px] font-medium uppercase tracking-wider text-gray-400 w-28">Duration (hrs)</th>
                            <th className="px-3 py-2.5 text-left text-[11px] font-medium uppercase tracking-wider text-gray-400">Staff Member</th>
                            <th className="px-3 py-2.5 text-left text-[11px] font-medium uppercase tracking-wider text-gray-400 w-36">Rate (LKR)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 bg-white">
                          {shiftSlots.map((slot, idx) => {
                            const defaultRate = formData.booking.quote_daily_rate
                              ? (formData.booking.quote_daily_rate / shiftSlots.length).toFixed(2)
                              : '';
                            return (
                              <tr key={slot.shift_number} className="hover:bg-gray-50 transition-colors">
                                <td className="px-4 py-3">
                                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-gray-100 text-xs font-semibold text-gray-600">
                                    {slot.shift_number}
                                  </span>
                                </td>
                                <td className="px-3 py-2.5">
                                  <input
                                    value={slot.label}
                                    onChange={(e) => updateShiftSlot(idx, 'label', e.target.value)}
                                    className="w-full rounded-md border border-gray-200 px-2.5 py-1.5 text-sm text-gray-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                                    placeholder={`Shift ${slot.shift_number}`}
                                  />
                                </td>
                                <td className="px-3 py-2.5">
                                  <input
                                    required
                                    type="time"
                                    value={slot.start_time}
                                    onChange={(e) => updateShiftSlot(idx, 'start_time', e.target.value)}
                                    className="w-full rounded-md border border-gray-200 px-2.5 py-1.5 text-sm text-gray-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                                  />
                                  {idx > 0 && <span className="text-[10px] text-blue-400 mt-0.5 block">auto</span>}
                                </td>
                                <td className="px-3 py-2.5">
                                  <input
                                    required
                                    type="number"
                                    min="0.5"
                                    step="0.5"
                                    value={slot.duration_hours}
                                    onChange={(e) => updateShiftSlot(idx, 'duration_hours', e.target.value)}
                                    onWheel={(e) => e.currentTarget.blur()}
                                    className="w-full rounded-md border border-gray-200 px-2.5 py-1.5 text-sm text-gray-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                                  />
                                </td>
                                <td className="px-3 py-2.5 min-w-[220px]">
                                  <StaffPicker
                                    staff={formData.available_staff}
                                    value={slot.staff_profile_id}
                                    onChange={(id) => updateShiftSlot(idx, 'staff_profile_id', id)}
                                    compact
                                  />
                                  {slot.staff_profile_id && (
                                    <div className="mt-1.5">
                                      <StaffScheduleTimeline
                                        schedule={schedules[slot.staff_profile_id] || []}
                                        loading={schedulesLoading}
                                        referenceDate={formatDateForBackend(assignment.service_start_date)}
                                        compact
                                      />
                                    </div>
                                  )}
                                </td>
                                <td className="px-3 py-2.5">
                                  <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    placeholder={defaultRate || '0.00'}
                                    value={slot.daily_rate}
                                    onChange={(e) => updateShiftSlot(idx, 'daily_rate', e.target.value)}
                                    onWheel={(e) => e.currentTarget.blur()}
                                    className="w-full rounded-md border border-gray-200 px-2.5 py-1.5 text-sm text-gray-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                                  />
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    <div className="border-t border-gray-100 bg-gray-50 px-4 py-2">
                      <p className="text-xs text-gray-400">
                        Rate defaults to the quote daily rate split evenly across shifts if left blank.
                      </p>
                    </div>
                  </div>
                )}

                {/* Salesperson */}
                <div>
                  <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-gray-700">
                    <Briefcase className="h-3.5 w-3.5 text-gray-400" />
                    Credited Salesperson
                  </label>
                  <SalespersonPicker
                    salespersons={salespersons}
                    value={assignment.salesperson_id}
                    onChange={(id) => setAssignment({ ...assignment, salesperson_id: id })}
                  />
                  <p className="mt-1.5 text-xs text-gray-400">
                    The amount paid ({money(formData.booking.amount_paid)}) and a booking count are credited to this salesperson on assignment. Can be switched later from the booking detail page.
                  </p>
                </div>

                {/* Client & Booking Notes */}
                <div className="border-t border-gray-100 pt-5">
                  <div className="flex items-center gap-2 mb-1">
                    <StickyNote className="h-4 w-4 text-gray-400" />
                    <h3 className="text-sm font-semibold text-gray-800">Client &amp; Booking Notes</h3>
                  </div>
                  <p className="text-xs text-gray-400 mb-4">
                    Notes are attached to this booking and also stored against the client's full history.
                  </p>

                  {noteError && (
                    <div className="mb-3 flex items-center gap-2 rounded-md border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700">
                      <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
                      {noteError}
                    </div>
                  )}

                  {/* Add note form */}
                  <div className="rounded-md border border-gray-200 bg-gray-50 p-4 space-y-3 mb-4">
                    <textarea
                      rows={3}
                      value={noteText}
                      onChange={(e) => setNoteText(e.target.value)}
                      placeholder="Write a note about this client or booking…"
                      className="w-full resize-none rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 placeholder-gray-400 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    />
                    <div className="flex items-center gap-2">
                      <select
                        value={noteType}
                        onChange={(e) => setNoteType(e.target.value)}
                        className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-600 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                      >
                        <option value="GENERAL">General</option>
                        <option value="MEDICAL">Medical</option>
                        <option value="BILLING">Billing</option>
                        <option value="URGENT">Urgent</option>
                      </select>
                      <button
                        type="button"
                        onClick={handleAddNote}
                        disabled={noteSubmitting || !noteText.trim()}
                        className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300 transition-colors"
                      >
                        <Plus className="h-4 w-4" />
                        {noteSubmitting ? 'Adding…' : 'Add Note'}
                      </button>
                    </div>
                  </div>

                  {/* Notes list */}
                  <div className="space-y-2">
                    {notesLoading ? (
                      <p className="text-sm text-gray-400">Loading notes…</p>
                    ) : notes.length === 0 ? (
                      <p className="text-sm text-gray-400">No notes yet for this booking.</p>
                    ) : (
                      notes.map((note) => {
                        const isEditing = editingNoteId === note.note_id;
                        return (
                          <div key={note.note_id} className="rounded-md border border-gray-200 bg-white p-4">
                            {isEditing ? (
                              <div className="space-y-3">
                                <textarea
                                  rows={3}
                                  value={editNoteText}
                                  onChange={(e) => setEditNoteText(e.target.value)}
                                  className="w-full resize-none rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                                />
                                <div className="flex items-center gap-2">
                                  <select
                                    value={editNoteType}
                                    onChange={(e) => setEditNoteType(e.target.value)}
                                    className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                                  >
                                    <option value="GENERAL">General</option>
                                    <option value="MEDICAL">Medical</option>
                                    <option value="BILLING">Billing</option>
                                    <option value="URGENT">Urgent</option>
                                  </select>
                                  <button
                                    type="button"
                                    onClick={() => handleSaveEdit(note.note_id)}
                                    className="inline-flex items-center gap-1 rounded-md bg-gray-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-gray-900 transition-colors"
                                  >
                                    <Check className="h-3.5 w-3.5" /> Save
                                  </button>
                                  <button
                                    type="button"
                                    onClick={cancelEdit}
                                    className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors"
                                  >
                                    <X className="h-3.5 w-3.5" /> Cancel
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <>
                                <div className="flex items-start justify-between gap-3">
                                  <p className="text-sm text-gray-800 leading-relaxed">{note.note_text}</p>
                                  <div className="flex shrink-0 items-center gap-1">
                                    <button
                                      type="button"
                                      onClick={() => startEdit(note)}
                                      className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
                                      title="Edit note"
                                    >
                                      <Pencil className="h-3.5 w-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteNote(note.note_id)}
                                      className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
                                      title="Delete note"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  </div>
                                </div>
                                <div className="mt-2 flex items-center gap-2 flex-wrap">
                                  <span className="rounded bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600">
                                    {NOTE_TYPE_LABEL[note.note_type] || note.note_type}
                                  </span>
                                  <span className="text-xs text-gray-400">
                                    {note.created_by_name} &middot;{' '}
                                    {new Date(note.created_at).toLocaleString('en-LK', {
                                      dateStyle: 'medium',
                                      timeStyle: 'short',
                                    })}
                                  </span>
                                  {note.updated_at !== note.created_at && (
                                    <span className="text-xs text-gray-400 italic">(edited)</span>
                                  )}
                                </div>
                              </>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300 transition-colors"
                >
                  <Users className="h-4 w-4" />
                  {submitting
                    ? (isShiftBased ? 'Setting up shifts…' : 'Assigning…')
                    : (isShiftBased ? 'Create Shift Pattern & Assign Staff' : 'Assign Staff Member')}
                </button>
              </form>
            </div>

            {/* ── Right column ── */}
            <div className="space-y-5">

              {/* Selected staff / shift summary */}
              <div className="rounded-lg border border-gray-200 bg-white p-5">
                <h3 className="text-sm font-semibold text-gray-800 mb-4">
                  {isShiftBased ? 'Per-Shift Staff' : 'Selected Staff'}
                </h3>
                {isShiftBased ? (
                  shiftSlots.some((s) => s.staff_profile_id) ? (
                    <div className="space-y-3">
                      {shiftSlots.filter((s) => s.staff_profile_id).map((s) => {
                        const staffMember = formData.available_staff.find((a) => a.staff_profile_id === s.staff_profile_id);
                        return (
                          <div key={s.shift_number} className="border-b border-gray-100 pb-3 last:border-b-0 last:pb-0">
                            <p className="text-[11px] font-medium uppercase tracking-wider text-gray-400">{s.label || `Shift ${s.shift_number}`}</p>
                            <p className="mt-0.5 text-sm font-medium text-gray-900">{staffMember?.staff_name || '—'}</p>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-400">No staff selected for any shift yet.</p>
                  )
                ) : selectedStaff ? (
                  <div className="space-y-0 divide-y divide-gray-100">
                    <DetailRow label="Name"     value={selectedStaff.staff_name || selectedStaff.full_name} />
                    <DetailRow label="Role"     value={selectedStaff.specialization || selectedStaff.designation} />
                    <DetailRow label="Status"   value={selectedStaff.current_status || 'AVAILABLE'} />
                    <DetailRow label="Earnings" value={money(selectedStaff.current_earnings || 0)} />
                  </div>
                ) : (
                  <p className="text-sm text-gray-400">No staff selected yet.</p>
                )}
              </div>

              {/* Guidance notes */}
              <div className="rounded-lg border border-gray-200 bg-white p-5">
                <h3 className="text-sm font-semibold text-gray-800 mb-4">Notes</h3>
                <div className="space-y-3">
                  <div className="flex items-start gap-2.5">
                    <CalendarDays className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-400" />
                    <p className="text-sm text-gray-600">Start date should align with the booking period.</p>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <CircleDollarSign className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-400" />
                    <p className="text-sm text-gray-600">Daily rate defaults from the quotation but can be adjusted before assignment.</p>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <Clock3 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-400" />
                    <p className="text-sm text-gray-600">Submitting this form will update the booking status to ACTIVE.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
};

// ── Sub-components ────────────────────────────────────────────────────────────

const SalespersonPicker = ({ salespersons, value, onChange }) => {
  const [search, setSearch] = useState('');
  const selected = salespersons.find((sp) => sp.id === value) || null;
  const q = search.trim().toLowerCase();

  const matches = useMemo(() => {
    if (!q) return salespersons;
    return salespersons.filter((sp) =>
      `${sp.full_name || ''} ${sp.role || ''} ${sp.email || ''}`.toLowerCase().includes(q),
    );
  }, [salespersons, q]);

  const ordered = selected ? [selected, ...matches.filter((sp) => sp.id !== value)] : matches;
  const visible = q ? matches : ordered.slice(0, 3);

  return (
    <div className="rounded-md border border-gray-200 bg-white overflow-hidden">
      <div className="flex items-center gap-2 border-b border-gray-100 px-3 py-2">
        <Search className="h-3.5 w-3.5 shrink-0 text-gray-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search salespersons by name or role…"
          className="w-full text-sm text-gray-800 placeholder-gray-400 outline-none"
        />
        {value && (
          <button
            type="button"
            onClick={() => onChange('')}
            className="shrink-0 text-xs font-medium text-gray-400 hover:text-gray-700"
          >
            Clear
          </button>
        )}
      </div>

      <div className="max-h-48 overflow-y-auto">
        {salespersons.length === 0 ? (
          <p className="px-3 py-3 text-sm text-gray-400">No salespersons available.</p>
        ) : visible.length === 0 ? (
          <p className="px-3 py-3 text-sm text-gray-400">No matches for &ldquo;{search}&rdquo;.</p>
        ) : (
          visible.map((sp) => {
            const isSel = sp.id === value;
            return (
              <button
                type="button"
                key={sp.id}
                onClick={() => onChange(isSel ? '' : sp.id)}
                className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-gray-50 ${isSel ? 'bg-gray-50' : ''}`}
              >
                <span className="truncate">
                  <span className="font-medium text-gray-900">{sp.full_name}</span>
                  {sp.role && <span className="text-gray-400"> — {sp.role}</span>}
                </span>
                {isSel && <Check className="h-4 w-4 shrink-0 text-blue-600" />}
              </button>
            );
          })
        )}
      </div>

      {!q && salespersons.length > 3 && (
        <p className="border-t border-gray-100 px-3 py-1.5 text-xs text-gray-400">
          Showing {visible.length} of {salespersons.length}. Search to find others.
        </p>
      )}
    </div>
  );
};

// Bolds the portion of `text` that matches the current search query
const HighlightMatch = ({ text, query }) => {
  if (!query) return text;
  const idx = text.toLowerCase().indexOf(query);
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="rounded-sm bg-yellow-100 text-inherit">{text.slice(idx, idx + query.length)}</mark>
      {text.slice(idx + query.length)}
    </>
  );
};

const StaffPicker = ({ staff, value, onChange, compact = false }) => {
  const [search, setSearch] = useState('');
  const [open,   setOpen]   = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const containerRef = useRef(null);
  const listRef = useRef(null);
  const inputRef = useRef(null);

  const selected = staff.find((s) => s.staff_profile_id === value) || null;
  const q = search.trim().toLowerCase();

  const matches = useMemo(() => {
    if (!q) return staff;
    return staff.filter((s) =>
      `${s.staff_code || ''} ${s.staff_name || ''} ${s.mobile_number || ''} ${s.specialization || ''}`
        .toLowerCase()
        .includes(q),
    );
  }, [staff, q]);

  useEffect(() => { setActiveIdx(0); }, [q, open]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.children?.[activeIdx];
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIdx, open]);

  const selectedLabel = selected
    ? `${selected.staff_code ? `${selected.staff_code} — ` : ''}${selected.staff_name}${selected.mobile_number ? ` — ${selected.mobile_number}` : ''}`
    : '';

  const selectStaff = (s) => {
    const isSel = s.staff_profile_id === value;
    onChange(isSel ? '' : s.staff_profile_id);
    setSearch('');
    setOpen(false);
  };

  const handleKeyDown = (e) => {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') { setOpen(true); setSearch(''); }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, matches.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (matches[activeIdx]) selectStaff(matches[activeIdx]);
    } else if (e.key === 'Escape') {
      setOpen(false);
      inputRef.current?.blur();
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <div className={`flex items-center gap-2 rounded-md border bg-white px-2.5 transition-colors ${compact ? 'py-1.5' : 'px-3 py-2'} ${open ? 'border-blue-400 ring-2 ring-blue-100' : 'border-gray-200'}`}>
        <Search className="h-3.5 w-3.5 shrink-0 text-gray-400" />
        <input
          ref={inputRef}
          type="text"
          value={open ? search : selectedLabel}
          onFocus={() => { setOpen(true); setSearch(''); }}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search by employee no., name, or contact number…"
          className="w-full text-sm text-gray-800 placeholder-gray-400 outline-none"
        />
        {matches.length > 0 && open && (
          <span className="shrink-0 text-[11px] tabular-nums text-gray-300">{matches.length}</span>
        )}
        {value && (
          <button
            type="button"
            onClick={() => { onChange(''); setSearch(''); }}
            className="shrink-0 text-xs font-medium text-gray-400 hover:text-gray-700"
          >
            Clear
          </button>
        )}
      </div>

      {open && (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-md border border-gray-200 bg-white shadow-lg">
          <div ref={listRef} className="max-h-72 overflow-y-auto">
            {staff.length === 0 ? (
              <p className="px-3 py-3 text-sm text-gray-400">No staff available.</p>
            ) : matches.length === 0 ? (
              <p className="px-3 py-3 text-sm text-gray-400">No matches for &ldquo;{search}&rdquo;.</p>
            ) : (
              matches.map((s, i) => {
                const isSel = s.staff_profile_id === value;
                const isActive = i === activeIdx;
                return (
                  <button
                    type="button"
                    key={s.staff_profile_id}
                    onMouseEnter={() => setActiveIdx(i)}
                    onClick={() => selectStaff(s)}
                    className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition-colors ${
                      isActive ? 'bg-blue-50' : isSel ? 'bg-gray-50' : ''
                    }`}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        {s.staff_code && (
                          <span className="shrink-0 rounded bg-gray-100 px-1.5 py-0.5 text-[11px] font-mono font-medium text-gray-500">
                            <HighlightMatch text={s.staff_code} query={q} />
                          </span>
                        )}
                        <span className="truncate font-medium text-gray-900">
                          <HighlightMatch text={s.staff_name || ''} query={q} />
                        </span>
                      </span>
                      <span className="mt-0.5 flex items-center gap-2 text-xs text-gray-400">
                        {s.mobile_number && <span><HighlightMatch text={s.mobile_number} query={q} /></span>}
                        {s.specialization && <span>{s.specialization}</span>}
                      </span>
                    </span>
                    {isSel && <Check className="h-4 w-4 shrink-0 text-blue-600" />}
                  </button>
                );
              })
            )}
          </div>
          {!q && staff.length > 0 && (
            <p className="border-t border-gray-100 bg-gray-50 px-3 py-1.5 text-[11px] text-gray-400">
              {staff.length} staff member{staff.length !== 1 ? 's' : ''} — type to filter, ↑↓ to navigate, Enter to select
            </p>
          )}
        </div>
      )}
    </div>
  );
};

const Stat = ({ label, value }) => (
  <div className="rounded-md border border-gray-100 bg-gray-50 px-3 py-2.5">
    <p className="text-[11px] font-medium uppercase tracking-wider text-gray-400">{label}</p>
    <p className="mt-0.5 text-sm font-semibold text-gray-900">{value || 'N/A'}</p>
  </div>
);

const DetailRow = ({ label, value }) => (
  <div className="flex items-center justify-between gap-4 py-2">
    <span className="text-sm text-gray-500">{label}</span>
    <span className="text-sm font-medium text-gray-900">{value || '—'}</span>
  </div>
);

const FormField = ({ label, children, className = '' }) => (
  <div className={className}>
    <label className="mb-1 block text-xs font-medium text-gray-600">{label}</label>
    {children}
  </div>
);

export default BookingStaffAssignmentPage;
