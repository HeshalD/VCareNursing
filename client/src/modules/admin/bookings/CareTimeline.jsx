import React, { useState, useMemo, useEffect } from 'react';
import { Wallet, Receipt, X, UserCheck, CalendarX, CheckCircle2, LayoutGrid, AlertTriangle, Lock, Undo2, Check, Cross } from 'lucide-react';
import DateInput from '../../../components/common/DateInput';

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

const NURSE_COLORS = [
  { tint: '#FAEEE7', solid: '#C2603F', border: '#E6C8B9' },
  { tint: '#F2EAF5', solid: '#8C5AA6', border: '#DCC8E3' },
  { tint: '#E8F1F9', solid: '#3F77B5', border: '#C3D8EC' },
  { tint: '#E4F1ED', solid: '#137A6B', border: '#A8D4CC' },
  { tint: '#FBF3E3', solid: '#B07D2A', border: '#E0CDA0' },
];

const BAR_COLOR = { paid: '#2F8A5B', overdue: '#C2483C', upcoming: '#D5CFC4' };
const PILL = {
  paid:     { bg: 'rgba(47,138,91,.22)',  color: '#2F8A5B', label: 'Paid' },
  overdue:  { bg: 'rgba(194,72,60,.24)',  color: '#C2483C', label: 'Overdue' },
  upcoming: { bg: 'rgba(213,207,196,.5)', color: '#8A8478', label: 'Upcoming' },
};
const META_COLOR = { PENDING: '#C98A2E', PAID: '#2F8A5B', INVOICED: '#2F8A5B', SKIPPED: '#B4AEA3', REVOKED: '#8A8478', DRAFT: '#3F77B5' };

// Event type config — colour dot + tooltip icon + label
const EVENT_CFG = {
  STAFF_SWAP:                { color: '#7C3AED', Icon: UserCheck,     label: 'New nurse takes over' },
  ASSIGNMENT_START:          { color: '#7C3AED', Icon: UserCheck,     label: 'Staff assignment starts' },
  SHIFT_REASSIGNMENT:        { color: '#7C3AED', Icon: UserCheck,     label: 'Shift staff reassigned' },
  TERMINATION:               { color: '#DC2626', Icon: CalendarX,     label: 'Booking terminates' },
  COMPLETION:                { color: '#2F8A5B', Icon: CheckCircle2,  label: 'Booking completes' },
  SHIFT_PATTERN_CHANGE:      { color: '#3B82F6', Icon: LayoutGrid,    label: 'Shift pattern changes' },
  STAFF_SCHEDULED:           { color: '#7C3AED', Icon: UserCheck,     label: 'Scheduled staff change' },
  CLIENT_TERMINATION_REQUEST:{ color: '#F59E0B', Icon: AlertTriangle, label: 'Termination requested by client' },
  BOOKING_END:               { color: '#6B7280', Icon: CheckCircle2,  label: 'Planned booking end' },
};

// Per-service-model badge colours
const MODEL_CHIP = {
  LIVE_IN:     { bg: '#DCFCE7', color: '#166534', label: '24h Live-In' },
  VISITING:    { bg: '#FEF3C7', color: '#92400E', label: 'Visit' },
  SHIFT_BASED: { bg: '#EDE9FE', color: '#4C1D95', label: 'Shift-Based' },
};

const metaLabel = (meta, doneWord) => {
  if (!meta) return '';
  if (meta.status === 'DRAFT') return 'Draft — not confirmed';
  if (meta.status === 'PENDING') return 'Action needed';
  if (meta.status === 'SKIPPED') return 'Skipped';
  if (meta.status === 'REVOKED') return 'Revoked';
  return `${doneWord} Rs ${Number(meta.amount || 0).toLocaleString('en-US')}`;
};

const fmtShort = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
const fmtFull  = (d) => d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
const shiftDays = (base, n) => { const d = new Date(base); d.setDate(d.getDate() + n); return d; };
const toLocalISO = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Returns CSS background value for a cell based on service model and assigned nurses
const buildCellBackground = (nurses, delivered, serviceModel) => {
  if (!delivered || nurses.length === 0) return '#FCFBF8';

  if (serviceModel === 'VISITING') {
    // Visiting: white cell; accent is on the border, not the fill
    return '#FFFFFF';
  }

  if (nurses.length === 1) return nurses[0].color.tint;

  // SHIFT_BASED multi-nurse: hard-stop gradient bands
  const pct = 100 / nurses.length;
  const stops = nurses.map((n, i) =>
    `${n.color.tint} ${(i * pct).toFixed(1)}% ${((i + 1) * pct).toFixed(1)}%`
  );
  return `linear-gradient(to right, ${stops.join(', ')})`;
};

