// utils/editedAmount.js
// SQL fragments that expose the "this amount was edited" marker with the same
// field names everywhere, so the admin UI's EditedAmountBadge can read any row:
//   original_amount, edited_at, edited_by_name, edit_reason, edit_count
// See services/amountCorrections.js for how the marker gets written.

// Columns for a transactions row. `alias` is the table alias ('' for none).
const transactionEditColumns = (alias = 't') => {
  const p = alias ? `${alias}.` : '';
  return `${p}original_amount, ${p}edited_at, ${p}edited_by_name, ${p}edit_reason, ${p}edit_count`;
};

// Day rows (booking_daily_invoices / staff_daily_attendance) read their marker
// from booking_amount_corrections rather than the linked transaction, so days
// corrected before in-place editing existed still show who/when/why.
//   dayRef — the day row's id expression, e.g. 'bdi.daily_invoice_id'
//   fkCol  — 'daily_invoice_id' or 'attendance_id'
//   as     — alias for the joined fields
const dayCorrectionJoin = (dayRef, fkCol, as = 'corr') => `
  LEFT JOIN LATERAL (
    SELECT
      (ARRAY_AGG(c.old_amount        ORDER BY c.created_at ASC))[1]  AS original_amount,
      MAX(c.created_at)                                               AS edited_at,
      (ARRAY_AGG(c.corrected_by_name ORDER BY c.created_at DESC))[1] AS edited_by_name,
      (ARRAY_AGG(c.reason            ORDER BY c.created_at DESC))[1] AS edit_reason,
      COUNT(*)::int                                                   AS edit_count
    FROM booking_amount_corrections c
    WHERE c.${fkCol} = ${dayRef}
  ) ${as} ON true`;

const dayCorrectionColumns = (as = 'corr') =>
  `${as}.original_amount, ${as}.edited_at, ${as}.edited_by_name, ${as}.edit_reason, ${as}.edit_count`;

module.exports = { transactionEditColumns, dayCorrectionJoin, dayCorrectionColumns };
