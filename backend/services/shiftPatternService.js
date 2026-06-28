// services/shiftPatternService.js
// SHIFT_BASED bookings define how many shifts/day they run and each shift's
// time window via a versioned, effective-dated "pattern". A pattern is never
// edited in place — changing the shift count/length always creates a new
// pattern (and new booking_shift_slots rows) effective from a chosen date, so
// historical attendance/invoices stay pinned to whichever slot definition was
// active when they were recorded. LIVE_IN/VISITING bookings never use this.
//
// Mirrors services/scheduledActions.js's convention: functions take the
// transaction `client` they should run on and perform only DB mutation.

const db = require('../config/db');
const { toDateStr, isFutureDate, getBusinessDate, enqueueScheduledAction, hasOpenAction } = require('./scheduledActions');

// Resolve a slot's actual start/end Date for a given calendar service_date,
// handling overnight shifts (e.g. start_time 19:00, duration 12h -> ends 07:00 next day).
const getShiftWindowForDate = (slot, serviceDate) => {
    const dateStr = toDateStr(serviceDate);
    const start = new Date(`${dateStr}T${slot.start_time}`);
    const end = new Date(start.getTime() + parseFloat(slot.duration_hours) * 60 * 60 * 1000);
    return { start, end };
};

// Pure validation helper — returns warning strings, never throws. Overlap
// between shifts (e.g. a handover buffer) is allowed; callers may surface
// these as non-blocking warnings.
const validateNoOverlap = (slots) => {
    const warnings = [];
    const windows = slots.map((s) => {
        const startMin = (() => {
            const [h, m] = s.start_time.split(':').map(Number);
            return h * 60 + m;
        })();
        const durationMin = parseFloat(s.duration_hours) * 60;
        return { shift_number: s.shift_number, startMin, endMin: startMin + durationMin };
    });

    for (let i = 0; i < windows.length; i++) {
        for (let j = i + 1; j < windows.length; j++) {
            const a = windows[i];
            const b = windows[j];
            // Compare on a 48h timeline so overnight wraparound (endMin > 1440) is handled.
            const overlap = a.startMin < b.endMin && b.startMin < a.endMin;
            if (overlap) {
                warnings.push(`Shift ${a.shift_number} and shift ${b.shift_number} overlap.`);
            }
        }
    }
    return warnings;
};

// Pattern (+ slots) in effect for a booking as of a given date. Returns null if none.
const getActivePattern = async (client, booking_id, asOfDate) => {
    const dateStr = toDateStr(asOfDate) || (await getBusinessDate(client));
    const patternRes = await client.query(
        `SELECT * FROM booking_shift_patterns
         WHERE booking_id = $1
           AND effective_from_date <= $2
           AND (effective_to_date IS NULL OR effective_to_date >= $2)
           AND status = 'ACTIVE'
         ORDER BY effective_from_date DESC
         LIMIT 1`,
        [booking_id, dateStr]
    );
    if (patternRes.rows.length === 0) return null;
    const pattern = patternRes.rows[0];

    const slotsRes = await client.query(
        `SELECT * FROM booking_shift_slots WHERE pattern_id = $1 ORDER BY shift_number ASC`,
        [pattern.pattern_id]
    );
    return { ...pattern, slots: slotsRes.rows };
};

// Any pattern queued (SCHEDULED) to take effect in the future, alongside the active one.
const getScheduledPattern = async (client, booking_id) => {
    const res = await client.query(
        `SELECT * FROM booking_shift_patterns WHERE booking_id = $1 AND status = 'SCHEDULED' LIMIT 1`,
        [booking_id]
    );
    if (res.rows.length === 0) return null;
    const pattern = res.rows[0];
    const slotsRes = await client.query(
        `SELECT * FROM booking_shift_slots WHERE pattern_id = $1 ORDER BY shift_number ASC`,
        [pattern.pattern_id]
    );
    return { ...pattern, slots: slotsRes.rows };
};

const getPatternHistory = async (client, booking_id) => {
    const patternsRes = await client.query(
        `SELECT * FROM booking_shift_patterns WHERE booking_id = $1 ORDER BY effective_from_date DESC`,
        [booking_id]
    );
    const patterns = patternsRes.rows;
    if (patterns.length === 0) return [];

    const slotsRes = await client.query(
        `SELECT * FROM booking_shift_slots WHERE pattern_id = ANY($1::uuid[]) ORDER BY shift_number ASC`,
        [patterns.map((p) => p.pattern_id)]
    );
    const slotsByPattern = {};
    for (const slot of slotsRes.rows) {
        (slotsByPattern[slot.pattern_id] ||= []).push(slot);
    }
    return patterns.map((p) => ({ ...p, slots: slotsByPattern[p.pattern_id] || [] }));
};

const insertSlots = async (client, pattern_id, slots) => {
    for (const slot of slots) {
        await client.query(
            `INSERT INTO booking_shift_slots (pattern_id, shift_number, start_time, duration_hours, label)
             VALUES ($1, $2, $3, $4, $5)`,
            [pattern_id, slot.shift_number, slot.start_time, slot.duration_hours, slot.label || null]
        );
    }
};

