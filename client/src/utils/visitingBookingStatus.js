// utils/visitingBookingStatus.js
// VISITING bookings are one-time visits — a single day, not an ongoing engagement.
// This derives which of the 4 lifecycle states a VISITING booking is in, purely
// from data that already exists (no new stored status column), so the same logic
// can later back a cross-booking "needs action" list without a migration.

export const VISITING_STATUS = {
  SCHEDULED:              'SCHEDULED',
  DUE_TODAY:              'DUE_TODAY',
  AWAITING_FINALIZATION:  'AWAITING_FINALIZATION',
  COMPLETED:              'COMPLETED',
};

export const VISITING_STATUS_META = {
  [VISITING_STATUS.SCHEDULED]:             { label: 'Visit Scheduled',          bg: '#eff6ff', col: '#1d4ed8', dot: '#3b82f6' },
  [VISITING_STATUS.DUE_TODAY]:             { label: 'Visit Due Today',          bg: '#fffbeb', col: '#92400e', dot: '#f59e0b' },
  [VISITING_STATUS.AWAITING_FINALIZATION]: { label: 'Action Needed',           bg: '#fef2f2', col: '#991b1b', dot: '#ef4444' },
  [VISITING_STATUS.COMPLETED]:             { label: 'Visit Completed',          bg: '#f8fafc', col: '#475569', dot: '#94a3b8' },
};

/**
 * @param {string} bookingStatus - bookings.status (e.g. 'ACTIVE', 'COMPLETED', 'TERMINATED')
 * @param {string|null} visitDateISO - the visit date, YYYY-MM-DD (assignment's service_start_date)
 * @param {string} todayISO - today's date, YYYY-MM-DD, in the admin's local time
 * @param {boolean} attendanceDecided - a staff_daily_attendance row exists for the visit date with salary_status != 'PENDING'
 * @param {boolean} invoiceDecided - a booking_daily_invoices row exists for the visit date with status != 'PENDING'
 * @returns {string|null} one of VISITING_STATUS, or null if inputs are insufficient (e.g. no visit date yet)
 */
export const computeVisitingStatus = ({
  bookingStatus,
  visitDateISO,
  todayISO,
  attendanceDecided,
  invoiceDecided,
}) => {
  if (String(bookingStatus).toUpperCase() === 'COMPLETED') return VISITING_STATUS.COMPLETED;
  if (String(bookingStatus).toUpperCase() !== 'ACTIVE') return null; // terminated/cancelled — not a visiting-lifecycle state
  if (!visitDateISO) return null;

  if (visitDateISO > todayISO) return VISITING_STATUS.SCHEDULED;
  if (visitDateISO === todayISO) return VISITING_STATUS.DUE_TODAY;
  // visitDateISO < todayISO
  return (attendanceDecided && invoiceDecided) ? VISITING_STATUS.COMPLETED : VISITING_STATUS.AWAITING_FINALIZATION;
};
