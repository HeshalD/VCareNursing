// services/visitingBookings.js
// VISITING bookings are one-time visits, not an ongoing engagement like LIVE_IN/
// SHIFT_BASED — a single staff_daily_attendance decision (salary) and a single
// booking_daily_invoices decision (client charge) for the visit date fully close
// out the entire booking. Once both exist, the booking auto-completes instead of
// sitting ACTIVE indefinitely waiting for an admin to manually hit "Complete".

/**
 * Checks whether a VISITING booking's single visit has been fully decided (both
 * the staff's salary and the client's invoice), and if so, completes the booking
 * immediately — same effect as the manual "Complete Booking" action, minus the
 * settlement-decision step (a one-time visit's charge is decided in the same
 * action that triggers this, so there's nothing left to settle).
 *
 * Must be called with a `client` already inside an open transaction (BEGIN'd by
 * the caller) — this function does not commit; the caller's own COMMIT persists
 * these updates alongside whatever attendance/invoice decision triggered it.
 *
 * @returns {boolean} true if the booking was just auto-completed
 */
const maybeAutoCompleteVisitingBooking = async (client, bookingId) => {
    const bookingRes = await client.query(
        `SELECT booking_id, status, service_model FROM bookings WHERE booking_id = $1 FOR UPDATE`,
        [bookingId]
    );
    const booking = bookingRes.rows[0];
    if (!booking || booking.service_model !== 'VISITING' || booking.status !== 'ACTIVE') {
        return false;
    }

    const assignmentRes = await client.query(
        `SELECT assignment_id, service_start_date::text AS service_start_date
         FROM booking_staff_assignments
         WHERE booking_id = $1 AND status = 'ACTIVE'
         ORDER BY service_start_date DESC
         LIMIT 1`,
        [bookingId]
    );
    const assignment = assignmentRes.rows[0];
    if (!assignment) return false;

    const visitDate = assignment.service_start_date;

    const attendanceRes = await client.query(
        `SELECT salary_status FROM staff_daily_attendance
         WHERE assignment_id = $1 AND service_date = $2 AND reschedule_id IS NULL`,
        [assignment.assignment_id, visitDate]
    );
    const attendanceDecided = attendanceRes.rows.length > 0 && attendanceRes.rows[0].salary_status !== 'PENDING';

    const invoiceRes = await client.query(
        `SELECT status FROM booking_daily_invoices
         WHERE booking_id = $1 AND service_date = $2 AND shift_slot_id IS NULL AND reschedule_id IS NULL`,
        [bookingId, visitDate]
    );
    const invoiceDecided = invoiceRes.rows.length > 0 && invoiceRes.rows[0].status !== 'PENDING';

    if (!attendanceDecided || !invoiceDecided) return false;

    const endTime = new Date(`${visitDate}T23:59:59`);

    await client.query(
        `UPDATE bookings SET status = 'COMPLETED', actual_end_time = $2 WHERE booking_id = $1`,
        [bookingId, endTime]
    );

    await client.query(
        `UPDATE staff_profiles sp
         SET current_status = 'AVAILABLE'
         FROM booking_staff_assignments bsa
         WHERE bsa.booking_id = $1 AND bsa.status = 'ACTIVE' AND sp.staff_profile_id = bsa.staff_profile_id`,
        [bookingId]
    );

    await client.query(
        `UPDATE booking_staff_assignments
         SET service_end_date = $2, status = 'COMPLETED'
         WHERE booking_id = $1 AND status = 'ACTIVE'`,
        [bookingId, visitDate]
    );

    console.log(`✅ VISITING booking ${bookingId} auto-completed — visit on ${visitDate} fully decided (salary + invoice).`);
    return true;
};

module.exports = { maybeAutoCompleteVisitingBooking };
