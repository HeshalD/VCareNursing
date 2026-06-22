import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Landmark,
  Loader2,
  Pencil,
  Plus,
  Save,
  StickyNote,
  Trash2,
  X,
} from 'lucide-react';
import AdminLayout from '../components/AdminLayout';
import apiClient from '../../../api/api';
import { useAdminAuth } from '../../../context/AdminAuthContext';
import StaffCareTimeline from './StaffCareTimeline';

// ── helpers ──────────────────────────────────────────────────────────────────
const moneyFormatter = new Intl.NumberFormat('en-LK', {
  style: 'currency', currency: 'LKR', maximumFractionDigits: 2,
});
const formatMoney = (v) => moneyFormatter.format(Number(v || 0));
const formatDate = (v) => {
  if (!v) return '-';
  const d = new Date(v);
  if (isNaN(d)) return '-';
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
};
const formatDateTime = (v) => {
  if (!v) return '-';
  const d = new Date(v);
  if (isNaN(d)) return '-';
  return d.toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
};
const safeArray = (v) => (Array.isArray(v) ? v : []);
const getInitials = (name) => (name || '?').trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();

// ── design tokens ─────────────────────────────────────────────────────────────
const STATUS_META = {
  available:    { bg: '#E3F1E8', col: '#2F7A53', dot: '#2F8A5B' },
  active:       { bg: '#E3F1E8', col: '#2F7A53', dot: '#2F8A5B' },
  verified:     { bg: '#E3F1E8', col: '#2F7A53', dot: '#2F8A5B' },
  completed:    { bg: '#E3F1E8', col: '#2F7A53', dot: '#2F8A5B' },
  assigned:     { bg: '#E8F1F9', col: '#3F77B5', dot: '#3F77B5' },
  pending:      { bg: '#FBF1DD', col: '#B07A1E', dot: '#C98A2E' },
  pending_termination: { bg: '#FBF1DD', col: '#B07A1E', dot: '#C98A2E' },
  under_review: { bg: '#FBF1DD', col: '#B07A1E', dot: '#C98A2E' },
  unavailable:  { bg: '#F7E6E3', col: '#BC4338', dot: '#C2483C' },
  inactive:     { bg: '#F7E6E3', col: '#BC4338', dot: '#C2483C' },
  terminated:   { bg: '#F7E6E3', col: '#BC4338', dot: '#C2483C' },
  cancelled:    { bg: '#F7E6E3', col: '#BC4338', dot: '#C2483C' },
  suspended:    { bg: '#F7E6E3', col: '#BC4338', dot: '#C2483C' },
};
const getSM = (v) => STATUS_META[String(v || '').toLowerCase()] || { bg: '#F0EDE6', col: '#7A756A', dot: '#9A9488' };

const inp = {
  width: '100%', border: '1px solid #E2DCD0', borderRadius: 10, padding: '10px 12px',
  fontFamily: 'inherit', fontSize: 14, color: '#2A2722', outline: 'none', background: '#FCFBF8',
};

// ── atoms ─────────────────────────────────────────────────────────────────────
const LBL = ({ children }) => (
  <div style={{ fontSize: 11, fontWeight: 600, color: '#9A9488', textTransform: 'uppercase', letterSpacing: '.04em' }}>
    {children}
  </div>
);
const VAL = ({ children, color, mono }) => (
  <div style={{ fontSize: 14, fontWeight: 600, marginTop: 3, color: color || '#2A2722', fontFamily: mono ? "'JetBrains Mono',monospace" : 'inherit' }}>
    {children ?? '-'}
  </div>
);
const Field = ({ label, value, color, mono }) => <div><LBL>{label}</LBL><VAL color={color} mono={mono}>{value ?? '-'}</VAL></div>;

const Card = ({ children, style }) => (
  <div style={{ background: '#fff', border: '1px solid #ECE7DF', borderRadius: 16, padding: 20, ...style }}>
    {children}
  </div>
);
const CardTitle = ({ children, sub }) => (
  <div style={{ marginBottom: 15 }}>
    <h3 style={{ margin: 0, fontSize: 15.5, fontWeight: 700, color: '#2A2722' }}>{children}</h3>
    {sub && <p style={{ margin: '2px 0 0', fontSize: 12.5, color: '#9A9488' }}>{sub}</p>}
  </div>
);
const Empty = ({ title, subtitle }) => (
  <div style={{ border: '1.5px dashed #E0D9CF', borderRadius: 12, padding: '32px 24px', textAlign: 'center' }}>
    <p style={{ margin: 0, fontWeight: 600, color: '#7A756A' }}>{title}</p>
    {subtitle && <p style={{ margin: '4px 0 0', fontSize: 13, color: '#9A9488' }}>{subtitle}</p>}
  </div>
);
const MiniCard = ({ label, value, color, onClick }) => (
  <div
    style={{ background: '#fff', border: '1px solid #ECE7DF', borderRadius: 14, padding: '15px 16px', cursor: onClick ? 'pointer' : undefined }}
    onClick={onClick}
    title={onClick ? 'Click to see breakdown' : undefined}
  >
    <div style={{ fontSize: 11.5, fontWeight: 600, color: '#9A9488', textTransform: 'uppercase', letterSpacing: '.04em' }}>{label}</div>
    <div style={{ fontSize: 18, fontWeight: 800, marginTop: 5, color: color || '#2A2722' }}>{value}</div>
    {onClick && <div style={{ fontSize: 11.5, color: '#137A6B', fontWeight: 600, marginTop: 3 }}>View breakdown →</div>}
  </div>
);
const StatusPill = ({ value }) => {
  const s = getSM(value);
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: s.bg, color: s.col, borderRadius: 999, padding: '4px 10px', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: s.dot, flexShrink: 0 }} />
      {value || '-'}
    </span>
  );
};

const TableHead = ({ cols, children }) => (
  <div style={{ display: 'grid', gridTemplateColumns: cols, gap: 10, paddingBottom: 9, fontSize: 11, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: '#A39D91', borderBottom: '1px solid #EFEAE0' }}>
    {children}
  </div>
);
const TableRow = ({ cols, children }) => (
  <div style={{ display: 'grid', gridTemplateColumns: cols, gap: 10, padding: '13px 0', borderBottom: '1px solid #F2EEE6', alignItems: 'center' }}>
    {children}
  </div>
);

