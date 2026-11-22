// Allocation-history read model for the booking detail page.
//  - enriches every booking_staff_assignments row with status context, who assigned it,
//    why it ended, and what its staff member has been paid (per-day detail included);
//  - builds one chronological staff-change log out of staff_swaps, ended/started
//    assignments (shift reassignments, log-outs, leave reliefs, makeups) and scheduled actions.
// Read-only. The effective date of an event is the date the change takes effect for the
// client's service, NOT the moment it was typed in (swapped_at is NOW() at entry time).

const ymd = (v) => {
    if (!v) return null;
    if (typeof v === 'string') return v.slice(0, 10);
    // DATE columns arrive as local-midnight Dates from node-postgres
    const d = new Date(v);
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};
const colomboDate = (v) => {
    if (!v) return null;
    return new Date(new Date(v).getTime() + 330 * 60000).toISOString().slice(0, 10);
};

const ACTION_LABEL = {
    STAFF_SWAP: 'SWAP', STAFF_RELIEVE: 'RELIEVED', ASSIGNMENT_START: 'ASSIGNED',
    SHIFT_REASSIGNMENT: 'REASSIGNED', TERMINATION: 'TERMINATION', COMPLETION: 'COMPLETION',
};

async function buildAllocationHistory(db, booking) {
    const booking_id = booking.booking_id;
    const [asgRes, swapRes, actRes, payRes, endLogRes] = await Promise.all([
        db.query(
            `SELECT bsa.assignment_id, bsa.booking_id, bsa.staff_profile_id, bsa.daily_rate,
                    bsa.service_start_date, bsa.service_start_time, bsa.assigned_hours,
                    bsa.service_end_date, bsa.amount_allocated, bsa.status, bsa.notes,
                    bsa.assigned_on, bsa.assigned_by, bsa.shift_slot_id, bsa.reschedule_id,
                    ss.shift_number, ss.start_time AS shift_start_time,
                    ss.duration_hours AS shift_duration_hours, ss.label AS shift_label,
                    sp.full_name, sp.staff_code, sp.designation, sp.current_status,
                    COALESCE(abi.full_name, abs.full_name) AS assigned_by_name
             FROM booking_staff_assignments bsa
             JOIN staff_profiles sp ON bsa.staff_profile_id = sp.staff_profile_id
             LEFT JOIN booking_shift_slots ss ON bsa.shift_slot_id = ss.shift_slot_id
             LEFT JOIN internal_staff abi ON abi.user_id = bsa.assigned_by
             LEFT JOIN staff_profiles abs ON abs.user_id = bsa.assigned_by
             WHERE bsa.booking_id = $1
             ORDER BY bsa.service_start_date ASC, bsa.assigned_on ASC`,
            [booking_id]
        ),
        db.query(
            `SELECT sw.swap_id, sw.swapped_at, sw.swap_reason, sw.old_staff_id, sw.new_staff_id,
                    sw.swapped_by, COALESCE(ib.full_name, sb.full_name) AS swapped_by_name,
                    osp.full_name AS old_staff_name, nsp.full_name AS new_staff_name
             FROM staff_swaps sw
             LEFT JOIN staff_profiles osp ON osp.staff_profile_id = sw.old_staff_id
             LEFT JOIN staff_profiles nsp ON nsp.staff_profile_id = sw.new_staff_id
             LEFT JOIN internal_staff ib ON ib.user_id = sw.swapped_by
             LEFT JOIN staff_profiles sb ON sb.user_id = sw.swapped_by
             WHERE sw.booking_id = $1
             ORDER BY sw.swapped_at ASC`,
            [booking_id]
        ),
        db.query(
            `SELECT sa.action_id, sa.action_type, sa.effective_date, sa.status, sa.payload, sa.reason,
                    sa.created_at, sa.executed_at,
                    COALESCE(ci.full_name, cs.full_name) AS created_by_name
             FROM scheduled_actions sa
             LEFT JOIN internal_staff ci ON ci.user_id = sa.created_by
             LEFT JOIN staff_profiles cs ON cs.user_id = sa.created_by
             WHERE sa.booking_id = $1
               AND sa.action_type IN ('STAFF_SWAP','STAFF_RELIEVE','ASSIGNMENT_START','SHIFT_REASSIGNMENT')
             ORDER BY sa.created_at ASC`,
            [booking_id]
        ),
        db.query(
            `SELECT assignment_id, attendance_id, service_date, in_time, out_time, hours_served,
                    salary_status, salary_amount, attendance_status, decided_by_name, reschedule_id
             FROM staff_daily_attendance
             WHERE booking_id = $1
             ORDER BY service_date ASC`,
            [booking_id]
        ),
        db.query(
            `SELECT actor_name, created_at, details->>'assignment_id' AS assignment_id
             FROM activity_log
             WHERE action_type = 'STAFF_ASSIGNMENT_ENDED' AND entity_type = 'BOOKING' AND entity_id = $1`,
            [String(booking_id)]
        ).catch(() => ({ rows: [] })),
    ]);

    const asg = asgRes.rows;
    const swaps = swapRes.rows;
    const actions = actRes.rows;
    const closedBy = new Map(endLogRes.rows.map(r => [r.assignment_id, r.actor_name]));

    // ---- pay per assignment -------------------------------------------------------------
    const daysByAsg = new Map();
    for (const r of payRes.rows) {
        if (!daysByAsg.has(r.assignment_id)) daysByAsg.set(r.assignment_id, []);
        daysByAsg.get(r.assignment_id).push({
            service_date: ymd(r.service_date), in_time: r.in_time, out_time: r.out_time,
            hours_served: r.hours_served, salary_status: r.salary_status,
            salary_amount: r.salary_amount == null ? null : Number(r.salary_amount),
            attendance_status: r.attendance_status, decided_by_name: r.decided_by_name,
            is_makeup: !!r.reschedule_id,
        });
    }

    // ---- which swap produced / ended which assignment -----------------------------------
    const swapOld = new Map();   // swap_id -> assignment that was ended by it
    const swapNew = new Map();   // swap_id -> assignment it created
    const usedOld = new Set();
    const usedNew = new Set();
    for (const sw of swaps) {
        const t = new Date(sw.swapped_at).getTime();
        const oldCand = asg.filter(a => a.staff_profile_id === sw.old_staff_id && !usedOld.has(a.assignment_id) && new Date(a.assigned_on).getTime() <= t + 60000)
            .sort((a, b) => new Date(b.assigned_on) - new Date(a.assigned_on))[0];
        if (oldCand) { swapOld.set(sw.swap_id, oldCand); usedOld.add(oldCand.assignment_id); }
        const newCand = asg.filter(a => a.staff_profile_id === sw.new_staff_id && !usedNew.has(a.assignment_id))
            .sort((a, b) => Math.abs(new Date(a.assigned_on) - t) - Math.abs(new Date(b.assigned_on) - t))[0];
        if (newCand) { swapNew.set(sw.swap_id, newCand); usedNew.add(newCand.assignment_id); }
    }

    const bookingEnded = ['COMPLETED', 'TERMINATED'].includes(booking.status);
    const bookingEnd = ymd(booking.actual_end_time || booking.scheduled_end_time);

    // ---- enrich assignments --------------------------------------------------------------
    const slotSuccessor = (a) => a.shift_slot_id && a.service_end_date
        ? asg.find(b => b !== a && b.shift_slot_id === a.shift_slot_id && !b.reschedule_id &&
            ymd(b.service_start_date) === ymd(a.service_end_date) && b.assignment_id !== a.assignment_id)
        : null;

    const enriched = asg.map(a => {
        const days = daysByAsg.get(a.assignment_id) || [];
        const sum = (st) => days.filter(d => d.salary_status === st).reduce((t, d) => t + (d.salary_amount || 0), 0);
        const cnt = (st) => days.filter(d => d.salary_status === st).length;
        let endReason = null;
        let endedBySwap = [...swapOld.entries()].find(([, v]) => v === a);
        if (a.service_end_date || a.status === 'COMPLETED') {
            if (endedBySwap) endReason = 'SWAPPED';
            else if (slotSuccessor(a)) endReason = 'REASSIGNED';
            else if (a.reschedule_id) endReason = 'MAKEUP_DONE';
            else if (bookingEnded && (!bookingEnd || ymd(a.service_end_date) >= bookingEnd)) endReason = 'BOOKING_ENDED';
            else if (actions.some(x => x.action_type === 'STAFF_RELIEVE' && x.status === 'EXECUTED' && x.payload?.staff_profile_id === a.staff_profile_id)) endReason = 'RELIEVED';
            else if (closedBy.has(a.assignment_id)) endReason = 'LOGGED_OUT';
            else endReason = 'ENDED';
        }
        return {
            ...a,
            end_reason: endReason,
            is_makeup: !!a.reschedule_id,
            closed_by_name: closedBy.get(a.assignment_id) || null,
            pay: {
                paid_total: sum('PAID'), pending_total: sum('PENDING'),
                paid_days: cnt('PAID'), pending_days: cnt('PENDING'),
                revoked_days: cnt('REVOKED'), skipped_days: cnt('SKIPPED'),
                record_count: days.length,
                days,
            },
        };
    });
    const byId = new Map(enriched.map(a => [a.assignment_id, a]));

    // ---- staff-change log -----------------------------------------------------------------
    const nameOf = (id) => asg.find(a => a.staff_profile_id === id)?.full_name || null;
    const events = [];
    const handledAssignments = new Set();
    const execActions = actions.filter(x => x.status === 'EXECUTED');

    for (const sw of swaps) {
        const newA = swapNew.get(sw.swap_id);
        const oldA = swapOld.get(sw.swap_id);
        if (newA) handledAssignments.add(newA.assignment_id);
        const effective = newA ? ymd(newA.service_start_date) : colomboDate(sw.swapped_at);
        const sched = execActions.find(x => x.action_type === 'STAFF_SWAP' && x.payload?.new_staff_id === sw.new_staff_id &&
            Math.abs(new Date(x.executed_at || 0) - new Date(sw.swapped_at)) < 3600 * 1000);
        const recorded = colomboDate(sw.swapped_at);
        events.push({
            id: `swap-${sw.swap_id}`, type: 'SWAP', effective_date: effective, recorded_at: sw.swapped_at,
            from_staff: sw.old_staff_name, to_staff: sw.new_staff_name,
            shift_label: newA?.shift_label || oldA?.shift_label || null,
            reason: sw.swap_reason || sched?.reason || null,
            initiated_by: sched?.created_by_name || sw.swapped_by_name || null,
            mode: sched ? 'SCHEDULED' : (effective && recorded && effective < recorded ? 'BACKDATED' : 'IMMEDIATE'),
            out_time: oldA ? (daysByAsg.get(oldA.assignment_id) || []).filter(d => d.out_time).slice(-1)[0]?.out_time || null : null,
            in_time: newA ? (daysByAsg.get(newA.assignment_id) || []).filter(d => d.in_time)[0]?.in_time || null : null,
        });
    }

    // Ended assignments that no swap record explains + assignments no swap produced.
    for (const a of enriched) {
        if (!usedOld.has(a.assignment_id) && a.end_reason && !['BOOKING_ENDED', 'MAKEUP_DONE'].includes(a.end_reason)) {
            const succ = slotSuccessor(a);
            if (a.end_reason === 'REASSIGNED' && succ) handledAssignments.add(succ.assignment_id);
            events.push({
                id: `end-${a.assignment_id}`,
                type: a.end_reason === 'REASSIGNED' ? 'REASSIGNED' : a.end_reason === 'RELIEVED' ? 'RELIEVED' : a.end_reason === 'LOGGED_OUT' ? 'LOGGED_OUT' : 'ENDED',
                effective_date: ymd(a.service_end_date), recorded_at: null,
                from_staff: a.full_name, to_staff: succ ? nameOf(succ.staff_profile_id) : null,
                shift_label: a.shift_label || null, reason: null,
                initiated_by: a.end_reason === 'REASSIGNED' ? (byId.get(succ.assignment_id)?.assigned_by_name || null) : a.closed_by_name,
                mode: 'IMMEDIATE', out_time: (a.pay.days.filter(d => d.out_time).slice(-1)[0] || {}).out_time || null, in_time: null,
            });
        }
    }
    for (const a of enriched) {
        if (handledAssignments.has(a.assignment_id) || a.is_makeup) continue;
        events.push({
            id: `asg-${a.assignment_id}`, type: 'ASSIGNED', effective_date: ymd(a.service_start_date),
            recorded_at: a.assigned_on, from_staff: null, to_staff: a.full_name,
            shift_label: a.shift_label || null, reason: a.notes || null,
            initiated_by: a.assigned_by_name || null,
            mode: a.status === 'SCHEDULED' ? 'SCHEDULED' : 'IMMEDIATE', out_time: null,
            in_time: (a.pay.days.filter(d => d.in_time)[0] || {}).in_time || null,
        });
    }
    for (const a of enriched) {
        if (!a.is_makeup) continue;
        events.push({
            id: `mk-${a.assignment_id}`, type: 'MAKEUP', effective_date: ymd(a.service_start_date),
            recorded_at: a.assigned_on, from_staff: null, to_staff: a.full_name,
            shift_label: a.shift_label || null, reason: a.notes || null,
            initiated_by: a.assigned_by_name || null, mode: 'IMMEDIATE', out_time: null, in_time: null,
        });
    }

    // Future (or cancelled) scheduled changes that haven't become assignments yet.
    for (const x of actions) {
        if (x.status === 'EXECUTED') continue;
        if (x.status !== 'SCHEDULED' && x.status !== 'CANCELLED' && x.status !== 'FAILED') continue;
        const p = x.payload || {};
        events.push({
            id: `act-${x.action_id}`, type: ACTION_LABEL[x.action_type] || x.action_type,
            effective_date: ymd(x.effective_date), recorded_at: x.created_at,
            from_staff: nameOf(p.old_staff_id || p.staff_profile_id) || null,
            to_staff: p.new_staff_id ? nameOf(p.new_staff_id) || 'Selected staff' : null,
            shift_label: null, reason: x.reason || null,
            initiated_by: x.created_by_name || null, mode: 'SCHEDULED',
            action_status: x.status, out_time: null, in_time: null,
        });
    }

    events.sort((a, b) => String(b.effective_date || '').localeCompare(String(a.effective_date || ''))
        || new Date(b.recorded_at || 0) - new Date(a.recorded_at || 0));

    return { assignments: enriched, change_log: events };
}

module.exports = { buildAllocationHistory };
