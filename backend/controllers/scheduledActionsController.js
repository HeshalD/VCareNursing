// controllers/scheduledActionsController.js
// Read model + management endpoints for the "Upcoming Events" admin page.
// Combines three kinds of future-relevant items into one ranked list:
//   1. SCHEDULED_ACTION  — rows in scheduled_actions (deferred terminations/completions/
//      swaps/assignment starts) that will execute automatically on their effective_date.
//   2. PENDING_APPROVAL  — client-submitted termination requests awaiting an admin decision.
//   3. PREDICTION        — balance-driven forecasts (expiring soon / already negative),
//      not yet a hard action, surfaced so admins can act before money runs out.
//   4. ATTENDANCE        — SHIFT_BASED/VISITING bookings that are running today but whose
//      staff in/out time has not been logged yet, so daily salary/invoice can't be
//      confirmed. (LIVE_IN is auto-handled by the cron and never needs manual times.)

const db = require('../config/db');
const {
    dispatchScheduledAction,
    getBusinessDate,
    toDateStr,
    isFutureDate,
    enqueueScheduledAction,
    hasOpenAction,
} = require('../services/scheduledActions');
const { conflictThreshold } = require('../services/staffAvailability');
const { userHasPermission } = require('../middleware/authMiddleware');
const { logActivity } = require('../utils/activityLogger');
const { bookingChargeSql } = require('../services/clientFinancials');

function extractActorRole(role) {
    const raw = Array.isArray(role) ? role[0] : role;
    return typeof raw === 'string' ? raw.replace(/\{|\}/g, '').split(',')[0].trim() : String(raw);
}

async function getActorName(userId) {
    const result = await db.query('SELECT full_name FROM staff_profiles WHERE user_id = $1', [userId]);
    return result.rows[0]?.full_name || 'Admin';
}

const RANK = { NEEDS_ACTION: 0, OVERDUE: 1, TODAY: 2, UPCOMING: 3, LATER: 4 };

const bucketForDate = (dateStr, todayStr) => {
    if (!dateStr) return 'LATER';
    if (dateStr < todayStr) return 'OVERDUE';
    if (dateStr === todayStr) return 'TODAY';
    const diffDays = (new Date(dateStr) - new Date(todayStr)) / 86400000;
    return diffDays <= 7 ? 'UPCOMING' : 'LATER';
};

