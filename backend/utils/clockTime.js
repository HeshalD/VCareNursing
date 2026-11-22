// The server and DB run in UTC, but every time an admin types is an Asia/Colombo wall-clock
// time. A string like "2026-11-22T09:00" has no zone, so `new Date()` / Postgres would read it
// as UTC (5h30m off). Zone-less strings are therefore pinned to +05:30; anything that already
// carries Z or an offset (what the client now sends via toISOString()) is left untouched.
const HAS_ZONE = /(Z|[+-]\d{2}:?\d{2})$/i;

function normalizeClockTime(value) {
    if (typeof value !== 'string') return value;
    const v = value.trim();
    if (!v) return value;
    if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(v) && !HAS_ZONE.test(v)) {
        const t = v.replace(' ', 'T');
        return `${t}${t.length === 16 ? ':00' : ''}+05:30`;
    }
    return value;
}

module.exports = { normalizeClockTime };
