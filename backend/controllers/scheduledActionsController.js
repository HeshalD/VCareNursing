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
const { dispatchScheduledAction } = require('../services/scheduledActions');
const { logActivity } = require('../utils/activityLogger');

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

        const [scheduledRes, pendingRes, predictionRes, attendanceRes, leaveRes] = await Promise.all([
            db.query(`
                SELECT
                    sa.action_id, sa.action_type, sa.effective_date::text AS effective_date,
                    sa.status, sa.payload, sa.reason, sa.created_at,
                    b.booking_id, b.booking_code,
                    c.full_name AS client_name,
                    p.full_name AS patient_name,
                    os.full_name AS current_staff_name,
                    ns.full_name AS incoming_staff_name
                FROM scheduled_actions sa
                JOIN bookings b ON sa.booking_id = b.booking_id
                LEFT JOIN client_profiles c ON b.client_id = c.client_profile_id
                LEFT JOIN patient_profiles p ON b.patient_id = p.patient_id
                LEFT JOIN staff_profiles os ON b.assigned_staff_id = os.staff_profile_id
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
                    c.full_name AS client_name,
                    p.full_name AS patient_name
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
                    c.full_name AS client_name,
                    p.full_name AS patient_name,
                    ROUND((COALESCE(bill.total_paid, 0) - COALESCE(bill.total_invoiced, 0)) / b.daily_rate, 1) AS balance_days_remaining,
                    (COALESCE(bill.total_paid, 0) - COALESCE(bill.total_invoiced, 0)) AS remaining_balance
                FROM bookings b
                LEFT JOIN client_profiles c ON b.client_id = c.client_profile_id
                LEFT JOIN patient_profiles p ON b.patient_id = p.patient_id
                LEFT JOIN (
                    SELECT booking_id,
                        COALESCE(SUM(CASE WHEN transaction_type = 'CREDIT' AND COALESCE(category::text, '') != 'STAFF_SALARY' THEN amount ELSE 0 END), 0) AS total_paid,
                        COALESCE(SUM(CASE WHEN transaction_type = 'DEBIT' THEN amount ELSE 0 END), 0) AS total_invoiced
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
                    c.full_name AS client_name,
                    p.full_name AS patient_name,
                    sp.full_name AS current_staff_name
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
                    sp.full_name AS current_staff_name, sp.staff_code
                FROM staff_leave_requests lr
                JOIN staff_profiles sp ON sp.staff_profile_id = lr.staff_profile_id
                WHERE lr.status = 'PENDING'
                ORDER BY lr.start_date ASC
            `),
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
                patient_name: row.patient_name,
                current_staff_name: row.current_staff_name,
                incoming_staff_name: row.incoming_staff_name,
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
                patient_name: row.patient_name,
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
                patient_name: row.patient_name,
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
                patient_name: row.patient_name,
                current_staff_name: row.current_staff_name,
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
                staff_code: row.staff_code,
                start_date: row.start_date,
                end_date: row.end_date,
                effective_date: row.start_date,
                reason: row.reason,
                created_at: row.requested_at,
                due_bucket: 'NEEDS_ACTION',
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
                    `UPDATE staff_profiles SET current_status = 'AVAILABLE' WHERE staff_profile_id = $1`,
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
                    `UPDATE staff_profiles SET current_status = 'AVAILABLE' WHERE staff_profile_id = $1`,
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