exports.getUpcomingEvents = async (req, res) => {
    try {
        const todayRes = await db.query(`SELECT (DATE(NOW() AT TIME ZONE 'Asia/Colombo'))::text AS d`);
        const today = todayRes.rows[0].d;

        const [scheduledRes, pendingRes, predictionRes, attendanceRes, leaveRes, expiringLeaveRes] = await Promise.all([
            db.query(`
                SELECT
                    sa.action_id, sa.action_type, sa.effective_date::text AS effective_date,
                    sa.status, sa.payload, sa.reason, sa.created_at,
                    b.booking_id, b.booking_code,
                    NULLIF(CONCAT_WS(' ', NULLIF(c.honorific, ''), c.full_name), '') AS client_name,
                    NULLIF(CONCAT_WS(' ', NULLIF(p.honorific, ''), p.full_name), '') AS patient_name,
                    os.full_name AS current_staff_name,
                    ns.full_name AS incoming_staff_name,
                    ls.full_name AS leaving_staff_name,
                    ls.staff_profile_id AS leaving_staff_id,
                    b.client_id, b.patient_id,
                    b.assigned_staff_id AS current_staff_id,
                    ns.staff_profile_id AS incoming_staff_id
                FROM scheduled_actions sa
                JOIN bookings b ON sa.booking_id = b.booking_id
                LEFT JOIN client_profiles c ON b.client_id = c.client_profile_id
                LEFT JOIN patient_profiles p ON b.patient_id = p.patient_id
                LEFT JOIN staff_profiles os ON b.assigned_staff_id = os.staff_profile_id
                LEFT JOIN staff_profiles ls ON ls.staff_profile_id = (sa.payload->>'old_staff_id')::uuid
                LEFT JOIN staff_profiles ns ON ns.staff_profile_id = COALESCE(
                    (sa.payload->>'new_staff_id')::uuid,
                    (sa.payload->>'staff_profile_id')::uuid
                )
                WHERE sa.status = 'SCHEDULED'
                  AND b.status NOT IN ('TERMINATED', 'COMPLETED', 'CANCELLED')
                ORDER BY sa.effective_date ASC
            `),
            db.query(`
                SELECT
                    st.termination_id, st.termination_code, st.urgency,
                    st.requested_end_date::text AS requested_end_date, st.reason, st.created_at,
                    b.booking_id, b.booking_code,
                    NULLIF(CONCAT_WS(' ', NULLIF(c.honorific, ''), c.full_name), '') AS client_name,
                    NULLIF(CONCAT_WS(' ', NULLIF(p.honorific, ''), p.full_name), '') AS patient_name,
                    b.client_id, b.patient_id
                FROM service_terminations st
                JOIN bookings b ON st.booking_id = b.booking_id
                LEFT JOIN client_profiles c ON b.client_id = c.client_profile_id
                LEFT JOIN patient_profiles p ON b.patient_id = p.patient_id
                WHERE st.status = 'PENDING'
                  AND b.status NOT IN ('TERMINATED', 'COMPLETED', 'CANCELLED')
                ORDER BY st.requested_end_date ASC
            `),
            db.query(`
                SELECT
                    b.booking_id, b.booking_code, b.daily_rate,
                    NULLIF(CONCAT_WS(' ', NULLIF(c.honorific, ''), c.full_name), '') AS client_name,
                    NULLIF(CONCAT_WS(' ', NULLIF(p.honorific, ''), p.full_name), '') AS patient_name,
                    b.client_id, b.patient_id,
                    ROUND((COALESCE(bill.total_paid, 0) - COALESCE(bill.total_invoiced, 0)) / b.daily_rate, 1) AS balance_days_remaining,
                    (COALESCE(bill.total_paid, 0) - COALESCE(bill.total_invoiced, 0)) AS remaining_balance
                FROM bookings b
                LEFT JOIN client_profiles c ON b.client_id = c.client_profile_id
                LEFT JOIN patient_profiles p ON b.patient_id = p.patient_id
                LEFT JOIN (
                    SELECT booking_id,
                        COALESCE(SUM(CASE WHEN transaction_type = 'CREDIT' AND COALESCE(category::text, '') != 'STAFF_SALARY' THEN amount ELSE 0 END), 0) AS total_paid,
                        COALESCE(SUM(CASE WHEN ${bookingChargeSql()} THEN amount ELSE 0 END), 0) AS total_invoiced
                    FROM transactions
                    GROUP BY booking_id
                ) bill ON bill.booking_id = b.booking_id
                WHERE b.status = 'ACTIVE'
                  AND b.daily_rate IS NOT NULL AND b.daily_rate > 0
                  AND ((COALESCE(bill.total_paid, 0) - COALESCE(bill.total_invoiced, 0)) / b.daily_rate) <= 1
                ORDER BY balance_days_remaining ASC
            `),
            // 4. ATTENDANCE — running SHIFT_BASED/VISITING bookings whose staff in/out time
            //    for today hasn't been logged yet (so salary/invoice can't be confirmed).
            //    LIVE_IN is excluded: the cron auto-records it with no in/out times.
            db.query(`
                SELECT
                    bsa.assignment_id, bsa.booking_id,
                    b.booking_code,
                    NULLIF(CONCAT_WS(' ', NULLIF(c.honorific, ''), c.full_name), '') AS client_name,
                    NULLIF(CONCAT_WS(' ', NULLIF(p.honorific, ''), p.full_name), '') AS patient_name,
                    sp.full_name AS current_staff_name,
                    b.client_id, b.patient_id, sp.staff_profile_id AS current_staff_id
                FROM booking_staff_assignments bsa
                JOIN bookings b ON bsa.booking_id = b.booking_id
                JOIN staff_profiles sp ON bsa.staff_profile_id = sp.staff_profile_id
                LEFT JOIN client_profiles c ON b.client_id = c.client_profile_id
                LEFT JOIN patient_profiles p ON b.patient_id = p.patient_id
                LEFT JOIN staff_daily_attendance a
                    ON a.assignment_id = bsa.assignment_id AND a.service_date = $1::date
                WHERE b.status IN ('ACTIVE', 'OVERDUE')
                  AND b.service_model IN ('SHIFT_BASED', 'VISITING')
                  AND bsa.status = 'ACTIVE'
                  AND bsa.service_start_date <= $1::date
                  AND (bsa.service_end_date IS NULL OR bsa.service_end_date >= $1::date)
                  AND (a.attendance_id IS NULL OR a.in_time IS NULL OR a.out_time IS NULL)
                ORDER BY b.booking_code ASC
            `, [today]),
            // 5. PENDING_LEAVE — staff leave requests awaiting an admin decision.
            db.query(`
                SELECT
                    lr.leave_id, lr.start_date::text AS start_date, lr.end_date::text AS end_date,
                    lr.reason, lr.requested_at,
                    sp.full_name AS current_staff_name, sp.staff_code, sp.staff_profile_id AS current_staff_id
                FROM staff_leave_requests lr
                JOIN staff_profiles sp ON sp.staff_profile_id = lr.staff_profile_id
                WHERE lr.status = 'PENDING'
                ORDER BY lr.start_date ASC
            `),
            // 6. EXPIRING_LEAVE — approved leaves ending within the next 3 days (or already
            //    past their end date) whose staff member hasn't been reported back yet.
            db.query(`
                SELECT
                    lr.leave_id, lr.start_date::text AS start_date, lr.end_date::text AS end_date,
                    lr.reason,
                    sp.full_name AS current_staff_name, sp.staff_code, sp.staff_profile_id AS current_staff_id
                FROM staff_leave_requests lr
                JOIN staff_profiles sp ON sp.staff_profile_id = lr.staff_profile_id
                WHERE lr.status = 'APPROVED'
                  AND lr.actual_return_date IS NULL
                  AND lr.end_date <= ($1::date + INTERVAL '3 days')
                ORDER BY lr.end_date ASC
            `, [today]),
        ]);

        const events = [];

        for (const row of scheduledRes.rows) {
            events.push({
                id: row.action_id,
                source: 'SCHEDULED_ACTION',
                action_type: row.action_type,
                booking_id: row.booking_id,
                booking_code: row.booking_code,
                client_name: row.client_name,
                client_id: row.client_id,
                patient_name: row.patient_name,
                patient_id: row.patient_id,
                current_staff_name: row.current_staff_name,
                current_staff_id: row.current_staff_id,
                incoming_staff_name: row.incoming_staff_name,
                incoming_staff_id: row.incoming_staff_id,
                // A swap scheduled before anyone was chosen to take over.
                no_replacement: ['STAFF_SWAP', 'SHIFT_REASSIGNMENT'].includes(row.action_type) && !row.payload?.new_staff_id,
                leaving_staff_name: row.leaving_staff_name,
                leaving_staff_id: row.leaving_staff_id,
                effective_date: row.effective_date,
                status: row.status,
                reason: row.reason,
                created_at: row.created_at,
                due_bucket: bucketForDate(row.effective_date, today),
            });
        }

        for (const row of pendingRes.rows) {
            events.push({
                id: row.termination_id,
                source: 'PENDING_APPROVAL',
                action_type: 'PENDING_TERMINATION',
                booking_id: row.booking_id,
                booking_code: row.booking_code,
                client_name: row.client_name,
                client_id: row.client_id,
                patient_name: row.patient_name,
                patient_id: row.patient_id,
                termination_code: row.termination_code,
                urgency: row.urgency,
                effective_date: row.requested_end_date,
                status: 'PENDING',
                reason: row.reason,
                created_at: row.created_at,
                due_bucket: 'NEEDS_ACTION',
            });
        }

        for (const row of predictionRes.rows) {
            const remaining = parseFloat(row.remaining_balance);
            const isNegative = remaining < 0;
            events.push({
                id: row.booking_id,
                source: 'PREDICTION',
                action_type: isNegative ? 'NEGATIVE_BALANCE' : 'EXPIRING_SOON',
                booking_id: row.booking_id,
                booking_code: row.booking_code,
                client_name: row.client_name,
                client_id: row.client_id,
                patient_name: row.patient_name,
                patient_id: row.patient_id,
                balance_days_remaining: row.balance_days_remaining === null ? null : parseFloat(row.balance_days_remaining),
                remaining_balance: remaining,
                effective_date: null,
                status: isNegative ? 'NEGATIVE_BALANCE' : 'EXPIRING_SOON',
                due_bucket: isNegative ? 'NEEDS_ACTION' : 'UPCOMING',
            });
        }

        for (const row of attendanceRes.rows) {
            events.push({
                id: row.assignment_id,
                source: 'ATTENDANCE',
                action_type: 'ATTENDANCE_NEEDED',
                booking_id: row.booking_id,
                booking_code: row.booking_code,
                client_name: row.client_name,
                client_id: row.client_id,
                patient_name: row.patient_name,
                patient_id: row.patient_id,
                current_staff_name: row.current_staff_name,
                current_staff_id: row.current_staff_id,
                effective_date: today,
                status: 'PENDING',
                due_bucket: 'TODAY',
            });
        }

        for (const row of leaveRes.rows) {
            events.push({
                id: row.leave_id,
                source: 'PENDING_LEAVE',
                action_type: 'PENDING_LEAVE',
                booking_id: null,
                booking_code: null,
                client_name: null,
                patient_name: null,
                current_staff_name: row.current_staff_name,
                current_staff_id: row.current_staff_id,
                staff_code: row.staff_code,
                start_date: row.start_date,
                end_date: row.end_date,
                effective_date: row.start_date,
                reason: row.reason,
                created_at: row.requested_at,
                due_bucket: 'NEEDS_ACTION',
            });
        }

        for (const row of expiringLeaveRes.rows) {
            events.push({
                id: row.leave_id,
                source: 'EXPIRING_LEAVE',
                action_type: 'EXPIRING_LEAVE',
                booking_id: null,
                booking_code: null,
                client_name: null,
                patient_name: null,
                current_staff_name: row.current_staff_name,
                current_staff_id: row.current_staff_id,
                staff_code: row.staff_code,
                start_date: row.start_date,
                end_date: row.end_date,
                effective_date: row.end_date,
                reason: row.reason,
                due_bucket: bucketForDate(row.end_date, today),
            });
        }

        events.sort((a, b) => {
            const rankDiff = RANK[a.due_bucket] - RANK[b.due_bucket];
            if (rankDiff !== 0) return rankDiff;
            const aDate = a.effective_date || '9999-99-99';
            const bDate = b.effective_date || '9999-99-99';
            return aDate.localeCompare(bDate);
        });

        res.status(200).json({
            status: 'success',
            today,
            count: events.length,
            needs_action_count: events.filter(e => e.due_bucket === 'NEEDS_ACTION' || e.due_bucket === 'OVERDUE' || e.due_bucket === 'TODAY').length,
            data: events,
        });
    } catch (error) {
        console.error('getUpcomingEvents error:', error);
        res.status(500).json({ status: 'error', message: 'Failed to fetch upcoming events' });
    }
};

