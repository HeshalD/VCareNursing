// View-model for the booking "Allocation history" tab. Pure functions, no React.
// Day numbering uses the same service calendar as CareTimeline (pauses and weekly days off
// are skipped), so "Day 12 → Day 20" here matches what the calendar shows.

import { localDateISO } from './dayDisplay';

const dateOnly = (v) => {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : localDateISO(d);
};
const addDays = (iso, n) => {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d + n);
  return localDateISO(dt);
};
const rawDayOf = (iso, startISO) => {
  const [y, m, d] = iso.split('-').map(Number);
  const [sy, sm, sd] = startISO.split('-').map(Number);
  return Math.round((new Date(y, m - 1, d) - new Date(sy, sm - 1, sd)) / 86400000) + 1;
};

export const END_REASON_LABEL = {
  SWAPPED: 'Swapped out', REASSIGNED: 'Shift reassigned', LOGGED_OUT: 'Logged out',
  RELIEVED: 'Relieved for leave', BOOKING_ENDED: 'Booking ended', MAKEUP_DONE: 'Makeup done', ENDED: 'Ended',
};
export const CHANGE_TYPE_LABEL = {
  SWAP: 'Swap', REASSIGNED: 'Shift reassigned', LOGGED_OUT: 'Logged out', RELIEVED: 'Relieved for leave',
  ASSIGNED: 'Assigned', MAKEUP: 'Makeup shift', ENDED: 'Assignment ended',
};
export const CHANGE_MODE_LABEL = { IMMEDIATE: 'Immediate', SCHEDULED: 'Scheduled', BACKDATED: 'Backdated' };

export const shiftGroupLabel = (r) => {
  if (!r.shiftSlotId) return null;
  const parts = [r.shiftNumber != null ? `Shift ${r.shiftNumber}` : 'Shift', r.shiftLabel].filter(Boolean);
  let text = parts.join(' · ');
  if (r.shiftStartTime) {
    const hhmm = String(r.shiftStartTime).slice(0, 5);
    text += ` · ${hhmm}${r.shiftDurationHours ? ` for ${Number(r.shiftDurationHours)}h` : ''}`;
  }
  return text;
};

/**
 * @param rows        normalised assignment rows (see normStaffHistory in the page)
 * @param attendance  daily attendance records for the booking
 * @param opts        { bookingStartISO, bookingCal, isLiveIn, isShiftBased }
 */
export function buildAllocationRows(rows, attendance, { bookingStartISO, bookingCal, isLiveIn, isShiftBased }) {
  const att = (id, iso) => (iso ? attendance.find(a => a.assignment_id === id && a.service_date?.slice(0, 10) === iso) || null : null);
  const display = (iso) => {
    if (!iso || !bookingStartISO || !bookingCal) return null;
    const raw = rawDayOf(iso, bookingStartISO);
    if (raw < 1) return 1;
    return Math.max(1, bookingCal.resolvePauseDay(raw).displayDayNum);
  };

  const sorted = [...rows].sort((a, b) => new Date(a.startDate) - new Date(b.startDate)
    || new Date(a.assignedOn || 0) - new Date(b.assignedOn || 0));

  // position inside its own succession (shift slot, or the booking-wide LIVE_IN/VISITING line)
  const successionKey = (r) => (r.isMakeup ? `mk-${r.id}` : r.shiftSlotId || '__line__');
  const bySuccession = new Map();
  sorted.forEach(r => {
    const k = successionKey(r);
    if (!bySuccession.has(k)) bySuccession.set(k, []);
    bySuccession.get(k).push(r);
  });

  const out = sorted.map(r => {
    const startISO = dateOnly(r.startDate);
    const endISO = dateOnly(r.endDate);
    const isScheduled = r.status === 'SCHEDULED';
    const isOngoing = !endISO && !isScheduled && r.status !== 'COMPLETED';
    const list = bySuccession.get(successionKey(r));
    const idx = list.indexOf(r);
    // A reassigned shift hands over the same calendar day: the outgoing staff did not work it.
    const lastDayISO = endISO && r.endReason === 'REASSIGNED' && endISO > startISO ? addDays(endISO, -1) : endISO;
    const dayStart = display(startISO);
    const dayEnd = lastDayISO ? display(lastDayISO) : null;
    const dayCount = dayStart != null && dayEnd != null ? Math.max(0, dayEnd - dayStart + 1) : null;

    const trackTimes = !r.shiftSlotId && !r.isMakeup && !isScheduled; // shifts have no swap-boundary times
    const inRecord = trackTimes ? att(r.id, startISO) : null;
    const outRecord = trackTimes && endISO ? att(r.id, endISO) : null;
    const missingInTime = trackTimes && idx > 0 && !inRecord?.in_time;
    const missingOutTime = trackTimes && !!endISO && idx < list.length - 1 && !outRecord?.out_time && r.endReason !== 'BOOKING_ENDED';

    // Boundary-day pay still waiting on an admin (cron never auto-pays those for LIVE_IN).
    const boundary = [inRecord, endISO && endISO !== startISO ? outRecord : null].filter(Boolean);
    const pendingBoundary = boundary.some(b => b.salary_status === 'PENDING');
    const noRecords = (r.pay?.record_count || 0) === 0;
    const needsPaySettlement = Boolean(isLiveIn && trackTimes && endISO && pendingBoundary);
    const historicNoRecords = Boolean(isLiveIn && trackTimes && endISO && noRecords);

    return {
      ...r, startISO, endISO, lastDayISO, isScheduled, isOngoing, dayStart, dayEnd, dayCount,
      inRecord, outRecord, trackTimes, missingInTime, missingOutTime,
      needsTimeAction: missingInTime || missingOutTime, needsPaySettlement, historicNoRecords,
      statusKey: isScheduled ? 'SCHEDULED' : isOngoing ? 'ACTIVE' : 'COMPLETED',
    };
  });

  // Groups: one per shift slot (SHIFT_BASED), makeups together, otherwise a single line.
  const groups = [];
  const pick = (key, label, order) => {
    let g = groups.find(x => x.key === key);
    if (!g) { g = { key, label, order, rows: [] }; groups.push(g); }
    return g;
  };
  out.forEach(r => {
    if (r.isMakeup) pick('__makeup__', 'Makeup shifts', 9999).rows.push(r);
    else if (r.shiftSlotId && isShiftBased) pick(r.shiftSlotId, shiftGroupLabel(r), r.shiftNumber ?? 500).rows.push(r);
    else pick('__line__', null, 0).rows.push(r);
  });
  groups.sort((a, b) => a.order - b.order);

  const totals = out.reduce((t, r) => {
    t.paid += r.pay?.paid_total || 0; t.pending += r.pay?.pending_total || 0;
    t.paidDays += r.pay?.paid_days || 0; t.revokedDays += r.pay?.revoked_days || 0;
    return t;
  }, { paid: 0, pending: 0, paidDays: 0, revokedDays: 0 });
  totals.staffCount = new Set(out.map(r => r.profileId)).size;

  return { rows: out, groups, totals };
}
