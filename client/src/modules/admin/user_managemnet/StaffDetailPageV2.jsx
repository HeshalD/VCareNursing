import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import DateInput from '../../../components/common/DateInput';
import PhoneInput from '../../../components/common/PhoneInput';
import {
  AlertCircle,
  ArrowLeft,
  ArrowLeftRight,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Eye,
  FileText,
  Landmark,
  Loader2,
  Pencil,
  Plus,
  Save,
  Send,
  StickyNote,
  Trash2,
  Upload,
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

// Every role an admin can assign to a staff account. Mirrors the validRoles
// list enforced server-side in staffController.updateStaffProfile.
const ROLE_LABELS = {
  NURSE: 'Professional Nurse',
  NURSING_ASSISTANT: 'Nursing Assistant',
  CARETAKER: 'Caretaker',
  PHYSIOTHERAPIST: 'Physiotherapist',
  NANNY: 'Nanny',
  COUNSELLOR: 'Counsellor',
  COORDINATOR: 'Coordinator',
};
const parseRoles = (raw) => {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  return String(raw).replace(/^\{|\}$/g, '').split(',').map((r) => r.trim()).filter(Boolean);
};
const formatRoles = (raw) => {
  const roles = parseRoles(raw);
  return roles.length ? roles.map((r) => ROLE_LABELS[r] || r.replace(/_/g, ' ')).join(', ') : '—';
};

// The exact fields the backend requires before it will clear onboarding_status
// off a bulk-imported PENDING_MIGRATION profile — see the `completeness` CTE
// in staffController.updateStaffProfile. Kept in sync with that check so this
// banner never asks the admin for a field the backend doesn't actually need.
const MIGRATION_REQUIRED_FIELDS = [
  { label: 'Full name', check: (p) => !!p.full_name },
  { label: 'Designation', check: (p) => !!p.designation },
  { label: 'Qualifications', check: (p) => !!p.qualifications },
  { label: 'Home address', check: (p) => !!p.home_address },
  { label: 'Location', check: (p) => !!p.location },
  { label: 'Profile picture', check: (p) => !!p.profile_picture_url },
  { label: 'Gender', check: (p) => !!p.gender },
  { label: 'Date of birth', check: (p) => !!p.date_of_birth },
  { label: 'NIC number', check: (p) => !!p.nic_number },
  { label: 'NIC front photo', check: (p) => !!p.nic_front_url },
  { label: 'NIC back photo', check: (p) => !!p.nic_back_url },
];

const EXPERIENCE_LEVEL_LABELS = {
  BEGINNER: 'Beginner',
  '1_YEAR': '1 Year',
  '2_YEARS': '2 Years',
  '3_YEARS': '3 Years',
  '4_YEARS': '4 Years',
  '5_YEARS': '5 Years',
  MORE_THAN_5_YEARS: 'More than 5 Years',
};

// ── design tokens ─────────────────────────────────────────────────────────────
const STATUS_META = {
  available:           { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  active:              { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  verified:            { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  completed:           { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  assigned:            { bg: 'bg-blue-50',    text: 'text-blue-700',    dot: 'bg-blue-500'    },
  pending:             { bg: 'bg-amber-50',   text: 'text-amber-700',   dot: 'bg-amber-400'   },
  pending_termination: { bg: 'bg-amber-50',   text: 'text-amber-700',   dot: 'bg-amber-400'   },
  under_review:        { bg: 'bg-amber-50',   text: 'text-amber-700',   dot: 'bg-amber-400'   },
  unavailable:         { bg: 'bg-red-50',     text: 'text-red-600',     dot: 'bg-red-500'     },
  inactive:            { bg: 'bg-red-50',     text: 'text-red-600',     dot: 'bg-red-500'     },
  terminated:          { bg: 'bg-red-50',     text: 'text-red-600',     dot: 'bg-red-500'     },
  cancelled:           { bg: 'bg-red-50',     text: 'text-red-600',     dot: 'bg-red-500'     },
  suspended:           { bg: 'bg-red-50',     text: 'text-red-600',     dot: 'bg-red-500'     },
};
const getSM = (v) => STATUS_META[String(v || '').toLowerCase()] || { bg: 'bg-slate-100', text: 'text-slate-500', dot: 'bg-slate-400' };

const inputCls = 'w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 bg-white transition-colors';

// ── atoms ─────────────────────────────────────────────────────────────────────
const Field = ({ label, value, color, mono }) => (
  <div>
    <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-0.5">{label}</div>
    <div
      className={`text-sm font-semibold ${mono ? 'font-mono text-xs' : ''}`}
      style={{ color: color || '#0f172a' }}
    >
      {value ?? '—'}
    </div>
  </div>
);

const Card = ({ children, className = '' }) => (
  <div className={`bg-white border border-slate-200 rounded-lg overflow-hidden ${className}`}>
    {children}
  </div>
);

const CardHead = ({ title, sub, action }) => (
  <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
    <div>
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{title}</p>
      {sub && <p className="text-xs text-slate-400 mt-0.5 normal-case font-normal">{sub}</p>}
    </div>
    {action}
  </div>
);

const CardBody = ({ children, className = '' }) => (
  <div className={`p-5 ${className}`}>{children}</div>
);

const Empty = ({ title, subtitle }) => (
  <div className="border border-dashed border-slate-200 rounded-lg px-6 py-8 text-center">
    <p className="text-sm font-semibold text-slate-600">{title}</p>
    {subtitle && <p className="text-xs text-slate-400 mt-1">{subtitle}</p>}
  </div>
);

const MiniCard = ({ label, value, color, onClick }) => (
  <div
    className={`bg-white border border-slate-200 rounded-lg p-4 ${onClick ? 'cursor-pointer hover:bg-slate-50 transition-colors' : ''}`}
    onClick={onClick}
    title={onClick ? 'Click to see breakdown' : undefined}
  >
    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{label}</p>
    <p className="text-xl font-bold mt-1.5" style={{ color: color || '#0f172a' }}>{value}</p>
    {onClick && <p className="text-xs text-blue-600 font-semibold mt-1">View breakdown →</p>}
  </div>
);

const DocButton = ({ label, url }) => (
  <button
    type="button"
    onClick={() => window.open(url, '_blank')}
    className="flex items-center gap-2 p-3 border border-slate-200 rounded-lg hover:bg-slate-50 hover:border-blue-200 transition-all text-left group w-full"
  >
    <FileText className="w-4 h-4 text-slate-400 group-hover:text-blue-500 flex-shrink-0" />
    <div className="flex-1 min-w-0">
      <p className="text-xs font-semibold text-slate-700 group-hover:text-blue-700">{label}</p>
      <p className="text-xs text-slate-400">Click to view</p>
    </div>
    <Eye className="w-3.5 h-3.5 text-slate-300 group-hover:text-blue-400 flex-shrink-0" />
  </button>
);

const DocStatusBadge = ({ submitted }) => (
  <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${submitted ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
    <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${submitted ? 'bg-emerald-500' : 'bg-amber-400'}`} />
    {submitted ? 'Submitted' : 'Pending'}
  </span>
);

const StatusPill = ({ value }) => {
  const s = getSM(value);
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${s.bg} ${s.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${s.dot}`} />
      {value || '-'}
    </span>
  );
};

const TableHead = ({ cols, children }) => (
  <div
    style={{ display: 'grid', gridTemplateColumns: cols }}
    className="gap-3 pb-2.5 text-xs font-semibold tracking-wide uppercase text-slate-400 border-b border-slate-200"
  >
    {children}
  </div>
);

const TableRow = ({ cols, children }) => (
  <div
    style={{ display: 'grid', gridTemplateColumns: cols }}
    className="gap-3 py-3 border-b border-slate-100 last:border-0 items-center"
  >
    {children}
  </div>
);

// ── admin notes carousel ────────────────────────────────────────────────────
const AdminNotesCarousel = ({ notes, loading, busy, onAdd, onEdit, onDelete }) => {
  const [index, setIndex] = useState(0);
  const [editor, setEditor] = useState({ open: false, mode: 'add', noteId: null, text: '' });
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  const count = notes.length;

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
      setIndex(0);
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

  return (
    <div className="bg-white border border-slate-200 rounded-lg p-4 flex flex-col">
      {/* header */}
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <StickyNote className="w-4 h-4 text-amber-500" />
          <span className="text-sm font-semibold text-slate-900">Admin Notes</span>
          {count > 0 && !editor.open && (
            <span className="text-xs font-medium text-slate-400">{index + 1} / {count}</span>
          )}
        </div>
        {!editor.open && (
          <button
            type="button"
            onClick={openAdd}
            disabled={busy}
            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50"
          >
            <Plus className="w-3 h-3" /> Add
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
            className={`${inputCls} resize-y min-h-[92px]`}
          />
          <div className="flex justify-end gap-2 mt-2.5">
            <button
              type="button"
              onClick={closeEditor}
              disabled={busy}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50"
            >
              <X className="w-3 h-3" /> Cancel
            </button>
            <button
              type="button"
              onClick={saveEditor}
              disabled={busy || !editor.text.trim()}
              className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-500 transition-colors disabled:opacity-50"
            >
              {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
              {editor.mode === 'add' ? 'Add note' : 'Save'}
            </button>
          </div>
        </div>
      ) : loading ? (
        <div className="flex items-center justify-center min-h-[96px] text-slate-400">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      ) : count === 0 ? (
        <div className="border border-dashed border-slate-200 rounded-lg px-4 py-6 text-center">
          <p className="text-sm font-semibold text-slate-500">No admin notes yet</p>
          <p className="text-xs text-slate-400 mt-1">Add an internal note to keep track of this staff member.</p>
        </div>
      ) : (
        <div className="flex items-stretch gap-2.5">
          <button
            type="button"
            onClick={() => go(-1)}
            disabled={index === 0}
            className="inline-flex items-center justify-center w-8 h-8 flex-shrink-0 rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 transition-colors disabled:opacity-30 disabled:cursor-default self-center"
            title="Previous"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <div className="flex-1 overflow-hidden min-w-0">
            <div
              className="flex transition-transform duration-300"
              style={{ transform: `translateX(-${index * 100}%)` }}
            >
              {notes.map((n) => (
                <div key={n.note_id} className="min-w-full box-border px-0.5">
                  <div className="bg-amber-50 border border-amber-100 rounded-lg p-3.5 min-h-[96px] flex flex-col">
                    <p className="text-sm leading-relaxed text-slate-800 whitespace-pre-wrap break-words flex-1">{n.note}</p>
                    <div className="flex items-center justify-between gap-2 mt-3 pt-2.5 border-t border-amber-100">
                      <span className="text-xs text-slate-400">
                        {n.author_name ? `${n.author_name} · ` : ''}{fmt(n.created_at)}
                        {n.updated_at && n.updated_at !== n.created_at ? ' (edited)' : ''}
                      </span>
                      {confirmDeleteId === n.note_id ? (
                        <span className="inline-flex items-center gap-1.5">
                          <span className="text-xs font-semibold text-red-600">Delete?</span>
                          <button
                            type="button"
                            onClick={() => { onDelete(n.note_id); setConfirmDeleteId(null); }}
                            disabled={busy}
                            className="px-2 py-0.5 text-xs font-bold bg-red-600 text-white rounded disabled:opacity-50"
                          >Yes</button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(null)}
                            disabled={busy}
                            className="px-2 py-0.5 text-xs font-semibold border border-slate-200 bg-white rounded disabled:opacity-50"
                          >No</button>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => openEdit(n)}
                            disabled={busy}
                            title="Edit"
                            className="inline-flex items-center justify-center w-6 h-6 rounded border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 transition-colors disabled:opacity-50"
                          >
                            <Pencil className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(n.note_id)}
                            disabled={busy}
                            title="Delete"
                            className="inline-flex items-center justify-center w-6 h-6 rounded border border-red-100 bg-white text-red-500 hover:bg-red-50 transition-colors disabled:opacity-50"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={() => go(1)}
            disabled={index >= count - 1}
            className="inline-flex items-center justify-center w-8 h-8 flex-shrink-0 rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 transition-colors disabled:opacity-30 disabled:cursor-default self-center"
            title="Next"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
};

// ── edit drawer atoms ──────────────────────────────────────────────────────────
// Hoisted to module scope (not defined inside StaffDetailPageV2) so they keep a
// stable component identity across renders — defining a component inline in a
// parent's render body recreates its type every render, which makes React
// unmount/remount it (and its <input>) on every keystroke, dropping focus after
// a single character.
const EditSectionHeader = ({ title, sub }) => (
  <div className="px-6 pt-5 pb-2.5 border-b border-slate-100">
    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{title}</p>
    {sub && <p className="text-xs text-slate-400 mt-0.5 normal-case font-normal">{sub}</p>}
  </div>
);

const EditField = ({ label, required, children }) => (
  <div>
    <label className="block text-xs font-medium text-slate-600 mb-1">
      {label}{required && <span className="text-red-500 ml-0.5">*</span>}
    </label>
    {children}
  </div>
);

const EditFileField = ({ label, selectedFile, currentUrl, onChange, accept = 'image/*,.pdf' }) => (
  <div>
    <label className="block text-xs font-medium text-slate-600 mb-1">{label}</label>
    <div className="flex items-center gap-2">
      <label className="flex-1 flex items-center gap-2 rounded-xl border border-dashed border-slate-300 px-3 py-2.5 text-xs text-slate-500 cursor-pointer hover:border-blue-400 hover:bg-blue-50/40 transition-colors">
        <Upload className="w-3.5 h-3.5 flex-shrink-0 text-slate-400" />
        <span className="truncate">
          {selectedFile ? selectedFile.name : currentUrl ? 'Replace file...' : 'Upload file...'}
        </span>
        <input
          type="file"
          accept={accept}
          className="hidden"
          onChange={(e) => onChange(e.target.files?.[0] || null)}
        />
      </label>
      {currentUrl && (
        <button
          type="button"
          onClick={() => window.open(currentUrl, '_blank')}
          title="View current file"
          className="inline-flex items-center justify-center w-9 h-9 flex-shrink-0 rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors"
        >
          <Eye className="w-4 h-4" />
        </button>
      )}
    </div>
  </div>
);

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
  const [futureBookings, setFutureBookings] = useState([]);
  const [cancellingAssignmentId, setCancellingAssignmentId] = useState(null);
  const [cancelError, setCancelError] = useState('');
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
  const [editModal, setEditModal] = useState({ isOpen: false, saving: false, error: '', form: {} });
  const [sendingAgreement, setSendingAgreement] = useState(false);
  const [sendingDocRequest, setSendingDocRequest] = useState(false);
  const [sendActionError, setSendActionError] = useState('');
  const [sendActionSuccess, setSendActionSuccess] = useState('');
  const [sectionErrors, setSectionErrors] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeSection, setActiveSection] = useState('overview');
  const [refreshing, setRefreshing] = useState(false);
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [availabilityUpdating, setAvailabilityUpdating] = useState(false);
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
  const [attendanceCalendar, setAttendanceCalendar] = useState({ assignments: [], attendance: [], reschedules: [], pendingResumptions: [] });
  const [leaveSummary, setLeaveSummary] = useState({ total_leave_days: 0, month_leave_days: 0, approved_leaves: [] });
  const [adminNotes, setAdminNotes] = useState([]);
  const [adminNotesLoading, setAdminNotesLoading] = useState(true);
  const [adminNotesBusy, setAdminNotesBusy] = useState(false);
  const [linkedClientProfileId, setLinkedClientProfileId] = useState(null);
  const [recruitersList, setRecruitersList] = useState([]);
  const [staffRecruiter, setStaffRecruiter] = useState(null); // { current, origin, history }
  const [switchRecruiterId, setSwitchRecruiterId] = useState('');
  const [recruiterActionLoading, setRecruiterActionLoading] = useState(false);
  const [recruiterError, setRecruiterError] = useState('');

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
  const isPendingMigration = String(profile.onboarding_status || '').toUpperCase() === 'PENDING_MIGRATION';
  const missingMigrationFields = isPendingMigration
    ? MIGRATION_REQUIRED_FIELDS.filter(f => !f.check(profile)).map(f => f.label)
    : [];

  const sectionConfig = useMemo(() => ([
    { id: 'overview',        label: 'Overview' },
    { id: 'earnings',        label: 'Earnings' },
    { id: 'current-booking', label: 'Current Booking' },
    { id: 'future-bookings', label: 'Future Bookings' },
    { id: 'booking-history', label: 'Booking History' },
    { id: 'reviews',         label: 'Reviews' },
    { id: 'payouts',         label: 'Payouts' },
    { id: 'deductions',      label: 'Deductions' },
    { id: 'bank-accounts',   label: 'Bank Accounts' },
    { id: 'documents',       label: 'Documents' },
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
      runAdminRequest(() => apiClient.getStaffFutureBookings(staffProfileId)),
      runAdminRequest(() => apiClient.getStaffPayoutsSummary(staffProfileId)),
      runAdminRequest(() => apiClient.getStaffPayouts(staffProfileId, { page: 1, limit: 20 })),
      runAdminRequest(() => apiClient.getStaffBankAccounts(staffProfileId)),
      runAdminRequest(() => apiClient.getBankAccounts()),
      runAdminRequest(() => apiClient.getAllChangeRequests({ staff_profile_id: staffProfileId })),
      runAdminRequest(() => apiClient.getStaffDeductions(staffProfileId, { page: 1, limit: 50 })),
      runAdminRequest(() => apiClient.getStaffAttendanceCalendar(staffProfileId)),
      runAdminRequest(() => apiClient.getStaffAdminNotes(staffProfileId)),
      runAdminRequest(() => apiClient.getStaffLeaveSummary(staffProfileId)),
      runAdminRequest(() => apiClient.getRecruiters()),
      runAdminRequest(() => apiClient.getStaffRecruiter(staffProfileId)),
    ]);

    const nextErrors = {};
    const [
      detailRes, earningsRes, earningsTxRes, currentBookingRes, historyRes,
      futureBookingsRes, payoutsSummaryRes, payoutsRes, bankAccountsRes, companyBankAccountsRes,
      changeRequestsRes, deductionsRes, attendanceCalendarRes, adminNotesRes,
      leaveSummaryRes, recruitersRes, staffRecruiterRes,
    ] = results;

    if (detailRes.status === 'fulfilled') {
      const detailData = detailRes.value?.data || null;
      setDetail(detailData);

      // This staff member may also hold a client account (e.g. they registered
      // as a client too) — check so we can offer a view switch.
      if (detailData?.profile?.user_id) {
        try {
          const clientRes = await runAdminRequest(() => apiClient.getClientProfileByUserId(detailData.profile.user_id));
          setLinkedClientProfileId(clientRes?.data?.client_profile_id || null);
        } catch {
          setLinkedClientProfileId(null);
        }
      }
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

    if (futureBookingsRes.status === 'fulfilled') setFutureBookings(safeArray(futureBookingsRes.value?.data));
    else nextErrors.futureBookings = futureBookingsRes.reason?.message;

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
      setAttendanceCalendar({
        assignments: safeArray(cal.assignments),
        attendance: safeArray(cal.attendance),
        reschedules: safeArray(cal.reschedules),
        pendingResumptions: safeArray(cal.pending_resumptions),
      });
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

    if (recruitersRes.status === 'fulfilled') setRecruitersList(safeArray(recruitersRes.value?.data));
    if (staffRecruiterRes.status === 'fulfilled') setStaffRecruiter(staffRecruiterRes.value?.data || null);

    setSectionErrors(nextErrors);
    setLoading(false);
  };

  useEffect(() => { loadPage(); }, [adminToken, staffProfileId]);

  const reloadStaffRecruiter = async () => {
    try {
      const res = await runAdminRequest(() => apiClient.getStaffRecruiter(staffProfileId));
      setStaffRecruiter(res?.data || null);
    } catch {
      // non-fatal — leave the previous value in place
    }
  };

  const handleRecruiterAction = async () => {
    if (!switchRecruiterId) return;
    setRecruiterActionLoading(true);
    setRecruiterError('');
    try {
      if (staffRecruiter?.current) {
        await runAdminRequest(() => apiClient.switchStaffRecruiter(staffProfileId, switchRecruiterId));
      } else {
        await runAdminRequest(() => apiClient.creditStaffRecruiter(staffProfileId, switchRecruiterId));
      }
      setSwitchRecruiterId('');
      await reloadStaffRecruiter();
    } catch (err) {
      setRecruiterError(err.message || 'Failed to update recruiter.');
    } finally {
      setRecruiterActionLoading(false);
    }
  };

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

  // Manual override for staff stuck UNAVAILABLE (e.g. after a legacy import or a
  // booking that ended without the normal cron/assignment flow flipping them back).
  // Deliberately scoped to UNAVAILABLE → AVAILABLE only — flipping an ASSIGNED
  // staff member to AVAILABLE here would desync them from their active booking.
  const handleMarkAvailable = async () => {
    try {
      setAvailabilityUpdating(true);
      await runAdminRequest(() => apiClient.updateStaffStatus(staffProfileId, 'AVAILABLE'));
      await loadPage();
    } catch (e) {
      setError(e?.message || 'Failed to update staff availability');
    } finally {
      setAvailabilityUpdating(false);
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

  const openEditProfileModal = () => setEditModal({
    isOpen: true, saving: false, error: '',
    form: {
      staff_code: profile.staff_code || '',
      full_name: profile.full_name || '',
      email: profile.email || '',
      mobile_number: profile.mobile_number || '',
      designation: profile.designation || '',
      qualifications: profile.qualifications || '',
      experience_level: profile.experience_level || '',
      nic_number: profile.nic_number || '',
      location: profile.location || '',
      home_address: profile.home_address || '',
      gender: (profile.gender || '').toUpperCase(),
      date_of_birth: profile.date_of_birth ? String(profile.date_of_birth).slice(0, 10) : '',
      willing_to_live_in: profile.willing_to_live_in ? 'true' : 'false',
      roles: parseRoles(profile.role),
    },
    files: {
      profile_picture: null,
      nic_front: null,
      nic_back: null,
      grama_niladhari: null,
      police_report: null,
      documents: [],
    },
    removeDocumentUrls: [],
  });

  const editSetFile = (key, file) => setEditModal(p => ({ ...p, files: { ...p.files, [key]: file } }));
  const editToggleRemoveDoc = (url) => setEditModal(p => ({
    ...p,
    removeDocumentUrls: p.removeDocumentUrls.includes(url)
      ? p.removeDocumentUrls.filter(u => u !== url)
      : [...p.removeDocumentUrls, url],
  }));

  const handleEditProfileSave = async () => {
    const { form, files, removeDocumentUrls } = editModal;
    if (!form.full_name.trim() || !form.staff_code.trim()) {
      setEditModal(p => ({ ...p, error: 'Staff code and full name are required.' }));
      return;
    }
    if (!form.roles || form.roles.length === 0) {
      setEditModal(p => ({ ...p, error: 'Select at least one role.' }));
      return;
    }
    setEditModal(p => ({ ...p, saving: true, error: '' }));
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([key, value]) => {
        if (key === 'roles') return; // sent separately as JSON below
        // Skip blanks so the backend keeps the existing value instead of wiping it
        if (String(value).trim() !== '') fd.append(key, String(value).trim());
      });
      fd.append('roles', JSON.stringify(form.roles));
      if (files.profile_picture) fd.append('profile_picture', files.profile_picture);
      if (files.nic_front) fd.append('nic_front', files.nic_front);
      if (files.nic_back) fd.append('nic_back', files.nic_back);
      if (files.grama_niladhari) fd.append('grama_niladhari', files.grama_niladhari);
      if (files.police_report) fd.append('police_report', files.police_report);
      files.documents.forEach((file) => fd.append('documents', file));
      if (removeDocumentUrls.length > 0) fd.append('remove_document_urls', JSON.stringify(removeDocumentUrls));

      await runAdminRequest(() => apiClient.updateStaffProfile(staffProfileId, fd));
      setEditModal(p => ({ ...p, isOpen: false }));
      await loadPage();
    } catch (err) {
      setEditModal(p => ({ ...p, saving: false, error: err?.message || 'Failed to update staff profile.' }));
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

  const handleSendAgreement = async () => {
    setSendingAgreement(true);
    setSendActionError('');
    setSendActionSuccess('');
    try {
      await runAdminRequest(() => apiClient.sendStaffAgreement(staffProfileId));
      setSendActionSuccess('Contract sent successfully.');
      await loadPage();
    } catch (err) {
      setSendActionError(err?.message || 'Failed to send the contract via WhatsApp.');
    } finally {
      setSendingAgreement(false);
    }
  };

  const handleSendDocRequest = async () => {
    setSendingDocRequest(true);
    setSendActionError('');
    setSendActionSuccess('');
    try {
      await runAdminRequest(() => apiClient.sendStaffDocumentRequest(staffProfileId));
      setSendActionSuccess('Compliance document request sent successfully.');
      await loadPage();
    } catch (err) {
      setSendActionError(err?.message || 'Failed to send the document request via WhatsApp.');
    } finally {
      setSendingDocRequest(false);
    }
  };

  // ── change history helpers ────────────────────────────────────────────────
  const requestTypeMeta = (type) => {
    const map = {
      PROFILE_UPDATE:      { cls: 'bg-blue-50 text-blue-700',    label: 'Profile Update' },
      BANK_ACCOUNT_ADD:    { cls: 'bg-emerald-50 text-emerald-700', label: 'Bank Add' },
      BANK_ACCOUNT_EDIT:   { cls: 'bg-amber-50 text-amber-700',  label: 'Bank Edit' },
      BANK_ACCOUNT_REMOVE: { cls: 'bg-red-50 text-red-700',      label: 'Bank Remove' },
    };
    return map[type] || { cls: 'bg-slate-100 text-slate-600', label: type };
  };

  const auditActionMeta = (action) => {
    const map = {
      SUBMITTED: { dot: 'bg-slate-400',    cls: 'bg-slate-100 text-slate-600' },
      CLAIMED:   { dot: 'bg-blue-500',     cls: 'bg-blue-50 text-blue-700' },
      APPROVED:  { dot: 'bg-emerald-500',  cls: 'bg-emerald-50 text-emerald-700' },
      REJECTED:  { dot: 'bg-red-500',      cls: 'bg-red-50 text-red-700' },
    };
    return map[action] || { dot: 'bg-slate-400', cls: 'bg-slate-100 text-slate-600' };
  };

  const renderChangeDiff = (requestType, requestedChanges) => {
    if (!requestedChanges) return <p className="text-sm text-slate-400 m-0">No change data available.</p>;
    if (requestType === 'PROFILE_UPDATE' || requestType === 'BANK_ACCOUNT_EDIT') {
      return (
        <div className="flex flex-col gap-2">
          {Object.entries(requestedChanges).map(([field, change]) => (
            <div key={field} className="flex flex-wrap items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 text-sm">
              <span className="min-w-[140px] font-semibold text-slate-700 capitalize">{field.replace(/_/g, ' ')}</span>
              <span className="text-red-500 line-through">{String(change?.old_value ?? '—')}</span>
              <span className="text-slate-400">→</span>
              <span className="font-semibold text-emerald-700">{String(change?.new_value ?? '—')}</span>
            </div>
          ))}
        </div>
      );
    }
    if (requestType === 'BANK_ACCOUNT_ADD') {
      return (
        <div className="flex flex-col gap-2">
          {Object.entries(requestedChanges).map(([field, value]) => (
            <div key={field} className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 text-sm">
              <span className="min-w-[140px] font-semibold text-slate-700 capitalize">{field.replace(/_/g, ' ')}</span>
              <span className="font-semibold text-emerald-700">{String(value ?? '—')}</span>
            </div>
          ))}
        </div>
      );
    }
    if (requestType === 'BANK_ACCOUNT_REMOVE') {
      return (
        <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2.5 text-sm text-red-700">
          Remove bank account ID: <span className="font-mono font-semibold">{requestedChanges.staff_bank_account_id}</span>
        </div>
      );
    }
    return <pre className="overflow-x-auto bg-slate-50 rounded-lg p-3 text-xs">{JSON.stringify(requestedChanges, null, 2)}</pre>;
  };

  // ── tab panels ────────────────────────────────────────────────────────────
  const renderOverview = () => (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        <Card>
          <CardHead
            title="Staff information"
            action={
              <button
                type="button"
                onClick={openEditProfileModal}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors"
              >
                <Pencil className="w-3 h-3" /> Edit
              </button>
            }
          />
          <CardBody>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Staff code" value={profile.staff_code} mono />
              <Field label="NIC number" value={profile.nic_number} mono />
              <Field label="Full name" value={profile.full_name} />
              <Field label="Designation" value={profile.designation} />
              <Field label="Roles" value={formatRoles(profile.role)} />
              <Field label="Email" value={profile.email} />
              <Field label="Phone" value={profile.mobile_number} />
              <Field label="Location" value={profile.location || profile.home_address} />
              <Field
                label="Verification"
                value={profile.verification_status}
                color={String(profile.verification_status || '').toLowerCase() === 'verified' ? '#059669' : undefined}
              />
              <Field label="Willing to live in" value={profile.willing_to_live_in ? 'Yes' : 'No'} />
              <Field label="Experience" value={EXPERIENCE_LEVEL_LABELS[profile.experience_level] || '-'} />
              <Field label="Qualifications" value={profile.qualifications} />
              <Field label="Member since" value={formatDate(profile.created_at)} />
              <Field label="Average rating" value={averageRating ? `${averageRating.toFixed(1)} / 5` : '-'} />
              <Field label="Total reviews" value={totalReviews || '-'} />
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHead title="Account control" sub="Deactivate or reactivate this staff account." />
          <CardBody>
            <div className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border mb-4 ${isActive ? 'bg-emerald-50 border-emerald-100' : 'bg-red-50 border-red-100'}`}>
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${isActive ? 'bg-emerald-500' : 'bg-red-500'}`} />
              <div>
                <div className="text-sm font-semibold text-slate-900">{isActive ? 'Account enabled' : 'Account disabled'}</div>
                <div className="text-xs text-slate-500 mt-0.5">
                  {isActive ? 'This staff member can sign in and accept bookings.' : 'This staff member cannot sign in.'}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={handleToggleAccount}
              disabled={statusUpdating}
              className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-lg border text-sm font-semibold transition-colors disabled:opacity-60 ${isActive ? 'border-red-200 text-red-600 hover:bg-red-50' : 'border-emerald-200 text-emerald-700 hover:bg-emerald-50'}`}
            >
              {statusUpdating && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {isActive ? 'Deactivate account' : 'Reactivate account'}
            </button>

            <div className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border mt-3 ${activeStatus === 'unavailable' ? 'bg-slate-50 border-slate-200' : 'bg-emerald-50 border-emerald-100'}`}>
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${getSM(profile.current_status).dot}`} />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-slate-900">Availability: {profile.current_status || 'Unknown'}</div>
                <div className="text-xs text-slate-500 mt-0.5">
                  {activeStatus === 'unavailable'
                    ? "Won't be offered new bookings until marked available."
                    : 'Normally controlled automatically by booking assignments.'}
                </div>
              </div>
              {activeStatus === 'unavailable' && (
                <button
                  type="button"
                  onClick={handleMarkAvailable}
                  disabled={availabilityUpdating}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border border-emerald-200 text-emerald-700 rounded-lg hover:bg-emerald-50 transition-colors disabled:opacity-60 flex-shrink-0"
                >
                  {availabilityUpdating && <Loader2 className="w-3 h-3 animate-spin" />}
                  Mark Available
                </button>
              )}
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHead title="Recruiter" sub="Who brought this hire in — credited once, reassignable anytime." />
          <CardBody>
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wider text-slate-400 mb-1">Current recruiter</p>
              <p className="text-sm font-medium text-slate-700">
                {staffRecruiter?.current?.recruiter_name || 'Unassigned'}
              </p>
            </div>
            {recruitersList.length > 0 && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <select
                  value={switchRecruiterId}
                  onChange={(e) => setSwitchRecruiterId(e.target.value)}
                  className="px-2.5 py-1.5 text-xs border border-slate-200 rounded-md outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 bg-white"
                >
                  <option value="">
                    {staffRecruiter?.current ? '— Reassign to —' : '— Credit a recruiter —'}
                  </option>
                  {recruitersList
                    .filter((r) => r.id !== staffRecruiter?.current?.recruiter_id)
                    .map((r) => (
                      <option key={r.id} value={r.id}>{r.full_name}</option>
                    ))}
                </select>
                <button
                  type="button"
                  onClick={handleRecruiterAction}
                  disabled={!switchRecruiterId || recruiterActionLoading}
                  className="inline-flex items-center gap-1.5 rounded border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                >
                  {recruiterActionLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                  {staffRecruiter?.current ? 'Reassign' : 'Credit'}
                </button>
              </div>
            )}
            {recruiterError && <p className="mt-2 text-xs text-red-600">{recruiterError}</p>}
          </CardBody>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        <Card>
          <CardHead title="Current assignment" />
          <CardBody>
            {currentAssignment ? (
              <>
                <div className="flex items-center gap-3 mb-4">
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-500 flex-shrink-0" />
                  <div>
                    <div className="text-sm font-semibold text-slate-900">{currentAssignment.patient_name || 'Patient'}</div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      {currentAssignment.service_type || '-'} · since {formatDate(currentAssignment.service_start_date || currentAssignment.start_date)}
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label="Booking code" value={currentAssignment.booking_id} mono />
                  <Field label="Client" value={currentAssignment.client_name} />
                  <Field label="Daily rate" value={formatMoney(currentAssignment.daily_rate || currentAssignment.booking_daily_rate)} />
                  <Field label="Status" value={currentAssignment.status} />
                </div>
              </>
            ) : (
              <Empty title="No active booking" subtitle="This staff member is not currently assigned to a booking." />
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHead title="Recent activity" />
          <CardBody>
            <div className="flex flex-col gap-2.5">
              {safeArray(overviewBookingHistory).slice(0, 3).length === 0 ? (
                <Empty title="No recent bookings" />
              ) : safeArray(overviewBookingHistory).slice(0, 3).map((row, i) => (
                <div key={row.assignment_id || i} className="flex items-center justify-between gap-3 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5">
                  <div className="flex items-center gap-2.5">
                    <span className="w-2 h-2 rounded-full bg-slate-400 flex-shrink-0" />
                    <div>
                      <div className="text-sm font-semibold text-slate-900">{row.client_name || 'Client'}</div>
                      <div className="text-xs text-slate-400">{row.patient_name || '-'} · {row.status || '-'}</div>
                    </div>
                  </div>
                  <span className="text-sm font-bold text-slate-700">{formatMoney(row.amount_allocated || row.daily_rate)}</span>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  );

  const renderEarnings = () => (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MiniCard label="Current earnings" value={formatMoney(currentEarnings)} color="#059669" onClick={() => navigate(`/admin/staff/${staffProfileId}/current-earnings`)} />
        <MiniCard label="Total earned" value={formatMoney(totalEarned)} onClick={() => navigate(`/admin/staff/${staffProfileId}/total-earnings`)} />
        <MiniCard label="Paid out" value={formatMoney(totalPaidOut)} />
        <MiniCard label="Outstanding" value={formatMoney(outstandingPayable)} color="#dc2626" />
      </div>

      <Card>
        <CardHead title="Earnings transactions" />
        <CardBody className="p-0">
          {sectionErrors.earningsTransactions ? (
            <div className="p-5"><Empty title="Failed to load earnings transactions" subtitle={sectionErrors.earningsTransactions} /></div>
          ) : safeArray(earningsTransactions).length === 0 ? (
            <div className="p-5"><Empty title="No earnings transactions" subtitle="Salary accrual and payout rows will appear here." /></div>
          ) : (
            <div className="px-5 pb-5 pt-4">
              <TableHead cols="1fr 1fr 1.1fr 0.9fr 1fr 0.9fr">
                <span>Transaction</span><span>Date</span><span>Category</span><span>Type</span><span>Reference</span>
                <span className="text-right">Amount</span>
              </TableHead>
              {earningsTransactions.map((tx, i) => {
                const isDebit = tx.transaction_type === 'DEBIT';
                return (
                  <TableRow key={tx.transaction_id || i} cols="1fr 1fr 1.1fr 0.9fr 1fr 0.9fr">
                    <div className="font-mono text-xs text-slate-500">{tx.transaction_id || '-'}</div>
                    <div className="text-xs text-slate-500">{formatDateTime(tx.created_at)}</div>
                    <div><span className="inline-block text-xs font-semibold text-slate-600 bg-slate-100 rounded px-2 py-0.5">{tx.category || '-'}</span></div>
                    <div><span className={`inline-block text-xs font-semibold rounded px-2 py-0.5 ${isDebit ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-700'}`}>{tx.transaction_type || '-'}</span></div>
                    <div className="font-mono text-xs text-slate-500">{tx.reference_number || tx.payment_method || '-'}</div>
                    <div className={`text-right text-sm font-bold ${isDebit ? 'text-red-600' : 'text-emerald-600'}`}>{formatMoney(tx.amount)}</div>
                  </TableRow>
                );
              })}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );

  const renderCurrentBooking = () => (
    <div className="flex flex-col gap-4">
      {currentAssignment && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <MiniCard label="Assignment status" value={currentAssignment.status || '-'} />
          <MiniCard label="Service type" value={currentAssignment.service_type || '-'} />
          <MiniCard label="Client" value={currentAssignment.client_name || '-'} />
          <MiniCard label="Start date" value={formatDate(currentAssignment.service_start_date || currentAssignment.start_date)} />
        </div>
      )}
      <Card>
        <CardHead title="Current assignment" sub="Live booking assignment loaded from the current-booking route" />
        <CardBody>
          {sectionErrors.currentBooking ? (
            <Empty title="Failed to load current booking" subtitle={sectionErrors.currentBooking} />
          ) : currentAssignment ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <Field label="Assignment ID" value={currentAssignment.assignment_id} mono />
              <Field label="Booking ID" value={currentAssignment.booking_id} mono />
              <Field label="Client name" value={currentAssignment.client_name} />
              <Field label="Patient name" value={currentAssignment.patient_name} />
              <Field label="Service start" value={formatDate(currentAssignment.service_start_date || currentAssignment.start_date)} />
              <Field
                label="Service end"
                value={
                  currentAssignment.service_end_date
                    ? formatDate(currentAssignment.service_end_date)
                    : currentAssignment.pending_end_date
                    ? `${formatDate(currentAssignment.pending_end_date)} (scheduled)`
                    : undefined
                }
                color={!currentAssignment.service_end_date && currentAssignment.pending_end_date ? '#b45309' : undefined}
              />
              <Field label="Daily rate" value={formatMoney(currentAssignment.daily_rate || currentAssignment.booking_daily_rate)} />
              <Field label="Assigned on" value={formatDateTime(currentAssignment.assigned_on)} />
            </div>
          ) : (
            <Empty title="No active booking" subtitle="This staff member is not currently assigned to a booking." />
          )}
          {currentAssignment?.pending_end_date && !currentAssignment.service_end_date && (
            <p className="mt-3 text-xs text-amber-600">
              A {(currentAssignment.pending_end_action_type || 'COMPLETION').toLowerCase()} is scheduled for{' '}
              {formatDate(currentAssignment.pending_end_date)}. This staff member stays assigned and billed
              through that date, then becomes available again from the next day.
            </p>
          )}
        </CardBody>
      </Card>
    </div>
  );

  const handleCancelFutureBooking = async (assignmentId, actionId) => {
    if (!actionId) {
      setCancelError('This assignment has no cancellable scheduled action (it may already be starting today).');
      return;
    }
    if (!window.confirm('Cancel this future assignment? The shift/slot will become available again.')) return;

    setCancellingAssignmentId(assignmentId);
    setCancelError('');
    try {
      await runAdminRequest(() => apiClient.cancelScheduledAction(actionId));
      setFutureBookings((prev) => prev.filter((row) => row.assignment_id !== assignmentId));
      // Keep the care timeline in sync immediately — mark the assignment CANCELLED
      // (StaffCareTimeline already skips CANCELLED rows) rather than waiting on a reload.
      setAttendanceCalendar((prev) => ({
        ...prev,
        assignments: prev.assignments.map((a) =>
          a.assignment_id === assignmentId ? { ...a, assignment_status: 'CANCELLED' } : a
        ),
      }));
    } catch (err) {
      setCancelError(err?.message || 'Failed to cancel future assignment');
    } finally {
      setCancellingAssignmentId(null);
    }
  };

  const renderFutureBookings = () => (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MiniCard label="Scheduled assignments" value={futureBookings.length} />
        <MiniCard label="Earliest start" value={futureBookings.length ? formatDate(futureBookings[0].service_start_date) : '—'} />
      </div>

      {cancelError && (
        <div className="border border-red-200 bg-red-50 text-red-700 rounded-lg px-4 py-3 text-sm">
          {cancelError}
        </div>
      )}

      <Card>
        <CardHead title="Future bookings" sub="Assignments scheduled to start on a future date — not yet active" />
        <CardBody className="p-0">
          {sectionErrors.futureBookings ? (
            <div className="p-5"><Empty title="Failed to load future bookings" subtitle={sectionErrors.futureBookings} /></div>
          ) : futureBookings.length === 0 ? (
            <div className="p-5"><Empty title="No future bookings" subtitle="This staff member has no scheduled future assignments." /></div>
          ) : (
            <div className="px-5 pb-5 pt-4">
              <TableHead cols="1fr 1.2fr 1.2fr 1fr 1fr 0.8fr 0.8fr">
                <span>Booking</span><span>Client</span><span>Care profile</span><span>Shift</span>
                <span>Start date</span><span className="text-right">Daily rate</span><span className="text-right">Action</span>
              </TableHead>
              {futureBookings.map((row, i) => (
                <TableRow key={row.assignment_id || i} cols="1fr 1.2fr 1.2fr 1fr 1fr 0.8fr 0.8fr">
                  <div className="font-mono text-xs text-slate-500">{row.booking_id || row.assignment_id || '-'}</div>
                  <div className="text-sm font-semibold text-slate-900">{row.client_name || '-'}</div>
                  <div className="text-sm text-slate-600">{row.patient_name || '-'}</div>
                  <div className="text-xs text-slate-500">
                    {row.shift_label || (row.shift_number ? `Shift ${row.shift_number}` : '-')}
                    {row.shift_start_time && <span className="ml-1 text-slate-400">({row.shift_start_time})</span>}
                  </div>
                  <div className="text-xs text-slate-500">{formatDate(row.service_start_date)}</div>
                  <div className="text-right text-sm font-semibold text-slate-900">{formatMoney(row.daily_rate)}</div>
                  <div className="text-right">
                    <button
                      type="button"
                      onClick={() => handleCancelFutureBooking(row.assignment_id, row.action_id)}
                      disabled={cancellingAssignmentId === row.assignment_id}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-red-50 hover:border-red-200 hover:text-red-600 transition-colors disabled:opacity-50"
                    >
                      {cancellingAssignmentId === row.assignment_id
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        : <Trash2 className="w-3.5 h-3.5" />}
                      Cancel
                    </button>
                  </div>
                </TableRow>
              ))}
            </div>
          )}
        </CardBody>
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
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <MiniCard label="Total bookings" value={rows.length} />
          <MiniCard label="Days worked" value={totalDays} />
          <MiniCard label="Active booking" value={currentAssignment?.client_name || '—'} color="#1d4ed8" />
          <MiniCard label="Avg per booking" value={rows.length ? formatMoney(avgSalary) : '—'} />
        </div>
        <Card>
          <CardHead title="Booking history" />
          <CardBody className="p-0">
            {sectionErrors.bookingHistory ? (
              <div className="p-5"><Empty title="Failed to load booking history" subtitle={sectionErrors.bookingHistory} /></div>
            ) : rows.length === 0 ? (
              <div className="p-5"><Empty title="No booking history" subtitle="Previous booking assignments will appear here." /></div>
            ) : (
              <div className="px-5 pb-5 pt-4">
                <TableHead cols="1fr 1.2fr 1.2fr 0.9fr 1fr 0.8fr 1fr">
                  <span>Booking</span><span>Client</span><span>Care profile</span><span>Status</span>
                  <span>Dates</span><span className="text-right">Days</span><span className="text-right">Salary</span>
                </TableHead>
                {rows.map((row, i) => {
                  const start = row.service_start_date ? new Date(row.service_start_date) : null;
                  const end = row.service_end_date ? new Date(row.service_end_date) : new Date();
                  const days = start ? Math.max(1, Math.ceil((end - start) / 86400000)) : null;
                  return (
                    <TableRow key={row.assignment_id || i} cols="1fr 1.2fr 1.2fr 0.9fr 1fr 0.8fr 1fr">
                      <div className="font-mono text-xs text-slate-500">{row.booking_id || row.assignment_id || '-'}</div>
                      <div className="text-sm font-semibold text-slate-900">{row.client_name || '-'}</div>
                      <div className="text-sm text-slate-600">{row.patient_name || '-'}</div>
                      <div><StatusPill value={row.status} /></div>
                      <div className="text-xs text-slate-500">{start ? formatDate(row.service_start_date) : '-'}</div>
                      <div className="text-right text-sm text-slate-600">{days ? `${days}d` : '-'}</div>
                      <div className="text-right text-sm font-bold text-emerald-600">{formatMoney(row.total_salary_paid || row.total_salary)}</div>
                    </TableRow>
                  );
                })}
              </div>
            )}
          </CardBody>
        </Card>
      </div>
    );
  };

  const renderReviews = () => {
    const distribution = safeArray(overviewReviews.distribution);
    const recentReviews = safeArray(overviewReviews.recent);
    const fiveStarCount = distribution.find(d => d.rating === 5)?.count || 0;

    return (
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          <MiniCard label="Average rating" value={averageRating ? `${averageRating.toFixed(1)} ★` : '-'} color="#b45309" />
          <MiniCard label="Total reviews" value={totalReviews || 0} />
          <MiniCard label="5-star reviews" value={fiveStarCount} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
          <Card>
            <CardHead title="Rating distribution" />
            <CardBody>
              {distribution.length === 0 ? (
                <Empty title="No ratings yet" />
              ) : (
                <div className="flex flex-col gap-3">
                  {distribution.map(item => (
                    <div key={item.rating} className="flex items-center gap-3">
                      <div className="w-12 text-xs font-semibold text-slate-600">{item.rating} star</div>
                      <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                        <div
                          className="h-2 rounded-full bg-amber-400"
                          style={{ width: `${Math.min(100, Number(item.count || 0) * 15)}%` }}
                        />
                      </div>
                      <div className="w-6 text-right text-xs font-bold text-slate-700">{item.count}</div>
                    </div>
                  ))}
                </div>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHead title="Recent reviews" />
            <CardBody>
              {recentReviews.length === 0 ? (
                <Empty title="No reviews available" />
              ) : (
                <div className="flex flex-col gap-3">
                  {recentReviews.map((review, i) => {
                    const isVisible = reviewToggles[review.review_id] ?? review.is_visible ?? true;
                    return (
                      <div key={review.review_id || i} className={`bg-slate-50 border border-slate-200 rounded-lg p-3.5 transition-opacity ${isVisible ? '' : 'opacity-60'}`}>
                        <div className="flex items-start justify-between gap-3 flex-wrap">
                          <div>
                            <div className="text-sm font-semibold text-slate-900">{review.client_name || 'Client'}</div>
                            <div className="text-xs text-slate-400 mt-0.5">{formatDateTime(review.created_at)}</div>
                          </div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-700 rounded-full px-2.5 py-0.5 text-xs font-bold">
                              ★ {review.rating || '-'}
                            </span>
                            <span className={`text-xs font-semibold rounded-full px-2.5 py-0.5 ${isVisible ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                              {isVisible ? '● Active' : '○ Hidden'}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleToggleReview(review.review_id, isVisible)}
                              disabled={togglingReviewId === review.review_id}
                              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border transition-colors disabled:opacity-50 ${
                                isVisible
                                  ? 'bg-red-50 border-red-200 text-red-600 hover:bg-red-100'
                                  : 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100'
                              }`}
                            >
                              {togglingReviewId === review.review_id && <Loader2 className="w-3 h-3 animate-spin" />}
                              {isVisible ? 'Deactivate' : 'Activate'}
                            </button>
                          </div>
                        </div>
                        <p className="mt-2.5 text-sm text-slate-600 leading-relaxed">{review.review_text || '-'}</p>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    );
  };

  const renderPayouts = () => (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <MiniCard label="All-time paid" value={formatMoney(payoutsSummary?.all_time_paid ?? overviewPayoutSummary.total_payouts ?? 0)} />
        <MiniCard label="Paid this month" value={formatMoney(payoutsSummary?.paid_this_month ?? 0)} color="#059669" />
        <MiniCard label="Outstanding" value={formatMoney(payoutsSummary?.outstanding ?? currentEarnings)} color="#dc2626" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        <Card>
          <CardHead title="Payout history" />
          <CardBody className="p-0">
            {sectionErrors.payouts ? (
              <div className="p-5"><Empty title="Failed to load payouts" subtitle={sectionErrors.payouts} /></div>
            ) : safeArray(payouts).length === 0 ? (
              <div className="p-5"><Empty title="No payouts recorded" /></div>
            ) : (
              <div className="px-5 pb-5 pt-4">
                <TableHead cols="1fr 1.1fr 1fr 0.9fr 1fr">
                  <span>Payout</span><span>Date</span><span>Method</span><span>Status</span><span className="text-right">Amount</span>
                </TableHead>
                {payouts.map((payout, i) => (
                  <TableRow key={payout.staff_payment_id || i} cols="1fr 1.1fr 1fr 0.9fr 1fr">
                    <div className="font-mono text-xs text-slate-500">{payout.staff_payment_id || '-'}</div>
                    <div className="text-xs text-slate-500">{formatDateTime(payout.paid_at)}</div>
                    <div><span className="inline-block text-xs font-semibold text-slate-600 bg-slate-100 rounded px-2 py-0.5">{payout.payment_method || '-'}</span></div>
                    <div><StatusPill value={payout.status} /></div>
                    <div className="text-right text-sm font-bold text-slate-900">{formatMoney(payout.amount_paid)}</div>
                  </TableRow>
                ))}
              </div>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHead title="Record a payout" sub="Writes to the payroll ledger." />
          <CardBody>
            <form onSubmit={submitPayout} className="flex flex-col gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Amount</label>
                <input type="number" min="0" step="0.01" value={payoutForm.amount} onChange={handlePayoutFieldChange('amount')} placeholder="0.00" className={inputCls} required />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Company bank account</label>
                <select value={payoutForm.company_bank_account_id} onChange={handlePayoutFieldChange('company_bank_account_id')} className={`${inputCls} cursor-pointer`}>
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
                <label className="block text-xs font-semibold text-slate-500 mb-1">Staff bank account</label>
                <select value={payoutForm.staff_bank_account_id} onChange={handlePayoutFieldChange('staff_bank_account_id')} className={`${inputCls} cursor-pointer`}>
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
                <label className="block text-xs font-semibold text-slate-500 mb-1">Reference (optional)</label>
                <input type="text" value={payoutForm.reference_number} onChange={handlePayoutFieldChange('reference_number')} placeholder="TRF / receipt no." className={inputCls} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Notes (optional)</label>
                <input type="text" value={payoutForm.notes} onChange={handlePayoutFieldChange('notes')} placeholder="Optional notes" className={inputCls} />
              </div>
              {payoutSubmitError && (
                <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2.5 text-sm text-red-700">{payoutSubmitError}</div>
              )}
              {payoutSubmitSuccess && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2.5 text-sm text-emerald-700">{payoutSubmitSuccess}</div>
              )}
              <div className="flex gap-2 mt-1">
                <button
                  type="submit"
                  disabled={payoutSubmitting}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-500 transition-colors disabled:opacity-60"
                >
                  {payoutSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Record payout
                </button>
                <button
                  type="button"
                  onClick={() => setPayoutForm({ amount: '', company_bank_account_id: '', staff_bank_account_id: '', payment_method: 'BANK_TRANSFER', reference_number: '', notes: '' })}
                  className="px-4 py-2.5 border border-slate-200 text-sm font-semibold text-slate-600 rounded-lg hover:bg-slate-50 transition-colors"
                >
                  Reset
                </button>
              </div>
            </form>
          </CardBody>
        </Card>
      </div>
    </div>
  );

  const renderDeductions = () => {
    const totalDeducted = deductions.reduce((s, d) => s + parseFloat(d.amount || 0), 0);
    return (
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <MiniCard label="Total deducted" value={formatMoney(totalDeducted)} color="#dc2626" />
          <MiniCard label="Total entries" value={deductions.length} />
        </div>

        <Card>
          <CardHead title="Apply deduction" sub="Deducts from earnings. A WhatsApp message and SMS are sent automatically." />
          <CardBody>
            <form onSubmit={submitDeduction}>
              <div className="grid grid-cols-1 sm:grid-cols-[1fr_1.5fr_auto] gap-3 items-end">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Amount (LKR)</label>
                  <input
                    type="number" min="0.01" step="0.01" value={deductionForm.amount}
                    onChange={e => { setDeductionForm(f => ({ ...f, amount: e.target.value })); setDeductionError(''); setDeductionSuccess(''); }}
                    placeholder="0.00" className={inputCls} required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Reason</label>
                  <input
                    type="text" value={deductionForm.reason}
                    onChange={e => { setDeductionForm(f => ({ ...f, reason: e.target.value })); setDeductionError(''); setDeductionSuccess(''); }}
                    placeholder="e.g. Uniform deposit, advance repayment" className={inputCls} required
                  />
                </div>
                <button
                  type="submit"
                  disabled={deductionSubmitting}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 text-white text-sm font-semibold rounded-lg hover:bg-red-500 transition-colors whitespace-nowrap disabled:opacity-60"
                >
                  {deductionSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Apply deduction
                </button>
              </div>
              {deductionError && <div className="mt-3 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5 text-sm text-red-700">{deductionError}</div>}
              {deductionSuccess && <div className="mt-3 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2.5 text-sm text-emerald-700">{deductionSuccess}</div>}
            </form>
          </CardBody>
        </Card>

        <Card>
          <CardHead title="Deduction history" />
          <CardBody className="p-0">
            {sectionErrors.deductions ? (
              <div className="p-5"><Empty title="Failed to load deductions" subtitle={sectionErrors.deductions} /></div>
            ) : deductions.length === 0 ? (
              <div className="p-5"><Empty title="No deductions recorded" /></div>
            ) : (
              <div className="px-5 pb-5 pt-4">
                <TableHead cols="1fr 1.6fr 1fr 0.9fr 1fr">
                  <span>Date</span><span>Reason</span><span>Recorded by</span><span>Status</span><span className="text-right">Amount</span>
                </TableHead>
                {deductions.map((d, i) => (
                  <TableRow key={d.transaction_id || i} cols="1fr 1.6fr 1fr 0.9fr 1fr">
                    <div className="text-xs text-slate-500">{formatDateTime(d.created_at)}</div>
                    <div className="text-sm font-semibold text-slate-900">{d.reason || '-'}</div>
                    <div className="text-sm text-slate-600">{d.recorded_by || 'Admin'}</div>
                    <div><StatusPill value={d.status} /></div>
                    <div className="text-right text-sm font-bold text-red-600">{formatMoney(d.amount)}</div>
                  </TableRow>
                ))}
              </div>
            )}
          </CardBody>
        </Card>
      </div>
    );
  };

  const renderBankAccounts = () => (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-base font-bold text-slate-900">Staff bank accounts</h3>
          <p className="text-xs text-slate-400 mt-0.5">Personal bank account records for this staff member.</p>
        </div>
        <button
          type="button"
          onClick={openAddBankModal}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-500 transition-colors"
        >
          + Add account
        </button>
      </div>

      {sectionErrors.bankAccounts ? (
        <Empty title="Failed to load bank accounts" subtitle={sectionErrors.bankAccounts} />
      ) : safeArray(bankAccounts).length === 0 ? (
        <Empty title="No bank accounts saved" subtitle="Use the Add Account button to add a bank account for this staff member." />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {bankAccounts.map((account, i) => (
            <div key={account.staff_bank_account_id || i} className="bg-white border border-slate-200 rounded-lg p-4">
              <div className="flex items-start justify-between gap-2 mb-3.5">
                <div>
                  <div className="text-sm font-bold text-slate-900">{account.account_holder_name || account.bank_name || 'Bank Account'}</div>
                  <div className="text-xs text-slate-500 mt-0.5">{account.bank_name || '-'}{account.branch_name ? ` · ${account.branch_name}` : ''}</div>
                </div>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${account.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
                  {account.is_active ? 'Active' : 'Inactive'}
                </span>
              </div>
              <div className="flex flex-col gap-1.5 text-xs text-slate-600 mb-3.5">
                <div className="flex justify-between gap-2">
                  <span className="text-slate-400">Account no.</span>
                  <span className="font-mono">{account.account_number || '-'}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-slate-400">Branch</span><span>{account.branch_name || '-'}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-slate-400">Currency</span><span>{account.currency || 'LKR'}</span>
                </div>
              </div>
              <div className="flex gap-2 border-t border-slate-100 pt-3">
                <button
                  type="button"
                  onClick={() => openEditBankModal(account)}
                  className="flex-1 text-xs font-semibold border border-slate-200 rounded-lg py-1.5 text-slate-600 hover:bg-slate-50 transition-colors"
                >Edit</button>
                <button
                  type="button"
                  onClick={() => handleDeleteBankAccount(account.staff_bank_account_id)}
                  disabled={deletingBankId === account.staff_bank_account_id}
                  className="flex-1 text-xs font-semibold border border-red-100 rounded-lg py-1.5 text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
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

  const renderDocuments = () => {
    const documentUrls = safeArray(profile.document_urls);
    const complianceSubmitted = !!(profile.grama_niladhari_url && profile.police_report_url);

    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-end -mb-1">
          <button
            type="button"
            onClick={openEditProfileModal}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors"
          >
            <Pencil className="w-3 h-3" /> Edit photo & documents
          </button>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-white border border-slate-200 rounded-lg p-4">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Compliance status</p>
            <DocStatusBadge submitted={complianceSubmitted} />
          </div>
          <MiniCard label="NIC on file" value={profile.nic_front_url && profile.nic_back_url ? 'Yes' : 'Incomplete'} color={profile.nic_front_url && profile.nic_back_url ? '#059669' : '#dc2626'} />
          <MiniCard label="Supporting docs" value={documentUrls.length} />
          <MiniCard label="NIC number" value={profile.nic_number || '-'} />
        </div>

        {(sendActionError || sendActionSuccess) && (
          <div className={`rounded-lg px-4 py-3 text-sm border ${sendActionError ? 'bg-red-50 border-red-200 text-red-700' : 'bg-emerald-50 border-emerald-200 text-emerald-700'}`}>
            {sendActionError || sendActionSuccess}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHead title="Contract" sub="Independent Contractor Agreement" />
            <CardBody>
              {profile.agreement_sent_at ? (
                <div className="flex items-center gap-2 text-sm font-semibold text-emerald-700">
                  <Check className="w-4 h-4" /> Sent {formatDateTime(profile.agreement_sent_at)}
                </div>
              ) : (
                <>
                  <p className="text-xs text-slate-500 mb-3">
                    Send the Independent Contractor Agreement PDF to {profile.full_name || 'this staff member'} via WhatsApp.
                  </p>
                  <button
                    type="button"
                    onClick={handleSendAgreement}
                    disabled={sendingAgreement || !profile.mobile_number}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white text-xs font-semibold rounded-lg hover:bg-indigo-500 transition-colors disabled:opacity-60"
                  >
                    {sendingAgreement ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                    Send Contract
                  </button>
                </>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHead title="Compliance Document Request" sub="WhatsApp upload link for GN/Police docs" />
            <CardBody>
              {profile.doc_request_sent_at && (
                <p className="text-xs text-slate-400 mb-2.5">Requested {formatDateTime(profile.doc_request_sent_at)}</p>
              )}
              <button
                type="button"
                onClick={handleSendDocRequest}
                disabled={sendingDocRequest || !profile.mobile_number}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 text-white text-xs font-semibold rounded-lg hover:bg-violet-500 transition-colors disabled:opacity-60"
              >
                {sendingDocRequest ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                {profile.doc_request_sent_at ? 'Resend Request' : 'Send Request'}
              </button>
            </CardBody>
          </Card>
        </div>

        <Card>
          <CardHead title="Compliance documents" sub="Grama Niladhari report and Police report" />
          <CardBody>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                { label: 'Grama Niladhari Report', url: profile.grama_niladhari_url },
                { label: 'Police Report', url: profile.police_report_url },
              ].map(({ label, url }) => (
                <div key={label} className="border border-slate-200 rounded-lg p-3.5">
                  <div className="flex items-center justify-between gap-2 mb-2.5">
                    <p className="text-sm font-semibold text-slate-800">{label}</p>
                    <DocStatusBadge submitted={!!url} />
                  </div>
                  {url ? (
                    <DocButton label={label} url={url} />
                  ) : (
                    <p className="text-xs text-slate-400">Not uploaded yet.</p>
                  )}
                </div>
              ))}
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHead title="Identity documents" sub="NIC front and back" />
          <CardBody>
            {profile.nic_front_url || profile.nic_back_url ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {profile.nic_front_url && <DocButton label="NIC Front" url={profile.nic_front_url} />}
                {profile.nic_back_url && <DocButton label="NIC Back" url={profile.nic_back_url} />}
              </div>
            ) : (
              <Empty title="No NIC documents on file" />
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHead title="Supporting documents" sub="Certificates and CVs submitted with the application" />
          <CardBody>
            {documentUrls.length === 0 ? (
              <Empty title="No supporting documents" subtitle="This staff member has not uploaded any certificates or CVs." />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {documentUrls.map((url, i) => (
                  <DocButton key={i} label={`Document ${i + 1}`} url={url} />
                ))}
              </div>
            )}
          </CardBody>
        </Card>
      </div>
    );
  };

  const renderChangeHistory = () => {
    const approvedCount = changeRequests.filter(r => r.status === 'APPROVED').length;
    const rejectedCount = changeRequests.filter(r => r.status === 'REJECTED').length;
    const pendingCount = changeRequests.filter(r => r.status === 'PENDING' || r.status === 'UNDER_REVIEW').length;

    return (
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <MiniCard label="Total requests" value={changeRequests.length} />
          <MiniCard label="Pending" value={pendingCount} color="#b45309" />
          <MiniCard label="Approved" value={approvedCount} color="#059669" />
          <MiniCard label="Rejected" value={rejectedCount} color="#dc2626" />
        </div>

        <Card>
          <CardHead title="Change request history" />
          <CardBody>
            {sectionErrors.changeRequests ? (
              <Empty title="Failed to load change requests" subtitle={sectionErrors.changeRequests} />
            ) : changeRequests.length === 0 ? (
              <Empty title="No change requests" subtitle="This staff member has not submitted any change requests yet." />
            ) : (
              <div className="flex flex-col gap-3">
                {changeRequests.map(req => {
                  const isExpanded = expandedRequestId === req.request_id;
                  const logs = requestLogs[req.request_id] || [];
                  const isLoadingLog = loadingLogs[req.request_id];
                  const tm = requestTypeMeta(req.request_type);

                  return (
                    <div key={req.request_id} className="border border-slate-200 rounded-lg overflow-hidden">
                      <button
                        type="button"
                        onClick={() => handleExpandRequest(req.request_id)}
                        className="w-full flex items-center justify-between gap-3 px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors text-left"
                      >
                        <div className="flex items-center gap-2.5 flex-wrap">
                          <span className={`text-xs font-bold px-2 py-0.5 rounded ${tm.cls}`}>{tm.label}</span>
                          <StatusPill value={req.status?.replace(/_/g, ' ')} />
                          <span className="text-xs text-slate-400">Submitted {formatDateTime(req.created_at)}</span>
                          {req.reviewer_name && (
                            <span className="text-xs text-slate-400">· Reviewer: <strong className="text-slate-700">{req.reviewer_name}</strong></span>
                          )}
                        </div>
                        <span className="text-slate-400 flex-shrink-0">
                          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </span>
                      </button>

                      {isExpanded && (
                        <div className="border-t border-slate-100 p-4 bg-white">
                          <div className="text-xs font-bold tracking-wide uppercase text-slate-400 mb-2.5">Requested changes</div>
                          {renderChangeDiff(req.request_type, req.requested_changes)}

                          <div className="text-xs font-bold tracking-wide uppercase text-slate-400 mt-4 mb-3">Audit trail</div>
                          {isLoadingLog ? (
                            <div className="flex items-center gap-2 text-sm text-slate-400">
                              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading logs...
                            </div>
                          ) : logs.length === 0 ? (
                            <p className="text-sm text-slate-400">No audit log entries found.</p>
                          ) : (
                            <div className="flex flex-col gap-3 pl-1.5">
                              {logs.map((log, idx) => {
                                const am = auditActionMeta(log.action);
                                return (
                                  <div key={log.log_id || idx} className="flex items-start gap-3">
                                    <span className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${am.dot}`} />
                                    <div>
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <span className={`text-xs font-bold px-2 py-0.5 rounded ${am.cls}`}>{log.action}</span>
                                        <span className="text-sm font-semibold text-slate-800">{log.performed_by_name || 'Unknown'}</span>
                                        <span className="text-xs text-slate-400">{formatDateTime(log.created_at)}</span>
                                      </div>
                                      {log.notes && <div className="text-xs text-slate-500 italic mt-1">"{log.notes}"</div>}
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
          </CardBody>
        </Card>
      </div>
    );
  };

  // ── bank modal ─────────────────────────────────────────────────────────────
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

  // ── edit profile modal ──────────────────────────────────────────────────────
  const editField = (key, value) => setEditModal(p => ({ ...p, form: { ...p.form, [key]: value } }));
  const editToggleRole = (roleKey) => setEditModal(p => {
    const has = p.form.roles.includes(roleKey);
    return {
      ...p,
      form: {
        ...p.form,
        roles: has ? p.form.roles.filter(r => r !== roleKey) : [...p.form.roles, roleKey],
      },
    };
  });
  const editInputCls = 'w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 bg-white';

  const renderEditProfileModal = () => !editModal.isOpen ? null : (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div className="flex-1 bg-black/30" onClick={() => !editModal.saving && setEditModal(p => ({ ...p, isOpen: false }))} />

      {/* Panel */}
      <div className="w-full max-w-xl bg-white flex flex-col shadow-2xl overflow-hidden">
        {/* Drawer header */}
        <div className="flex items-start justify-between gap-3 px-6 py-4 border-b border-slate-200 flex-shrink-0">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-blue-50 rounded-lg mt-0.5">
              <Pencil className="h-4 w-4 text-blue-600" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Edit Staff Information</h3>
              <p className="text-xs text-slate-500 mt-0.5">Changes to email or mobile number also update their login credentials.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setEditModal(p => ({ ...p, isOpen: false }))}
            disabled={editModal.saving}
            className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-md transition-colors disabled:opacity-50 flex-shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable form body */}
        <div className="flex-1 overflow-y-auto">
          {editModal.error && (
            <div className="mx-6 mt-4 px-4 py-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg flex items-center gap-2">
              <AlertCircle className="h-4 w-4 flex-shrink-0" /> {editModal.error}
            </div>
          )}

          {/* Basic information */}
          <EditSectionHeader title="Basic Information" />
          <div className="px-6 pt-4 pb-2 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <EditField label="Staff Code" required>
                <input value={editModal.form.staff_code} onChange={e => editField('staff_code', e.target.value)}
                  placeholder="e.g. VC-0042" className={editInputCls} />
              </EditField>
              <EditField label="NIC Number">
                <input value={editModal.form.nic_number} onChange={e => editField('nic_number', e.target.value)}
                  placeholder="e.g. 199012345678" className={editInputCls} />
              </EditField>
            </div>
            <EditField label="Full Name" required>
              <input value={editModal.form.full_name} onChange={e => editField('full_name', e.target.value)}
                placeholder="e.g. Nimal Silva" className={editInputCls} />
            </EditField>
            <div className="grid grid-cols-2 gap-3">
              <EditField label="Email">
                <input type="email" value={editModal.form.email} onChange={e => editField('email', e.target.value)}
                  placeholder="e.g. nimal@example.com" className={editInputCls} />
              </EditField>
              <EditField label="Mobile Number">
                <PhoneInput value={editModal.form.mobile_number} onChange={e => editField('mobile_number', e.target.value)}
                  placeholder="e.g. 0771234567" />
              </EditField>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <EditField label="Gender">
                <select value={editModal.form.gender} onChange={e => editField('gender', e.target.value)} className={editInputCls}>
                  <option value="">—</option>
                  <option value="MALE">Male</option>
                  <option value="FEMALE">Female</option>
                  <option value="OTHER">Other</option>
                </select>
              </EditField>
              <EditField label="Date of Birth">
                <DateInput value={editModal.form.date_of_birth} onChange={e => editField('date_of_birth', e.target.value)}
                  className={editInputCls} />
              </EditField>
            </div>
          </div>

          {/* Role & employment */}
          <EditSectionHeader title="Role & Employment" sub="Roles control what this staff member can be assigned to." />
          <div className="px-6 pt-4 pb-2 space-y-3">
            <EditField label="Roles" required>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(ROLE_LABELS).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => editToggleRole(key)}
                    className={`px-3 py-2 rounded-lg border text-xs font-medium transition-all text-left ${
                      editModal.form.roles.includes(key)
                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                        : 'border-slate-200 text-slate-600 hover:border-slate-300 bg-white'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {editModal.form.roles.length > 0 && (
                <p className="text-xs text-slate-400 mt-2">
                  Selected: {editModal.form.roles.map(r => ROLE_LABELS[r] || r).join(', ')}
                </p>
              )}
            </EditField>
            <div className="grid grid-cols-2 gap-3">
              <EditField label="Designation">
                <input value={editModal.form.designation} onChange={e => editField('designation', e.target.value)}
                  placeholder="e.g. Senior Nurse" className={editInputCls} />
              </EditField>
              <EditField label="Willing to Live In">
                <select value={editModal.form.willing_to_live_in} onChange={e => editField('willing_to_live_in', e.target.value)} className={editInputCls}>
                  <option value="true">Yes</option>
                  <option value="false">No</option>
                </select>
              </EditField>
            </div>
            <EditField label="Experience Level">
              <select value={editModal.form.experience_level} onChange={e => editField('experience_level', e.target.value)} className={editInputCls}>
                <option value="">— Not specified —</option>
                {Object.entries(EXPERIENCE_LEVEL_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </EditField>
            <EditField label="Qualifications">
              <textarea value={editModal.form.qualifications} onChange={e => editField('qualifications', e.target.value)}
                placeholder="Describe qualifications, certifications, and relevant training."
                rows={3} className={`${editInputCls} resize-none`} />
            </EditField>
          </div>

          {/* Address & location */}
          <EditSectionHeader title="Address & Location" />
          <div className="px-6 pt-4 pb-2 space-y-3">
            <EditField label="Location">
              <input value={editModal.form.location} onChange={e => editField('location', e.target.value)}
                placeholder="e.g. Colombo" className={editInputCls} />
            </EditField>
            <EditField label="Home Address">
              <input value={editModal.form.home_address} onChange={e => editField('home_address', e.target.value)}
                placeholder="e.g. 45/A, Galle Road, Dehiwala" className={editInputCls} />
            </EditField>
          </div>

          {/* Documents */}
          <EditSectionHeader title="Documents" sub="Uploading a new file replaces the current one." />
          <div className="px-6 pt-4 pb-6 space-y-4">
            <EditFileField label="Profile picture" selectedFile={editModal.files.profile_picture} currentUrl={profile.profile_picture_url} onChange={(file) => editSetFile('profile_picture', file)} />

            <div className="grid grid-cols-2 gap-3">
              <EditFileField label="NIC Front" selectedFile={editModal.files.nic_front} currentUrl={profile.nic_front_url} onChange={(file) => editSetFile('nic_front', file)} />
              <EditFileField label="NIC Back" selectedFile={editModal.files.nic_back} currentUrl={profile.nic_back_url} onChange={(file) => editSetFile('nic_back', file)} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <EditFileField label="Grama Niladhari Report" selectedFile={editModal.files.grama_niladhari} currentUrl={profile.grama_niladhari_url} onChange={(file) => editSetFile('grama_niladhari', file)} />
              <EditFileField label="Police Report" selectedFile={editModal.files.police_report} currentUrl={profile.police_report_url} onChange={(file) => editSetFile('police_report', file)} />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Supporting Documents</label>
              {safeArray(profile.document_urls).length > 0 && (
                <div className="flex flex-col gap-1.5 mb-2.5">
                  {safeArray(profile.document_urls).map((url, i) => {
                    const marked = editModal.removeDocumentUrls.includes(url);
                    return (
                      <div key={url + i} className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-xs ${marked ? 'border-red-200 bg-red-50' : 'border-slate-200 bg-slate-50'}`}>
                        <button type="button" onClick={() => window.open(url, '_blank')} className={`truncate font-medium ${marked ? 'text-red-500 line-through' : 'text-slate-700 hover:text-blue-600'}`}>
                          Document {i + 1}
                        </button>
                        <button
                          type="button"
                          onClick={() => editToggleRemoveDoc(url)}
                          className={`flex-shrink-0 text-xs font-semibold px-2 py-0.5 rounded ${marked ? 'text-emerald-700 bg-emerald-100 hover:bg-emerald-200' : 'text-red-600 bg-red-100 hover:bg-red-200'}`}
                        >
                          {marked ? 'Undo' : 'Remove'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
              <label className="flex items-center gap-2 rounded-lg border border-dashed border-slate-300 px-3 py-2.5 text-xs text-slate-500 cursor-pointer hover:border-blue-400 hover:bg-blue-50/40 transition-colors">
                <Upload className="w-3.5 h-3.5 flex-shrink-0 text-slate-400" />
                <span className="truncate">
                  {editModal.files.documents.length > 0
                    ? `${editModal.files.documents.length} new file(s) selected`
                    : 'Add supporting document(s)...'}
                </span>
                <input
                  type="file"
                  multiple
                  accept="image/*,.pdf"
                  className="hidden"
                  onChange={(e) => setEditModal(p => ({ ...p, files: { ...p.files, documents: Array.from(e.target.files || []) } }))}
                />
              </label>
            </div>
          </div>
        </div>

        {/* Drawer footer */}
        <div className="flex items-center gap-2 px-6 py-4 border-t border-slate-200 bg-slate-50 flex-shrink-0">
          <button
            type="button"
            onClick={() => setEditModal(p => ({ ...p, isOpen: false }))}
            disabled={editModal.saving}
            className="flex-1 px-4 py-2 border border-slate-200 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-100 transition-colors disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleEditProfileSave}
            disabled={editModal.saving}
            className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {editModal.saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {editModal.saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );

  // ── loading / error ───────────────────────────────────────────────────────
  if (loading || authLoading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-64">
          <div className="flex items-center gap-2.5 text-slate-500 text-sm">
            <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
            Loading staff detail...
          </div>
        </div>
      </AdminLayout>
    );
  }

  if (error) {
    return (
      <AdminLayout>
        <div className="bg-red-50 border border-red-200 rounded-lg p-6">
          <p className="font-semibold text-red-700 mb-4">{error}</p>
          <button
            type="button"
            onClick={() => navigate('/admin/staff-management')}
            className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 text-white text-sm font-semibold rounded-lg hover:bg-red-500 transition-colors"
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
      {renderEditProfileModal()}

      {/* HEADER ROW */}
      <div className="flex items-center justify-between gap-4 flex-wrap mb-5 -mt-2">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/admin/staff-management')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 text-slate-600 text-sm font-semibold rounded-lg hover:bg-slate-100 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to roster
          </button>
          {linkedClientProfileId && (
            <button
              type="button"
              onClick={() => navigate(`/admin/users/${linkedClientProfileId}/detail`)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-indigo-200 bg-indigo-50 text-indigo-700 text-sm font-semibold rounded-lg hover:bg-indigo-100 transition-colors"
            >
              <ArrowLeftRight className="w-3.5 h-3.5" /> Switch to Client View
            </button>
          )}
        </div>
        <div className="flex items-center gap-2.5">
          <span className="font-mono text-xs text-slate-400 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5">
            {profile.staff_code || staffProfileId}
          </span>
          <button
            type="button"
            onClick={refreshData}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 text-slate-600 text-sm font-semibold rounded-lg hover:bg-slate-100 transition-colors disabled:opacity-60"
          >
            {refreshing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : '↻'} Refresh
          </button>
        </div>
      </div>

      {/* PENDING MIGRATION DISCLAIMER */}
      {isPendingMigration && (
        <div className="flex items-start gap-3 px-4 py-3.5 mb-5 rounded-lg border border-amber-200 bg-amber-50">
          <AlertCircle className="w-4.5 h-4.5 text-amber-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-amber-900">Migration incomplete</p>
            <p className="text-xs text-amber-700 mt-0.5">
              This profile was imported from legacy data and is still marked <span className="font-mono font-semibold">Pending Migration</span>.
              It will only be activated once every field below has been filled in.
            </p>
            {missingMigrationFields.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2.5">
                {missingMigrationFields.map(label => (
                  <span key={label} className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
                    {label}
                  </span>
                ))}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={openEditProfileModal}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors flex-shrink-0"
          >
            <Pencil className="w-3 h-3" /> Complete Profile
          </button>
        </div>
      )}

      {/* HERO */}
      <div className="flex items-start gap-4 flex-wrap mb-5">
        <div className="w-14 h-14 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center text-xl font-bold flex-shrink-0 overflow-hidden">
          {profile.profile_picture_url
            ? <img src={profile.profile_picture_url} alt={profile.full_name} className="w-full h-full object-cover" />
            : getInitials(profile.full_name)}
        </div>
        <div className="flex-1 min-w-[220px]">
          <div className="flex items-center gap-2.5 flex-wrap mb-1.5">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">{profile.full_name || 'Staff profile'}</h1>
            <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${heroStatus.bg} ${heroStatus.text}`}>
              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${heroStatus.dot}`} />
              {profile.current_status || 'Unknown'}
            </span>
            <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
              {isActive ? '✓ Active account' : '✗ Deactivated'}
            </span>
          </div>
          <div className="text-sm font-semibold text-slate-700 mb-1.5">{profile.designation || 'Staff member'}</div>
          <p className="text-sm text-slate-500">
            {profile.staff_code || staffProfileId}
            {profile.mobile_number ? ` · ${profile.mobile_number}` : ''}
            {profile.created_at ? ` · Joined ${formatDate(profile.created_at)}` : ''}
            {currentAssignment?.client_name ? ` · Currently on ${currentAssignment.client_name} booking` : ''}
          </p>
        </div>

        {/* ADMIN NOTES */}
        <div className="flex-1 min-w-[280px] max-w-[440px]">
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
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <div
          className="bg-white border border-slate-200 rounded-lg p-4 cursor-pointer hover:bg-slate-50 transition-colors"
          onClick={() => navigate(`/admin/staff/${staffProfileId}/current-earnings`)}
          title="Click to see current earnings breakdown"
        >
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Current earnings</p>
          <p className="text-xl font-bold mt-1.5 text-emerald-600">{formatMoney(currentEarnings)}</p>
          <p className="text-xs text-blue-600 font-semibold mt-1">View breakdown →</p>
        </div>
        <div
          className="bg-white border border-slate-200 rounded-lg p-4 cursor-pointer hover:bg-slate-50 transition-colors"
          onClick={() => navigate(`/admin/staff/${staffProfileId}/total-earnings`)}
          title="Click to see total earnings breakdown"
        >
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Total earned</p>
          <p className="text-xl font-bold mt-1.5 text-slate-900">{formatMoney(totalEarned)}</p>
          <p className="text-xs text-slate-400 font-semibold mt-1">across {totalBookings} bookings</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Paid out</p>
          <p className="text-xl font-bold mt-1.5 text-slate-900">{formatMoney(totalPaidOut)}</p>
          <p className="text-xs text-slate-400 font-semibold mt-1">total disbursed</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Outstanding payable</p>
          <p className="text-xl font-bold mt-1.5 text-red-600">{formatMoney(outstandingPayable)}</p>
          <p className="text-xs text-red-500 font-semibold mt-1">awaiting payout</p>
        </div>
      </div>

      {/* LEAVE SUMMARY */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Total leaves taken</p>
          <p className="text-xl font-bold mt-1.5 text-slate-900">{leaveSummary.total_leave_days} day{leaveSummary.total_leave_days === 1 ? '' : 's'}</p>
          <p className="text-xs text-slate-400 font-semibold mt-1">approved leave, all time</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Leaves this month</p>
          <p className="text-xl font-bold mt-1.5 text-purple-600">{leaveSummary.month_leave_days} day{leaveSummary.month_leave_days === 1 ? '' : 's'}</p>
          <p className="text-xs text-slate-400 font-semibold mt-1">current calendar month</p>
        </div>
      </div>

      {/* WORK & PAY CALENDAR */}
      <div className="mb-4">
        <StaffCareTimeline
          assignments={attendanceCalendar.assignments}
          attendanceRecords={attendanceCalendar.attendance}
          reschedules={attendanceCalendar.reschedules}
          leaveDays={leaveSummary.approved_leaves}
          pendingResumptions={attendanceCalendar.pendingResumptions}
        />
      </div>

      {/* TABS */}
      <div className="flex gap-1 mb-4 bg-slate-100 p-1 rounded-lg w-fit max-w-full flex-wrap">
        {sectionConfig.map(tab => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveSection(tab.id)}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all whitespace-nowrap ${
              activeSection === tab.id
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* TAB PANEL */}
      {activeSection === 'overview'        && renderOverview()}
      {activeSection === 'earnings'        && renderEarnings()}
      {activeSection === 'current-booking' && renderCurrentBooking()}
      {activeSection === 'future-bookings' && renderFutureBookings()}
      {activeSection === 'booking-history' && renderBookingHistory()}
      {activeSection === 'reviews'         && renderReviews()}
      {activeSection === 'payouts'         && renderPayouts()}
      {activeSection === 'deductions'      && renderDeductions()}
      {activeSection === 'bank-accounts'   && renderBankAccounts()}
      {activeSection === 'documents'       && renderDocuments()}
      {activeSection === 'change-history'  && renderChangeHistory()}

    </AdminLayout>
  );
};

export default StaffDetailPageV2;