exports.getBookingScheduledEvents = async (req, res) => {
    const { booking_id } = req.params;
    try {
        const result = await db.query(
            `SELECT action_id, action_type, effective_date::text AS effective_date,
                    status, payload, reason, created_at
             FROM scheduled_actions
             WHERE booking_id = $1 AND status = 'SCHEDULED'
             ORDER BY effective_date ASC`,
            [booking_id]
        );
        res.status(200).json({ status: 'success', data: result.rows });
    } catch (error) {
        console.error('getBookingScheduledEvents error:', error);
        res.status(500).json({ status: 'error', message: 'Failed to fetch scheduled events' });
    }
};

exports.cancelScheduledAction = async (req, res) => {
    const { action_id } = req.params;
    const client = await db.pool.connect();

    try {
        await client.query('BEGIN');

        const actionRes = await client.query(
            `SELECT * FROM scheduled_actions WHERE action_id = $1 FOR UPDATE`,
            [action_id]
        );

        if (actionRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ status: 'error', message: 'Scheduled action not found' });
        }

        const action = actionRes.rows[0];

        if (action.status !== 'SCHEDULED') {
            await client.query('ROLLBACK');
            return res.status(400).json({ status: 'error', message: `Action is already ${action.status}` });
        }

        const payload = action.payload || {};

        if (action.action_type === 'ASSIGNMENT_START') {
            await client.query(
                `UPDATE booking_staff_assignments SET status = 'CANCELLED' WHERE assignment_id = $1 AND status = 'SCHEDULED'`,
                [payload.assignment_id]
            );
            if (payload.staff_profile_id) {
                await client.query(
                    `UPDATE staff_profiles SET current_status = 'AVAILABLE'
                     WHERE staff_profile_id = $1
                       AND NOT EXISTS (
                         SELECT 1 FROM booking_staff_assignments o
                         WHERE o.staff_profile_id = $1 AND o.status IN ('ACTIVE', 'SCHEDULED')
                       )`,
                    [payload.staff_profile_id]
                );
            }
        } else if (action.action_type === 'STAFF_SWAP') {
            await client.query(
                `UPDATE booking_staff_assignments SET status = 'CANCELLED' WHERE assignment_id = $1 AND status = 'SCHEDULED'`,
                [payload.new_assignment_id]
            );
            if (payload.new_staff_id) {
                await client.query(
                    `UPDATE staff_profiles SET current_status = 'AVAILABLE'
                     WHERE staff_profile_id = $1
                       AND NOT EXISTS (
                         SELECT 1 FROM booking_staff_assignments o
                         WHERE o.staff_profile_id = $1 AND o.status IN ('ACTIVE', 'SCHEDULED')
                       )`,
                    [payload.new_staff_id]
                );
            }
        } else if (action.action_type === 'TERMINATION' && action.termination_id) {
            await client.query(
                `UPDATE service_terminations SET status = 'CANCELLED' WHERE termination_id = $1 AND status = 'SCHEDULED'`,
                [action.termination_id]
            );
        }

        await client.query(
            `UPDATE scheduled_actions SET status = 'CANCELLED' WHERE action_id = $1`,
            [action_id]
        );

        await client.query('COMMIT');

        logActivity({
            actorUserId: req.user?.user_id,
            actorRole: extractActorRole(req.user?.role),
            actionType: 'SCHEDULED_ACTION_CANCELLED',
            entityType: 'BOOKING',
            entityId: String(action.booking_id),
            details: { action_id, scheduled_action_type: action.action_type, effective_date: action.effective_date },
        }).catch(err => console.error('Activity log failed:', err));

        res.status(200).json({ status: 'success', message: 'Scheduled action cancelled.' });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('cancelScheduledAction error:', error);
        res.status(500).json({ status: 'error', message: 'Failed to cancel scheduled action' });
    } finally {
        client.release();
    }
};