// ── admin notes carousel ────────────────────────────────────────────────────
const AdminNotesCarousel = ({ notes, loading, busy, onAdd, onEdit, onDelete }) => {
  const [index, setIndex] = useState(0);
  const [editor, setEditor] = useState({ open: false, mode: 'add', noteId: null, text: '' });
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  const count = notes.length;

  // Keep the active slide within bounds when notes are added/removed.
  useEffect(() => {
    setIndex((i) => (count === 0 ? 0 : Math.min(i, count - 1)));
  }, [count]);

  const go = (dir) => {
    setConfirmDeleteId(null);
    setIndex((i) => Math.max(0, Math.min(count - 1, i + dir)));
  };

  const openAdd = () => setEditor({ open: true, mode: 'add', noteId: null, text: '' });
  const openEdit = (note) => setEditor({ open: true, mode: 'edit', noteId: note.note_id, text: note.note });
  const closeEditor = () => setEditor({ open: false, mode: 'add', noteId: null, text: '' });

  const saveEditor = async () => {
    const text = editor.text.trim();
    if (!text) return;
    if (editor.mode === 'add') {
      await onAdd(text);
      setIndex(0); // newest note shows first
    } else {
      await onEdit(editor.noteId, text);
    }
    closeEditor();
  };

  const fmt = (v) => {
    if (!v) return '';
    const d = new Date(v);
    return isNaN(d) ? '' : d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  const headerBtn = {
    display: 'inline-flex', alignItems: 'center', gap: 5, border: '1px solid #E2DCD0',
    background: '#FCFBF8', borderRadius: 9, padding: '6px 10px', fontFamily: 'inherit',
    fontSize: 12.5, fontWeight: 600, color: '#5A554B', cursor: 'pointer',
  };
  const arrowBtn = (disabled) => ({
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    width: 30, height: 30, borderRadius: 8, border: '1px solid #E7E1D6',
    background: '#fff', color: disabled ? '#CFC8BC' : '#5A554B',
    cursor: disabled ? 'default' : 'pointer', flexShrink: 0,
  });

  return (
    <div style={{ background: '#fff', border: '1px solid #ECE7DF', borderRadius: 16, padding: 18, display: 'flex', flexDirection: 'column' }}>
      {/* header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <StickyNote style={{ width: 16, height: 16, color: '#B07A1E' }} />
          <span style={{ fontSize: 13.5, fontWeight: 700, color: '#2A2722' }}>Admin Notes</span>
          {count > 0 && !editor.open && (
            <span style={{ fontSize: 11.5, fontWeight: 600, color: '#9A9488' }}>{index + 1} / {count}</span>
          )}
        </div>
        {!editor.open && (
          <button type="button" style={headerBtn} onClick={openAdd} disabled={busy}>
            <Plus style={{ width: 13, height: 13 }} /> Add
          </button>
        )}
      </div>

      {/* body */}
      {editor.open ? (
        <div>
          <textarea
            value={editor.text}
            onChange={(e) => setEditor((p) => ({ ...p, text: e.target.value }))}
            placeholder="Write an internal note about this staff member..."
            autoFocus
            rows={4}
            style={{ ...inp, resize: 'vertical', minHeight: 92 }}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
            <button type="button" style={headerBtn} onClick={closeEditor} disabled={busy}>
              <X style={{ width: 13, height: 13 }} /> Cancel
            </button>
            <button
              type="button"
              onClick={saveEditor}
              disabled={busy || !editor.text.trim()}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: 'none', background: '#137A6B', color: '#fff', borderRadius: 9, padding: '7px 13px', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', opacity: busy || !editor.text.trim() ? 0.6 : 1 }}
            >
              {busy ? <Loader2 style={{ width: 13, height: 13, animation: 'spin 1s linear infinite' }} /> : <Save style={{ width: 13, height: 13 }} />}
              {editor.mode === 'add' ? 'Add note' : 'Save'}
            </button>
          </div>
        </div>
      ) : loading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 96, color: '#9A9488' }}>
          <Loader2 style={{ width: 18, height: 18, animation: 'spin 1s linear infinite' }} />
        </div>
      ) : count === 0 ? (
        <div style={{ border: '1.5px dashed #E0D9CF', borderRadius: 12, padding: '24px 18px', textAlign: 'center' }}>
          <p style={{ margin: 0, fontWeight: 600, color: '#7A756A', fontSize: 13 }}>No admin notes yet</p>
          <p style={{ margin: '3px 0 0', fontSize: 12.5, color: '#9A9488' }}>Add an internal note to keep track of this staff member.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'stretch', gap: 10 }}>
          <button type="button" style={arrowBtn(index === 0)} onClick={() => go(-1)} disabled={index === 0} title="Previous">
            <ChevronLeft style={{ width: 17, height: 17 }} />
          </button>

          {/* sliding window */}
          <div style={{ flex: 1, overflow: 'hidden', minWidth: 0 }}>
            <div style={{ display: 'flex', transform: `translateX(-${index * 100}%)`, transition: 'transform .32s cubic-bezier(.4,0,.2,1)' }}>
              {notes.map((n) => (
                <div key={n.note_id} style={{ minWidth: '100%', boxSizing: 'border-box', padding: '2px 2px' }}>
                  <div style={{ background: '#FBF8F1', border: '1px solid #EFE7D6', borderRadius: 12, padding: '13px 14px', minHeight: 96, display: 'flex', flexDirection: 'column' }}>
                    <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.55, color: '#3A362F', whiteSpace: 'pre-wrap', wordBreak: 'break-word', flex: 1 }}>
                      {n.note}
                    </p>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 11, paddingTop: 9, borderTop: '1px solid #EFE7D6' }}>
                      <span style={{ fontSize: 11.5, color: '#9A9488' }}>
                        {n.author_name ? `${n.author_name} · ` : ''}{fmt(n.created_at)}
                        {n.updated_at && n.updated_at !== n.created_at ? ' (edited)' : ''}
                      </span>
                      {confirmDeleteId === n.note_id ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: 11.5, color: '#BC4338', fontWeight: 600 }}>Delete?</span>
                          <button type="button" onClick={() => { onDelete(n.note_id); setConfirmDeleteId(null); }} disabled={busy}
                            style={{ border: 'none', background: '#BC4338', color: '#fff', borderRadius: 7, padding: '4px 9px', fontFamily: 'inherit', fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}>
                            Yes
                          </button>
                          <button type="button" onClick={() => setConfirmDeleteId(null)} disabled={busy}
                            style={{ border: '1px solid #E2DCD0', background: '#fff', color: '#5A554B', borderRadius: 7, padding: '4px 9px', fontFamily: 'inherit', fontSize: 11.5, fontWeight: 600, cursor: 'pointer' }}>
                            No
                          </button>
                        </span>
                      ) : (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <button type="button" onClick={() => openEdit(n)} disabled={busy} title="Edit"
                            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, borderRadius: 7, border: '1px solid #E7E1D6', background: '#fff', color: '#5A554B', cursor: 'pointer' }}>
                            <Pencil style={{ width: 13, height: 13 }} />
                          </button>
                          <button type="button" onClick={() => setConfirmDeleteId(n.note_id)} disabled={busy} title="Delete"
                            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, borderRadius: 7, border: '1px solid #F0DAD6', background: '#fff', color: '#BC4338', cursor: 'pointer' }}>
                            <Trash2 style={{ width: 13, height: 13 }} />
                          </button>
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <button type="button" style={arrowBtn(index >= count - 1)} onClick={() => go(1)} disabled={index >= count - 1} title="Next">
            <ChevronRight style={{ width: 17, height: 17 }} />
          </button>
        </div>
      )}
    </div>
  );
};

