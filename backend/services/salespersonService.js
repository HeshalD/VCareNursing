/**
 * SALESPERSON CREDITING SERVICE
 *
 * Salespersons are internal_staff. When a booking's staff assignment is completed,
 * the amount paid to that booking is credited ONCE to the salesperson who brought
 * the booking in, and their "bookings brought" count is incremented by 1. Both the
 * credited amount and the count are PERMANENT — they stay with the original
 * (origin) salesperson forever and never move.
 *
 * The "currently assigned salesperson" is a separate, mutable pointer (is_current)
 * that can be switched at any time. Switching only moves the pointer; it does NOT
 * touch total_sales_amount or bookings_brought_count for anyone.
 *
 * booking_salesperson_assignments holds the full audit trail:
 *   - is_origin  → the salesperson who originally brought the booking in (holds credit)
 *   - is_current → the salesperson currently assigned to the booking
 *   - action     → 'CREDITED' (initial) | 'SWITCHED'
 *
 * Each function accepts an `executor` (either the shared `db` or a pooled client
 * inside a transaction) so it can be reused inline from the assign-staff flow and
 * standalone from the salesperson endpoints.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

class SalespersonError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'SalespersonError';
    this.code = code; // e.g. 'INVALID_ID', 'SALESPERSON_NOT_FOUND', 'BOOKING_NOT_FOUND', 'NO_CURRENT', 'SAME_SALESPERSON'
  }
}

const isUuid = (v) => typeof v === 'string' && UUID_RE.test(v);

/**
 * Credit the booking's paid amount to a salesperson and mark them current + origin.
 * Idempotent: if the booking already has an origin salesperson, nothing changes and
 * { credited: false, alreadyCredited: true } is returned.
 *
 * @returns {Promise<{credited: boolean, alreadyCredited?: boolean, credited_amount?: number, assignment?: object}>}
 */
async function creditSalespersonForBooking(executor, { booking_id, salesperson_id, assigned_by }) {
  if (!isUuid(booking_id) || !isUuid(salesperson_id)) {
    throw new SalespersonError('INVALID_ID', 'Invalid booking or salesperson ID format');
  }

  const salespersonRes = await executor.query(
    `SELECT id, full_name, status FROM internal_staff WHERE id = $1`,
    [salesperson_id]
  );
  if (salespersonRes.rows.length === 0) {
    throw new SalespersonError('SALESPERSON_NOT_FOUND', 'Salesperson not found');
  }

  // Already credited? Keep idempotent so retries / double submits don't double-count.
  const originRes = await executor.query(
    `SELECT id, salesperson_id FROM booking_salesperson_assignments
     WHERE booking_id = $1 AND is_origin = true`,
    [booking_id]
  );
  if (originRes.rows.length > 0) {
    return { credited: false, alreadyCredited: true, origin: originRes.rows[0] };
  }

  const bookingRes = await executor.query(
    `SELECT booking_id, amount_paid FROM bookings WHERE booking_id = $1`,
    [booking_id]
  );
  if (bookingRes.rows.length === 0) {
    throw new SalespersonError('BOOKING_NOT_FOUND', 'Booking not found');
  }

  const creditedAmount = parseFloat(bookingRes.rows[0].amount_paid || 0);

  const insertRes = await executor.query(
    `INSERT INTO booking_salesperson_assignments
       (booking_id, salesperson_id, credited_amount, is_current, is_origin, action, assigned_by)
     VALUES ($1, $2, $3, true, true, 'CREDITED', $4)
     RETURNING id, booking_id, salesperson_id, credited_amount, is_current, is_origin, action, assigned_at`,
    [booking_id, salesperson_id, creditedAmount, assigned_by || null]
  );

  await executor.query(
    `UPDATE internal_staff
     SET total_sales_amount = total_sales_amount + $2,
         bookings_brought_count = bookings_brought_count + 1,
         updated_at = NOW()
     WHERE id = $1`,
    [salesperson_id, creditedAmount]
  );

  return {
    credited: true,
    credited_amount: creditedAmount,
    assignment: insertRes.rows[0],
    salesperson_name: salespersonRes.rows[0].full_name,
  };
}

/**
 * Switch the currently assigned salesperson for a booking. Pointer-only change:
 * does NOT alter total_sales_amount or bookings_brought_count for anyone.
 *
 * @returns {Promise<{switched: boolean, from: string, to: string, assignment: object}>}
 */
async function switchBookingSalesperson(executor, { booking_id, new_salesperson_id, assigned_by, switch_reason }) {
  if (!isUuid(booking_id) || !isUuid(new_salesperson_id)) {
    throw new SalespersonError('INVALID_ID', 'Invalid booking or salesperson ID format');
  }

  const salespersonRes = await executor.query(
    `SELECT id, full_name FROM internal_staff WHERE id = $1`,
    [new_salesperson_id]
  );
  if (salespersonRes.rows.length === 0) {
    throw new SalespersonError('SALESPERSON_NOT_FOUND', 'Salesperson not found');
  }

  const currentRes = await executor.query(
    `SELECT id, salesperson_id FROM booking_salesperson_assignments
     WHERE booking_id = $1 AND is_current = true`,
    [booking_id]
  );
  if (currentRes.rows.length === 0) {
    throw new SalespersonError('NO_CURRENT', 'This booking has no credited salesperson yet. Credit one first.');
  }

  const current = currentRes.rows[0];
  if (current.salesperson_id === new_salesperson_id) {
    throw new SalespersonError('SAME_SALESPERSON', 'That salesperson is already the current one for this booking');
  }

  // Demote the existing current pointer first (partial unique index allows only one).
  await executor.query(
    `UPDATE booking_salesperson_assignments SET is_current = false WHERE id = $1`,
    [current.id]
  );

  // New current pointer. Not an origin row, so no credit and no count.
  const insertRes = await executor.query(
    `INSERT INTO booking_salesperson_assignments
       (booking_id, salesperson_id, credited_amount, is_current, is_origin, action, switch_reason, assigned_by)
     VALUES ($1, $2, 0, true, false, 'SWITCHED', $3, $4)
     RETURNING id, booking_id, salesperson_id, is_current, is_origin, action, switch_reason, assigned_at`,
    [booking_id, new_salesperson_id, switch_reason || null, assigned_by || null]
  );

  return {
    switched: true,
    from: current.salesperson_id,
    to: new_salesperson_id,
    assignment: insertRes.rows[0],
    salesperson_name: salespersonRes.rows[0].full_name,
  };
}

/**
 * Get the current + origin salesperson and full assignment history for a booking.
 */
async function getBookingSalesperson(executor, booking_id) {
  if (!isUuid(booking_id)) {
    throw new SalespersonError('INVALID_ID', 'Invalid booking ID format');
  }

  const historyRes = await executor.query(
    `SELECT bsa.id, bsa.salesperson_id, ist.full_name AS salesperson_name, ist.role AS salesperson_role,
            bsa.credited_amount, bsa.is_current, bsa.is_origin, bsa.action, bsa.switch_reason,
            bsa.assigned_by, bsa.assigned_at
     FROM booking_salesperson_assignments bsa
     JOIN internal_staff ist ON bsa.salesperson_id = ist.id
     WHERE bsa.booking_id = $1
     ORDER BY bsa.assigned_at ASC`,
    [booking_id]
  );

  const rows = historyRes.rows;
  return {
    current: rows.find((r) => r.is_current) || null,
    origin: rows.find((r) => r.is_origin) || null,
    history: rows,
  };
}

module.exports = {
  SalespersonError,
  creditSalespersonForBooking,
  switchBookingSalesperson,
  getBookingSalesperson,
};
