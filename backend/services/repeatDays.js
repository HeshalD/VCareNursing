// services/repeatDays.js
// Weekly repeat days for a booking (LIVE_IN, stored on bookings.repeat_days) or a
// single shift (SHIFT_BASED, stored on booking_shift_slots.repeat_days). Days are
// JS getDay() / Postgres EXTRACT(DOW) numbers: 0 = Sunday … 6 = Saturday.
// NULL means every day — the default, and how all data before this feature behaves.

// Normalizes request input into a sorted, de-duplicated array of 0–6, or null for
// "every day". An array covering all 7 days collapses to null so "every day" has
// exactly one representation. Throws (statusCode 400) on invalid input.
const normalizeRepeatDays = (input) => {
    if (input === undefined || input === null) return null;
    if (!Array.isArray(input)) {
        const err = new Error('repeat_days must be an array of weekday numbers (0 = Sunday … 6 = Saturday)');
        err.statusCode = 400;
        throw err;
    }
    const days = [...new Set(input.map(Number))].sort((a, b) => a - b);
    if (days.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) {
        const err = new Error('repeat_days may only contain whole numbers from 0 (Sunday) to 6 (Saturday)');
        err.statusCode = 400;
        throw err;
    }
    if (days.length === 0) {
        const err = new Error('Select at least one day of the week');
        err.statusCode = 400;
        throw err;
    }
    return days.length === 7 ? null : days;
};

// True if the service runs on this YYYY-MM-DD date. Parsed as a local date at
// midnight so the weekday matches the calendar date, never shifted by UTC.
const isServiceDay = (repeatDays, dateStr) => {
    if (!Array.isArray(repeatDays) || repeatDays.length === 0) return true;
    const dow = new Date(`${dateStr}T00:00:00`).getDay();
    return repeatDays.map(Number).includes(dow);
};

module.exports = { normalizeRepeatDays, isServiceDay };