// Create a new shift pattern version for a booking — either activating it now
// or scheduling it for a future effective_from_date (mirrors the
// immediate-vs-SCHEDULED branching used elsewhere for assignments/swaps).
const createShiftPattern = async (client, { booking_id, shift_count, slots, effective_from_date, created_by }) => {
    if (!Array.isArray(slots) || slots.length !== shift_count) {
        throw new Error('slots must contain exactly shift_count entries');
    }
    const sortedNumbers = slots.map((s) => s.shift_number).slice().sort((a, b) => a - b);
    for (let i = 0; i < sortedNumbers.length; i++) {
        if (sortedNumbers[i] !== i + 1) throw new Error('shift_number must be sequential starting from 1');
    }

    const businessDate = await getBusinessDate(client);
    const effFromStr = toDateStr(effective_from_date) || businessDate;
    const isFuture = isFutureDate(effFromStr, businessDate);

    const current = await getActivePattern(client, booking_id, businessDate);

    if (!isFuture && current) {
        // Changing "now" — disallow rewriting a day that's already been recorded
        // against the current pattern; require at least the next business day.
        const attendanceToday = await client.query(
            `SELECT 1 FROM staff_daily_attendance a
             JOIN booking_shift_slots s ON a.shift_slot_id = s.shift_slot_id
             WHERE s.pattern_id = $1 AND a.service_date = $2 LIMIT 1`,
            [current.pattern_id, businessDate]
        );
        if (attendanceToday.rows.length > 0) {
            throw new Error('Attendance has already been logged for today under the current pattern. Choose a future effective date.');
        }
    }

    const warnings = validateNoOverlap(slots);

    if (isFuture) {
        const alreadyScheduled = await client.query(
            `SELECT 1 FROM booking_shift_patterns WHERE booking_id = $1 AND status = 'SCHEDULED' LIMIT 1`,
            [booking_id]
        );
        if (alreadyScheduled.rows.length > 0) {
            throw new Error('A shift pattern change is already scheduled for this booking.');
        }

        const patternRes = await client.query(
            `INSERT INTO booking_shift_patterns (booking_id, shift_count, effective_from_date, status, created_by)
             VALUES ($1, $2, $3, 'SCHEDULED', $4)
             RETURNING *`,
            [booking_id, shift_count, effFromStr, created_by]
        );
        const pattern = patternRes.rows[0];
        await insertSlots(client, pattern.pattern_id, slots);

        await enqueueScheduledAction(client, {
            booking_id,
            action_type: 'SHIFT_PATTERN_CHANGE',
            effective_date: effFromStr,
            payload: { new_pattern_id: pattern.pattern_id, old_pattern_id: current?.pattern_id || null },
            created_by,
        });

        return { pattern, scheduled: true, warnings };
    }

    // Effective immediately: close out the current pattern (if any) and activate the new one.
    if (current) {
        await client.query(
            `UPDATE booking_shift_patterns SET status = 'SUPERSEDED', effective_to_date = $1 WHERE pattern_id = $2`,
            [businessDate, current.pattern_id]
        );
    }

    const patternRes = await client.query(
        `INSERT INTO booking_shift_patterns (booking_id, shift_count, effective_from_date, status, created_by)
         VALUES ($1, $2, $3, 'ACTIVE', $4)
         RETURNING *`,
        [booking_id, shift_count, effFromStr, created_by]
    );
    const pattern = patternRes.rows[0];
    await insertSlots(client, pattern.pattern_id, slots);

    return { pattern, scheduled: false, warnings };
};

// Cron-driven: flip a SCHEDULED pattern to ACTIVE and supersede whichever was active.
const executeShiftPatternChange = async (client, payload) => {
    const { new_pattern_id, old_pattern_id } = payload;

    const newPatternRes = await client.query(
        `SELECT * FROM booking_shift_patterns WHERE pattern_id = $1 AND status = 'SCHEDULED'`,
        [new_pattern_id]
    );
    if (newPatternRes.rows.length === 0) {
        return { result: { skipped: 'pattern no longer scheduled' }, notify: null };
    }
    const newPattern = newPatternRes.rows[0];

    if (old_pattern_id) {
        await client.query(
            `UPDATE booking_shift_patterns SET status = 'SUPERSEDED', effective_to_date = $1 WHERE pattern_id = $2`,
            [newPattern.effective_from_date, old_pattern_id]
        );
    }

    await client.query(`UPDATE booking_shift_patterns SET status = 'ACTIVE' WHERE pattern_id = $1`, [new_pattern_id]);

    return { result: { booking_id: newPattern.booking_id, pattern_id: new_pattern_id, status: 'ACTIVE' }, notify: null };
};

module.exports = {
    getShiftWindowForDate,
    validateNoOverlap,
    getActivePattern,
    getScheduledPattern,
    getPatternHistory,
    createShiftPattern,
    executeShiftPatternChange,
};