// ── main component ────────────────────────────────────────────────────────────
const StaffDetailPageV2 = () => {
  const { adminToken, isLoading: authLoading } = useAdminAuth();
  const navigate = useNavigate();
  const { staffProfileId } = useParams();

  const [detail, setDetail] = useState(null);
  const [earningsSummary, setEarningsSummary] = useState(null);
  const [earningsTransactions, setEarningsTransactions] = useState([]);
  const [currentBooking, setCurrentBooking] = useState(null);
  const [bookingHistory, setBookingHistory] = useState([]);
  const [payoutsSummary, setPayoutsSummary] = useState(null);
  const [payouts, setPayouts] = useState([]);
  const [bankAccounts, setBankAccounts] = useState([]);
  const [companyBankAccounts, setCompanyBankAccounts] = useState([]);
  const [payoutForm, setPayoutForm] = useState({
    amount: '', company_bank_account_id: '', staff_bank_account_id: '',
    payment_method: 'BANK_TRANSFER', reference_number: '', notes: '',
  });
  const [bankModal, setBankModal] = useState({
    isOpen: false, mode: 'add', editing: null,
    form: { account_holder_name: '', bank_name: '', branch_name: '', account_number: '', currency: 'LKR' },
    saving: false, error: '',
  });
  const [deletingBankId, setDeletingBankId] = useState(null);
  const [sectionErrors, setSectionErrors] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeSection, setActiveSection] = useState('overview');
  const [refreshing, setRefreshing] = useState(false);
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [payoutSubmitting, setPayoutSubmitting] = useState(false);
  const [payoutSubmitError, setPayoutSubmitError] = useState('');
  const [payoutSubmitSuccess, setPayoutSubmitSuccess] = useState('');
  const [changeRequests, setChangeRequests] = useState([]);
  const [expandedRequestId, setExpandedRequestId] = useState(null);
  const [requestLogs, setRequestLogs] = useState({});
  const [loadingLogs, setLoadingLogs] = useState({});
  const [deductions, setDeductions] = useState([]);
  const [deductionForm, setDeductionForm] = useState({ amount: '', reason: '' });
  const [deductionSubmitting, setDeductionSubmitting] = useState(false);
  const [deductionError, setDeductionError] = useState('');
  const [deductionSuccess, setDeductionSuccess] = useState('');
  const [reviewToggles, setReviewToggles] = useState({});
  const [togglingReviewId, setTogglingReviewId] = useState(null);
  const [attendanceCalendar, setAttendanceCalendar] = useState({ assignments: [], attendance: [] });
  const [leaveSummary, setLeaveSummary] = useState({ total_leave_days: 0, month_leave_days: 0, approved_leaves: [] });
  const [adminNotes, setAdminNotes] = useState([]);
  const [adminNotesLoading, setAdminNotesLoading] = useState(true);
  const [adminNotesBusy, setAdminNotesBusy] = useState(false);

  const profile = detail?.profile || {};
  const overviewEarnings = detail?.earnings || {};
  const overviewCurrentBooking = detail?.current_assignment || null;
  const overviewBookingHistory = safeArray(detail?.booking_history);
  const overviewReviews = detail?.reviews || {};
  const overviewPayoutSummary = detail?.payout_summary || {};

  const totalEarned = Number(earningsSummary?.total_earned ?? overviewEarnings.total_earned ?? 0);
  const totalPaidOut = Number(earningsSummary?.total_paid_out ?? overviewEarnings.total_paid_out ?? 0);
  const currentEarnings = Number(earningsSummary?.current_earnings ?? overviewEarnings.current_earnings ?? profile.current_earnings ?? 0);
  const outstandingPayable = Number(earningsSummary?.outstanding_payable ?? overviewEarnings.outstanding ?? currentEarnings ?? 0);
  const totalReviews = Number(profile.total_reviews || overviewReviews.total_reviews || 0);
  const averageRating = Number(profile.average_rating || overviewReviews.average_rating || 0);
  const totalBookings = overviewBookingHistory.length;
  const activeStatus = String(profile.current_status || '').toLowerCase();
  const isActive = Boolean(profile.is_active);
  const currentAssignment = currentBooking || overviewCurrentBooking;

  const sectionConfig = useMemo(() => ([
    { id: 'overview',        label: 'Overview' },
    { id: 'earnings',        label: 'Earnings' },
    { id: 'current-booking', label: 'Current Booking' },
    { id: 'booking-history', label: 'Booking History' },
    { id: 'reviews',         label: 'Reviews' },
    { id: 'payouts',         label: 'Payouts' },
    { id: 'deductions',      label: 'Deductions' },
    { id: 'bank-accounts',   label: 'Bank Accounts' },
    { id: 'change-history',  label: 'Change History' },
  ]), []);

  const runAdminRequest = async (fn) => {
    const originalToken = apiClient.token;
    apiClient.setToken(adminToken);
    try { return await fn(); } finally { apiClient.setToken(originalToken); }
  };

  const loadPage = async () => {
    if (!adminToken || !staffProfileId) {
      setLoading(false);
      if (!authLoading) setError('Admin authentication required.');
      return;
    }
    setLoading(true);
    setError('');
    setSectionErrors({});

    const results = await Promise.allSettled([
      runAdminRequest(() => apiClient.getAdminStaffDetail(staffProfileId)),
      runAdminRequest(() => apiClient.getStaffEarningsSummary(staffProfileId)),
      runAdminRequest(() => apiClient.getStaffEarningsTransactions(staffProfileId, { page: 1, limit: 50 })),
      runAdminRequest(() => apiClient.getStaffCurrentBooking(staffProfileId)),
      runAdminRequest(() => apiClient.getStaffBookingHistory(staffProfileId, { page: 1, limit: 20 })),
      runAdminRequest(() => apiClient.getStaffPayoutsSummary(staffProfileId)),
      runAdminRequest(() => apiClient.getStaffPayouts(staffProfileId, { page: 1, limit: 20 })),
      runAdminRequest(() => apiClient.getStaffBankAccounts(staffProfileId)),
      runAdminRequest(() => apiClient.getBankAccounts()),
      runAdminRequest(() => apiClient.getAllChangeRequests({ staff_profile_id: staffProfileId })),
      runAdminRequest(() => apiClient.getStaffDeductions(staffProfileId, { page: 1, limit: 50 })),
      runAdminRequest(() => apiClient.getStaffAttendanceCalendar(staffProfileId)),
      runAdminRequest(() => apiClient.getStaffAdminNotes(staffProfileId)),
      runAdminRequest(() => apiClient.getStaffLeaveSummary(staffProfileId)),
    ]);

    const nextErrors = {};
    const [
      detailRes, earningsRes, earningsTxRes, currentBookingRes, historyRes,
      payoutsSummaryRes, payoutsRes, bankAccountsRes, companyBankAccountsRes,
      changeRequestsRes, deductionsRes, attendanceCalendarRes, adminNotesRes,
      leaveSummaryRes,
    ] = results;

    if (detailRes.status === 'fulfilled') {
      setDetail(detailRes.value?.data || null);
    } else {
      setError(detailRes.reason?.message || 'Failed to load staff detail');
      setLoading(false);
      return;
    }

    if (earningsRes.status === 'fulfilled') setEarningsSummary(earningsRes.value?.data || null);
    else nextErrors.earnings = earningsRes.reason?.message;

    if (earningsTxRes.status === 'fulfilled') setEarningsTransactions(safeArray(earningsTxRes.value?.data));
    else nextErrors.earningsTransactions = earningsTxRes.reason?.message;

    if (currentBookingRes.status === 'fulfilled') setCurrentBooking(currentBookingRes.value?.data || null);
    else nextErrors.currentBooking = currentBookingRes.reason?.message;

    if (historyRes.status === 'fulfilled') setBookingHistory(safeArray(historyRes.value?.data));
    else nextErrors.bookingHistory = historyRes.reason?.message;

    if (payoutsSummaryRes.status === 'fulfilled') setPayoutsSummary(payoutsSummaryRes.value?.data || null);
    else nextErrors.payoutsSummary = payoutsSummaryRes.reason?.message;

    if (payoutsRes.status === 'fulfilled') setPayouts(safeArray(payoutsRes.value?.data));
    else nextErrors.payouts = payoutsRes.reason?.message;

    if (bankAccountsRes.status === 'fulfilled') setBankAccounts(safeArray(bankAccountsRes.value?.data));
    else nextErrors.bankAccounts = bankAccountsRes.reason?.message;

    if (companyBankAccountsRes.status === 'fulfilled') {
      const fetched = safeArray(companyBankAccountsRes.value?.data);
      setCompanyBankAccounts(fetched);
      if (!payoutForm.company_bank_account_id && fetched.length > 0) {
        setPayoutForm(c => ({ ...c, company_bank_account_id: fetched[0].account_id || '' }));
      }
    } else nextErrors.companyBankAccounts = companyBankAccountsRes.reason?.message;

    if (changeRequestsRes.status === 'fulfilled') setChangeRequests(safeArray(changeRequestsRes.value?.data));
    else nextErrors.changeRequests = changeRequestsRes.reason?.message;

    if (deductionsRes.status === 'fulfilled') setDeductions(safeArray(deductionsRes.value?.data));
    else nextErrors.deductions = deductionsRes.reason?.message;

    if (attendanceCalendarRes.status === 'fulfilled') {
      const cal = attendanceCalendarRes.value?.data || {};
      setAttendanceCalendar({ assignments: safeArray(cal.assignments), attendance: safeArray(cal.attendance) });
    } else nextErrors.attendanceCalendar = attendanceCalendarRes.reason?.message;

    if (adminNotesRes.status === 'fulfilled') setAdminNotes(safeArray(adminNotesRes.value?.data));
    else nextErrors.adminNotes = adminNotesRes.reason?.message;
    setAdminNotesLoading(false);

    if (leaveSummaryRes.status === 'fulfilled') {
      const ls = leaveSummaryRes.value?.data || {};
      setLeaveSummary({
        total_leave_days: ls.total_leave_days || 0,
        month_leave_days: ls.month_leave_days || 0,
        approved_leaves: safeArray(ls.approved_leaves),
      });
    } else nextErrors.leaveSummary = leaveSummaryRes.reason?.message;

    setSectionErrors(nextErrors);
    setLoading(false);
  };

  useEffect(() => { loadPage(); }, [adminToken, staffProfileId]);

  useEffect(() => {
    if (!payoutForm.company_bank_account_id && companyBankAccounts.length > 0) {
      setPayoutForm(c => ({ ...c, company_bank_account_id: companyBankAccounts[0].account_id || '' }));
    }
  }, [companyBankAccounts, payoutForm.company_bank_account_id]);

  const handleToggleAccount = async () => {
    try {
      setStatusUpdating(true);
      if (isActive) await runAdminRequest(() => apiClient.deactivateStaffAccount(staffProfileId));
      else await runAdminRequest(() => apiClient.reactivateStaffAccount(staffProfileId));
      await loadPage();
    } catch (e) {
      setError(e?.message || 'Failed to update staff account status');
    } finally {
      setStatusUpdating(false);
    }
  };

  const refreshData = async () => {
    try { setRefreshing(true); await loadPage(); } finally { setRefreshing(false); }
  };

  const handlePayoutFieldChange = (field) => (e) => {
    setPayoutForm(c => ({ ...c, [field]: e.target.value }));
    setPayoutSubmitError('');
    setPayoutSubmitSuccess('');
  };

  const submitPayout = async (e) => {
    e.preventDefault();
    setPayoutSubmitError('');
    setPayoutSubmitSuccess('');
    try {
      setPayoutSubmitting(true);
      await runAdminRequest(() => apiClient.createStaffPayout(staffProfileId, {
        amount: payoutForm.amount,
        company_bank_account_id: payoutForm.company_bank_account_id || null,
        staff_bank_account_id: payoutForm.staff_bank_account_id || null,
        payment_method: payoutForm.payment_method,
        reference_number: payoutForm.reference_number,
        notes: payoutForm.notes,
      }));
      setPayoutSubmitSuccess('Payout recorded successfully.');
      setPayoutForm({ amount: '', company_bank_account_id: '', staff_bank_account_id: '', payment_method: 'BANK_TRANSFER', reference_number: '', notes: '' });
      await loadPage();
    } catch (err) {
      setPayoutSubmitError(err?.message || 'Failed to record payout');
    } finally {
      setPayoutSubmitting(false);
    }
  };

  const handleToggleReview = async (reviewId, currentVisible) => {
    setTogglingReviewId(reviewId);
    try {
      await runAdminRequest(() => apiClient.toggleReviewVisibility(reviewId));
      setReviewToggles(p => ({ ...p, [reviewId]: !currentVisible }));
    } catch { }
    finally { setTogglingReviewId(null); }
  };

  const handleExpandRequest = async (requestId) => {
    if (expandedRequestId === requestId) { setExpandedRequestId(null); return; }
    setExpandedRequestId(requestId);
    if (!requestLogs[requestId]) {
      setLoadingLogs(p => ({ ...p, [requestId]: true }));
      try {
        const res = await runAdminRequest(() => apiClient.getChangeRequestLogs(requestId));
        setRequestLogs(p => ({ ...p, [requestId]: safeArray(res?.data) }));
      } catch {
        setRequestLogs(p => ({ ...p, [requestId]: [] }));
      } finally {
        setLoadingLogs(p => ({ ...p, [requestId]: false }));
      }
    }
  };

  const submitDeduction = async (e) => {
    e.preventDefault();
    setDeductionError('');
    setDeductionSuccess('');
    try {
      setDeductionSubmitting(true);
      await runAdminRequest(() => apiClient.createStaffDeduction(staffProfileId, {
        amount: deductionForm.amount, reason: deductionForm.reason,
      }));
      setDeductionSuccess('Deduction applied. WhatsApp and SMS sent to staff member.');
      setDeductionForm({ amount: '', reason: '' });
      await loadPage();
    } catch (err) {
      setDeductionError(err?.message || 'Failed to apply deduction');
    } finally {
      setDeductionSubmitting(false);
    }
  };

  const reloadAdminNotes = async () => {
    try {
      const res = await runAdminRequest(() => apiClient.getStaffAdminNotes(staffProfileId));
      setAdminNotes(safeArray(res?.data));
    } catch { /* keep existing notes on failure */ }
  };

  const handleAddNote = async (text) => {
    setAdminNotesBusy(true);
    try {
      await runAdminRequest(() => apiClient.createStaffAdminNote(staffProfileId, text));
      await reloadAdminNotes();
    } catch (e) {
      setError(e?.message || 'Failed to add note');
    } finally {
      setAdminNotesBusy(false);
    }
  };

  const handleEditNote = async (noteId, text) => {
    setAdminNotesBusy(true);
    try {
      await runAdminRequest(() => apiClient.updateStaffAdminNote(staffProfileId, noteId, text));
      await reloadAdminNotes();
    } catch (e) {
      setError(e?.message || 'Failed to update note');
    } finally {
      setAdminNotesBusy(false);
    }
  };

  const handleDeleteNote = async (noteId) => {
    setAdminNotesBusy(true);
    try {
      await runAdminRequest(() => apiClient.deleteStaffAdminNote(staffProfileId, noteId));
      await reloadAdminNotes();
    } catch (e) {
      setError(e?.message || 'Failed to delete note');
    } finally {
      setAdminNotesBusy(false);
    }
  };

  const openAddBankModal = () => setBankModal({
    isOpen: true, mode: 'add', editing: null,
    form: { account_holder_name: '', bank_name: '', branch_name: '', account_number: '', currency: 'LKR' },
    saving: false, error: '',
  });

  const openEditBankModal = (account) => setBankModal({
    isOpen: true, mode: 'edit', editing: account.staff_bank_account_id,
    form: {
      account_holder_name: account.account_holder_name || '',
      bank_name: account.bank_name || '',
      branch_name: account.branch_name || '',
      account_number: account.account_number || '',
      currency: account.currency || 'LKR',
    },
    saving: false, error: '',
  });

  const handleBankModalSave = async () => {
    const { form, mode, editing } = bankModal;
    if (!form.account_holder_name || !form.bank_name || !form.account_number) {
      setBankModal(p => ({ ...p, error: 'Account holder name, bank name and account number are required.' }));
      return;
    }
    setBankModal(p => ({ ...p, saving: true, error: '' }));
    try {
      if (mode === 'add') await runAdminRequest(() => apiClient.createStaffBankAccount(staffProfileId, form));
      else await runAdminRequest(() => apiClient.updateStaffBankAccount(staffProfileId, editing, form));
      const res = await runAdminRequest(() => apiClient.getStaffBankAccounts(staffProfileId));
      setBankAccounts(safeArray(res?.data));
      setBankModal(p => ({ ...p, isOpen: false }));
    } catch (err) {
      setBankModal(p => ({ ...p, saving: false, error: err?.message || 'Failed to save bank account.' }));
    }
  };

  const handleDeleteBankAccount = async (bankAccountId) => {
    setDeletingBankId(bankAccountId);
    try {
      await runAdminRequest(() => apiClient.deleteStaffBankAccount(staffProfileId, bankAccountId));
      const res = await runAdminRequest(() => apiClient.getStaffBankAccounts(staffProfileId));
      setBankAccounts(safeArray(res?.data));
    } catch { } finally { setDeletingBankId(null); }
  };

  // ── change history helpers ────────────────────────────────────────────────
  const requestTypeMeta = (type) => {
    const map = {
      PROFILE_UPDATE:    { bg: '#E8F1F9', col: '#3F77B5', label: 'Profile Update' },
      BANK_ACCOUNT_ADD:  { bg: '#E3F1E8', col: '#2F7A53', label: 'Bank Add' },
      BANK_ACCOUNT_EDIT: { bg: '#FBF1DD', col: '#B07A1E', label: 'Bank Edit' },
      BANK_ACCOUNT_REMOVE: { bg: '#F7E6E3', col: '#BC4338', label: 'Bank Remove' },
    };
    return map[type] || { bg: '#F0EDE6', col: '#7A756A', label: type };
  };
  const auditActionMeta = (action) => {
    const map = {
      SUBMITTED: { dot: '#9A9488', bg: '#F0EDE6', col: '#7A756A' },
      CLAIMED:   { dot: '#3F77B5', bg: '#E8F1F9', col: '#3F77B5' },
      APPROVED:  { dot: '#2F8A5B', bg: '#E3F1E8', col: '#2F7A53' },
      REJECTED:  { dot: '#BC4338', bg: '#F7E6E3', col: '#BC4338' },
    };
    return map[action] || { dot: '#9A9488', bg: '#F0EDE6', col: '#7A756A' };
  };

  const renderChangeDiff = (requestType, requestedChanges) => {
    if (!requestedChanges) return <p style={{ fontSize: 13, color: '#9A9488', margin: 0 }}>No change data available.</p>;
    if (requestType === 'PROFILE_UPDATE' || requestType === 'BANK_ACCOUNT_EDIT') {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          {Object.entries(requestedChanges).map(([field, change]) => (
            <div key={field} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, background: '#FBF9F4', border: '1px solid #EFEAE0', borderRadius: 10, padding: '10px 12px', fontSize: 13 }}>
              <span style={{ minWidth: 140, fontWeight: 600, color: '#5A554B', textTransform: 'capitalize' }}>{field.replace(/_/g, ' ')}</span>
              <span style={{ color: '#BC4338', textDecoration: 'line-through' }}>{String(change?.old_value ?? '—')}</span>
              <span style={{ color: '#A39D91' }}>→</span>
              <span style={{ fontWeight: 600, color: '#2F7A53' }}>{String(change?.new_value ?? '—')}</span>
            </div>
          ))}
        </div>
      );
    }
    if (requestType === 'BANK_ACCOUNT_ADD') {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          {Object.entries(requestedChanges).map(([field, value]) => (
            <div key={field} style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#FBF9F4', border: '1px solid #EFEAE0', borderRadius: 10, padding: '10px 12px', fontSize: 13 }}>
              <span style={{ minWidth: 140, fontWeight: 600, color: '#5A554B', textTransform: 'capitalize' }}>{field.replace(/_/g, ' ')}</span>
              <span style={{ fontWeight: 600, color: '#2F7A53' }}>{String(value ?? '—')}</span>
            </div>
          ))}
        </div>
      );
    }
    if (requestType === 'BANK_ACCOUNT_REMOVE') {
      return (
        <div style={{ background: '#F7E6E3', border: '1px solid #E3B5AF', borderRadius: 10, padding: '10px 12px', fontSize: 13, color: '#BC4338' }}>
          Remove bank account ID: <span style={{ fontFamily: "'JetBrains Mono',monospace", fontWeight: 600 }}>{requestedChanges.staff_bank_account_id}</span>
        </div>
      );
    }
    return <pre style={{ overflowX: 'auto', background: '#F4F1EA', borderRadius: 10, padding: 12, fontSize: 12 }}>{JSON.stringify(requestedChanges, null, 2)}</pre>;
  };

  // ── tab panels ────────────────────────────────────────────────────────────
  const renderOverview = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16, alignItems: 'start' }}>
        <Card>
          <CardTitle>Staff information</CardTitle>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 15 }}>
            <Field label="Full name" value={profile.full_name} />
            <Field label="Designation" value={profile.designation} />
            <Field label="Email" value={profile.email} />
            <Field label="Phone" value={profile.mobile_number} />
            <Field label="Location" value={profile.location || profile.home_address} />
            <Field
              label="Verification"
              value={profile.verification_status}
              color={String(profile.verification_status || '').toLowerCase() === 'verified' ? '#2F7A53' : undefined}
            />
            <Field label="Willing to live in" value={profile.willing_to_live_in ? 'Yes' : 'No'} />
            <Field label="Member since" value={formatDate(profile.created_at)} />
            <Field label="Average rating" value={averageRating ? `${averageRating.toFixed(1)} / 5` : '-'} />
            <Field label="Total reviews" value={totalReviews || '-'} />
          </div>
        </Card>

        <Card>
          <CardTitle sub="Deactivate or reactivate this staff account.">Account control</CardTitle>
          <div style={{
            background: isActive ? '#F1F8F1' : '#FEF2F2',
            border: `1px solid ${isActive ? '#DCEEDD' : '#FECACA'}`,
            borderRadius: 13, padding: '14px 15px', marginBottom: 14,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ width: 9, height: 9, borderRadius: '50%', background: isActive ? '#2F8A5B' : '#DC2626', flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: '#2A2722' }}>{isActive ? 'Account enabled' : 'Account disabled'}</div>
                <div style={{ fontSize: 12, color: '#6F6A60', marginTop: 1 }}>
                  {isActive ? 'This staff member can sign in and accept bookings.' : 'This staff member cannot sign in.'}
                </div>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={handleToggleAccount}
            disabled={statusUpdating}
            style={{
              width: '100%', background: '#fff', border: `1px solid ${isActive ? '#E3B5AF' : '#A3D9B1'}`,
              borderRadius: 10, padding: 11, fontFamily: 'inherit', fontSize: 13.5, fontWeight: 700,
              color: isActive ? '#BC4338' : '#2F7A53', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
              opacity: statusUpdating ? 0.6 : 1,
            }}
          >
            {statusUpdating && <Loader2 style={{ width: 14, height: 14, animation: 'spin 1s linear infinite' }} />}
            {isActive ? 'Deactivate account' : 'Reactivate account'}
          </button>
        </Card>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 16, alignItems: 'start' }}>
        <Card>
          <CardTitle>Current assignment</CardTitle>
          {currentAssignment ? (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 13, marginBottom: 16 }}>
                <span style={{ width: 11, height: 11, borderRadius: '50%', background: '#3F77B5', flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700 }}>{currentAssignment.patient_name || 'Patient'}</div>
                  <div style={{ fontSize: 12.5, color: '#6F6A60' }}>
                    {currentAssignment.service_type || '-'} · since {formatDate(currentAssignment.service_start_date || currentAssignment.start_date)}
                  </div>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 13 }}>
                <Field label="Booking code" value={currentAssignment.booking_id} mono />
                <Field label="Client" value={currentAssignment.client_name} />
                <Field label="Daily rate" value={formatMoney(currentAssignment.daily_rate || currentAssignment.booking_daily_rate)} />
                <Field label="Status" value={currentAssignment.status} />
              </div>
            </>
          ) : (
            <Empty title="No active booking" subtitle="This staff member is not currently assigned to a booking." />
          )}
        </Card>

        <Card>
          <CardTitle>Recent activity</CardTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            {safeArray(overviewBookingHistory).slice(0, 3).length === 0 ? (
              <Empty title="No recent bookings" />
            ) : safeArray(overviewBookingHistory).slice(0, 3).map((row, i) => (
              <div key={row.assignment_id || i} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                background: '#FBF9F4', border: '1px solid #EFEAE0', borderRadius: 11, padding: '11px 13px',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                  <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#6F6A60', flexShrink: 0 }} />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{row.client_name || 'Client'}</div>
                    <div style={{ fontSize: 11.5, color: '#A39D91' }}>{row.patient_name || '-'} · {row.status || '-'}</div>
                  </div>
                </div>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#5A554B' }}>{formatMoney(row.amount_allocated || row.daily_rate)}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );

  const renderEarnings = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 14 }}>
        <MiniCard label="Current earnings" value={formatMoney(currentEarnings)} color="#2F8A5B" onClick={() => navigate(`/admin/staff/${staffProfileId}/current-earnings`)} />
        <MiniCard label="Total earned" value={formatMoney(totalEarned)} onClick={() => navigate(`/admin/staff/${staffProfileId}/total-earnings`)} />
        <MiniCard label="Paid out" value={formatMoney(totalPaidOut)} />
        <MiniCard label="Outstanding" value={formatMoney(outstandingPayable)} color="#BC4338" />
      </div>

      <Card>
        <CardTitle>Earnings transactions</CardTitle>
        {sectionErrors.earningsTransactions ? (
          <Empty title="Failed to load earnings transactions" subtitle={sectionErrors.earningsTransactions} />
        ) : safeArray(earningsTransactions).length === 0 ? (
          <Empty title="No earnings transactions" subtitle="Salary accrual and payout rows will appear here." />
        ) : (
          <div>
            <TableHead cols="1fr 1fr 1.1fr 0.9fr 1fr 0.9fr">
              <span>Transaction</span><span>Date</span><span>Category</span><span>Type</span><span>Reference</span>
              <span style={{ textAlign: 'right' }}>Amount</span>
            </TableHead>
            {earningsTransactions.map((tx, i) => {
              const isDebit = tx.transaction_type === 'DEBIT';
              return (
                <TableRow key={tx.transaction_id || i} cols="1fr 1fr 1.1fr 0.9fr 1fr 0.9fr">
                  <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12, color: '#5A554B' }}>{tx.transaction_id || '-'}</div>
                  <div style={{ fontSize: 12.5, color: '#5A554B' }}>{formatDateTime(tx.created_at)}</div>
                  <div><span style={{ display: 'inline-block', fontSize: 11.5, fontWeight: 600, color: '#5A554B', background: '#F4F1EA', borderRadius: 7, padding: '3px 9px' }}>{tx.category || '-'}</span></div>
                  <div><span style={{ display: 'inline-block', fontSize: 11.5, fontWeight: 600, borderRadius: 7, padding: '3px 9px', background: isDebit ? '#F7E6E3' : '#E3F1E8', color: isDebit ? '#BC4338' : '#2F7A53' }}>{tx.transaction_type || '-'}</span></div>
                  <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11.5, color: '#6F6A60' }}>{tx.reference_number || tx.payment_method || '-'}</div>
                  <div style={{ textAlign: 'right', fontSize: 13.5, fontWeight: 700, color: isDebit ? '#BC4338' : '#2F8A5B' }}>{formatMoney(tx.amount)}</div>
                </TableRow>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );

  const renderCurrentBooking = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {currentAssignment && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 14 }}>
          <MiniCard label="Assignment status" value={currentAssignment.status || '-'} />
          <MiniCard label="Service type" value={currentAssignment.service_type || '-'} />
          <MiniCard label="Client" value={currentAssignment.client_name || '-'} />
          <MiniCard label="Start date" value={formatDate(currentAssignment.service_start_date || currentAssignment.start_date)} />
        </div>
      )}
      <Card>
        <CardTitle sub="Live booking assignment loaded from the current-booking route">Current assignment</CardTitle>
        {sectionErrors.currentBooking ? (
          <Empty title="Failed to load current booking" subtitle={sectionErrors.currentBooking} />
        ) : currentAssignment ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16 }}>
            <Field label="Assignment ID" value={currentAssignment.assignment_id} mono />
            <Field label="Booking ID" value={currentAssignment.booking_id} mono />
            <Field label="Client name" value={currentAssignment.client_name} />
            <Field label="Patient name" value={currentAssignment.patient_name} />
            <Field label="Service start" value={formatDate(currentAssignment.service_start_date || currentAssignment.start_date)} />
            <Field label="Service end" value={formatDate(currentAssignment.service_end_date)} />
            <Field label="Daily rate" value={formatMoney(currentAssignment.daily_rate || currentAssignment.booking_daily_rate)} />
            <Field label="Assigned on" value={formatDateTime(currentAssignment.assigned_on)} />
          </div>
        ) : (
          <Empty title="No active booking" subtitle="This staff member is not currently assigned to a booking." />
        )}
      </Card>
    </div>
  );

  const renderBookingHistory = () => {
    const rows = bookingHistory.length ? bookingHistory : overviewBookingHistory;
    const totalDays = rows.reduce((s, r) => {
      if (!r.service_start_date) return s;
      const start = new Date(r.service_start_date);
      const end = r.service_end_date ? new Date(r.service_end_date) : new Date();
      return s + Math.max(1, Math.ceil((end - start) / 86400000));
    }, 0);
    const avgSalary = rows.length
      ? rows.reduce((s, r) => s + Number(r.total_salary_paid || r.total_salary || 0), 0) / rows.length
      : 0;

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 14 }}>
          <MiniCard label="Total bookings" value={rows.length} />
          <MiniCard label="Days worked" value={totalDays} />
          <MiniCard label="Active booking" value={currentAssignment?.client_name || '—'} color="#3F77B5" />
          <MiniCard label="Avg per booking" value={rows.length ? formatMoney(avgSalary) : '—'} />
        </div>
        <Card>
          <CardTitle>Booking history</CardTitle>
          {sectionErrors.bookingHistory ? (
            <Empty title="Failed to load booking history" subtitle={sectionErrors.bookingHistory} />
          ) : rows.length === 0 ? (
            <Empty title="No booking history" subtitle="Previous booking assignments will appear here." />
          ) : (
            <div>
              <TableHead cols="1fr 1.2fr 1.2fr 0.9fr 1fr 0.8fr 1fr">
                <span>Booking</span><span>Client</span><span>Care profile</span><span>Status</span>
                <span>Dates</span><span style={{ textAlign: 'right' }}>Days</span><span style={{ textAlign: 'right' }}>Salary</span>
              </TableHead>
              {rows.map((row, i) => {
                const start = row.service_start_date ? new Date(row.service_start_date) : null;
                const end = row.service_end_date ? new Date(row.service_end_date) : new Date();
                const days = start ? Math.max(1, Math.ceil((end - start) / 86400000)) : null;
                return (
                  <TableRow key={row.assignment_id || i} cols="1fr 1.2fr 1.2fr 0.9fr 1fr 0.8fr 1fr">
                    <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12, color: '#5A554B' }}>{row.booking_id || row.assignment_id || '-'}</div>
                    <div style={{ fontSize: 13.5, fontWeight: 600, color: '#2A2722' }}>{row.client_name || '-'}</div>
                    <div style={{ fontSize: 13, color: '#5A554B' }}>{row.patient_name || '-'}</div>
                    <div><StatusPill value={row.status} /></div>
                    <div style={{ fontSize: 12.5, color: '#5A554B' }}>{start ? formatDate(row.service_start_date) : '-'}</div>
                    <div style={{ textAlign: 'right', fontSize: 13, color: '#5A554B' }}>{days ? `${days}d` : '-'}</div>
                    <div style={{ textAlign: 'right', fontSize: 13.5, fontWeight: 700, color: '#2F8A5B' }}>{formatMoney(row.total_salary_paid || row.total_salary)}</div>
                  </TableRow>
                );
              })}
            </div>
          )}
        </Card>
      </div>
    );
  };

  const renderReviews = () => {
    const distribution = safeArray(overviewReviews.distribution);
    const recentReviews = safeArray(overviewReviews.recent);
    const fiveStarCount = distribution.find(d => d.rating === 5)?.count || 0;

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14 }}>
          <MiniCard label="Average rating" value={averageRating ? `${averageRating.toFixed(1)} ★` : '-'} color="#C98A2E" />
          <MiniCard label="Total reviews" value={totalReviews || 0} />
          <MiniCard label="5-star reviews" value={fiveStarCount} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16, alignItems: 'start' }}>
          <Card>
            <CardTitle>Rating distribution</CardTitle>
            {distribution.length === 0 ? (
              <Empty title="No ratings yet" />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
                {distribution.map(item => (
                  <div key={item.rating} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 46, fontSize: 12.5, fontWeight: 600, color: '#5A554B' }}>{item.rating} star</div>
                    <div style={{ flex: 1, height: 9, borderRadius: 5, background: '#EFEAE0', overflow: 'hidden' }}>
                      <div style={{ height: 9, borderRadius: 5, background: '#C98A2E', width: `${Math.min(100, Number(item.count || 0) * 15)}%` }} />
                    </div>
                    <div style={{ width: 28, textAlign: 'right', fontSize: 12.5, fontWeight: 700 }}>{item.count}</div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card>
            <CardTitle>Recent reviews</CardTitle>
            {recentReviews.length === 0 ? (
              <Empty title="No reviews available" />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {recentReviews.map((review, i) => {
                  const isVisible = reviewToggles[review.review_id] ?? review.is_visible ?? true;
                  return (
                    <div key={review.review_id || i} style={{ background: '#FBF9F4', border: '1px solid #EFEAE0', borderRadius: 13, padding: '14px 16px', opacity: isVisible ? 1 : 0.6 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                        <div>
                          <div style={{ fontSize: 13.5, fontWeight: 700 }}>{review.client_name || 'Client'}</div>
                          <div style={{ fontSize: 11.5, color: '#A39D91' }}>{formatDateTime(review.created_at)}</div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: '#FBF1DD', color: '#C98A2E', borderRadius: 999, padding: '3px 10px', fontSize: 12, fontWeight: 700 }}>
                            ★ {review.rating || '-'}
                          </span>
                          <span style={{ fontSize: 11.5, fontWeight: 600, borderRadius: 999, padding: '3px 10px', background: isVisible ? '#E3F1E8' : '#F0EDE6', color: isVisible ? '#2F7A53' : '#9A9488' }}>
                            {isVisible ? '● Active' : '○ Hidden'}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleToggleReview(review.review_id, isVisible)}
                            disabled={togglingReviewId === review.review_id}
                            style={{
                              display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 11px', borderRadius: 8,
                              fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                              background: isVisible ? '#F7E6E3' : '#E3F1E8', color: isVisible ? '#BC4338' : '#2F7A53',
                              border: `1px solid ${isVisible ? '#E3B5AF' : '#BBDDC8'}`,
                              opacity: togglingReviewId === review.review_id ? 0.5 : 1,
                            }}
                          >
                            {togglingReviewId === review.review_id && <Loader2 style={{ width: 11, height: 11, animation: 'spin 1s linear infinite' }} />}
                            {isVisible ? 'Deactivate' : 'Activate'}
                          </button>
                        </div>
                      </div>
                      <p style={{ margin: '9px 0 0', fontSize: 13, color: '#5A554B', lineHeight: 1.5 }}>{review.review_text || '-'}</p>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>
      </div>
    );
  };

  const renderPayouts = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14 }}>
        <MiniCard label="All-time paid" value={formatMoney(payoutsSummary?.all_time_paid ?? overviewPayoutSummary.total_payouts ?? 0)} />
        <MiniCard label="Paid this month" value={formatMoney(payoutsSummary?.paid_this_month ?? 0)} color="#2F8A5B" />
        <MiniCard label="Outstanding" value={formatMoney(payoutsSummary?.outstanding ?? currentEarnings)} color="#BC4338" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16, alignItems: 'start' }}>
        <Card>
          <CardTitle>Payout history</CardTitle>
          {sectionErrors.payouts ? (
            <Empty title="Failed to load payouts" subtitle={sectionErrors.payouts} />
          ) : safeArray(payouts).length === 0 ? (
            <Empty title="No payouts recorded" />
          ) : (
            <div>
              <TableHead cols="1fr 1.1fr 1fr 0.9fr 1fr">
                <span>Payout</span><span>Date</span><span>Method</span><span>Status</span><span style={{ textAlign: 'right' }}>Amount</span>
              </TableHead>
              {payouts.map((payout, i) => (
                <TableRow key={payout.staff_payment_id || i} cols="1fr 1.1fr 1fr 0.9fr 1fr">
                  <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12, color: '#5A554B' }}>{payout.staff_payment_id || '-'}</div>
                  <div style={{ fontSize: 12.5, color: '#5A554B' }}>{formatDateTime(payout.paid_at)}</div>
                  <div><span style={{ display: 'inline-block', fontSize: 11.5, fontWeight: 600, color: '#5A554B', background: '#F4F1EA', borderRadius: 7, padding: '3px 9px' }}>{payout.payment_method || '-'}</span></div>
                  <div><StatusPill value={payout.status} /></div>
                  <div style={{ textAlign: 'right', fontSize: 13.5, fontWeight: 700 }}>{formatMoney(payout.amount_paid)}</div>
                </TableRow>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <CardTitle sub="Writes to the payroll ledger.">Record a payout</CardTitle>
          <form onSubmit={submitPayout} style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
            <div>
              <label style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: '#7A756A', marginBottom: 5 }}>Amount</label>
              <input type="number" min="0" step="0.01" value={payoutForm.amount} onChange={handlePayoutFieldChange('amount')} placeholder="0.00" style={inp} required />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: '#7A756A', marginBottom: 5 }}>Company bank account</label>
              <select value={payoutForm.company_bank_account_id} onChange={handlePayoutFieldChange('company_bank_account_id')} style={{ ...inp, cursor: 'pointer' }}>
                <option value="">Select company bank account</option>
                {companyBankAccounts.map(acc => (
                  <option key={acc.account_id} value={acc.account_id}>
                    {acc.account_nickname || acc.account_holder_name || acc.bank_name || 'Company Bank Account'}
                    {acc.account_number ? ` - ${acc.account_number}` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: '#7A756A', marginBottom: 5 }}>Staff bank account</label>
              <select value={payoutForm.staff_bank_account_id} onChange={handlePayoutFieldChange('staff_bank_account_id')} style={{ ...inp, cursor: 'pointer' }}>
                <option value="">Select staff bank account</option>
                {bankAccounts.map(acc => (
                  <option key={acc.staff_bank_account_id} value={acc.staff_bank_account_id}>
                    {acc.account_holder_name || acc.bank_name || 'Bank Account'}
                    {acc.account_number ? ` - ${acc.account_number}` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: '#7A756A', marginBottom: 5 }}>Reference (optional)</label>
              <input type="text" value={payoutForm.reference_number} onChange={handlePayoutFieldChange('reference_number')} placeholder="TRF / receipt no." style={inp} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: '#7A756A', marginBottom: 5 }}>Notes (optional)</label>
              <input type="text" value={payoutForm.notes} onChange={handlePayoutFieldChange('notes')} placeholder="Optional notes" style={inp} />
            </div>
            {payoutSubmitError && (
              <div style={{ background: '#F7E6E3', border: '1px solid #E3B5AF', borderRadius: 10, padding: '10px 12px', fontSize: 13, color: '#BC4338' }}>{payoutSubmitError}</div>
            )}
            {payoutSubmitSuccess && (
              <div style={{ background: '#E3F1E8', border: '1px solid #BBDDC8', borderRadius: 10, padding: '10px 12px', fontSize: 13, color: '#2F7A53' }}>{payoutSubmitSuccess}</div>
            )}
            <div style={{ display: 'flex', gap: 8, marginTop: 3 }}>
              <button type="submit" disabled={payoutSubmitting} style={{
                flex: 1, background: '#137A6B', border: 'none', borderRadius: 10, padding: 12,
                fontFamily: 'inherit', fontSize: 14, fontWeight: 700, color: '#fff', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                opacity: payoutSubmitting ? 0.6 : 1,
              }}>
                {payoutSubmitting && <Loader2 style={{ width: 14, height: 14, animation: 'spin 1s linear infinite' }} />}
                Record payout
              </button>
              <button
                type="button"
                onClick={() => setPayoutForm({ amount: '', company_bank_account_id: '', staff_bank_account_id: '', payment_method: 'BANK_TRANSFER', reference_number: '', notes: '' })}
                style={{ background: '#FCFBF8', border: '1px solid #E7E1D6', borderRadius: 10, padding: '12px 16px', fontFamily: 'inherit', fontSize: 13.5, fontWeight: 600, color: '#5A554B', cursor: 'pointer' }}
              >
                Reset
              </button>
            </div>
          </form>
        </Card>
      </div>
    </div>
  );

  const renderDeductions = () => {
    const totalDeducted = deductions.reduce((s, d) => s + parseFloat(d.amount || 0), 0);
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 14 }}>
          <MiniCard label="Total deducted" value={formatMoney(totalDeducted)} color="#BC4338" />
          <MiniCard label="Total entries" value={deductions.length} />
        </div>

        <Card>
          <CardTitle sub="Deducts from earnings. A WhatsApp message and SMS are sent automatically.">Apply deduction</CardTitle>
          <form onSubmit={submitDeduction}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr auto', gap: 11, alignItems: 'end' }}>
              <div>
                <label style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: '#7A756A', marginBottom: 5 }}>Amount (LKR)</label>
                <input
                  type="number" min="0.01" step="0.01" value={deductionForm.amount}
                  onChange={e => { setDeductionForm(f => ({ ...f, amount: e.target.value })); setDeductionError(''); setDeductionSuccess(''); }}
                  placeholder="0.00" style={inp} required
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: '#7A756A', marginBottom: 5 }}>Reason</label>
                <input
                  type="text" value={deductionForm.reason}
                  onChange={e => { setDeductionForm(f => ({ ...f, reason: e.target.value })); setDeductionError(''); setDeductionSuccess(''); }}
                  placeholder="e.g. Uniform deposit, advance repayment" style={inp} required
                />
              </div>
              <button
                type="submit" disabled={deductionSubmitting}
                style={{
                  background: '#BC4338', border: 'none', borderRadius: 10, padding: '11px 18px',
                  fontFamily: 'inherit', fontSize: 14, fontWeight: 700, color: '#fff', cursor: 'pointer',
                  whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 6,
                  opacity: deductionSubmitting ? 0.6 : 1,
                }}
              >
                {deductionSubmitting && <Loader2 style={{ width: 14, height: 14, animation: 'spin 1s linear infinite' }} />}
                Apply deduction
              </button>
            </div>
            {deductionError && <div style={{ marginTop: 10, background: '#F7E6E3', border: '1px solid #E3B5AF', borderRadius: 10, padding: '10px 12px', fontSize: 13, color: '#BC4338' }}>{deductionError}</div>}
            {deductionSuccess && <div style={{ marginTop: 10, background: '#E3F1E8', border: '1px solid #BBDDC8', borderRadius: 10, padding: '10px 12px', fontSize: 13, color: '#2F7A53' }}>{deductionSuccess}</div>}
          </form>
        </Card>

        <Card>
          <CardTitle>Deduction history</CardTitle>
          {sectionErrors.deductions ? (
            <Empty title="Failed to load deductions" subtitle={sectionErrors.deductions} />
          ) : deductions.length === 0 ? (
            <Empty title="No deductions recorded" />
          ) : (
            <div>
              <TableHead cols="1fr 1.6fr 1fr 0.9fr 1fr">
                <span>Date</span><span>Reason</span><span>Recorded by</span><span>Status</span><span style={{ textAlign: 'right' }}>Amount</span>
              </TableHead>
              {deductions.map((d, i) => (
                <TableRow key={d.transaction_id || i} cols="1fr 1.6fr 1fr 0.9fr 1fr">
                  <div style={{ fontSize: 12.5, color: '#5A554B' }}>{formatDateTime(d.created_at)}</div>
                  <div style={{ fontSize: 13.5, fontWeight: 600 }}>{d.reason || '-'}</div>
                  <div style={{ fontSize: 13, color: '#5A554B' }}>{d.recorded_by || 'Admin'}</div>
                  <div><StatusPill value={d.status} /></div>
                  <div style={{ textAlign: 'right', fontSize: 13.5, fontWeight: 700, color: '#BC4338' }}>{formatMoney(d.amount)}</div>
                </TableRow>
              ))}
            </div>
          )}
        </Card>
      </div>
    );
  };

  const renderBankAccounts = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 15.5, fontWeight: 700, color: '#2A2722' }}>Staff bank accounts</h3>
          <p style={{ margin: '3px 0 0', fontSize: 12.5, color: '#9A9488' }}>Personal bank account records for this staff member.</p>
        </div>
        <button
          type="button" onClick={openAddBankModal}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: '#137A6B', border: 'none', borderRadius: 10, padding: '10px 15px', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: '#fff', cursor: 'pointer' }}
        >
          + Add account
        </button>
      </div>

      {sectionErrors.bankAccounts ? (
        <Empty title="Failed to load bank accounts" subtitle={sectionErrors.bankAccounts} />
      ) : safeArray(bankAccounts).length === 0 ? (
        <Empty title="No bank accounts saved" subtitle="Use the Add Account button to add a bank account for this staff member." />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14 }}>
          {bankAccounts.map((account, i) => (
            <div key={account.staff_bank_account_id || i} style={{ background: '#fff', border: '1px solid #ECE7DF', borderRadius: 16, padding: 18 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 14 }}>
                <div>
                  <div style={{ fontSize: 14.5, fontWeight: 700 }}>{account.account_holder_name || account.bank_name || 'Bank Account'}</div>
                  <div style={{ fontSize: 12.5, color: '#6F6A60', marginTop: 2 }}>{account.bank_name || '-'}{account.branch_name ? ` · ${account.branch_name}` : ''}</div>
                </div>
                <span style={{ fontSize: 11.5, fontWeight: 600, padding: '3px 9px', borderRadius: 999, background: account.is_active ? '#E3F1E8' : '#F7E6E3', color: account.is_active ? '#2F7A53' : '#BC4338' }}>
                  {account.is_active ? 'Active' : 'Inactive'}
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7, fontSize: 12.5, color: '#5A554B', marginBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                  <span style={{ color: '#9A9488' }}>Account no.</span>
                  <span style={{ fontFamily: "'JetBrains Mono',monospace" }}>{account.account_number || '-'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                  <span style={{ color: '#9A9488' }}>Branch</span><span>{account.branch_name || '-'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                  <span style={{ color: '#9A9488' }}>Currency</span><span>{account.currency || 'LKR'}</span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, borderTop: '1px solid #F2EEE6', paddingTop: 12 }}>
                <button
                  type="button" onClick={() => openEditBankModal(account)}
                  style={{ flex: 1, background: '#FCFBF8', border: '1px solid #E7E1D6', borderRadius: 9, padding: 8, fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, color: '#5A554B', cursor: 'pointer' }}
                >Edit</button>
                <button
                  type="button"
                  onClick={() => handleDeleteBankAccount(account.staff_bank_account_id)}
                  disabled={deletingBankId === account.staff_bank_account_id}
                  style={{ flex: 1, background: '#fff', border: '1px solid #E3B5AF', borderRadius: 9, padding: 8, fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, color: '#BC4338', cursor: 'pointer', opacity: deletingBankId === account.staff_bank_account_id ? 0.5 : 1 }}
                >
                  {deletingBankId === account.staff_bank_account_id ? '...' : 'Remove'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const renderChangeHistory = () => {
    const approvedCount = changeRequests.filter(r => r.status === 'APPROVED').length;
    const rejectedCount = changeRequests.filter(r => r.status === 'REJECTED').length;
    const pendingCount = changeRequests.filter(r => r.status === 'PENDING' || r.status === 'UNDER_REVIEW').length;

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 14 }}>
          <MiniCard label="Total requests" value={changeRequests.length} />
          <MiniCard label="Pending" value={pendingCount} color="#C98A2E" />
          <MiniCard label="Approved" value={approvedCount} color="#2F8A5B" />
          <MiniCard label="Rejected" value={rejectedCount} color="#BC4338" />
        </div>

        <Card>
          <CardTitle>Change request history</CardTitle>
          {sectionErrors.changeRequests ? (
            <Empty title="Failed to load change requests" subtitle={sectionErrors.changeRequests} />
          ) : changeRequests.length === 0 ? (
            <Empty title="No change requests" subtitle="This staff member has not submitted any change requests yet." />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
              {changeRequests.map(req => {
                const isExpanded = expandedRequestId === req.request_id;
                const logs = requestLogs[req.request_id] || [];
                const isLoadingLog = loadingLogs[req.request_id];
                const tm = requestTypeMeta(req.request_type);

                return (
                  <div key={req.request_id} style={{ border: '1px solid #ECE7DF', borderRadius: 13, overflow: 'hidden' }}>
                    <button
                      type="button"
                      onClick={() => handleExpandRequest(req.request_id)}
                      style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '14px 16px', cursor: 'pointer', background: '#FCFBF8', border: 'none', fontFamily: 'inherit', textAlign: 'left' }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 11.5, fontWeight: 700, padding: '3px 9px', borderRadius: 7, background: tm.bg, color: tm.col }}>{tm.label}</span>
                        <StatusPill value={req.status?.replace(/_/g, ' ')} />
                        <span style={{ fontSize: 12.5, color: '#8A8478' }}>Submitted {formatDateTime(req.created_at)}</span>
                        {req.reviewer_name && (
                          <span style={{ fontSize: 12.5, color: '#8A8478' }}>· Reviewer: <strong style={{ color: '#2A2722' }}>{req.reviewer_name}</strong></span>
                        )}
                      </div>
                      <span style={{ fontSize: 14, color: '#A39D91' }}>{isExpanded ? '▲' : '▼'}</span>
                    </button>

                    {isExpanded && (
                      <div style={{ borderTop: '1px solid #EFEAE0', padding: '15px 16px', background: '#fff' }}>
                        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: '#A39D91', marginBottom: 9 }}>Requested changes</div>
                        {renderChangeDiff(req.request_type, req.requested_changes)}

                        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: '#A39D91', margin: '16px 0 11px' }}>Audit trail</div>
                        {isLoadingLog ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#9A9488' }}>
                            <Loader2 style={{ width: 14, height: 14, animation: 'spin 1s linear infinite' }} /> Loading logs...
                          </div>
                        ) : logs.length === 0 ? (
                          <p style={{ fontSize: 13, color: '#9A9488', margin: 0 }}>No audit log entries found.</p>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingLeft: 6 }}>
                            {logs.map((log, idx) => {
                              const am = auditActionMeta(log.action);
                              return (
                                <div key={log.log_id || idx} style={{ display: 'flex', alignItems: 'flex-start', gap: 11 }}>
                                  <span style={{ width: 9, height: 9, borderRadius: '50%', background: am.dot, marginTop: 4, flexShrink: 0 }} />
                                  <div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                      <span style={{ fontSize: 11.5, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: am.bg, color: am.col }}>{log.action}</span>
                                      <span style={{ fontSize: 13, fontWeight: 600 }}>{log.performed_by_name || 'Unknown'}</span>
                                      <span style={{ fontSize: 11.5, color: '#A39D91' }}>{formatDateTime(log.created_at)}</span>
                                    </div>
                                    {log.notes && <div style={{ fontSize: 12.5, color: '#6F6A60', fontStyle: 'italic', marginTop: 3 }}>"{log.notes}"</div>}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>
    );
  };

  // ── bank modal (Tailwind, identical to original) ───────────────────────────
  const renderBankModal = () => !bankModal.isOpen ? null : (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
        <div className="flex items-start gap-3 mb-5">
          <div className="p-2 bg-blue-100 rounded-xl">
            <Landmark className="h-5 w-5 text-blue-600" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-900">
              {bankModal.mode === 'add' ? 'Add Bank Account' : 'Edit Bank Account'}
            </h3>
            <p className="text-sm text-slate-500">For {profile.full_name || 'this staff member'}</p>
          </div>
        </div>
        {bankModal.error && (
          <div className="mb-4 bg-rose-50 border border-rose-200 text-rose-700 px-3 py-2 rounded-xl text-sm flex items-center gap-2">
            <AlertCircle className="h-4 w-4 flex-shrink-0" /> {bankModal.error}
          </div>
        )}
        <div className="space-y-3 mb-5">
          {[
            { label: 'Account Holder Name', key: 'account_holder_name', placeholder: 'e.g. John Perera', required: true },
            { label: 'Bank Name',            key: 'bank_name',           placeholder: 'e.g. Commercial Bank', required: true },
            { label: 'Branch Name',          key: 'branch_name',         placeholder: 'e.g. Colombo 03', required: false },
          ].map(({ label, key, placeholder, required }) => (
            <div key={key}>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                {label} {required && <span className="text-rose-500">*</span>}
              </label>
              <input
                value={bankModal.form[key]}
                onChange={e => setBankModal(p => ({ ...p, form: { ...p.form, [key]: e.target.value } }))}
                placeholder={placeholder}
                className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-100"
              />
            </div>
          ))}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Account Number <span className="text-rose-500">*</span></label>
              <input
                value={bankModal.form.account_number}
                onChange={e => setBankModal(p => ({ ...p, form: { ...p.form, account_number: e.target.value } }))}
                placeholder="1234567890"
                className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-100"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Currency</label>
              <select
                value={bankModal.form.currency}
                onChange={e => setBankModal(p => ({ ...p, form: { ...p.form, currency: e.target.value } }))}
                className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm outline-none transition focus:border-blue-500"
              >
                <option value="LKR">LKR</option>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
              </select>
            </div>
          </div>
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => setBankModal(p => ({ ...p, isOpen: false }))}
            className="flex-1 rounded-xl border border-slate-200 bg-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-200 transition-all"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleBankModalSave}
            disabled={bankModal.saving}
            className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-500 transition-all shadow-lg shadow-blue-600/20 disabled:opacity-60"
          >
            {bankModal.saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {bankModal.mode === 'add' ? 'Add Account' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );

  // ── loading / error ───────────────────────────────────────────────────────
  if (loading || authLoading) {
    return (
      <AdminLayout>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '45vh' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#6F6A60', fontSize: 14 }}>
            <Loader2 style={{ width: 18, height: 18, animation: 'spin 1s linear infinite' }} />
            Loading staff detail...
          </div>
        </div>
      </AdminLayout>
    );
  }

  if (error) {
    return (
      <AdminLayout>
        <div style={{ background: '#F7E6E3', border: '1px solid #E3B5AF', borderRadius: 16, padding: 24, color: '#BC4338' }}>
          <p style={{ fontWeight: 600, margin: '0 0 16px' }}>{error}</p>
          <button
            type="button"
            onClick={() => navigate('/admin/users')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: '#BC4338', border: 'none', borderRadius: 10, padding: '10px 16px', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: '#fff', cursor: 'pointer' }}
          >
            ← Back to staff roster
          </button>
        </div>
      </AdminLayout>
    );
  }

  const heroStatus = getSM(activeStatus);

  // ── main render ───────────────────────────────────────────────────────────
  return (
    <AdminLayout>
      {renderBankModal()}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      <div style={{
        margin: '-32px -32px -32px -32px',
        background: '#F6F3EC',
        minHeight: '100vh',
        padding: '26px 24px 60px',
        fontFamily: "'Hanken Grotesk',system-ui,sans-serif",
        color: '#2A2722',
        WebkitFontSmoothing: 'antialiased',
      }}>
        <div style={{ maxWidth: 1180, margin: '0 auto' }}>

          {/* HEADER */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 22 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <button
                type="button"
                onClick={() => navigate('/admin/users')}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: '#fff', border: '1px solid #E7E1D6', borderRadius: 10, padding: '9px 13px', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: '#5A554B', cursor: 'pointer' }}
              >
                ← Back to roster
              </button>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 34, height: 34, borderRadius: 9, background: '#137A6B', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 20, fontWeight: 700, lineHeight: 1 }}>+</div>
                <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-.01em' }}>VCare</div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12.5, color: '#8A8478', background: '#fff', border: '1px solid #E7E1D6', borderRadius: 8, padding: '7px 11px' }}>
                {profile.staff_code || staffProfileId}
              </span>
              <button
                type="button"
                onClick={refreshData}
                disabled={refreshing}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: '#fff', border: '1px solid #E7E1D6', borderRadius: 10, padding: '9px 13px', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: '#5A554B', cursor: 'pointer', opacity: refreshing ? 0.6 : 1 }}
              >
                {refreshing ? <Loader2 style={{ width: 14, height: 14, animation: 'spin 1s linear infinite' }} /> : '↻'} Refresh
              </button>
            </div>
          </div>

          {/* HERO */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 18, flexWrap: 'wrap', marginBottom: 20 }}>
            <div style={{ width: 62, height: 62, borderRadius: 16, background: '#E4F1ED', color: '#137A6B', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 800, flexShrink: 0, overflow: 'hidden' }}>
              {profile.profile_picture_url
                ? <img src={profile.profile_picture_url} alt={profile.full_name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : getInitials(profile.full_name)}
            </div>
            <div style={{ flex: 1, minWidth: 260 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 6 }}>
                <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, letterSpacing: '-.02em', lineHeight: 1.15 }}>
                  {profile.full_name || 'Staff profile'}
                </h1>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: heroStatus.bg, color: heroStatus.col, borderRadius: 999, padding: '5px 12px', fontSize: 12.5, fontWeight: 700, whiteSpace: 'nowrap' }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: heroStatus.dot }} />
                  {profile.current_status || 'Unknown'}
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: isActive ? '#E3F1E8' : '#F7E6E3', color: isActive ? '#2F7A53' : '#BC4338', borderRadius: 999, padding: '5px 12px', fontSize: 12.5, fontWeight: 700, whiteSpace: 'nowrap' }}>
                  {isActive ? '✓ Active account' : '✗ Deactivated'}
                </span>
              </div>
              <div style={{ fontSize: 15, fontWeight: 600, color: '#3A362F', marginBottom: 6 }}>
                {profile.designation || 'Staff member'}
              </div>
              <p style={{ margin: 0, fontSize: 14, color: '#6F6A60' }}>
                {profile.staff_code || staffProfileId}
                {profile.mobile_number ? ` · ${profile.mobile_number}` : ''}
                {profile.created_at ? ` · Joined ${formatDate(profile.created_at)}` : ''}
                {currentAssignment?.client_name ? ` · Currently on ${currentAssignment.client_name} booking` : ''}
              </p>
            </div>

            {/* ADMIN NOTES */}
            <div style={{ flex: '1 1 320px', minWidth: 280, maxWidth: 440 }}>
              <AdminNotesCarousel
                notes={adminNotes}
                loading={adminNotesLoading}
                busy={adminNotesBusy}
                onAdd={handleAddNote}
                onEdit={handleEditNote}
                onDelete={handleDeleteNote}
              />
            </div>
          </div>

          {/* STAT CARDS */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 14, marginBottom: 18 }}>
            <div
              style={{ background: '#fff', border: '1px solid #ECE7DF', borderRadius: 16, padding: '17px 18px', cursor: 'pointer' }}
              onClick={() => navigate(`/admin/staff/${staffProfileId}/current-earnings`)}
              title="Click to see current earnings breakdown"
            >
              <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: '.04em', textTransform: 'uppercase', color: '#9A9488' }}>Current earnings</div>
              <div style={{ fontSize: 25, fontWeight: 800, letterSpacing: '-.02em', marginTop: 7, color: '#2F8A5B' }}>{formatMoney(currentEarnings)}</div>
              <div style={{ fontSize: 12.5, color: '#2F8A5B', fontWeight: 600, marginTop: 4 }}>View breakdown →</div>
            </div>
            <div
              style={{ background: '#fff', border: '1px solid #ECE7DF', borderRadius: 16, padding: '17px 18px', cursor: 'pointer' }}
              onClick={() => navigate(`/admin/staff/${staffProfileId}/total-earnings`)}
              title="Click to see total earnings breakdown"
            >
              <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: '.04em', textTransform: 'uppercase', color: '#9A9488' }}>Total earned</div>
              <div style={{ fontSize: 25, fontWeight: 800, letterSpacing: '-.02em', marginTop: 7 }}>{formatMoney(totalEarned)}</div>
              <div style={{ fontSize: 12.5, color: '#6F6A60', fontWeight: 600, marginTop: 4 }}>across {totalBookings} bookings</div>
            </div>
            <div style={{ background: '#fff', border: '1px solid #ECE7DF', borderRadius: 16, padding: '17px 18px' }}>
              <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: '.04em', textTransform: 'uppercase', color: '#9A9488' }}>Paid out</div>
              <div style={{ fontSize: 25, fontWeight: 800, letterSpacing: '-.02em', marginTop: 7 }}>{formatMoney(totalPaidOut)}</div>
              <div style={{ fontSize: 12.5, color: '#6F6A60', fontWeight: 600, marginTop: 4 }}>total disbursed</div>
            </div>
            <div style={{ background: '#fff', border: '1px solid #ECE7DF', borderRadius: 16, padding: '17px 18px' }}>
              <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: '.04em', textTransform: 'uppercase', color: '#9A9488' }}>Outstanding payable</div>
              <div style={{ fontSize: 25, fontWeight: 800, letterSpacing: '-.02em', marginTop: 7, color: '#BC4338' }}>{formatMoney(outstandingPayable)}</div>
              <div style={{ fontSize: 12.5, color: '#BC4338', fontWeight: 600, marginTop: 4 }}>awaiting payout</div>
            </div>
          </div>

          {/* LEAVE SUMMARY */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 18 }}>
            <div style={{ background: '#fff', border: '1px solid #ECE7DF', borderRadius: 16, padding: '17px 18px' }}>
              <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: '.04em', textTransform: 'uppercase', color: '#9A9488' }}>Total leaves taken</div>
              <div style={{ fontSize: 25, fontWeight: 800, letterSpacing: '-.02em', marginTop: 7 }}>{leaveSummary.total_leave_days} day{leaveSummary.total_leave_days === 1 ? '' : 's'}</div>
              <div style={{ fontSize: 12.5, color: '#6F6A60', fontWeight: 600, marginTop: 4 }}>approved leave, all time</div>
            </div>
            <div style={{ background: '#fff', border: '1px solid #ECE7DF', borderRadius: 16, padding: '17px 18px' }}>
              <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: '.04em', textTransform: 'uppercase', color: '#9A9488' }}>Leaves this month</div>
              <div style={{ fontSize: 25, fontWeight: 800, letterSpacing: '-.02em', marginTop: 7, color: '#8C5AA6' }}>{leaveSummary.month_leave_days} day{leaveSummary.month_leave_days === 1 ? '' : 's'}</div>
              <div style={{ fontSize: 12.5, color: '#6F6A60', fontWeight: 600, marginTop: 4 }}>current calendar month</div>
            </div>
          </div>

          {/* WORK & PAY CALENDAR */}
          {(attendanceCalendar.assignments.length > 0 || leaveSummary.approved_leaves.length > 0) && (
            <div style={{ marginBottom: 18 }}>
              <StaffCareTimeline
                assignments={attendanceCalendar.assignments}
                attendanceRecords={attendanceCalendar.attendance}
                leaveDays={leaveSummary.approved_leaves}
              />
            </div>
          )}

          {/* TABS */}
          <div style={{ display: 'flex', gap: 7, marginBottom: 16, background: '#EEE9E0', padding: 5, borderRadius: 13, width: 'fit-content', maxWidth: '100%', flexWrap: 'wrap' }}>
            {sectionConfig.map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveSection(tab.id)}
                style={{
                  border: 'none', borderRadius: 9, padding: '9px 15px', fontFamily: 'inherit',
                  fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
                  background: activeSection === tab.id ? '#fff' : 'transparent',
                  color: activeSection === tab.id ? '#2A2722' : '#7A756A',
                  boxShadow: activeSection === tab.id ? '0 1px 3px rgba(40,33,22,.12)' : 'none',
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* TAB PANEL */}
          {activeSection === 'overview'        && renderOverview()}
          {activeSection === 'earnings'        && renderEarnings()}
          {activeSection === 'current-booking' && renderCurrentBooking()}
          {activeSection === 'booking-history' && renderBookingHistory()}
          {activeSection === 'reviews'         && renderReviews()}
          {activeSection === 'payouts'         && renderPayouts()}
          {activeSection === 'deductions'      && renderDeductions()}
          {activeSection === 'bank-accounts'   && renderBankAccounts()}
          {activeSection === 'change-history'  && renderChangeHistory()}

        </div>
      </div>
    </AdminLayout>
  );
};

export default StaffDetailPageV2;