const DOW_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const CareTimeline = ({
  startDate,
  plannedDays,
  dailyRate,
  shiftRate = 0,         // SHIFT_BASED: client charge per shift — daily figures derive from this, never dailyRate
  totalPaid,
  staffAssignments = [],
  serviceModel,          // 'LIVE_IN' | 'VISITING' | 'SHIFT_BASED'
  shiftSlots = [],       // [{ shift_slot_id, shift_number, label, start_time }]
  scheduledActions = [], // [{ action_type, effective_date, payload, reason }]
  terminationRequests = [], // [{ requested_end_date, urgency, reason }]
  shiftPatternScheduled = null, // { effective_from_date, shift_count } | null
  bookingStatus = null,   // bookings.status — used to detect COMPLETED/TERMINATED
  completionDate = null,  // bookings.actual_end_time — the real (not just planned) end date
  scheduledEndDate = null, // bookings.scheduled_end_time — planned end; bounds natural occurrences (LIVE_IN/VISITING only — SHIFT_BASED has no booking end date, see naturalEndDayNum)
  simDate = null,
  onSimDateChange,
  onDayClick,
  attendanceRecords = [],
  dailyInvoiceRecords = [],
  draftDates = new Set(), // Set<dateISO> — days with a cached-but-unconfirmed booking_day_drafts row
  reschedules = [],      // [{ reschedule_id, shift_slot_id, original_date, new_date, new_start_time, assignment_id, makeup_staff_name, shift_number, shift_label }]
  manualSalaryDay = false,
  manualInvoiceDay = false,
  pauses = [],           // [{ paused_date, resume_date, resumed_date }] — booking_pauses rows, any order
  revokeEnabled = false, // true only for LIVE_IN/SHIFT_BASED + the viewer is a Super Admin
  onRevokeDays,          // async (targets: { service_date: string, shift_slot_id: string|null }[], reason: string, password: string, settlementAction: string) => void
  hospitalizationPeriods = [], // [{ started_date, ended_date }] — booking_hospitalizations rows, ended_date null = ongoing
}) => {
  const [monthOffset,   setMonthOffset]   = useState(null);
  const [hoveredDay,    setHoveredDay]    = useState(null);
  const [showSimPicker, setShowSimPicker] = useState(false);
  const [selectMode,    setSelectMode]    = useState(false);
  const [selectedDates, setSelectedDates] = useState(() => new Set());
  const [showRevokeConfirm, setShowRevokeConfirm] = useState(false);
  // SHIFT_BASED starts on 'shifts' (pick exactly which shift(s) per selected day) before
  // reaching 'details' (reason/settlement/password) — LIVE_IN skips straight to 'details'.
  const [revokeStep, setRevokeStep] = useState('details');
  const [selectedShiftTargets, setSelectedShiftTargets] = useState(() => new Set()); // Set<`${dateISO}__${shift_slot_id}`>
  const [revokeReason,  setRevokeReason]  = useState('');
  const [revokePassword, setRevokePassword] = useState('');
  const [revokeSettlementAction, setRevokeSettlementAction] = useState('WALLET_REFUND');
  const [revokeBusy,    setRevokeBusy]    = useState(false);
  const [revokeError,   setRevokeError]   = useState('');
  const isMobile = useIsMobile();

  const toggleSelectedDate = (dateISO) => {
    setSelectedDates((prev) => {
      const next = new Set(prev);
      if (next.has(dateISO)) next.delete(dateISO);
      else next.add(dateISO);
      return next;
    });
  };

  const exitSelectMode = () => {
    setSelectMode(false);
    setSelectedDates(new Set());
    setShowRevokeConfirm(false);
    setRevokeStep('details');
    setSelectedShiftTargets(new Set());
    setRevokeReason('');
    setRevokePassword('');
    setRevokeSettlementAction('WALLET_REFUND');
    setRevokeError('');
  };

  const toggleShiftTarget = (key) => {
    setSelectedShiftTargets((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleAllShiftsForDate = (dateISO, shifts) => {
    setSelectedShiftTargets((prev) => {
      const next = new Set(prev);
      const keys = shifts.map((s) => `${dateISO}__${s.shift_slot_id}`);
      const allSelected = keys.every((k) => next.has(k));
      keys.forEach((k) => (allSelected ? next.delete(k) : next.add(k)));
      return next;
    });
  };

  const submitRevoke = async () => {
    if (isShiftBased && selectedShiftTargets.size === 0) {
      setRevokeError('Select at least one shift');
      return;
    }
    if (!revokeReason.trim() || !revokePassword) {
      setRevokeError('A reason and your password are both required');
      return;
    }
    setRevokeBusy(true);
    setRevokeError('');
    try {
      const targets = isShiftBased
        ? [...selectedShiftTargets].map((key) => {
            const sep = key.indexOf('__');
            return { service_date: key.slice(0, sep), shift_slot_id: key.slice(sep + 2) };
          })
        : [...selectedDates].map((d) => ({ service_date: d, shift_slot_id: null }));
      await onRevokeDays?.(targets, revokeReason.trim(), revokePassword, revokeSettlementAction);
      exitSelectMode();
    } catch (err) {
      setRevokeError(err?.response?.data?.message || err?.message || 'Failed to revoke selected day(s)');
    } finally {
      setRevokeBusy(false);
    }
  };

  const isShiftBased = serviceModel === 'SHIFT_BASED';

  // ── Core date references ──────────────────────────────────────────────────

  const start = useMemo(() => {
    if (!startDate) return null;
    const d = new Date(startDate);
    d.setHours(0, 0, 0, 0);
    return d;
  }, [startDate]);

  const effectiveToday = useMemo(() => {
    const d = simDate ? new Date(simDate) : new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, [simDate]);

  // ── Pause windows ─────────────────────────────────────────────────────────
  // A pause blanks out the calendar days between when it started and when it (or its
  // target resume date) ends — those days look locked/greyed, don't count as service,
  // and don't get their own "Day N" number. Everything from the resume day onward picks
  // the numbering back up right where the pause began, so a week-long pause never makes
  // the client's day count jump by a week for nothing.
  const pauseWindows = useMemo(() => {
    if (!start || !pauses.length) return [];
    const dayNumOf = (dateStr) => {
      if (!dateStr) return null;
      const d = new Date(dateStr);
      if (isNaN(d)) return null;
      d.setHours(0, 0, 0, 0);
      return Math.round((d - start) / 86400000) + 1;
    };
    return pauses
      .map((p) => ({
        pausedDayNum: dayNumOf(p.paused_date),
        // An already-resumed pause is bounded by when it ACTUALLY resumed, not the
        // (possibly missed/changed) target resume_date it was set to.
        endDayNum: p.resumed_date ? dayNumOf(p.resumed_date) : dayNumOf(p.resume_date),
        openEnded: !p.resumed_date && !p.resume_date,
      }))
      .filter((w) => w.pausedDayNum != null)
      .sort((a, b) => a.pausedDayNum - b.pausedDayNum);
  }, [pauses, start]);

  // Resolves a raw (uncompressed) calendar day-number to whether it falls inside a
  // locked gap, and — if not — its display day-number with prior gaps squeezed out.
  const resolvePauseDay = (rawDayNum) => {
    let locked = false;
    let compress = 0;
    for (const w of pauseWindows) {
      if (w.openEnded) {
        if (rawDayNum > w.pausedDayNum) locked = true;
        continue;
      }
      const gapStart = w.pausedDayNum + 1;
      const gapEnd = w.endDayNum - 1;
      if (gapEnd < gapStart) continue; // resumed same/next day — no visible gap
      if (rawDayNum >= gapStart && rawDayNum <= gapEnd) locked = true;
      else if (rawDayNum > gapEnd) compress += (gapEnd - gapStart + 1);
    }
    return { locked, displayDayNum: rawDayNum - compress };
  };

  // Inverse of resolvePauseDay's compression — plannedDays/paidDays are day-COUNTS
  // (effective/compressed scale, e.g. "9 days of paid service"), but the calendar grid
  // needs a RAW calendar day-number to know how many real dates to render. Without
  // this, a paused booking's grid gets cut short by exactly the length of its pause
  // gap(s) — the last few paid days after resuming never appear.
  const effectiveCountToRawDay = (target) => {
    let raw = target;
    for (const w of pauseWindows) {
      if (w.openEnded) break; // nothing meaningfully "beyond" an open-ended pause
      const gapStart = w.pausedDayNum + 1;
      const gapEnd = w.endDayNum - 1;
      if (gapEnd < gapStart) continue;
      if (raw >= gapStart) raw += (gapEnd - gapStart + 1);
    }
    return raw;
  };

  // ── Day counts ────────────────────────────────────────────────────────────

  const servedDays = useMemo(() => {
    // VISITING is a one-time visit — it only ever has a single service day, so
    // servedDays is always 1 (never inflates with elapsed calendar days, and never
    // drops to 0 before the visit date either).
    if (serviceModel === 'VISITING') return 1;
    if (!start) return 0;
    const rawDayNum = Math.max(0, Math.floor((effectiveToday - start) / 86400000) + 1);
    if (rawDayNum === 0) return 0;
    // While "today" sits inside a locked gap (or past an open-ended pause with no
    // resume date), service isn't actually happening — freeze the count at the day
    // the pause started rather than let real calendar time keep inflating it.
    for (const w of pauseWindows) {
      if (w.openEnded) {
        if (rawDayNum > w.pausedDayNum) return resolvePauseDay(w.pausedDayNum).displayDayNum;
        continue;
      }
      const gapStart = w.pausedDayNum + 1;
      const gapEnd = w.endDayNum - 1;
      if (gapEnd >= gapStart && rawDayNum >= gapStart && rawDayNum <= gapEnd) {
        return resolvePauseDay(w.pausedDayNum).displayDayNum;
      }
    }
    return resolvePauseDay(rawDayNum).displayDayNum;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [start, effectiveToday, pauseWindows]);

  // SHIFT_BASED bookings are billed per shift, so a "day" of payment covers one
  // full pattern of shifts (shift_rate × shifts/day) — dailyRate plays no part.
  const effectiveDayRate = useMemo(() => (
    isShiftBased ? Number(shiftRate || 0) * (shiftSlots.length || 0) : Number(dailyRate || 0)
  ), [isShiftBased, shiftRate, shiftSlots, dailyRate]);

  const paidDays = useMemo(() => {
    if (!effectiveDayRate || effectiveDayRate <= 0) return 0;
    return Math.floor(Number(totalPaid || 0) / effectiveDayRate);
  }, [totalPaid, effectiveDayRate]);

  // Latest day-number implied by any known future event (a SCHEDULED staff start,
  // an admin-scheduled action, a pending termination request, or a queued shift
  // pattern change) — without this, the calendar grid stops at plannedDays/servedDays
  // and a future event's month/day is never reachable, so its marker never shows.
  const maxEventDayNum = useMemo(() => {
    if (!start) return 0;
    let max = 0;
    const consider = (dateStr) => {
      if (!dateStr) return;
      const d = new Date(dateStr);
      if (isNaN(d)) return;
      d.setHours(0, 0, 0, 0);
      const dayNum = Math.round((d - start) / 86400000) + 1;
      if (dayNum > max) max = dayNum;
    };
    staffAssignments.forEach((a) => {
      if ((a.status || a.current_status || '').toUpperCase() === 'SCHEDULED') consider(a.service_start_date);
    });
    scheduledActions.forEach((sa) => consider(sa.effective_date));
    terminationRequests.forEach((tr) => consider(tr.requested_end_date));
    if (shiftPatternScheduled?.effective_from_date) consider(shiftPatternScheduled.effective_from_date);
    if (completionDate) consider(completionDate);
    // A makeup shift's new_date is often past the booking's current plan (rescheduling
    // defaults to just after the scheduled end) — without this, that date falls outside
    // displayDays and renders as a plain "outside booking" cell instead of the makeup shift.
    reschedules.forEach((r) => consider(r.new_date));
    // A pause's (target or actual) resume date is often well past whatever the plan/
    // served-days would otherwise reach — without this, displayDays cuts off partway
    // through the locked gap and the resume day (and everything after it) never renders.
    pauses.forEach((p) => { consider(p.resume_date); consider(p.resumed_date); });
    return max;
  }, [start, staffAssignments, scheduledActions, terminationRequests, shiftPatternScheduled, completionDate, reschedules, pauses]);

  const hasPlan = (plannedDays || 0) > 0;
  // plannedDays/servedDays are effective (pause-compressed) day-COUNTS — convert to
  // raw calendar day-numbers before comparing against maxEventDayNum (already raw),
  // otherwise the grid is cut short by exactly however many days were paused.
  const displayDays  = Math.max(effectiveCountToRawDay(plannedDays || 0), effectiveCountToRawDay(servedDays), maxEventDayNum);
  // Overrun ("beyond booking end") only makes sense relative to a real paid plan.
  // An unpaid booking has no plan to exceed — every served day is simply unpaid/
  // overdue, rendered like the others rather than flagged as "beyond booking end".
  const overrunDays  = hasPlan ? Math.max(0, servedDays - plannedDays) : 0;
  const overdueCount  = Math.max(0, servedDays - paidDays);
  const upcomingCount = Math.max(0, (plannedDays || 0) - servedDays);

  // Last day-number the booking naturally covers. Standing shift assignments are
  // open-ended in the DB (service_end_date stays NULL until completion actually
  // runs), so without this bound they'd render as working shifts on every day
  // the grid shows — including days past the planned end that only exist in the
  // grid because a makeup shift was scheduled there. scheduled_end_time and the
  // payment-derived plannedDays can disagree by a day (different derivations), so
  // take whichever reaches further — matching the extent the rest of the calendar
  // has always painted as "the booking".
  const naturalEndDayNum = useMemo(() => {
    // plannedDays is an effective (pause-compressed) day-COUNT; this bound is compared
    // against RAW day-numbers elsewhere, so it needs the same raw-equivalent conversion
    // as displayDays — otherwise a paused booking's natural end looks like it arrives
    // one pause-gap's-worth of days too early, and every day after that (that only has
    // coverage because it was legitimately re-staffed post-resume) gets treated as "not
    // a real booking day" and greyed out like an outside cell.
    const rawPlannedDays = (plannedDays || 0) > 0 ? effectiveCountToRawDay(plannedDays) : 0;

    // SHIFT_BASED has no booking end date at all — the shift-derived plannedDays
    // is the only natural bound. Before any payment/plan exists there is nothing
    // to bound against, so natural occurrences render on every day the grid reaches.
    if (isShiftBased) return rawPlannedDays > 0 ? rawPlannedDays : null;

    let schedEnd = 0;
    if (start && scheduledEndDate) {
      const d = new Date(scheduledEndDate);
      if (!isNaN(d)) {
        d.setHours(0, 0, 0, 0);
        schedEnd = Math.round((d - start) / 86400000) + 1;
      }
    }
    const end = Math.max(schedEnd, rawPlannedDays);
    return end > 0 ? end : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [start, scheduledEndDate, plannedDays, isShiftBased, pauseWindows]);

  // Future days past the booking's natural end carry no shift occurrences of
  // their own — the grid only reaches them because something explicit (e.g. a
  // makeup shift) was scheduled there. Delivered overrun days keep showing
  // staff: the booking genuinely ran on.
  const isBeyondNaturalFuture = (dayNum) =>
    naturalEndDayNum !== null && dayNum > naturalEndDayNum && dayNum > servedDays;

  // The paid shifts may not divide evenly into days (e.g. 7 shifts @ 2/day):
  // the plan then ends on a partial day carrying only the leftover shift(s).
  // plannedDays already ceils to include that day (see BookingDetailPageV2);
  // this pins down which day it is and how many shifts of it are actually paid,
  // so the grid doesn't paint the full pattern there.
  const partialLastDay = useMemo(() => {
    if (!isShiftBased || !shiftRate || !shiftSlots.length || !plannedDays) return null;
    const paidShifts = Math.floor(Number(totalPaid || 0) / shiftRate);
    const remainder = paidShifts - (plannedDays - 1) * shiftSlots.length;
    if (remainder <= 0 || remainder >= shiftSlots.length) return null;
    // `day` is matched against the RAW day-number in getNursesForDay — plannedDays
    // itself is an effective (pause-compressed) count, same conversion as elsewhere.
    return { day: effectiveCountToRawDay(plannedDays), count: remainder };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isShiftBased, shiftRate, shiftSlots, plannedDays, totalPaid, pauseWindows]);

  // ── Reschedules — moved-away origins + makeup occurrences ────────────────
  const movedOrigins = useMemo(() => {
    const set = new Set();
    reschedules.forEach((r) => set.add(`${r.shift_slot_id}__${r.original_date?.slice(0, 10)}`));
    return set;
  }, [reschedules]);

  const assignmentByIdForReschedule = useMemo(() => {
    const map = new Map();
    staffAssignments.forEach((a) => map.set(a.assignment_id || a.id, a));
    return map;
  }, [staffAssignments]);

  // ── Nurse colour pool ─────────────────────────────────────────────────────

  const nurseColorMap = useMemo(() => {
    const map = new Map();
    const sorted = [...staffAssignments].sort(
      (a, b) => new Date(a.service_start_date || a.startDate || 0) - new Date(b.service_start_date || b.startDate || 0)
    );
    let idx = 0;
    sorted.forEach((a) => {
      const id = a.staff_profile_id || a.staffId || a.id;
      if (id && !map.has(id)) { map.set(id, NURSE_COLORS[idx % NURSE_COLORS.length]); idx++; }
    });
    return map;
  }, [staffAssignments]);

  // ── Salary / invoice status per day ──────────────────────────────────────

  const attendanceByDate = useMemo(() => {
    const map = new Map();
    attendanceRecords.forEach((r) => {
      const key = r.service_date?.slice(0, 10);
      if (!key) return;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(r);
    });
    return map;
  }, [attendanceRecords]);

  const invoiceByDate = useMemo(() => {
    const map = new Map();
    dailyInvoiceRecords.forEach((r) => {
      const key = r.service_date?.slice(0, 10);
      if (key) map.set(key, r);
    });
    return map;
  }, [dailyInvoiceRecords]);

  // Per-date, per-shift breakdown for the SHIFT_BASED revoke picker — unlike
  // invoiceByDate above (which keeps only the last record per date, fine for the
  // day-level aggregate badges), this needs every shift's own row so the admin can
  // pick individually. Only shifts actually PAID/INVOICED are revocable.
  const revocableShiftsByDate = useMemo(() => {
    if (!isShiftBased) return new Map();
    const map = new Map(); // dateISO -> [{ shift_slot_id, shift_number, shift_label, staff_name }]
    selectedDates.forEach((dateISO) => {
      const shifts = new Map(); // shift_slot_id -> row
      (attendanceByDate.get(dateISO) || []).forEach((r) => {
        if (!r.shift_slot_id || r.salary_status !== 'PAID') return;
        shifts.set(r.shift_slot_id, {
          shift_slot_id: r.shift_slot_id,
          shift_number: r.shift_number,
          shift_label: r.shift_label,
          staff_name: r.staff_name,
        });
      });
      dailyInvoiceRecords.forEach((r) => {
        if (r.service_date?.slice(0, 10) !== dateISO || !r.shift_slot_id || r.status !== 'INVOICED') return;
        const existing = shifts.get(r.shift_slot_id);
        if (!existing) shifts.set(r.shift_slot_id, { shift_slot_id: r.shift_slot_id, shift_number: r.shift_number, shift_label: r.shift_label, staff_name: null });
      });
      if (shifts.size > 0) {
        map.set(dateISO, [...shifts.values()].sort((a, b) => (a.shift_number || 0) - (b.shift_number || 0)));
      }
    });
    return map;
  }, [isShiftBased, selectedDates, attendanceByDate, dailyInvoiceRecords]);

  // Hospitalization periods — each covers [started_date, ended_date] inclusive; an
  // open (ongoing) period has ended_date null, so it covers every day from
  // started_date through whatever the grid renders (including future/today).
  const hospitalizedRanges = useMemo(() => (
    hospitalizationPeriods
      .filter((p) => p.started_date)
      .map((p) => ({
        start: String(p.started_date).slice(0, 10),
        end: p.ended_date ? String(p.ended_date).slice(0, 10) : null,
      }))
  ), [hospitalizationPeriods]);

  const isDateHospitalized = (dateISO) =>
    hospitalizedRanges.some((r) => dateISO >= r.start && (r.end === null || dateISO <= r.end));

  // Build a map of dateISO → event list from all event sources
  const eventsByDate = useMemo(() => {
    const map = new Map();
    const add = (dateISO, event) => {
      if (!dateISO) return;
      const key = dateISO.slice(0, 10);
      if (!map.has(key)) map.set(key, []);
      // Deduplicate by type so the same action_type only appears once per day
      if (!map.get(key).some(e => e.type === event.type && e.label === event.label)) {
        map.get(key).push(event);
      }
    };

    // SCHEDULED staff assignments (already in staffAssignments, status = 'SCHEDULED')
    staffAssignments.forEach((a) => {
      if ((a.status || a.current_status || '').toUpperCase() === 'SCHEDULED' && a.service_start_date) {
        const cfg = EVENT_CFG.STAFF_SCHEDULED;
        const slot = shiftSlots.find((s) => s.shift_slot_id === a.shift_slot_id);
        add(a.service_start_date, {
          type: 'STAFF_SCHEDULED',
          label: `${a.full_name || a.staff_name || 'Staff'} starts${slot ? ` (${slot.label || `Shift ${slot.shift_number}`})` : ''}`,
          color: cfg.color,
          Icon:  cfg.Icon,
        });
      }
    });

    // Admin-scheduled actions from scheduled_actions table
    scheduledActions.forEach((sa) => {
      const cfg = EVENT_CFG[sa.action_type];
      if (!cfg || !sa.effective_date) return;
      add(sa.effective_date, {
        type:   sa.action_type,
        label:  cfg.label + (sa.reason ? ` — ${sa.reason}` : ''),
        color:  cfg.color,
        Icon:   cfg.Icon,
      });
    });

    // Client-submitted termination requests (status = PENDING)
    terminationRequests.forEach((tr) => {
      if (tr.requested_end_date) {
        const cfg = EVENT_CFG.CLIENT_TERMINATION_REQUEST;
        const urgency = (tr.urgency || '').toUpperCase();
        add(tr.requested_end_date, {
          type:  'CLIENT_TERMINATION_REQUEST',
          label: `Termination requested${urgency === 'URGENT' ? ' (urgent)' : ''}${tr.reason ? ` — ${tr.reason}` : ''}`,
          color: urgency === 'URGENT' ? '#DC2626' : cfg.color,
          Icon:  cfg.Icon,
        });
      }
    });

    // Scheduled shift pattern change
    if (shiftPatternScheduled?.effective_from_date) {
      const cfg = EVENT_CFG.SHIFT_PATTERN_CHANGE;
      const count = shiftPatternScheduled.shift_count;
      add(shiftPatternScheduled.effective_from_date, {
        type:  'SHIFT_PATTERN_CHANGE',
        label: `Shift pattern changes${count ? ` to ${count} shifts` : ''}`,
        color: cfg.color,
        Icon:  cfg.Icon,
      });
    }

    // Built-in: planned booking end — start + plannedDays, no API needed. plannedDays is
    // an effective (pause-compressed) count, so convert to a raw day-number first, or a
    // pause pushes the real calendar end date out further than this marker would show.
    if (start && plannedDays > 0) {
      const lastDay = shiftDays(start, effectiveCountToRawDay(plannedDays) - 1);
      const cfg = EVENT_CFG.BOOKING_END;
      add(toLocalISO(lastDay), {
        type:  'BOOKING_END',
        label: 'Planned booking end',
        color: cfg.color,
        Icon:  cfg.Icon,
      });
    }

    // Booking has actually completed/terminated — mark the real end date. The
    // matching SCHEDULED scheduled_actions row (if this was set up in advance)
    // flips to EXECUTED and drops out of `scheduledActions` the moment it runs, so
    // without this, the marker would vanish right when the booking actually ends.
    if (completionDate && ['COMPLETED', 'TERMINATED'].includes((bookingStatus || '').toUpperCase())) {
      const isTerminated = (bookingStatus || '').toUpperCase() === 'TERMINATED';
      const cfg = isTerminated ? EVENT_CFG.TERMINATION : EVENT_CFG.COMPLETION;
      add(String(completionDate).slice(0, 10), {
        type:  'BOOKING_ENDED',
        label: isTerminated ? 'Booking terminated' : 'Booking completed',
        color: cfg.color,
        Icon:  cfg.Icon,
      });
    }

    return map;
  }, [staffAssignments, scheduledActions, terminationRequests, shiftPatternScheduled, shiftSlots, start, plannedDays, bookingStatus, completionDate, pauseWindows]);

  const getDayMeta = (dateISO, delivered) => {
    if (!delivered) return { salary: null, invoice: null };
    const salaryRecs = attendanceByDate.get(dateISO) || [];
    let salary = null;
    if (salaryRecs.length > 0) {
      const anyPending = salaryRecs.some((r) => r.salary_status === 'PENDING');
      const anyPaid    = salaryRecs.some((r) => r.salary_status === 'PAID');
      const anyRevoked = salaryRecs.some((r) => r.salary_status === 'REVOKED');
      const status = anyPending ? 'PENDING' : anyPaid ? 'PAID' : anyRevoked ? 'REVOKED' : 'SKIPPED';
      const decidedBy = [...new Set(salaryRecs.filter((r) => r.decided_by_name).map((r) => r.decided_by_name))].join(', ') || null;
      const amount = salaryRecs.reduce((sum, r) => sum + (r.salary_status === 'PAID' ? Number(r.salary_amount || 0) : 0), 0);
      salary = { status, decidedBy, amount };
    } else if (manualSalaryDay) {
      salary = { status: 'PENDING', decidedBy: null, amount: 0 };
    }
    const invRec = invoiceByDate.get(dateISO);
    let invoice = null;
    if (invRec) {
      invoice = { status: invRec.status, decidedBy: invRec.decided_by_name || null, amount: Number(invRec.amount || 0) };
    } else if (manualInvoiceDay) {
      invoice = { status: 'PENDING', decidedBy: null, amount: 0 };
    }

    // A cached-but-unconfirmed booking_day_drafts row exists for this day and
    // nothing real has been written yet — surface it as its own DRAFT status
    // (distinct from "needs attention" PENDING) so the admin can tell "in
    // progress" apart from "not started" or "done" at a glance.
    if (draftDates.has(dateISO)) {
      if (salaryRecs.length === 0) salary = { status: 'DRAFT', decidedBy: null, amount: 0 };
      if (!invRec) invoice = { status: 'DRAFT', decidedBy: null, amount: 0 };
    }

    return { salary, invoice };
  };

  // Returns ALL nurses active on a day (multiple for SHIFT_BASED, single for others)
  const getNursesForDay = (dayNum) => {
    if (!start) return [];
    const dayDate = shiftDays(start, dayNum - 1);
    dayDate.setHours(12, 0, 0, 0);

    if (!isShiftBased) {
      // Single nurse: pick the most recently started assignment covering this day
      let bestMatch = null;
      let bestStart = null;
      for (const a of staffAssignments) {
        const aStart = new Date(a.service_start_date || a.startDate);
        aStart.setHours(0, 0, 0, 0);
        const aEnd = (a.service_end_date || a.endDate) ? new Date(a.service_end_date || a.endDate) : null;
        if (aEnd) aEnd.setHours(23, 59, 59, 999);
        // VISITING is a one-time visit — only its single service_start_date day
        // should be staffed, not every day from then on (unlike LIVE_IN's ongoing range).
        // Compared as calendar dates (not exact timestamps) since dayDate sits at
        // noon while aStart sits at midnight.
        const inRange = serviceModel === 'VISITING'
          ? toLocalISO(dayDate) === toLocalISO(aStart)
          : dayDate >= aStart && (!aEnd || dayDate <= aEnd);
        if (inRange) {
          if (!bestStart || aStart > bestStart) {
            bestStart = aStart;
            const id = a.staff_profile_id || a.staffId || a.id;
            bestMatch = {
              name:        a.full_name || a.staff_name || a.name || 'Staff',
              designation: a.designation || '',
              color:       nurseColorMap.get(id) || NURSE_COLORS[0],
              shiftLabel:  null,
              shiftStartTime: null,
              shiftNumber: 0,
            };
          }
        }
      }
      return bestMatch ? [bestMatch] : [];
    }

    // SHIFT_BASED: collect all assignments active on this day, one per shift slot
    const dateISO = toLocalISO(dayDate);
    const matches = [];

    for (const a of isBeyondNaturalFuture(dayNum) ? [] : staffAssignments) {
      // A makeup-only assignment (created just to cover one rescheduled shift)
      // is rendered separately below, keyed off the reschedule's new_date —
      // skip it here so it doesn't also show up on its own service_start_date.
      if (a.reschedule_id) continue;

      const aStart = new Date(a.service_start_date || a.startDate);
      aStart.setHours(0, 0, 0, 0);
      const aEnd = (a.service_end_date || a.endDate) ? new Date(a.service_end_date || a.endDate) : null;
      if (aEnd) aEnd.setHours(23, 59, 59, 999);
      if (dayDate >= aStart && (!aEnd || dayDate <= aEnd)) {
        const id   = a.staff_profile_id || a.staffId || a.id;
        const slot = shiftSlots.find((s) => s.shift_slot_id === a.shift_slot_id);
        const shiftLabel = slot?.label || (slot?.shift_number ? `Shift ${slot.shift_number}` : 'Shift');

        // This shift's origin occurrence was moved to a different date —
        // render it as "moved" rather than a normal working shift, so it
        // doesn't look like the client was billed/served here.
        if (a.shift_slot_id && movedOrigins.has(`${a.shift_slot_id}__${dateISO}`)) {
          matches.push({
            name: a.full_name || a.staff_name || a.name || 'Staff',
            designation: '', color: NURSE_COLORS[0], kind: 'MOVED',
            shiftLabel, shiftStartTime: null, shiftNumber: slot?.shift_number ?? 999,
          });
          continue;
        }

        matches.push({
          name:           a.full_name || a.staff_name || a.name || 'Staff',
          designation:    a.designation || '',
          color:          nurseColorMap.get(id) || NURSE_COLORS[0],
          shiftLabel,
          shiftStartTime: slot?.start_time || null,
          shiftNumber:    slot?.shift_number ?? 999,
          kind: 'NATURAL',
        });
      }
    }

    // Final partial plan day: only the leftover paid shift(s) belong here — trim
    // the natural pattern down to that count (lowest shift numbers first). Only
    // for future days; once a day is delivered, show what actually ran.
    if (partialLastDay && dayNum === partialLastDay.day && dayNum > servedDays) {
      matches.sort((a, b) => a.shiftNumber - b.shiftNumber);
      let kept = 0;
      const trimmed = matches.filter((n) => n.kind !== 'NATURAL' || ++kept <= partialLastDay.count);
      matches.length = 0;
      matches.push(...trimmed);
    }

    // Makeup occurrences landing on this date
    reschedules.forEach((r) => {
      if (r.new_date?.slice(0, 10) !== dateISO) return;
      const makeupAssignment = assignmentByIdForReschedule.get(r.assignment_id);
      const id = makeupAssignment?.staff_profile_id || makeupAssignment?.staffId || makeupAssignment?.id;
      matches.push({
        name: r.makeup_staff_name || makeupAssignment?.full_name || makeupAssignment?.staff_name || 'Staff',
        designation: makeupAssignment?.designation || '',
        color: nurseColorMap.get(id) || NURSE_COLORS[0],
        shiftLabel: r.shift_label || (r.shift_number ? `Shift ${r.shift_number}` : 'Shift'),
        shiftStartTime: r.new_start_time || null,
        shiftNumber: r.shift_number ?? 999,
        kind: 'MAKEUP',
      });
    });

    matches.sort((a, b) => a.shiftNumber - b.shiftNumber);
    return matches;
  };

  // ── Month list ─────────────────────────────────────────────────────────────

  const bookingMonths = useMemo(() => {
    if (!start || !displayDays) return [];
    const months = [];
    const endDate = shiftDays(start, displayDays - 1);
    let cur = new Date(start.getFullYear(), start.getMonth(), 1);
    const endMonth = new Date(endDate.getFullYear(), endDate.getMonth(), 1);
    while (cur <= endMonth) {
      months.push({ year: cur.getFullYear(), month: cur.getMonth() });
      cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
    }
    return months;
  }, [start, displayDays]);

  const defaultMonthIdx = useMemo(() => {
    if (!bookingMonths.length) return 0;
    for (let i = 0; i < bookingMonths.length; i++) {
      const { year, month } = bookingMonths[i];
      if (effectiveToday.getFullYear() === year && effectiveToday.getMonth() === month) return i;
    }
    return bookingMonths.length - 1;
  }, [bookingMonths, effectiveToday]);

  const clampedMonthIdx = monthOffset !== null
    ? Math.max(0, Math.min(monthOffset, bookingMonths.length - 1))
    : defaultMonthIdx;

  useEffect(() => {
    if (!simDate || !bookingMonths.length) return;
    const sd = new Date(simDate);
    const idx = bookingMonths.findIndex((m) => m.year === sd.getFullYear() && m.month === sd.getMonth());
    if (idx >= 0) setMonthOffset(idx);
    else setMonthOffset(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [simDate]);

  // ── Build calendar grid ───────────────────────────────────────────────────

  const { monthLabel, calRows } = useMemo(() => {
    if (!bookingMonths.length || !start) return { monthLabel: '', calRows: [] };

    const { year, month } = bookingMonths[clampedMonthIdx];
    const firstOfMonth = new Date(year, month, 1);
    const daysInMonth  = new Date(year, month + 1, 0).getDate();
    const startDow     = firstOfMonth.getDay();

    const cells = [];
    for (let i = 0; i < startDow; i++) cells.push({ type: 'empty' });

    for (let d = 1; d <= daysInMonth; d++) {
      const cellDate  = new Date(year, month, d);
      const dateISO   = toLocalISO(cellDate);
      const rawDayNum = Math.round((cellDate - start) / 86400000) + 1;
      const inBooking = rawDayNum >= 1 && rawDayNum <= displayDays;
      const { locked: isPaused, displayDayNum: dayNum } = resolvePauseDay(rawDayNum);

      if (inBooking && isPaused) {
        cells.push({ type: 'paused', calDay: d, dateISO });
        continue;
      }

      // getNursesForDay/isBeyondNaturalFuture map a day-number back to a real calendar
      // date (or compare against naturalEndDayNum, itself derived straight from real
      // dates) — both need the RAW day-number, not the pause-compressed display one.
      const nurses = inBooking ? getNursesForDay(rawDayNum) : [];
      const cellEvents = inBooking ? (eventsByDate.get(dateISO) || []) : [];

      // Days past the booking's natural end are only "in" the grid because a makeup
      // shift (nurses.length > 0) or a scheduled event (cellEvents.length > 0, e.g. a
      // termination/completion date set beyond the paid plan) somewhere extended it —
      // days with neither of their own are not booking days and grey out like any
      // outside day.
      if (!inBooking || (isBeyondNaturalFuture(rawDayNum) && nurses.length === 0 && cellEvents.length === 0)) {
        cells.push({ type: 'outside', calDay: d, dateISO });
      } else {
        const isToday   = dayNum === servedDays;
        const delivered = dayNum <= servedDays;
        const isOverrun = hasPlan && dayNum > plannedDays;
        const status    = dayNum <= paidDays ? 'paid' : dayNum <= servedDays ? 'overdue' : 'upcoming';
        const { salary: salaryMeta, invoice: invoiceMeta } = getDayMeta(dateISO, delivered);
        cells.push({
          type: 'booking',
          calDay: d, dayNum, nurses, isToday, delivered, isOverrun, status,
          dateLabel: isToday ? 'Today' : fmtShort(cellDate),
          tipDate:   `${fmtFull(cellDate)} · Day ${dayNum}${isOverrun ? ' · overrun' : ''}`,
          dateISO, salaryMeta, invoiceMeta, cellEvents,
          isHospitalized: isDateHospitalized(dateISO),
        });
      }
    }

    while (cells.length % 7 !== 0) cells.push({ type: 'empty' });

    const rows = [];
    for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));

    return {
      monthLabel: firstOfMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
      calRows: rows,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clampedMonthIdx, bookingMonths, start, displayDays, plannedDays, paidDays, servedDays, nurseColorMap, attendanceByDate, invoiceByDate, draftDates, manualSalaryDay, manualInvoiceDay, shiftSlots, eventsByDate, staffAssignments, reschedules, movedOrigins, assignmentByIdForReschedule, naturalEndDayNum, partialLastDay, pauseWindows, hospitalizedRanges]);

  const activeCell = useMemo(() => {
    if (hoveredDay == null) return null;
    for (const row of calRows) {
      const c = row.find((cell) => cell.type === 'booking' && cell.dayNum === hoveredDay);
      if (c) return c;
    }
    return null;
  }, [hoveredDay, calRows]);

  const legendNurses = useMemo(() => {
    const seen = new Set();
    return [...staffAssignments]
      .sort((a, b) => new Date(a.service_start_date || a.startDate || 0) - new Date(b.service_start_date || b.startDate || 0))
      .filter((a) => {
        const id = a.staff_profile_id || a.staffId || a.id;
        if (!id || seen.has(id)) return false;
        seen.add(id);
        return true;
      })
      .map((a) => {
        const id = a.staff_profile_id || a.staffId || a.id;
        const slot = shiftSlots.find((s) => s.shift_slot_id === a.shift_slot_id);
        return {
          name:       a.full_name || a.staff_name || a.name || 'Staff',
          color:      nurseColorMap.get(id) || NURSE_COLORS[0],
          shiftLabel: slot?.label || null,
        };
      });
  }, [staffAssignments, nurseColorMap, shiftSlots]);

  // ── Early exit ────────────────────────────────────────────────────────────

  // Use displayDays (planned OR served), not plannedDays alone — plannedDays is
  // derived from totalPaid/dailyRate and is 0 until a payment is recorded, which
  // would otherwise hide the timeline for an already-ACTIVE booking (e.g. a direct
  // admin booking with staff assigned but no payment logged yet).
  if (!startDate || displayDays <= 0) {
    return (
      <div className="bg-white border border-[#ECE7DF] rounded-2xl p-6">
        <h2 className="text-lg font-bold text-[#2A2722]">Care timeline</h2>
        <p className="text-sm text-[#9A9488] mt-2">Timeline data is not available for this booking.</p>
      </div>
    );
  }

  const modelChip = MODEL_CHIP[serviceModel] || null;

  return (
    <div className="bg-white border border-[#ECE7DF] rounded-2xl p-4 sm:p-6">

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-3 sm:gap-4 flex-wrap mb-4 sm:mb-5">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h2 className="text-base sm:text-lg font-bold text-[#2A2722] tracking-tight">Care timeline</h2>
            {modelChip && (
              <span
                style={{
                  fontSize: 10, fontWeight: 700, letterSpacing: '.06em',
                  background: modelChip.bg, color: modelChip.color,
                  padding: '2px 8px', borderRadius: 999, textTransform: 'uppercase',
                }}
              >
                {modelChip.label}
              </span>
            )}
            <span className="text-xs font-semibold text-[#9A9488] hidden sm:inline">Hover a day to see who was on duty</span>
          </div>
          <p className="text-[13px] sm:text-sm text-[#6F6A60] mt-1">
            {isShiftBased
              ? 'Each block shows the nurses on rotating shifts. Colour bands = shifts.'
              : 'Each block is one day of care. Colour shows the assigned nurse; the bar below shows payment.'}
            <span className="sm:hidden"> Tap a day for details.</span>
          </p>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">

          {/* ── Revoke day(s) toggle ── */}
          {revokeEnabled && (
            <button
              onClick={() => { if (selectMode) exitSelectMode(); else { setHoveredDay(null); setSelectMode(true); } }}
              title="Correct a wrongly paid/invoiced day"
              className="flex items-center gap-1.5 px-2.5 h-8 rounded-lg border text-xs font-semibold transition"
              style={selectMode
                ? { background: '#FDECEA', borderColor: '#F3A9A0', color: '#B3261E' }
                : { background: 'white', borderColor: '#E7E1D6', color: '#8A8478' }
              }
            >
              <Undo2 style={{ width: 13, height: 13 }} />
              {selectMode ? 'Cancel' : 'Revoke days'}
            </button>
          )}

          {/* ── Sim date picker ── */}
          <div className="relative">
            <button
              onClick={() => setShowSimPicker((v) => !v)}
              title="Simulate a different date"
              className="flex items-center gap-1.5 px-2.5 h-8 rounded-lg border text-xs font-semibold transition"
              style={simDate
                ? { background: '#FEF9C3', borderColor: '#FDE047', color: '#713F12' }
                : { background: 'white', borderColor: '#E7E1D6', color: '#8A8478' }
              }
            >
              {simDate ? `Sim: ${simDate}` : 'Test date'}
            </button>
            {showSimPicker && (
              <div
                className="absolute right-0 top-full mt-1 z-50 rounded-xl shadow-xl border border-[#E7E1D6] bg-white p-3"
                style={{ minWidth: 230 }}
              >
                <div className="text-xs font-bold text-[#5A554B] mb-1">Simulate "today" as</div>
                <div className="text-[11px] text-[#9A9488] mb-2">
                  All outstanding, overdue days and staff assignments update to reflect this date.
                </div>
                <DateInput
                  value={simDate || new Date().toISOString().slice(0, 10)}
                  onChange={(e) => { onSimDateChange?.(e.target.value || null); setShowSimPicker(false); }}
                  className="w-full border border-[#E7E1D6] rounded-lg px-2.5 py-1.5 text-sm text-[#2A2722] focus:outline-none focus:ring-2 focus:ring-[#137A6B]"
                />
                {simDate && (
                  <button
                    onClick={() => { onSimDateChange?.(null); setShowSimPicker(false); }}
                    className="mt-2 w-full text-xs font-semibold text-[#C2483C] hover:underline"
                  >
                    Reset to real today
                  </button>
                )}
              </div>
            )}
          </div>

          {/* ── Month navigation ── */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setMonthOffset(Math.max(0, clampedMonthIdx - 1))}
              disabled={clampedMonthIdx === 0}
              className="w-8 h-8 rounded-lg border border-[#E7E1D6] bg-white text-[#5A554B] disabled:text-[#CFC9BE] disabled:cursor-not-allowed hover:bg-slate-50 transition flex items-center justify-center text-lg leading-none"
            >‹</button>
            <span className="text-xs font-semibold text-[#5A554B] hidden sm:inline min-w-[110px] text-center">
              {monthLabel}
            </span>
            <button
              onClick={() => setMonthOffset(Math.min(bookingMonths.length - 1, clampedMonthIdx + 1))}
              disabled={clampedMonthIdx >= bookingMonths.length - 1}
              className="w-8 h-8 rounded-lg border border-[#E7E1D6] bg-white text-[#5A554B] disabled:text-[#CFC9BE] disabled:cursor-not-allowed hover:bg-slate-50 transition flex items-center justify-center text-lg leading-none"
            >›</button>
          </div>
        </div>
      </div>

      {/* ── Sim active banner ── */}
      {simDate && (
        <div
          className="flex items-center justify-between gap-3 rounded-xl px-4 py-2.5 mb-4 text-sm font-semibold"
          style={{ background: '#FEF9C3', border: '1px solid #FDE047', color: '#713F12' }}
        >
          <span>
            Simulating {effectiveToday.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })} as today
            {overrunDays > 0 && ` · booking overrun by ${overrunDays} day${overrunDays !== 1 ? 's' : ''}`}
          </span>
          <button
            onClick={() => { onSimDateChange?.(null); setShowSimPicker(false); }}
            className="flex-shrink-0 text-xs underline hover:no-underline"
          >
            Reset
          </button>
        </div>
      )}

      {/* ── Progress summary ── */}
      <div className="bg-[#FBF9F4] border border-[#EFEAE0] rounded-xl px-4 py-3 mb-5">
        <div className="flex items-end justify-between gap-4 flex-wrap mb-3">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-2xl font-extrabold text-[#2A2722] tracking-tight">Day {servedDays}</span>
            {!hasPlan ? (
              <span className="text-sm text-[#C2483C] font-semibold">No payment recorded yet</span>
            ) : overrunDays > 0 ? (
              <span className="text-sm text-[#C2483C] font-semibold">
                {plannedDays} planned · +{overrunDays} overrun
              </span>
            ) : (
              <span className="text-sm text-[#6F6A60]">of {plannedDays}</span>
            )}
          </div>
          <div className="flex gap-4 flex-wrap">
            {[
              { count: paidDays,      color: '#2F8A5B', label: 'paid' },
              { count: overdueCount,  color: '#C2483C', label: 'overdue' },
              { count: upcomingCount, color: '#D5CFC4', label: 'upcoming' },
            ].map(({ count, color, label }) => (
              <div key={label} className="flex items-center gap-1.5 text-xs font-semibold text-[#5A554B]">
                <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: color }} />
                {count} {label}
              </div>
            ))}
          </div>
        </div>
        <div className="flex h-2.5 rounded-full overflow-hidden" style={{ background: '#EAE5DB' }}>
          {paidDays > 0      && <div style={{ width: `${(paidDays / displayDays) * 100}%`,      background: '#2F8A5B', transition: 'width .3s ease' }} />}
          {overdueCount > 0  && <div style={{ width: `${(overdueCount / displayDays) * 100}%`,  background: '#C2483C', transition: 'width .3s ease' }} />}
          {upcomingCount > 0 && <div style={{ width: `${(upcomingCount / displayDays) * 100}%`, background: '#D5CFC4', transition: 'width .3s ease' }} />}
        </div>
      </div>

      {/* ── Month label (mobile) ── */}
      <div className="sm:hidden text-sm font-bold text-[#3A362F] mb-3 text-center">{monthLabel}</div>

      {/* ── Day-of-week header ── */}
      <div className="grid grid-cols-7 gap-1.5 sm:gap-2 mb-1.5">
        {DOW_LABELS.map((d) => (
          <div key={d} className="text-center text-[10px] font-bold uppercase tracking-wider py-0.5" style={{ color: '#A39D91' }}>
            {d}
          </div>
        ))}
      </div>

      {/* ── Calendar grid ── */}
      <div className="flex flex-col gap-1.5 sm:gap-2">
        {calRows.map((row, ri) => (
          <div key={ri} className="grid grid-cols-7 gap-1.5 sm:gap-2">
            {row.map((cell, ci) => {

              if (cell.type === 'empty') {
                return <div key={`e-${ri}-${ci}`} style={{ aspectRatio: '1/1', borderRadius: 12 }} />;
              }

              if (cell.type === 'outside') {
                return (
                  <div
                    key={`o-${cell.calDay}`}
                    style={{
                      aspectRatio: '1/1', borderRadius: 12,
                      border: '1px dashed #EAE5DB', background: '#FAFAF8',
                      display: 'flex', alignItems: 'flex-start', padding: '4px 5px',
                    }}
                  >
                    <span style={{ fontSize: 10, color: '#D0CAC1', fontWeight: 500 }}>{cell.calDay}</span>
                  </div>
                );
              }

              if (cell.type === 'paused') {
                return (
                  <div
                    key={`p-${cell.calDay}`}
                    title="Booking paused — no service this day"
                    style={{
                      aspectRatio: '1/1', borderRadius: 12,
                      border: '1px solid #E2DED6', background: 'repeating-linear-gradient(45deg, #EFEBE3, #EFEBE3 6px, #E6E1D7 6px, #E6E1D7 12px)',
                      display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '4px 5px',
                    }}
                  >
                    <span style={{ fontSize: 10, color: '#A8A199', fontWeight: 500 }}>{cell.calDay}</span>
                    <Lock style={{ width: 10, height: 10, color: '#A8A199' }} />
                  </div>
                );
              }

              // ── Booking cell ─────────────────────────────────────────────

              const isHovered    = hoveredDay === cell.dayNum;
              const nurses       = cell.nurses;
              // Moved-away shifts aren't actually delivered here — exclude them
              // from background/border/legend math, but still list them (and any
              // makeup shift landing here) in the dots and tooltip below.
              const workingNurses = nurses.filter((n) => n.kind !== 'MOVED');
              const primaryNurse = workingNurses[0] || null;
              const pill         = PILL[cell.status];
              const isClickable  = Boolean(onDayClick) && cell.delivered;
              const multiShift   = isShiftBased && workingNurses.length > 1;
              const isRevokable  = revokeEnabled && cell.delivered
                && (cell.salaryMeta?.status === 'PAID' || cell.invoiceMeta?.status === 'INVOICED');
              const isSelected   = selectedDates.has(cell.dateISO);

              // Background
              let cellBg = buildCellBackground(workingNurses, cell.delivered, serviceModel);

              // Border — computed per-side to support the VISITING accent stripe
              let borderStyle = {};
              if (cell.isToday) {
                borderStyle = { border: '1.5px solid #137A6B' };
              } else if (cell.isOverrun) {
                borderStyle = { border: '1.5px dashed #E8A09A' };
              } else if (!cell.delivered || !primaryNurse) {
                // Future cell with scheduled events: highlight instead of greying out
                if (cell.cellEvents.length > 0) {
                  const evColor = cell.cellEvents[0].color;
                  cellBg = '#FFFFFF';
                  borderStyle = { border: `1.5px dashed ${evColor}` };
                } else {
                  borderStyle = { border: '1px dashed #DBD5CA' };
                }
              } else if (serviceModel === 'VISITING') {
                borderStyle = {
                  borderTop:    '1px solid #E5E7EB',
                  borderRight:  '1px solid #E5E7EB',
                  borderBottom: '1px solid #E5E7EB',
                  borderLeft:   `3px solid ${primaryNurse.color.solid}`,
                };
              } else {
                borderStyle = {
                  border: multiShift
                    ? '1px solid #D1D5DB'
                    : `1px solid ${primaryNurse.color.border}`,
                };
              }

              return (
                <div
                  key={cell.dayNum}
                  className={`relative flex flex-col justify-between rounded-xl p-1.5 sm:p-2 select-none ${
                    selectMode ? (isRevokable ? 'cursor-pointer' : 'cursor-not-allowed') : ((isMobile || isClickable) ? 'cursor-pointer' : 'cursor-default')
                  }`}
                  style={{
                    aspectRatio: '1/1',
                    background: cellBg,
                    ...borderStyle,
                    ...(isSelected ? { border: '1.5px solid #B3261E', boxShadow: '0 0 0 3px rgba(179,38,30,.16)' } : {}),
                    opacity: selectMode && !isRevokable ? 0.4 : 1,
                    boxShadow: isSelected
                      ? '0 0 0 3px rgba(179,38,30,.16)'
                      : cell.isToday
                        ? '0 0 0 3px rgba(19,122,107,.13)'
                        : isHovered
                          ? '0 12px 26px rgba(40,33,22,.18)'
                          : 'none',
                    transform: isHovered && !selectMode ? 'translateY(-3px)' : 'none',
                    transition: 'transform .15s ease, box-shadow .15s ease',
                    zIndex: isHovered ? 30 : 'auto',
                  }}
                  onMouseEnter={() => { if (!isMobile && !selectMode) setHoveredDay(cell.dayNum); }}
                  onMouseLeave={() => { if (!isMobile && !selectMode) setHoveredDay(null); }}
                  onClick={() => {
                    if (selectMode) {
                      if (isRevokable) toggleSelectedDate(cell.dateISO);
                      return;
                    }
                    if (isMobile) setHoveredDay((d) => (d === cell.dayNum ? null : cell.dayNum));
                    else if (isClickable) onDayClick(cell.dateISO, cell.dayNum);
                  }}
                >
                  {isSelected && (
                    <span
                      className="absolute flex items-center justify-center rounded-full"
                      style={{ top: -6, right: -6, width: 18, height: 18, background: '#B3261E', boxShadow: '0 2px 6px rgba(179,38,30,.4)', zIndex: 5 }}
                    >
                      <Check style={{ width: 11, height: 11, color: 'white' }} strokeWidth={3} />
                    </span>
                  )}
                  {/* Top row: day number + status icons + nurse dots */}
                  <div className="flex items-center justify-between">
                    {!isMobile && (
                      <span
                        className="text-[11px] font-bold leading-none"
                        style={{
                          fontFamily: 'monospace',
                          color: cell.isToday ? '#0C5C50' : cell.delivered ? '#5A554B' : '#B4AEA3',
                        }}
                      >
                        {cell.calDay}
                      </span>
                    )}
                    <div className="flex items-center gap-0.5 flex-shrink-0 ml-auto">
                      {cell.isHospitalized && (
                        <Cross style={{ width: 9, height: 9, color: '#C2483C' }} strokeWidth={2.5} />
                      )}
                      {cell.salaryMeta && (
                        <Wallet style={{ width: 8, height: 8, color: META_COLOR[cell.salaryMeta.status] }} />
                      )}
                      {cell.invoiceMeta && (
                        <Receipt style={{ width: 8, height: 8, color: META_COLOR[cell.invoiceMeta.status] }} />
                      )}
                      {/* One dot per nurse (shift) — hollow for a moved-away shift,
                          ringed for a makeup shift, solid otherwise */}
                      {nurses.map((n, i) => (
                        <span
                          key={i}
                          className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full flex-shrink-0"
                          style={
                            n.kind === 'MOVED'
                              ? { background: 'transparent', border: '1px solid #B4AEA3', opacity: 0.7 }
                              : n.kind === 'MAKEUP'
                                ? { background: n.color.solid, boxShadow: '0 0 0 1.5px #3F77B5', opacity: cell.delivered ? 1 : 0.4 }
                                : { background: n.color.solid, opacity: cell.delivered ? 1 : 0.4 }
                          }
                        />
                      ))}
                      {/* One diamond per event type */}
                      {cell.cellEvents.map((ev, i) => (
                        <span
                          key={`ev-${i}`}
                          className="flex-shrink-0"
                          style={{
                            width: 5, height: 5,
                            background: ev.color,
                            transform: 'rotate(45deg)',
                            borderRadius: 1,
                            display: 'inline-block',
                          }}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Date label + payment bar */}
                  <div>
                    {!isMobile && (
                      <div
                        className="text-[9px] sm:text-[10px] leading-tight truncate"
                        style={{
                          fontWeight: cell.isToday ? 700 : 500,
                          color: cell.isToday ? '#137A6B' : cell.delivered ? '#8B857A' : '#B4AEA3',
                        }}
                      >
                        {cell.dateLabel}
                      </div>
                    )}
                    <div
                      className="rounded-full w-full mt-1"
                      style={{ height: 4, background: BAR_COLOR[cell.status], opacity: cell.status === 'upcoming' ? 0.7 : 1 }}
                    />
                  </div>

                  {/* Hover tooltip (desktop) */}
                  {!isMobile && isHovered && (
                    <div
                      className="absolute pointer-events-none"
                      style={{
                        bottom: 'calc(100% + 10px)', left: '50%', transform: 'translateX(-50%)',
                        width: 204, background: '#23211C', borderRadius: 12,
                        padding: '12px 13px', boxShadow: '0 18px 38px rgba(28,23,15,.36)',
                        border: '1px solid rgba(255,255,255,.08)', zIndex: 50,
                      }}
                    >
                      <div className="text-xs font-bold text-white">{cell.tipDate}</div>

                      {cell.isOverrun && (
                        <div className="inline-block text-[10px] font-bold px-1.5 py-0.5 rounded-full mt-1" style={{ background: 'rgba(194,72,60,.3)', color: '#E8A09A' }}>
                          Beyond booking end
                        </div>
                      )}

                      {cell.isHospitalized && (
                        <div className="flex items-center gap-1.5 mt-1">
                          <Cross style={{ width: 11, height: 11, color: '#E8A09A' }} strokeWidth={2.5} />
                          <span className="text-[10px] font-bold" style={{ color: '#E8A09A' }}>Hospitalized</span>
                        </div>
                      )}

                      {/* All nurses / shifts */}
                      {nurses.length > 0 && (
                        <>
                          <div className="h-px my-2" style={{ background: 'rgba(255,255,255,.12)' }} />
                          {nurses.map((nurse, i) => (
                            <div key={i} style={{ marginTop: i > 0 ? 6 : 0 }}>
                              <div className="flex items-center gap-1.5">
                                <span
                                  className="w-2 h-2 rounded-full flex-shrink-0"
                                  style={nurse.kind === 'MOVED' ? { background: 'transparent', border: '1px solid #B4AEA3' } : { background: nurse.color.solid }}
                                />
                                <span className="text-xs font-semibold text-[#F2EFE8] truncate">{nurse.name}</span>
                                {nurse.kind === 'MOVED' && (
                                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(180,174,163,.24)', color: '#CFC9BE' }}>Moved</span>
                                )}
                                {nurse.kind === 'MAKEUP' && (
                                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(63,119,181,.24)', color: '#A9C8E6' }}>Makeup</span>
                                )}
                              </div>
                              {(nurse.shiftLabel || nurse.designation) && (
                                <div className="text-[10px] text-[#A8A299] ml-3.5">
                                  {[nurse.shiftLabel, nurse.shiftStartTime ? `from ${nurse.shiftStartTime}` : null].filter(Boolean).join(' · ')}
                                  {nurse.designation ? ` — ${nurse.designation}` : ''}
                                  {nurse.kind === 'MOVED' ? ' — moved to another date' : ''}
                                </div>
                              )}
                            </div>
                          ))}
                        </>
                      )}

                      {cell.cellEvents.length > 0 && (
                        <>
                          <div className="h-px my-2" style={{ background: 'rgba(255,255,255,.12)' }} />
                          <div className="text-[9px] font-bold uppercase tracking-widest text-[#A8A299] mb-1">Scheduled</div>
                          {cell.cellEvents.map((ev, i) => (
                            <div key={i} className="flex items-start gap-1.5 mt-1">
                              <ev.Icon style={{ width: 10, height: 10, color: ev.color, flexShrink: 0, marginTop: 1 }} />
                              <span className="text-[10px] text-[#F2EFE8] leading-tight">{ev.label}</span>
                            </div>
                          ))}
                        </>
                      )}

                      <div className="h-px my-2" style={{ background: 'rgba(255,255,255,.12)' }} />
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] text-[#A8A299]">
                          {isShiftBased ? `Billed (${workingNurses.length} shift${workingNurses.length !== 1 ? 's' : ''})` : 'Billed'}
                        </span>
                        <span className="text-xs font-bold text-white">
                          Rs {Number(isShiftBased ? shiftRate * workingNurses.length : dailyRate || 0).toLocaleString('en-US')}
                        </span>
                      </div>
                      <div className="mt-2">
                        <span className="inline-block text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: pill.bg, color: pill.color }}>
                          {pill.label}
                        </span>
                      </div>

                      {(cell.salaryMeta || cell.invoiceMeta) && (
                        <>
                          <div className="h-px my-2" style={{ background: 'rgba(255,255,255,.12)' }} />
                          {cell.salaryMeta && (
                            <div>
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-[11px] text-[#A8A299] flex items-center gap-1">
                                  <Wallet style={{ width: 10, height: 10 }} /> Salary
                                </span>
                                <span className="text-[11px] font-bold" style={{ color: META_COLOR[cell.salaryMeta.status] }}>
                                  {metaLabel(cell.salaryMeta, 'Paid')}
                                </span>
                              </div>
                              {cell.salaryMeta.decidedBy && (
                                <div className="text-[10px] text-[#7E786D] ml-4">by {cell.salaryMeta.decidedBy}</div>
                              )}
                            </div>
                          )}
                          {cell.invoiceMeta && (
                            <div className="mt-1.5">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-[11px] text-[#A8A299] flex items-center gap-1">
                                  <Receipt style={{ width: 10, height: 10 }} /> Invoice
                                </span>
                                <span className="text-[11px] font-bold" style={{ color: META_COLOR[cell.invoiceMeta.status] }}>
                                  {metaLabel(cell.invoiceMeta, 'Charged')}
                                </span>
                              </div>
                              {cell.invoiceMeta.decidedBy && (
                                <div className="text-[10px] text-[#7E786D] ml-4">by {cell.invoiceMeta.decidedBy}</div>
                              )}
                            </div>
                          )}
                        </>
                      )}

                      {isClickable && (
                        <div className="text-[10px] text-[#A8A299] mt-2">Click to log attendance / invoicing</div>
                      )}
                      {/* Caret */}
                      <div
                        className="absolute"
                        style={{
                          top: '100%', left: '50%', transform: 'translateX(-50%)',
                          width: 0, height: 0,
                          borderLeft: '6px solid transparent', borderRight: '6px solid transparent',
                          borderTop: '7px solid #23211C',
                        }}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* ── Revoke selection bar ── */}
      {selectMode && (
        <div className="mt-4 rounded-xl border p-3 flex items-center justify-between gap-3 flex-wrap" style={{ background: '#FDECEA', borderColor: '#F3A9A0' }}>
          <span className="text-xs font-semibold" style={{ color: '#B3261E' }}>
            {selectedDates.size === 0
              ? 'Tap the day(s) you need to correct'
              : `${selectedDates.size} day${selectedDates.size !== 1 ? 's' : ''} selected`}
          </span>
          <div className="flex items-center gap-2">
            <button onClick={exitSelectMode} className="px-3 h-8 rounded-lg border border-[#E7E1D6] bg-white text-xs font-semibold text-[#6F6A60] hover:bg-slate-50 transition">
              Cancel
            </button>
            <button
              onClick={() => { setShowRevokeConfirm(true); setRevokeStep(isShiftBased ? 'shifts' : 'details'); setSelectedShiftTargets(new Set()); }}
              disabled={selectedDates.size === 0}
              className="px-3 h-8 rounded-lg text-xs font-bold text-white transition disabled:opacity-40"
              style={{ background: '#B3261E' }}
            >
              Revoke selected
            </button>
          </div>
        </div>
      )}

      {/* ── Revoke confirmation modal ── */}
      {showRevokeConfirm && revokeStep === 'shifts' && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" style={{ background: 'rgba(28,23,15,.45)' }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5 max-h-[85vh] overflow-y-auto">
            <h3 className="text-sm font-bold text-[#2A2722]">Select shift(s) to revoke</h3>
            <p className="text-xs text-[#6F6A60] mt-1.5">
              Each shift can be revoked individually — check the ones that were wrongly paid/invoiced.
            </p>

            <div className="mt-4 space-y-4">
              {[...selectedDates].sort().map((dateISO) => {
                const shifts = revocableShiftsByDate.get(dateISO) || [];
                if (shifts.length === 0) {
                  return (
                    <div key={dateISO}>
                      <div className="text-[11px] font-bold uppercase tracking-wider text-[#9A9488]">{dateISO}</div>
                      <div className="text-xs text-[#B4AEA3] mt-1">No paid/invoiced shifts on this day.</div>
                    </div>
                  );
                }
                const keys = shifts.map((s) => `${dateISO}__${s.shift_slot_id}`);
                const allSelected = keys.every((k) => selectedShiftTargets.has(k));
                return (
                  <div key={dateISO}>
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-[#9A9488]">{dateISO}</span>
                      <button
                        onClick={() => toggleAllShiftsForDate(dateISO, shifts)}
                        className="text-[11px] font-semibold"
                        style={{ color: '#B3261E' }}
                      >
                        {allSelected ? 'Deselect all' : 'Select all'}
                      </button>
                    </div>
                    <div className="mt-1.5 space-y-1.5">
                      {shifts.map((s) => {
                        const key = `${dateISO}__${s.shift_slot_id}`;
                        const checked = selectedShiftTargets.has(key);
                        return (
                          <label
                            key={key}
                            className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 cursor-pointer transition ${checked ? 'border-[#B3261E] bg-[#FBEAE8]' : 'border-[#E7E1D6] hover:bg-slate-50'}`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleShiftTarget(key)}
                              className="accent-[#B3261E]"
                            />
                            <span className="text-xs text-[#2A2722]">
                              {s.shift_label || `Shift ${s.shift_number}`}
                              {s.staff_name ? <span className="text-[#6F6A60]"> — {s.staff_name}</span> : null}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            {revokeError && (
              <div className="mt-2.5 text-xs font-semibold text-[#B3261E]">{revokeError}</div>
            )}

            <div className="flex items-center justify-end gap-2 mt-5">
              <button
                onClick={() => { setShowRevokeConfirm(false); setRevokeError(''); }}
                className="px-3 h-8 rounded-lg border border-[#E7E1D6] bg-white text-xs font-semibold text-[#6F6A60] hover:bg-slate-50 transition"
              >
                Back
              </button>
              <button
                onClick={() => { if (selectedShiftTargets.size === 0) { setRevokeError('Select at least one shift'); return; } setRevokeError(''); setRevokeStep('details'); }}
                disabled={selectedShiftTargets.size === 0}
                className="px-3.5 h-8 rounded-lg text-xs font-bold text-white transition disabled:opacity-40"
                style={{ background: '#B3261E' }}
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      )}

      {showRevokeConfirm && revokeStep === 'details' && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" style={{ background: 'rgba(28,23,15,.45)' }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5">
            <h3 className="text-sm font-bold text-[#2A2722]">
              Revoke {isShiftBased ? `${selectedShiftTargets.size} shift${selectedShiftTargets.size !== 1 ? 's' : ''}` : `${selectedDates.size} day${selectedDates.size !== 1 ? 's' : ''}`}?
            </h3>
            <p className="text-xs text-[#6F6A60] mt-1.5">
              This reverses the staff salary and, per the settlement choice below, the client invoice for the selected
              {isShiftBased ? ' shift(s)' : ' day(s)'}. The original records stay as an audit trail. This cannot be
              undone from here.
            </p>

            <label className="block text-[11px] font-bold uppercase tracking-wider text-[#9A9488] mt-4 mb-1">Reason</label>
            <textarea
              value={revokeReason}
              onChange={(e) => setRevokeReason(e.target.value)}
              rows={2}
              placeholder="e.g. Client confirmed staff no-show on this date"
              className="w-full border border-[#E7E1D6] rounded-lg px-2.5 py-1.5 text-sm text-[#2A2722] focus:outline-none focus:ring-2 focus:ring-[#B3261E] resize-none"
            />

            <label className="block text-[11px] font-bold uppercase tracking-wider text-[#9A9488] mt-3 mb-1.5">Client invoice settlement</label>
            <div className="space-y-1.5">
              {[
                { value: 'WALLET_REFUND', label: 'Wallet refund', desc: 'Credit offsets future invoices on this booking. No real money moves.' },
                ...(!isShiftBased ? [{ value: 'WALLET_REFUND_EXTEND', label: 'Wallet refund + extend booking', desc: 'Same credit as Wallet refund, plus pushes the booking’s scheduled end date out by the number of days revoked.' }] : []),
                { value: 'BANK_REFUND',   label: 'Bank refund',   desc: 'You’ll return the money to the client’s bank/payment method outside this system.' },
                { value: 'NO_REFUND',     label: 'Write off',     desc: 'No credit issued — the invoiced amount is forfeited.' },
              ].map((opt) => (
                <label
                  key={opt.value}
                  className={`flex items-start gap-2 rounded-lg border px-2.5 py-1.5 cursor-pointer transition ${revokeSettlementAction === opt.value ? 'border-[#B3261E] bg-[#FBEAE8]' : 'border-[#E7E1D6] hover:bg-slate-50'}`}
                >
                  <input
                    type="radio"
                    name="revokeSettlementAction"
                    value={opt.value}
                    checked={revokeSettlementAction === opt.value}
                    onChange={() => setRevokeSettlementAction(opt.value)}
                    className="mt-0.5 accent-[#B3261E]"
                  />
                  <span>
                    <span className="block text-xs font-semibold text-[#2A2722]">{opt.label}</span>
                    <span className="block text-[11px] text-[#6F6A60]">{opt.desc}</span>
                  </span>
                </label>
              ))}
            </div>

            <label className="block text-[11px] font-bold uppercase tracking-wider text-[#9A9488] mt-3 mb-1">Confirm your Super Admin password</label>
            <input
              type="password"
              value={revokePassword}
              onChange={(e) => setRevokePassword(e.target.value)}
              className="w-full border border-[#E7E1D6] rounded-lg px-2.5 py-1.5 text-sm text-[#2A2722] focus:outline-none focus:ring-2 focus:ring-[#B3261E]"
            />

            {revokeError && (
              <div className="mt-2.5 text-xs font-semibold text-[#B3261E]">{revokeError}</div>
            )}

            <div className="flex items-center justify-end gap-2 mt-5">
              <button
                onClick={() => { if (isShiftBased) { setRevokeStep('shifts'); setRevokeError(''); } else { setShowRevokeConfirm(false); setRevokeError(''); } }}
                disabled={revokeBusy}
                className="px-3 h-8 rounded-lg border border-[#E7E1D6] bg-white text-xs font-semibold text-[#6F6A60] hover:bg-slate-50 transition disabled:opacity-50"
              >
                Back
              </button>
              <button
                onClick={submitRevoke}
                disabled={revokeBusy}
                className="px-3.5 h-8 rounded-lg text-xs font-bold text-white transition disabled:opacity-50"
                style={{ background: '#B3261E' }}
              >
                {revokeBusy ? 'Revoking…' : 'Confirm revoke'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Mobile detail panel ── */}
      {isMobile && activeCell && (() => {
        const cell        = activeCell;
        const nurses      = cell.nurses;
        const workingNurses = nurses.filter((n) => n.kind !== 'MOVED');
        const pill        = PILL[cell.status];
        const isClickable = Boolean(onDayClick) && cell.delivered;
        return (
          <div className="mt-4 rounded-xl border border-[#E7E1D6] bg-[#FBF9F4] p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="text-sm font-bold text-[#2A2722]">{cell.tipDate}</div>
              <button onClick={() => setHoveredDay(null)} aria-label="Close" className="p-1 -m-1 rounded-lg text-[#9A9488] hover:bg-[#EFEAE0] transition flex-shrink-0">
                <X style={{ width: 16, height: 16 }} />
              </button>
            </div>

            {cell.isOverrun && (
              <div className="inline-block text-[10px] font-bold px-1.5 py-0.5 rounded-full mt-1.5" style={{ background: 'rgba(194,72,60,.16)', color: '#C2483C' }}>
                Beyond booking end
              </div>
            )}

            {nurses.length > 0 && (
              <div className="mt-2.5 space-y-2">
                {nurses.map((nurse, i) => (
                  <div key={i}>
                    <div className="flex items-center gap-1.5">
                      <span
                        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                        style={nurse.kind === 'MOVED' ? { background: 'transparent', border: '1px solid #B4AEA3' } : { background: nurse.color.solid }}
                      />
                      <span className="text-sm font-semibold text-[#3A362F] truncate">{nurse.name}</span>
                      {nurse.kind === 'MOVED' && (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(180,174,163,.16)', color: '#8A8478' }}>Moved</span>
                      )}
                      {nurse.kind === 'MAKEUP' && (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(63,119,181,.16)', color: '#3F77B5' }}>Makeup</span>
                      )}
                    </div>
                    {(nurse.shiftLabel || nurse.shiftStartTime || nurse.designation) && (
                      <div className="text-xs text-[#9A9488] ml-4">
                        {[nurse.shiftLabel, nurse.shiftStartTime ? `from ${nurse.shiftStartTime}` : null, nurse.designation].filter(Boolean).join(' · ')}
                        {nurse.kind === 'MOVED' ? ' — moved to another date' : ''}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {cell.cellEvents.length > 0 && (
              <>
                <div className="h-px my-3" style={{ background: '#EFEAE0' }} />
                <div className="text-[9px] font-bold uppercase tracking-widest text-[#A39D91] mb-1.5">Scheduled</div>
                {cell.cellEvents.map((ev, i) => (
                  <div key={i} className="flex items-start gap-2 mt-1.5">
                    <ev.Icon style={{ width: 12, height: 12, color: ev.color, flexShrink: 0, marginTop: 1 }} />
                    <span className="text-xs text-[#3A362F] leading-tight">{ev.label}</span>
                  </div>
                ))}
              </>
            )}

            <div className="h-px my-3" style={{ background: '#EFEAE0' }} />

            <div className="flex items-center justify-between">
              <span className="text-xs text-[#6F6A60]">
                {isShiftBased ? `Billed (${workingNurses.length} shift${workingNurses.length !== 1 ? 's' : ''})` : 'Billed'}
              </span>
              <span className="text-sm font-bold text-[#2A2722]">
                Rs {Number(isShiftBased ? shiftRate * workingNurses.length : dailyRate || 0).toLocaleString('en-US')}
              </span>
            </div>
            <div className="mt-2">
              <span className="inline-block text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: pill.bg, color: pill.color }}>
                {pill.label}
              </span>
            </div>

            {(cell.salaryMeta || cell.invoiceMeta) && (
              <>
                <div className="h-px my-3" style={{ background: '#EFEAE0' }} />
                {cell.salaryMeta && (
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-[#6F6A60] flex items-center gap-1.5">
                        <Wallet style={{ width: 12, height: 12 }} /> Salary
                      </span>
                      <span className="text-xs font-bold" style={{ color: META_COLOR[cell.salaryMeta.status] }}>
                        {metaLabel(cell.salaryMeta, 'Paid')}
                      </span>
                    </div>
                    {cell.salaryMeta.decidedBy && <div className="text-[10px] text-[#9A9488] ml-5">by {cell.salaryMeta.decidedBy}</div>}
                  </div>
                )}
                {cell.invoiceMeta && (
                  <div className="mt-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-[#6F6A60] flex items-center gap-1.5">
                        <Receipt style={{ width: 12, height: 12 }} /> Invoice
                      </span>
                      <span className="text-xs font-bold" style={{ color: META_COLOR[cell.invoiceMeta.status] }}>
                        {metaLabel(cell.invoiceMeta, 'Charged')}
                      </span>
                    </div>
                    {cell.invoiceMeta.decidedBy && <div className="text-[10px] text-[#9A9488] ml-5">by {cell.invoiceMeta.decidedBy}</div>}
                  </div>
                )}
              </>
            )}

            {isClickable && (
              <button
                onClick={() => { onDayClick(cell.dateISO, cell.dayNum); setHoveredDay(null); }}
                className="mt-3 w-full rounded-lg bg-[#137A6B] text-white text-xs font-bold py-2.5 transition active:opacity-80"
              >
                Log attendance / invoicing
              </button>
            )}
          </div>
        );
      })()}

      {/* ── Legend ── */}
      <div className="flex items-center gap-4 flex-wrap mt-5 pt-4 border-t border-[#EFEAE0]">
        {legendNurses.length > 0 && (
          <>
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#A39D91]">
              {isShiftBased ? 'Staff on shifts' : 'Nurse on duty'}
            </span>
            {legendNurses.map((n) => (
              <div key={n.name} className="flex items-center gap-1.5 text-sm text-[#4A463E] font-semibold">
                <span className="w-3 h-3 rounded-sm inline-block" style={{ background: n.color.solid }} />
                {n.name}{n.shiftLabel ? ` (${n.shiftLabel})` : ''}
              </div>
            ))}
            <div className="w-px h-4 inline-block flex-shrink-0" style={{ background: '#E7E1D6' }} />
          </>
        )}
        <div className="flex items-center gap-1.5 text-sm text-[#4A463E] font-semibold">
          <span className="w-4 h-1.5 rounded-full inline-block" style={{ background: '#2F8A5B' }} />Paid
        </div>
        <div className="flex items-center gap-1.5 text-sm text-[#4A463E] font-semibold">
          <span className="w-4 h-1.5 rounded-full inline-block" style={{ background: '#C2483C' }} />Overdue
        </div>
        <div className="flex items-center gap-1.5 text-sm text-[#4A463E] font-semibold">
          <span className="w-4 h-1.5 rounded-full inline-block" style={{ background: '#D5CFC4' }} />Upcoming
        </div>
        {reschedules.length > 0 && (
          <>
            <div className="flex items-center gap-1.5 text-sm text-[#4A463E] font-semibold">
              <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: 'transparent', border: '1px solid #B4AEA3' }} />Moved
            </div>
            <div className="flex items-center gap-1.5 text-sm text-[#4A463E] font-semibold">
              <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: '#8C8C8C', boxShadow: '0 0 0 1.5px #3F77B5' }} />Makeup
            </div>
          </>
        )}
        {(manualSalaryDay || manualInvoiceDay) && (
          <>
            <div className="w-px h-4 inline-block flex-shrink-0" style={{ background: '#E7E1D6' }} />
            <div className="flex items-center gap-3 text-xs text-[#8A8478]">
              <span className="flex items-center gap-1"><Wallet style={{ width: 11, height: 11 }} /> Salary</span>
              <span className="flex items-center gap-1"><Receipt style={{ width: 11, height: 11 }} /> Invoice</span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full inline-block" style={{ background: META_COLOR.PENDING }} /> Action needed
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full inline-block" style={{ background: META_COLOR.DRAFT }} /> Draft
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default CareTimeline;
