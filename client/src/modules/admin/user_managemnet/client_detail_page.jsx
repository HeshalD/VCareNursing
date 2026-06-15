import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  Activity,
  ChevronDown,
  BadgeDollarSign,
  BookOpen,
  Briefcase,
  CalendarDays,
  ClipboardList,
  FileText,
  HeartPulse,
  Home,
  Loader2,
  MapPin,
  Phone,
  Plus,
  ReceiptText,
  ShieldAlert,
  Star,
  Users,
  Wallet,
  Crown,
  Download,
  SendHorizontal,
  StickyNote,
  Pencil,
  Check,
  Trash2,
  X,
} from 'lucide-react';

const NOTE_TYPE_META = {
  GENERAL: { label: 'General', classes: 'bg-slate-100 text-slate-700' },
  MEDICAL: { label: 'Medical', classes: 'bg-blue-100 text-blue-700' },
  BILLING: { label: 'Billing', classes: 'bg-amber-100 text-amber-700' },
  URGENT:  { label: 'Urgent',  classes: 'bg-red-100 text-red-700' },
};
import AdminLayout from '../components/AdminLayout';
import apiClient from '../../../api/api';
import RecordClientPaymentModal from '../components/RecordClientPaymentModal';

const money = new Intl.NumberFormat('en-LK', {
  style: 'currency',
  currency: 'LKR',
  maximumFractionDigits: 2,
});

const formatMoney = (value) => money.format(Number(value || 0));

const TX_PAGE_SIZE = 10;

const formatDate = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
};

const formatDateTime = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
};

const toDateInputValue = (value = new Date()) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
};

const addDays = (date, days) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