// POST /api/scheduled-actions/:action_id/assign-replacement
// body: { new_staff_id, new_staff_daily_rate?, new_staff_in_time? }
// Names the replacement for a swap that was scheduled with none (STAFF_SWAP for
// live-in, SHIFT_REASSIGNMENT for a shift slot — both carry new_staff_id: null).
// From then on it is an ordinary scheduled swap. If the swap date has already
// arrived (the nightly run just hasn't processed it yet) it is executed right away.
exports.assignReplacement = async (req, res) => {
    const { action_id } = req.params;
    const { new_staff_id, new_staff_daily_rate, new_staff_in_time } = req.body || {};
    if (!new_staff_id) {
        return res.status(400).json({ status: 'error', message: 'new_staff_id is required' });
    }

    const fail = (statusCode, message) => Object.assign(new Error(message), { statusCode });
    const client = await db.pool.connect();
    try {
        await client.query('BEGIN');

        const actionRes = await client.query(`SELECT * FROM scheduled_actions WHERE action_id = $1 FOR UPDATE`, [action_id]);
        const action = actionRes.rows[0];
        if (!action) throw fail(404, 'Scheduled action not found');
        if (!['STAFF_SWAP', 'SHIFT_REASSIGNMENT'].includes(action.action_type)) throw fail(400, 'This action does not take a replacement.');
        if (action.status !== 'SCHEDULED') throw fail(409, `This swap is already ${action.status.toLowerCase()}. If the booking is paused, use Resume with staff instead.`);
        const payload = action.payload || {};
        if (payload.new_staff_id) throw fail(400, 'This swap already has a replacement.');

        const neededPermission = action.action_type === 'STAFF_SWAP' ? 'BOOKING_SWAP_STAFF' : 'ASSIGNMENT_UPDATE';
        if (!(await userHasPermission(req.user, neededPermission))) {
            throw fail(403, `You need the ${neededPermission} permission to assign a replacement.`);
        }

        const bookingRes = await client.query(
            `SELECT booking_id, status, daily_rate FROM bookings WHERE booking_id = $1 FOR UPDATE`,
            [action.booking_id]
        );
        const booking = bookingRes.rows[0];
        if (!booking || !['ACTIVE', 'OVERDUE'].includes(booking.status)) {
            throw fail(400, `The booking is ${booking?.status || 'missing'}, so a replacement can't be assigned to this swap.`);
        }

        const effDateStr = toDateStr(action.effective_date);
        const businessDate = await getBusinessDate(client);

        const staffRes = await client.query(
            `SELECT staff_profile_id, full_name, current_status, can_dual_book FROM staff_profiles WHERE staff_profile_id = $1 FOR UPDATE`,
            [new_staff_id]
        );
        const staff = staffRes.rows[0];
        if (!staff) throw fail(404, 'Staff member not found');
        if (staff.current_status !== 'AVAILABLE') {
            // Same leniency as swapStaff: current_status lags, so only a genuinely
            // date-overlapping assignment on ANOTHER booking blocks.
            const conflictRes = await client.query(
                `SELECT 1
                 FROM booking_staff_assignments bsa
                 LEFT JOIN LATERAL (
                     SELECT effective_date FROM scheduled_actions
                     WHERE booking_id = bsa.booking_id AND action_type IN ('TERMINATION', 'COMPLETION') AND status = 'SCHEDULED'
                     ORDER BY effective_date ASC LIMIT 1
                 ) sa ON bsa.service_end_date IS NULL
                 WHERE bsa.staff_profile_id = $1 AND bsa.booking_id != $2
                   AND bsa.status IN ('ACTIVE', 'SCHEDULED')
                   AND bsa.service_start_date <= $3::date
                   AND (COALESCE(bsa.service_end_date, sa.effective_date) IS NULL
                        OR COALESCE(bsa.service_end_date, sa.effective_date) >= $3::date)
                 LIMIT 2`,
                [new_staff_id, action.booking_id, effDateStr]
            );
            if (conflictRes.rows.length >= conflictThreshold(staff.can_dual_book)) {
                throw fail(400, `${staff.full_name} is not available for assignment (status: ${staff.current_status})`);
            }
        }
        const dupRes = await client.query(
            `SELECT 1 FROM booking_staff_assignments
             WHERE booking_id = $1 AND staff_profile_id = $2 AND status IN ('ACTIVE', 'SCHEDULED') LIMIT 1`,
            [action.booking_id, new_staff_id]
        );
        if (dupRes.rows.length > 0) throw fail(400, `${staff.full_name} already has an active or scheduled assignment on this booking.`);

        const hasRate = new_staff_daily_rate !== undefined && new_staff_daily_rate !== null && new_staff_daily_rate !== '' && Number(new_staff_daily_rate) >= 0;
        let newAssignmentId;
        let nextPayload;

        if (action.action_type === 'STAFF_SWAP') {
            const oldRes = await client.query(
                `SELECT assignment_id FROM booking_staff_assignments
                 WHERE assignment_id = $1 AND status = 'ACTIVE' AND service_end_date IS NULL FOR UPDATE`,
                [payload.old_assignment_id]
            );
            if (oldRes.rows.length === 0) throw fail(409, 'The outgoing staff member has already been logged out of this booking. Use Resume with staff instead.');

            const rate = hasRate ? Number(new_staff_daily_rate) : Number(booking.daily_rate || 0);
            const ins = await client.query(
                `INSERT INTO booking_staff_assignments
                    (booking_id, staff_profile_id, assigned_on, assigned_by, daily_rate,
                     service_start_date, service_end_date, amount_allocated, status)
                 VALUES ($1, $2, NOW(), $3, $4, $5, NULL, NULL, 'SCHEDULED')
                 RETURNING assignment_id`,
                [action.booking_id, new_staff_id, req.user.user_id, rate, effDateStr]
            );
            newAssignmentId = ins.rows[0].assignment_id;
            nextPayload = {
                ...payload,
                new_staff_id,
                new_assignment_id: newAssignmentId,
                new_daily_rate: null, new_ot_rate: null, new_scheduled_end_time: null,
                new_staff_in_time: new_staff_in_time || null,
            };
            // A leave that was booked alongside the unfilled swap now needs its normal
            // relief action, exactly as swapStaff queues for a filled scheduled swap.
            if (payload.leave?.start_date && !(await hasOpenAction(client, action.booking_id, 'STAFF_RELIEVE'))) {
                await enqueueScheduledAction(client, {
                    booking_id: action.booking_id,
                    action_type: 'STAFF_RELIEVE',
                    effective_date: payload.leave.start_date,
                    payload: {
                        assignment_id: payload.old_assignment_id,
                        staff_profile_id: payload.old_staff_id,
                        out_time: payload.out_time,
                        leave_id: payload.leave.leave_id,
                        leave_start: payload.leave.start_date,
                        leave_end: payload.leave.end_date,
                    },
                    reason: action.reason,
                    created_by: req.user.user_id,
                });
            }
        } else {
            const curRes = await client.query(
                `SELECT daily_rate FROM booking_staff_assignments WHERE shift_slot_id = $1 AND status = 'ACTIVE' LIMIT 1`,
                [payload.shift_slot_id]
            );
            const rate = hasRate ? Number(new_staff_daily_rate) : Number(curRes.rows[0]?.daily_rate || 0);
            const ins = await client.query(
                `INSERT INTO booking_staff_assignments
                    (booking_id, staff_profile_id, shift_slot_id, assigned_on, assigned_by, daily_rate,
                     service_start_date, amount_allocated, status, notes)
                 VALUES ($1, $2, $3, NOW(), $4, $5, $6, $5, 'SCHEDULED', $7)
                 RETURNING assignment_id`,
                [action.booking_id, new_staff_id, payload.shift_slot_id, req.user.user_id, rate, effDateStr, action.reason || null]
            );
            newAssignmentId = ins.rows[0].assignment_id;
            nextPayload = {
                ...payload,
                new_staff_id,
                new_assignment_id: newAssignmentId,
                new_staff_in_time: new_staff_in_time || null,
            };
        }

        await client.query(`UPDATE staff_profiles SET current_status = 'ASSIGNED' WHERE staff_profile_id = $1`, [new_staff_id]);
        await client.query(`UPDATE scheduled_actions SET payload = $2 WHERE action_id = $1`, [action_id, JSON.stringify(nextPayload)]);

        // The swap date is already here (the nightly run hasn't processed it yet):
        // run it now rather than leaving the replacement waiting another day.
        const dueNow = !isFutureDate(effDateStr, businessDate);
        let notify = null;
        if (dueNow) {
            const actor = {
                user_id: req.user?.user_id || null,
                name: await getActorName(req.user?.user_id),
                role: extractActorRole(req.user?.role),
            };
            ({ notify } = await dispatchScheduledAction(client, { ...action, payload: nextPayload }, actor));
            await client.query(`UPDATE scheduled_actions SET status = 'EXECUTED', executed_at = NOW() WHERE action_id = $1`, [action_id]);
        }

        await client.query('COMMIT');
        if (notify) notify().catch((e) => console.error('[assignReplacement] notify error:', e.message));

        logActivity({
            actorUserId: req.user?.user_id,
            actorRole: extractActorRole(req.user?.role),
            actionType: 'STAFF_SWAP_REPLACEMENT_ASSIGNED',
            entityType: 'BOOKING',
            entityId: String(action.booking_id),
            details: { action_id, scheduled_action_type: action.action_type, new_staff_id, effective_date: effDateStr, executed_now: dueNow },
        }).catch((e) => console.error('Activity log failed:', e.message));

        res.status(200).json({
            status: 'success',
            message: dueNow
                ? `${staff.full_name} is now on this booking.`
                : `${staff.full_name} will take over on ${effDateStr}.`,
            data: { action_id, new_staff_id, effective_date: effDateStr, executed_now: dueNow },
        });
    } catch (error) {
        await client.query('ROLLBACK');
        if (error.statusCode) {
            return res.status(error.statusCode).json({ status: 'error', message: error.message });
        }
        console.error('assignReplacement error:', error);
        res.status(500).json({ status: 'error', message: 'Failed to assign the replacement' });
    } finally {
        client.release();
    }
};

