import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, RefreshCw, Users, CalendarDays, CircleDollarSign, Clock3, AlertCircle, StickyNote, Plus, Trash2, Pencil, Check, X, Briefcase, Search } from 'lucide-react';
import AdminLayout from '../components/AdminLayout';
import apiClient from '../../../api/api';

const money = (value) =>
  `LKR ${parseFloat(value || 0).toLocaleString('en-LK', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;

const NOTE_TYPE_STYLES = {
  GENERAL:  { label: 'General',  bg: 'bg-slate-100',  text: 'text-slate-700'  },
  MEDICAL:  { label: 'Medical',  bg: 'bg-blue-100',   text: 'text-blue-700'   },
  BILLING:  { label: 'Billing',  bg: 'bg-amber-100',  text: 'text-amber-700'  },
  URGENT:   { label: 'Urgent',   bg: 'bg-red-100',    text: 'text-red-700'    },
};

const BookingStaffAssignmentPage = () => {
  const { bookingId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [formData, setFormData] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [assignment, setAssignment] = useState({
    staff_profile_id: location.state?.selectedStaff?.staff_profile_id || '',
    service_start_date: '',
    service_start_time: '',
    daily_rate: '',
    ot_rate: '',
    notes: '',
    salesperson_id: ''
  });

  // Salesperson (internal staff) options for crediting
  const [salespersons, setSalespersons] = useState([]);

  // Notes state
  const [notes, setNotes] = useState([]);
  const [notesLoading, setNotesLoading] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [noteType, setNoteType] = useState('GENERAL');
  const [noteSubmitting, setNoteSubmitting] = useState(false);
  const [noteError, setNoteError] = useState('');
  const [editingNoteId, setEditingNoteId] = useState(null);
  const [editNoteText, setEditNoteText] = useState('');
  const [editNoteType, setEditNoteType] = useState('GENERAL');

  const selectedStaff = useMemo(() =>
    formData?.available_staff?.find((staff) => staff.staff_profile_id === assignment.staff_profile_id)
      || location.state?.selectedStaff
      || null,
    [formData, assignment.staff_profile_id, location.state]
  );

  const fetchData = async () => {
    try {
      setLoading(true);
      setError('');
      const response = await apiClient.getBookingAssignmentFormData(bookingId);
      setFormData(response.data || null);
      setAssignment((current) => ({
        ...current,
        service_start_date: current.service_start_date || response.data?.booking?.start_date || '',
        daily_rate: current.daily_rate || response.data?.booking?.quote_daily_rate || ''
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
    } catch {
      // non-fatal — salesperson crediting is optional
    }
  };

  const fetchNotes = async () => {
    try {
      setNotesLoading(true);
      const response = await apiClient.getBookingNotes(bookingId);
      setNotes(response.data || []);
    } catch {
      // non-fatal
    } finally {
      setNotesLoading(false);
    }
  };

  useEffect(() => {
    if (bookingId) {
      fetchData();
      fetchNotes();
      fetchSalespersons();
    }
  }, [bookingId]);

  const handleSubmit = async (event) => {
    event.preventDefault();

    try {
      setSubmitting(true);
      setError('');
      setSuccess('');

      await apiClient.assignStaffToBooking(bookingId, {
        staff_profile_id: assignment.staff_profile_id,
        service_start_date: assignment.service_start_date,
        service_start_time: assignment.service_start_time || null,
        daily_rate: assignment.daily_rate ? parseFloat(assignment.daily_rate) : null,
        ot_rate: assignment.ot_rate ? parseFloat(assignment.ot_rate) : null,
        notes: assignment.notes || null,
        salesperson_id: assignment.salesperson_id || null
      });

      setSuccess('Staff assigned successfully.');
      setTimeout(() => {
        navigate('/admin/service-requests');
      }, 1500);
    } catch (err) {
      setError(err.message || 'Failed to assign staff');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddNote = async () => {
    if (!noteText.trim()) return;
    try {
      setNoteSubmitting(true);
      setNoteError('');
      const response = await apiClient.addBookingNote(bookingId, { note_text: noteText, note_type: noteType });
      setNotes((prev) => [response.data, ...prev]);
      setNoteText('');
      setNoteType('GENERAL');
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

  const startEdit = (note) => {
    setEditingNoteId(note.note_id);
    setEditNoteText(note.note_text);
    setEditNoteType(note.note_type);
  };

  const cancelEdit = () => {
    setEditingNoteId(null);
    setEditNoteText('');
    setEditNoteType('GENERAL');
  };

  const handleSaveEdit = async (noteId) => {
    if (!editNoteText.trim()) return;
    try {
      const response = await apiClient.updateBookingNote(bookingId, noteId, {
        note_text: editNoteText,
        note_type: editNoteType
      });
      setNotes((prev) => prev.map((n) => (n.note_id === noteId ? response.data : n)));
      cancelEdit();
    } catch (err) {
      setNoteError(err.message || 'Failed to update note');
    }
  };

  return (
    <AdminLayout
      title="Staff Assignment"
      subtitle="Complete the final assignment form for the selected booking."
      actions={
        <button
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
      }
    >
      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {success && <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">{success}</div>}

      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500 shadow-sm">Loading assignment form...</div>
      ) : !formData ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500 shadow-sm">Assignment data not found.</div>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="space-y-6 lg:col-span-2">
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h3 className="text-lg font-semibold text-slate-900">Booking Summary</h3>
                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <Stat label="Booking" value={formData.booking.booking_id} />
                  <Stat label="Client" value={formData.booking.client_name} />
                  <Stat label="Care Profile" value={formData.booking.patient_name} />
                  <Stat label="Service" value={formData.booking.service_type} />
                </div>
                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
                  <Stat label="Start Date" value={formData.booking.start_date ? new Date(formData.booking.start_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'N/A'} />
                  <Stat label="Paid" value={money(formData.booking.amount_paid)} />
                  <Stat label="Quotated" value={money(formData.booking.amount_quotated)} />
                  <Stat label="Quote Rate" value={money(formData.booking.quote_daily_rate || 0)} />
                  <Stat label="Booking Status" value={formData.booking.booking_status} />
                </div>
              </div>

              <form onSubmit={handleSubmit} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
                <h3 className="text-lg font-semibold text-slate-900">Assignment Form</h3>

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Staff Member</label>
                  <select
                    required
                    value={assignment.staff_profile_id}
                    onChange={(e) => setAssignment({ ...assignment, staff_profile_id: e.target.value })}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500"
                  >
                    <option value="">Select staff member</option>
                    {formData.available_staff.map((staff) => (
                      <option key={staff.staff_profile_id} value={staff.staff_profile_id}>
                        {staff.staff_name} - {staff.specialization}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">Service Start Date</label>
                    <input
                      required
                      type="date"
                      value={assignment.service_start_date}
                      onChange={(e) => setAssignment({ ...assignment, service_start_date: e.target.value })}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">Service Start Time</label>
                    <input
                      type="time"
                      value={assignment.service_start_time}
                      onChange={(e) => setAssignment({ ...assignment, service_start_time: e.target.value })}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500"
                    />
                    <p className="mt-1 text-xs text-slate-400">Sent to the staff and client in their booking confirmation.</p>
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">Daily Rate assigned to Staff Member</label>
                    <input
                      required
                      type="number"
                      min="0"
                      step="0.01"
                      value={assignment.daily_rate}
                      onChange={(e) => setAssignment({ ...assignment, daily_rate: e.target.value })}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">OT Rate</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={assignment.ot_rate}
                      onChange={(e) => setAssignment({ ...assignment, ot_rate: e.target.value })}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">Notes</label>
                    <input
                      value={assignment.notes}
                      onChange={(e) => setAssignment({ ...assignment, notes: e.target.value })}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1 flex items-center gap-1.5 text-sm font-medium text-slate-700">
                    <Briefcase className="h-4 w-4 text-blue-600" />
                    Credited Salesperson
                  </label>
                  <SalespersonPicker
                    salespersons={salespersons}
                    value={assignment.salesperson_id}
                    onChange={(id) => setAssignment({ ...assignment, salesperson_id: id })}
                  />
                  <p className="mt-1 text-xs text-slate-400">
                    The amount paid ({money(formData.booking.amount_paid)}) and a booking count are credited to this salesperson when staff is assigned. The credited salesperson can be switched later from the booking detail page.
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  <Users className="h-4 w-4" />
                  {submitting ? 'Assigning...' : 'Assign Staff Member'}
                </button>
              </form>
            </div>

            <div className="space-y-6">
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h3 className="mb-4 text-lg font-semibold text-slate-900">Selected Staff</h3>
                {selectedStaff ? (
                  <div className="space-y-2 text-sm">
                    <Detail label="Name" value={selectedStaff.staff_name || selectedStaff.full_name} />
                    <Detail label="Role" value={selectedStaff.specialization || selectedStaff.designation} />
                    <Detail label="Status" value={selectedStaff.current_status || 'AVAILABLE'} />
                    <Detail label="Earnings" value={money(selectedStaff.current_earnings || 0)} />
                  </div>
                ) : (
                  <p className="text-sm text-slate-500">No staff selected yet.</p>
                )}
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h3 className="mb-4 text-lg font-semibold text-slate-900">Assignment Notes</h3>
                <div className="space-y-3 text-sm text-slate-600">
                  <div className="flex items-start gap-2">
                    <CalendarDays className="mt-0.5 h-4 w-4 text-blue-600" />
                    <span>Start date should align with the booking period.</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <CircleDollarSign className="mt-0.5 h-4 w-4 text-blue-600" />
                    <span>Daily rate defaults from the quotation but can be adjusted before assignment.</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <Clock3 className="mt-0.5 h-4 w-4 text-blue-600" />
                    <span>Assignment submission will update the booking status to ACTIVE.</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ── Booking Notes ── */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
              <StickyNote className="h-5 w-5 text-blue-600" />
              Client &amp; Booking Notes
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              Notes are attached to this booking and also stored against the client's full history.
            </p>

            {noteError && (
              <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{noteError}</div>
            )}

            {/* Add note form */}
            <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50 p-4 space-y-3">
              <textarea
                rows={3}
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                placeholder="Write a note about this client or booking..."
                className="w-full resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500"
              />
              <div className="flex items-center gap-3">
                <select
                  value={noteType}
                  onChange={(e) => setNoteType(e.target.value)}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500"
                >
                  <option value="GENERAL">General</option>
                  <option value="MEDICAL">Medical</option>
                  <option value="BILLING">Billing</option>
                  <option value="URGENT">Urgent</option>
                </select>
                <button
                  onClick={handleAddNote}
                  disabled={noteSubmitting || !noteText.trim()}
                  className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  <Plus className="h-4 w-4" />
                  {noteSubmitting ? 'Adding...' : 'Add Note'}
                </button>
              </div>
            </div>

            {/* Notes list */}
            <div className="mt-4 space-y-3">
              {notesLoading ? (
                <p className="text-sm text-slate-500">Loading notes...</p>
              ) : notes.length === 0 ? (
                <p className="text-sm text-slate-500">No notes yet for this booking.</p>
              ) : (
                notes.map((note) => {
                  const style = NOTE_TYPE_STYLES[note.note_type] || NOTE_TYPE_STYLES.GENERAL;
                  const isEditing = editingNoteId === note.note_id;

                  return (
                    <div key={note.note_id} className="rounded-xl border border-slate-200 p-4 space-y-2">
                      {isEditing ? (
                        <>
                          <textarea
                            rows={3}
                            value={editNoteText}
                            onChange={(e) => setEditNoteText(e.target.value)}
                            className="w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500"
                          />
                          <div className="flex items-center gap-2">
                            <select
                              value={editNoteType}
                              onChange={(e) => setEditNoteType(e.target.value)}
                              className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500"
                            >
                              <option value="GENERAL">General</option>
                              <option value="MEDICAL">Medical</option>
                              <option value="BILLING">Billing</option>
                              <option value="URGENT">Urgent</option>
                            </select>
                            <button
                              onClick={() => handleSaveEdit(note.note_id)}
                              className="inline-flex items-center gap-1 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700"
                            >
                              <Check className="h-3.5 w-3.5" /> Save
                            </button>
                            <button
                              onClick={cancelEdit}
                              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                            >
                              <X className="h-3.5 w-3.5" /> Cancel
                            </button>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="flex items-start justify-between gap-3">
                            <p className="text-sm text-slate-800 leading-relaxed">{note.note_text}</p>
                            <div className="flex shrink-0 items-center gap-1">
                              <button
                                onClick={() => startEdit(note)}
                                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                                title="Edit note"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={() => handleDeleteNote(note.note_id)}
                                className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                                title="Delete note"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${style.bg} ${style.text}`}>
                              {style.label}
                            </span>
                            <span className="text-xs text-slate-400">
                              {note.created_by_name} &middot;{' '}
                              {new Date(note.created_at).toLocaleString('en-LK', {
                                dateStyle: 'medium',
                                timeStyle: 'short'
                              })}
                            </span>
                            {note.updated_at !== note.created_at && (
                              <span className="text-xs text-slate-400 italic">(edited)</span>
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
        </div>
      )}
    </AdminLayout>
  );
};

