import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity, AlertTriangle, ArrowLeft, CalendarDays, CheckCircle, Download, DollarSign,
  LayoutGrid, Loader2, Menu, MessageCircle, Phone, RefreshCw, Repeat2, Search, SendHorizontal, ShieldCheck,
  Upload, User, UserPlus, Users, Wallet, X, XCircle, Briefcase, History, Pause, Play, Building2,
  StickyNote, Plus, Trash2, Pencil, Check,
} from 'lucide-react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import AdminLayout from '../components/AdminLayout';
import apiClient from '../../../api/api';
import { useAdminAuth } from '../../../context/AdminAuthContext';
import CareTimeline from './CareTimeline';
import StaffScheduleTimeline from '../components/StaffScheduleTimeline';
import BookingSwitcherSidebar from './BookingSwitcherSidebar';
import vcareLogo from '../../../assets/Logo/VCareLogo.png';
import DateInput, { todayISO } from '../../../components/common/DateInput';
import TimeInput from '../../../components/common/TimeInput';
import { computeVisitingStatus, VISITING_STATUS, VISITING_STATUS_META } from '../../../utils/visitingBookingStatus';
import { formatMobileNumber } from '../../../utils/phoneFormat';

// ─── helpers ────────────────────────────────────────────────────────────────

const initialPaymentForm = {
  amount_received: '', payment_method: 'BANK_TRANSFER', bank_account_id: '',
  cheque_number: '', cheque_date: '', reference_number: '', notes: '',
};

const moneyFmt = new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR', maximumFractionDigits: 2 });
const formatMoney  = (v) => moneyFmt.format(Number(v || 0));
const formatDate   = (v) => { if (!v) return '-'; const d = new Date(v); return isNaN(d) ? '-' : d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }); };
// Times on this page are 24-hour throughout (hourCycle h23 so midnight reads 00:xx, not 24:xx).
const formatDT     = (v) => { if (!v) return '-'; const d = new Date(v); return isNaN(d) ? '-' : d.toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }); };
const formatTime   = (t) => { if (!t) return '-'; const m = String(t).match(/^(\d{1,2}):(\d{2})/); if (!m) return '-'; return `${String(m[1]).padStart(2, '0')}:${m[2]}`; };
const toDTLocal    = (value = new Date()) => { const d = value instanceof Date ? value : new Date(value); if (isNaN(d)) return ''; return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };
const toDateInput  = (value = new Date()) => { const d = value instanceof Date ? value : new Date(value); return isNaN(d) ? '' : d.toISOString().slice(0, 10); };
// Local calendar date (not UTC) as YYYY-MM-DD — service_start_date/service_end_date are
// UTC timestamps from Postgres, so slicing the raw ISO string misreads the day for
// timezones ahead of UTC (e.g. Sri Lanka). Used for any same-day comparison against dates
// the admin picks in their own timezone (CareTimeline's toLocalISO, "today", etc).
const toLocalDateStr = (value) => { if (!value) return null; const d = new Date(value); if (isNaN(d)) return null; return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const addDays      = (date, n) => { const d = new Date(date); d.setDate(d.getDate() + n); return d; };
// 'HH:MM'(:SS) + hours (may be fractional, e.g. shift duration_hours) -> 'HH:MM', wrapping past midnight.
const addHoursToTime = (timeStr, hours) => {
  if (!timeStr) return '';
  const [h, m] = timeStr.split(':').map(Number);
  const totalMins = (h * 60 + m + Math.round((hours || 0) * 60)) % 1440;
  return `${String(Math.floor(totalMins / 60)).padStart(2, '0')}:${String(totalMins % 60).padStart(2, '0')}`;
};
const initials     = (name) => (name || '?').trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
// 'HH:MM' in + 'HH:MM' out -> hours worked, wrapping past midnight if out <= in (overnight shift).
const computeWorkedHours = (inTime, outTime) => {
  if (!inTime || !outTime) return null;
  const [ih, im] = inTime.split(':').map(Number);
  const [oh, om] = outTime.split(':').map(Number);
  let mins = (oh * 60 + om) - (ih * 60 + im);
  if (mins <= 0) mins += 1440;
  return mins / 60;
};
// Reduce any phone format to its national significant digits so a search box entry
// matches whatever variant is stored: +94778885555 / 0778885555 / 778885555 all -> 778885555.
const phoneDigits = (value) => {
  const d = String(value || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('94') && d.length > 9) return d.slice(2);
  if (d.startsWith('0')) return d.replace(/^0+/, '');
  return d;
};
// Reduce a staff code to its bare number so 'EMP-0541', 'emp0541', '0541' and '541'
// all match the stored 'EMP-0541'.
const staffCodeVariants = (value) => {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return [];
  const compact = raw.replace(/[^a-z0-9]/g, '');           // 'emp0541'
  const numeric = compact.replace(/^emp/, '');             // '0541'
  const trimmed = numeric.replace(/^0+/, '');              // '541'
  return [...new Set([raw, compact, numeric, trimmed].filter(Boolean))];
};
// Free-text staff picker match: name, designation, phone (any format) or staff code
// (with or without the EMP- prefix / leading zeros).
const staffMatchesQuery = (staff, query) => {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return true;
  if (staff.full_name?.toLowerCase().includes(q)) return true;
  if (staff.designation?.toLowerCase().includes(q)) return true;
  if (staff.email?.toLowerCase().includes(q)) return true;
  if (staff.nic_number?.toLowerCase().includes(q)) return true;
  const qPhone = phoneDigits(q);
  if (qPhone.length >= 3 && phoneDigits(staff.mobile_number).includes(qPhone)) return true;
  const codeVariants = staffCodeVariants(staff.staff_code);
  if (codeVariants.length) {
    const qCodes = staffCodeVariants(q);
    if (qCodes.some(qc => codeVariants.some(cv => cv.includes(qc)))) return true;
  }
  return false;
};
// Fractional hours -> 'Hh Mmins' (e.g. 8.5 -> '8h 30mins'), so attendance reads as clock time.
const formatHoursMins = (hours) => {
  if (hours === null || hours === undefined || hours === '' || isNaN(Number(hours))) return null;
  const totalMins = Math.round(Number(hours) * 60);
  const h = Math.floor(Math.abs(totalMins) / 60);
  const m = Math.abs(totalMins) % 60;
  const sign = totalMins < 0 ? '-' : '';
  if (h && m) return `${sign}${h}h ${m}min${m === 1 ? '' : 's'}`;
  if (h) return `${sign}${h}h`;
  return `${sign}${m}min${m === 1 ? '' : 's'}`;
};
// Colour tier for served hours vs. what the staff member was assigned: green when the
// full assigned duration was met, amber for a moderate shortfall, red for a large one.
// Returns null when there's nothing to compare against (no assigned_hours on record).
const hoursTier = (served, assigned) => {
  if (served === null || served === undefined || !assigned) return null;
  const pct = (served / assigned) * 100;
  if (pct >= 100) return 'green';
  if (pct >= 75) return 'amber';
  return 'red';
};
const SETTLEMENT_ACTION_LABELS = {
  WALLET_REFUND: 'wallet refund',
  WALLET_REFUND_EXTEND: 'wallet refund + extended booking',
  BANK_REFUND: 'bank refund',
  NO_REFUND: 'write-off',
};
const TIER_STYLE = {
  green: { bg: '#f0fdf4', col: '#166534', dot: '#22c55e' },
  amber: { bg: '#fffbeb', col: '#92400e', dot: '#f59e0b' },
  red:   { bg: '#fef2f2', col: '#991b1b', dot: '#ef4444' },
};
// Age in whole years from a date of birth, or null when there's no usable DOB.
const ageFromDob = (dob) => {
  if (!dob) return null;
  const d = new Date(dob);
  if (isNaN(d)) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age -= 1;
  return age >= 0 && age < 120 ? age : null;
};
// A staff record's list-shaped fields come back either as a Postgres array or as a
// comma-separated string depending on the column — normalise both to a display string.
const listToText = (value) => {
  if (!value) return null;
  const arr = Array.isArray(value) ? value : String(value).split(',');
  const cleaned = arr.map(v => String(v).trim()).filter(Boolean);
  return cleaned.length ? cleaned.join(', ') : null;
};
// Every profile field we hold on a staff member, laid out for the swap/assign picker so
// the admin can judge a candidate without opening their profile in another tab.
const StaffProfileDetails = ({ staff }) => {
  const age = ageFromDob(staff.date_of_birth);
  const fields = [
    ['Staff ID',      staff.staff_code || null],
    ['Designation',   staff.designation || null],
    ['Phone',         staff.mobile_number ? formatMobileNumber(staff.mobile_number) : null],
    ['Email',         staff.email || null],
    ['NIC',           staff.nic_number || null],
    ['Gender',        staff.gender || null],
    ['Date of birth', staff.date_of_birth ? `${formatDate(staff.date_of_birth)}${age !== null ? ` (${age} yrs)` : ''}` : null],
    ['Experience',    staff.experience_level || null],
    ['Qualifications',listToText(staff.qualifications)],
    ['Languages',     listToText(staff.languages)],
    ['Location',      staff.location || null],
    ['Address',       staff.home_address || null],
    ['Live-in',       staff.willing_to_live_in === true ? 'Willing' : staff.willing_to_live_in === false ? 'Not willing' : null],
    ['Rating',        staff.average_rating ? `${Number(staff.average_rating).toFixed(1)} / 5` : 'No ratings yet'],
    ['Verification',  staff.verification_status || null],
    ['Onboarding',    staff.onboarding_status || null],
    ['Account',       staff.is_active === false ? 'Deactivated' : staff.is_active === true ? 'Active' : null],
    ['Joined',        staff.created_at ? formatDate(staff.created_at) : null],
  ].filter(([, v]) => v !== null && v !== undefined && v !== '');

  return (
    <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
      {fields.map(([label, value]) => (
        <div key={label} className="flex gap-1.5 text-[11px] leading-snug">
          <span className="text-slate-400 shrink-0">{label}:</span>
          <span className="text-slate-700 font-medium break-words">{value}</span>
        </div>
      ))}
      {staff.admin_remarks && (
        <div className="sm:col-span-2 flex gap-1.5 text-[11px] leading-snug">
          <span className="text-slate-400 shrink-0">Remarks:</span>
          <span className="text-slate-700 break-words">{staff.admin_remarks}</span>
        </div>
      )}
    </div>
  );
};
const HoursBadge = ({ served, assigned }) => {
  const tier = hoursTier(served, assigned);
  const label = formatHoursMins(served) ?? '—';
  if (!tier) return <span className="tabular-nums">{label}</span>;
  const s = TIER_STYLE[tier];
  return (
    <span className="inline-flex items-center gap-1.5 tabular-nums">
      <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: s.dot }} />
      <span style={{ fontWeight: 600, color: s.col }}>{label}</span>
    </span>
  );
};

// Matches Tailwind's `sm` breakpoint (640px). Mobile = below it.
const useIsMobile = (query = '(max-width: 639px)') => {
  const [match, setMatch] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(query).matches
  );
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mql = window.matchMedia(query);
    const onChange = (e) => setMatch(e.matches);
    mql.addEventListener?.('change', onChange);
    return () => mql.removeEventListener?.('change', onChange);
  }, [query]);
  return match;
};

// On mobile the stat cards are only ~120px wide, so long currency strings
// (e.g. "LKR 12,345,678.00") overflow at the base 25px size. Scale the font
// down as the rendered string gets longer. Desktop keeps the full 25px.
const bigStatSize = (text, isMobile) => {
  if (!isMobile) return 25;
  const len = String(text ?? '').length;
  if (len <= 10) return 21;
  if (len <= 12) return 18;
  if (len <= 14) return 16;
  if (len <= 16) return 14;
  if (len <= 18) return 12.5;
  return 11;
};

const NURSE_PALETTE = [
  { tint: '#FAEEE7', solid: '#C2603F', border: '#E6C8B9' },
  { tint: '#F2EAF5', solid: '#8C5AA6', border: '#DCC8E3' },
  { tint: '#E8F1F9', solid: '#3F77B5', border: '#C3D8EC' },
  { tint: '#E4F1ED', solid: '#137A6B', border: '#A8D4CC' },
  { tint: '#FBF3E3', solid: '#B07D2A', border: '#E0CDA0' },
];

const STATUS_META = {
  active:              { bg: '#f0fdf4', col: '#166534', dot: '#22c55e' },
  completed:           { bg: '#f8fafc', col: '#475569', dot: '#94a3b8' },
  cancelled:           { bg: '#fef2f2', col: '#991b1b', dot: '#ef4444' },
  terminated:          { bg: '#fef2f2', col: '#991b1b', dot: '#ef4444' },
  pending_termination: { bg: '#fffbeb', col: '#92400e', dot: '#f59e0b' },
  pending:             { bg: '#f8fafc', col: '#64748b', dot: '#94a3b8' },
  paused:              { bg: '#fffbeb', col: '#92400e', dot: '#f59e0b' },
};

// ─── small atoms ────────────────────────────────────────────────────────────

const Label = ({ children }) => (
  <div style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: '#9ca3af', marginBottom: 3 }}>{children}</div>
);
const Value = ({ children, mono }) => (
  <div style={{ fontSize: 13.5, fontWeight: 600, color: '#111827', fontFamily: mono ? "'JetBrains Mono',monospace" : 'inherit' }}>{children ?? '-'}</div>
);
const Field = ({ label, value, mono }) => <div><Label>{label}</Label><Value mono={mono}>{value}</Value></div>;

// Click-the-pencil inline-editable money field — used for the client/staff rate
// fields (Overview + Rates tab). `rateKey` identifies which field this is so the
// parent's single shared editingRate state knows whether this instance is the
// one currently open for editing.
const EditableRate = ({ rateKey, label, value, editingRate, onStartEdit, onChangeValue, onSave, onCancel, submitting, error, formatMoney }) => {
  const isEditing = editingRate?.key === rateKey;
  return (
    <div>
      {label && <Label>{label}</Label>}
      {isEditing ? (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input
              type="number" min="0" step="0.01" autoFocus
              value={editingRate.value}
              onChange={(e) => onChangeValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') onSave(); if (e.key === 'Escape') onCancel(); }}
              style={{ width: 110, border: '1px solid #e5e7eb', borderRadius: 6, padding: '5px 8px', fontSize: 13, fontFamily: 'inherit', outline: 'none' }}
            />
            <button type="button" onClick={onSave} disabled={submitting} title="Save" style={{ border: 'none', background: '#1e293b', borderRadius: 6, padding: 5, color: '#fff', cursor: submitting ? 'wait' : 'pointer', display: 'flex' }}>
              <Check style={{ width: 13, height: 13 }} />
            </button>
            <button type="button" onClick={onCancel} title="Cancel" style={{ border: '1px solid #e5e7eb', background: '#fff', borderRadius: 6, padding: 5, color: '#374151', cursor: 'pointer', display: 'flex' }}>
              <X style={{ width: 13, height: 13 }} />
            </button>
          </div>
          {error && <p style={{ fontSize: 11, color: '#BC4338', margin: '4px 0 0' }}>{error}</p>}
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Value>{formatMoney(value)}</Value>
          <button type="button" onClick={() => onStartEdit(rateKey, value)} title="Edit" style={{ border: 'none', background: 'transparent', padding: 2, color: '#9ca3af', cursor: 'pointer', display: 'flex' }}>
            <Pencil style={{ width: 12, height: 12 }} />
          </button>
        </div>
      )}
    </div>
  );
};

const Card = ({ children, style }) => (
  <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '18px 20px', ...style }}>{children}</div>
);
const CardTitle = ({ children }) => (
  <h3 style={{ margin: '0 0 14px', fontSize: 14, fontWeight: 700, color: '#111827' }}>{children}</h3>
);
const Empty = ({ icon: Icon, text }) => (
  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '32px 16px', textAlign: 'center', border: '1px dashed #e5e7eb', borderRadius: 8, background: '#f9fafb' }}>
    <Icon style={{ width: 20, height: 20, color: '#d1d5db' }} />
    <p style={{ marginTop: 10, fontSize: 13, color: '#9ca3af' }}>{text}</p>
  </div>
);
const Pill = ({ children, tone = 'slate' }) => {
  const map = { slate: { bg: '#f3f4f6', col: '#374151' }, green: { bg: '#f0fdf4', col: '#166534' }, amber: { bg: '#fffbeb', col: '#92400e' }, rose: { bg: '#fef2f2', col: '#991b1b' }, violet: { bg: '#f3f4f6', col: '#374151' } };
  const c = map[tone] || map.slate;
  return <span style={{ display: 'inline-block', fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 6, background: c.bg, color: c.col }}>{children}</span>;
};

// ─── main component ──────────────────────────────────────────────────────────

// Decodes the role(s) out of the admin JWT — mirrors AdminLayout.jsx's parseToken
// and authMiddleware.js's restrictTo cleanup (pg can return the role enum[] as
// either a real array or a "{ROLE1,ROLE2}" string literal).
const isSuperAdminToken = (token) => {
  if (!token) return false;
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    const rawRole = payload.role;
    const roles = Array.isArray(rawRole)
      ? rawRole.map((r) => String(r).replace(/[{}]/g, '').trim())
      : String(rawRole || '').replace(/[{}]/g, '').split(',').map((r) => r.trim());
    return roles.includes('SUPER_ADMIN');
  } catch {
    return false;
  }
};

