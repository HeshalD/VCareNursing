// services/invoicingMode.js
// A staff swap on a LIVE_IN booking forces invoicing_mode to 'MANUAL' for as long as two
// staff are concurrently on it (see bookingController.swapStaff). Nothing ever switched it
// back, so bookings stayed manual after their swap was long finished and the nightly cron
// kept leaving every day PENDING for an admin.
//
// To undo only what the swap itself did, the swap remembers the mode it replaced in
// bookings.invoicing_mode_before_swap (set ONLY when the booking was AUTO). When the swap is
// resolved — the outgoing staff's assignment is closed and one staff member is left — the
// booking goes back to that mode. A booking an admin chose to run manually keeps a NULL
// there, so it is never flipped, and any manual toggle by an admin clears it.

// Assignment for an UPDATE bookings SET ... that forces manual mode. Postgres evaluates every
// right-hand side against the OLD row, so the stored value reflects the mode before this
// statement. COALESCE keeps the original across repeated swaps while still MANUAL.
const FORCE_MANUAL_FOR_SWAP_SQL =
    `invoicing_mode_before_swap = COALESCE(invoicing_mode_before_swap, CASE WHEN invoicing_mode = 'AUTO' THEN 'AUTO' END), ` +
    `invoicing_mode = 'MANUAL'`;

// Call inside the caller's open transaction, after an assignment has been closed (or a swap
// that closed the outgoing side immediately). Returns true when the booking was switched
// back to AUTO.
const restoreAutoInvoicingIfSwapResolved = async (client, booking_id) => {
    const res = await client.query(
        `SELECT b.service_model, b.invoicing_mode, b.invoicing_mode_before_swap,
                (SELECT COUNT(*)::int FROM booking_staff_assignments a
                  WHERE a.booking_id = b.booking_id AND a.status = 'ACTIVE' AND a.shift_slot_id IS NULL) AS active_count,
                (SELECT COUNT(*)::int FROM booking_staff_assignments a
                  WHERE a.booking_id = b.booking_id AND a.status = 'SCHEDULED' AND a.shift_slot_id IS NULL) AS scheduled_count,
                (SELECT COUNT(*)::int FROM scheduled_actions s
                  WHERE s.booking_id = b.booking_id AND s.status = 'SCHEDULED'
                    AND s.action_type IN ('STAFF_SWAP', 'STAFF_RELIEVE')) AS queued_actions
         FROM bookings b
         WHERE b.booking_id = $1
         FOR UPDATE`,
        [booking_id]
    );
    const b = res.rows[0];
    if (!b) return false;

    const resolved =
        b.service_model === 'LIVE_IN' &&
        b.invoicing_mode === 'MANUAL' &&
        b.invoicing_mode_before_swap === 'AUTO' &&
        b.active_count === 1 &&     // the swap's overlap is over — one staff member left
        b.scheduled_count === 0 &&  // no replacement still waiting to start
        b.queued_actions === 0;     // no further swap / leave relief queued
    if (!resolved) return false;

    await client.query(
        `UPDATE bookings SET invoicing_mode = 'AUTO', invoicing_mode_before_swap = NULL WHERE booking_id = $1`,
        [booking_id]
    );
    return true;
};

module.exports = { FORCE_MANUAL_FOR_SWAP_SQL, restoreAutoInvoicingIfSwapResolved };