const SalespersonPicker = ({ salespersons, value, onChange }) => {
  const [search, setSearch] = useState('');
  const selected = salespersons.find((sp) => sp.id === value) || null;
  const q = search.trim().toLowerCase();

  const matches = useMemo(() => {
    if (!q) return salespersons;
    return salespersons.filter((sp) =>
      `${sp.full_name || ''} ${sp.role || ''} ${sp.email || ''}`.toLowerCase().includes(q)
    );
  }, [salespersons, q]);

  // Default view: pin the selected one to the top, then show 3 in total.
  // While searching: show every match across all salespersons.
  const ordered = selected ? [selected, ...matches.filter((sp) => sp.id !== value)] : matches;
  const visible = q ? matches : ordered.slice(0, 3);

  return (
    <div className="rounded-lg border border-slate-200">
      <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2">
        <Search className="h-4 w-4 shrink-0 text-slate-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search salespersons by name or role..."
          className="w-full text-sm outline-none placeholder:text-slate-400"
        />
        {value && (
          <button
            type="button"
            onClick={() => onChange('')}
            className="shrink-0 text-xs font-medium text-slate-400 hover:text-red-600"
          >
            Clear
          </button>
        )}
      </div>

      <div className="max-h-56 overflow-y-auto">
        {salespersons.length === 0 ? (
          <p className="px-3 py-3 text-sm text-slate-400">No salespersons available.</p>
        ) : visible.length === 0 ? (
          <p className="px-3 py-3 text-sm text-slate-400">No matches for &ldquo;{search}&rdquo;.</p>
        ) : (
          visible.map((sp) => {
            const isSel = sp.id === value;
            return (
              <button
                type="button"
                key={sp.id}
                onClick={() => onChange(isSel ? '' : sp.id)}
                className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-slate-50 ${isSel ? 'bg-blue-50' : ''}`}
              >
                <span className="truncate">
                  <span className="font-medium text-slate-900">{sp.full_name}</span>
                  {sp.role && <span className="text-slate-400"> — {sp.role}</span>}
                </span>
                {isSel && <Check className="h-4 w-4 shrink-0 text-blue-600" />}
              </button>
            );
          })
        )}
      </div>

      {!q && salespersons.length > 3 && (
        <p className="border-t border-slate-100 px-3 py-1.5 text-xs text-slate-400">
          Showing {visible.length} of {salespersons.length}. Search to find others.
        </p>
      )}
    </div>
  );
};

const Stat = ({ label, value }) => (
  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
    <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
    <p className="mt-1 text-sm font-semibold text-slate-900">{value || 'N/A'}</p>
  </div>
);

const Detail = ({ label, value }) => (
  <div className="flex justify-between gap-4 border-b border-slate-100 py-2 last:border-b-0">
    <span className="text-slate-500">{label}</span>
    <span className="font-medium text-slate-900">{value || '—'}</span>
  </div>
);

export default BookingStaffAssignmentPage;