const BookingDetailPageV2 = () => {
  const { adminToken } = useAdminAuth();
  const navigate = useNavigate();
  const { bookingId } = useParams();
  const [searchParams] = useSearchParams();
  const isMobile = useIsMobile();

  // data
  const [detail, setDetail]           = useState(null);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState('');
  const [actionLoading, setActionLoading] = useState('');
  const [statementLoading, setStatementLoading] = useState(false);
  const [simDate, setSimDate]         = useState(null);
  const [bankAccounts, setBankAccounts]   = useState([]);
  const [availableStaff, setAvailableStaff] = useState([]);
  const [mobileBookingSidebarOpen, setMobileBookingSidebarOpen] = useState(false);

  // booking notes (client_notes rows scoped to this booking — same table fed by the
  // "Client & Booking Notes" section on the staff-assignment page, see bookingNotesController)
  const [bookingNotes, setBookingNotes]           = useState([]);
  const [bookingNotesLoading, setBookingNotesLoading] = useState(false);
  const [noteText, setNoteText]                   = useState('');
  const [noteType, setNoteType]                   = useState('GENERAL');
  const [noteSubmitting, setNoteSubmitting]       = useState(false);
  const [noteError, setNoteError]                 = useState('');
  const [editingNoteId, setEditingNoteId]         = useState(null);
  const [editNoteText, setEditNoteText]           = useState('');
  const [editNoteType, setEditNoteType]           = useState('GENERAL');

  // nav
  const [activeSection, setActiveSection] = useState(searchParams.get('section') || 'care-timeline');

  // payment form
  const [paymentForm, setPaymentForm]         = useState(initialPaymentForm);
  const [paymentSlipFile, setPaymentSlipFile] = useState(null);
  const [paymentSubmitting, setPaymentSubmitting] = useState(false);

  // payment receipts (keyed by booking_payment_id)
  const [receipts, setReceipts]               = useState([]);
  const [receiptBusy, setReceiptBusy]         = useState('');
  const [showReceiptSendPopup, setShowReceiptSendPopup] = useState(false);
  const [receiptSendBusy, setReceiptSendBusy] = useState(false);

  // wallet payoff
  const [walletPayoffAmount, setWalletPayoffAmount]       = useState('');
  const [walletPayoffNotes, setWalletPayoffNotes]         = useState('');
  const [walletPayoffSubmitting, setWalletPayoffSubmitting] = useState(false);
  const [walletPayoffError, setWalletPayoffError]         = useState('');

  // inline rate editing (client billing rate on `bookings`, staff pay rate on
  // `booking_staff_assignments`) — one shared editor since only one field is
  // ever open at a time. rateKey shapes: 'client_daily' | 'client_shift' |
  // 'client_ot' | `staff_${assignment_id}`.
  const [editingRate, setEditingRate]         = useState(null); // { key, value }
  const [rateSubmitting, setRateSubmitting]   = useState(false);
  const [rateError, setRateError]             = useState('');

  // swap modal
  const [showSwapModal, setShowSwapModal]             = useState(false);
  const [swapModalStep, setSwapModalStep]             = useState(1);
  const [swapModalSearch, setSwapModalSearch]         = useState('');
  const [swapModalSelectedStaff, setSwapModalSelectedStaff] = useState(null);
  const [swapModalReason, setSwapModalReason]         = useState('');
  const [swapModalStartDate, setSwapModalStartDate]   = useState(toDateInput(new Date()));
  const [swapModalSubmitting, setSwapModalSubmitting] = useState(false);
  const [swapModalError, setSwapModalError]           = useState('');
  const [swapModalPage, setSwapModalPage]             = useState(1);
  const [swapModalDesignation, setSwapModalDesignation] = useState('');
  const [swapModalSlotId, setSwapModalSlotId]         = useState(null); // set => modal targets a shift slot, not the whole booking
  const [swapModalIsAssign, setSwapModalIsAssign]     = useState(false); // true => slot has no current staff (assign, not reassign)
  const [swapModalOldOutTime, setSwapModalOldOutTime] = useState(''); // HH:mm — outgoing staff's out time on swapModalStartDate (optional)
  const [swapModalNewInTime, setSwapModalNewInTime]   = useState(''); // HH:mm — incoming staff's in time on swapModalStartDate (optional)
  // Sharing a candidate's profile with the client happens straight from the staff
  // picker — it's a "show the client who's available" step, independent of whether
  // this staff member ends up being the one assigned.
  const [profileSendingId, setProfileSendingId] = useState(null);   // staff_profile_id currently being sent
  const [profileSentIds, setProfileSentIds]     = useState([]);     // staff sent to the client while this modal has been open
  const [profileSendError, setProfileSendError] = useState('');

  // edit times modal — backfills/corrects an assignment's start-day in_time and/or
  // end-day out_time directly (past, present or already-completed rows all use this)
  const [editTimesRow, setEditTimesRow]               = useState(null);
  const [editTimesIn, setEditTimesIn]                 = useState('');
  const [editTimesOut, setEditTimesOut]                = useState('');
  const [editTimesSubmitting, setEditTimesSubmitting] = useState(false);
  const [editTimesError, setEditTimesError]           = useState('');

  // reschedule modal — moves one shift occurrence to a different date, with an
  // optional staff change for the makeup occurrence
  const [showRescheduleModal, setShowRescheduleModal]       = useState(false);
  const [rescheduleModalSlotId, setRescheduleModalSlotId]   = useState(null);
  const [rescheduleModalDate, setRescheduleModalDate]       = useState('');
  const [rescheduleModalTime, setRescheduleModalTime]       = useState('');
  const [rescheduleModalChangeStaff, setRescheduleModalChangeStaff] = useState(false);
  const [rescheduleModalStaffId, setRescheduleModalStaffId] = useState('');
  const [rescheduleModalStaffSearch, setRescheduleModalStaffSearch] = useState('');
  const [rescheduleModalReason, setRescheduleModalReason]   = useState('');
  const [rescheduleModalSubmitting, setRescheduleModalSubmitting] = useState(false);
  const [rescheduleModalError, setRescheduleModalError]     = useState('');

  // manual overdue flag — SHIFT_BASED only, no automatic cron detection for this model
  const [showOverdueModal, setShowOverdueModal]         = useState(false);
  const [overdueModalDate, setOverdueModalDate]         = useState('');
  const [overdueModalReason, setOverdueModalReason]     = useState('');
  const [overdueModalSubmitting, setOverdueModalSubmitting] = useState(false);
  const [overdueModalError, setOverdueModalError]       = useState('');
  const [resolveOverdueBusy, setResolveOverdueBusy]     = useState(false);

  // scheduled actions for this booking (terminations, completions, swaps, etc.)
  const [bookingScheduledActions, setBookingScheduledActions] = useState([]);

  // pause / resume (LIVE_IN, SHIFT_BASED only)
  const [bookingPauses, setBookingPauses]           = useState([]);
  const [showPauseModal, setShowPauseModal]         = useState(false);
  const [pauseResumeDate, setPauseResumeDate]       = useState('');
  const [pauseReason, setPauseReason]               = useState('');
  const [pauseModalBusy, setPauseModalBusy]         = useState(false);
  const [pauseModalError, setPauseModalError]       = useState('');
  const [resumeBusy, setResumeBusy]                 = useState(false);
  const [resumeError, setResumeError]               = useState('');
  // Only relevant when the booking already has a scheduled TERMINATION/COMPLETION and
  // the admin gives a fixed resume date — that old date is stale once paused.
  const [pauseEndDateAction, setPauseEndDateAction] = useState('RESCHEDULE'); // 'RESCHEDULE' | 'CLEAR'
  const [pauseNewEndDate, setPauseNewEndDate]       = useState('');

  // Post-resume staff (re)assignment modal — replaces navigating to the standalone
  // staff-assignment page: does the same LIVE_IN/SHIFT_BASED assignment, pre-filled
  // with whoever was on the booking before it was paused.
  const [showResumeAssignModal, setShowResumeAssignModal] = useState(false);
  const [resumeAssignLoading, setResumeAssignLoading]     = useState(false);
  const [resumeAssignSubmitting, setResumeAssignSubmitting] = useState(false);
  const [resumeAssignError, setResumeAssignError]         = useState('');
  const [resumeAssignStaff, setResumeAssignStaff]         = useState([]); // available_staff list
  const [resumeAssignForm, setResumeAssignForm]           = useState({
    staff_profile_id: '', service_start_date: '', service_start_time: '',
    daily_rate: '', ot_rate: '', notes: '', salesperson_id: '',
  });
  const [resumeShiftSlots, setResumeShiftSlots] = useState([]);

  // shift patterns + per-shift assignment (SHIFT_BASED only)
  const [shiftPattern, setShiftPattern]               = useState(null); // { active, scheduled }
  const [shiftSlots, setShiftSlots]                   = useState([]);
  const [patternHistory, setPatternHistory]           = useState([]);
  const [showPatternModal, setShowPatternModal]       = useState(false);
  const [patternModalShiftCount, setPatternModalShiftCount] = useState(2);
  const [patternModalSlots, setPatternModalSlots]     = useState([]); // [{shift_number, start_time, duration_hours, label}]
  const [patternModalEffectiveDate, setPatternModalEffectiveDate] = useState(toDateInput(new Date()));
  const [patternModalSubmitting, setPatternModalSubmitting] = useState(false);
  const [patternModalError, setPatternModalError]     = useState('');
  const [showPatternHistory, setShowPatternHistory]   = useState(false);

  // salesperson
  const [salesData, setSalesData]                 = useState(null); // { current, origin, history }
  const [salespersonsList, setSalespersonsList]   = useState([]);
  const [salesActionId, setSalesActionId]         = useState('');
  const [salesActionReason, setSalesActionReason] = useState('');
  const [salesActionBusy, setSalesActionBusy]     = useState(false);
  const [salesActionError, setSalesActionError]   = useState('');

  // settlement / actions
  const [actualEndTime, setActualEndTime]   = useState(toDTLocal(new Date()));
  const [reason, setReason]                 = useState('');
  const [settlementAction, setSettlementAction] = useState('WALLET_DEPOSIT');
  const [settlementNote, setSettlementNote] = useState('');

  // actions modal
  const [showActionsModal, setShowActionsModal]     = useState(false);
  const [actionsModalStep, setActionsModalStep]     = useState(1);
  const [actionsModalMode, setActionsModalMode]     = useState(null);
  const [actionsModalLoading, setActionsModalLoading] = useState(false);
  const [actionsModalError, setActionsModalError]   = useState('');

  // termination request approve/reject modal — { mode: 'approve'|'reject', request } | null
  const [termModal, setTermModal]                 = useState(null);
  const [termFinalEndDate, setTermFinalEndDate]   = useState('');
  const [termSettlementAction, setTermSettlementAction] = useState('WALLET_DEPOSIT');
  const [termSettlementNote, setTermSettlementNote] = useState('');
  const [termRejectReason, setTermRejectReason]   = useState('');
  const [termModalLoading, setTermModalLoading]   = useState(false);
  const [termModalError, setTermModalError]       = useState('');

  // statement
  const [statementStartDate, setStatementStartDate] = useState(toDateInput(addDays(new Date(), -30)));
  const [statementEndDate, setStatementEndDate]     = useState(toDateInput(new Date()));
  const [statementPreview, setStatementPreview]     = useState(null);
  const [statementPreviewLoading, setStatementPreviewLoading] = useState(false);

  // daily attendance / manual invoicing
  const [attendanceRecords, setAttendanceRecords]   = useState([]);
  const [attendanceHistory, setAttendanceHistory]   = useState([]);
  const [dailyInvoiceRecords, setDailyInvoiceRecords] = useState([]);
  const [shiftReschedules, setShiftReschedules]     = useState([]);
  const [reschedulesBusy, setReschedulesBusy]       = useState('');
  const [reschedulesError, setReschedulesError]     = useState('');
  const [dayModal, setDayModal]                     = useState(null); // { dateISO, dayNum }
  const [dayModalError, setDayModalError]           = useState('');
  const [attendanceInputs, setAttendanceInputs]      = useState({}); // assignment_id -> { in_time, out_time }
  const [editingAttendanceIds, setEditingAttendanceIds] = useState(() => new Set()); // assignment_ids re-opened for correction after saving, pre-salary-decision
  const [invoiceAmountInput, setInvoiceAmountInput]  = useState('');
  const [invoiceAmountInputsBySlot, setInvoiceAmountInputsBySlot] = useState({}); // shift_slot_id -> amount string
  const [salaryAmountInputs, setSalaryAmountInputs] = useState({}); // assignment_id -> amount string

  // Day-draft staging (Draft -> Preview -> Confirm): everything entered in the Day
  // Detail modal below is cached into these local maps + a backend-persisted
  // booking_day_drafts row (see dailyDraftController.js) — nothing here is a real
  // staff_daily_attendance/booking_daily_invoices row, no wallet/invoice transaction
  // exists, until confirmDay() is called.
  const [dayModalStep, setDayModalStep] = useState('edit'); // 'edit' | 'preview'
  const [draftTimeSaved, setDraftTimeSaved] = useState({}); // assignment_id -> { service_date, in_time (ISO), out_time (ISO), hours_served, shift_slot_id, reschedule_id }
  const [draftAbsent, setDraftAbsent] = useState({}); // assignment_id -> { shift_slot_id, reschedule_id, notes }
  const [draftSalaryDecisions, setDraftSalaryDecisions] = useState({}); // assignment_id -> { approve, amount }
  const [draftInvoiceDecisions, setDraftInvoiceDecisions] = useState({}); // key ('day' | shift_slot_id) -> { approve, amount, shift_slot_id, reschedule_id }
  const [draftWaives, setDraftWaives] = useState({}); // shift_slot_id -> { assignment_id, reschedule_id }
  const [confirmDayBusy, setConfirmDayBusy] = useState(false);
  const [draftDates, setDraftDates] = useState(() => new Set()); // service_date strings on this booking with an unconfirmed draft (CareTimeline badge)
  const [invoicingModeSaving, setInvoicingModeSaving] = useState(false);
  const [hospitalizationSaving, setHospitalizationSaving] = useState(false);
  const [hospitalNameDraft, setHospitalNameDraft] = useState('');
  const [hospitalNameDraftTouched, setHospitalNameDraftTouched] = useState(false);

  // ── derived ──────────────────────────────────────────────────────────────

  const bookingSummary  = detail?.booking_summary        || {};
  const clientDetails   = detail?.client_details         || {};
  const patientDetails  = detail?.patient_details        || {};
  const currentStaff    = detail?.current_staff          || {};
  const paymentSummary  = detail?.payment_summary        || {};
  const invoiceSummary  = detail?.invoice_summary        || {};
  const paymentHistory  = Array.isArray(detail?.payment_history)         ? detail.payment_history         : [];
  const staffHistory    = Array.isArray(detail?.staff_assignment_history) ? detail.staff_assignment_history : [];
  const swapHistory     = Array.isArray(detail?.swap_history)            ? detail.swap_history            : [];
  const terminationReqs = Array.isArray(detail?.termination_requests)    ? detail.termination_requests    : [];
  const hospitalizationPeriods = Array.isArray(detail?.hospitalization_periods) ? detail.hospitalization_periods : [];
  const isShiftBased    = bookingSummary.service_model === 'SHIFT_BASED';

  const activeStaffRow = staffHistory.find(r => (r.status || '').toLowerCase() === 'active') || staffHistory[0] || null;
  // All currently-active assignments — for SHIFT_BASED this can be several (one per
  // shift slot), each with its own independently-editable pay rate. Used by the Rates tab.
  const activeAssignments = staffHistory.filter(r => (r.status || '').toLowerCase() === 'active');

  const normCurrentStaff = currentStaff?.staff_name || currentStaff?.full_name || currentStaff?.name
    ? { name: currentStaff.staff_name || currentStaff.full_name || currentStaff.name || '-', id: currentStaff.staff_code || currentStaff.staff_profile_id || '-', mobile: currentStaff.staff_mobile || currentStaff.mobile || '-', email: currentStaff.staff_email || currentStaff.email || '-', designation: currentStaff.designation || currentStaff.staff_designation || '-' }
    : activeStaffRow
      ? { name: activeStaffRow.full_name || activeStaffRow.staff_name || '-', id: activeStaffRow.staff_code || activeStaffRow.staff_profile_id || '-', mobile: activeStaffRow.staff_mobile || activeStaffRow.mobile || '-', email: activeStaffRow.staff_email || activeStaffRow.email || '-', designation: activeStaffRow.designation || '-' }
      : null;

  const normPayments = paymentHistory.map(p => ({
    id: p.payment_id || p.id, date: p.payment_date || p.verified_at || p.created_at,
    amount: p.amount_received ?? p.amount ?? 0, method: p.payment_method || p.method || '-',
    reference: p.reference_number || p.reference || p.receipt_no || '-',
    notes: p.notes || '-', slipUrl: p.slip_url || null,
  }));

  // Map each payment row (booking_payment_id) to its generated receipt, if any.
  const receiptByPayment = useMemo(() => {
    const m = {};
    receipts.forEach(r => { if (r.booking_payment_id) m[r.booking_payment_id] = r; });
    return m;
  }, [receipts]);

  const normStaffHistory = staffHistory.map(r => ({
    id: r.assignment_id || r.id, name: r.full_name || r.staff_name || '-',
    staffId: r.staff_code || r.staff_profile_id || '-', colorKey: r.staff_profile_id || r.id,
    designation: r.designation || '-', currentStatus: r.current_status || r.status || '-',
    startDate: r.service_start_date || r.assigned_at || r.created_at,
    endDate: r.service_end_date || r.ended_at || r.end_date,
    dailyRate: r.daily_rate ?? r.rate ?? 0, amountAllocated: r.amount_allocated ?? 0,
    shiftSlotId: r.shift_slot_id || null,
  }));

  const normSwapHistory = swapHistory.map(s => ({
    id: s.swap_id || s.id, oldStaffName: s.old_staff_name || s.from_staff_name || '-',
    newStaffName: s.new_staff_name || s.to_staff_name || '-', swappedAt: s.swapped_at || s.created_at,
    reason: s.swap_reason || s.reason || null, billingGap: Boolean(s.billing_gap),
    swappedByMobile: s.swapped_by_mobile || null,
  }));

  const totalPaid     = Number(paymentSummary.total_paid    ?? 0);
  const totalInvoiced = Number(invoiceSummary.total_invoiced ?? 0);
  // Money actually available to fund upcoming days/shifts — nets out the
  // registration fee (which totalPaid includes but which was never meant to
  // cover service days) and folds in the client's current wallet balance.
  // Falls back to totalPaid - totalInvoiced for older API responses that
  // don't send this field yet.
  const fundedForService = paymentSummary.funded_for_service != null
    ? Number(paymentSummary.funded_for_service)
    : totalPaid - totalInvoiced;
  // Reserved specifically for this booking — what the admin is asked to settle if
  // it ends early. The rest of fundedForService is unearmarked wallet money that
  // any of the client's bookings may draw on.
  const walletEarmarked = Number(paymentSummary.wallet_earmarked ?? 0);
  const dailyRate     = Number(bookingSummary.quote_daily_rate || bookingSummary.daily_rate || 0);

  // Daily attendance / manual invoicing: SHIFT_BASED/VISITING bookings are always
  // manual for both salary and client invoicing. LIVE_IN staff salary auto-pays via
  // the cron for every full middle day, but the cron now leaves the assignment's
  // first and last day PENDING (see cron/dailyInvoicing.js) — so the Staff Attendance
  // table is enabled for LIVE_IN too; middle days simply render as an already-decided
  // "Salary Calculated" row (nothing to do there), and only the two boundary days
  // ever actually need the admin's Save/Absent/Pay action. LIVE_IN bookings can opt
  // into manual client invoicing via invoicing_mode.
  const isLiveIn          = bookingSummary.service_model === 'LIVE_IN';
  const invoicingMode     = bookingSummary.invoicing_mode || 'AUTO';
  const isHospitalized    = !!bookingSummary.is_hospitalized;
  const hospitalName      = bookingSummary.hospital_name || '';
  // Most recent hospitalization period's name (even after the current one has been
  // toggled off and bookingSummary.hospital_name cleared) — used to prefill the
  // input so the admin doesn't have to retype the same hospital on re-toggle.
  const lastHospitalName  = useMemo(() => {
    if (!hospitalizationPeriods.length) return '';
    const latest = [...hospitalizationPeriods].sort(
      (a, b) => new Date(b.started_date) - new Date(a.started_date)
    )[0];
    return latest?.hospital_name || '';
  }, [hospitalizationPeriods]);

  // Prefill the (currently hidden) hospital-name input with the last hospital used,
  // so re-enabling for the same hospital doesn't require retyping it. Only applies
  // while not hospitalized (that's the only state the input renders in) and only
  // until the admin actually edits the field themselves.
  useEffect(() => {
    if (isHospitalized || hospitalNameDraftTouched) return;
    setHospitalNameDraft(lastHospitalName);
  }, [isHospitalized, lastHospitalName, hospitalNameDraftTouched]);
  const manualSalaryDay   = true;
  const manualInvoiceDay  = !isLiveIn || invoicingMode === 'MANUAL';
  const dayClickEnabled   = manualSalaryDay || manualInvoiceDay;

  // Revoking a wrongly paid/invoiced day is LIVE_IN/SHIFT_BASED-only and restricted
  // to Super Admins, gated by re-entering their password (see CareTimeline's revoke
  // confirmation modal and dailyAttendanceController.revokeDays on the backend).
  const isSuperAdmin = isSuperAdminToken(adminToken);
  const revokeEnabled = (isLiveIn || isShiftBased) && isSuperAdmin;

  const revokeDays = async (targets, reason, password, settlementAction) => {
    apiClient.setToken(adminToken);
    await apiClient.revokeAttendanceDays(bookingId, { targets, reason, password, settlement_action: settlementAction });
    await Promise.all([fetchDetail(), fetchDailyRecords()]);
  };

  // VISITING is a one-time visit — its lifecycle (scheduled / due today / awaiting
  // finalization / completed) is entirely derived, not stored, so it stays in sync
  // automatically as the admin logs attendance and decides the invoice. See
  // utils/visitingBookingStatus and services/visitingBookings.js (backend auto-complete).
  const isVisiting = bookingSummary.service_model === 'VISITING';
  const visitDateISO = isVisiting ? toLocalDateStr(activeStaffRow?.service_start_date) : null;
  const visitAttendanceDecided = isVisiting && visitDateISO
    ? attendanceRecords.some(r => r.service_date?.slice(0, 10) === visitDateISO && r.salary_status !== 'PENDING')
    : false;
  const visitInvoiceDecided = isVisiting && visitDateISO
    ? dailyInvoiceRecords.some(r => r.service_date?.slice(0, 10) === visitDateISO && !r.shift_slot_id && r.status !== 'PENDING')
    : false;
  const visitingStatus = isVisiting
    ? computeVisitingStatus({
        bookingStatus: bookingSummary.status,
        visitDateISO,
        todayISO: toLocalDateStr(new Date()),
        attendanceDecided: visitAttendanceDecided,
        invoiceDecided: visitInvoiceDecided,
      })
    : null;
  const overdueAmount = totalPaid > totalInvoiced ? 0 : totalInvoiced - totalPaid;
  const remainingBalance = totalPaid - totalInvoiced;
  const walletBalance    = Number(clientDetails.wallet_balance || 0);
  const maxPayoff        = Math.min(walletBalance, overdueAmount);
  const canPayoff        = walletBalance > 0 && overdueAmount > 0;
  const statementClientId = clientDetails.client_profile_id || bookingSummary.client_profile_id || bookingSummary.client_id;
  const lastPaymentDate   = paymentSummary.last_payment_at || paymentSummary.last_payment_date || null;

  // Shift bank — SHIFT_BASED bookings are billed per shift rather than per day.
  // "Paid" is derived from money in (never stored), "used" from confirmed
  // invoices, "waived" from skipped ones — so the client can always be told
  // exactly how many of the shifts they paid for have been delivered.
  const shiftRate = Number(bookingSummary.shift_rate || 0);
  // "remaining" (shifts still fundable right now) comes straight from
  // fundedForService — already nets out the registration fee and folds in the
  // wallet. "paid" (total shifts covered so far) is used + remaining rather
  // than a separately-computed gross figure, so the two numbers can never
  // drift apart or double-count what's already been delivered.
  const shiftBank = useMemo(() => {
    if (!isShiftBased) return null;
    const used = dailyInvoiceRecords.filter(r => r.shift_slot_id && r.status === 'INVOICED').length;
    const waived = dailyInvoiceRecords.filter(r => r.shift_slot_id && r.status === 'SKIPPED').length;
    const remaining = shiftRate > 0 ? Math.floor(fundedForService / shiftRate) : 0;
    return { paid: used + remaining, used, waived, remaining };
  }, [isShiftBased, dailyInvoiceRecords, shiftRate, fundedForService]);

  // SHIFT_BASED days are worth shift_rate × shifts/day — dailyRate never applies.
  const shiftsPerDay = shiftSlots.length || 0;
  const perDayCharge = isShiftBased ? shiftRate * shiftsPerDay : dailyRate;
  const daysUsed = dailyInvoiceRecords.filter(r => !r.shift_slot_id && r.status === 'INVOICED').length;
  const paidDays = perDayCharge > 0 ? daysUsed + Math.floor(fundedForService / perDayCharge) : 0;
  // Plan length: for shift bookings the paid shifts spill onto a final partial
  // day when they don't divide evenly (e.g. 7 shifts @ 2/day = 4 days, last day
  // one shift) — ceil, so that odd shift isn't silently truncated off the plan.
  const plannedDays = useMemo(() => {
    if (isShiftBased) {
      if (!shiftRate || !shiftsPerDay || !shiftBank) return 0;
      return Math.ceil(shiftBank.paid / shiftsPerDay);
    }
    return !dailyRate ? 0 : daysUsed + Math.floor(fundedForService / dailyRate);
  }, [isShiftBased, shiftBank, shiftRate, shiftsPerDay, dailyRate, daysUsed, fundedForService]);
  const servedDays = useMemo(() => {
    // VISITING is a one-time visit — it only ever has a single service day, so
    // servedDays is always 1, not the count of calendar days elapsed since start.
    if (isVisiting) return 1;
    if (!bookingSummary.start_date) return 0;
    const today = new Date(); today.setHours(0,0,0,0);
    const s = new Date(bookingSummary.start_date); s.setHours(0,0,0,0);
    return Math.max(0, Math.floor((today - s) / 86400000) + 1);
  }, [bookingSummary.start_date, isVisiting]);

  const simServedDays = useMemo(() => {
    if (isVisiting) return simDate ? 1 : null;
    if (!simDate || !bookingSummary.start_date) return null;
    const s = new Date(bookingSummary.start_date); s.setHours(0,0,0,0);
    const e = new Date(simDate); e.setHours(0,0,0,0);
    return Math.max(0, Math.floor((e - s) / 86400000) + 1);
  }, [simDate, bookingSummary.start_date, isVisiting]);

  // Shifts elapsed (servedDays × shifts/day) — what the "Shifts served" stat and
  // shift-based overdue projections use instead of dailyRate-based day math.
  const servedShifts = servedDays * shiftsPerDay;
  const simServedShifts = simServedDays !== null ? simServedDays * shiftsPerDay : null;
  const shiftsPaidCount = shiftBank?.paid ?? 0;

  const simOutstanding = useMemo(() => {
    if (isShiftBased) {
      if (simServedShifts === null || !shiftRate) return null;
      return Math.max(0, simServedShifts * shiftRate - totalPaid);
    }
    if (simServedDays === null || !dailyRate) return null;
    return Math.max(0, simServedDays * dailyRate - totalPaid);
  }, [isShiftBased, simServedDays, simServedShifts, dailyRate, shiftRate, totalPaid]);

  // ── Forward-projected settlement balance ──────────────────────────────────
  // `remainingBalance` (totalPaid - totalInvoiced) only reflects invoicing already recorded.
  // Days between the last invoiced day and the chosen completion/termination date still need
  // to be billed, so a prepayment that exactly covers the full period through that date isn't
  // a refundable surplus — it's earmarked for those pending invoices. Project the true
  // settlement balance as the full cost of service through the target date (days served ×
  // daily rate), mirroring the backend's projection in bookingSettlement.js exactly, so the
  // frontend's settlement decision (and required-note gating) never diverges from what the
  // backend will actually validate/apply.
  const servedDaysAsOf = (dateInput) => {
    if (!bookingSummary.start_date || !dateInput) return null;
    const s = new Date(bookingSummary.start_date); s.setHours(0, 0, 0, 0);
    const e = new Date(dateInput); e.setHours(0, 0, 0, 0);
    if (isNaN(e.getTime())) return null;
    return Math.max(0, Math.floor((e - s) / 86400000) + 1);
  };
  const projectedRemainingBalanceAt = (targetDateInput) => {
    if (!targetDateInput || !dailyRate) return remainingBalance;
    const targetServedDays = servedDaysAsOf(targetDateInput);
    if (targetServedDays === null) return remainingBalance;
    return totalPaid - (targetServedDays * dailyRate);
  };
  const actionsTargetDate = actualEndTime ? actualEndTime.slice(0, 10) : toDateInput(new Date());
  const projectedRemainingBalance = projectedRemainingBalanceAt(actionsTargetDate);

  // Actual end date/time split into two plain fields for the close-out UI — combined
  // back into the datetime-local shape (YYYY-MM-DDTHH:mm) that actualEndTime expects.
  const actualEndDatePart = actualEndTime ? actualEndTime.slice(0, 10) : '';
  const actualEndTimePart = actualEndTime ? actualEndTime.slice(11, 16) : '';
  const setActualEndDatePart = (d) => setActualEndTime(d ? `${d}T${actualEndTimePart || '00:00'}` : '');
  const setActualEndTimePart = (t) => setActualEndTime(actualEndDatePart ? `${actualEndDatePart}T${t || '00:00'}` : (t ? `${toDateInput(new Date())}T${t}` : ''));
  const termProjectedRemainingBalance = projectedRemainingBalanceAt(termFinalEndDate);

  const staffColorMap = useMemo(() => {
    const map = new Map();
    const sorted = [...staffHistory].sort((a, b) => new Date(a.service_start_date || 0) - new Date(b.service_start_date || 0));
    let idx = 0;
    sorted.forEach(a => { const id = a.staff_profile_id || a.id; if (id && !map.has(id)) { map.set(id, NURSE_PALETTE[idx++ % NURSE_PALETTE.length]); } });
    return map;
  }, [staffHistory]);

  const sortedAllocationHistory = useMemo(() => {
    const sorted = [...normStaffHistory].sort((a, b) => new Date(a.startDate) - new Date(b.startDate));
    const bookingStart = bookingSummary.start_date ? new Date(bookingSummary.start_date) : null;
    if (bookingStart) bookingStart.setHours(0,0,0,0);
    return sorted.map(row => {
      const effectiveEnd = row.endDate || null;
      const startD = row.startDate ? new Date(row.startDate) : null; if (startD) startD.setHours(0,0,0,0);
      const endD = effectiveEnd ? new Date(effectiveEnd) : null; if (endD) endD.setHours(0,0,0,0);
      const dayStart = bookingStart && startD ? Math.max(1, Math.floor((startD - bookingStart) / 86400000) + 1) : null;
      const dayEnd   = bookingStart && endD   ? Math.max(1, Math.floor((endD - bookingStart) / 86400000) + 1)   : null;
      return { ...row, effectiveEnd, dayStart, dayEnd, dayCount: dayStart !== null && dayEnd !== null ? dayEnd - dayStart + 1 : null, isOngoing: !effectiveEnd, color: staffColorMap.get(row.colorKey) || null };
    });
  }, [normStaffHistory, bookingSummary.start_date, staffColorMap]);

  // ── effects ──────────────────────────────────────────────────────────────

  useEffect(() => { if (adminToken && bookingId) { fetchDetail(); fetchDailyRecords(); fetchSalesperson(); fetchReceipts(); fetchBookingNotes(); } }, [adminToken, bookingId]);
  // Re-run after any action that can create/cancel a scheduled_actions row (complete,
  // terminate, shift pattern change, staff swap/reassign) — not just on mount — otherwise
  // a newly scheduled event (e.g. a future completion date) never reaches CareTimeline
  // until the page is manually refreshed.
  const fetchScheduledActions = () => {
    if (!adminToken || !bookingId) return;
    apiClient.setToken(adminToken);
    return apiClient.getBookingScheduledEvents(bookingId)
      .then(r => setBookingScheduledActions(r?.data || []))
      .catch(() => {});
  };
  useEffect(() => { fetchScheduledActions(); }, [adminToken, bookingId]);
  const fetchBookingPauses = () => {
    if (!adminToken || !bookingId) return;
    apiClient.setToken(adminToken);
    return apiClient.getBookingPauses(bookingId)
      .then(r => setBookingPauses(r?.data || []))
      .catch(() => {});
  };
  useEffect(() => { fetchBookingPauses(); }, [adminToken, bookingId]);
  useEffect(() => { if (detail) setSettlementAction(remainingBalance > 0 ? 'WALLET_DEPOSIT' : 'NO_REFUND'); }, [detail, remainingBalance]);
  useEffect(() => {
    if (!adminToken) return;
    apiClient.setToken(adminToken);
    apiClient.getBankAccounts().then(r => setBankAccounts(r?.data || [])).catch(() => {});
  }, [adminToken]);
  // Not gated on activeSection === 'staff' — the replacement-staff pickers in the
  // Reschedule/Cover Shift modal (opened from the Day Detail modal on the Overview
  // tab) and the shift pattern modal need this list too, so it must be available
  // regardless of which tab is active when those modals are opened.
  useEffect(() => {
    if (!adminToken) return;
    apiClient.setToken(adminToken);
    // Deliberately unfiltered by current_status: bulk-migrated staff sit at
    // UNAVAILABLE (see bulkImportController) and staff on another booking sit at
    // ASSIGNED, but both are still valid swap/assign candidates as long as they have
    // no genuine date-overlapping commitment — the backend (swapStaff/assignStaffToSlot)
    // already re-checks that at write time, so the picker just needs to list everyone.
    apiClient.getAllStaff({ limit: 1000, page: 1 }).then(r => setAvailableStaff(r?.data || [])).catch(() => {});
  }, [adminToken]);

  // Batched schedule lookup for the staff-picker UIs below (swap modal + shift
  // pattern modal) — lets the admin see each candidate's existing/upcoming
  // commitments before assigning/swapping/reassigning them onto this booking.
  const [staffSchedules, setStaffSchedules] = useState({});
  const [staffSchedulesLoading, setStaffSchedulesLoading] = useState(false);
  useEffect(() => {
    const ids = new Set(availableStaff.map(s => s.staff_profile_id));
    shiftSlots.forEach(s => { if (s.assignment) ids.add(s.assignment.staff_profile_id); });
    const idList = [...ids];
    if (idList.length === 0) { setStaffSchedules({}); return; }
    setStaffSchedulesLoading(true);
    apiClient.getStaffSchedules(idList)
      .then(r => setStaffSchedules(r?.data || {}))
      .catch(() => setStaffSchedules({}))
      .finally(() => setStaffSchedulesLoading(false));
  }, [availableStaff, shiftSlots]);
  useEffect(() => {
    if (!adminToken || activeSection !== 'salesperson') return;
    apiClient.setToken(adminToken);
    apiClient.getSalespersons().then(r => setSalespersonsList(r?.data || [])).catch(() => {});
  }, [adminToken, activeSection]);
  useEffect(() => {
    if (!statementClientId || !adminToken) return;
    let cancelled = false;
    (async () => {
      setStatementPreviewLoading(true);
      try {
        apiClient.setToken(adminToken);
        const res = await apiClient.getClientStatement(statementClientId, { start_date: statementStartDate, end_date: statementEndDate });
        if (!cancelled) setStatementPreview(res);
      } catch { if (!cancelled) setStatementPreview(null); }
      finally { if (!cancelled) setStatementPreviewLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [statementClientId, statementStartDate, statementEndDate, adminToken]);

  useEffect(() => {
    if (!adminToken || !bookingId || !isShiftBased) return;
    fetchShiftData();
  }, [adminToken, bookingId, isShiftBased]);

  const fetchShiftData = async () => {
    try {
      apiClient.setToken(adminToken);
      const [patternRes, slotsRes] = await Promise.all([
        apiClient.getShiftPattern(bookingId),
        apiClient.getShiftSlots(bookingId),
      ]);
      setShiftPattern(patternRes?.data || null);
      setShiftSlots(Array.isArray(slotsRes?.data) ? slotsRes.data : []);
    } catch {
      // non-fatal — the staff tab still renders the rest of the booking
    }
  };

  const fetchPatternHistory = async () => {
    try {
      apiClient.setToken(adminToken);
      const res = await apiClient.getShiftPatternHistory(bookingId);
      setPatternHistory(Array.isArray(res?.data) ? res.data : []);
    } catch {
      setPatternHistory([]);
    }
  };

  // ── actions ──────────────────────────────────────────────────────────────

  const fetchDetail = async () => {
    try {
      setLoading(true); setError('');
      if (!adminToken) { setError('Admin authentication required'); return; }
      apiClient.setToken(adminToken);
      const res = await apiClient.getAdminBookingDetail(bookingId);
      const payload = res?.data ?? res;
      if (payload?.status === 'success') setDetail(payload.data || {});
      else if (payload && typeof payload === 'object' && !payload.status) setDetail(payload);
      else setError(payload?.message || 'Failed to load booking detail');
    } catch (err) { setError(err?.message || 'Unable to load booking detail'); }
    finally { setLoading(false); }
  };

  const fetchBookingNotes = async () => {
    try {
      setBookingNotesLoading(true);
      apiClient.setToken(adminToken);
      const res = await apiClient.getBookingNotes(bookingId);
      setBookingNotes(res.data || []);
    } catch {
      // non-fatal
    } finally {
      setBookingNotesLoading(false);
    }
  };

  const handleAddBookingNote = async () => {
    if (!noteText.trim()) return;
    try {
      setNoteSubmitting(true); setNoteError('');
      apiClient.setToken(adminToken);
      const res = await apiClient.addBookingNote(bookingId, { note_text: noteText, note_type: noteType });
      setBookingNotes((prev) => [res.data, ...prev]);
      setNoteText(''); setNoteType('GENERAL');
    } catch (err) {
      setNoteError(err.message || 'Failed to add note');
    } finally {
      setNoteSubmitting(false);
    }
  };

  const handleDeleteBookingNote = async (noteId) => {
    try {
      apiClient.setToken(adminToken);
      await apiClient.deleteBookingNote(bookingId, noteId);
      setBookingNotes((prev) => prev.filter((n) => n.note_id !== noteId));
    } catch (err) {
      setNoteError(err.message || 'Failed to delete note');
    }
  };

  const startEditBookingNote  = (note) => { setEditingNoteId(note.note_id); setEditNoteText(note.note_text); setEditNoteType(note.note_type); };
  const cancelEditBookingNote = ()     => { setEditingNoteId(null); setEditNoteText(''); setEditNoteType('GENERAL'); };

  const handleSaveBookingNoteEdit = async (noteId) => {
    if (!editNoteText.trim()) return;
    try {
      apiClient.setToken(adminToken);
      const res = await apiClient.updateBookingNote(bookingId, noteId, { note_text: editNoteText, note_type: editNoteType });
      setBookingNotes((prev) => prev.map((n) => (n.note_id === noteId ? res.data : n)));
      cancelEditBookingNote();
    } catch (err) {
      setNoteError(err.message || 'Failed to update note');
    }
  };

  const fetchReceipts = async () => {
    try {
      if (!adminToken) return;
      apiClient.setToken(adminToken);
      const res = await apiClient.getBookingReceipts(bookingId);
      setReceipts(Array.isArray(res?.receipts) ? res.receipts : []);
    } catch {
      // non-fatal — payments still render without receipt links
    }
  };

  const handleSendReceipt = async (receiptId) => {
    try {
      setReceiptBusy(receiptId); setError('');
      apiClient.setToken(adminToken);
      await apiClient.sendPaymentReceipt(receiptId);
      await fetchReceipts();
    } catch (err) { setError(err?.message || 'Failed to send receipt'); }
    finally { setReceiptBusy(''); }
  };

  const handleSendLatestReceipt = async () => {
    setReceiptSendBusy(true);
    try {
      apiClient.setToken(adminToken);
      const res = await apiClient.getBookingReceipts(bookingId);
      const fresh = Array.isArray(res?.receipts) ? res.receipts : [];
      setReceipts(fresh);
      const latest = fresh[0];
      if (latest) {
        await apiClient.sendPaymentReceipt(latest.receipt_id);
        const res2 = await apiClient.getBookingReceipts(bookingId);
        setReceipts(Array.isArray(res2?.receipts) ? res2.receipts : []);
      }
      setShowReceiptSendPopup(false);
    } catch (err) {
      setError(err?.message || 'Failed to send receipt');
      setShowReceiptSendPopup(false);
    } finally {
      setReceiptSendBusy(false);
    }
  };

  const fetchDailyRecords = async () => {
    try {
      apiClient.setToken(adminToken);
      // Always fetched (not gated on isShiftBased) — bookingSummary may not have
      // resolved yet on the very first call, and this query is a cheap no-op
      // for non-shift bookings anyway (no shift_slot_id rows to match).
      const [attRes, invRes, rescheduleRes, historyRes, draftsRes] = await Promise.all([
        apiClient.getBookingAttendance(bookingId),
        apiClient.getBookingDailyInvoices(bookingId),
        apiClient.getBookingShiftReschedules(bookingId),
        apiClient.getAttendanceHistory(bookingId),
        apiClient.getBookingDayDrafts(bookingId),
      ]);
      setAttendanceRecords(Array.isArray(attRes?.data) ? attRes.data : []);
      setDailyInvoiceRecords(Array.isArray(invRes?.data) ? invRes.data : []);
      setShiftReschedules(Array.isArray(rescheduleRes?.data) ? rescheduleRes.data : []);
      setAttendanceHistory(Array.isArray(historyRes?.data) ? historyRes.data : []);
      setDraftDates(new Set((Array.isArray(draftsRes?.data) ? draftsRes.data : []).map(d => d.service_date)));
    } catch {
      // non-fatal — the timeline still renders without these
    }
  };

  const fetchSalesperson = async () => {
    try {
      apiClient.setToken(adminToken);
      const res = await apiClient.getBookingSalesperson(bookingId);
      setSalesData(res?.data || null);
    } catch {
      setSalesData(null);
    }
  };

  // Credit a salesperson (if none yet) or switch the current one (pointer-only).
  const handleSalespersonAssign = async () => {
    if (!salesActionId) return;
    setSalesActionBusy(true); setSalesActionError('');
    try {
      apiClient.setToken(adminToken);
      if (salesData?.current) {
        await apiClient.switchBookingSalesperson(bookingId, salesActionId, salesActionReason.trim() || null);
      } else {
        await apiClient.creditBookingSalesperson(bookingId, salesActionId);
      }
      setSalesActionId(''); setSalesActionReason('');
      await fetchSalesperson();
    } catch (err) {
      setSalesActionError(err?.message || 'Failed to update salesperson');
    } finally {
      setSalesActionBusy(false);
    }
  };

  // Shift-slot occurrences moved away from their original date via the Reschedule
  // modal — the standing assignment is open-ended, so without this it would still
  // show up in the attendance form on the date it no longer runs on.
  const movedOriginsForDay = useMemo(() => {
    const set = new Set();
    shiftReschedules.forEach(r => set.add(`${r.shift_slot_id}__${r.original_date?.slice(0, 10)}`));
    return set;
  }, [shiftReschedules]);

  // Finds staff assignments (raw staff_assignment_history rows) covering a given date
  const getAssignmentsForDate = (dateISO) => {
    const day = new Date(dateISO); day.setHours(12, 0, 0, 0);
    return staffHistory.filter(a => {
      const start = new Date(a.service_start_date); start.setHours(0, 0, 0, 0);
      const end = a.service_end_date ? new Date(a.service_end_date) : null;
      if (end) end.setHours(23, 59, 59, 999);
      if (day < start || (end && day > end)) return false;
      // This shift's occurrence was rescheduled away from this date — it isn't
      // due here anymore, so don't let attendance/invoicing be logged against it.
      // Only the standing assignment (no reschedule_id) is excluded — a makeup
      // assignment created BY that reschedule (same-day "cover shift" included,
      // where new_date === original_date) must still show up here.
      if (a.shift_slot_id && !a.reschedule_id && movedOriginsForDay.has(`${a.shift_slot_id}__${dateISO}`)) return false;
      return true;
    });
  };

  const openDayModal = async (dateISO, dayNum) => {
    const assignments = getAssignmentsForDate(dateISO);
    const inputs = {};
    const invoiceInputs = {};
    assignments.forEach(a => {
      // Prefill from the scheduled shift (SHIFT_BASED) or the assignment's own service
      // start time (VISITING/LIVE_IN) so the admin isn't typing times from scratch —
      // still a plain editable input, so they can correct it if actual times differed.
      let in_time = '', out_time = '', autoFilled = false;
      if (a.shift_start_time) {
        in_time = a.shift_start_time.slice(0, 5);
        if (a.shift_duration_hours) out_time = addHoursToTime(in_time, parseFloat(a.shift_duration_hours));
        autoFilled = true;
      } else if (a.service_start_time) {
        in_time = a.service_start_time.slice(0, 5);
        autoFilled = true;
      }
      inputs[a.assignment_id] = { date: dateISO, in_time, out_time, autoFilled };
      // Per-shift client charge prefills from bookings.shift_rate — the staff
      // assignment's daily_rate is their pay, never what the client is billed.
      if (a.shift_slot_id) invoiceInputs[a.shift_slot_id] = String(shiftRate || '');
    });
    setAttendanceInputs(inputs);
    setInvoiceAmountInputsBySlot(invoiceInputs);
    setInvoiceAmountInput(String(dailyRate || ''));
    setDayModalError('');
    setDayModalStep('edit');
    setEditingAttendanceIds(new Set());
    setDraftTimeSaved({});
    setDraftAbsent({});
    setDraftSalaryDecisions({});
    setDraftInvoiceDecisions({});
    setDraftWaives({});
    setDayModal({ dateISO, dayNum, assignments });

    // Rehydrate any cached-but-unconfirmed draft for this day (backend-persisted —
    // survives refresh/navigation, see dailyDraftController.js).
    try {
      apiClient.setToken(adminToken);
      const res = await apiClient.getDayDraft(bookingId, dateISO);
      const payload = res?.data?.payload;
      if (!payload) return;

      const timeSaved = {}, absent = {}, salaryDecisions = {}, waives = {};
      (payload.staff || []).forEach(entry => {
        if (entry.action === 'TIME') {
          timeSaved[entry.assignment_id] = {
            service_date: dateISO, in_time: entry.in_time, out_time: entry.out_time,
            hours_served: (new Date(entry.out_time) - new Date(entry.in_time)) / (1000 * 60 * 60),
            shift_slot_id: entry.shift_slot_id || null, reschedule_id: entry.reschedule_id || null,
          };
          if (entry.salary_decision) salaryDecisions[entry.assignment_id] = entry.salary_decision;
        } else if (entry.action === 'ABSENT') {
          absent[entry.assignment_id] = { shift_slot_id: entry.shift_slot_id || null, reschedule_id: entry.reschedule_id || null, notes: entry.notes };
        } else if (entry.action === 'WAIVE') {
          waives[entry.shift_slot_id] = { assignment_id: entry.assignment_id, reschedule_id: entry.reschedule_id || null };
        }
      });
      const invoiceDecisions = {};
      (payload.invoices || []).forEach(entry => {
        const key = entry.shift_slot_id || 'day';
        invoiceDecisions[key] = { approve: entry.approve, amount: entry.amount, shift_slot_id: entry.shift_slot_id || null, reschedule_id: entry.reschedule_id || null };
      });
      setDraftTimeSaved(timeSaved);
      setDraftAbsent(absent);
      setDraftSalaryDecisions(salaryDecisions);
      setDraftInvoiceDecisions(invoiceDecisions);
      setDraftWaives(waives);
    } catch {
      // no draft yet, or fetch failed — the modal just starts blank
    }
  };
  const closeDayModal = () => {
    setDayModal(null); setDayModalError(''); setAttendanceInputs({}); setInvoiceAmountInput(''); setInvoiceAmountInputsBySlot({});
    setEditingAttendanceIds(new Set()); setDayModalStep('edit');
    setDraftTimeSaved({}); setDraftAbsent({}); setDraftSalaryDecisions({}); setDraftInvoiceDecisions({}); setDraftWaives({});
  };

  // Persists the day's cached draft to the backend (booking_day_drafts) — pure cache
  // write, never touches staff_daily_attendance/booking_daily_invoices/wallets.
  // Accepts overrides for maps that just changed (state setters are async, so the
  // caller passes the just-computed next value rather than relying on stale state).
  const persistDraftWith = (overrides = {}) => {
    if (!dayModal) return;
    const timeSaved = overrides.timeSaved ?? draftTimeSaved;
    const absent = overrides.absent ?? draftAbsent;
    const salaryDecisions = overrides.salaryDecisions ?? draftSalaryDecisions;
    const invoiceDecisions = overrides.invoiceDecisions ?? draftInvoiceDecisions;
    const waives = overrides.waives ?? draftWaives;

    const staff = [];
    Object.entries(timeSaved).forEach(([assignmentId, t]) => {
      if (t.shift_slot_id && waives[t.shift_slot_id]) return;
      staff.push({
        assignment_id: assignmentId, shift_slot_id: t.shift_slot_id || null, reschedule_id: t.reschedule_id || null,
        action: 'TIME', in_time: t.in_time, out_time: t.out_time,
        salary_decision: salaryDecisions[assignmentId] || null,
      });
    });
    Object.entries(absent).forEach(([assignmentId, info]) => {
      if (info.shift_slot_id && waives[info.shift_slot_id]) return;
      staff.push({ assignment_id: assignmentId, shift_slot_id: info.shift_slot_id || null, reschedule_id: info.reschedule_id || null, action: 'ABSENT', notes: info.notes });
    });
    Object.entries(waives).forEach(([slotId, w]) => {
      staff.push({ assignment_id: w.assignment_id, shift_slot_id: slotId, reschedule_id: w.reschedule_id || null, action: 'WAIVE' });
    });

    const invoices = Object.values(invoiceDecisions).map(dec => ({
      shift_slot_id: dec.shift_slot_id || null, reschedule_id: dec.reschedule_id || null,
      action: 'DECIDE', approve: dec.approve, amount: dec.approve ? dec.amount : undefined,
    }));

    apiClient.setToken(adminToken);
    apiClient.upsertDayDraft(bookingId, { service_date: dayModal.dateISO, payload: { staff, invoices } })
      .then(() => setDraftDates(prev => new Set(prev).add(dayModal.dateISO)))
      .catch(err => setDayModalError(err?.message || 'Failed to save draft'));
  };

  // LIVE_IN staff stay with the patient continuously until the booking ends (or they're
  // swapped) — so only the booking's first day needs a start time and only its last day
  // needs an end time. Middle days (and non-boundary edits) still need both.
  const liveInBoundary = (assignment, dateISO) => {
    if (!isLiveIn || assignment.shift_slot_id) return { onlyStart: false, onlyEnd: false };
    const isFirstDay = toLocalDateStr(assignment.service_start_date) === dateISO;
    // The assignment only gets service_end_date once the termination/completion actually
    // executes (immediately for a same-day end, or overnight via the cron for a scheduled
    // future one) — until then, fall back to the still-pending scheduled date so marking
    // attendance works the same day the admin sets the end date, not just the day after.
    const isLastDay = Boolean(
      (assignment.service_end_date && toLocalDateStr(assignment.service_end_date) === dateISO) ||
      (!assignment.service_end_date && scheduledFinalization?.effective_date === dateISO)
    );
    return { onlyStart: isFirstDay && !isLastDay, onlyEnd: isLastDay && !isFirstDay };
  };

  // Validates the typed in/out time and caches it into the day's draft — does NOT
  // write staff_daily_attendance. Nothing is real until confirmDay().
  const saveAttendanceTimes = (assignment) => {
    const assignmentId = assignment.assignment_id;
    const inputs = attendanceInputs[assignmentId] || {};
    const dateISO = inputs.date || dayModal.dateISO;
    const { onlyStart, onlyEnd } = liveInBoundary(assignment, dateISO);

    if (onlyStart && !inputs.in_time) { setDayModalError('Start time is required'); return; }
    if (onlyEnd && !inputs.out_time) { setDayModalError('End time is required'); return; }
    if (!onlyStart && !onlyEnd && (!inputs.in_time || !inputs.out_time)) { setDayModalError('Both in-time and out-time are required'); return; }

    const effectiveInTime  = onlyEnd ? '00:00' : inputs.in_time;
    const effectiveOutTime = onlyStart ? '23:59' : inputs.out_time;
    const outDateISO = effectiveOutTime < effectiveInTime
      ? (() => { const d = new Date(`${dateISO}T12:00:00`); d.setDate(d.getDate() + 1); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; })()
      : dateISO;

    const in_time = new Date(`${dateISO}T${effectiveInTime}`).toISOString();
    const out_time = new Date(`${outDateISO}T${effectiveOutTime}`).toISOString();
    const hoursServed = (new Date(out_time) - new Date(in_time)) / (1000 * 60 * 60);

    setDayModalError('');
    const nextTimeSaved = {
      ...draftTimeSaved,
      [assignmentId]: {
        service_date: dateISO, in_time, out_time, hours_served: hoursServed,
        shift_slot_id: assignment.shift_slot_id || null, reschedule_id: assignment.reschedule_id || null,
      },
    };
    const nextAbsent = { ...draftAbsent }; delete nextAbsent[assignmentId];
    setDraftTimeSaved(nextTimeSaved);
    setDraftAbsent(nextAbsent);
    setEditingAttendanceIds(prev => { const next = new Set(prev); next.delete(assignmentId); return next; });
    persistDraftWith({ timeSaved: nextTimeSaved, absent: nextAbsent });
  };

  // Re-opens a cached-but-not-yet-decided in/out time for correction — nothing new
  // to persist until Save is pressed again.
  const editAttendanceTimes = (assignment) => {
    const assignmentId = assignment.assignment_id;
    const saved = draftTimeSaved[assignmentId];
    const toLocalHM = (ts) => ts ? new Date(ts).toTimeString().slice(0, 5) : '';
    setAttendanceInputs(p => ({
      ...p,
      [assignmentId]: {
        date: saved?.service_date || dayModal.dateISO,
        in_time: toLocalHM(saved?.in_time),
        out_time: toLocalHM(saved?.out_time),
        autoFilled: false,
      },
    }));
    setEditingAttendanceIds(prev => new Set(prev).add(assignmentId));
  };

  const cancelEditAttendance = (assignmentId) => {
    setEditingAttendanceIds(prev => { const next = new Set(prev); next.delete(assignmentId); return next; });
  };

  // No-show in one step — no in/out time needed. Cached as a draft entry (skips this
  // staff member's salary only, once confirmed); freely undoable before Confirm Day.
  const markAbsent = (assignment) => {
    const assignmentId = assignment.assignment_id;
    const nextAbsent = { ...draftAbsent, [assignmentId]: { shift_slot_id: assignment.shift_slot_id || null, reschedule_id: assignment.reschedule_id || null } };
    const nextTimeSaved = { ...draftTimeSaved }; delete nextTimeSaved[assignmentId];
    const nextSalary = { ...draftSalaryDecisions }; delete nextSalary[assignmentId];
    setDayModalError('');
    setDraftAbsent(nextAbsent);
    setDraftTimeSaved(nextTimeSaved);
    setDraftSalaryDecisions(nextSalary);
    setEditingAttendanceIds(prev => { const next = new Set(prev); next.delete(assignmentId); return next; });
    persistDraftWith({ absent: nextAbsent, timeSaved: nextTimeSaved, salaryDecisions: nextSalary });
  };

  const undoAbsent = (assignmentId) => {
    const nextAbsent = { ...draftAbsent }; delete nextAbsent[assignmentId];
    setDraftAbsent(nextAbsent);
    persistDraftWith({ absent: nextAbsent });
  };

  // Caches the salary approve/skip + amount decision for an already-logged day —
  // no wallet credit happens until Confirm Day.
  const decideSalary = (assignmentId, approve, defaultAmount) => {
    const overrideAmt = salaryAmountInputs[assignmentId];
    const amount = approve ? parseFloat(overrideAmt !== undefined && overrideAmt !== '' ? overrideAmt : defaultAmount) : null;
    const nextSalary = { ...draftSalaryDecisions, [assignmentId]: { approve, amount } };
    setDraftSalaryDecisions(nextSalary);
    persistDraftWith({ salaryDecisions: nextSalary });
  };

  const undoSalaryDecision = (assignmentId) => {
    const nextSalary = { ...draftSalaryDecisions }; delete nextSalary[assignmentId];
    setDraftSalaryDecisions(nextSalary);
    persistDraftWith({ salaryDecisions: nextSalary });
  };

  // Caches the client-invoice approve/skip + amount decision — no invoice
  // transaction is created until Confirm Day.
  const decideInvoice = (approve, shiftSlotId) => {
    const key = shiftSlotId || 'day';
    // A shift covered same-day by a different staff member (via the reschedule
    // mechanism, new_date === original_date) has its own reschedule-scoped invoice
    // row — must be targeted explicitly or this would collide with the slot's
    // standing (now-unused) invoice row for the same date.
    const slotAssignment = shiftSlotId ? dayModal.assignments.find(a => a.shift_slot_id === shiftSlotId) : null;
    const amount = approve ? parseFloat(shiftSlotId ? invoiceAmountInputsBySlot[shiftSlotId] : invoiceAmountInput) : null;
    const nextInvoiceDecisions = {
      ...draftInvoiceDecisions,
      [key]: { approve, amount, shift_slot_id: shiftSlotId || null, reschedule_id: slotAssignment?.reschedule_id || null },
    };
    setDraftInvoiceDecisions(nextInvoiceDecisions);
    persistDraftWith({ invoiceDecisions: nextInvoiceDecisions });
  };

  const undoInvoiceDecision = (key) => {
    const next = { ...draftInvoiceDecisions }; delete next[key];
    setDraftInvoiceDecisions(next);
    persistDraftWith({ invoiceDecisions: next });
  };

  // Caches a shift-occurrence waive — skips BOTH the client invoice and the staff's
  // pay for it once confirmed, unlike the separate invoice-Skip/salary-Skip
  // decisions above which only cover one side each.
  const waiveShift = (slotId) => {
    const slotAssignment = dayModal.assignments.find(a => a.shift_slot_id === slotId);
    if (!slotAssignment) return;
    const nextWaives = { ...draftWaives, [slotId]: { assignment_id: slotAssignment.assignment_id, reschedule_id: slotAssignment.reschedule_id || null } };
    const nextInvoiceDecisions = { ...draftInvoiceDecisions }; delete nextInvoiceDecisions[slotId];
    setDraftWaives(nextWaives);
    setDraftInvoiceDecisions(nextInvoiceDecisions);
    persistDraftWith({ waives: nextWaives, invoiceDecisions: nextInvoiceDecisions });
  };

  const undoWaive = (slotId) => {
    const next = { ...draftWaives }; delete next[slotId];
    setDraftWaives(next);
    persistDraftWith({ waives: next });
  };

  // Throws away everything cached for this day without applying anything.
  const discardDayDraft = async () => {
    if (!window.confirm('Discard everything entered for this day? This cannot be undone.')) return;
    try {
      apiClient.setToken(adminToken);
      await apiClient.discardDayDraft(bookingId, dayModal.dateISO);
      setDraftDates(prev => { const next = new Set(prev); next.delete(dayModal.dateISO); return next; });
      setDraftTimeSaved({}); setDraftAbsent({}); setDraftSalaryDecisions({}); setDraftInvoiceDecisions({}); setDraftWaives({});
      setAttendanceInputs({}); setEditingAttendanceIds(new Set());
      setDayModalStep('edit');
    } catch (err) { setDayModalError(err?.message || 'Failed to discard draft'); }
  };

  // The only action in this modal that actually moves money / writes a terminal
  // status — applies every cached entry for the day atomically (dailyDraftController.confirmDayDraft).
  const confirmDayDraft = async () => {
    try {
      setConfirmDayBusy(true); setDayModalError('');
      apiClient.setToken(adminToken);
      await apiClient.confirmDayDraft(bookingId, dayModal.dateISO);
      setDraftDates(prev => { const next = new Set(prev); next.delete(dayModal.dateISO); return next; });
      await Promise.all([fetchDailyRecords(), fetchDetail()]);
      closeDayModal();
    } catch (err) { setDayModalError(err?.message || 'Failed to confirm day'); }
    finally { setConfirmDayBusy(false); }
  };

  // Opens the reschedule modal for one shift occurrence — defaults the new
  // date to just after the booking's scheduled end, matching the backend's
  // own default assumption for where a moved shift usually lands.
  // coverMode=true (the "Cover Shift" shortcut) instead prefills the SAME date with
  // staff-change already on — reuses the same reschedule mechanism (new_date ===
  // original_date) to hand today's occurrence to a covering staff member, leaving
  // the standing assignment (and the no-show's attendance/invoice for this day)
  // untouched for every other day.
  const openRescheduleModal = (slotId, coverMode = false) => {
    // Auto-pick whoever's already holding a different shift on this booking — the
    // realistic coverer — instead of leaving the picker empty for the admin to search.
    const autoStaff = shiftSlots.find(s => s.shift_slot_id !== slotId && s.assignment);
    setRescheduleModalSlotId(slotId);
    setRescheduleModalDate(coverMode ? dayModal.dateISO : (bookingSummary.scheduled_end_time ? bookingSummary.scheduled_end_time.slice(0, 10) : toDateInput(new Date())));
    setRescheduleModalTime('');
    setRescheduleModalChangeStaff(coverMode);
    setRescheduleModalStaffId(autoStaff ? autoStaff.assignment.staff_profile_id : '');
    setRescheduleModalStaffSearch('');
    setRescheduleModalReason('');
    setRescheduleModalError('');
    setShowRescheduleModal(true);
  };
  const closeRescheduleModal = () => { setShowRescheduleModal(false); setRescheduleModalSlotId(null); setRescheduleModalStaffSearch(''); };

  // Moves a missed/upcoming shift occurrence to a different date — any date
  // within the booking — optionally handing the makeup occurrence to a
  // different staff member.
  const confirmReschedule = async () => {
    if (!rescheduleModalDate) { setRescheduleModalError('Pick a date to move this shift to'); return; }
    if (rescheduleModalChangeStaff && !rescheduleModalStaffId) { setRescheduleModalError('Select the replacement staff member'); return; }
    try {
      setRescheduleModalSubmitting(true); setRescheduleModalError('');
      apiClient.setToken(adminToken);
      await apiClient.rescheduleShiftOccurrence(bookingId, {
        shift_slot_id: rescheduleModalSlotId,
        original_date: dayModal.dateISO,
        new_date: rescheduleModalDate,
        new_start_time: rescheduleModalTime ? `${rescheduleModalTime}:00` : undefined,
        new_staff_profile_id: rescheduleModalChangeStaff ? rescheduleModalStaffId : undefined,
        reason: rescheduleModalReason.trim() || undefined,
      });
      await Promise.all([fetchDailyRecords(), fetchDetail()]);
      closeRescheduleModal();
      closeDayModal();
    } catch (err) {
      setRescheduleModalError(err?.message || 'Failed to reschedule shift');
    } finally {
      setRescheduleModalSubmitting(false);
    }
  };

  // Cancels a pending reschedule (Reschedules tab) — only allowed while
  // neither side of the makeup shift has been decided yet; the backend
  // enforces this and returns a 409 otherwise.
  const cancelReschedule = async (rescheduleId) => {
    setReschedulesBusy(rescheduleId); setReschedulesError('');
    try {
      apiClient.setToken(adminToken);
      await apiClient.cancelShiftReschedule(bookingId, rescheduleId);
      await Promise.all([fetchDailyRecords(), fetchDetail()]);
    } catch (err) { setReschedulesError(err?.message || 'Failed to cancel reschedule'); }
    finally { setReschedulesBusy(''); }
  };

  // Manual overdue flag for SHIFT_BASED bookings — the admin picks the date
  // shifts delivered started exceeding what's paid for. No automatic cron
  // detection exists for this model; the Shift Bank panel above is the trigger.
  const openOverdueModal = () => {
    setOverdueModalDate(toDateInput(new Date()));
    setOverdueModalReason('');
    setOverdueModalError('');
    setShowOverdueModal(true);
  };
  const closeOverdueModal = () => setShowOverdueModal(false);

  const confirmMarkOverdue = async () => {
    if (!overdueModalDate) { setOverdueModalError('Pick the date it went overdue'); return; }
    try {
      setOverdueModalSubmitting(true); setOverdueModalError('');
      apiClient.setToken(adminToken);
      await apiClient.markBookingOverdue(bookingId, {
        as_of_date: overdueModalDate,
        reason: overdueModalReason.trim() || undefined,
      });
      await fetchDetail();
      closeOverdueModal();
    } catch (err) {
      setOverdueModalError(err?.message || 'Failed to mark booking overdue');
    } finally {
      setOverdueModalSubmitting(false);
    }
  };

  const resolveOverdue = async () => {
    try {
      setResolveOverdueBusy(true);
      apiClient.setToken(adminToken);
      await apiClient.resolveBookingOverdue(bookingId);
      await fetchDetail();
    } catch (err) {
      window.alert(err?.message || 'Failed to resolve overdue status');
    } finally {
      setResolveOverdueBusy(false);
    }
  };

  const toggleInvoicingMode = async () => {
    const next = invoicingMode === 'AUTO' ? 'MANUAL' : 'AUTO';
    try {
      setInvoicingModeSaving(true); setError('');
      apiClient.setToken(adminToken);
      await apiClient.updateBookingInvoicingMode(bookingId, next);
      await fetchDetail();
    } catch (err) { setError(err?.message || 'Failed to update invoicing mode'); }
    finally { setInvoicingModeSaving(false); }
  };

  const toggleHospitalization = async () => {
    const next = !isHospitalized;
    try {
      setHospitalizationSaving(true); setError('');
      apiClient.setToken(adminToken);
      await apiClient.updateBookingHospitalization(bookingId, {
        is_hospitalized: next,
        hospital_name: next ? (hospitalNameDraft || null) : null,
      });
      setHospitalNameDraft('');
      // Reset the "touched" guard on turning on so the prefill-on-off-toggle logic
      // resumes (with this stay's name as the new "last hospital") the next time
      // this booking is marked not hospitalized.
      if (next) setHospitalNameDraftTouched(false);
      await fetchDetail();
    } catch (err) { setError(err?.message || 'Failed to update hospitalization status'); }
    finally { setHospitalizationSaving(false); }
  };

  const downloadStatement = async () => {
    if (!statementClientId) { setError('Client profile ID is missing'); return; }
    try {
      setStatementLoading(true);
      apiClient.setToken(adminToken);
      const res = await apiClient.downloadClientStatement(statementClientId, { start_date: statementStartDate, end_date: statementEndDate });
      const blob = res instanceof Blob ? res : new Blob([res], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `statement-${bookingSummary.booking_code || bookingId}.pdf`;
      document.body.appendChild(a); a.click(); a.remove(); window.URL.revokeObjectURL(url);
    } catch (err) { setError(err?.message || 'Failed to generate statement'); }
    finally { setStatementLoading(false); }
  };

  const handleSubmitPayment = async (e) => {
    e.preventDefault();
    try {
      setPaymentSubmitting(true); setError('');
      apiClient.setToken(adminToken);
      await apiClient.recordBookingPayment(bookingId, {
        amount_received: parseFloat(paymentForm.amount_received), payment_method: paymentForm.payment_method,
        bank_account_id: paymentForm.bank_account_id || null, cheque_number: paymentForm.cheque_number || null,
        cheque_date: paymentForm.cheque_date || null, reference_number: paymentForm.reference_number || null, notes: paymentForm.notes || null,
      }, paymentSlipFile);
      setPaymentForm(initialPaymentForm); setPaymentSlipFile(null);
      setShowReceiptSendPopup(true);
      await fetchDetail();
      // Receipt is generated asynchronously server-side; refetch shortly after.
      await fetchReceipts();
      setTimeout(fetchReceipts, 2500);
    } catch (err) { setError(err?.message || 'Failed to record payment'); }
    finally { setPaymentSubmitting(false); }
  };

  const closeSwapModal = () => { setShowSwapModal(false); setSwapModalStep(1); setSwapModalSearch(''); setSwapModalSelectedStaff(null); setSwapModalReason(''); setSwapModalError(''); setSwapModalPage(1); setSwapModalDesignation(''); setSwapModalStartDate(toDateInput(new Date())); setSwapModalSlotId(null); setSwapModalIsAssign(false); setSwapModalOldOutTime(''); setSwapModalNewInTime(''); setProfileSendingId(null); setProfileSentIds([]); setProfileSendError(''); };
  const selectSwapStaff = (s) => { setSwapModalSelectedStaff(s); setSwapModalStep(2); };
  // WhatsApp one candidate's profile to this booking's client, straight from the picker.
  // Deliberately independent of the swap itself: the admin can send several candidates
  // for the client to choose from, and can resend the same one.
  const sendStaffProfile = async (staff) => {
    try {
      setProfileSendingId(staff.staff_profile_id); setProfileSendError('');
      apiClient.setToken(adminToken);
      const res = await apiClient.sendBookingStaffProfile(bookingId, staff.staff_profile_id);
      setProfileSentIds(ids => (ids.includes(staff.staff_profile_id) ? ids : [...ids, staff.staff_profile_id]));
      // The server reports a globally disabled WhatsApp kill switch as a blocked send —
      // surface that rather than letting the tick imply the client received anything.
      if (res?.blocked) setProfileSendError(res.message || 'WhatsApp sending is currently disabled system-wide — nothing was delivered.');
    } catch (err) {
      setProfileSendError(err?.message || `Failed to send ${staff.full_name}'s profile to the client.`);
    } finally {
      setProfileSendingId(null);
    }
  };
  const openSlotAssignModal = (slot) => { setSwapModalSlotId(slot.shift_slot_id); setSwapModalIsAssign(!slot.assignment); setShowSwapModal(true); };
  const confirmSwap = async () => {
    if (!swapModalSelectedStaff || (!swapModalSlotId && !swapModalReason.trim())) return;
    try {
      setSwapModalSubmitting(true); setSwapModalError('');
      apiClient.setToken(adminToken);
      // Time-only inputs — combine with the staff start date above into a full timestamp.
      const oldOutTime = swapModalOldOutTime ? `${swapModalStartDate}T${swapModalOldOutTime}` : null;
      const newInTime = swapModalNewInTime ? `${swapModalStartDate}T${swapModalNewInTime}` : null;
      let response;
      if (swapModalSlotId) {
        response = swapModalIsAssign
          ? await apiClient.assignStaffToShiftSlot(bookingId, swapModalSlotId, { staff_profile_id: swapModalSelectedStaff.staff_profile_id, service_start_date: swapModalStartDate, notes: swapModalReason.trim() || null, staff_in_time: newInTime })
          : await apiClient.reassignShiftSlotStaff(bookingId, swapModalSlotId, { new_staff_id: swapModalSelectedStaff.staff_profile_id, effective_date: swapModalStartDate, reason: swapModalReason.trim() || null, old_staff_out_time: oldOutTime, new_staff_in_time: newInTime });
      } else {
        response = await apiClient.swapBookingStaff(bookingId, { new_staff_id: swapModalSelectedStaff.staff_profile_id, swap_reason: swapModalReason.trim(), new_staff_start_date: swapModalStartDate, old_staff_out_time: oldOutTime, new_staff_in_time: newInTime });
      }
      closeSwapModal(); await fetchDetail(); await fetchScheduledActions(); if (isShiftBased) await fetchShiftData();
      if (response?.scheduled) {
        window.alert(response.message || 'Change scheduled for the future date.');
      }
    } catch (err) { setSwapModalError(err?.message || 'Failed to update staff assignment'); }
    finally { setSwapModalSubmitting(false); }
  };

  // Backfill/correct an allocation-history row's start-day in_time and/or end-day
  // out_time — the same mechanism the swap modal uses, exposed directly on
  // already-recorded rows (past, current or scheduled) so a bulk-migrated or
  // never-logged assignment can be filled in after the fact.
  const openEditTimes = (row) => {
    const startISO = row.startDate ? row.startDate.slice(0, 10) : null;
    const endISO = row.effectiveEnd ? row.effectiveEnd.slice(0, 10) : null;
    const inRecord = startISO ? attendanceRecords.find(a => a.assignment_id === row.id && a.service_date?.slice(0, 10) === startISO) : null;
    const outRecord = endISO ? attendanceRecords.find(a => a.assignment_id === row.id && a.service_date?.slice(0, 10) === endISO) : null;
    setEditTimesRow(row);
    setEditTimesIn(inRecord?.in_time ? inRecord.in_time.slice(11, 16) : '');
    setEditTimesOut(outRecord?.out_time ? outRecord.out_time.slice(11, 16) : '');
    setEditTimesError('');
  };
  const closeEditTimes = () => { setEditTimesRow(null); setEditTimesIn(''); setEditTimesOut(''); setEditTimesError(''); };
  const saveEditTimes = async () => {
    if (!editTimesRow || (!editTimesIn && !editTimesOut)) return;
    try {
      setEditTimesSubmitting(true); setEditTimesError('');
      apiClient.setToken(adminToken);
      const startISO = editTimesRow.startDate ? editTimesRow.startDate.slice(0, 10) : null;
      const endISO = editTimesRow.effectiveEnd ? editTimesRow.effectiveEnd.slice(0, 10) : null;
      if (editTimesIn && startISO) {
        await apiClient.setAttendanceTime(bookingId, { assignment_id: editTimesRow.id, service_date: startISO, in_time: `${startISO}T${editTimesIn}`, shift_slot_id: editTimesRow.shiftSlotId || undefined });
      }
      if (editTimesOut && endISO) {
        await apiClient.setAttendanceTime(bookingId, { assignment_id: editTimesRow.id, service_date: endISO, out_time: `${endISO}T${editTimesOut}`, shift_slot_id: editTimesRow.shiftSlotId || undefined });
      }
      closeEditTimes();
      await fetchDailyRecords();
    } catch (err) { setEditTimesError(err?.message || 'Failed to save times'); }
    finally { setEditTimesSubmitting(false); }
  };

  // Inline rate editing — one editor shared across the Overview and Rates tab
  // fields (see EditableRate above). `staff_${assignment_id}` keys route to the
  // staff-assignment endpoint; the `client_*` keys route to the booking-rates one.
  const startEditRate = (key, currentValue) => { setEditingRate({ key, value: currentValue != null ? String(currentValue) : '' }); setRateError(''); };
  const cancelEditRate = () => { setEditingRate(null); setRateError(''); };
  const changeEditRateValue = (value) => setEditingRate(r => (r ? { ...r, value } : r));
  const saveEditRate = async () => {
    if (!editingRate) return;
    const num = parseFloat(editingRate.value);
    if (Number.isNaN(num) || num < 0) { setRateError('Enter a valid non-negative number'); return; }
    try {
      setRateSubmitting(true); setRateError('');
      apiClient.setToken(adminToken);
      const { key } = editingRate;
      if (key === 'client_daily') await apiClient.updateBookingRates(bookingId, { daily_rate: num });
      else if (key === 'client_shift') await apiClient.updateBookingRates(bookingId, { shift_rate: num });
      else if (key === 'client_ot') await apiClient.updateBookingRates(bookingId, { ot_rate: num });
      else if (key.startsWith('staff_')) await apiClient.updateStaffAssignment(key.slice(6), { daily_rate: num });
      setEditingRate(null);
      await fetchDetail();
    } catch (err) { setRateError(err?.message || 'Failed to update rate'); }
    finally { setRateSubmitting(false); }
  };

  const cascadeStartTimes = (slots, fromIdx = 0) => {
    const result = [...slots];
    for (let i = fromIdx; i < result.length - 1; i++) {
      const [h, m] = (result[i].start_time || '00:00').split(':').map(Number);
      const totalMins = (h * 60 + m + Math.round(parseFloat(result[i].duration_hours || 0) * 60)) % 1440;
      result[i + 1] = { ...result[i + 1], start_time: `${String(Math.floor(totalMins / 60)).padStart(2, '0')}:${String(totalMins % 60).padStart(2, '0')}` };
    }
    return result;
  };
  const buildDefaultSlots = (count) => {
    const dur = (24 / count).toFixed(1);
    const base = Array.from({ length: count }, (_, i) => ({ shift_number: i + 1, start_time: '08:00', duration_hours: dur, label: `Shift ${i + 1}`, staff_profile_id: '' }));
    return cascadeStartTimes(base, 0);
  };
  const openPatternModal = () => {
    const existing = shiftPattern?.active?.slots;
    const count = shiftPattern?.active?.shift_count || 2;
    // Seed each row's staff dropdown from who currently holds that shift number,
    // so changing the pattern doesn't silently drop existing staff — the admin
    // sees and explicitly confirms/changes who's on each shift.
    const staffByShiftNumber = new Map(shiftSlots.map(s => [s.shift_number, s.assignment]));
    setPatternModalShiftCount(count);
    setPatternModalSlots(existing?.length ? existing.map(s => ({
      shift_number: s.shift_number,
      start_time: (s.start_time || '08:00').slice(0, 5),
      duration_hours: String(s.duration_hours),
      label: s.label || `Shift ${s.shift_number}`,
      staff_profile_id: staffByShiftNumber.get(s.shift_number)?.staff_profile_id || '',
    })) : buildDefaultSlots(count));
    setPatternModalEffectiveDate(toDateInput(new Date()));
    setPatternModalError('');
    setShowPatternModal(true);
  };
  const closePatternModal = () => { setShowPatternModal(false); setPatternModalError(''); };
  const handlePatternShiftCountChange = (count) => {
    setPatternModalShiftCount(count);
    setPatternModalSlots(prev => {
      const next = buildDefaultSlots(count);
      for (let i = 0; i < Math.min(prev.length, count); i++) next[i] = prev[i];
      return next;
    });
  };
  const updatePatternSlot = (idx, field, value) => {
    setPatternModalSlots(prev => {
      const updated = prev.map((s, i) => i === idx ? { ...s, [field]: value } : s);
      return (field === 'start_time' || field === 'duration_hours') ? cascadeStartTimes(updated, idx) : updated;
    });
  };
  const submitPatternChange = async () => {
    try {
      setPatternModalSubmitting(true); setPatternModalError('');
      apiClient.setToken(adminToken);
      const response = await apiClient.createShiftPattern(bookingId, {
        shift_count: patternModalShiftCount,
        slots: patternModalSlots.map(s => ({ shift_number: s.shift_number, start_time: `${s.start_time}:00`, duration_hours: parseFloat(s.duration_hours), label: s.label || null })),
        effective_from_date: patternModalEffectiveDate,
      });
      // A pattern change always creates brand-new shift_slot_id rows — even a shift
      // that "looks the same" needs its staff re-assigned against the new slot.
      const createdSlots = response?.data?.pattern?.slots || [];
      for (const s of patternModalSlots) {
        if (!s.staff_profile_id) continue;
        const created = createdSlots.find(c => c.shift_number === s.shift_number);
        if (!created) continue;
        await apiClient.assignStaffToShiftSlot(bookingId, created.shift_slot_id, {
          staff_profile_id: s.staff_profile_id,
          service_start_date: patternModalEffectiveDate,
          notes: null,
        });
      }
      closePatternModal(); await fetchShiftData(); await fetchScheduledActions();
      if (response?.scheduled) window.alert(response.message || 'Shift pattern change scheduled for the future date.');
      if (response?.warnings?.length) window.alert(`Note: ${response.warnings.join(' ')}`);
    } catch (err) { setPatternModalError(err?.message || 'Failed to save shift pattern'); }
    finally { setPatternModalSubmitting(false); }
  };
  const togglePatternHistory = () => { if (!showPatternHistory) fetchPatternHistory(); setShowPatternHistory(v => !v); };

  // availableStaff only lists status=AVAILABLE staff, which excludes anyone already
  // assigned to this booking's current shifts — merge those back in so staff pickers
  // (shift pattern modal, reschedule/cover-shift modal) can offer someone already
  // working another shift on this same booking as a replacement/coverer, not just
  // fully-free staff.
  const staffPickerOptions = useMemo(() => {
    const map = new Map(availableStaff.map(s => [s.staff_profile_id, s]));
    shiftSlots.forEach(s => {
      if (s.assignment && !map.has(s.assignment.staff_profile_id)) {
        map.set(s.assignment.staff_profile_id, { staff_profile_id: s.assignment.staff_profile_id, full_name: s.assignment.staff_name, designation: '' });
      }
    });
    return [...map.values()].sort((a, b) => (a.full_name || '').localeCompare(b.full_name || ''));
  }, [availableStaff, shiftSlots]);
  const patternModalStaffOptions = staffPickerOptions;
  // Staff already holding a shift on this booking — the realistic "coverer" for a
  // no-show, so they're auto-selected and pinned to the top of the search results
  // in the Reschedule/Cover Shift modal instead of making the admin hunt for them.
  const onBookingStaffIds = useMemo(
    () => new Set(shiftSlots.filter(s => s.assignment).map(s => s.assignment.staff_profile_id)),
    [shiftSlots]
  );

  const handleWalletPayoff = async (e) => {
    e.preventDefault();
    const amount = parseFloat(walletPayoffAmount);
    if (!amount || amount <= 0) return;
    try {
      setWalletPayoffSubmitting(true); setWalletPayoffError('');
      apiClient.setToken(adminToken);
      await apiClient.walletPayoffBooking(bookingId, amount, walletPayoffNotes || null);
      setWalletPayoffAmount(''); setWalletPayoffNotes(''); await fetchDetail();
    } catch (err) { setWalletPayoffError(err?.message || 'Failed to process wallet payoff'); }
    finally { setWalletPayoffSubmitting(false); }
  };

  // NOTE: gating below (which step shows, whether NO_REFUND requires a note, what
  // settlement_action defaults to) uses `projectedRemainingBalance`, which mirrors the
  // backend's own projection in bookingSettlement.js exactly (same days-through-target-date ×
  // daily-rate formula) — so what the admin is asked to decide here always matches what the
  // backend will actually validate and apply, however far in the future the end date is.
  const openActionsModal = () => { setActionsModalStep(1); setActionsModalMode(null); setActionsModalError(''); setActualEndTime(toDTLocal(new Date())); setReason(''); setSettlementAction(projectedRemainingBalance > 0 ? 'WALLET_DEPOSIT' : 'NO_REFUND'); setSettlementNote(''); setShowActionsModal(true); };
  const closeActionsModal = () => { setShowActionsModal(false); setActionsModalStep(1); setActionsModalMode(null); setActionsModalError(''); };
  const handleActionsBack = () => { setActionsModalError(''); actionsModalStep === 3 && projectedRemainingBalance <= 0 ? setActionsModalStep(1) : setActionsModalStep(s => s - 1); };
  const handleActionsNext = () => {
    if (actionsModalStep === 1) { if (!actionsModalMode) return; setActionsModalStep(projectedRemainingBalance > 0 ? 2 : 3); }
    else if (actionsModalStep === 2) { if (settlementAction === 'NO_REFUND' && !settlementNote.trim()) { setActionsModalError('A settlement note is required when choosing no refund.'); return; } setActionsModalError(''); setActionsModalStep(3); }
  };
  const handleActionsSubmit = async () => {
    if (!bookingId || !actionsModalMode) return;
    try {
      setActionsModalLoading(true); setActionsModalError('');
      const payload = { actual_end_time: actualEndTime ? new Date(actualEndTime).toISOString() : new Date().toISOString(), settlement_action: projectedRemainingBalance > 0 ? settlementAction : 'NO_REFUND', settlement_note: settlementNote.trim() || null, reason: reason.trim() || `${actionsModalMode === 'complete' ? 'Completed' : 'Terminated'} via admin panel` };
      apiClient.setToken(adminToken);
      const response = actionsModalMode === 'complete'
        ? await apiClient.completeBooking(bookingId, payload)
        : await apiClient.adminTerminateBooking(bookingId, payload);
      closeActionsModal(); await fetchDetail(); await fetchScheduledActions();
      if (response?.scheduled) {
        window.alert(response.message || 'This has been scheduled for the future date. The booking stays active and billed until then.');
      }
    } catch (err) { setActionsModalError(err?.message || `Failed to ${actionsModalMode} booking`); }
    finally { setActionsModalLoading(false); }
  };

  const openPauseModal  = () => { setPauseResumeDate(''); setPauseReason(''); setPauseModalError(''); setPauseEndDateAction('RESCHEDULE'); setPauseNewEndDate(''); setShowPauseModal(true); };
  const closePauseModal = () => { setShowPauseModal(false); setPauseModalError(''); };

  // Re-suggests the new scheduled-end date whenever the resume date changes: old end
  // date pushed out by the same gap (today → resume date), so the common "just push
  // the whole thing out by however long the pause is" case needs no manual math.
  const handlePauseResumeDateChange = (val) => {
    setPauseResumeDate(val);
    const oldEnd = scheduledFinalization?.effective_date?.slice(0, 10);
    if (!val || !oldEnd) { setPauseNewEndDate(''); return; }
    const todayStr = toLocalDateStr(new Date());
    const gapDays = Math.round((new Date(`${val}T00:00:00`) - new Date(`${todayStr}T00:00:00`)) / 86400000);
    setPauseNewEndDate(Number.isFinite(gapDays) && gapDays > 0 ? toLocalDateStr(addDays(new Date(`${oldEnd}T00:00:00`), gapDays)) : oldEnd);
  };

  const handlePauseSubmit = async () => {
    if (!bookingId) return;
    try {
      setPauseModalBusy(true); setPauseModalError('');
      const needsEndDateDecision = Boolean(pauseResumeDate && scheduledFinalization);
      if (needsEndDateDecision && pauseEndDateAction === 'RESCHEDULE' && !pauseNewEndDate) {
        setPauseModalError('Enter a new end date, or choose to leave the booking active instead.');
        setPauseModalBusy(false);
        return;
      }
      apiClient.setToken(adminToken);
      await apiClient.pauseBooking(bookingId, {
        resume_date: pauseResumeDate || null,
        reason: pauseReason.trim() || null,
        ...(needsEndDateDecision ? {
          end_date_action: pauseEndDateAction,
          new_end_date: pauseEndDateAction === 'RESCHEDULE' ? pauseNewEndDate : null,
        } : {}),
      });
      closePauseModal();
      await Promise.all([fetchDetail(), fetchBookingPauses(), fetchScheduledActions()]);
    } catch (err) { setPauseModalError(err?.message || 'Failed to pause booking'); }
    finally { setPauseModalBusy(false); }
  };

  const cascadeShiftStartTimes = (slots, fromIdx = 0) => {
    const result = [...slots];
    for (let i = fromIdx; i < result.length - 1; i++) {
      const [h, m] = (result[i].start_time || '00:00').split(':').map(Number);
      const totalMins = (h * 60 + m + Math.round(parseFloat(result[i].duration_hours || 0) * 60)) % 1440;
      result[i + 1] = { ...result[i + 1], start_time: `${String(Math.floor(totalMins / 60)).padStart(2, '0')}:${String(totalMins % 60).padStart(2, '0')}` };
    }
    return result;
  };

  const buildDefaultResumeShiftSlots = (count) => {
    const dur = (24 / count).toFixed(1);
    const base = Array.from({ length: count }, (_, i) => ({
      shift_number: i + 1, start_time: '08:00', duration_hours: dur,
      label: `Shift ${i + 1}`, staff_profile_id: '', daily_rate: '',
    }));
    return cascadeShiftStartTimes(base, 0);
  };

  const handleResumeShiftCountChange = (count) => {
    setResumeShiftSlots((prev) => {
      const next = buildDefaultResumeShiftSlots(count);
      for (let i = 0; i < Math.min(prev.length, count); i++) next[i] = prev[i];
      return next;
    });
  };

  const updateResumeShiftSlot = (idx, field, value) =>
    setResumeShiftSlots((prev) => {
      const updated = prev.map((s, i) => (i === idx ? { ...s, [field]: value } : s));
      return (field === 'start_time' || field === 'duration_hours') ? cascadeShiftStartTimes(updated, idx) : updated;
    });

  const openResumeAssignModal = async (prefillShiftSlots, prefillStaff) => {
    setResumeAssignError(''); setResumeAssignLoading(true); setShowResumeAssignModal(true);
    setResumeAssignForm({
      staff_profile_id: prefillStaff?.staff_profile_id || '',
      service_start_date: toDateInput(new Date()),
      service_start_time: '', daily_rate: '', ot_rate: '', notes: '', salesperson_id: '',
    });
    setResumeShiftSlots(prefillShiftSlots?.length ? prefillShiftSlots : buildDefaultResumeShiftSlots(2));
    try {
      apiClient.setToken(adminToken);
      const [formRes, salespersonRes] = await Promise.all([
        apiClient.getBookingAssignmentFormData(bookingId),
        apiClient.getClientSalesperson(clientDetails.client_profile_id).catch(() => null),
      ]);
      setResumeAssignStaff(formRes?.data?.available_staff || []);
      setResumeAssignForm((f) => ({
        ...f,
        daily_rate: formRes?.data?.booking?.quote_daily_rate || '',
        salesperson_id: salespersonRes?.data?.current?.salesperson_id || '',
      }));
    } catch (err) {
      setResumeAssignError(err?.message || 'Failed to load assignment form');
    } finally {
      setResumeAssignLoading(false);
    }
  };
  const closeResumeAssignModal = () => { setShowResumeAssignModal(false); setResumeAssignError(''); };

  const handleResumeAssignSubmit = async () => {
    if (!resumeAssignForm.service_start_date) { setResumeAssignError('Service start date is required'); return; }
    if (isShiftBased && resumeShiftSlots.some((s) => !s.staff_profile_id || !s.start_time || !s.duration_hours)) {
      setResumeAssignError('Every shift needs a start time, duration, and assigned staff member');
      return;
    }
    if (!isShiftBased && !resumeAssignForm.staff_profile_id) { setResumeAssignError('Select a staff member'); return; }

    setResumeAssignSubmitting(true); setResumeAssignError('');
    try {
      apiClient.setToken(adminToken);
      if (isShiftBased) {
        const patternRes = await apiClient.createShiftPattern(bookingId, {
          shift_count: resumeShiftSlots.length,
          slots: resumeShiftSlots.map((s) => ({
            shift_number: s.shift_number, start_time: `${s.start_time}:00`,
            duration_hours: parseFloat(s.duration_hours), label: s.label || null,
          })),
          effective_from_date: resumeAssignForm.service_start_date,
        });
        const createdSlots = patternRes?.data?.pattern?.slots || [];
        for (const slot of resumeShiftSlots) {
          const created = createdSlots.find((c) => c.shift_number === slot.shift_number);
          if (!created) continue;
          await apiClient.assignStaffToShiftSlot(bookingId, created.shift_slot_id, {
            staff_profile_id: slot.staff_profile_id,
            service_start_date: resumeAssignForm.service_start_date,
            daily_rate: slot.daily_rate ? parseFloat(slot.daily_rate) : null,
            notes: resumeAssignForm.notes || null,
          });
        }
      } else {
        await apiClient.assignStaffToBooking(bookingId, {
          staff_profile_id: resumeAssignForm.staff_profile_id,
          service_start_date: resumeAssignForm.service_start_date,
          service_start_time: resumeAssignForm.service_start_time || null,
          assigned_hours: 24,
          daily_rate: resumeAssignForm.daily_rate ? parseFloat(resumeAssignForm.daily_rate) : null,
          ot_rate: resumeAssignForm.ot_rate ? parseFloat(resumeAssignForm.ot_rate) : null,
          notes: resumeAssignForm.notes || null,
          salesperson_id: resumeAssignForm.salesperson_id || null,
        });
      }
      if (isShiftBased && resumeAssignForm.salesperson_id) {
        try { await apiClient.creditBookingSalesperson(bookingId, resumeAssignForm.salesperson_id); } catch { /* non-fatal */ }
      }
      closeResumeAssignModal();
      await Promise.all([fetchDetail(), fetchScheduledActions(), ...(isShiftBased ? [fetchShiftData()] : [])]);
    } catch (err) {
      setResumeAssignError(err?.message || 'Failed to assign staff');
    } finally {
      setResumeAssignSubmitting(false);
    }
  };

  const handleResume = async () => {
    if (!bookingId) return;
    if (!window.confirm('Resume this booking? You\'ll then confirm staffing for the resumed period.')) return;
    try {
      setResumeBusy(true); setResumeError('');
      apiClient.setToken(adminToken);
      await apiClient.resumeBooking(bookingId);
      await Promise.all([fetchDetail(), fetchBookingPauses()]);

      // Pausing closed out whoever was assigned — nothing gets auto-reassigned, so
      // without this the admin has to remember a separate "Assign Staff" step (the
      // exact step that's easy to forget, leaving the booking ACTIVE with no one on
      // it). Carry the pre-pause staff (per shift, for SHIFT_BASED) into the modal
      // as a pre-selected starting point — still fully editable, e.g. if that staff
      // member picked up other work during the pause.
      if (isShiftBased) {
        const latestBySlot = new Map();
        staffHistory.forEach((a) => {
          if (!a.shift_slot_id) return;
          const existing = latestBySlot.get(a.shift_slot_id);
          if (!existing || new Date(a.service_start_date) > new Date(existing.service_start_date)) latestBySlot.set(a.shift_slot_id, a);
        });

        // Pausing closes the pattern out via closeActivePatternForPause (status ->
        // SUPERSEDED, effective_to_date = pause date). patternHistory (used by the
        // Pattern History panel) is fetched lazily and likely isn't loaded yet here,
        // so fetch it fresh rather than relying on possibly-stale/empty state — this
        // is what lets the actual shift times/labels be restored exactly, not just
        // rebuilt as generic evenly-split slots.
        let oldSlots = [];
        try {
          const patternHistoryRes = await apiClient.getShiftPatternHistory(bookingId);
          const patterns = Array.isArray(patternHistoryRes?.data) ? patternHistoryRes.data : [];
          const lastPattern = patterns.find((p) => p.status === 'SUPERSEDED') || null;
          oldSlots = lastPattern?.slots || [];
        } catch { /* fall back to queue-only below */ }

        if (oldSlots.length > 0) {
          const restoredSlots = [...oldSlots]
            .sort((a, b) => (a.shift_number || 0) - (b.shift_number || 0))
            .map((slot, i) => {
              const staffRow = latestBySlot.get(slot.shift_slot_id);
              return {
                shift_number: slot.shift_number || i + 1,
                start_time: (slot.start_time || '08:00').slice(0, 5),
                duration_hours: String(slot.duration_hours ?? ''),
                label: slot.label || `Shift ${slot.shift_number || i + 1}`,
                staff_profile_id: staffRow?.staff_profile_id || '',
                daily_rate: '',
              };
            });
          await openResumeAssignModal(restoredSlots, null);
        } else {
          // No pattern history found (shouldn't normally happen) — fall back to just
          // carrying the staff over into generic evenly-split default slots.
          const latest = [...latestBySlot.values()].sort((a, b) => (a.shift_number || 0) - (b.shift_number || 0));
          const queue = latest.length ? buildDefaultResumeShiftSlots(latest.length).map((s, i) => ({ ...s, staff_profile_id: latest[i]?.staff_profile_id || '' })) : null;
          await openResumeAssignModal(queue, null);
        }
      } else {
        const prev = [...staffHistory].sort((a, b) => new Date(b.service_start_date) - new Date(a.service_start_date))[0] || null;
        await openResumeAssignModal(null, prev);
      }
    } catch (err) { setResumeError(err?.message || 'Failed to resume booking'); }
    finally { setResumeBusy(false); }
  };

  const openApproveTermModal = (request) => {
    setTermModal({ mode: 'approve', request });
    const defaultEndDateIso = request.requested_end_date ? new Date(request.requested_end_date).toISOString().split('T')[0] : toDateInput(new Date());
    setTermFinalEndDate(defaultEndDateIso);
    setTermSettlementAction(projectedRemainingBalanceAt(defaultEndDateIso) > 0 ? 'WALLET_DEPOSIT' : 'NO_REFUND');
    setTermSettlementNote('');
    setTermModalError('');
  };
  const openRejectTermModal = (request) => {
    setTermModal({ mode: 'reject', request });
    setTermRejectReason('');
    setTermModalError('');
  };
  const closeTermModal = () => { setTermModal(null); setTermModalError(''); };

  const submitTermModal = async () => {
    if (!termModal) return;
    apiClient.setToken(adminToken);
    if (termModal.mode === 'approve') {
      if (termSettlementAction === 'NO_REFUND' && !termSettlementNote.trim()) {
        setTermModalError('A settlement note is required when selecting no refund.');
        return;
      }
      try {
        setTermModalLoading(true); setTermModalError('');
        const response = await apiClient.approveTerminationRequest(
          termModal.request.termination_id, termFinalEndDate, termSettlementAction, termSettlementNote.trim() || null,
        );
        closeTermModal(); await fetchDetail(); await fetchScheduledActions();
        if (response?.scheduled) {
          window.alert(response.message || 'Termination scheduled for the future date. The booking stays active and billed until then.');
        }
      } catch (err) { setTermModalError(err?.message || 'Failed to approve termination request'); }
      finally { setTermModalLoading(false); }
    } else {
      if (!termRejectReason.trim()) {
        setTermModalError('A reason is required when rejecting a termination request.');
        return;
      }
      try {
        setTermModalLoading(true); setTermModalError('');
        await apiClient.rejectTerminationRequest(termModal.request.termination_id, termRejectReason.trim());
        closeTermModal(); await fetchDetail();
      } catch (err) { setTermModalError(err?.message || 'Failed to reject termination request'); }
      finally { setTermModalLoading(false); }
    }
  };

  // ── tab / status ─────────────────────────────────────────────────────────

  const bookingStatus     = (bookingSummary.status || '').toLowerCase();
  const isTerminated      = bookingStatus === 'terminated';
  const isPaused          = bookingStatus === 'paused';
  const canPause          = !isTerminated && !isPaused && ['LIVE_IN', 'SHIFT_BASED'].includes(bookingSummary.service_model) && ['active', 'overdue'].includes(bookingStatus);
  const openPause         = bookingPauses.find(p => !p.resumed_at) || null;
  const sm                = STATUS_META[bookingStatus] || STATUS_META.pending;
  const scheduledCompletion   = bookingScheduledActions.find(sa => sa.action_type === 'COMPLETION');
  const scheduledTermination  = bookingScheduledActions.find(sa => sa.action_type === 'TERMINATION');
  const scheduledFinalization = scheduledCompletion || scheduledTermination || null;
  const requiresBank      = ['BANK_TRANSFER', 'CASH_DEPOSIT'].includes(paymentForm.payment_method);
  const isCheque          = paymentForm.payment_method === 'CHEQUE';

  const tabs = [
    { id: 'care-timeline', label: 'Care Timeline', icon: CalendarDays },
    { id: 'overview',    label: 'Overview',      icon: LayoutGrid },
    { id: 'payments',    label: 'Payments',       icon: DollarSign },
    { id: 'staff',       label: 'Staff & Swaps',  icon: Users },
    { id: 'rates',       label: 'Rates',          icon: Wallet },
    ...(isShiftBased ? [{ id: 'reschedules', label: 'Reschedules', icon: Repeat2 }] : []),
    { id: 'salesperson', label: 'Salesperson',    icon: Briefcase },
    { id: 'client',      label: 'Client & Care',  icon: User },
    { id: 'settlement',  label: 'Settlement',     icon: CheckCircle },
    { id: 'termination', label: 'Termination',    icon: AlertTriangle },
  ];

  const heroName    = patientDetails.patient_name || clientDetails.client_name || 'Booking';
  const heroInitials = initials(heroName);

  // ── input style helper ───────────────────────────────────────────────────
  const inp = { width: '100%', border: '1px solid #e5e7eb', borderRadius: 8, padding: '9px 12px', fontFamily: 'inherit', fontSize: 13.5, color: '#111827', outline: 'none', background: '#fff', boxSizing: 'border-box' };

  // ── loading / error ──────────────────────────────────────────────────────

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-start gap-4">
          <aside className="sticky top-6 hidden h-[calc(100vh-8rem)] w-64 shrink-0 flex-col overflow-hidden rounded-lg border border-gray-200 bg-white lg:flex">
            <div className="border-b border-gray-100 px-4 py-2.5">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">All Bookings</p>
            </div>
            <BookingSwitcherSidebar activeBookingId={bookingId} />
          </aside>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '50vh' }} className="flex-1">
            <div style={{ textAlign: 'center' }}>
              <Loader2 style={{ width: 48, height: 48, color: '#137A6B', animation: 'spin 1s linear infinite', margin: '0 auto 16px' }} />
              <p style={{ color: '#9A9488', fontSize: 14 }}>Loading booking details…</p>
            </div>
          </div>
        </div>
      </AdminLayout>
    );
  }

  if (!detail && error) {
    return (
      <AdminLayout>
        <div className="flex items-start gap-4">
          <aside className="sticky top-6 hidden h-[calc(100vh-8rem)] w-64 shrink-0 flex-col overflow-hidden rounded-lg border border-gray-200 bg-white lg:flex">
            <div className="border-b border-gray-100 px-4 py-2.5">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">All Bookings</p>
            </div>
            <BookingSwitcherSidebar activeBookingId={bookingId} />
          </aside>
          <div style={{ border: '1px solid #F5C9C5', background: '#FDF2F1', borderRadius: 16, padding: 24 }} className="flex-1">
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
              <div style={{ background: '#F7E6E3', borderRadius: '50%', padding: 8 }}><XCircle style={{ width: 24, height: 24, color: '#BC4338' }} /></div>
              <div>
                <h3 style={{ margin: '0 0 4px', fontSize: 17, fontWeight: 700, color: '#2A2722' }}>Unable to load booking</h3>
                <p style={{ margin: '0 0 16px', fontSize: 14, color: '#BC4338' }}>{error}</p>
                <button onClick={fetchDetail} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: '#BC4338', border: 'none', borderRadius: 10, padding: '9px 16px', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                  <RefreshCw style={{ width: 14, height: 14 }} /> Retry
                </button>
              </div>
            </div>
          </div>
        </div>
      </AdminLayout>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  RENDER
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <AdminLayout>
      <div className="-m-4 md:-m-8 px-3 sm:px-6 pt-6 pb-14" style={{ background: '#f8fafc', minHeight: '100vh', fontFamily: "'Hanken Grotesk',system-ui,sans-serif" }}>
        <div className="flex items-start gap-4">
          {/* Booking switcher sidebar (desktop) */}
          <aside className="sticky top-6 hidden h-[calc(100vh-8rem)] w-64 shrink-0 flex-col overflow-hidden rounded-lg border border-gray-200 bg-white lg:flex">
            <div className="border-b border-gray-100 px-4 py-2.5">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">All Bookings</p>
            </div>
            <BookingSwitcherSidebar activeBookingId={bookingId} />
          </aside>

          {/* Booking switcher sidebar (mobile drawer) */}
          {mobileBookingSidebarOpen && (
            <div className="fixed inset-0 z-50 flex lg:hidden">
              <div className="absolute inset-0 bg-black/40" onClick={() => setMobileBookingSidebarOpen(false)} />
              <div className="relative flex h-full w-72 max-w-[85vw] flex-col bg-white shadow-2xl">
                <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
                  <p className="text-[13px] font-semibold text-gray-700">All Bookings</p>
                  <button
                    type="button"
                    onClick={() => setMobileBookingSidebarOpen(false)}
                    className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <BookingSwitcherSidebar
                  activeBookingId={bookingId}
                  onNavigate={() => setMobileBookingSidebarOpen(false)}
                />
              </div>
            </div>
          )}

        <div className="min-w-0 flex-1" style={{ maxWidth: 1180, margin: '0 auto' }}>

          {/* ── Error banner ── */}
          {error && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#991b1b' }}>
              <span>{error}</span>
              <button onClick={() => setError('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#991b1b', lineHeight: 1 }}><XCircle style={{ width: 15, height: 15 }} /></button>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════
              HEADER BAR
          ══════════════════════════════════════════════════════ */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 22 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <button
                onClick={() => setMobileBookingSidebarOpen(true)}
                className="lg:hidden"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 9px', fontFamily: 'inherit', cursor: 'pointer' }}
                aria-label="Browse bookings"
              >
                <Menu style={{ width: 14, height: 14 }} />
              </button>
              <button
                onClick={() => navigate('/admin/bookings')}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 13px', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: '#374151', cursor: 'pointer' }}
              >
                <ArrowLeft style={{ width: 14, height: 14 }} /> Back to bookings
              </button>
              <img src={vcareLogo} alt="VCare Nursing" style={{ height: isMobile ? 36 : 46, width: 'auto', objectFit: 'contain' }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12, color: '#6b7280', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 6, padding: '6px 10px' }}>
                {bookingSummary.booking_code || '—'}
              </span>
              <button onClick={fetchDetail} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 13px', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: '#374151', cursor: 'pointer' }}>
                <RefreshCw style={{ width: 14, height: 14 }} /> Refresh
              </button>
              {!isTerminated && !isPaused && !normCurrentStaff && (
                <button
                  onClick={() => navigate(`/admin/bookings/${bookingId}/staff-assignment`)}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: '#2563eb', border: 'none', borderRadius: 8, padding: '8px 14px', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: '#fff', cursor: 'pointer' }}
                >
                  <UserPlus style={{ width: 14, height: 14 }} /> Assign Staff
                </button>
              )}
              {isPaused ? (
                <button onClick={handleResume} disabled={resumeBusy} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: '#137A6B', border: 'none', borderRadius: 8, padding: '8px 14px', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: '#fff', cursor: resumeBusy ? 'default' : 'pointer', opacity: resumeBusy ? 0.6 : 1 }}>
                  {resumeBusy ? <Loader2 style={{ width: 14, height: 14 }} className="animate-spin" /> : <Play style={{ width: 14, height: 14 }} />} Resume Booking
                </button>
              ) : canPause && (
                <button onClick={openPauseModal} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 14px', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: '#92400e', cursor: 'pointer' }}>
                  <Pause style={{ width: 14, height: 14 }} /> Pause
                </button>
              )}
              {!isTerminated && !scheduledFinalization && (
                <button onClick={openActionsModal} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: '#1e293b', border: 'none', borderRadius: 8, padding: '8px 14px', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: '#fff', cursor: 'pointer' }}>
                  <ShieldCheck style={{ width: 14, height: 14 }} /> Actions
                </button>
              )}
            </div>
          </div>
          {resumeError && (
            <div style={{ margin: '-10px 0 16px', fontSize: 12.5, color: '#BC4338' }}>{resumeError}</div>
          )}

          {/* ══════════════════════════════════════════════════════
              HERO — identity + hospitalization, one card (mirrors
              StaffDetailPageV2's hero card)
          ══════════════════════════════════════════════════════ */}
          <div className="mb-5 overflow-hidden rounded-lg border border-gray-200 bg-white">
            <div className="flex flex-wrap items-center gap-4 px-6 py-4">
              <div className="h-14 w-14 shrink-0 overflow-hidden rounded-full bg-gray-100 text-gray-700 flex items-center justify-center text-lg font-bold">
                {heroInitials}
              </div>
              <div className="min-w-[260px] flex-1">
                <div className="flex flex-wrap items-center gap-2 mb-1.5">
                  <h1 className="text-[17px] font-semibold text-gray-900">
                    {heroName}
                    {bookingSummary.service_type ? ` · ${bookingSummary.service_type}` : ''}
                  </h1>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: sm.bg, color: sm.col, borderRadius: 999, padding: '4px 10px', fontSize: 11.5, fontWeight: 600, whiteSpace: 'nowrap' }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: sm.dot }} />
                    {bookingSummary.status || 'Unknown'}
                  </span>
                  {isVisiting && visitingStatus && visitingStatus !== VISITING_STATUS.COMPLETED && (() => {
                    const vm = VISITING_STATUS_META[visitingStatus];
                    return (
                      <span
                        title={visitingStatus === VISITING_STATUS.AWAITING_FINALIZATION ? 'The visit date has passed — log attendance and decide the invoice to close this booking out.' : undefined}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: vm.bg, color: vm.col, borderRadius: 999, padding: '4px 10px', fontSize: 11.5, fontWeight: 600, whiteSpace: 'nowrap' }}
                      >
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: vm.dot }} />
                        {vm.label}
                      </span>
                    );
                  })()}
                  {isHospitalized && (
                    <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-semibold whitespace-nowrap" style={{ background: '#FDF2F2', color: '#BC4338' }}>
                      <Building2 className="h-3 w-3" /> Hospitalized
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[13px] text-gray-500">
                  <span className="flex items-center gap-1.5"><Activity className="h-3.5 w-3.5" />{bookingSummary.service_model || '—'}</span>
                  <span className="flex items-center gap-1.5"><Briefcase className="h-3.5 w-3.5" />{salesData?.current?.salesperson_name || 'Unassigned'}</span>
                  <span className="font-mono">{bookingSummary.booking_code || '—'}</span>
                  {clientDetails.client_name && (
                    <span className="flex items-center gap-1.5"><User className="h-3.5 w-3.5" />{clientDetails.client_name}</span>
                  )}
                  {bookingSummary.start_date && (
                    <span className="flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5" />Started {formatDate(bookingSummary.start_date)}</span>
                  )}
                </div>
              </div>
            </div>

            {/* Hospitalization strip — always visible, part of the same card */}
            <div
              className="flex flex-wrap items-center justify-between gap-3 border-t px-6 py-3"
              style={{ borderColor: isHospitalized ? '#F5C9C5' : '#f3f4f6', background: isHospitalized ? '#FDF2F2' : '#f8fafc' }}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <Building2 className="h-4 w-4 flex-shrink-0" style={{ color: isHospitalized ? '#BC4338' : '#9ca3af' }} />
                <span className="text-[13px] font-medium truncate" style={{ color: isHospitalized ? '#BC4338' : '#6b7280' }}>
                  {isHospitalized
                    ? (hospitalName ? `Hospitalized at ${hospitalName}` : 'Currently hospitalized')
                    : 'Not hospitalized'}
                </span>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
                {!isHospitalized && (
                  <input
                    type="text"
                    placeholder="Hospital name (optional)"
                    value={hospitalNameDraft}
                    onChange={(e) => { setHospitalNameDraft(e.target.value); setHospitalNameDraftTouched(true); }}
                    style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: '7px 10px', fontFamily: 'inherit', fontSize: 12.5, color: '#374151', outline: 'none' }}
                  />
                )}
                <button
                  onClick={toggleHospitalization}
                  disabled={hospitalizationSaving}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: '7px 12px', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, color: '#374151', cursor: hospitalizationSaving ? 'wait' : 'pointer', opacity: hospitalizationSaving ? 0.6 : 1 }}
                >
                  {hospitalizationSaving ? 'Saving…' : isHospitalized ? 'Mark as not hospitalized' : 'Mark as hospitalized'}
                </button>
              </div>
            </div>
          </div>

          {/* ══════════════════════════════════════════════════════
              STAT CARDS
          ══════════════════════════════════════════════════════ */}
          {(() => {
            const displayOutstanding = simOutstanding ?? overdueAmount;
            // SHIFT_BASED: "served" counts shifts elapsed, and "planned" is however
            // many shifts the payments actually cover — both in shift units, never days.
            const displayServed = isShiftBased ? (simServedShifts ?? servedShifts) : (simServedDays ?? servedDays);
            const displayPlanned = isShiftBased ? shiftsPaidCount : plannedDays;
            const unitWord = isShiftBased ? 'shift' : 'day';
            const overrun = displayPlanned && displayServed > displayPlanned;
            return (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 18 }}>
                <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '15px 16px' }}>
                  <div style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: '#9ca3af' }}>Total paid</div>
                  <div style={{ fontSize: bigStatSize(formatMoney(totalPaid), isMobile), fontWeight: 800, letterSpacing: '-0.02em', marginTop: 6, color: '#111827', wordBreak: 'break-word' }}>{formatMoney(totalPaid)}</div>
                  <div style={{ fontSize: 12, color: '#6b7280', fontWeight: 500, marginTop: 3 }}>{isShiftBased ? shiftsPaidCount : paidDays} {unitWord}{(isShiftBased ? shiftsPaidCount : paidDays) !== 1 ? 's' : ''} covered</div>
                </div>
                <div style={{ background: simDate ? '#fffbeb' : '#fff', border: simDate ? '1px solid #fde68a' : '1px solid #e5e7eb', borderRadius: 10, padding: '15px 16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: '#9ca3af' }}>Outstanding</span>
                    {simDate && <span style={{ fontSize: 10, fontWeight: 700, background: '#fde68a', color: '#92400e', borderRadius: 4, padding: '1px 5px' }}>SIM</span>}
                  </div>
                  <div style={{ fontSize: bigStatSize(formatMoney(displayOutstanding), isMobile), fontWeight: 800, letterSpacing: '-0.02em', marginTop: 6, color: displayOutstanding > 0 ? '#dc2626' : '#111827', wordBreak: 'break-word' }}>{formatMoney(displayOutstanding)}</div>
                  <div style={{ fontSize: 12, fontWeight: 500, marginTop: 3, color: displayOutstanding > 0 ? '#dc2626' : '#6b7280' }}>
                    {displayOutstanding > 0 ? `${Math.max(0, displayServed - displayPlanned)} ${unitWord}${Math.max(0, displayServed - displayPlanned) !== 1 ? 's' : ''} overdue` : 'All clear'}
                  </div>
                </div>
                <div style={{ background: simDate ? '#fffbeb' : '#fff', border: simDate ? '1px solid #fde68a' : '1px solid #e5e7eb', borderRadius: 10, padding: '15px 16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: '#9ca3af' }}>{isShiftBased ? 'Shifts served' : 'Days served'}</span>
                    {simDate && <span style={{ fontSize: 10, fontWeight: 700, background: '#fde68a', color: '#92400e', borderRadius: 4, padding: '1px 5px' }}>SIM</span>}
                  </div>
                  <div style={{ fontSize: isMobile ? 20 : 24, fontWeight: 800, letterSpacing: '-0.02em', marginTop: 6, color: '#111827' }}>
                    {displayServed} <span style={{ fontSize: isMobile ? 14 : 15, fontWeight: 500, color: overrun ? '#dc2626' : '#9ca3af' }}>/ {displayPlanned || '—'}</span>
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 500, marginTop: 3, color: overrun ? '#dc2626' : '#6b7280' }}>
                    {overrun ? `+${displayServed - displayPlanned} overrun` : `of ${displayPlanned || '—'} planned`}
                  </div>
                </div>
                <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '15px 16px' }}>
                  <div style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: '#9ca3af' }}>{isShiftBased ? 'Client shift rate' : 'Client daily rate'}</div>
                  <div style={{ fontSize: bigStatSize(formatMoney(isShiftBased ? shiftRate : dailyRate), isMobile), fontWeight: 800, letterSpacing: '-0.02em', marginTop: 6, color: '#111827', wordBreak: 'break-word' }}>{formatMoney(isShiftBased ? shiftRate : dailyRate)}</div>
                  <div style={{ fontSize: 12, color: '#6b7280', fontWeight: 500, marginTop: 3 }}>{bookingSummary.service_model || '—'}</div>
                </div>
              </div>
            );
          })()}

          {/* ══════════════════════════════════════════════════════
              TABS — icon-only, tooltip on hover
          ══════════════════════════════════════════════════════ */}
          <div className="flex gap-1 mb-4 bg-slate-100 p-1 rounded-lg w-fit">
            {tabs.map(tab => {
              const Icon = tab.icon;
              return (
                <div key={tab.id} className="relative group">
                  <button
                    type="button"
                    onClick={() => setActiveSection(tab.id)}
                    aria-label={tab.label}
                    className={`flex items-center justify-center w-9 h-9 rounded-md transition-all ${
                      activeSection === tab.id
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                  </button>
                  <div className="pointer-events-none absolute left-1/2 top-full z-20 mt-1.5 -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-[11px] font-medium text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100">
                    {tab.label}
                  </div>
                </div>
              );
            })}
          </div>

          {/* ══════════════════════════════════════════════════════
              TAB: CARE TIMELINE — hospitalization/invoicing/finalization
              banners, shift bank, and the care timeline calendar
          ══════════════════════════════════════════════════════ */}
          {activeSection === 'care-timeline' && (
            <>
              {/* ── INVOICING MODE BANNER — LIVE_IN only, always visible, toggle anytime ── */}
              {isLiveIn && (
                <div
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap',
                    marginBottom: 18, padding: '14px 18px', borderRadius: 10,
                    background: '#f8fafc', border: '1px solid #e5e7eb',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 34, height: 34, borderRadius: 8, background: '#e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Wallet style={{ width: 16, height: 16, color: '#374151' }} />
                    </div>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 13.5, fontWeight: 700, color: '#111827' }}>Daily client invoicing</span>
                        <span style={{ fontSize: 10.5, fontWeight: 600, padding: '2px 7px', borderRadius: 4, background: '#e5e7eb', color: '#374151', letterSpacing: '.03em' }}>
                          {invoicingMode}
                        </span>
                      </div>
                      <div style={{ fontSize: 12.5, color: '#6b7280', marginTop: 2 }}>
                        {invoicingMode === 'AUTO'
                          ? 'Billed automatically every night at 23:59. Staff salary is always automatic for LIVE_IN bookings.'
                          : 'Confirm each day\'s client charge from the care timeline below. Staff salary stays automatic either way.'}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={toggleInvoicingMode}
                    disabled={invoicingModeSaving}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 14px', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: '#374151', cursor: invoicingModeSaving ? 'wait' : 'pointer', opacity: invoicingModeSaving ? 0.6 : 1, flexShrink: 0 }}
                  >
                    {invoicingModeSaving ? 'Saving…' : invoicingMode === 'AUTO' ? 'Switch to Manual' : 'Switch to Auto'}
                  </button>
                </div>
              )}

              {/* ── SCHEDULED COMPLETION / TERMINATION NOTICE ── */}
              {scheduledFinalization && (
                <div
                  style={{
                    display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 18,
                    padding: '14px 18px', borderRadius: 10,
                    background: scheduledTermination ? '#FDF2F2' : '#F0F9F4',
                    border: `1px solid ${scheduledTermination ? '#F5C9C5' : '#BCE0CC'}`,
                  }}
                >
                  <AlertTriangle style={{ width: 18, height: 18, color: scheduledTermination ? '#BC4338' : '#1F8B4C', flexShrink: 0, marginTop: 1 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 700, color: '#2A2722' }}>
                      {scheduledTermination ? 'Termination scheduled' : 'Completion scheduled'} for {formatDate(scheduledFinalization.effective_date)}
                    </div>
                    <div style={{ fontSize: 12.5, color: '#6F6A60', marginTop: 2 }}>
                      This booking stays active and billed as normal until then
                      {scheduledFinalization.reason ? ` — ${scheduledFinalization.reason}` : ''}.
                    </div>
                  </div>
                </div>
              )}

              {/* ── SHIFT BANK — SHIFT_BASED only: shifts paid vs delivered ── */}
              {isShiftBased && shiftBank && (
                <div style={{ marginBottom: 18, padding: '14px 18px', borderRadius: 10, background: shiftBank.remaining < 0 ? '#FDF2F2' : '#FBF9F4', border: `1px solid ${shiftBank.remaining < 0 ? '#F5C9C5' : '#EFEAE0'}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                    <div style={{ fontSize: 13.5, fontWeight: 700, color: '#2A2722' }}>Shift bank</div>
                    {shiftRate > 0 && <div style={{ fontSize: 12, color: '#6F6A60' }}>Rs {shiftRate.toLocaleString('en-US')} / shift</div>}
                  </div>
                  <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginTop: 8 }}>
                    {[
                      { label: 'Paid for', value: shiftBank.paid, color: '#2A2722' },
                      { label: 'Delivered', value: shiftBank.used, color: '#2F8A5B' },
                      { label: 'Waived', value: shiftBank.waived, color: '#9A9488' },
                      { label: 'Remaining', value: shiftBank.remaining, color: shiftBank.remaining < 0 ? '#C2483C' : '#2A2722' },
                    ].map(({ label, value, color }) => (
                      <div key={label}>
                        <div style={{ fontSize: 18, fontWeight: 800, color }}>{value}</div>
                        <div style={{ fontSize: 11, color: '#8A8478', fontWeight: 600 }}>{label}</div>
                      </div>
                    ))}
                  </div>
                  {shiftBank.remaining < 0 && (
                    <div style={{ fontSize: 12, color: '#C2483C', fontWeight: 600, marginTop: 8 }}>
                      {Math.abs(shiftBank.remaining)} shift{Math.abs(shiftBank.remaining) !== 1 ? 's' : ''} delivered beyond what's been paid for — record a payment or waive outstanding shifts.
                    </div>
                  )}
                  {walletEarmarked > 0 && (
                    <div style={{ fontSize: 12, color: '#6F6A60', marginTop: 8, paddingTop: 8, borderTop: '1px solid #EFEAE0' }}>
                      <strong style={{ color: '#2A2722' }}>{formatMoney(walletEarmarked)}</strong> of the client's wallet is reserved for this booking
                      {shiftRate > 0 ? ` (${Math.floor(walletEarmarked / shiftRate)} shift${Math.floor(walletEarmarked / shiftRate) !== 1 ? 's' : ''})` : ''}
                      {' '}— you'll be asked what to do with it if this booking ends early.
                    </div>
                  )}
                </div>
              )}

              {/* Non-shift bookings get the same reserved-funds line, since they
                  have no shift bank to hang it off. */}
              {!isShiftBased && walletEarmarked > 0 && (
                <div style={{ marginBottom: 18, padding: '14px 18px', borderRadius: 10, background: '#FBF9F4', border: '1px solid #EFEAE0' }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: '#2A2722' }}>Reserved for this booking</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: '#2A2722', marginTop: 4 }}>
                    {formatMoney(walletEarmarked)}
                    {dailyRate > 0 && (
                      <span style={{ fontSize: 12, fontWeight: 600, color: '#8A8478', marginLeft: 8 }}>
                        ≈ {Math.floor(walletEarmarked / dailyRate)} day{Math.floor(walletEarmarked / dailyRate) !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: '#6F6A60', marginTop: 4 }}>
                    Paid in advance and not yet delivered. You'll be asked what to do with it if this booking ends early.
                  </div>
                </div>
              )}

              {/* ── Manual overdue modal — SHIFT_BASED only ── */}
              {showOverdueModal && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60 }}>
                  <div style={{ background: '#fff', borderRadius: 12, padding: 20, width: 380, maxWidth: '90vw' }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: '#2A2722', marginBottom: 4 }}>Mark booking overdue</div>
                    <div style={{ fontSize: 12.5, color: '#6F6A60', marginBottom: 14 }}>
                      Pick the date shifts delivered first exceeded what the client has paid for.
                    </div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 }}>Overdue as of</label>
                    <input
                      type="date"
                      value={overdueModalDate}
                      onChange={(e) => setOverdueModalDate(e.target.value)}
                      style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 10px', fontSize: 13, fontFamily: 'inherit', marginBottom: 12 }}
                    />
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 }}>Reason (optional)</label>
                    <textarea
                      value={overdueModalReason}
                      onChange={(e) => setOverdueModalReason(e.target.value)}
                      rows={3}
                      style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 10px', fontSize: 13, fontFamily: 'inherit', resize: 'vertical' }}
                    />
                    {overdueModalError && <div style={{ fontSize: 12.5, color: '#C2483C', marginTop: 10 }}>{overdueModalError}</div>}
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
                      <button onClick={closeOverdueModal} disabled={overdueModalSubmitting} style={{ border: '1px solid #e5e7eb', background: '#fff', color: '#374151', borderRadius: 8, padding: '8px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
                      <button onClick={confirmMarkOverdue} disabled={overdueModalSubmitting} style={{ border: 'none', background: '#C2483C', color: '#fff', borderRadius: 8, padding: '8px 14px', fontSize: 13, fontWeight: 600, cursor: overdueModalSubmitting ? 'default' : 'pointer', fontFamily: 'inherit', opacity: overdueModalSubmitting ? 0.6 : 1 }}>
                        {overdueModalSubmitting ? 'Marking…' : 'Mark overdue'}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* ── CARE TIMELINE ── */}
              {bookingSummary.start_date && (
                <div style={{ marginBottom: 18 }}>
                  <CareTimeline
                    startDate={bookingSummary.start_date}
                    plannedDays={plannedDays}
                    dailyRate={dailyRate}
                    shiftRate={shiftRate}
                    totalPaid={totalPaid}
                    staffAssignments={staffHistory}
                    serviceModel={bookingSummary.service_model}
                    shiftSlots={shiftSlots}
                    scheduledActions={bookingScheduledActions}
                    terminationRequests={terminationReqs}
                    shiftPatternScheduled={shiftPattern?.scheduled || null}
                    bookingStatus={bookingSummary.status}
                    completionDate={bookingSummary.actual_end_time}
                    scheduledEndDate={bookingSummary.scheduled_end_time}
                    simDate={simDate}
                    onSimDateChange={setSimDate}
                    onDayClick={dayClickEnabled ? openDayModal : undefined}
                    attendanceRecords={attendanceRecords}
                    dailyInvoiceRecords={dailyInvoiceRecords}
                    draftDates={draftDates}
                    reschedules={shiftReschedules}
                    manualSalaryDay={manualSalaryDay}
                    manualInvoiceDay={manualInvoiceDay}
                    pauses={bookingPauses}
                    revokeEnabled={revokeEnabled}
                    onRevokeDays={revokeDays}
                    hospitalizationPeriods={hospitalizationPeriods}
                  />
                </div>
              )}
            </>
          )}

          {/* ══════════════════════════════════════════════════════
              TAB: OVERVIEW
          ══════════════════════════════════════════════════════ */}
          {activeSection === 'overview' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16, alignItems: 'start' }}>
                {/* Booking details */}
                <Card>
                  <CardTitle>Booking details</CardTitle>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 15 }}>
                    <Field label="Booking code"  value={bookingSummary.booking_code  || '-'} mono />
                    <Field label="Status"        value={bookingSummary.status        || '-'} />
                    <Field label="Service type"  value={bookingSummary.service_type  || '-'} />
                    <Field label="Service model" value={bookingSummary.service_model || '-'} />
                    <Field label="Start date"    value={formatDate(bookingSummary.start_date)} />
                    <Field label="Start time"    value={formatTime(bookingSummary.service_start_time)} />
                    {!isShiftBased && <Field label="Planned end" value={formatDate(bookingSummary.scheduled_end_time)} />}
                    {bookingSummary.actual_end_time && <Field label="Actual end" value={formatDT(bookingSummary.actual_end_time)} />}
                    <Field label="Created"       value={formatDT(bookingSummary.created_at)} />
                  </div>
                </Card>
                {/* Financial snapshot */}
                <Card>
                  <CardTitle>Financial snapshot</CardTitle>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {[
                      { label: 'Total paid',       value: formatMoney(totalPaid),          green: true },
                      { label: 'Total invoiced',   value: formatMoney(totalInvoiced) },
                      { label: 'Overdue amount',   value: formatMoney(overdueAmount),      red: overdueAmount > 0 },
                      { label: 'Remaining balance',value: formatMoney(remainingBalance) },
                      { label: 'Quoted amount',    value: formatMoney(bookingSummary.amount_quotated ?? 0) },
                      { label: 'Registration fee', value: formatMoney(bookingSummary.registration_fee ?? 0) },
                    ].map(({ label, value, red, green }) => (
                      <div key={label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                        <span style={{ fontSize: 13, color: '#6F6A60' }}>{label}</span>
                        <span style={{ fontSize: 13, fontWeight: 600, color: red ? '#BC4338' : green ? '#2F8A5B' : '#2A2722' }}>{value}</span>
                      </div>
                    ))}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                      <span style={{ fontSize: 13, color: '#6F6A60' }}>{isShiftBased ? 'Client shift rate' : 'Client daily rate'}</span>
                      <EditableRate
                        rateKey={isShiftBased ? 'client_shift' : 'client_daily'}
                        label={null}
                        value={isShiftBased ? shiftRate : dailyRate}
                        editingRate={editingRate} onStartEdit={startEditRate} onChangeValue={changeEditRateValue}
                        onSave={saveEditRate} onCancel={cancelEditRate} submitting={rateSubmitting} error={rateError}
                        formatMoney={formatMoney}
                      />
                    </div>
                  </div>
                </Card>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, alignItems: 'start' }}>
                {/* Current assignment */}
                <Card>
                  <CardTitle>Current assignment</CardTitle>
                  {normCurrentStaff ? (
                    <>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 13, marginBottom: 16 }}>
                        <span style={{ width: 11, height: 11, borderRadius: '50%', background: '#3F77B5', flexShrink: 0 }} />
                        <div>
                          <div style={{ fontSize: 15, fontWeight: 700, color: '#2A2722' }}>{normCurrentStaff.name}</div>
                          <div style={{ fontSize: 12.5, color: '#6F6A60', marginTop: 2 }}>{normCurrentStaff.designation}</div>
                        </div>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 13 }}>
                        <Field label="Staff ID"   value={normCurrentStaff.id}     mono />
                        <Field label="Phone"       value={formatMobileNumber(normCurrentStaff.mobile)} />
                        <Field label="Email"       value={normCurrentStaff.email}  />
                        {activeStaffRow && (
                          <EditableRate
                            rateKey={`staff_${activeStaffRow.assignment_id}`}
                            label="Staff daily rate"
                            value={activeStaffRow.daily_rate}
                            editingRate={editingRate} onStartEdit={startEditRate} onChangeValue={changeEditRateValue}
                            onSave={saveEditRate} onCancel={cancelEditRate} submitting={rateSubmitting} error={rateError}
                            formatMoney={formatMoney}
                          />
                        )}
                      </div>
                    </>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '28px 16px', textAlign: 'center', border: '1px dashed #E7E1D6', borderRadius: 14, background: '#FBF9F4', gap: 12 }}>
                      <Users style={{ width: 22, height: 22, color: '#C4BFB5' }} />
                      <p style={{ margin: 0, fontSize: 13, color: '#9A9488' }}>No staff currently assigned.</p>
                      {!isTerminated && (
                        <button
                          onClick={() => navigate(`/admin/bookings/${bookingId}/staff-assignment`)}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: '#2563eb', border: 'none', borderRadius: 8, padding: '8px 14px', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, color: '#fff', cursor: 'pointer' }}
                        >
                          <UserPlus style={{ width: 13, height: 13 }} /> Assign Staff
                        </button>
                      )}
                    </div>
                  )}
                </Card>

                {/* Recent payments */}
                <Card>
                  <CardTitle>Recent activity</CardTitle>
                  {normPayments.length === 0 ? (
                    <Empty icon={DollarSign} text="No payments recorded yet." />
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                      {normPayments.slice(0, 4).map((p, i) => (
                        <div key={p.id || i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, background: '#FBF9F4', border: '1px solid #EFEAE0', borderRadius: 11, padding: '11px 13px' }}>
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: '#2A2722' }}>{formatDate(p.date)}</div>
                            <div style={{ fontSize: 11.5, color: '#A39D91', marginTop: 2 }}>{p.method.replace(/_/g, ' ')}</div>
                          </div>
                          <span style={{ fontSize: 13, fontWeight: 700, color: '#2F8A5B' }}>{formatMoney(p.amount)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════
              TAB: PAYMENTS
          ══════════════════════════════════════════════════════ */}
          {activeSection === 'payments' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

              {/* Mini stats */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 14 }}>
                {[
                  { label: 'Total invoiced',  value: formatMoney(invoiceSummary.total_invoiced ?? 0) },
                  { label: 'Outstanding',     value: formatMoney(overdueAmount), red: overdueAmount > 0 },
                  { label: 'Wallet balance',  value: formatMoney(walletBalance), green: walletBalance > 0 },
                  { label: 'Last payment',    value: formatDate(lastPaymentDate) },
                ].map(({ label, value, red, green }) => (
                  <div key={label} style={{ background: '#fff', border: '1px solid #ECE7DF', borderRadius: 14, padding: '15px 16px' }}>
                    <div style={{ fontSize: 11.5, fontWeight: 600, color: '#9A9488', textTransform: 'uppercase', letterSpacing: '.04em' }}>{label}</div>
                    <div style={{ fontSize: 18, fontWeight: 800, marginTop: 5, color: red ? '#BC4338' : green ? '#2F8A5B' : '#2A2722' }}>{value}</div>
                  </div>
                ))}
              </div>

              {/* Payment history + Record payment */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16, alignItems: 'start' }}>
                <Card>
                  <CardTitle>Payment history</CardTitle>
                  {normPayments.length === 0 ? (
                    <Empty icon={DollarSign} text="No payment records for this booking." />
                  ) : (
                    <>
                     <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
                      <div style={{ minWidth: 480 }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '0.95fr 0.9fr 0.8fr 0.75fr 1.25fr', gap: 10, paddingBottom: 9, fontSize: 11, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: '#A39D91', borderBottom: '1px solid #EFEAE0' }}>
                        <span>Date</span><span>Amount</span><span>Method</span><span>Reference</span><span>Receipt</span>
                      </div>
                      {normPayments.map((p, i) => {
                        const rcpt = receiptByPayment[p.id];
                        const rcptBusy = rcpt && receiptBusy === rcpt.receipt_id;
                        return (
                        <div key={p.id || i} style={{ display: 'grid', gridTemplateColumns: '0.95fr 0.9fr 0.8fr 0.75fr 1.25fr', gap: 10, padding: '13px 0', borderBottom: '1px solid #F2EEE6', alignItems: 'center' }}>
                          <div>
                            <div style={{ fontSize: 13.5, fontWeight: 600, color: '#2A2722' }}>{formatDate(p.date)}</div>
                            {p.notes !== '-' && <div style={{ fontSize: 11.5, color: '#A39D91', marginTop: 2 }}>{p.notes}</div>}
                          </div>
                          <div style={{ fontSize: 13.5, fontWeight: 700, color: '#2F8A5B' }}>{formatMoney(p.amount)}</div>
                          <div><span style={{ display: 'inline-block', fontSize: 11.5, fontWeight: 600, color: '#5A554B', background: '#F4F1EA', borderRadius: 7, padding: '3px 9px' }}>{p.method.replace(/_/g, ' ')}</span></div>
                          <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11.5, color: '#6F6A60' }}>
                            {p.reference}
                            {p.slipUrl && <a href={p.slipUrl} target="_blank" rel="noreferrer" style={{ marginLeft: 6, color: '#3F77B5', fontSize: 11 }}>slip</a>}
                          </div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                            {!rcpt ? (
                              <span style={{ fontSize: 11.5, color: '#B8B2A6' }}>—</span>
                            ) : (
                              <>
                                {rcpt.pdf_url ? (
                                  <a href={rcpt.pdf_url} target="_blank" rel="noreferrer"
                                     title={rcpt.receipt_code}
                                     style={{ fontSize: 11.5, fontWeight: 600, color: '#137A6B', textDecoration: 'none', border: '1px solid #CDE5DF', borderRadius: 7, padding: '3px 8px', background: '#F2FAF8' }}>
                                    Download
                                  </a>
                                ) : (
                                  <span style={{ fontSize: 11, color: '#B8862F' }}>Generating…</span>
                                )}
                                <button type="button" disabled={rcptBusy}
                                  onClick={() => handleSendReceipt(rcpt.receipt_id)}
                                  style={{ fontSize: 11.5, fontWeight: 700, fontFamily: 'inherit', color: '#fff', background: rcptBusy ? '#9CC6BC' : '#137A6B', border: 'none', borderRadius: 7, padding: '4px 9px', cursor: rcptBusy ? 'not-allowed' : 'pointer' }}>
                                  {rcptBusy ? 'Sending…' : rcpt.whatsapp_sent ? 'Resend' : 'Send'}
                                </button>
                                {rcpt.whatsapp_sent && (
                                  <span title={rcpt.whatsapp_sent_at ? `Sent ${formatDate(rcpt.whatsapp_sent_at)}` : 'Sent'}
                                        style={{ fontSize: 10.5, fontWeight: 700, color: '#2F8A5B' }}>✓ Sent</span>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                        );
                      })}
                      </div>
                     </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 12, marginTop: 2, borderTop: '1px solid #EFEAE0' }}>
                        <span style={{ fontSize: 13, color: '#6F6A60' }}>{normPayments.length} payment{normPayments.length !== 1 ? 's' : ''}</span>
                        <span style={{ fontSize: 13, fontWeight: 800, color: '#2A2722' }}>{formatMoney(totalPaid)}</span>
                      </div>
                    </>
                  )}
                </Card>

                <Card>
                  <CardTitle>Record a payment</CardTitle>
                  <p style={{ margin: '-10px 0 15px', fontSize: 12.5, color: '#9A9488' }}>Writes to the booking ledger.</p>
                  <form onSubmit={handleSubmitPayment} style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
                    <div>
                      <label style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: '#7A756A', marginBottom: 5 }}>Amount</label>
                      <input required type="number" min="0" step="0.01" placeholder="0.00" value={paymentForm.amount_received} onChange={e => setPaymentForm({ ...paymentForm, amount_received: e.target.value })} onWheel={e => e.currentTarget.blur()} style={inp} />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: '#7A756A', marginBottom: 5 }}>Method</label>
                      <select value={paymentForm.payment_method} onChange={e => setPaymentForm({ ...paymentForm, payment_method: e.target.value })} style={inp}>
                        <option value="BANK_TRANSFER">Bank transfer</option>
                        <option value="CASH_DEPOSIT">Cash deposit</option>
                        <option value="CASH">Cash</option>
                        <option value="CHEQUE">Cheque</option>
                      </select>
                    </div>
                    {requiresBank && (
                      <div>
                        <label style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: '#7A756A', marginBottom: 5 }}>Bank account</label>
                        <select required value={paymentForm.bank_account_id} onChange={e => setPaymentForm({ ...paymentForm, bank_account_id: e.target.value })} style={inp}>
                          <option value="">Select account</option>
                          {bankAccounts.map(a => <option key={a.account_id} value={a.account_id}>{a.account_nickname} ({a.bank_name})</option>)}
                        </select>
                      </div>
                    )}
                    {isCheque && (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8 }}>
                        <div>
                          <label style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: '#7A756A', marginBottom: 5 }}>Cheque no.</label>
                          <input required placeholder="000000" value={paymentForm.cheque_number} onChange={e => setPaymentForm({ ...paymentForm, cheque_number: e.target.value })} style={inp} />
                        </div>
                        <div>
                          <label style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: '#7A756A', marginBottom: 5 }}>Cheque date</label>
                          <DateInput required value={paymentForm.cheque_date} onChange={e => setPaymentForm({ ...paymentForm, cheque_date: e.target.value })} style={inp} />
                        </div>
                      </div>
                    )}
                    <div>
                      <label style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: '#7A756A', marginBottom: 5 }}>Reference (optional)</label>
                      <input placeholder="TRF / receipt no." value={paymentForm.reference_number} onChange={e => setPaymentForm({ ...paymentForm, reference_number: e.target.value })} style={inp} />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: '#7A756A', marginBottom: 5 }}>Notes (optional)</label>
                      <textarea rows={2} placeholder="e.g. 10-day advance" value={paymentForm.notes} onChange={e => setPaymentForm({ ...paymentForm, notes: e.target.value })} style={{ ...inp, resize: 'none' }} />
                    </div>
                    <div style={{ background: '#F6F3EC', border: '1px solid #E7E1D6', borderRadius: 10, padding: 12 }}>
                      <label style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: '#7A756A', marginBottom: 8 }}>Payment slip (optional)</label>
                      <label style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: '#fff', border: '1px solid #E7E1D6', borderRadius: 8, padding: '7px 12px', fontSize: 12, fontWeight: 600, color: '#5A554B', cursor: 'pointer' }}>
                        <Upload style={{ width: 13, height: 13 }} /> Choose file
                        <input type="file" accept="image/*,.pdf" style={{ display: 'none' }} onChange={e => setPaymentSlipFile(e.target.files?.[0] || null)} />
                      </label>
                      {paymentSlipFile && <p style={{ margin: '8px 0 0', fontSize: 12, color: '#6F6A60' }}>{paymentSlipFile.name}</p>}
                    </div>
                    <button type="submit" disabled={paymentSubmitting} style={{ marginTop: 3, width: '100%', background: paymentSubmitting ? '#9ca3af' : '#1e293b', border: 'none', borderRadius: 8, padding: '11px 12px', fontFamily: 'inherit', fontSize: 13.5, fontWeight: 700, color: '#fff', cursor: paymentSubmitting ? 'not-allowed' : 'pointer' }}>
                      {paymentSubmitting ? 'Saving…' : 'Record payment'}
                    </button>
                  </form>
                </Card>
              </div>

              {/* Wallet payoff */}
              <Card>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 15 }}>
                  <div style={{ background: '#EDE5F5', borderRadius: '50%', padding: 8 }}><Wallet style={{ width: 16, height: 16, color: '#7A4A94' }} /></div>
                  <h3 style={{ margin: 0, fontSize: 15.5, fontWeight: 700 }}>Wallet payoff</h3>
                </div>
                {canPayoff && !isTerminated ? (
                  <form onSubmit={handleWalletPayoff} style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
                      {[{ label: 'Wallet balance', value: formatMoney(walletBalance), color: '#2F8A5B' }, { label: 'Overdue amount', value: formatMoney(overdueAmount), color: '#BC4338' }, { label: 'Max payable', value: formatMoney(maxPayoff), color: '#7A4A94' }].map(({ label, value, color }) => (
                        <div key={label} style={{ border: '1px solid #ECE7DF', borderRadius: 12, padding: 12 }}>
                          <div style={{ fontSize: 11.5, color: '#9A9488', marginBottom: 4 }}>{label}</div>
                          <div style={{ fontSize: 14, fontWeight: 700, color }}>{value}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input required type="number" min="0.01" max={maxPayoff.toFixed(2)} step="0.01" placeholder="Amount to pay off" value={walletPayoffAmount} onChange={e => setWalletPayoffAmount(e.target.value)} onWheel={e => e.currentTarget.blur()} style={{ ...inp, flex: 1 }} />
                      <button type="button" onClick={() => setWalletPayoffAmount(maxPayoff.toFixed(2))} style={{ border: '1px solid #E2DCD0', borderRadius: 10, padding: '10px 14px', fontSize: 12, fontWeight: 600, color: '#5A554B', background: '#FCFBF8', cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>Max</button>
                    </div>
                    <textarea rows={2} placeholder="Notes (optional)" value={walletPayoffNotes} onChange={e => setWalletPayoffNotes(e.target.value)} style={{ ...inp, resize: 'none' }} />
                    {walletPayoffError && <div style={{ background: '#FDF2F1', border: '1px solid #F5C9C5', borderRadius: 10, padding: '10px 12px', fontSize: 13, color: '#BC4338' }}>{walletPayoffError}</div>}
                    <button type="submit" disabled={walletPayoffSubmitting || !walletPayoffAmount} style={{ width: '100%', background: walletPayoffSubmitting ? '#9ca3af' : '#1e293b', border: 'none', borderRadius: 8, padding: '11px 12px', fontFamily: 'inherit', fontSize: 13.5, fontWeight: 700, color: '#fff', cursor: 'pointer' }}>
                      {walletPayoffSubmitting ? 'Processing…' : 'Pay with wallet'}
                    </button>
                  </form>
                ) : (
                  <div style={{ border: '1px dashed #E7E1D6', borderRadius: 12, background: '#FBF9F4', padding: '24px 16px', textAlign: 'center' }}>
                    <Wallet style={{ width: 22, height: 22, color: '#C4BFB5', margin: '0 auto 10px' }} />
                    <p style={{ margin: 0, fontSize: 13, color: '#9A9488' }}>
                      {isTerminated ? 'Wallet payoff unavailable for terminated bookings.' : overdueAmount <= 0 ? 'No overdue amount.' : 'Client wallet is empty.'}
                    </p>
                  </div>
                )}
              </Card>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════
              TAB: STAFF & SWAPS
          ══════════════════════════════════════════════════════ */}
          {activeSection === 'staff' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {isShiftBased ? (
                <>
                  {/* Shift pattern */}
                  <Card>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 16 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: '#A39D91' }}>Shift pattern</div>
                      {!isTerminated && (
                        <button onClick={openPatternModal} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: '#374151', border: 'none', borderRadius: 8, padding: '8px 13px', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, color: '#fff', cursor: 'pointer', flexShrink: 0 }}>
                          Change Pattern
                        </button>
                      )}
                    </div>
                    {shiftPattern?.active ? (
                      <>
                        <div style={{ fontSize: 13, color: '#5A554B', marginBottom: 10 }}>{shiftPattern.active.shift_count} shifts/day · effective {formatDate(shiftPattern.active.effective_from_date)}</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                          {(shiftPattern.active.slots || []).map(s => (
                            <span key={s.shift_slot_id} style={{ fontSize: 12, fontWeight: 600, color: '#5A554B', background: '#FBF9F4', border: '1px solid #EFEAE0', borderRadius: 999, padding: '5px 11px' }}>
                              {s.label || `Shift ${s.shift_number}`} · {(s.start_time || '').slice(0, 5)} ({s.duration_hours}h)
                            </span>
                          ))}
                        </div>
                        {shiftPattern.scheduled && (
                          <div style={{ marginTop: 12, fontSize: 12.5, color: '#B07A1E', background: '#FBF1DD', border: '1px solid #F3E3BC', borderRadius: 10, padding: '9px 12px' }}>
                            A new {shiftPattern.scheduled.shift_count}-shift pattern takes effect on {formatDate(shiftPattern.scheduled.effective_from_date)}.
                          </div>
                        )}
                      </>
                    ) : <Empty icon={Users} text="No shift pattern defined yet." />}
                    <button onClick={togglePatternHistory} style={{ marginTop: 12, fontSize: 12.5, fontWeight: 600, color: '#8C5AA6', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                      {showPatternHistory ? 'Hide history' : 'View pattern history'}
                    </button>
                    {showPatternHistory && (
                      <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {patternHistory.length === 0 ? <div style={{ fontSize: 12, color: '#A39D91' }}>No history.</div> : patternHistory.map(p => (
                          <div key={p.pattern_id} style={{ fontSize: 12, color: '#6F6A60', background: '#FBF9F4', border: '1px solid #EFEAE0', borderRadius: 8, padding: '7px 10px' }}>
                            {p.shift_count} shifts · {formatDate(p.effective_from_date)} → {p.effective_to_date ? formatDate(p.effective_to_date) : 'ongoing'} · <Pill tone={p.status === 'ACTIVE' ? 'green' : p.status === 'SCHEDULED' ? 'amber' : 'slate'}>{p.status}</Pill>
                          </div>
                        ))}
                      </div>
                    )}
                  </Card>

                  {/* Per-shift staff */}
                  <Card>
                    <CardTitle>Per-shift staff</CardTitle>
                    {shiftSlots.length === 0 ? <Empty icon={Users} text="Define a shift pattern to assign staff." /> : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {shiftSlots.map(slot => (
                          <div key={slot.shift_slot_id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, border: '1px solid #EFEAE0', borderRadius: 12, padding: '12px 14px', background: '#FBF9F4' }}>
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontSize: 13.5, fontWeight: 700, color: '#2A2722' }}>{slot.label || `Shift ${slot.shift_number}`} <span style={{ fontWeight: 500, color: '#A39D91' }}>· {(slot.start_time || '').slice(0, 5)} ({slot.duration_hours}h)</span></div>
                              {slot.assignment ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3, flexWrap: 'wrap' }}>
                                  <div style={{ fontSize: 12.5, color: '#6F6A60' }}>{slot.assignment.staff_name} · {formatMoney(slot.assignment.daily_rate)}/shift</div>
                                  {slot.assignment.status === 'SCHEDULED' && (
                                    <Pill tone="amber">Starts {formatDate(slot.assignment.service_start_date)}</Pill>
                                  )}
                                </div>
                              ) : (
                                <div style={{ fontSize: 12.5, color: '#A39D91', marginTop: 2 }}>Unassigned</div>
                              )}
                            </div>
                            {!isTerminated && (
                              <button onClick={() => openSlotAssignModal(slot)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#374151', border: 'none', borderRadius: 8, padding: '7px 12px', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, color: '#fff', cursor: 'pointer', flexShrink: 0 }}>
                                {slot.assignment ? <><Repeat2 style={{ width: 13, height: 13 }} /> Reassign</> : 'Assign'}
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </Card>
                </>
              ) : (
                /* Current staff */
                <Card>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 16 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: '#A39D91' }}>Currently on duty</div>
                    {!isTerminated && (
                      <button onClick={() => setShowSwapModal(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: '#374151', border: 'none', borderRadius: 8, padding: '8px 13px', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, color: '#fff', cursor: 'pointer', flexShrink: 0 }}>
                        <Repeat2 style={{ width: 14, height: 14 }} /> Initiate Swap
                      </button>
                    )}
                  </div>
                  {normCurrentStaff ? (
                    <>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 13, marginBottom: 16 }}>
                        <div style={{ width: 44, height: 44, borderRadius: 12, background: '#E7F0F8', color: '#3F77B5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 800, flexShrink: 0 }}>
                          {initials(normCurrentStaff.name)}
                        </div>
                        <div>
                          <div style={{ fontSize: 15, fontWeight: 700, color: '#2A2722' }}>{normCurrentStaff.name}</div>
                          <div style={{ fontSize: 12.5, color: '#6F6A60', marginTop: 2 }}>{normCurrentStaff.designation}</div>
                        </div>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 13 }}>
                        <Field label="Staff ID"   value={normCurrentStaff.id}     mono />
                        <Field label="Phone"       value={formatMobileNumber(normCurrentStaff.mobile)} />
                        <Field label="Email"       value={normCurrentStaff.email}  />
                        {activeStaffRow && (
                          <EditableRate
                            rateKey={`staff_${activeStaffRow.assignment_id}`}
                            label="Staff daily rate"
                            value={activeStaffRow.daily_rate}
                            editingRate={editingRate} onStartEdit={startEditRate} onChangeValue={changeEditRateValue}
                            onSave={saveEditRate} onCancel={cancelEditRate} submitting={rateSubmitting} error={rateError}
                            formatMoney={formatMoney}
                          />
                        )}
                      </div>
                    </>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '28px 16px', textAlign: 'center', border: '1px dashed #E7E1D6', borderRadius: 14, background: '#FBF9F4', gap: 12 }}>
                      <Users style={{ width: 22, height: 22, color: '#C4BFB5' }} />
                      <p style={{ margin: 0, fontSize: 13, color: '#9A9488' }}>No staff is currently assigned to this booking.</p>
                      {!isTerminated && (
                        <button
                          onClick={() => navigate(`/admin/bookings/${bookingId}/staff-assignment`)}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: '#2563eb', border: 'none', borderRadius: 8, padding: '8px 14px', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, color: '#fff', cursor: 'pointer' }}
                        >
                          <UserPlus style={{ width: 13, height: 13 }} /> Assign Staff
                        </button>
                      )}
                    </div>
                  )}
                </Card>
              )}

              {/* Allocation history */}
              <Card>
                <CardTitle>Allocation history</CardTitle>
                {sortedAllocationHistory.length === 0 ? <Empty icon={Users} text="No allocation history available." /> : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {sortedAllocationHistory.map((row, i) => (
                      <div key={row.id || i} style={{ display: 'flex', alignItems: 'center', gap: 12, borderRadius: 12, padding: '12px 14px', background: row.color ? row.color.tint : '#FBF9F4', border: `1px solid ${row.color ? row.color.border : '#EFEAE0'}`, borderLeft: `4px solid ${row.color ? row.color.solid : '#E7E1D6'}` }}>
                        <div style={{ width: 36, height: 36, borderRadius: 10, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 12, fontWeight: 800, background: row.color ? row.color.solid : '#D5CFC4' }}>
                          {initials(row.name)}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <span style={{ fontSize: 13.5, fontWeight: 700, color: '#2A2722' }}>{row.name}</span>
                            {row.designation !== '-' && <span style={{ fontSize: 12, color: '#A39D91' }}>{row.designation}</span>}
                            {row.isOngoing && <span style={{ fontSize: 10, fontWeight: 700, background: '#E3F1E8', color: '#2F7A53', border: '1px solid #DCEEDD', borderRadius: 999, padding: '2px 7px' }}>Active</span>}
                          </div>
                          <div style={{ fontSize: 12, color: '#6F6A60', marginTop: 3 }}>
                            {formatDate(row.startDate)} <span style={{ color: '#C4BFB5', margin: '0 4px' }}>→</span>
                            {row.effectiveEnd ? formatDate(row.effectiveEnd) : <span style={{ color: '#2F8A5B', fontWeight: 600 }}>Ongoing</span>}
                          </div>
                          {(() => {
                            const startISO = row.startDate ? row.startDate.slice(0, 10) : null;
                            const endISO = row.effectiveEnd ? row.effectiveEnd.slice(0, 10) : null;
                            const inRecord = startISO ? attendanceRecords.find(a => a.assignment_id === row.id && a.service_date?.slice(0, 10) === startISO) : null;
                            const outRecord = endISO ? attendanceRecords.find(a => a.assignment_id === row.id && a.service_date?.slice(0, 10) === endISO) : null;
                            if (!inRecord?.in_time && !outRecord?.out_time) return null;
                            return (
                              <div style={{ fontSize: 11, color: '#8B857A', marginTop: 2 }}>
                                {inRecord?.in_time && <>In {formatDT(inRecord.in_time)}</>}
                                {inRecord?.in_time && outRecord?.out_time && <span style={{ margin: '0 5px' }}>·</span>}
                                {outRecord?.out_time && <>Out {formatDT(outRecord.out_time)}</>}
                              </div>
                            );
                          })()}
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 700, padding: '4px 10px', borderRadius: 8, background: row.color ? row.color.solid : '#E7E1D6', color: row.color ? '#fff' : '#5A554B', marginBottom: 4 }}>
                            Day {row.dayStart ?? '?'} {row.isOngoing ? '→ ongoing' : `→ Day ${row.dayEnd ?? '?'}`}
                          </div>
                          <div style={{ fontSize: 11, color: '#A39D91' }}>
                            {row.dayCount !== null ? `${row.dayCount} day${row.dayCount !== 1 ? 's' : ''}` : row.isOngoing && row.dayStart && plannedDays ? `${plannedDays - row.dayStart + 1} planned` : '—'}
                          </div>
                          {row.amountAllocated > 0 && <div style={{ fontSize: 11, fontWeight: 600, color: '#5A554B', marginTop: 2 }}>{formatMoney(row.amountAllocated)}</div>}
                          <button onClick={() => openEditTimes(row)} style={{ marginTop: 6, fontSize: 11, fontWeight: 600, color: '#8C5AA6', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                            Edit times
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>

              {/* Swap history */}
              <Card>
                <CardTitle>Swap history</CardTitle>
                <p style={{ fontSize: 11.5, color: '#A39D91', marginTop: -8, marginBottom: 12 }}>Out/in times for a swap live on its two rows in Allocation history above — use "Edit times" there to add or correct them.</p>
                {normSwapHistory.length === 0 ? <Empty icon={Repeat2} text="No swap history for this booking." /> : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
                    {normSwapHistory.map((swap, i) => (
                      <div key={swap.id || i} style={{ background: '#FBF9F4', border: '1px solid #EFEAE0', borderRadius: 12, padding: '14px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 13.5, fontWeight: 700, color: '#2A2722' }}>{swap.oldStaffName}</span>
                            <span style={{ color: '#B6AFA2', fontSize: 16 }}>→</span>
                            <span style={{ fontSize: 13.5, fontWeight: 700, color: '#2A2722' }}>{swap.newStaffName}</span>
                          </div>
                          <Pill tone={swap.billingGap ? 'amber' : 'violet'}>{swap.billingGap ? 'Billing gap' : 'Recorded'}</Pill>
                        </div>
                        <div style={{ fontSize: 12, color: '#A39D91', marginBottom: 5 }}>{formatDT(swap.swappedAt)}</div>
                        <div style={{ fontSize: 13, color: '#5A554B' }}>{swap.reason || 'No reason provided.'}</div>
                        {swap.swappedByMobile && <div style={{ fontSize: 12, color: '#A39D91', marginTop: 5 }}>Swapped by {formatMobileNumber(swap.swappedByMobile)}</div>}
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════
              TAB: RATES — client billing rate(s) vs staff pay rate(s), set at
              booking creation and editable at any time thereafter.
          ══════════════════════════════════════════════════════ */}
          {activeSection === 'rates' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <Card>
                <CardTitle>Client billing rate</CardTitle>
                <p style={{ fontSize: 12.5, color: '#6F6A60', marginTop: -8, marginBottom: 14 }}>
                  Drives this booking's client invoices going forward — does not affect what any staff member is paid.
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 15 }}>
                  {isShiftBased ? (
                    <EditableRate
                      rateKey="client_shift" label="Client shift rate" value={shiftRate}
                      editingRate={editingRate} onStartEdit={startEditRate} onChangeValue={changeEditRateValue}
                      onSave={saveEditRate} onCancel={cancelEditRate} submitting={rateSubmitting} error={rateError}
                      formatMoney={formatMoney}
                    />
                  ) : (
                    <EditableRate
                      rateKey="client_daily" label="Client daily rate" value={dailyRate}
                      editingRate={editingRate} onStartEdit={startEditRate} onChangeValue={changeEditRateValue}
                      onSave={saveEditRate} onCancel={cancelEditRate} submitting={rateSubmitting} error={rateError}
                      formatMoney={formatMoney}
                    />
                  )}
                  <EditableRate
                    rateKey="client_ot" label="Overtime rate" value={Number(bookingSummary.ot_rate || 0)}
                    editingRate={editingRate} onStartEdit={startEditRate} onChangeValue={changeEditRateValue}
                    onSave={saveEditRate} onCancel={cancelEditRate} submitting={rateSubmitting} error={rateError}
                    formatMoney={formatMoney}
                  />
                </div>
              </Card>

              <Card>
                <CardTitle>Staff pay rate{activeAssignments.length !== 1 ? 's' : ''}</CardTitle>
                <p style={{ fontSize: 12.5, color: '#6F6A60', marginTop: -8, marginBottom: 14 }}>
                  What each staff member currently on this booking earns per {isShiftBased ? 'shift' : 'day'} — set independently of the client rate above.
                </p>
                {activeAssignments.length === 0 ? <Empty icon={Users} text="No active staff assignment." /> : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {activeAssignments.map((a) => (
                      <div key={a.assignment_id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, border: '1px solid #EFEAE0', borderRadius: 12, padding: '12px 14px', background: '#FBF9F4' }}>
                        <div>
                          <div style={{ fontSize: 13.5, fontWeight: 700, color: '#2A2722' }}>{a.full_name || a.staff_name || '-'}</div>
                          {(a.shift_label || a.shift_number) && <div style={{ fontSize: 12, color: '#A39D91', marginTop: 2 }}>{a.shift_label || `Shift ${a.shift_number}`}</div>}
                          {a.staff_code && <div style={{ fontSize: 11, color: '#C4BFB5', marginTop: 2, fontFamily: "'JetBrains Mono',monospace" }}>{a.staff_code}</div>}
                        </div>
                        <EditableRate
                          rateKey={`staff_${a.assignment_id}`} label={null} value={a.daily_rate}
                          editingRate={editingRate} onStartEdit={startEditRate} onChangeValue={changeEditRateValue}
                          onSave={saveEditRate} onCancel={cancelEditRate} submitting={rateSubmitting} error={rateError}
                          formatMoney={formatMoney}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════
              TAB: RESCHEDULES — moved/makeup shifts (SHIFT_BASED only)
          ══════════════════════════════════════════════════════ */}
          {activeSection === 'reschedules' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <Card>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 16 }}>
                  <div>
                    <CardTitle>Rescheduled shifts</CardTitle>
                    <p style={{ margin: '-10px 0 0', fontSize: 12.5, color: '#6b7280' }}>
                      Shifts moved to a different date via the Waive/Reschedule actions on the care timeline.
                    </p>
                  </div>
                </div>

                {reschedulesError && (
                  <div style={{ marginBottom: 14, borderRadius: 8, background: '#fef2f2', border: '1px solid #fecaca', padding: '9px 12px', fontSize: 12.5, color: '#b91c1c' }}>
                    {reschedulesError}
                  </div>
                )}

                {shiftReschedules.length === 0 ? (
                  <Empty icon={RefreshCw} text="No shifts have been rescheduled for this booking." />
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {shiftReschedules.map((r) => {
                      const shiftLabel = r.shift_label || (r.shift_number ? `Shift ${r.shift_number}` : 'Shift');
                      return (
                        <div key={r.reschedule_id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, border: '1px solid #EFEAE0', borderRadius: 12, padding: '12px 14px', background: '#FBF9F4' }}>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                              <span style={{ fontSize: 13.5, fontWeight: 700, color: '#2A2722' }}>{shiftLabel}</span>
                              <Pill tone="slate">{formatDate(r.original_date)}</Pill>
                              <span style={{ color: '#B6AFA2', fontSize: 16 }}>→</span>
                              <Pill tone="amber">{formatDate(r.new_date)}{r.new_start_time ? ` · ${formatTime(r.new_start_time)}` : ''}</Pill>
                            </div>
                            <div style={{ fontSize: 12.5, color: '#6F6A60', marginTop: 5 }}>
                              {r.makeup_staff_name ? `Covered by ${r.makeup_staff_name}` : 'Staff unchanged'}
                            </div>
                            {r.reason && <div style={{ fontSize: 12.5, color: '#5A554B', marginTop: 3 }}>{r.reason}</div>}
                          </div>
                          {r.decided ? (
                            <Pill tone="slate">Already decided</Pill>
                          ) : (
                            <button
                              onClick={() => cancelReschedule(r.reschedule_id)}
                              disabled={reschedulesBusy === r.reschedule_id}
                              title="Cancels the move — the original date becomes a normal shift again"
                              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: '7px 12px', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, color: '#b91c1c', cursor: 'pointer', flexShrink: 0, opacity: reschedulesBusy === r.reschedule_id ? 0.6 : 1 }}
                            >
                              {reschedulesBusy === r.reschedule_id ? 'Cancelling…' : 'Cancel move'}
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </Card>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════
              TAB: SALESPERSON
          ══════════════════════════════════════════════════════ */}
          {activeSection === 'salesperson' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Current salesperson + assign/switch control */}
              <Card>
                <CardTitle>Currently credited salesperson</CardTitle>
                {salesData?.current ? (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 13, marginBottom: 16 }}>
                      <div style={{ width: 44, height: 44, borderRadius: 12, background: '#EEF2FF', color: '#4338CA', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 800, flexShrink: 0 }}>
                        {initials(salesData.current.salesperson_name)}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 15, fontWeight: 700, color: '#2A2722' }}>{salesData.current.salesperson_name}</span>
                          {salesData.current.is_origin
                            ? <Pill tone="violet">Brought in</Pill>
                            : <Pill tone="slate">Switched in</Pill>}
                        </div>
                        <div style={{ fontSize: 12.5, color: '#6F6A60', marginTop: 2 }}>{salesData.current.salesperson_role || 'Salesperson'}</div>
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 13 }}>
                      <Field label="Brought in by" value={salesData.origin?.salesperson_name || '—'} />
                      <Field label="Amount credited" value={formatMoney(salesData.origin?.credited_amount || 0)} />
                      <Field label="Assigned on" value={formatDate(salesData.current.assigned_at)} />
                    </div>
                  </>
                ) : (
                  <Empty icon={Briefcase} text="No salesperson is credited for this booking yet." />
                )}

                {!isTerminated && (
                  <div style={{ marginTop: 18, paddingTop: 16, borderTop: '1px solid #EFEAE0' }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#2A2722', marginBottom: 4 }}>
                      {salesData?.current ? 'Switch current salesperson' : 'Credit a salesperson'}
                    </div>
                    <div style={{ fontSize: 12, color: '#9A9488', marginBottom: 10 }}>
                      {salesData?.current
                        ? 'Switching only changes who is currently assigned. The sales amount and booking count stay permanently with the salesperson who brought the booking in.'
                        : 'Credits the booking’s paid amount and a booking count to the selected salesperson.'}
                    </div>
                    {salesActionError && (
                      <div style={{ background: '#FBEAE7', border: '1px solid #F0CFC9', color: '#9A372C', borderRadius: 10, padding: '9px 12px', fontSize: 13, marginBottom: 10 }}>
                        {salesActionError}
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                      <select
                        value={salesActionId}
                        onChange={(e) => setSalesActionId(e.target.value)}
                        style={{ flex: 1, minWidth: 200, border: '1px solid #E7E1D6', borderRadius: 10, padding: '9px 12px', fontFamily: 'inherit', fontSize: 13.5, color: '#2A2722', background: '#fff' }}
                      >
                        <option value="">Select salesperson…</option>
                        {salespersonsList
                          .filter((sp) => sp.id !== salesData?.current?.salesperson_id)
                          .map((sp) => (
                            <option key={sp.id} value={sp.id}>{sp.full_name}{sp.role ? ` — ${sp.role}` : ''}</option>
                          ))}
                      </select>
                      {salesData?.current && (
                        <input
                          type="text"
                          value={salesActionReason}
                          onChange={(e) => setSalesActionReason(e.target.value)}
                          placeholder="Reason (optional)"
                          style={{ flex: 1, minWidth: 200, border: '1px solid #E7E1D6', borderRadius: 10, padding: '9px 12px', fontFamily: 'inherit', fontSize: 13.5, color: '#2A2722' }}
                        />
                      )}
                      <button
                        onClick={handleSalespersonAssign}
                        disabled={!salesActionId || salesActionBusy}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: !salesActionId || salesActionBusy ? '#d1d5db' : '#1e293b', border: 'none', borderRadius: 8, padding: '10px 16px', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: '#fff', cursor: !salesActionId || salesActionBusy ? 'not-allowed' : 'pointer', flexShrink: 0 }}
                      >
                        {salesActionBusy ? <Loader2 style={{ width: 14, height: 14 }} className="animate-spin" /> : <Briefcase style={{ width: 14, height: 14 }} />}
                        {salesData?.current ? 'Switch' : 'Credit'}
                      </button>
                    </div>
                  </div>
                )}
              </Card>

              {/* Salesperson history */}
              <Card>
                <CardTitle>Salesperson history</CardTitle>
                {!salesData || salesData.history.length === 0 ? (
                  <Empty icon={History} text="No salesperson history for this booking." />
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
                    {salesData.history.map((h) => (
                      <div key={h.id} style={{ background: '#FBF9F4', border: '1px solid #EFEAE0', borderRadius: 12, padding: '14px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 6 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <span style={{ fontSize: 13.5, fontWeight: 700, color: '#2A2722' }}>{h.salesperson_name}</span>
                            <Pill tone={h.action === 'CREDITED' ? 'violet' : 'slate'}>{h.action}</Pill>
                            {h.is_current && <Pill tone="green">Current</Pill>}
                          </div>
                          <span style={{ fontSize: 13, fontWeight: 700, color: '#2A2722' }}>
                            {h.is_origin ? formatMoney(h.credited_amount) : '—'}
                          </span>
                        </div>
                        <div style={{ fontSize: 12, color: '#A39D91' }}>{formatDT(h.assigned_at)}</div>
                        {h.switch_reason && <div style={{ fontSize: 13, color: '#5A554B', marginTop: 5 }}>{h.switch_reason}</div>}
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════
              TAB: CLIENT & CARE
          ══════════════════════════════════════════════════════ */}
          {activeSection === 'client' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
              <Card>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                  <div style={{ width: 38, height: 38, borderRadius: 10, background: '#E4F1ED', color: '#137A6B', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800 }}>{initials(clientDetails.client_name || 'C')}</div>
                  <h3 style={{ margin: 0, fontSize: 15.5, fontWeight: 700 }}>Client</h3>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 15 }}>
                  <Field label="Name"      value={clientDetails.client_name} />
                  <Field label="Client ID" value={clientDetails.client_code || clientDetails.client_profile_id || bookingSummary.client_id || '-'} mono />
                  <Field label="Phone"     value={formatMobileNumber(clientDetails.client_mobile || clientDetails.mobile) || '-'} />
                  <Field label="Email"     value={clientDetails.client_email || clientDetails.email || '-'} />
                  <div style={{ gridColumn: '1/-1' }}><Field label="Address" value={clientDetails.client_address || clientDetails.address || '-'} /></div>
                </div>
              </Card>
              <Card>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                  <div style={{ width: 38, height: 38, borderRadius: 10, background: '#F2E9F4', color: '#8C5AA6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800 }}>{initials(patientDetails.patient_name || 'P')}</div>
                  <h3 style={{ margin: 0, fontSize: 15.5, fontWeight: 700 }}>Care profile</h3>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 15 }}>
                  <Field label="Patient"      value={patientDetails.patient_name} />
                  <Field label="Age"          value={patientDetails.patient_age || '-'} />
                  <Field label="Relationship" value={patientDetails.relationship_to_client || '-'} />
                  <Field label="Mobility"     value={patientDetails.mobility || '-'} />
                  <div style={{ gridColumn: '1/-1' }}><Field label="Medical condition" value={patientDetails.medical_condition || '-'} /></div>
                </div>
              </Card>

              {/* Booking notes — same client_notes rows entered from the staff-assignment
                  page during roster setup (bookingNotesController), shown here too so
                  they're visible on the booking that was created from the request. */}
              <Card style={{ gridColumn: '1/-1' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                  <div style={{ width: 38, height: 38, borderRadius: 10, background: '#FEF3C7', color: '#92400E', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <StickyNote style={{ width: 17, height: 17 }} />
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: 15.5, fontWeight: 700 }}>Client &amp; Booking Notes</h3>
                    <p style={{ margin: 0, fontSize: 12, color: '#9ca3af' }}>Also visible on the client's full note history.</p>
                  </div>
                </div>

                {noteError && (
                  <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8, border: '1px solid #e5e7eb', borderRadius: 8, background: '#fff', padding: '10px 14px', fontSize: 13, color: '#374151' }}>
                    <AlertTriangle style={{ width: 15, height: 15, color: '#dc2626', flexShrink: 0 }} />
                    {noteError}
                  </div>
                )}

                <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, background: '#f9fafb', padding: 14, marginBottom: 14 }}>
                  <textarea
                    rows={3}
                    value={noteText}
                    onChange={(e) => setNoteText(e.target.value)}
                    placeholder="Write a note about this client or booking…"
                    style={{ width: '100%', resize: 'none', border: '1px solid #e5e7eb', borderRadius: 8, background: '#fff', padding: '8px 10px', fontSize: 13, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }}
                  />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
                    <select
                      value={noteType}
                      onChange={(e) => setNoteType(e.target.value)}
                      style={{ border: '1px solid #e5e7eb', borderRadius: 8, background: '#fff', padding: '7px 10px', fontSize: 13, color: '#374151', outline: 'none' }}
                    >
                      <option value="GENERAL">General</option>
                      <option value="MEDICAL">Medical</option>
                      <option value="BILLING">Billing</option>
                      <option value="URGENT">Urgent</option>
                    </select>
                    <button
                      type="button"
                      onClick={handleAddBookingNote}
                      disabled={noteSubmitting || !noteText.trim()}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, borderRadius: 8, background: noteSubmitting || !noteText.trim() ? '#d1d5db' : '#2563eb', border: 'none', padding: '8px 16px', fontSize: 13, fontWeight: 700, color: '#fff', cursor: noteSubmitting || !noteText.trim() ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}
                    >
                      <Plus style={{ width: 14, height: 14 }} />
                      {noteSubmitting ? 'Adding…' : 'Add Note'}
                    </button>
                  </div>
                </div>

                {bookingNotesLoading ? (
                  <p style={{ fontSize: 13, color: '#9ca3af' }}>Loading notes…</p>
                ) : bookingNotes.length === 0 ? (
                  <p style={{ fontSize: 13, color: '#9ca3af' }}>No notes yet for this booking.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {bookingNotes.map((note) => {
                      const isEditing = editingNoteId === note.note_id;
                      return (
                        <div key={note.note_id} style={{ border: '1px solid #e5e7eb', borderRadius: 8, background: '#fff', padding: 14 }}>
                          {isEditing ? (
                            <div>
                              <textarea
                                rows={3}
                                value={editNoteText}
                                onChange={(e) => setEditNoteText(e.target.value)}
                                style={{ width: '100%', resize: 'none', border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 10px', fontSize: 13, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }}
                              />
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                                <select
                                  value={editNoteType}
                                  onChange={(e) => setEditNoteType(e.target.value)}
                                  style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: '6px 10px', fontSize: 13, outline: 'none' }}
                                >
                                  <option value="GENERAL">General</option>
                                  <option value="MEDICAL">Medical</option>
                                  <option value="BILLING">Billing</option>
                                  <option value="URGENT">Urgent</option>
                                </select>
                                <button type="button" onClick={() => handleSaveBookingNoteEdit(note.note_id)} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, borderRadius: 8, background: '#1e293b', border: 'none', padding: '6px 12px', fontSize: 12, fontWeight: 700, color: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>
                                  <Check style={{ width: 13, height: 13 }} /> Save
                                </button>
                                <button type="button" onClick={cancelEditBookingNote} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', padding: '6px 12px', fontSize: 12, fontWeight: 600, color: '#374151', cursor: 'pointer', fontFamily: 'inherit' }}>
                                  <X style={{ width: 13, height: 13 }} /> Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                                <p style={{ margin: 0, fontSize: 13.5, color: '#1f2937', lineHeight: 1.5 }}>{note.note_text}</p>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                                  <button type="button" onClick={() => startEditBookingNote(note)} title="Edit note" style={{ border: 'none', background: 'transparent', borderRadius: 6, padding: 6, color: '#9ca3af', cursor: 'pointer' }}>
                                    <Pencil style={{ width: 13.5, height: 13.5 }} />
                                  </button>
                                  <button type="button" onClick={() => handleDeleteBookingNote(note.note_id)} title="Delete note" style={{ border: 'none', background: 'transparent', borderRadius: 6, padding: 6, color: '#9ca3af', cursor: 'pointer' }}>
                                    <Trash2 style={{ width: 13.5, height: 13.5 }} />
                                  </button>
                                </div>
                              </div>
                              <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                <Pill>{note.note_type === 'GENERAL' ? 'General' : note.note_type === 'MEDICAL' ? 'Medical' : note.note_type === 'BILLING' ? 'Billing' : note.note_type === 'URGENT' ? 'Urgent' : note.note_type}</Pill>
                                <span style={{ fontSize: 11.5, color: '#9ca3af' }}>
                                  {note.created_by_name}
                                  {note.created_at && ` · ${new Date(note.created_at).toLocaleString('en-LK', { dateStyle: 'medium', timeStyle: 'short' })}`}
                                  {note.updated_at !== note.created_at && ' (edited)'}
                                </span>
                              </div>
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </Card>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════
              TAB: SETTLEMENT
          ══════════════════════════════════════════════════════ */}
          {activeSection === 'settlement' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16, alignItems: 'start' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <Card>
                  <CardTitle>Booking snapshot</CardTitle>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                    {[
                      { label: 'Booking code', value: bookingSummary.booking_code || '-', mono: true },
                      { label: 'Status',       value: bookingSummary.status       || '-' },
                      { label: 'Service',      value: bookingSummary.service_type || '-' },
                      { label: 'Start',        value: formatDate(bookingSummary.start_date) },
                      ...(isShiftBased ? [] : [{ label: 'Planned end', value: formatDate(bookingSummary.scheduled_end_time) }]),
                    ].map(({ label, value, mono }) => (
                      <div key={label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                        <span style={{ fontSize: 13, color: '#7A756A', whiteSpace: 'nowrap' }}>{label}</span>
                        <span style={{ fontSize: 13, fontWeight: 600, color: '#2A2722', fontFamily: mono ? "'JetBrains Mono',monospace" : 'inherit', textAlign: 'right' }}>{value}</span>
                      </div>
                    ))}
                  </div>
                </Card>

                <Card>
                  <CardTitle>Statement</CardTitle>
                  <p style={{ margin: '-10px 0 14px', fontSize: 12.5, color: '#9A9488' }}>Download the client billing statement.</p>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                    {[
                      { label: '7 days',   fn: () => { const t = new Date(); setStatementStartDate(toDateInput(addDays(t,-7))); setStatementEndDate(toDateInput(t)); } },
                      { label: '30 days',  fn: () => { const t = new Date(); setStatementStartDate(toDateInput(addDays(t,-30))); setStatementEndDate(toDateInput(t)); } },
                      { label: 'All time', fn: () => { setStatementStartDate('2000-01-01'); setStatementEndDate(toDateInput(new Date())); } },
                    ].map(({ label, fn }) => (
                      <button key={label} onClick={fn} style={{ flex: 1, fontSize: 12, fontWeight: 600, border: '1px solid #E7E1D6', borderRadius: 8, padding: '8px 0', color: '#5A554B', background: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>{label}</button>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                    <DateInput value={statementStartDate} onChange={e => setStatementStartDate(e.target.value)} style={{ ...inp, flex: 1 }} />
                    <DateInput value={statementEndDate} onChange={e => setStatementEndDate(e.target.value)} style={{ ...inp, flex: 1 }} />
                  </div>
                  <button onClick={downloadStatement} disabled={statementLoading || !statementClientId} style={{ width: '100%', background: statementLoading || !statementClientId ? '#d1d5db' : '#1e293b', border: 'none', borderRadius: 8, padding: '11px 12px', fontFamily: 'inherit', fontSize: 13.5, fontWeight: 700, color: '#fff', cursor: statementLoading || !statementClientId ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                    {statementLoading ? <Loader2 style={{ width: 16, height: 16, animation: 'spin 1s linear infinite' }} /> : <Download style={{ width: 16, height: 16 }} />}
                    Download statement PDF
                  </button>

                  {/* ── Transaction preview ── */}
                  <div style={{ marginTop: 18 }}>
                    <div style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: '#9ca3af', marginBottom: 8 }}>Preview</div>
                    {statementPreviewLoading ? (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px 0', gap: 8, color: '#9ca3af', fontSize: 13 }}>
                        <Loader2 style={{ width: 14, height: 14, animation: 'spin 1s linear infinite' }} /> Loading…
                      </div>
                    ) : !statementPreview ? (
                      <div style={{ textAlign: 'center', padding: '20px 0', fontSize: 12.5, color: '#9ca3af' }}>No data</div>
                    ) : (
                      <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden' }}>
                        {/* Summary strip */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', background: '#f9fafb', borderBottom: '1px solid #e5e7eb', padding: '10px 14px', gap: 8 }}>
                          {[
                            { label: 'Invoiced', value: statementPreview.account_summary?.invoiced_amount },
                            { label: 'Paid', value: statementPreview.account_summary?.amount_paid },
                            { label: 'Balance', value: statementPreview.account_summary?.balance_due },
                          ].map(({ label, value }) => {
                            const n = parseFloat(value || 0);
                            const isBalance = label === 'Balance';
                            const color = isBalance ? (n > 0 ? '#dc2626' : '#16a34a') : '#111827';
                            return (
                              <div key={label}>
                                <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '.05em', textTransform: 'uppercase', color: '#9ca3af', marginBottom: 2 }}>{label}</div>
                                <div style={{ fontSize: 13, fontWeight: 700, color, fontFamily: "'JetBrains Mono',monospace" }}>Rs.{Math.abs(n).toLocaleString()}</div>
                              </div>
                            );
                          })}
                        </div>
                        {/* Ledger table */}
                        {statementPreview.ledger?.length === 0 ? (
                          <div style={{ textAlign: 'center', padding: '16px 0', fontSize: 12.5, color: '#9ca3af' }}>No transactions in this period.</div>
                        ) : (
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                            <thead>
                              <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                                {['Date', 'Description', 'Invoiced', 'Paid', 'Balance'].map(h => (
                                  <th key={h} style={{ padding: '5px 8px', textAlign: h === 'Date' || h === 'Description' ? 'left' : 'right', fontSize: 9.5, fontWeight: 600, letterSpacing: '.05em', textTransform: 'uppercase', color: '#9ca3af' }}>{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {statementPreview.ledger.map((row, i) => {
                                const isInvoice = row.row_type === 'INVOICE';
                                return (
                                  <tr key={row.transaction_id} style={{ borderTop: i > 0 ? '1px solid #f3f4f6' : 'none' }}>
                                    <td style={{ padding: '5px 8px', color: '#6b7280', whiteSpace: 'nowrap', fontSize: 11 }}>
                                      {new Date(row.date).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                                    </td>
                                    <td style={{ padding: '5px 8px', color: '#374151', maxWidth: 130 }}>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                        <span style={{ width: 5, height: 5, borderRadius: '50%', flexShrink: 0, background: isInvoice ? '#f59e0b' : '#22c55e' }} />
                                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 11 }}>{row.details || row.transactions || '—'}</span>
                                      </div>
                                    </td>
                                    <td style={{ padding: '5px 8px', textAlign: 'right', fontFamily: "'JetBrains Mono',monospace", fontSize: 10.5, color: isInvoice ? '#b45309' : '#9ca3af' }}>
                                      {isInvoice ? `Rs.${parseFloat(row.amount_invoiced).toLocaleString()}` : '—'}
                                    </td>
                                    <td style={{ padding: '5px 8px', textAlign: 'right', fontFamily: "'JetBrains Mono',monospace", fontSize: 10.5, color: !isInvoice ? '#16a34a' : '#9ca3af' }}>
                                      {!isInvoice ? `Rs.${parseFloat(row.amount_paid).toLocaleString()}` : '—'}
                                    </td>
                                    <td style={{ padding: '5px 8px', textAlign: 'right', fontFamily: "'JetBrains Mono',monospace", fontSize: 10.5, fontWeight: 600, color: parseFloat(row.balance) > 0 ? '#dc2626' : '#16a34a' }}>
                                      Rs.{Math.abs(parseFloat(row.balance)).toLocaleString()}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        )}
                      </div>
                    )}
                  </div>
                </Card>
              </div>

              {/* Close-out / terminated info */}
              {isPaused ? (
                <Card>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 16px', textAlign: 'center' }}>
                    <Pause style={{ width: 32, height: 32, color: '#E0CDA0', marginBottom: 12 }} />
                    <p style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 700, color: '#2A2722' }}>Booking paused</p>
                    <p style={{ margin: 0, fontSize: 13, color: '#9A9488' }}>
                      Paused on {formatDate(openPause?.paused_date)}
                      {openPause?.resume_date ? ` — target resume ${formatDate(openPause.resume_date)}` : ' — no resume date set'}
                    </p>
                    {openPause?.reason && (
                      <p style={{ margin: '8px 0 0', fontSize: 12.5, color: '#7A756A', maxWidth: 320 }}>&ldquo;{openPause.reason}&rdquo;</p>
                    )}
                    <p style={{ margin: '10px 0 0', fontSize: 11.5, color: '#B8893D' }}>No billing or staff pay happens while paused.</p>
                    <button
                      onClick={handleResume}
                      disabled={resumeBusy}
                      style={{ marginTop: 16, display: 'inline-flex', alignItems: 'center', gap: 7, background: '#137A6B', border: 'none', borderRadius: 8, padding: '9px 16px', fontFamily: 'inherit', fontSize: 13, fontWeight: 700, color: '#fff', cursor: resumeBusy ? 'default' : 'pointer', opacity: resumeBusy ? 0.6 : 1 }}
                    >
                      {resumeBusy ? <Loader2 style={{ width: 14, height: 14 }} className="animate-spin" /> : <Play style={{ width: 14, height: 14 }} />} Resume Booking
                    </button>
                  </div>
                </Card>
              ) : isTerminated ? (
                <Card>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px 16px', textAlign: 'center' }}>
                    <XCircle style={{ width: 32, height: 32, color: '#F5C9C5', marginBottom: 12 }} />
                    <p style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 700, color: '#2A2722' }}>Booking terminated</p>
                    <p style={{ margin: 0, fontSize: 13, color: '#9A9488' }}>Terminated on {formatDate(bookingSummary.actual_end_time || bookingSummary.updated_at)}</p>
                  </div>
                </Card>
              ) : scheduledFinalization ? (
                <Card>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px 16px', textAlign: 'center' }}>
                    <AlertTriangle style={{ width: 32, height: 32, color: scheduledTermination ? '#F5C9C5' : '#A8D9BE', marginBottom: 12 }} />
                    <p style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 700, color: '#2A2722' }}>
                      {scheduledTermination ? 'Termination' : 'Completion'} scheduled for {formatDate(scheduledFinalization.effective_date)}
                    </p>
                    <p style={{ margin: 0, fontSize: 13, color: '#9A9488' }}>The booking stays active and billed until then.</p>
                  </div>
                </Card>
              ) : (
                <Card>
                  <CardTitle>Close out booking</CardTitle>
                  <p style={{ margin: '-10px 0 18px', fontSize: 12.5, color: '#9A9488' }}>Complete or terminate with a settlement decision.</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div>
                      <label style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: '#7A756A', marginBottom: 5 }}>Actual end time</label>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <DateInput value={actualEndDatePart} onChange={e => setActualEndDatePart(e.target.value)} style={{ ...inp, flex: 1 }} />
                        <TimeInput value={actualEndTimePart} onChange={e => setActualEndTimePart(e.target.value)} style={{ ...inp, width: 130 }} />
                      </div>
                      {actualEndTime && actualEndTime.slice(0, 10) > toDateInput(new Date()) && (
                        <p style={{ margin: '6px 0 0', fontSize: 11.5, color: '#B8893D' }}>
                          Future date — this will be scheduled. The booking stays active and billed until then, then completes/terminates automatically.
                        </p>
                      )}
                    </div>
                    {projectedRemainingBalance > 0 && (
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                          <label style={{ fontSize: 11.5, fontWeight: 600, color: '#7A756A' }}>Unused prepayment ({formatMoney(projectedRemainingBalance)})</label>
                          {overdueAmount > 0 && <span style={{ fontSize: 11.5, fontWeight: 600, color: '#BC4338', background: '#F7E6E3', borderRadius: 8, padding: '3px 10px' }}>{formatMoney(overdueAmount)} due</span>}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {[
                            { value: 'BANK_REFUND',    title: 'Refund to client',           desc: 'Return it to the client. Money leaves the company.' },
                            { value: 'WALLET_DEPOSIT', title: 'Add to client wallet',       desc: 'Keep it in the wallet, free for their other bookings.' },
                            { value: 'NO_REFUND',      title: 'Waive as additional income', desc: 'The client forfeits it and the company keeps it. A note is required.' },
                          ].map(({ value, title, desc }) => (
                            <div key={value} onClick={() => setSettlementAction(value)} style={{ cursor: 'pointer', borderRadius: 12, padding: '12px 14px', border: settlementAction === value ? '1.5px solid #137A6B' : '1px solid #E7E1D6', background: settlementAction === value ? '#E4F1ED' : '#FCFBF8', transition: 'all .15s' }}>
                              <div style={{ fontSize: 13.5, fontWeight: 700, color: '#2A2722' }}>{title}</div>
                              <div style={{ fontSize: 12, color: '#7A756A', marginTop: 3 }}>{desc}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    <div>
                      <label style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: '#7A756A', marginBottom: 5 }}>Settlement note</label>
                      <textarea rows={3} placeholder="Explain the settlement decision…" value={settlementNote} onChange={e => setSettlementNote(e.target.value)} style={{ ...inp, resize: 'none' }} />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: '#7A756A', marginBottom: 5 }}>Reason (optional)</label>
                      <textarea rows={2} placeholder="Optional admin note" value={reason} onChange={e => setReason(e.target.value)} style={{ ...inp, resize: 'none' }} />
                    </div>
                    <div style={{ display: 'flex', gap: 10 }}>
                      <button onClick={() => { setActionsModalMode('complete'); openActionsModal(); }} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, background: '#1e293b', border: 'none', borderRadius: 8, padding: '11px 12px', fontFamily: 'inherit', fontSize: 13.5, fontWeight: 700, color: '#fff', cursor: 'pointer' }}>
                        <CheckCircle style={{ width: 15, height: 15 }} /> Complete booking
                      </button>
                      <button onClick={() => { setActionsModalMode('terminate'); openActionsModal(); }} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, background: '#fff', border: '1px solid #fca5a5', borderRadius: 8, padding: '11px 12px', fontFamily: 'inherit', fontSize: 13.5, fontWeight: 700, color: '#dc2626', cursor: 'pointer' }}>
                        <XCircle style={{ width: 15, height: 15 }} /> Terminate
                      </button>
                    </div>
                  </div>
                </Card>
              )}
            </div>
          )}

          {/* ══════════════════════════════════════════════════════
              TAB: TERMINATION
          ══════════════════════════════════════════════════════ */}
          {activeSection === 'termination' && (
            <Card>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                <div style={{ background: '#F7E6E3', borderRadius: '50%', padding: 8 }}><AlertTriangle style={{ width: 16, height: 16, color: '#BC4338' }} /></div>
                <h3 style={{ margin: 0, fontSize: 15.5, fontWeight: 700 }}>Termination requests</h3>
              </div>
              {terminationReqs.length === 0 ? <Empty icon={AlertTriangle} text="No termination requests recorded for this booking." /> : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
                  {terminationReqs.map((req, i) => (
                    <div key={req.termination_id || i} style={{ background: '#FBF9F4', border: '1px solid #EFEAE0', borderRadius: 13, padding: '15px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
                        <div>
                          <p style={{ margin: '0 0 2px', fontWeight: 700, fontSize: 13.5, color: '#2A2722' }}>{req.requested_by_name || req.requested_by || 'Termination request'}</p>
                          <p style={{ margin: 0, fontSize: 12, color: '#A39D91' }}>Requested {formatDT(req.requested_at || req.created_at)}</p>
                        </div>
                        <Pill tone={req.status === 'APPROVED' ? 'green' : req.status === 'REJECTED' ? 'rose' : 'amber'}>{req.status || 'Pending'}</Pill>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 13, marginBottom: 10 }}>
                        <Field label="Requested end" value={formatDT(req.requested_end_time || req.requested_end_date)} />
                        <Field label="Approved end"  value={formatDT(req.end_time || req.approved_end_time)} />
                      </div>
                      <p style={{ margin: 0, fontSize: 13, color: '#5A554B' }}>{req.reason || req.request_reason || 'No reason provided.'}</p>
                      {req.status === 'REJECTED' && req.rejection_reason && (
                        <p style={{ margin: '8px 0 0', fontSize: 12.5, color: '#BC4338', background: '#F7E6E3', borderRadius: 8, padding: '8px 10px' }}>
                          Rejected: {req.rejection_reason}
                        </p>
                      )}
                      {(req.status === 'PENDING' || !req.status) && (
                        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                          <button
                            onClick={() => openApproveTermModal(req)}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#137A6B', border: 'none', borderRadius: 8, padding: '7px 14px', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 700, color: '#fff', cursor: 'pointer' }}
                          >
                            <CheckCircle style={{ width: 13, height: 13 }} /> Approve
                          </button>
                          <button
                            onClick={() => openRejectTermModal(req)}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#fff', border: '1px solid #F5C9C5', borderRadius: 8, padding: '7px 14px', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 700, color: '#BC4338', cursor: 'pointer' }}
                          >
                            <XCircle style={{ width: 13, height: 13 }} /> Reject
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}

        </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════
          RESUME — STAFF (RE)ASSIGNMENT MODAL
      ══════════════════════════════════════════════════════ */}
      {showResumeAssignModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl flex flex-col max-h-[90vh]">
            <div className="flex items-start justify-between p-6 border-b border-[#ECE7DF] shrink-0">
              <div>
                <h2 className="text-lg font-bold text-[#2A2722]">Assign Staff for Resumed Period</h2>
                <p className="text-xs text-[#9A9488] mt-1">
                  {isShiftBased ? 'Pre-filled with the shift pattern and staff from before the pause — still fully editable.' : 'Pre-filled with whoever was assigned before the pause — still fully editable.'}
                </p>
              </div>
              <button onClick={closeResumeAssignModal} className="p-1.5 rounded-lg hover:bg-[#F6F3EC] transition ml-4 shrink-0"><XCircle className="h-5 w-5 text-[#A39D91]" /></button>
            </div>

            <div className="p-6 space-y-4 overflow-y-auto">
              {resumeAssignLoading ? (
                <div className="flex items-center justify-center py-10 text-[#9A9488]"><Loader2 className="h-5 w-5 animate-spin" /></div>
              ) : (
                <>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label className="block text-xs font-semibold text-[#7A756A] mb-1.5">Service Start Date</label>
                      <DateInput value={resumeAssignForm.service_start_date} onChange={e => setResumeAssignForm(f => ({ ...f, service_start_date: e.target.value }))} className="w-full border border-[#E2DCD0] rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#137A6B] bg-[#FCFBF8]" />
                    </div>
                    {!isShiftBased && (
                      <div>
                        <label className="block text-xs font-semibold text-[#7A756A] mb-1.5">Service Start Time <span className="text-[#C4BFB5] font-normal">(optional)</span></label>
                        <TimeInput value={resumeAssignForm.service_start_time} onChange={e => setResumeAssignForm(f => ({ ...f, service_start_time: e.target.value }))} className="w-full border border-[#E2DCD0] rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#137A6B] bg-[#FCFBF8]" />
                      </div>
                    )}
                  </div>

                  {!isShiftBased && (
                    <>
                      <div>
                        <label className="block text-xs font-semibold text-[#7A756A] mb-1.5">Staff Member</label>
                        <select
                          value={resumeAssignForm.staff_profile_id}
                          onChange={e => setResumeAssignForm(f => ({ ...f, staff_profile_id: e.target.value }))}
                          className="w-full border border-[#E2DCD0] rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#137A6B] bg-[#FCFBF8]"
                        >
                          <option value="">Select staff member</option>
                          {resumeAssignStaff.map((s) => (
                            <option key={s.staff_profile_id} value={s.staff_profile_id}>{s.staff_name} — {s.specialization}</option>
                          ))}
                        </select>
                        {resumeAssignForm.staff_profile_id && !resumeAssignStaff.some(s => s.staff_profile_id === resumeAssignForm.staff_profile_id) && (
                          <p className="mt-1.5 text-xs text-amber-600">The previously-assigned staff member isn't currently available — pick someone else.</p>
                        )}
                      </div>
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div>
                          <label className="block text-xs font-semibold text-[#7A756A] mb-1.5">Daily Rate (Staff)</label>
                          <input type="number" min="0" step="0.01" value={resumeAssignForm.daily_rate} onChange={e => setResumeAssignForm(f => ({ ...f, daily_rate: e.target.value }))} onWheel={e => e.currentTarget.blur()} className="w-full border border-[#E2DCD0] rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#137A6B] bg-[#FCFBF8]" />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-[#7A756A] mb-1.5">OT Rate <span className="text-[#C4BFB5] font-normal">(optional)</span></label>
                          <input type="number" min="0" step="0.01" value={resumeAssignForm.ot_rate} onChange={e => setResumeAssignForm(f => ({ ...f, ot_rate: e.target.value }))} onWheel={e => e.currentTarget.blur()} className="w-full border border-[#E2DCD0] rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#137A6B] bg-[#FCFBF8]" />
                        </div>
                      </div>
                    </>
                  )}

                  {isShiftBased && (
                    <div className="rounded-xl border border-[#E2DCD0] overflow-hidden">
                      <div className="flex items-center justify-between border-b border-[#E2DCD0] bg-[#FBF9F4] px-4 py-2.5">
                        <p className="text-[11px] font-medium uppercase tracking-wider text-[#9A9488]">Shift Schedule</p>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-[#7A756A]">Shifts per day</span>
                          <select value={resumeShiftSlots.length} onChange={e => handleResumeShiftCountChange(parseInt(e.target.value, 10))} className="rounded-lg border border-[#E2DCD0] bg-white px-2.5 py-1 text-sm text-[#5A554B] outline-none focus:border-[#137A6B]">
                            {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}
                          </select>
                        </div>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-[#EFEAE0] bg-[#FBF9F4]">
                              <th className="px-3 py-2 text-left text-[10.5px] font-medium uppercase tracking-wider text-[#9A9488] w-14">Shift</th>
                              <th className="px-2 py-2 text-left text-[10.5px] font-medium uppercase tracking-wider text-[#9A9488]">Label</th>
                              <th className="px-2 py-2 text-left text-[10.5px] font-medium uppercase tracking-wider text-[#9A9488] w-24">Start</th>
                              <th className="px-2 py-2 text-left text-[10.5px] font-medium uppercase tracking-wider text-[#9A9488] w-20">Hours</th>
                              <th className="px-2 py-2 text-left text-[10.5px] font-medium uppercase tracking-wider text-[#9A9488]">Staff</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[#EFEAE0]">
                            {resumeShiftSlots.map((slot, idx) => (
                              <tr key={slot.shift_number}>
                                <td className="px-3 py-2">
                                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#F6F3EC] text-xs font-semibold text-[#5A554B]">{slot.shift_number}</span>
                                </td>
                                <td className="px-2 py-2">
                                  <input value={slot.label} onChange={e => updateResumeShiftSlot(idx, 'label', e.target.value)} placeholder={`Shift ${slot.shift_number}`} className="w-full rounded-lg border border-[#E2DCD0] px-2 py-1.5 text-sm outline-none focus:border-[#137A6B]" />
                                </td>
                                <td className="px-2 py-2">
                                  <TimeInput required value={slot.start_time} onChange={e => updateResumeShiftSlot(idx, 'start_time', e.target.value)} className="w-full rounded-lg border border-[#E2DCD0] px-2 py-1.5 text-sm outline-none focus:border-[#137A6B]" />
                                </td>
                                <td className="px-2 py-2">
                                  <input required type="number" min="0.5" step="0.5" value={slot.duration_hours} onChange={e => updateResumeShiftSlot(idx, 'duration_hours', e.target.value)} onWheel={e => e.currentTarget.blur()} className="w-full rounded-lg border border-[#E2DCD0] px-2 py-1.5 text-sm outline-none focus:border-[#137A6B]" />
                                </td>
                                <td className="px-2 py-2">
                                  <select required value={slot.staff_profile_id} onChange={e => updateResumeShiftSlot(idx, 'staff_profile_id', e.target.value)} className="w-full rounded-lg border border-[#E2DCD0] px-2 py-1.5 text-sm outline-none focus:border-[#137A6B]">
                                    <option value="">Select staff…</option>
                                    {resumeAssignStaff.map((s) => (
                                      <option key={s.staff_profile_id} value={s.staff_profile_id}>{s.staff_name} — {s.specialization}</option>
                                    ))}
                                  </select>
                                  {slot.staff_profile_id && !resumeAssignStaff.some(s => s.staff_profile_id === slot.staff_profile_id) && (
                                    <p className="mt-1 text-[10.5px] text-amber-600">Not currently available — pick someone else.</p>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-semibold text-[#7A756A] mb-1.5">Notes <span className="text-[#C4BFB5] font-normal">(optional)</span></label>
                    <input value={resumeAssignForm.notes} onChange={e => setResumeAssignForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional note for this assignment" className="w-full border border-[#E2DCD0] rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#137A6B] bg-[#FCFBF8]" />
                  </div>

                  {resumeAssignError && (
                    <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-sm text-rose-700">{resumeAssignError}</div>
                  )}
                </>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 p-6 border-t border-[#ECE7DF] shrink-0">
              <button onClick={closeResumeAssignModal} disabled={resumeAssignSubmitting} className="text-sm font-semibold text-[#7A756A] hover:text-[#2A2722] transition disabled:opacity-40">Cancel</button>
              <button onClick={handleResumeAssignSubmit} disabled={resumeAssignSubmitting || resumeAssignLoading} className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-bold text-white bg-[#137A6B] hover:bg-[#0f5e53] rounded-xl transition disabled:opacity-60">
                {resumeAssignSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Users className="h-4 w-4" />}
                {resumeAssignSubmitting ? 'Assigning…' : (isShiftBased ? 'Create Shift Pattern & Assign Staff' : 'Assign Staff Member')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          PAUSE BOOKING MODAL
      ══════════════════════════════════════════════════════ */}
      {showPauseModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md flex flex-col">
            <div className="flex items-start justify-between p-6 border-b border-[#ECE7DF]">
              <div>
                <h2 className="text-lg font-bold text-[#2A2722]">Pause Booking</h2>
                <p className="text-xs text-[#9A9488] mt-1">Frees up the assigned staff and stops billing until resumed.</p>
              </div>
              <button onClick={closePauseModal} className="p-1.5 rounded-lg hover:bg-[#F6F3EC] transition ml-4 shrink-0"><XCircle className="h-5 w-5 text-[#A39D91]" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#7A756A] mb-1.5">Target resume date <span className="text-[#C4BFB5] font-normal">(optional)</span></label>
                <DateInput value={pauseResumeDate} onChange={e => handlePauseResumeDateChange(e.target.value)} min={todayISO()} className="w-full border border-[#E2DCD0] rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#137A6B] bg-[#FCFBF8]" />
                <p className="mt-1.5 text-xs text-[#9A9488]">A reminder only — the booking won't resume automatically. Leave blank to pause indefinitely.</p>
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#7A756A] mb-1.5">Reason <span className="text-[#C4BFB5] font-normal">(optional)</span></label>
                <textarea rows={3} value={pauseReason} onChange={e => setPauseReason(e.target.value)} placeholder="e.g. Client traveling, will resume next month" className="w-full border border-[#E2DCD0] rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#137A6B] bg-[#FCFBF8] resize-none" />
              </div>
              {pauseResumeDate && scheduledFinalization && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3.5">
                  <p className="text-xs font-semibold text-amber-900">
                    This booking has a {scheduledTermination ? 'termination' : 'completion'} scheduled for {formatDate(scheduledFinalization.effective_date)} — that date no longer makes sense once paused.
                  </p>
                  <div className="mt-2.5 space-y-2">
                    <label className="flex items-start gap-2 text-xs text-amber-900 cursor-pointer">
                      <input type="radio" checked={pauseEndDateAction === 'RESCHEDULE'} onChange={() => setPauseEndDateAction('RESCHEDULE')} className="mt-0.5" />
                      <span>
                        Reschedule it to
                        <DateInput
                          value={pauseNewEndDate}
                          onChange={e => setPauseNewEndDate(e.target.value)}
                          min={pauseResumeDate}
                          disabled={pauseEndDateAction !== 'RESCHEDULE'}
                          className="ml-1.5 inline-block w-32 border border-amber-300 rounded-lg px-2 py-1 text-xs outline-none focus:border-[#137A6B] bg-white disabled:opacity-50"
                        />
                      </span>
                    </label>
                    <label className="flex items-start gap-2 text-xs text-amber-900 cursor-pointer">
                      <input type="radio" checked={pauseEndDateAction === 'CLEAR'} onChange={() => setPauseEndDateAction('CLEAR')} className="mt-0.5" />
                      <span>Leave active — no scheduled end until I set one later or end the booking myself.</span>
                    </label>
                  </div>
                </div>
              )}
              {pauseModalError && (
                <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-sm text-rose-700">{pauseModalError}</div>
              )}
            </div>
            <div className="flex items-center justify-end gap-2 p-6 border-t border-[#ECE7DF]">
              <button onClick={closePauseModal} disabled={pauseModalBusy} className="text-sm font-semibold text-[#7A756A] hover:text-[#2A2722] transition disabled:opacity-40">Cancel</button>
              <button onClick={handlePauseSubmit} disabled={pauseModalBusy} className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-bold text-white bg-[#92400e] hover:bg-[#7a3609] rounded-xl transition disabled:opacity-60">
                {pauseModalBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pause className="h-4 w-4" />}
                {pauseModalBusy ? 'Pausing…' : 'Pause Booking'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          ACTIONS MODAL
      ══════════════════════════════════════════════════════ */}
      {showActionsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg flex flex-col max-h-[90vh]">
            <div className="flex items-start justify-between p-6 border-b border-[#ECE7DF] shrink-0">
              <div>
                <h2 className="text-lg font-bold text-[#2A2722]">Close Out Booking</h2>
                <p className="text-sm text-[#9A9488] mt-0.5">
                  {actionsModalStep === 1 ? 'Choose how to close this booking' : actionsModalStep === 2 ? 'Decide what to do with the remaining balance' : 'Review and confirm — this action is irreversible'}
                </p>
              </div>
              <button onClick={closeActionsModal} className="p-1.5 rounded-lg hover:bg-[#F6F3EC] transition ml-4 shrink-0"><XCircle className="h-5 w-5 text-[#A39D91]" /></button>
            </div>
            {(() => {
              const total = projectedRemainingBalance > 0 ? 3 : 2;
              const current = actionsModalStep === 3 ? total : actionsModalStep;
              return (
                <div className="flex items-center gap-2 px-6 pt-4 shrink-0">
                  {Array.from({ length: total }, (_, i) => i + 1).map(s => (
                    <div key={s} className={`h-1.5 flex-1 rounded-full transition-all ${s <= current ? 'bg-gray-800' : 'bg-gray-200'}`} />
                  ))}
                  <span className="text-xs text-[#9A9488] ml-1 shrink-0">Step {current} of {total}</span>
                </div>
              );
            })()}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {actionsModalStep === 1 && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { mode: 'complete', icon: CheckCircle, label: 'Complete', desc: 'Service finished as planned', activeBorder: 'border-gray-700 bg-gray-50', activeIcon: 'text-gray-800' },
                      { mode: 'terminate', icon: XCircle, label: 'Terminate', desc: 'End early before service concludes', activeBorder: 'border-red-400 bg-red-50', activeIcon: 'text-red-600' },
                    ].map(({ mode, icon: Icon, label, desc, activeBorder, activeIcon }) => (
                      <div key={mode} onClick={() => setActionsModalMode(mode)} className={`cursor-pointer rounded-xl p-4 border-2 transition ${actionsModalMode === mode ? activeBorder : 'border-[#E7E1D6] hover:border-slate-300'}`}>
                        <Icon className={`h-5 w-5 mb-2 ${actionsModalMode === mode ? activeIcon : 'text-[#C4BFB5]'}`} />
                        <div className="text-sm font-bold text-[#2A2722]">{label}</div>
                        <div className="text-xs text-[#7A756A] mt-0.5">{desc}</div>
                      </div>
                    ))}
                  </div>
                  {actionsModalMode && (
                    <>
                      <div>
                        <label className="block text-xs font-semibold text-[#7A756A] mb-1.5">Actual end date &amp; time</label>
                        <div className="flex gap-2">
                          <DateInput value={actualEndDatePart} onChange={e => setActualEndDatePart(e.target.value)} className="flex-1 border border-[#E2DCD0] rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#137A6B] bg-[#FCFBF8] text-[#6F6A60]" />
                          <TimeInput value={actualEndTimePart} onChange={e => setActualEndTimePart(e.target.value)} className="w-32 border border-[#E2DCD0] rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#137A6B] bg-[#FCFBF8] text-[#6F6A60]" />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-[#7A756A] mb-1.5">Reason <span className="text-[#C4BFB5] font-normal">(optional)</span></label>
                        <textarea rows={3} value={reason} onChange={e => setReason(e.target.value)} placeholder={actionsModalMode === 'complete' ? 'e.g. Service completed as per contract' : 'e.g. Client requested early termination'} className="w-full border border-[#E2DCD0] rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#137A6B] bg-[#FCFBF8] resize-none" />
                      </div>
                    </>
                  )}
                </>
              )}
              {actionsModalStep === 2 && (
                <>
                  <div className="rounded-xl border border-[#ECE7DF] bg-[#FBF9F4] p-4">
                    <div className="text-xs font-semibold uppercase tracking-wider text-[#9A9488] mb-1">
                      Unused prepayment for this booking
                    </div>
                    <div className="text-2xl font-extrabold text-[#2A2722] tracking-tight">{formatMoney(projectedRemainingBalance)}</div>
                    <div className="text-xs text-[#7A756A] mt-1">
                      Paid for days/shifts that were never delivered. Choose what happens to it.
                    </div>
                  </div>
                  <div className="flex flex-col gap-2.5">
                    {[
                      { value: 'BANK_REFUND',    icon: DollarSign, label: 'Refund to client',           desc: `Return ${formatMoney(projectedRemainingBalance)} to the client. Money leaves the company.`,       activeCls: 'border-blue-400 bg-blue-50',     activeIcon: 'text-blue-600' },
                      { value: 'WALLET_DEPOSIT', icon: Wallet,     label: 'Add to client wallet',       desc: `Keep ${formatMoney(projectedRemainingBalance)} in the wallet, free for their other bookings.`,  activeCls: 'border-violet-400 bg-violet-50', activeIcon: 'text-violet-600' },
                      { value: 'NO_REFUND',      icon: XCircle,    label: 'Waive as additional income', desc: 'The client forfeits it and the company keeps it as income. A written explanation is required.', activeCls: 'border-[#BC4338] bg-rose-50',    activeIcon: 'text-[#BC4338]' },
                    ].map(({ value, icon: Icon, label, desc, activeCls, activeIcon }) => (
                      <div key={value} onClick={() => { setSettlementAction(value); setActionsModalError(''); }} className={`cursor-pointer rounded-xl p-4 border-2 transition flex items-start gap-3 ${settlementAction === value ? activeCls : 'border-[#E7E1D6] hover:border-slate-300'}`}>
                        <Icon className={`h-5 w-5 mt-0.5 flex-shrink-0 ${settlementAction === value ? activeIcon : 'text-[#C4BFB5]'}`} />
                        <div><div className="text-sm font-bold text-[#2A2722]">{label}</div><div className="text-xs text-[#7A756A] mt-0.5">{desc}</div></div>
                      </div>
                    ))}
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#7A756A] mb-1.5">Settlement note {settlementAction === 'NO_REFUND' ? <span className="text-[#BC4338] ml-1">*</span> : <span className="text-[#C4BFB5] font-normal ml-1">(optional)</span>}</label>
                    <textarea rows={3} value={settlementNote} onChange={e => { setSettlementNote(e.target.value); setActionsModalError(''); }} placeholder={settlementAction === 'NO_REFUND' ? 'Required — explain why the client forfeits this amount' : 'Any notes about this settlement…'} className={`w-full border rounded-xl px-3 py-2.5 text-sm outline-none bg-[#FCFBF8] resize-none ${actionsModalError ? 'border-rose-300' : 'border-[#E2DCD0] focus:border-[#137A6B]'}`} />
                  </div>
                  {actionsModalError && <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{actionsModalError}</div>}
                </>
              )}
              {actionsModalStep === 3 && (
                <>
                  <div className="rounded-xl bg-amber-50 border border-amber-200 p-4">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
                      <div>
                        <div className="text-sm font-bold text-amber-900">This action is irreversible</div>
                        <div className="text-xs text-amber-700 mt-1">Once confirmed, this booking will be permanently {actionsModalMode === 'complete' ? 'marked as completed' : 'terminated'}.</div>
                      </div>
                    </div>
                  </div>
                  <div className="rounded-xl border border-[#ECE7DF] bg-[#FBF9F4] p-4">
                    <div className="text-xs font-bold uppercase tracking-wider text-[#9A9488] mb-3">Summary</div>
                    <div className="flex flex-col gap-2.5">
                      {[
                        { label: 'Action', value: actionsModalMode === 'complete' ? 'Complete booking' : 'Terminate booking', colored: actionsModalMode === 'complete' ? '#137A6B' : '#BC4338' },
                        { label: 'Booking', value: bookingSummary.booking_code || bookingId, mono: true },
                        { label: 'End time', value: formatDT(actualEndTime) },
                        ...(projectedRemainingBalance > 0 ? [
                          { label: actionsTargetDate > toDateInput(new Date()) ? 'Projected balance on end date' : 'Remaining balance', value: formatMoney(projectedRemainingBalance) },
                          { label: 'Settlement', value: settlementAction === 'WALLET_DEPOSIT' ? 'Add to client wallet' : settlementAction === 'BANK_REFUND' ? 'Refund to client' : 'Waive as additional income' },
                        ] : []),
                        ...(reason.trim() ? [{ label: 'Reason', value: reason.trim() }] : []),
                      ].map(({ label, value, mono, colored }) => (
                        <div key={label} className="flex items-center justify-between gap-4">
                          <span className="text-sm text-[#6F6A60]">{label}</span>
                          <span className={`text-sm font-semibold ${mono ? 'font-mono' : ''}`} style={{ color: colored || '#2A2722' }}>{value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  {actionsModalError && <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{actionsModalError}</div>}
                </>
              )}
            </div>
            <div className="flex items-center justify-between px-6 py-4 border-t border-[#ECE7DF] shrink-0">
              <button onClick={actionsModalStep === 1 ? closeActionsModal : handleActionsBack} disabled={actionsModalLoading} className="text-sm font-semibold text-[#7A756A] hover:text-[#2A2722] transition disabled:opacity-40">
                {actionsModalStep === 1 ? 'Cancel' : '← Back'}
              </button>
              {actionsModalStep < 3 ? (
                <button onClick={handleActionsNext} disabled={actionsModalStep === 1 && !actionsModalMode} className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-bold text-white bg-gray-800 hover:bg-gray-900 rounded-xl transition disabled:opacity-40 disabled:cursor-not-allowed">
                  Continue →
                </button>
              ) : (
                <button onClick={handleActionsSubmit} disabled={actionsModalLoading} className={`inline-flex items-center gap-2 px-5 py-2.5 text-sm font-bold text-white rounded-xl transition disabled:opacity-60 ${actionsModalMode === 'complete' ? 'bg-gray-800 hover:bg-gray-900' : 'bg-red-600 hover:bg-red-700'}`}>
                  {actionsModalLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : actionsModalMode === 'complete' ? <CheckCircle className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                  {actionsModalLoading ? 'Processing…' : `Confirm ${actionsModalMode === 'complete' ? 'Complete' : 'Terminate'}`}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          SWAP MODAL
      ══════════════════════════════════════════════════════ */}
      {showSwapModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col">
            <div className="flex items-start justify-between p-6 border-b border-slate-200 shrink-0">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  {swapModalSlotId ? (() => { const slot = shiftSlots.find(s => s.shift_slot_id === swapModalSlotId); return `${swapModalIsAssign ? 'Assign Staff' : 'Reassign Staff'} — ${slot?.label || (slot?.shift_number ? `Shift ${slot.shift_number}` : 'Shift')}`; })() : 'Swap Staff Member'}
                </h2>
                <p className="text-sm text-slate-500 mt-0.5">
                  {swapModalStep === 1
                    ? 'Select a replacement from available staff'
                    : swapModalSlotId
                      ? (swapModalIsAssign ? `Assign ${swapModalSelectedStaff?.full_name} to this shift` : `Confirm: current staff → ${swapModalSelectedStaff?.full_name}`)
                      : `Confirm: ${normCurrentStaff?.name || 'Current staff'} → ${swapModalSelectedStaff?.full_name}`}
                </p>
              </div>
              <button onClick={closeSwapModal} className="p-1.5 rounded-lg hover:bg-slate-100 transition shrink-0 ml-4"><XCircle className="h-5 w-5 text-slate-400" /></button>
            </div>

            {swapModalStep === 1 && (() => {
              const PAGE_SIZE = 4;
              const designations = [...new Set(availableStaff.map(s => s.designation).filter(Boolean))].sort();
              const filtered = availableStaff.filter(s =>
                staffMatchesQuery(s, swapModalSearch) &&
                (!swapModalDesignation || s.designation === swapModalDesignation)
              );
              const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
              const paginated = filtered.slice((swapModalPage - 1) * PAGE_SIZE, swapModalPage * PAGE_SIZE);
              return (
                <>
                  <div className="px-6 py-3 border-b border-slate-100 shrink-0 space-y-2">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                      <input type="text" autoFocus placeholder="Search by name, phone (0778885555 / +94778885555 / 778885555), staff ID (EMP-0541 / 0541), or designation…" value={swapModalSearch} onChange={e => { setSwapModalSearch(e.target.value); setSwapModalPage(1); }} className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
                    </div>
                    {designations.length > 0 && (
                      <div className="flex items-center gap-2 flex-wrap">
                        <button onClick={() => { setSwapModalDesignation(''); setSwapModalPage(1); }} className={`px-3 py-1 rounded-full text-xs font-medium transition ${!swapModalDesignation ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>All</button>
                        {designations.map(d => <button key={d} onClick={() => { setSwapModalDesignation(swapModalDesignation === d ? '' : d); setSwapModalPage(1); }} className={`px-3 py-1 rounded-full text-xs font-medium transition ${swapModalDesignation === d ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{d}</button>)}
                      </div>
                    )}
                  </div>
                  <div className="flex-1 overflow-y-auto p-4 space-y-2">
                    <p className="text-xs text-slate-500">
                      <span className="font-semibold text-slate-600">Send to client</span> WhatsApps that staff member's profile to this booking's client — send as many candidates as you like for them to choose from. It does not change the assignment; use <span className="font-semibold text-slate-600">Select</span> for that.
                    </p>
                    {profileSendError && (
                      <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">{profileSendError}</div>
                    )}
                    {availableStaff.length === 0 ? <Empty icon={Users} text="No staff found." /> : filtered.length === 0 ? <Empty icon={Users} text="No staff match your filters." /> : (
                      paginated.map(s => (
                        <div key={s.staff_profile_id} className="p-4 rounded-xl border border-slate-200 hover:border-blue-200 hover:bg-blue-50/30 transition">
                          <div className="flex items-center justify-between gap-4">
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center shrink-0 overflow-hidden">
                                {s.profile_picture_url ? <img src={s.profile_picture_url} alt={s.full_name} className="w-10 h-10 object-cover" /> : <User className="w-5 h-5 text-slate-400" />}
                              </div>
                              <div className="min-w-0">
                                <p className="text-sm font-semibold text-slate-900 truncate">
                                  {s.full_name}
                                  {s.staff_code && <span className="ml-2 text-[10px] font-semibold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">{s.staff_code}</span>}
                                </p>
                                {s.designation && <p className="text-xs text-slate-500">{s.designation}</p>}
                                {s.mobile_number && <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5"><Phone className="w-3 h-3" /> {formatMobileNumber(s.mobile_number)}</p>}
                              </div>
                            </div>
                            <div className="flex items-center gap-3 shrink-0">
                              {s.current_status === 'ASSIGNED'
                                ? <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 ring-1 ring-amber-600/20"><Repeat2 className="w-3 h-3" /> On assignment</span>
                                : s.current_status === 'UNAVAILABLE'
                                  ? <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600 ring-1 ring-slate-400/20">Unavailable</span>
                                  : <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/20"><CheckCircle className="w-3 h-3" /> Available</span>}
                              <button
                                onClick={() => sendStaffProfile(s)}
                                disabled={profileSendingId !== null}
                                title="WhatsApp this staff member's profile to the client"
                                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition disabled:opacity-50 disabled:cursor-not-allowed ${profileSentIds.includes(s.staff_profile_id) ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                              >
                                {profileSendingId === s.staff_profile_id
                                  ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Sending…</>
                                  : profileSentIds.includes(s.staff_profile_id)
                                    ? <><Check className="w-3.5 h-3.5" /> Sent — resend</>
                                    : <><SendHorizontal className="w-3.5 h-3.5" /> Send to client</>}
                              </button>
                              <button onClick={() => selectSwapStaff(s)} className="px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition">Select</button>
                            </div>
                          </div>
                          {s.current_status === 'ASSIGNED' && s.active_assignment_client && (
                            <p className="mt-1.5 pl-[52px] text-xs text-amber-700">Currently on {s.active_assignment_client}{s.active_assignment_end_date ? ` until ${new Date(s.active_assignment_end_date).toLocaleDateString('en-GB')}` : ''} — check schedule below before assigning.</p>
                          )}
                          <div className="pl-[52px]">
                            <StaffProfileDetails staff={s} />
                          </div>
                          <div className="mt-2.5 pl-[52px]">
                            <StaffScheduleTimeline
                              schedule={staffSchedules[s.staff_profile_id] || []}
                              loading={staffSchedulesLoading}
                              referenceDate={swapModalStartDate}
                              compact
                            />
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                  {filtered.length > PAGE_SIZE && (
                    <div className="flex items-center justify-between px-6 py-3 border-t border-slate-100 shrink-0">
                      <button onClick={() => setSwapModalPage(p => Math.max(1, p - 1))} disabled={swapModalPage === 1} className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition">← Previous</button>
                      <span className="text-xs text-slate-500">Page {swapModalPage} of {totalPages} · {filtered.length} staff</span>
                      <button onClick={() => setSwapModalPage(p => Math.min(totalPages, p + 1))} disabled={swapModalPage === totalPages} className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition">Next →</button>
                    </div>
                  )}
                </>
              );
            })()}

            {swapModalStep === 2 && swapModalSelectedStaff && (
              <>
                <div className="flex-1 overflow-y-auto p-6 space-y-5">
                  <div className={`grid ${swapModalIsAssign ? 'grid-cols-1' : 'grid-cols-3'} gap-3 items-center`}>
                    {!swapModalIsAssign && (
                      <>
                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-center">
                          <p className="text-xs text-slate-500 mb-2 font-medium uppercase tracking-wide">Current</p>
                          <div className="w-12 h-12 rounded-full bg-rose-100 flex items-center justify-center mx-auto mb-2"><User className="w-6 h-6 text-rose-400" /></div>
                          <p className="text-sm font-semibold text-slate-900 truncate">{swapModalSlotId ? (shiftSlots.find(s => s.shift_slot_id === swapModalSlotId)?.assignment?.staff_name || '-') : (normCurrentStaff?.name || '-')}</p>
                        </div>
                        <div className="flex items-center justify-center"><Repeat2 className="w-7 h-7 text-slate-300" /></div>
                      </>
                    )}
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-center">
                      <p className="text-xs text-emerald-600 mb-2 font-medium uppercase tracking-wide">New Staff</p>
                      <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-2 overflow-hidden">
                        {swapModalSelectedStaff.profile_picture_url ? <img src={swapModalSelectedStaff.profile_picture_url} alt={swapModalSelectedStaff.full_name} className="w-12 h-12 object-cover" /> : <User className="w-6 h-6 text-emerald-600" />}
                      </div>
                      <p className="text-sm font-semibold text-slate-900 truncate">{swapModalSelectedStaff.full_name}</p>
                      {swapModalSelectedStaff.mobile_number && <p className="text-xs text-slate-500 mt-0.5">{formatMobileNumber(swapModalSelectedStaff.mobile_number)}</p>}
                    </div>
                  </div>
                  <div className="rounded-xl border border-slate-200 p-3.5">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">{swapModalSelectedStaff.full_name}'s profile</p>
                    <StaffProfileDetails staff={swapModalSelectedStaff} />
                  </div>
                  <div className="rounded-xl border border-slate-200 p-3.5">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">{swapModalSelectedStaff.full_name}'s schedule</p>
                    <StaffScheduleTimeline
                      schedule={staffSchedules[swapModalSelectedStaff.staff_profile_id] || []}
                      loading={staffSchedulesLoading}
                      referenceDate={swapModalStartDate}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">{swapModalIsAssign ? 'Service start date' : 'New staff start date'} <span className="text-rose-500">*</span></label>
                    <DateInput value={swapModalStartDate} onChange={e => setSwapModalStartDate(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
                    {swapModalStartDate > toDateInput(new Date()) && (
                      <p className="text-xs text-amber-600 mt-1.5">
                        Future date — this will be scheduled and take effect automatically on that date.
                      </p>
                    )}
                    {swapModalStartDate < todayISO() && (
                      <p className="text-xs text-slate-500 mt-1.5">
                        Backdated entry — this will be recorded as already having happened.
                      </p>
                    )}
                  </div>
                  <div className={`grid ${swapModalIsAssign ? 'grid-cols-1' : 'grid-cols-2'} gap-3`}>
                    {!swapModalIsAssign && (
                      <div>
                        <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Old staff out time <span className="text-slate-400 normal-case font-normal">(optional)</span></label>
                        <TimeInput value={swapModalOldOutTime} onChange={e => setSwapModalOldOutTime(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
                      </div>
                    )}
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">New staff in time <span className="text-slate-400 normal-case font-normal">(optional)</span></label>
                      <TimeInput value={swapModalNewInTime} onChange={e => setSwapModalNewInTime(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
                    </div>
                  </div>
                  <p className="text-xs text-slate-400 -mt-2">Times use the staff start date above ({formatDate(swapModalStartDate)}).</p>
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">{swapModalIsAssign ? 'Notes (optional)' : 'Reason for swap'} {!swapModalIsAssign && <span className="text-rose-500">*</span>}</label>
                    <textarea rows={3} value={swapModalReason} onChange={e => setSwapModalReason(e.target.value)} placeholder="e.g. Staff requested leave, client preference…" className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
                  </div>
                  <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800">After confirming, WhatsApp and SMS notifications will be sent to the relevant staff and the client.</div>
                  {swapModalError && <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-sm text-rose-700">{swapModalError}</div>}
                </div>
                <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 shrink-0">
                  <button onClick={() => setSwapModalStep(1)} className="text-sm font-medium text-slate-600 hover:text-slate-900 transition">← Back</button>
                  <button onClick={confirmSwap} disabled={swapModalSubmitting || (!swapModalIsAssign && !swapModalReason.trim()) || !swapModalStartDate} className="inline-flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-gray-800 hover:bg-gray-900 rounded-lg transition disabled:opacity-60 disabled:cursor-not-allowed">
                    {swapModalSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Repeat2 className="h-4 w-4" />}
                    {swapModalSubmitting ? 'Saving…' : swapModalIsAssign ? 'Confirm Assignment' : 'Confirm Swap'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          EDIT TIMES MODAL — backfill/correct an allocation row's start-day
          in_time and/or end-day out_time. Works for any row: past, current
          (ongoing) or already-completed — same PATCH endpoint the swap modal
          uses, just aimed directly at a specific assignment/day.
      ══════════════════════════════════════════════════════ */}
      {editTimesRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(20,17,12,.45)' }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900">Edit times</h3>
                <p className="text-xs text-slate-500 mt-0.5">{editTimesRow.name}</p>
              </div>
              <button onClick={closeEditTimes} className="p-1.5 rounded-lg hover:bg-slate-100 transition"><XCircle className="h-5 w-5 text-slate-400" /></button>
            </div>
            <div className="p-6 space-y-4">
              {editTimesRow.startDate && (
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">In time on {formatDate(editTimesRow.startDate)}</label>
                  <TimeInput value={editTimesIn} onChange={e => setEditTimesIn(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
                </div>
              )}
              {editTimesRow.effectiveEnd && (
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Out time on {formatDate(editTimesRow.effectiveEnd)}</label>
                  <TimeInput value={editTimesOut} onChange={e => setEditTimesOut(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
                </div>
              )}
              {!editTimesRow.effectiveEnd && (
                <p className="text-xs text-slate-400">This assignment is still ongoing — no out time to set yet.</p>
              )}
              {editTimesError && <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-sm text-rose-700">{editTimesError}</div>}
            </div>
            <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-200">
              <button onClick={closeEditTimes} className="text-sm font-medium text-slate-600 hover:text-slate-900 transition px-3">Cancel</button>
              <button onClick={saveEditTimes} disabled={editTimesSubmitting || (!editTimesIn && !editTimesOut)} className="inline-flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-gray-800 hover:bg-gray-900 rounded-lg transition disabled:opacity-60 disabled:cursor-not-allowed">
                {editTimesSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {editTimesSubmitting ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          RESCHEDULE MODAL — move one shift occurrence to a different date,
          optionally handing the makeup to a different staff member
      ══════════════════════════════════════════════════════ */}
      {showRescheduleModal && (() => {
        const slot = shiftSlots.find(s => s.shift_slot_id === rescheduleModalSlotId);
        const slotLabel = slot?.label || (slot?.shift_number ? `Shift ${slot.shift_number}` : 'Shift');
        const currentStaffName = slot?.assignment?.staff_name || '—';
        const selectedStaff = staffPickerOptions.find(s => s.staff_profile_id === rescheduleModalStaffId);
        // Excludes the shift's current holder — offering to "replace" them with
        // themselves isn't a useful option here — but otherwise includes staff
        // already working another shift on this same booking (the realistic coverer).
        const rescheduleStaffOptions = staffPickerOptions.filter(s => s.staff_profile_id !== slot?.assignment?.staff_profile_id);
        // Search box results — staff already on this booking (the realistic coverer)
        // are pinned to the top, then alphabetical.
        const staffSearchQ = rescheduleModalStaffSearch.trim().toLowerCase();
        const filteredRescheduleStaff = rescheduleStaffOptions
          .filter(s => staffMatchesQuery(s, staffSearchQ))
          .sort((a, b) => {
            const aOn = onBookingStaffIds.has(a.staff_profile_id) ? 0 : 1;
            const bOn = onBookingStaffIds.has(b.staff_profile_id) ? 0 : 1;
            return aOn !== bOn ? aOn - bOn : (a.full_name || '').localeCompare(b.full_name || '');
          });
        // Same date as the occurrence being edited => this is a same-day "cover shift"
        // rather than an actual date move — the underlying request is identical either
        // way, only the framing differs, and it un-covers itself naturally if the admin
        // picks a different date.
        const isCoverMode = rescheduleModalDate === dayModal?.dateISO;
        return (
          // z-[60] — this opens from a button inside the Day Detail Modal (z-50, rendered
          // later in the DOM so it would otherwise paint on top), and stays open underneath
          // it while the admin fills it in, so it must stack strictly above that modal.
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[85vh] flex flex-col">
              <div className="flex items-start justify-between p-6 border-b border-slate-200 shrink-0">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">{isCoverMode ? `Cover ${slotLabel}` : `Reschedule ${slotLabel}`}</h2>
                  <p className="text-sm text-slate-500 mt-0.5">
                    {isCoverMode
                      ? `Handing today's (${formatDate(dayModal?.dateISO)}) occurrence to a different staff member — the client is still billed normally, only the salary calculation goes to whoever actually covered it.`
                      : `Moving the ${formatDate(dayModal?.dateISO)} occurrence to a new date.`}
                  </p>
                </div>
                <button onClick={closeRescheduleModal} className="p-1.5 rounded-lg hover:bg-slate-100 transition shrink-0 ml-4"><XCircle className="h-5 w-5 text-slate-400" /></button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-5">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
                    New date <span className="text-rose-500">*</span>
                  </label>
                  <DateInput
                    value={rescheduleModalDate}
                    onChange={e => setRescheduleModalDate(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                  <p className="text-xs text-slate-400 mt-1.5">
                    {isCoverMode
                      ? "Left as today's date — this is a same-day cover, not a move. Pick a different date to reschedule the shift instead."
                      : "Defaults to just after the booking's scheduled end — pick any other date if needed."}
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">New start time <span className="text-slate-400 font-normal normal-case">(optional)</span></label>
                  <TimeInput
                    value={rescheduleModalTime}
                    onChange={e => setRescheduleModalTime(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                  <p className="text-xs text-slate-400 mt-1.5">Leave blank to keep the shift's usual start time ({(slot?.start_time || '').slice(0, 5) || '—'}).</p>
                </div>

                <div className="rounded-xl border border-slate-200 p-3.5">
                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={rescheduleModalChangeStaff}
                      onChange={e => { setRescheduleModalChangeStaff(e.target.checked); if (!e.target.checked) setRescheduleModalStaffId(''); }}
                      className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm font-semibold text-slate-800">Change the staff member for this shift?</span>
                  </label>
                  <p className="text-xs text-slate-400 mt-1.5 ml-6">Currently assigned: <span className="font-medium text-slate-600">{currentStaffName}</span></p>

                  {rescheduleModalChangeStaff && (
                    <div className="mt-3.5 ml-6 space-y-2">
                      {rescheduleStaffOptions.length === 0 ? (
                        <p className="text-xs text-amber-600">No other staff available to assign.</p>
                      ) : selectedStaff ? (
                        <div className="flex items-center justify-between gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-slate-900 truncate">{selectedStaff.full_name}</p>
                            <p className="text-xs text-slate-500">
                              {selectedStaff.designation}
                              {onBookingStaffIds.has(selectedStaff.staff_profile_id) && <span className={selectedStaff.designation ? 'ml-1.5 font-medium text-emerald-600' : 'font-medium text-emerald-600'}>{selectedStaff.designation ? '· ' : ''}Already on this booking</span>}
                            </p>
                          </div>
                          <button type="button" onClick={() => { setRescheduleModalStaffId(''); setRescheduleModalStaffSearch(''); }} className="text-xs font-medium text-blue-600 hover:text-blue-800 shrink-0">Change</button>
                        </div>
                      ) : (
                        <>
                          <div className="relative">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                            <input
                              type="text"
                              autoFocus
                              placeholder="Search by name, phone, staff ID (EMP-0541) or designation…"
                              value={rescheduleModalStaffSearch}
                              onChange={e => setRescheduleModalStaffSearch(e.target.value)}
                              className="w-full pl-8 pr-2.5 py-2 text-sm rounded-lg border border-slate-200 bg-white outline-none focus:border-blue-500"
                            />
                          </div>
                          <div className="max-h-40 overflow-y-auto rounded-lg border border-slate-200 divide-y divide-slate-100">
                            {filteredRescheduleStaff.length === 0 ? (
                              <p className="px-3 py-2 text-xs text-slate-400">No staff match "{rescheduleModalStaffSearch}".</p>
                            ) : filteredRescheduleStaff.map(s => (
                              <button
                                type="button"
                                key={s.staff_profile_id}
                                onClick={() => { setRescheduleModalStaffId(s.staff_profile_id); setRescheduleModalStaffSearch(''); }}
                                className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-blue-50 transition"
                              >
                                <span className="truncate text-slate-700">{s.full_name}{s.designation ? ` — ${s.designation}` : ''}</span>
                                {onBookingStaffIds.has(s.staff_profile_id) && <span className="shrink-0 text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">On booking</span>}
                              </button>
                            ))}
                          </div>
                        </>
                      )}
                      {selectedStaff && (
                        <StaffScheduleTimeline
                          schedule={staffSchedules[selectedStaff.staff_profile_id] || []}
                          loading={staffSchedulesLoading}
                          referenceDate={rescheduleModalDate}
                          compact
                        />
                      )}
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Reason <span className="text-slate-400 font-normal normal-case">(optional)</span></label>
                  <textarea
                    rows={2}
                    value={rescheduleModalReason}
                    onChange={e => setRescheduleModalReason(e.target.value)}
                    placeholder="e.g. Staff was unavailable, client requested a different day…"
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 resize-none"
                  />
                </div>

                {rescheduleModalError && <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-sm text-rose-700">{rescheduleModalError}</div>}
              </div>

              <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 shrink-0">
                <button onClick={closeRescheduleModal} className="text-sm font-medium text-slate-600 hover:text-slate-900 transition">Cancel</button>
                <button
                  onClick={confirmReschedule}
                  disabled={rescheduleModalSubmitting || !rescheduleModalDate || (rescheduleModalChangeStaff && !rescheduleModalStaffId)}
                  className="inline-flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-gray-800 hover:bg-gray-900 rounded-lg transition disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {rescheduleModalSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  {rescheduleModalSubmitting ? 'Saving…' : (isCoverMode ? 'Confirm Cover' : 'Confirm Reschedule')}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ══════════════════════════════════════════════════════
          SHIFT PATTERN MODAL
      ══════════════════════════════════════════════════════ */}
      {showPatternModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col">
            <div className="flex items-start justify-between p-6 border-b border-slate-200 shrink-0">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Change Shift Pattern</h2>
                <p className="text-sm text-slate-500 mt-0.5">Existing attendance/invoices stay pinned to the pattern active when they were recorded.</p>
              </div>
              <button onClick={closePatternModal} className="p-1.5 rounded-lg hover:bg-slate-100 transition shrink-0 ml-4"><XCircle className="h-5 w-5 text-slate-400" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              {shiftPattern?.active && (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-2">Current pattern &amp; staff</p>
                  <div className="flex flex-wrap gap-2">
                    {(shiftPattern.active.slots || []).map(s => {
                      const slot = shiftSlots.find(ss => ss.shift_number === s.shift_number);
                      return (
                        <span key={s.shift_slot_id} className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-full px-3 py-1.5">
                          {s.label || `Shift ${s.shift_number}`} · {(s.start_time || '').slice(0, 5)} ({s.duration_hours}h)
                          <span className="text-slate-300">—</span>
                          <span className={slot?.assignment ? 'font-semibold text-slate-900' : 'italic text-slate-400'}>
                            {slot?.assignment?.staff_name || 'Unassigned'}
                          </span>
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Number of shifts per day</label>
                <input type="number" min="1" max="6" value={patternModalShiftCount} onChange={e => handlePatternShiftCountChange(Math.max(1, parseInt(e.target.value) || 1))} onWheel={e => e.currentTarget.blur()} className="w-32 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
                <p className="text-xs text-slate-400 mt-1.5">Adding shifts creates new, unassigned slots below — assign staff to them just like any other shift.</p>
              </div>
              <div className="space-y-3">
                {patternModalSlots.map((s, idx) => {
                  const currentAssignment = shiftSlots.find(ss => ss.shift_number === s.shift_number)?.assignment;
                  return (
                    <div key={idx} className="rounded-xl border border-slate-200 p-3.5 space-y-3">
                      <div className="grid grid-cols-12 gap-2 items-end">
                        <div className="col-span-2 text-xs font-semibold text-slate-500 pb-2.5">Shift {s.shift_number}</div>
                        <div className="col-span-3">
                          <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
                            Start time {idx > 0 && <span className="normal-case font-normal text-blue-400 tracking-normal">(auto)</span>}
                          </label>
                          <TimeInput value={s.start_time} onChange={e => updatePatternSlot(idx, 'start_time', e.target.value)} className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-blue-500" />
                        </div>
                        <div className="col-span-3">
                          <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">Duration (h)</label>
                          <input type="number" min="0.5" step="0.5" value={s.duration_hours} onChange={e => updatePatternSlot(idx, 'duration_hours', e.target.value)} onWheel={e => e.currentTarget.blur()} className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-blue-500" />
                        </div>
                        <div className="col-span-4">
                          <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">Label</label>
                          <input type="text" value={s.label} onChange={e => updatePatternSlot(idx, 'label', e.target.value)} className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-blue-500" />
                        </div>
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
                          Staff member
                          {currentAssignment && (
                            <span className="normal-case font-normal text-slate-400"> · currently {currentAssignment.staff_name}</span>
                          )}
                        </label>
                        <select value={s.staff_profile_id} onChange={e => updatePatternSlot(idx, 'staff_profile_id', e.target.value)} className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-blue-500">
                          <option value="">— Unassigned (assign later) —</option>
                          {patternModalStaffOptions.map(st => (
                            <option key={st.staff_profile_id} value={st.staff_profile_id}>
                              {st.full_name}{st.designation ? ` — ${st.designation}` : ''}
                            </option>
                          ))}
                        </select>
                        {s.staff_profile_id && (
                          <div className="mt-1.5">
                            <StaffScheduleTimeline
                              schedule={staffSchedules[s.staff_profile_id] || []}
                              loading={staffSchedulesLoading}
                              referenceDate={patternModalEffectiveDate}
                              compact
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Effective from <span className="text-rose-500">*</span></label>
                <DateInput value={patternModalEffectiveDate} min={todayISO()} onChange={e => setPatternModalEffectiveDate(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
                <p className="text-xs text-slate-400 mt-1.5">Used as both the pattern's effective date and each assigned staff member's shift start date.</p>
                {patternModalEffectiveDate > toDateInput(new Date()) && (
                  <p className="text-xs text-amber-600 mt-1.5">Future date — this pattern will be scheduled and take effect automatically on that date. The current pattern keeps running until then.</p>
                )}
              </div>
              {patternModalError && <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-sm text-rose-700">{patternModalError}</div>}
            </div>
            <div className="flex items-center justify-end px-6 py-4 border-t border-slate-200 shrink-0">
              <button onClick={submitPatternChange} disabled={patternModalSubmitting || !patternModalEffectiveDate} className="inline-flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-gray-800 hover:bg-gray-900 rounded-lg transition disabled:opacity-60 disabled:cursor-not-allowed">
                {patternModalSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {patternModalSubmitting ? 'Saving…' : 'Save Pattern'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          DAY DETAIL MODAL — attendance + manual invoicing
      ══════════════════════════════════════════════════════ */}
      {dayModal && (() => {
        const dateRecords = attendanceRecords.filter(r => r.service_date?.slice(0, 10) === dayModal.dateISO);
        const dateInvoiceRecords = dailyInvoiceRecords.filter(r => r.service_date?.slice(0, 10) === dayModal.dateISO);
        const invoiceRecord = dateInvoiceRecords.find(r => !r.shift_slot_id) || dateInvoiceRecords[0];
        // Audit trail for this specific day — DAY_REVOKED logs a service_dates array
        // (can cover several days at once), every other attendance/salary action logs
        // a single service_date, so both shapes need checking.
        const dayHistory = attendanceHistory.filter(h => {
          const d = h.details || {};
          if (Array.isArray(d.service_dates)) return d.service_dates.some(sd => sd?.slice(0, 10) === dayModal.dateISO);
          return d.service_date?.slice(0, 10) === dayModal.dateISO;
        });
        const HISTORY_ACTION_LABEL = {
          ATTENDANCE_RECORDED: 'Logged Time',
          STAFF_MARKED_ABSENT: 'Marked Absent',
          STAFF_SALARY_CONFIRMED: 'Salary Calculated',
          STAFF_SALARY_SKIPPED: 'Salary Skipped',
          DAY_REVOKED: 'Revoked',
        };
        const slotIds = [...new Set(dayModal.assignments.map(a => a.shift_slot_id).filter(Boolean))];
        // LIVE_IN AUTO bookings normally bill automatically overnight, but the client
        // is only with us for part of the first/last day — the cron leaves those days
        // PENDING (see cron/dailyInvoicing.js, bookingsStartingToday/bookingsEndingToday)
        // so the admin decides them here alongside logging the staff member's start/end
        // time, instead of every day. Matches the cron's own boundary checks: assignment
        // starting today, regardless of whether it also happens to end today (single-day
        // booking edge case); ending today covers both an already-executed end date and
        // a still-pending scheduled one (see liveInBoundary / scheduledFinalization).
        const isFirstDayInvoiceDecision = isLiveIn && invoicingMode !== 'MANUAL' &&
          dayModal.assignments.some(a => !a.shift_slot_id && toLocalDateStr(a.service_start_date) === dayModal.dateISO);
        const isLastDayInvoiceDecision = isLiveIn && invoicingMode !== 'MANUAL' &&
          dayModal.assignments.some(a => liveInBoundary(a, dayModal.dateISO).onlyEnd);
        const showInvoiceSection = manualInvoiceDay || isFirstDayInvoiceDecision || isLastDayInvoiceDecision;
        const fmtTime = (ts) => ts ? new Date(ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }) : '—';
        const thCls = 'px-3 py-2 text-left text-[10.5px] font-semibold uppercase tracking-wider text-gray-400';
        const tdCls = 'px-3 py-3 text-sm text-gray-700 align-middle';
        const hasDraftContent = Object.keys(draftTimeSaved).length > 0 || Object.keys(draftAbsent).length > 0
          || Object.keys(draftInvoiceDecisions).length > 0 || Object.keys(draftWaives).length > 0;

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[92vh] flex flex-col" style={{ border: '1px solid #e5e7eb' }}>

              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 shrink-0" style={{ borderBottom: '1px solid #e5e7eb' }}>
                <div>
                  <h2 className="text-base font-semibold text-gray-900">Day {dayModal.dayNum} &mdash; {formatDate(dayModal.dateISO)}</h2>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {dayModalStep === 'preview'
                      ? 'Review everything below — nothing is final until you confirm.'
                      : 'Enter attendance and invoicing — nothing is saved for real until you confirm.'}
                  </p>
                </div>
                <button onClick={closeDayModal} className="p-1.5 rounded-lg hover:bg-gray-100 transition ml-4">
                  <XCircle className="h-5 w-5 text-gray-400" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto">
                {dayModalError && (
                  <div className="mx-6 mt-4 rounded-lg bg-red-50 border border-red-200 px-4 py-2.5 text-xs text-red-700">{dayModalError}</div>
                )}

              {dayModalStep === 'preview' ? (() => {
                // Preview is computed purely from local draft state (attendanceInputs/
                // draftTimeSaved/draftAbsent/draftSalaryDecisions/draftInvoiceDecisions/
                // draftWaives) — no backend round-trip needed, it's just a read-only
                // summary of what Confirm Day is about to apply.
                const staffPreviewRows = dayModal.assignments.map(a => {
                  const staffName = a.full_name || a.staff_name || 'Staff';
                  if (draftWaives[a.shift_slot_id]) return { assignmentId: a.assignment_id, staffName, kind: 'WAIVED' };
                  if (draftAbsent[a.assignment_id]) return { assignmentId: a.assignment_id, staffName, kind: 'ABSENT' };
                  const saved = draftTimeSaved[a.assignment_id];
                  if (saved) {
                    const decision = draftSalaryDecisions[a.assignment_id];
                    return { assignmentId: a.assignment_id, staffName, kind: 'TIME', saved, decision };
                  }
                  return null;
                }).filter(Boolean);

                const invoicePreviewRows = Object.entries(draftInvoiceDecisions).map(([key, dec]) => {
                  const slotAssignment = dec.shift_slot_id ? dayModal.assignments.find(a => a.shift_slot_id === dec.shift_slot_id) : null;
                  const label = dec.shift_slot_id
                    ? (slotAssignment?.shift_label || (slotAssignment?.shift_number ? `Shift ${slotAssignment.shift_number}` : 'Shift'))
                    : `Day ${dayModal.dayNum}`;
                  return { key, label, dec };
                });
                const waivedSlotIds = Object.keys(draftWaives);

                const totalSalary = staffPreviewRows.reduce((sum, r) => sum + (r.kind === 'TIME' && r.decision?.approve ? Number(r.decision.amount || 0) : 0), 0);
                const totalInvoice = invoicePreviewRows.reduce((sum, r) => sum + (r.dec.approve ? Number(r.dec.amount || 0) : 0), 0);
                const nothingToConfirm = staffPreviewRows.length === 0 && invoicePreviewRows.length === 0 && waivedSlotIds.length === 0;

                return (
                  <div className="px-6 py-5 space-y-5">
                    {nothingToConfirm ? (
                      <p className="text-sm text-gray-400 py-6 text-center">Nothing entered for this day yet — go back and log attendance or an invoice decision first.</p>
                    ) : (
                      <>
                        {staffPreviewRows.length > 0 && (
                          <div>
                            <p className="text-[10.5px] font-semibold uppercase tracking-widest text-gray-400 mb-2">Staff Attendance</p>
                            <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden' }}>
                              {staffPreviewRows.map((r, idx) => (
                                <div key={r.assignmentId} className="flex items-center justify-between px-4 py-2.5 text-sm" style={idx > 0 ? { borderTop: '1px solid #f3f4f6' } : {}}>
                                  <span className="font-medium text-gray-900">{r.staffName}</span>
                                  {r.kind === 'WAIVED' && <span className="text-xs text-amber-700">Waived — no pay</span>}
                                  {r.kind === 'ABSENT' && <span className="text-xs text-red-700">Absent — no pay</span>}
                                  {r.kind === 'TIME' && (
                                    <span className="text-xs text-gray-600">
                                      {formatHoursMins(r.saved.hours_served)} served —{' '}
                                      {r.decision
                                        ? (r.decision.approve ? `Rs.${Number(r.decision.amount).toLocaleString()} salary` : 'salary skipped')
                                        : 'salary not yet decided'}
                                    </span>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {(invoicePreviewRows.length > 0 || waivedSlotIds.length > 0) && (
                          <div>
                            <p className="text-[10.5px] font-semibold uppercase tracking-widest text-gray-400 mb-2">Client Invoice</p>
                            <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden' }}>
                              {invoicePreviewRows.map((r, idx) => (
                                <div key={r.key} className="flex items-center justify-between px-4 py-2.5 text-sm" style={idx > 0 ? { borderTop: '1px solid #f3f4f6' } : {}}>
                                  <span className="font-medium text-gray-900">{r.label}</span>
                                  <span className="text-xs text-gray-600">{r.dec.approve ? `Rs.${Number(r.dec.amount).toLocaleString()}` : 'Skipped'}</span>
                                </div>
                              ))}
                              {waivedSlotIds.map((slotId, idx) => {
                                const slotAssignment = dayModal.assignments.find(a => a.shift_slot_id === slotId);
                                const label = slotAssignment?.shift_label || (slotAssignment?.shift_number ? `Shift ${slotAssignment.shift_number}` : 'Shift');
                                return (
                                  <div key={slotId} className="flex items-center justify-between px-4 py-2.5 text-sm" style={(invoicePreviewRows.length + idx) > 0 ? { borderTop: '1px solid #f3f4f6' } : {}}>
                                    <span className="font-medium text-gray-900">{label}</span>
                                    <span className="text-xs text-amber-700">Waived — no charge</span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        <div className="rounded-lg bg-gray-50 border border-gray-200 px-4 py-3 flex items-center justify-between text-sm">
                          <span className="text-gray-500">Total salary payout</span>
                          <span className="font-semibold text-gray-900">Rs.{totalSalary.toLocaleString()}</span>
                        </div>
                        <div className="rounded-lg bg-gray-50 border border-gray-200 px-4 py-3 flex items-center justify-between text-sm">
                          <span className="text-gray-500">Total client charge</span>
                          <span className="font-semibold text-gray-900">Rs.{totalInvoice.toLocaleString()}</span>
                        </div>
                      </>
                    )}
                  </div>
                );
              })() : (
              <>
                {/* Shifts moved away from this date, or covered same-day by someone else — explains why fewer/different rows show below */}
                {shiftReschedules.filter(r => r.original_date?.slice(0, 10) === dayModal.dateISO).map(r => {
                  const isSameDayCover = r.new_date?.slice(0, 10) === r.original_date?.slice(0, 10);
                  const label = r.shift_label || (r.shift_number ? `Shift ${r.shift_number}` : 'A shift');
                  return (
                    <div key={r.reschedule_id} className={`mx-6 mt-4 rounded-lg border px-4 py-2.5 text-xs ${isSameDayCover ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-blue-50 border-blue-200 text-blue-700'}`}>
                      {isSameDayCover
                        ? `${label} was covered today by ${r.makeup_staff_name || 'a different staff member'} — the client is billed normally; log/confirm that staff member's row below instead of the originally assigned one.`
                        : `${label} was rescheduled to ${formatDate(r.new_date)} — it no longer runs on this date.`}
                    </div>
                  );
                })}

                {/* ── Staff Attendance Table ── */}
                {manualSalaryDay && (
                  <div className="px-6 pt-5 pb-2">
                    <p className="text-[10.5px] font-semibold uppercase tracking-widest text-gray-400 mb-3">Staff Attendance</p>
                    {dayModal.assignments.length === 0 ? (
                      <p className="text-sm text-gray-400 py-4 text-center">No staff assigned on this day.</p>
                    ) : (
                      <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden' }}>
                        <table className="w-full text-sm border-collapse">
                          <thead style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                            <tr>
                              <th className={thCls}>Staff</th>
                              <th className={thCls}>Assigned</th>
                              <th className={thCls}>Date</th>
                              <th className={thCls}>In</th>
                              <th className={thCls}>Out</th>
                              <th className={thCls}>Hours</th>
                              <th className={thCls}>Action</th>
                            </tr>
                          </thead>
                          <tbody>
                            {dayModal.assignments.map((a, idx) => {
                              const record = dateRecords.find(r => r.assignment_id === a.assignment_id);
                              const staffName = a.full_name || a.staff_name || 'Staff';
                              const shiftLabel = a.shift_label || (a.shift_number ? `Shift ${a.shift_number}` : null);
                              const inputs = attendanceInputs[a.assignment_id] || { date: dayModal.dateISO, in_time: '', out_time: '' };
                              const rowBorder = idx > 0 ? { borderTop: '1px solid #f3f4f6' } : {};
                              const isEditing = editingAttendanceIds.has(a.assignment_id);
                              const draftSaved = draftTimeSaved[a.assignment_id];
                              const draftAbsentInfo = draftAbsent[a.assignment_id];
                              const draftWaiveInfo = a.shift_slot_id ? draftWaives[a.shift_slot_id] : null;

                              // Assigned reference — shift start/duration for SHIFT_BASED, else the
                              // assignment's own service_start_time/assigned_hours (VISITING/LIVE_IN).
                              // Prefer the record's own values (joined server-side) once one exists,
                              // since a.* reflects the assignment as it is *now*, not as it was when logged.
                              const assignedStart = (record?.shift_start_time || a.shift_start_time || a.service_start_time || null);
                              const assignedHoursRaw = record
                                ? (record.shift_duration_hours ?? record.assigned_hours)
                                : (a.shift_duration_hours ?? a.assigned_hours);
                              const assignedHours = assignedHoursRaw !== null && assignedHoursRaw !== undefined ? parseFloat(assignedHoursRaw) : null;
                              const assignedCell = (
                                <td className={tdCls}>
                                  <div className="text-xs text-gray-600">{assignedStart ? formatTime(assignedStart) : '—'}</div>
                                  {assignedHours !== null && <div className="text-[10px] text-gray-400">{formatHoursMins(assignedHours)} expected</div>}
                                </td>
                              );

                              // CONFIRMED — a real, terminal staff_daily_attendance row from a past
                              // Confirm Day. Nothing here is undoable except via the SUPER_ADMIN
                              // password-gated Revoke flow.
                              if (record && record.salary_status !== 'PENDING') {
                                const paid = record.salary_status === 'PAID';
                                const revoked = record.salary_status === 'REVOKED';
                                // A true no-show (Absent — no times ever logged), still on a shift
                                // slot, that nobody has covered yet — offer Cover Shift right here
                                // instead of sending the admin to the Client Invoice section.
                                const isAbsent = !paid && !revoked && record.hours_served === null;
                                const alreadyCovered = a.shift_slot_id && dayModal.assignments.some(other => other.shift_slot_id === a.shift_slot_id && other.reschedule_id);
                                const canCover = isAbsent && a.shift_slot_id && !alreadyCovered;
                                return (
                                  <tr key={a.assignment_id} style={rowBorder}>
                                    <td className={tdCls}>
                                      <span className="font-medium text-gray-900">{staffName}</span>
                                      {shiftLabel && <span className="ml-2 text-[10px] font-semibold bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">{shiftLabel}</span>}
                                    </td>
                                    {assignedCell}
                                    <td className={tdCls + ' text-gray-500 text-xs'}>{record.service_date?.slice(0, 10)}</td>
                                    <td className={tdCls + ' tabular-nums'}>{fmtTime(record.in_time)}</td>
                                    <td className={tdCls + ' tabular-nums'}>{fmtTime(record.out_time)}</td>
                                    <td className={tdCls}><HoursBadge served={record.hours_served !== null ? Number(record.hours_served) : null} assigned={assignedHours} /></td>
                                    <td className={tdCls}>
                                      <div className="flex items-center gap-1.5 flex-wrap">
                                        <span
                                          title={revoked ? [record.revoke_reason, record.revoked_by_name ? `by ${record.revoked_by_name}` : null].filter(Boolean).join(' — ') : undefined}
                                          className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded ${paid ? 'bg-green-50 text-green-700' : revoked ? 'bg-red-50 text-red-700' : 'bg-gray-100 text-gray-500'}`}
                                        >
                                          <span className={`w-1.5 h-1.5 rounded-full ${paid ? 'bg-green-500' : revoked ? 'bg-red-500' : 'bg-gray-400'}`} />
                                          {paid ? `Salary Calculated · Rs.${Number(record.salary_amount).toLocaleString()}` : revoked ? 'Revoked' : (isAbsent ? 'Absent' : 'Skipped')}
                                        </span>
                                        {canCover && (
                                          <button onClick={() => openRescheduleModal(a.shift_slot_id, true)} title="Hand today's shift to a different staff member — client still billed normally, that staff member's salary is calculated instead" className="px-2.5 py-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded transition">Cover Shift</button>
                                        )}
                                        {alreadyCovered && <span className="text-[10.5px] text-gray-400">Covered by another staff member</span>}
                                      </div>
                                    </td>
                                  </tr>
                                );
                              }

                              // DRAFT — WAIVED: cached, not yet confirmed. Undoable.
                              if (draftWaiveInfo) {
                                return (
                                  <tr key={a.assignment_id} style={rowBorder}>
                                    <td className={tdCls}>
                                      <span className="font-medium text-gray-900">{staffName}</span>
                                      {shiftLabel && <span className="ml-2 text-[10px] font-semibold bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">{shiftLabel}</span>}
                                    </td>
                                    {assignedCell}
                                    <td className={tdCls} colSpan={3}>
                                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded bg-amber-50 text-amber-700">
                                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                                        Waived (draft) — no charge, no pay
                                      </span>
                                    </td>
                                    <td className={tdCls}>
                                      <button onClick={() => undoWaive(a.shift_slot_id)} className="px-2.5 py-1 text-[11px] font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded transition">Undo</button>
                                    </td>
                                  </tr>
                                );
                              }

                              // DRAFT — ABSENT: cached, not yet confirmed. Cover Shift is offered
                              // right away since it creates a real reschedule regardless of draft state.
                              if (draftAbsentInfo) {
                                const alreadyCovered = a.shift_slot_id && dayModal.assignments.some(other => other.shift_slot_id === a.shift_slot_id && other.reschedule_id);
                                const canCover = a.shift_slot_id && !alreadyCovered;
                                return (
                                  <tr key={a.assignment_id} style={{ ...rowBorder, background: '#fffaf0' }}>
                                    <td className={tdCls}>
                                      <span className="font-medium text-gray-900">{staffName}</span>
                                      {shiftLabel && <span className="ml-2 text-[10px] font-semibold bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">{shiftLabel}</span>}
                                    </td>
                                    {assignedCell}
                                    <td className={tdCls} colSpan={3}>
                                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded bg-red-50 text-red-700">
                                        <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                                        Absent (draft)
                                      </span>
                                    </td>
                                    <td className={tdCls}>
                                      <div className="flex items-center gap-1.5 flex-wrap">
                                        <button onClick={() => undoAbsent(a.assignment_id)} className="px-2.5 py-1 text-[11px] font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded transition">Undo</button>
                                        {canCover && (
                                          <button onClick={() => openRescheduleModal(a.shift_slot_id, true)} title="Hand today's shift to a different staff member — client still billed normally, that staff member's salary is calculated instead" className="px-2.5 py-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded transition">Cover Shift</button>
                                        )}
                                      </div>
                                    </td>
                                  </tr>
                                );
                              }

                              // DRAFT — TIME SAVED: cached in/out time, salary decision (if any) also
                              // cached — nothing here is real until Confirm Day.
                              if (draftSaved && !isEditing) {
                                const salaryDecision = draftSalaryDecisions[a.assignment_id];
                                return (
                                  <tr key={a.assignment_id} style={rowBorder}>
                                    <td className={tdCls}>
                                      <span className="font-medium text-gray-900">{staffName}</span>
                                      {shiftLabel && <span className="ml-2 text-[10px] font-semibold bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">{shiftLabel}</span>}
                                    </td>
                                    {assignedCell}
                                    <td className={tdCls + ' text-gray-500 text-xs'}>{draftSaved.service_date}</td>
                                    <td className={tdCls + ' tabular-nums'}>{fmtTime(draftSaved.in_time)}</td>
                                    <td className={tdCls + ' tabular-nums'}>{fmtTime(draftSaved.out_time)}</td>
                                    <td className={tdCls}><HoursBadge served={Number(draftSaved.hours_served)} assigned={assignedHours} /></td>
                                    <td className={tdCls}>
                                      {salaryDecision ? (
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                          <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded ${salaryDecision.approve ? 'bg-blue-50 text-blue-700' : 'bg-gray-100 text-gray-500'}`}>
                                            <span className={`w-1.5 h-1.5 rounded-full ${salaryDecision.approve ? 'bg-blue-400' : 'bg-gray-400'}`} />
                                            {salaryDecision.approve ? `Salary (draft) · Rs.${Number(salaryDecision.amount).toLocaleString()}` : 'Salary Skipped (draft)'}
                                          </span>
                                          <button onClick={() => undoSalaryDecision(a.assignment_id)} className="px-2.5 py-1 text-[11px] font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded transition">Undo</button>
                                          <button onClick={() => editAttendanceTimes(a)} title="Correct the logged in/out time" className="px-2.5 py-1 text-[11px] font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded transition">Edit Time</button>
                                        </div>
                                      ) : (
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                          <input
                                            type="number" min="0" step="0.01"
                                            value={salaryAmountInputs[a.assignment_id] ?? (a.daily_rate ?? '')}
                                            onChange={e => setSalaryAmountInputs(p => ({ ...p, [a.assignment_id]: e.target.value }))}
                                            onWheel={e => e.currentTarget.blur()}
                                            className="rounded border border-gray-200 px-2 py-1 text-xs outline-none focus:border-blue-500 w-24"
                                            placeholder="0.00"
                                          />
                                          <button onClick={() => decideSalary(a.assignment_id, true, a.daily_rate)} title="Calculates their earnings for this shift — actual payout is handled separately on the Staff Salaries page" className="px-2.5 py-1 text-[11px] font-semibold text-white bg-gray-800 hover:bg-gray-900 rounded transition">Calculate Salary</button>
                                          <button onClick={() => decideSalary(a.assignment_id, false)} className="px-2.5 py-1 text-[11px] font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 rounded transition">Skip</button>
                                          <button onClick={() => editAttendanceTimes(a)} title="Correct the logged in/out time before deciding salary" className="px-2.5 py-1 text-[11px] font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded transition">Edit Time</button>
                                        </div>
                                      )}
                                    </td>
                                  </tr>
                                );
                              }

                              const { onlyStart, onlyEnd } = liveInBoundary(a, dayModal.dateISO);
                              const livePreviewHours = onlyEnd
                                ? computeWorkedHours('00:00', inputs.out_time)
                                : computeWorkedHours(inputs.in_time, inputs.out_time);

                              return (
                                <tr key={a.assignment_id} style={{ ...rowBorder, background: '#fafafa' }}>
                                  <td className={tdCls}>
                                    <span className="font-medium text-gray-900">{staffName}</span>
                                    {shiftLabel && <span className="ml-2 text-[10px] font-semibold bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">{shiftLabel}</span>}
                                  </td>
                                  {assignedCell}
                                  <td className={tdCls}>
                                    <DateInput value={inputs.date || dayModal.dateISO} onChange={e => setAttendanceInputs(p => ({ ...p, [a.assignment_id]: { ...inputs, date: e.target.value } }))} className="rounded border border-gray-200 px-2 py-1 text-xs outline-none focus:border-blue-500 w-32" />
                                  </td>
                                  <td className={tdCls}>
                                    {onlyEnd ? (
                                      <span className="text-xs text-gray-400">Ongoing</span>
                                    ) : (
                                      <>
                                        <TimeInput value={inputs.in_time} onChange={e => setAttendanceInputs(p => ({ ...p, [a.assignment_id]: { ...inputs, in_time: e.target.value, autoFilled: false } }))} className="rounded border border-gray-200 px-2 py-1 text-xs outline-none focus:border-blue-500 w-24" />
                                        {inputs.autoFilled && inputs.in_time && <span className="block text-[10px] text-blue-400 mt-0.5">from schedule</span>}
                                      </>
                                    )}
                                  </td>
                                  <td className={tdCls}>
                                    {onlyStart ? (
                                      <span className="text-xs text-gray-400" title="Booking hasn't ended yet — end time is only logged on the last day">Until booking ends</span>
                                    ) : (
                                      <>
                                        <TimeInput value={inputs.out_time} onChange={e => setAttendanceInputs(p => ({ ...p, [a.assignment_id]: { ...inputs, out_time: e.target.value, autoFilled: false } }))} className="rounded border border-gray-200 px-2 py-1 text-xs outline-none focus:border-blue-500 w-24" />
                                        {inputs.autoFilled && inputs.out_time && <span className="block text-[10px] text-blue-400 mt-0.5">from schedule</span>}
                                      </>
                                    )}
                                  </td>
                                  <td className={tdCls}><HoursBadge served={onlyStart ? null : livePreviewHours} assigned={assignedHours} /></td>
                                  <td className={tdCls}>
                                    <div className="flex items-center gap-1.5">
                                      <button onClick={() => saveAttendanceTimes(a)} className="px-3 py-1 text-[11px] font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded transition">Save</button>
                                      {isEditing ? (
                                        <button onClick={() => cancelEditAttendance(a.assignment_id)} className="px-3 py-1 text-[11px] font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 rounded transition">Cancel</button>
                                      ) : (
                                        <button onClick={() => markAbsent(a)} title="No-show — skips their salary only, no in/out time needed" className="px-3 py-1 text-[11px] font-semibold text-red-700 bg-red-50 hover:bg-red-100 rounded transition">Absent</button>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}

                {/* ── Client Invoice Table ── */}
                {showInvoiceSection && (
                  <div className="px-6 pt-5 pb-6">
                    <div className="mb-3">
                      <p className="text-[10.5px] font-semibold uppercase tracking-widest text-gray-400">Client Invoice</p>
                      {!manualInvoiceDay && isFirstDayInvoiceDecision && (
                        <p className="text-xs text-gray-400 mt-1">First day — this booking normally bills automatically, but decide whether to charge the client for today since the staff member only just started.</p>
                      )}
                      {!manualInvoiceDay && isLastDayInvoiceDecision && (
                        <p className="text-xs text-gray-400 mt-1">Last day — this booking normally bills automatically, but decide whether to charge the client for today since the staff member's service ends today.</p>
                      )}
                    </div>
                    <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden' }}>
                      <table className="w-full text-sm border-collapse">
                        <thead style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                          <tr>
                            <th className={thCls}>{isShiftBased ? 'Shift' : 'Day'}</th>
                            <th className={thCls}>Amount (Rs.)</th>
                            <th className={thCls}>Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {isShiftBased && slotIds.length > 0 ? slotIds.map((slotId, idx) => {
                            const slotAssignment = dayModal.assignments.find(a => a.shift_slot_id === slotId);
                            const shiftLabel = slotAssignment?.shift_label || (slotAssignment?.shift_number ? `Shift ${slotAssignment.shift_number}` : 'Shift');
                            const slotInvoiceRecord = dateInvoiceRecords.find(r => r.shift_slot_id === slotId);
                            const rowBorder = idx > 0 ? { borderTop: '1px solid #f3f4f6' } : {};
                            const draftWaiveInfo = draftWaives[slotId];
                            const draftDecision = draftInvoiceDecisions[slotId];
                            if (slotInvoiceRecord && slotInvoiceRecord.status !== 'PENDING') {
                              const invoiced = slotInvoiceRecord.status === 'INVOICED';
                              return (
                                <tr key={slotId} style={rowBorder}>
                                  <td className={tdCls + ' font-medium text-gray-900'}>{shiftLabel}</td>
                                  <td className={tdCls + ' tabular-nums'}>{invoiced ? `Rs.${Number(slotInvoiceRecord.amount).toLocaleString()}` : '—'}</td>
                                  <td className={tdCls}>
                                    <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded ${invoiced ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                                      <span className={`w-1.5 h-1.5 rounded-full ${invoiced ? 'bg-green-500' : 'bg-gray-400'}`} />
                                      {invoiced ? 'Invoiced' : 'Skipped'}
                                    </span>
                                  </td>
                                </tr>
                              );
                            }
                            if (draftWaiveInfo) {
                              return (
                                <tr key={slotId} style={rowBorder}>
                                  <td className={tdCls + ' font-medium text-gray-900'}>{shiftLabel}</td>
                                  <td className={tdCls}>—</td>
                                  <td className={tdCls}>
                                    <div className="flex items-center gap-1.5">
                                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded bg-amber-50 text-amber-700">
                                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                                        Waived (draft)
                                      </span>
                                      <button onClick={() => undoWaive(slotId)} className="px-2.5 py-1 text-[11px] font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded transition">Undo</button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            }
                            if (draftDecision) {
                              return (
                                <tr key={slotId} style={rowBorder}>
                                  <td className={tdCls + ' font-medium text-gray-900'}>{shiftLabel}</td>
                                  <td className={tdCls + ' tabular-nums'}>{draftDecision.approve ? `Rs.${Number(draftDecision.amount).toLocaleString()}` : '—'}</td>
                                  <td className={tdCls}>
                                    <div className="flex items-center gap-1.5">
                                      <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded ${draftDecision.approve ? 'bg-blue-50 text-blue-700' : 'bg-gray-100 text-gray-500'}`}>
                                        <span className={`w-1.5 h-1.5 rounded-full ${draftDecision.approve ? 'bg-blue-400' : 'bg-gray-400'}`} />
                                        {draftDecision.approve ? 'Invoiced (draft)' : 'Skipped (draft)'}
                                      </span>
                                      <button onClick={() => undoInvoiceDecision(slotId)} className="px-2.5 py-1 text-[11px] font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded transition">Undo</button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            }
                            return (
                              <tr key={slotId} style={{ ...rowBorder, background: '#fafafa' }}>
                                <td className={tdCls + ' font-medium text-gray-900'}>{shiftLabel}</td>
                                <td className={tdCls}>
                                  <input type="number" min="0" step="0.01" value={invoiceAmountInputsBySlot[slotId] || ''} onChange={e => setInvoiceAmountInputsBySlot(p => ({ ...p, [slotId]: e.target.value }))} onWheel={e => e.currentTarget.blur()} className="rounded border border-gray-200 px-2 py-1 text-xs outline-none focus:border-blue-500 w-32" placeholder="0.00" />
                                </td>
                                <td className={tdCls}>
                                  <div className="flex flex-wrap gap-1.5">
                                    <button onClick={() => decideInvoice(true, slotId)} disabled={!invoiceAmountInputsBySlot[slotId]} className="px-2.5 py-1 text-[11px] font-semibold text-white bg-gray-800 hover:bg-gray-900 rounded transition disabled:opacity-50">Confirm</button>
                                    <button onClick={() => waiveShift(slotId)} title="No one covered this shift — skips both the client charge and the staff's pay" className="px-2.5 py-1 text-[11px] font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 rounded transition">Waive</button>
                                    <button onClick={() => openRescheduleModal(slotId)} title="Move this shift to a different date" className="px-2.5 py-1 text-[11px] font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded transition">Reschedule</button>
                                  </div>
                                </td>
                              </tr>
                            );
                          }) : (
                            <tr>
                              <td className={tdCls + ' font-medium text-gray-900'}>Day {dayModal.dayNum}</td>
                              {invoiceRecord && invoiceRecord.status !== 'PENDING' ? (
                                <>
                                  <td className={tdCls + ' tabular-nums'}>{invoiceRecord.status === 'INVOICED' ? `Rs.${Number(invoiceRecord.amount).toLocaleString()}` : '—'}</td>
                                  <td className={tdCls}>
                                    <span
                                      title={invoiceRecord.status === 'REVOKED' ? [invoiceRecord.revoke_reason, SETTLEMENT_ACTION_LABELS[invoiceRecord.settlement_action], invoiceRecord.revoked_by_name ? `by ${invoiceRecord.revoked_by_name}` : null].filter(Boolean).join(' — ') : undefined}
                                      className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded ${invoiceRecord.status === 'INVOICED' ? 'bg-green-50 text-green-700' : invoiceRecord.status === 'REVOKED' ? 'bg-red-50 text-red-700' : 'bg-gray-100 text-gray-500'}`}
                                    >
                                      <span className={`w-1.5 h-1.5 rounded-full ${invoiceRecord.status === 'INVOICED' ? 'bg-green-500' : invoiceRecord.status === 'REVOKED' ? 'bg-red-500' : 'bg-gray-400'}`} />
                                      {invoiceRecord.status === 'INVOICED' ? 'Invoiced' : invoiceRecord.status === 'REVOKED' ? 'Revoked' : 'Skipped'}
                                    </span>
                                  </td>
                                </>
                              ) : draftInvoiceDecisions.day ? (
                                <>
                                  <td className={tdCls + ' tabular-nums'}>{draftInvoiceDecisions.day.approve ? `Rs.${Number(draftInvoiceDecisions.day.amount).toLocaleString()}` : '—'}</td>
                                  <td className={tdCls}>
                                    <div className="flex items-center gap-1.5">
                                      <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded ${draftInvoiceDecisions.day.approve ? 'bg-blue-50 text-blue-700' : 'bg-gray-100 text-gray-500'}`}>
                                        <span className={`w-1.5 h-1.5 rounded-full ${draftInvoiceDecisions.day.approve ? 'bg-blue-400' : 'bg-gray-400'}`} />
                                        {draftInvoiceDecisions.day.approve ? 'Invoiced (draft)' : 'Skipped (draft)'}
                                      </span>
                                      <button onClick={() => undoInvoiceDecision('day')} className="px-2.5 py-1 text-[11px] font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded transition">Undo</button>
                                    </div>
                                  </td>
                                </>
                              ) : (
                                <>
                                  <td className={tdCls} style={{ background: '#fafafa' }}>
                                    <input type="number" min="0" step="0.01" value={invoiceAmountInput} onChange={e => setInvoiceAmountInput(e.target.value)} onWheel={e => e.currentTarget.blur()} className="rounded border border-gray-200 px-2 py-1 text-xs outline-none focus:border-blue-500 w-32" placeholder="0.00" />
                                  </td>
                                  <td className={tdCls} style={{ background: '#fafafa' }}>
                                    <div className="flex gap-1.5">
                                      <button onClick={() => decideInvoice(true)} disabled={!invoiceAmountInput} className="px-2.5 py-1 text-[11px] font-semibold text-white bg-gray-800 hover:bg-gray-900 rounded transition disabled:opacity-50">Confirm</button>
                                      <button onClick={() => decideInvoice(false)} className="px-2.5 py-1 text-[11px] font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 rounded transition">Skip</button>
                                    </div>
                                  </td>
                                </>
                              )}
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* ── History ── */}
                {dayHistory.length > 0 && (
                  <div className="px-6 pt-2 pb-6">
                    <p className="text-[10.5px] font-semibold uppercase tracking-widest text-gray-400 mb-3">History</p>
                    <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden' }}>
                      <table className="w-full text-sm border-collapse">
                        <thead style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                          <tr>
                            <th className={thCls}>When</th>
                            <th className={thCls}>Action</th>
                            <th className={thCls}>By</th>
                            <th className={thCls}>Details</th>
                          </tr>
                        </thead>
                        <tbody>
                          {dayHistory.map((h, idx) => {
                            const d = h.details || {};
                            const detailBits = [
                              d.hours_served != null ? `${formatHoursMins(d.hours_served)} served` : null,
                              d.amount != null ? `Rs.${Number(d.amount).toLocaleString()}` : null,
                              d.reason || null,
                              d.notes && d.notes !== 'Marked absent — no-show' ? d.notes : null,
                            ].filter(Boolean);
                            return (
                              <tr key={h.log_id} style={idx > 0 ? { borderTop: '1px solid #f3f4f6' } : {}}>
                                <td className={tdCls + ' text-xs text-gray-500 whitespace-nowrap'}>
                                  {new Date(h.created_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                                </td>
                                <td className={tdCls}>{HISTORY_ACTION_LABEL[h.action_type] || h.action_type}</td>
                                <td className={tdCls + ' text-xs text-gray-600'}>{h.actor_name}{h.actor_role ? ` (${h.actor_role})` : ''}</td>
                                <td className={tdCls + ' text-xs text-gray-500'}>{detailBits.join(' — ') || '—'}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </>
              )}

              </div>

              {/* Footer — Draft -> Preview -> Confirm controls. Nothing above this
                  line is a real staff_daily_attendance/booking_daily_invoices row
                  until Confirm Day is pressed. */}
              <div className="shrink-0 flex items-center justify-between gap-3 px-6 py-4" style={{ borderTop: '1px solid #e5e7eb' }}>
                <div>
                  {hasDraftContent && (
                    <button onClick={discardDayDraft} className="px-3 py-2 text-xs font-semibold text-red-700 bg-red-50 hover:bg-red-100 rounded-lg transition">Discard Draft</button>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {dayModalStep === 'preview' ? (
                    <>
                      <button onClick={() => setDayModalStep('edit')} className="px-4 py-2 text-xs font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition">&larr; Back to Edit</button>
                      <button onClick={confirmDayDraft} disabled={confirmDayBusy || !hasDraftContent} className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition disabled:opacity-50">
                        {confirmDayBusy ? 'Confirming…' : 'Confirm Day'}
                      </button>
                    </>
                  ) : (
                    <button onClick={() => setDayModalStep('preview')} disabled={!hasDraftContent} className="px-4 py-2 text-xs font-semibold text-white bg-gray-800 hover:bg-gray-900 rounded-lg transition disabled:opacity-50">
                      Review &amp; Confirm Day &rarr;
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {showReceiptSendPopup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-sm rounded-xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-green-100">
                  <MessageCircle className="h-4 w-4 text-green-600" />
                </div>
                <h3 className="text-sm font-semibold text-gray-900">Send Payment Receipt?</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowReceiptSendPopup(false)}
                className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="px-5 py-4">
              <p className="text-sm text-gray-600">
                Payment recorded. Would you like to send the receipt to the client via WhatsApp?
              </p>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-gray-100 px-5 py-3">
              <button
                type="button"
                onClick={() => setShowReceiptSendPopup(false)}
                className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
              >
                Skip for now
              </button>
              <button
                type="button"
                onClick={handleSendLatestReceipt}
                disabled={receiptSendBusy}
                className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-4 py-2 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-60"
              >
                {receiptSendBusy
                  ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Sending…</>
                  : <><SendHorizontal className="h-3.5 w-3.5" /> Yes, send now</>
                }
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          TERMINATION REQUEST APPROVE / REJECT MODAL
      ══════════════════════════════════════════════════════ */}
      {termModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[85vh] flex flex-col">
            <div className="flex items-start justify-between p-6 border-b border-slate-200 shrink-0">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  {termModal.mode === 'approve' ? 'Approve Termination Request' : 'Reject Termination Request'}
                </h2>
                <p className="text-sm text-slate-500 mt-0.5">
                  {termModal.mode === 'approve'
                    ? 'Finalises the termination and processes settlement. Staff will be released.'
                    : 'The booking remains active and the client will be notified.'}
                </p>
              </div>
              <button onClick={closeTermModal} className="p-1.5 rounded-lg hover:bg-slate-100 transition shrink-0 ml-4"><XCircle className="h-5 w-5 text-slate-400" /></button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              {termModal.mode === 'approve' ? (
                <>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                      <p className="text-xs text-slate-500 mb-0.5">Total Paid</p>
                      <p className="text-sm font-semibold text-slate-900">{formatMoney(totalPaid)}</p>
                    </div>
                    <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                      <p className="text-xs text-slate-500 mb-0.5">Total Invoiced</p>
                      <p className="text-sm font-semibold text-slate-900">{formatMoney(totalInvoiced)}</p>
                    </div>
                    <div className={`rounded-lg border p-3 ${termProjectedRemainingBalance > 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-100'}`}>
                      <p className="text-xs text-slate-500 mb-0.5">
                        {termFinalEndDate && termFinalEndDate > toDateInput(new Date()) ? 'Projected Balance (end date)' : 'Remaining Balance'}
                      </p>
                      <p className={`text-sm font-semibold ${termProjectedRemainingBalance > 0 ? 'text-emerald-700' : 'text-slate-400'}`}>{formatMoney(termProjectedRemainingBalance)}</p>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Official End Date <span className="text-rose-500">*</span></label>
                    <DateInput
                      value={termFinalEndDate}
                      onChange={e => setTermFinalEndDate(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    />
                    {termFinalEndDate && termFinalEndDate > toDateInput(new Date()) && (
                      <p className="text-xs text-amber-600 mt-1.5">Future date — the booking stays active and billed until then, then terminates automatically.</p>
                    )}
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">Unused prepayment</label>
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                        termSettlementAction === 'BANK_REFUND' ? 'bg-blue-100 text-blue-700'
                          : termSettlementAction === 'WALLET_DEPOSIT' ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-amber-100 text-amber-700'
                      }`}>
                        {termSettlementAction === 'BANK_REFUND' ? 'Refunding to client'
                          : termSettlementAction === 'WALLET_DEPOSIT' ? 'Staying in wallet'
                          : 'Waived as income'}
                      </span>
                    </div>
                    <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <label className={`flex cursor-pointer items-start gap-3 rounded-lg bg-white p-3 text-sm text-slate-700 ring-1 transition ${termSettlementAction === 'BANK_REFUND' ? 'ring-blue-400' : 'ring-slate-200 hover:ring-blue-300'}`}>
                        <input type="radio" name="termSettlementAction" value="BANK_REFUND" checked={termSettlementAction === 'BANK_REFUND'} onChange={e => setTermSettlementAction(e.target.value)} className="mt-1 accent-blue-600" />
                        <div>
                          <div className="flex items-center gap-1.5"><DollarSign className="w-3.5 h-3.5 text-blue-600" /><span className="font-semibold text-slate-900">Refund to client</span></div>
                          <span className="block text-xs text-slate-500 mt-0.5">Return it to the client. Money leaves the company.</span>
                        </div>
                      </label>
                      <label className={`flex cursor-pointer items-start gap-3 rounded-lg bg-white p-3 text-sm text-slate-700 ring-1 transition ${termSettlementAction === 'WALLET_DEPOSIT' ? 'ring-green-400' : 'ring-slate-200 hover:ring-green-300'}`}>
                        <input type="radio" name="termSettlementAction" value="WALLET_DEPOSIT" checked={termSettlementAction === 'WALLET_DEPOSIT'} onChange={e => setTermSettlementAction(e.target.value)} className="mt-1 accent-green-600" />
                        <div>
                          <div className="flex items-center gap-1.5"><Wallet className="w-3.5 h-3.5 text-emerald-600" /><span className="font-semibold text-slate-900">Add to client wallet</span></div>
                          <span className="block text-xs text-slate-500 mt-0.5">Keep it in the wallet, free for their other bookings.</span>
                        </div>
                      </label>
                      <label className={`flex cursor-pointer items-start gap-3 rounded-lg bg-white p-3 text-sm text-slate-700 ring-1 transition ${termSettlementAction === 'NO_REFUND' ? 'ring-amber-400' : 'ring-slate-200 hover:ring-amber-300'}`}>
                        <input type="radio" name="termSettlementAction" value="NO_REFUND" checked={termSettlementAction === 'NO_REFUND'} onChange={e => setTermSettlementAction(e.target.value)} className="mt-1 accent-amber-500" />
                        <div>
                          <div className="flex items-center gap-1.5"><XCircle className="w-3.5 h-3.5 text-amber-600" /><span className="font-semibold text-slate-900">Waive as additional income</span></div>
                          <span className="block text-xs text-slate-500 mt-0.5">The client forfeits it and the company keeps it as income.</span>
                        </div>
                      </label>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1.5">
                      Settlement Note {termSettlementAction === 'NO_REFUND' && <span className="text-rose-500">*</span>}
                    </label>
                    <textarea
                      value={termSettlementNote}
                      onChange={e => setTermSettlementNote(e.target.value)}
                      rows={3}
                      placeholder={termSettlementAction === 'NO_REFUND' ? 'Required — explain why the client forfeits this amount' : 'Optional note about the settlement decision'}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 resize-none"
                    />
                  </div>
                </>
              ) : (
                <div>
                  <div className="flex items-center gap-2 text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 mb-4">
                    <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />
                    The booking will remain active and the client will be notified of the rejection.
                  </div>
                  <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1.5">
                    Reason for Rejection <span className="text-rose-500">*</span>
                  </label>
                  <textarea
                    value={termRejectReason}
                    onChange={e => setTermRejectReason(e.target.value)}
                    rows={4}
                    placeholder="Explain why this termination request is being rejected — this will be shared with the client"
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 resize-none"
                  />
                </div>
              )}

              {termModalError && <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-sm text-rose-700">{termModalError}</div>}
            </div>

            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-200 shrink-0">
              <button onClick={closeTermModal} className="px-4 py-2 text-sm font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">Cancel</button>
              <button
                onClick={submitTermModal}
                disabled={termModalLoading || (termModal.mode === 'approve' ? !termFinalEndDate : !termRejectReason.trim())}
                className={`inline-flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed ${termModal.mode === 'approve' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}`}
              >
                {termModalLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : termModal.mode === 'approve' ? <CheckCircle className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                {termModalLoading ? 'Saving…' : termModal.mode === 'approve' ? 'Confirm Approval' : 'Confirm Rejection'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
};

export default BookingDetailPageV2;