const SideNavItem = ({ active, icon: Icon, label, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-all border-l-2 ${
      active
        ? 'border-blue-600 bg-blue-50 text-blue-700 font-semibold'
        : 'border-transparent text-slate-600 font-medium hover:bg-slate-50 hover:text-slate-900'
    }`}
  >
    <Icon className="h-4 w-4 shrink-0" />
    <span>{label}</span>
  </button>
);

const StatCard = ({ icon: Icon, label, value, tone = 'slate' }) => {
  const toneMap = {
    slate: 'bg-slate-100 text-slate-700',
    blue: 'bg-blue-100 text-blue-700',
    emerald: 'bg-emerald-100 text-emerald-700',
    amber: 'bg-amber-100 text-amber-700',
    rose: 'bg-rose-100 text-rose-700',
    violet: 'bg-violet-100 text-violet-700',
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className={`mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl ${toneMap[tone] || toneMap.slate}`}>
        <Icon className="h-5 w-5" />
      </div>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-bold text-slate-900">{value}</p>
    </div>
  );
};

const InfoRow = ({ label, value }) => (
  <div>
    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
    <p className="mt-1 text-sm font-medium text-slate-900">{value || '-'}</p>
  </div>
);

const ClientDetailPage = () => {
  const { clientId } = useParams();
  const navigate = useNavigate();

  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeSection, setActiveSection] = useState('overview');
  const [statementStartDate, setStatementStartDate] = useState(toDateInputValue(addDays(new Date(), -30)));
  const [statementEndDate, setStatementEndDate] = useState(toDateInputValue(new Date()));
  const [statementActionLoading, setStatementActionLoading] = useState('');
  const [clientTransactions, setClientTransactions] = useState([]);
  const [transactionsLoading, setTransactionsLoading] = useState(false);
  const [txPage, setTxPage] = useState(1);

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

  const [showRecordPayment, setShowRecordPayment] = useState(false);

  const emptyPatientForm = { full_name: '', age: '', gender: '', relationship_to_client: '', medical_condition: '', residential_address: '', emergency_contact_name: '', emergency_contact_number: '' };
  const [showAddPatient, setShowAddPatient] = useState(false);
  const [patientForm, setPatientForm] = useState(emptyPatientForm);
  const [patientFormLoading, setPatientFormLoading] = useState(false);
  const [patientFormError, setPatientFormError] = useState('');

  useEffect(() => {
    const loadDetail = async () => {
      try {
        setLoading(true);
        setError('');
        const response = await apiClient.getAdminClientDetail(clientId);
        setDetail(response.data || null);
      } catch (err) {
        console.error('Error loading client detail:', err);
        setError(err.message || 'Failed to load client details');
      } finally {
        setLoading(false);
      }
    };

    const loadTransactions = async () => {
      try {
        setTransactionsLoading(true);
        const response = await apiClient.getClientTransactions(clientId);
        setClientTransactions(response.data || []);
      } catch (err) {
        console.error('Error loading client transactions:', err);
        setClientTransactions([]);
      } finally {
        setTransactionsLoading(false);
      }
    };

    const loadNotes = async () => {
      try {
        setNotesLoading(true);
        const response = await apiClient.getClientNotes(clientId);
        setNotes(response.data || []);
      } catch {
        // non-fatal
      } finally {
        setNotesLoading(false);
      }
    };

    if (clientId) {
      loadDetail();
      loadTransactions();
      loadNotes();
    }
  }, [clientId]);

  useEffect(() => { setTxPage(1); }, [clientTransactions]);

  const handleAddNote = async () => {
    if (!noteText.trim()) return;
    try {
      setNoteSubmitting(true);
      setNoteError('');
      const response = await apiClient.addClientNote(clientId, { note_text: noteText, note_type: noteType });
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
      setNoteError('');
      await apiClient.deleteClientNote(clientId, noteId);
      setNotes((prev) => prev.filter((n) => n.note_id !== noteId));
    } catch (err) {
      setNoteError(err.message || 'Failed to delete note');
    }
  };

  const startEdit = (note) => {
    setEditingNoteId(note.note_id);
    setEditNoteText(note.note_text);
    setEditNoteType(note.note_type || 'GENERAL');
  };

  const cancelEdit = () => {
    setEditingNoteId(null);
    setEditNoteText('');
    setEditNoteType('GENERAL');
  };

  const handleSaveEdit = async (noteId) => {
    if (!editNoteText.trim()) return;
    try {
      setNoteError('');
      const response = await apiClient.updateClientNote(clientId, noteId, {
        note_text: editNoteText,
        note_type: editNoteType,
      });
      setNotes((prev) => prev.map((n) => (n.note_id === noteId ? response.data : n)));
      cancelEdit();
    } catch (err) {
      setNoteError(err.message || 'Failed to update note');
    }
  };

  const clientProfile = detail?.client_profile || {};
  const paymentSummary = detail?.payment_summary || {};
  const bookingSummary = detail?.booking_summary || {};
  const quotationSummary = detail?.quotation_summary || {};
  const staffSummary = detail?.staff_summary || {};
  const reviewSummary = detail?.review_summary || {};
  const patientSummary = detail?.patient_summary || {};
  const statementSummary = detail?.statement_summary || {};
  const overdueSummary = detail?.overdue_summary || {};
  const recentActivity = detail?.recent_activity || {};

  const activeBookings = useMemo(() => recentActivity.bookings || [], [recentActivity.bookings]);
  const recentPayments = useMemo(() => recentActivity.payments || [], [recentActivity.payments]);
  const recentQuotes = useMemo(() => recentActivity.quotations || [], [recentActivity.quotations]);
  const recentAssignments = useMemo(() => recentActivity.staff_assignments || [], [recentActivity.staff_assignments]);
  const recentReviews = useMemo(() => recentActivity.reviews || [], [recentActivity.reviews]);
  const patients = Array.isArray(patientSummary.data) ? patientSummary.data : [];

  const statementDateRange = useMemo(() => ({
    start_date: statementStartDate,
    end_date: statementEndDate,
  }), [statementStartDate, statementEndDate]);

  const downloadStatement = async () => {
    try {
      setStatementActionLoading('download');
      const blob = await apiClient.downloadClientStatement(clientId, statementDateRange);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Statement_${(clientProfile.full_name || 'client').replace(/\s+/g, '_')}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (downloadError) {
      console.error('Error downloading statement:', downloadError);
      setError(downloadError.message || 'Failed to download statement');
    } finally {
      setStatementActionLoading('');
    }
  };

  const sendStatementToWhatsApp = async () => {
    try {
      setStatementActionLoading('whatsapp');
      await apiClient.sendClientStatementToWhatsApp(clientId, statementDateRange);
    } catch (sendError) {
      console.error('Error sending statement to WhatsApp:', sendError);
      setError(sendError.message || 'Failed to send statement via WhatsApp');
    } finally {
      setStatementActionLoading('');
    }
  };

  const handleAddPatient = async (e) => {
    e.preventDefault();
    if (!patientForm.full_name.trim()) {
      setPatientFormError('Care profile name is required.');
      return;
    }
    setPatientFormLoading(true);
    setPatientFormError('');
    try {
      await apiClient.createPatient({
        ...patientForm,
        age: patientForm.age ? parseInt(patientForm.age, 10) : null,
        client_id: clientProfile.client_profile_id,
      });
      setShowAddPatient(false);
      setPatientForm(emptyPatientForm);
      const refreshed = await apiClient.getAdminClientDetail(clientId);
      setDetail(refreshed.data || null);
    } catch (err) {
      setPatientFormError(err.message || 'Failed to add care profile. Please try again.');
    } finally {
      setPatientFormLoading(false);
    }
  };

  const handlePaymentRecorded = async () => {
    setShowRecordPayment(false);
    try {
      const [refreshed, txRefreshed] = await Promise.all([
        apiClient.getAdminClientDetail(clientId),
        apiClient.getClientTransactions(clientId),
      ]);
      setDetail(refreshed.data || null);
      setClientTransactions(txRefreshed.data || []);
    } catch {
      // non-fatal — page data will be stale until manual refresh
    }
  };

  const sectionConfig = [
    { id: 'overview', label: 'Overview', icon: Users },
    { id: 'payments', label: 'Payments', icon: BadgeDollarSign },
    { id: 'bookings', label: 'Bookings', icon: CalendarDays },
    { id: 'quotes', label: 'Quotes', icon: FileText },
    { id: 'staff', label: 'Staff', icon: Briefcase },
    { id: 'reviews', label: 'Reviews', icon: Star },
    { id: 'patients', label: 'Care Profiles', icon: HeartPulse },
    { id: 'notes', label: 'Notes', icon: StickyNote },
    { id: 'statement', label: 'Statement', icon: ReceiptText },
    { id: 'overdue', label: 'Overdue', icon: ShieldAlert },
  ];

  const overdueAmount = Number(overdueSummary.total_overdue_amount || 0);
  const isOverdue = overdueAmount < 0;
  const overdueDisplayLabel = isOverdue ? 'Overdue Amount' : 'Remaining Amount';
  const overdueTone = isOverdue ? 'rose' : 'emerald';

  const topStats = [
    { icon: BadgeDollarSign, label: 'Payments Made By Client', value: formatMoney(paymentSummary.total_paid), tone: 'emerald' },
    { icon: Wallet, label: 'Invoiced Through Daily Invoicing', value: formatMoney(statementSummary.total_invoiced), tone: 'blue' },
    { icon: ShieldAlert, label: overdueDisplayLabel, value: formatMoney(overdueSummary.total_overdue_amount), tone: overdueTone },
    { icon: CalendarDays, label: 'Bookings', value: bookingSummary.total_bookings || 0, tone: 'violet' },
  ];

  const transactionSummary = detail?.transaction_summary || {};

  const renderSection = () => {
    switch (activeSection) {
      case 'payments':
        return recentPayments.length === 0 ? (
          <EmptyState title="No payment history yet" />
        ) : (
          <SectionList>
            {recentPayments.map((payment, index) => (
              <ExpandableRow
                key={payment.transaction_id || index}
                summary={
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
                    <span className="font-semibold text-slate-900">{payment.transaction_description || payment.category || 'Payment'}</span>
                    <span className="font-bold text-slate-800">{formatMoney(payment.amount)}</span>
                    <StatusBadge status={payment.status} />
                    {payment.payment_method && <span className="text-sm text-slate-500">{payment.payment_method}</span>}
                    <span className="text-xs text-slate-400">{formatDateTime(payment.created_at)}</span>
                  </div>
                }
              >
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <InfoRow label="Date" value={formatDateTime(payment.created_at)} />
                  <InfoRow label="Amount" value={formatMoney(payment.amount)} />
                  <InfoRow label="Method" value={payment.payment_method || '-'} />
                  <InfoRow label="Status" value={payment.status || '-'} />
                  <InfoRow label="Reference" value={payment.reference_number || '-'} />
                </div>
              </ExpandableRow>
            ))}
          </SectionList>
        );

      case 'bookings':
        return activeBookings.length === 0 ? (
          <EmptyState title="No booking records yet" />
        ) : (
          <SectionList>
            {activeBookings.map((booking, index) => {
              const bookingStart = booking.start_date;
              const bookingEnd = booking.actual_end_time || booking.scheduled_end_time;
              const bookingDays = bookingStart
                ? Math.max(1, Math.ceil((new Date(bookingEnd || new Date()) - new Date(bookingStart)) / 86400000))
                : null;
              return (
                <ExpandableRow
                  key={booking.booking_id || index}
                  summary={
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
                      <span className="font-semibold text-slate-900">{booking.service_type || 'Booking'}</span>
                      <StatusBadge status={booking.status} />
                      <span className="text-sm text-slate-500">{formatDate(booking.start_date)}</span>
                      <span className="text-sm text-slate-500">{booking.current_staff_name || 'No staff assigned'}</span>
                      <span className="font-semibold text-slate-700">{formatMoney(booking.amount_quotated || booking.total_amount || 0)}</span>
                    </div>
                  }
                >
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <InfoRow label="Booking ID" value={booking.booking_id} />
                    <InfoRow label="Status" value={booking.status || '-'} />
                    <InfoRow label="Service Model" value={booking.service_model || '-'} />
                    <InfoRow label="Start Date" value={formatDate(booking.start_date)} />
                    <InfoRow label="Patient" value={booking.patient_name || '-'} />
                    <InfoRow label="Assigned Staff" value={booking.current_staff_name || 'Not assigned'} />
                    <InfoRow label="Quoted Amount" value={formatMoney(booking.amount_quotated || booking.total_amount || 0)} />
                    <InfoRow label="Paid" value={formatMoney(booking.amount_paid || 0)} />
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Days Worked</p>
                      <div className="mt-1">
                        {bookingDays !== null ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
                            {bookingDays} {bookingDays === 1 ? 'day' : 'days'}
                            {!bookingEnd && <span className="text-blue-400"> (ongoing)</span>}
                          </span>
                        ) : (
                          <span className="text-sm font-medium text-slate-400">-</span>
                        )}
                      </div>
                    </div>
                  </div>
                  {booking.booking_id && (
                    <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-200 pt-4">
                      <button
                        type="button"
                        onClick={() => navigate(`/admin/bookings/${booking.booking_id}/detail`)}
                        className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        <ArrowRight className="h-3.5 w-3.5" /> View Booking
                      </button>
                      <button
                        type="button"
                        onClick={() => navigate(`/admin/bookings/${booking.booking_id}/detail?section=staff`)}
                        className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-3 py-2 text-xs font-semibold text-white hover:bg-violet-700"
                      >
                        <ArrowRight className="h-3.5 w-3.5" /> Swap Staff Member
                      </button>
                      {!['TERMINATED', 'COMPLETED', 'CANCELLED'].includes((booking.status || '').toUpperCase()) && (
                        <button
                          type="button"
                          onClick={() => navigate(`/admin/bookings/${booking.booking_id}/detail?section=actions`)}
                          className="inline-flex items-center gap-2 rounded-lg bg-rose-600 px-3 py-2 text-xs font-semibold text-white hover:bg-rose-700"
                        >
                          <ArrowRight className="h-3.5 w-3.5" /> End Booking
                        </button>
                      )}
                    </div>
                  )}
                </ExpandableRow>
              );
            })}
          </SectionList>
        );

      case 'quotes':
        return recentQuotes.length === 0 ? (
          <EmptyState title="No quotations found" />
        ) : (
          <SectionList>
            {recentQuotes.map((quote, index) => (
              <ExpandableRow
                key={quote.quote_id || index}
                summary={
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
                    <span className="font-semibold text-slate-900">{quote.estimate_number || quote.quote_id || 'Quotation'}</span>
                    <StatusBadge status={quote.status} />
                    <span className="font-bold text-slate-800">{formatMoney(quote.total_amount)}</span>
                    {quote.qty_days && <span className="text-sm text-slate-500">{quote.qty_days} days</span>}
                  </div>
                }
              >
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <InfoRow label="Quote ID" value={quote.quote_id} />
                  <InfoRow label="Status" value={quote.status || '-'} />
                  <InfoRow label="Request" value={quote.request_id || '-'} />
                  <InfoRow label="Total Amount" value={formatMoney(quote.total_amount)} />
                  <InfoRow label="Daily Rate" value={formatMoney(quote.daily_rate)} />
                  <InfoRow label="Days" value={quote.qty_days || '-'} />
                </div>
              </ExpandableRow>
            ))}
          </SectionList>
        );

      case 'staff':
        return recentAssignments.length === 0 ? (
          <EmptyState title="No staff assignment history" />
        ) : (
          <SectionList>
            {recentAssignments.map((assignment, index) => {
              const assignStart = assignment.service_start_date;
              const assignEnd = assignment.service_end_date;
              const assignDays = assignStart
                ? Math.max(1, Math.ceil((new Date(assignEnd || new Date()) - new Date(assignStart)) / 86400000))
                : null;
              return (
                <ExpandableRow
                  key={assignment.assignment_id || index}
                  summary={
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
                      <span className="font-semibold text-slate-900">{assignment.staff_name || 'Staff'}</span>
                      {assignment.designation && <span className="text-sm text-slate-500">{assignment.designation}</span>}
                      <StatusBadge status={assignment.status} />
                      <span className="text-sm text-slate-500">{formatMoney(assignment.daily_rate)}/day</span>
                      {assignDays !== null && (
                        <span className="text-xs text-slate-400">{assignDays} {assignDays === 1 ? 'day' : 'days'}{!assignEnd ? ' (ongoing)' : ''}</span>
                      )}
                    </div>
                  }
                >
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <InfoRow label="Staff" value={assignment.staff_name || '-'} />
                    <InfoRow label="Designation" value={assignment.designation || '-'} />
                    <InfoRow label="Patient" value={assignment.patient_name || '-'} />
                    <InfoRow label="Status" value={assignment.status || '-'} />
                    <InfoRow label="Assigned On" value={formatDateTime(assignment.assigned_on)} />
                    <InfoRow label="Daily Rate" value={formatMoney(assignment.daily_rate)} />
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Days Worked</p>
                      <div className="mt-1">
                        {assignDays !== null ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
                            {assignDays} {assignDays === 1 ? 'day' : 'days'}
                            {!assignEnd && <span className="text-blue-400"> (ongoing)</span>}
                          </span>
                        ) : (
                          <span className="text-sm font-medium text-slate-400">-</span>
                        )}
                      </div>
                    </div>
                  </div>
                </ExpandableRow>
              );
            })}
          </SectionList>
        );
      case 'reviews':
        return (
          <div className="space-y-5">
            {reviewSummary.total_reviews ? (
              <div className="grid gap-4 md:grid-cols-3">
                <StatCard icon={Star} label="Average Rating" value={reviewSummary.average_rating || 0} tone="amber" />
                <StatCard icon={Users} label="Total Reviews" value={reviewSummary.total_reviews || 0} tone="violet" />
                <StatCard icon={Activity} label="Rating Spread" value={Object.keys(reviewSummary.rating_distribution || {}).length || 0} tone="slate" />
              </div>
            ) : null}
            {recentReviews.length === 0 ? (
              <EmptyState title="No reviews yet" />
            ) : (
              <SectionList>
                {recentReviews.map((review, index) => (
                  <ExpandableRow
                    key={review.review_id || index}
                    summary={
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
                        <span className="font-semibold text-slate-900">{review.staff_name || 'Review'}</span>
                        <span className="flex items-center gap-1">
                          <Star className="h-3.5 w-3.5 fill-amber-400 stroke-amber-400" />
                          <span className="font-bold text-slate-900">{review.rating}</span>
                        </span>
                        <span className={`text-xs font-medium ${review.is_visible ? 'text-emerald-600' : 'text-slate-400'}`}>
                          {review.is_visible ? 'Visible' : 'Hidden'}
                        </span>
                      </div>
                    }
                  >
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      <InfoRow label="Staff" value={review.staff_name || '-'} />
                      <InfoRow label="Rating" value={review.rating || '-'} />
                      <InfoRow label="Visible" value={review.is_visible ? 'Yes' : 'No'} />
                      <div className="sm:col-span-2 lg:col-span-3">
                        <InfoRow label="Comment" value={review.review_text || '-'} />
                      </div>
                    </div>
                  </ExpandableRow>
                ))}
              </SectionList>
            )}
          </div>
        );
      case 'patients':
        return (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-600">{patients.length} care profile{patients.length !== 1 ? 's' : ''} registered</p>
              <button
                type="button"
                onClick={() => { setShowAddPatient(true); setPatientFormError(''); }}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
              >
                <Plus className="h-4 w-4" /> Add Care Profile
              </button>
            </div>

            {showAddPatient && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
                <div className="w-full max-w-lg rounded-3xl bg-white shadow-2xl">
                  <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
                    <h3 className="text-base font-bold text-slate-900">Add New Care Profile</h3>
                    <button type="button" onClick={() => setShowAddPatient(false)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                  <form onSubmit={handleAddPatient} className="space-y-4 p-6">
                    {patientFormError && (
                      <div className="rounded-xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700 border border-rose-200">
                        {patientFormError}
                      </div>
                    )}
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="sm:col-span-2">
                        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Full Name *</label>
                        <input
                          type="text"
                          value={patientForm.full_name}
                          onChange={(e) => setPatientForm(f => ({ ...f, full_name: e.target.value }))}
                          className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                          placeholder="Full name"
                          required
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Age</label>
                        <input
                          type="number"
                          value={patientForm.age}
                          onChange={(e) => setPatientForm(f => ({ ...f, age: e.target.value }))}
                          className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                          placeholder="e.g. 65"
                          min="0"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Gender</label>
                        <select
                          value={patientForm.gender}
                          onChange={(e) => setPatientForm(f => ({ ...f, gender: e.target.value }))}
                          className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 bg-white"
                        >
                          <option value="">— Select —</option>
                          <option value="MALE">Male</option>
                          <option value="FEMALE">Female</option>
                          <option value="OTHER">Other</option>
                        </select>
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Relationship to Client</label>
                        <input
                          type="text"
                          value={patientForm.relationship_to_client}
                          onChange={(e) => setPatientForm(f => ({ ...f, relationship_to_client: e.target.value }))}
                          className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                          placeholder="e.g. Parent, Friend"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Medical Condition / Remarks</label>
                        <textarea
                          value={patientForm.medical_condition}
                          onChange={(e) => setPatientForm(f => ({ ...f, medical_condition: e.target.value }))}
                          className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                          rows={2}
                          placeholder="Describe the condition or any special remarks"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Residential Address</label>
                        <input
                          type="text"
                          value={patientForm.residential_address}
                          onChange={(e) => setPatientForm(f => ({ ...f, residential_address: e.target.value }))}
                          className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                          placeholder="Home address"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Emergency Contact Name</label>
                        <input
                          type="text"
                          value={patientForm.emergency_contact_name}
                          onChange={(e) => setPatientForm(f => ({ ...f, emergency_contact_name: e.target.value }))}
                          className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                          placeholder="Contact person's name"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Emergency Contact Number</label>
                        <input
                          type="tel"
                          value={patientForm.emergency_contact_number}
                          onChange={(e) => setPatientForm(f => ({ ...f, emergency_contact_number: e.target.value }))}
                          className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                          placeholder="e.g. 0771234567"
                        />
                      </div>
                    </div>
                    <div className="flex gap-3 pt-2">
                      <button
                        type="button"
                        onClick={() => setShowAddPatient(false)}
                        className="flex-1 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={patientFormLoading}
                        className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                      >
                        {patientFormLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                        {patientFormLoading ? 'Adding...' : 'Add Care Profile'}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {patients.length === 0 ? (
              <EmptyState title="No care profiles registered under this client" />
            ) : (
              <SectionList>
                {patients.map((patient, index) => (
                  <ExpandableRow
                    key={patient.patient_id || index}
                    summary={
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
                        <span className="font-semibold text-slate-900">{patient.full_name || 'Care Profile'}</span>
                        {patient.age && <span className="text-sm text-slate-500">{patient.age} yrs</span>}
                        {patient.gender && <span className="text-sm text-slate-500">{patient.gender.charAt(0) + patient.gender.slice(1).toLowerCase()}</span>}
                        {patient.relationship_to_client && <span className="text-sm text-slate-400">{patient.relationship_to_client}</span>}
                      </div>
                    }
                  >
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      <InfoRow label="Name" value={patient.full_name} />
                      <InfoRow label="Age" value={patient.age || '-'} />
                      <InfoRow label="Gender" value={patient.gender ? patient.gender.charAt(0) + patient.gender.slice(1).toLowerCase() : '-'} />
                      <InfoRow label="Relationship" value={patient.relationship_to_client || '-'} />
                      <InfoRow label="Emergency Contact" value={patient.emergency_contact_name || '-'} />
                      <InfoRow label="Contact Number" value={patient.emergency_contact_number || '-'} />
                      <div className="sm:col-span-2 lg:col-span-3">
                        <InfoRow label="Condition / Remarks" value={patient.medical_condition || patient.special_remarks || '-'} />
                      </div>
                    </div>
                  </ExpandableRow>
                ))}
              </SectionList>
            )}
          </div>
        );
      case 'notes':
        return (
          <div className="space-y-5">
            <div>
              <p className="text-sm font-semibold text-slate-700">All notes for this client</p>
              <p className="mt-0.5 text-xs text-slate-500">Includes general profile notes and notes attached to specific bookings.</p>
            </div>

            {/* Add note form */}
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-3">
              <p className="text-sm font-semibold text-slate-700">Add a new note</p>
              {noteError && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{noteError}</div>
              )}
              <textarea
                rows={3}
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                placeholder="Write a note about this client..."
                className="w-full resize-none rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500"
              />
              <div className="flex items-center gap-3">
                <select
                  value={noteType}
                  onChange={(e) => setNoteType(e.target.value)}
                  className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500"
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
                  className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                >
                  {noteSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  {noteSubmitting ? 'Adding...' : 'Add Note'}
                </button>
              </div>
            </div>

            {/* Notes list */}
            {notesLoading ? (
              <div className="flex items-center gap-2 py-6 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading notes...
              </div>
            ) : notes.length === 0 ? (
              <EmptyState title="No notes yet for this client" />
            ) : (
              <div className="space-y-3">
                {notes.map((note) => {
                  const meta = NOTE_TYPE_META[note.note_type] || NOTE_TYPE_META.GENERAL;
                  const isEditing = editingNoteId === note.note_id;
                  const isEdited = note.updated_at && note.updated_at !== note.created_at;

                  return (
                    <div key={note.note_id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      {isEditing ? (
                        <div className="space-y-3">
                          <textarea
                            rows={3}
                            value={editNoteText}
                            onChange={(e) => setEditNoteText(e.target.value)}
                            className="w-full resize-none rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500"
                          />
                          <div className="flex items-center gap-2">
                            <select
                              value={editNoteType}
                              onChange={(e) => setEditNoteType(e.target.value)}
                              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500"
                            >
                              <option value="GENERAL">General</option>
                              <option value="MEDICAL">Medical</option>
                              <option value="BILLING">Billing</option>
                              <option value="URGENT">Urgent</option>
                            </select>
                            <button
                              type="button"
                              onClick={() => handleSaveEdit(note.note_id)}
                              className="inline-flex items-center gap-1 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
                            >
                              <Check className="h-3.5 w-3.5" /> Save
                            </button>
                            <button
                              type="button"
                              onClick={cancelEdit}
                              className="inline-flex items-center gap-1 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100"
                            >
                              <X className="h-3.5 w-3.5" /> Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="flex items-start justify-between gap-3">
                            <p className="text-sm leading-relaxed text-slate-800">{note.note_text}</p>
                            <div className="flex shrink-0 items-center gap-1">
                              <button
                                type="button"
                                onClick={() => startEdit(note)}
                                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
                                title="Edit note"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteNote(note.note_id)}
                                className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-100 hover:text-rose-600"
                                title="Delete note"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>

                          <div className="mt-2.5 flex flex-wrap items-center gap-2">
                            {/* Type badge */}
                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${meta.classes}`}>
                              {meta.label}
                            </span>

                            {/* Booking context or profile-level badge */}
                            {note.booking_id ? (
                              <button
                                type="button"
                                onClick={() => navigate(`/admin/bookings/${note.booking_id}/detail`)}
                                className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2 py-0.5 text-xs font-semibold text-violet-700 hover:bg-violet-200"
                              >
                                <BookOpen className="h-3 w-3" />
                                {note.booking_service_type || 'Booking'} &middot; {note.booking_status || '—'}
                              </button>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                                <Users className="h-3 w-3" /> Client Profile
                              </span>
                            )}

                            {/* Author + date */}
                            <span className="text-xs text-slate-400">
                              {note.created_by_name} &middot; {formatDateTime(note.created_at)}
                            </span>
                            {isEdited && (
                              <span className="text-xs italic text-slate-400">(edited)</span>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );

      case 'statement':
        return (
          <div className="space-y-5">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">Start date</p>
                  <input
                    type="date"
                    value={statementStartDate}
                    onChange={(e) => setStatementStartDate(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">End date</p>
                  <input
                    type="date"
                    value={statementEndDate}
                    onChange={(e) => setStatementEndDate(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500"
                  />
                </div>
                <div className="flex items-end gap-3 md:col-span-2 xl:justify-end">
                  <button
                    type="button"
                    onClick={downloadStatement}
                    disabled={statementActionLoading === 'download'}
                    className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
                  >
                    {statementActionLoading === 'download' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                    Download Statement
                  </button>
                  <button
                    type="button"
                    onClick={sendStatementToWhatsApp}
                    disabled={statementActionLoading === 'whatsapp' || !clientProfile.mobile_number}
                    className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                    title={clientProfile.mobile_number ? 'Send statement to WhatsApp' : 'Client has no phone number'}
                  >
                    {statementActionLoading === 'whatsapp' ? <Loader2 className="h-4 w-4 animate-spin" /> : <SendHorizontal className="h-4 w-4" />}
                    Send WhatsApp
                  </button>
                </div>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <StatCard icon={ReceiptText} label="Transactions" value={statementSummary.transaction_count || 0} tone="slate" />
              <StatCard icon={Wallet} label="Payments Made By Client" value={formatMoney(paymentSummary.total_paid)} tone="blue" />
              <StatCard icon={BadgeDollarSign} label="Invoiced Through Daily Invoicing" value={formatMoney(statementSummary.total_invoiced)} tone="emerald" />
              <StatCard icon={FileText} label={overdueDisplayLabel} value={formatMoney(overdueSummary.total_overdue_amount)} tone={overdueTone} />
              <StatCard icon={Activity} label="Net Transaction Balance" value={formatMoney(transactionSummary.net_balance)} tone="violet" />
            </div>

            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
              <div className="border-b border-slate-200 px-5 py-4">
                <h3 className="text-base font-bold text-slate-900">All Client Transactions</h3>
                <p className="text-sm text-slate-500">Fetched from the statement transaction endpoint for this client</p>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50">
                    <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      <th className="px-5 py-3">Date</th>
                      <th className="px-5 py-3">Category</th>
                      <th className="px-5 py-3 text-right">Debit</th>
                      <th className="px-5 py-3 text-right">Credit</th>
                      <th className="px-5 py-3 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {transactionsLoading ? (
                      <tr>
                        <td colSpan="5" className="px-5 py-10 text-center text-slate-500">
                          Loading transactions...
                        </td>
                      </tr>
                    ) : clientTransactions.length === 0 ? (
                      <tr>
                        <td colSpan="5" className="px-5 py-10 text-center text-slate-500">
                          No transaction rows available yet
                        </td>
                      </tr>
                    ) : (
                      (() => {
                        const txTotalPages = Math.max(1, Math.ceil(clientTransactions.length / TX_PAGE_SIZE));
                        const safePage = Math.min(txPage, txTotalPages);
                        const txStart = (safePage - 1) * TX_PAGE_SIZE;
                        const pagedTransactions = clientTransactions.slice(txStart, txStart + TX_PAGE_SIZE);
                        return pagedTransactions.map((transaction, index) => {
                          const isDebit = transaction.transaction_type === 'DEBIT';
                          const isCredit = transaction.transaction_type === 'CREDIT';
                          return (
                            <tr key={transaction.transaction_id || index} className="align-top hover:bg-slate-50/60">
                              <td className="px-5 py-4 text-slate-600">{formatDateTime(transaction.created_at)}</td>
                              <td className="px-5 py-4">
                                <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${isDebit ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'}`}>
                                  {transaction.category || transaction.transaction_type || 'Transaction'}
                                </span>
                              </td>
                              <td className="px-5 py-4 text-right font-semibold text-slate-900">{formatMoney(isDebit ? transaction.amount : 0)}</td>
                              <td className="px-5 py-4 text-right font-semibold text-emerald-700">{formatMoney(isCredit ? transaction.amount : 0)}</td>
                              <td className="px-5 py-4 text-right font-semibold text-rose-700">{formatMoney(transaction.amount)}</td>
                            </tr>
                          );
                        });
                      })()
                    )}
                  </tbody>
                </table>
              </div>
              {!transactionsLoading && clientTransactions.length > TX_PAGE_SIZE && (() => {
                const txTotalPages = Math.ceil(clientTransactions.length / TX_PAGE_SIZE);
                const safePage = Math.min(txPage, txTotalPages);
                const txStart = (safePage - 1) * TX_PAGE_SIZE;
                return (
                  <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3">
                    <p className="text-xs text-slate-500">
                      Showing {txStart + 1}–{Math.min(txStart + TX_PAGE_SIZE, clientTransactions.length)} of {clientTransactions.length}
                    </p>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setTxPage((p) => Math.max(1, p - 1))}
                        disabled={safePage === 1}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <ArrowLeft className="h-3.5 w-3.5" /> Prev
                      </button>
                      <span className="min-w-[90px] text-center text-xs text-slate-500">
                        Page {safePage} of {txTotalPages}
                      </span>
                      <button
                        type="button"
                        onClick={() => setTxPage((p) => Math.min(txTotalPages, p + 1))}
                        disabled={safePage === txTotalPages}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Next <ArrowRight className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        );
      case 'overdue':
        return (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <StatCard icon={ShieldAlert} label={overdueDisplayLabel} value={formatMoney(overdueSummary.total_overdue_amount)} tone={overdueTone} />
            <StatCard icon={CalendarDays} label="Overdue Invoices" value={overdueSummary.total_outstanding_invoices || 0} tone="amber" />
            <StatCard icon={Activity} label="Overdue Count" value={overdueSummary.overdue_payments_count || 0} tone="slate" />
          </div>
        );
      case 'overview':
      default:
        return (
          <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {topStats.map((stat) => (
                <StatCard key={stat.label} {...stat} />
              ))}
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <DataCard title="Client Information">
                <div className="grid gap-4 sm:grid-cols-2">
                  <InfoRow label="Client Code" value={clientProfile.client_code || clientProfile.client_profile_id} />
                  <InfoRow label="User ID" value={clientProfile.user_id} />
                  <InfoRow label="Email" value={clientProfile.email || '-'} />
                  <InfoRow label="Phone" value={clientProfile.mobile_number || '-'} />
                  <InfoRow label="Address" value={clientProfile.primary_address || '-'} />
                  <InfoRow label="Type" value={clientProfile.client_type || '-'} />
                  <InfoRow label="Gender" value={clientProfile.gender || '-'} />
                  <InfoRow label="Active" value={clientProfile.is_active ? 'Yes' : 'No'} />
                </div>
              </DataCard>

              <DataCard title="Quick Summary">
                <div className="grid gap-4 sm:grid-cols-2">
                  <InfoRow label="Bookings" value={`${bookingSummary.total_bookings || 0} total`} />
                  <InfoRow label="Care Profiles" value={patientSummary.total_patients || 0} />
                  <InfoRow label="Quotes" value={quotationSummary.total_quotes || 0} />
                  <InfoRow label="Current Staff" value={staffSummary.active_assignment_count || 0} />
                  <InfoRow label="Reviews" value={reviewSummary.total_reviews || 0} />
                  <InfoRow label="Last Transaction" value={formatDateTime(statementSummary.last_transaction_at)} />
                </div>
              </DataCard>
            </div>
          </div>
        );
    }
  };

  if (loading) {
    return (
      <AdminLayout title="Client Details" subtitle="Loading client profile...">
        <div className="flex min-h-[45vh] items-center justify-center rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center gap-3 text-slate-600">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm font-medium">Loading client details...</span>
          </div>
        </div>
      </AdminLayout>
    );
  }

  if (error) {
    return (
      <AdminLayout title="Client Details" subtitle="Unable to load client profile">
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-rose-700">
          <p className="font-semibold">{error}</p>
          <button
            type="button"
            onClick={() => navigate('/admin/users')}
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700"
          >
            <ArrowLeft className="h-4 w-4" /> Back to users
          </button>
        </div>
      </AdminLayout>
    );
  }

  const activeNavSection = sectionConfig.find((s) => s.id === activeSection);
  const ActiveSectionIcon = activeNavSection?.icon;

  return (
    <AdminLayout
      title={clientProfile.full_name || 'Client Details'}
      subtitle={`Client Code: ${clientProfile.client_code || clientProfile.client_profile_id || '—'}`}
      actions={(
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowRecordPayment(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            <Plus className="h-4 w-4" /> Record Payment
          </button>
          <button
            type="button"
            onClick={() => navigate('/admin/users')}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            <ArrowLeft className="h-4 w-4" /> Back
          </button>
        </div>
      )}
    >
      <div className="space-y-5">
        {/* Client identity + financial snapshot */}
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="bg-slate-900 px-6 py-5">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-white/10 text-xl font-bold text-white">
                {(clientProfile.full_name || 'C').charAt(0)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2.5">
                  <h1 className="text-xl font-bold text-white">{clientProfile.full_name || 'Client Profile'}</h1>
                  <span className={`shrink-0 rounded px-2 py-0.5 text-xs font-semibold ${clientProfile.is_active ? 'bg-emerald-400/20 text-emerald-300' : 'bg-rose-400/20 text-rose-300'}`}>
                    {clientProfile.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-slate-400">
                  <span className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5 shrink-0" />{clientProfile.mobile_number || '—'}</span>
                  <span className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5 shrink-0" />{clientProfile.primary_address || '—'}</span>
                  <span className="flex items-center gap-1.5"><Crown className="h-3.5 w-3.5 shrink-0" />{clientProfile.client_type || '—'}</span>
                </div>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 divide-x divide-slate-100 border-t border-slate-100 sm:grid-cols-4">
            <div className="px-5 py-3.5">
              <p className="text-xs font-medium text-slate-500">Payments Made</p>
              <p className="mt-0.5 text-base font-bold text-slate-900">{formatMoney(paymentSummary.total_paid)}</p>
            </div>
            <div className="px-5 py-3.5">
              <p className="text-xs font-medium text-slate-500">Total Invoiced</p>
              <p className="mt-0.5 text-base font-bold text-slate-900">{formatMoney(statementSummary.total_invoiced)}</p>
            </div>
            <div className="px-5 py-3.5">
              <p className="text-xs font-medium text-slate-500">{overdueDisplayLabel}</p>
              <p className={`mt-0.5 text-base font-bold ${isOverdue ? 'text-rose-600' : 'text-emerald-600'}`}>
                {formatMoney(overdueSummary.total_overdue_amount)}
              </p>
            </div>
            <div className="px-5 py-3.5">
              <p className="text-xs font-medium text-slate-500">Total Bookings</p>
              <p className="mt-0.5 text-base font-bold text-slate-900">{bookingSummary.total_bookings || 0}</p>
            </div>
          </div>
        </div>

        {/* Sidebar + content */}
        <div className="flex items-start gap-5">
          {/* Vertical navigation sidebar */}
          <aside className="w-52 shrink-0">
            <div className="sticky top-6 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Sections</p>
              </div>
              <nav className="py-1">
                {sectionConfig.map((section) => (
                  <SideNavItem
                    key={section.id}
                    active={activeSection === section.id}
                    icon={section.icon}
                    label={section.label}
                    onClick={() => setActiveSection(section.id)}
                  />
                ))}
              </nav>
            </div>
          </aside>

          {/* Main content panel */}
          <div className="min-w-0 flex-1">
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="flex items-center gap-3 border-b border-slate-100 px-6 py-4">
                {ActiveSectionIcon && <ActiveSectionIcon className="h-4 w-4 text-slate-400" />}
                <h2 className="text-sm font-bold text-slate-900">{activeNavSection?.label}</h2>
              </div>
              <div className="p-6">
                {renderSection()}
              </div>
            </div>
          </div>
        </div>
      </div>

      {showRecordPayment && (
        <RecordClientPaymentModal
          clientId={clientId}
          bookings={activeBookings}
          patients={patients}
          onClose={() => setShowRecordPayment(false)}
          onSuccess={handlePaymentRecorded}
        />
      )}
    </AdminLayout>
  );
};

const DataCard = ({ title, children }) => (
  <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
    <div className="border-b border-slate-100 px-5 py-3.5">
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
    </div>
    <div className="p-5">{children}</div>
  </div>
);

const EmptyState = ({ title }) => (
  <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-10 text-center">
    <p className="text-sm font-medium text-slate-500">{title}</p>
  </div>
);

const SectionList = ({ children }) => (
  <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
    {children}
  </div>
);

const ExpandableRow = ({ summary, children }) => {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-slate-50"
      >
        <div className="min-w-0 flex-1">{summary}</div>
        <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="border-t border-slate-100 bg-slate-50/60 px-5 py-4">
          {children}
        </div>
      )}
    </div>
  );
};

const StatusBadge = ({ status }) => {
  if (!status) return <span className="text-slate-400">—</span>;
  const s = status.toUpperCase();
  const cls =
    ['ACTIVE', 'COMPLETED', 'PAID', 'APPROVED', 'VISIBLE'].includes(s)
      ? 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200'
      : ['PENDING', 'IN_PROGRESS', 'ONGOING', 'DRAFT'].includes(s)
      ? 'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200'
      : ['CANCELLED', 'TERMINATED', 'OVERDUE', 'FAILED', 'INACTIVE'].includes(s)
      ? 'bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200'
      : 'bg-slate-100 text-slate-600 ring-1 ring-inset ring-slate-200';
  return (
    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${cls}`}>
      {status}
    </span>
  );
};

export default ClientDetailPage;
