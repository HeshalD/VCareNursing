// Shared display helpers for CareTimeline and the booking day modal, so both
// show dates, times and money the same way.

const pad = (n) => String(n).padStart(2, '0');

// Local calendar date as YYYY-MM-DD (never UTC — toISOString() shifts the date
// back a day between 00:00 and 05:30 in Sri Lanka).
export const localDateISO = (value = new Date()) => {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const toDate = (v) => {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(String(v).length === 10 ? `${v}T12:00:00` : v);
  return Number.isNaN(d.getTime()) ? null : d;
};

export const formatDMY = (v) => {
  const d = toDate(v);
  return d ? d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '-';
};
export const formatShortDay = (d) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
export const formatFullDay = (d) => d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
export const formatWeekdayDMY = (v) => {
  const d = toDate(v);
  return d ? d.toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'short', year: 'numeric' }) : '-';
};

// "08:00:00" / "08:00" / a timestamp -> "08:00"
export const formatTimeHM = (t) => {
  if (!t) return '—';
  const m = String(t).match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (m) return `${pad(m[1])}:${m[2]}`;
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
};

// Time of a timestamp, with "+1" when it falls on a later local date than `dateISO`
// (an overnight shift's out-time).
export const formatTimeWithDayOffset = (ts, dateISO) => {
  if (!ts) return '—';
  const base = formatTimeHM(ts);
  const d = new Date(ts);
  if (Number.isNaN(d.getTime()) || !dateISO) return base;
  return localDateISO(d) > dateISO ? `${base} +1` : base;
};

export const formatRs = (v) => `Rs ${Number(v || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;

export const ATTENDANCE_STATUS_LABELS = {
  ABSENT: 'Absent',
  ON_LEAVE: 'On leave',
  LEFT_WITHOUT_NOTICE: 'Left w/o notice',
};

export const SALARY_STATUS_LABELS = { PAID: 'Paid', PENDING: 'Pending', SKIPPED: 'Skipped', REVOKED: 'Revoked' };