exports.executeScheduledActionNow = async (req, res) => {
    const { action_id } = req.params;
    const client = await db.pool.connect();

    try {
        await client.query('BEGIN');

        const actionRes = await client.query(
            `SELECT * FROM scheduled_actions WHERE action_id = $1 FOR UPDATE`,
            [action_id]
        );

        if (actionRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ status: 'error', message: 'Scheduled action not found' });
        }

        const action = actionRes.rows[0];

        if (action.status !== 'SCHEDULED') {
            await client.query('ROLLBACK');
            return res.status(400).json({ status: 'error', message: `Action is already ${action.status}` });
        }

        const actorName = await getActorName(req.user?.user_id);
        const actor = {
            user_id: req.user?.user_id || null,
            name: actorName,
            role: extractActorRole(req.user?.role),
        };

        const { notify } = await dispatchScheduledAction(client, action, actor);

        await client.query(
            `UPDATE scheduled_actions SET status = 'EXECUTED', executed_at = NOW() WHERE action_id = $1`,
            [action_id]
        );

        await client.query('COMMIT');

        if (notify) notify();

        res.status(200).json({ status: 'success', message: 'Scheduled action executed now.' });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('executeScheduledActionNow error:', error);
        res.status(500).json({ status: 'error', message: 'Failed to execute scheduled action' });
    } finally {
        client.release();
    }
};
