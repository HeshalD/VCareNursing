-- Find service requests whose start_date / requested_end_date were moved back one day
-- by the edit-form bug (fixed 2026-11-27: the form sliced the UTC timestamp, so every save
-- sent the previous calendar day).
--
-- Read-only. Run with: psql "$DATABASE_URL" -f findShiftedServiceRequestDates.sql
--
-- Each SERVICE_REQUEST_UPDATED activity-log entry stores {from, to} for every changed field,
-- as UTC timestamps. A bug-caused change is exactly "to = from - 1 day" in Sri Lanka time.
-- A real edit that moved the date back by exactly one day looks the same, so review the list
-- before correcting anything.

WITH changes AS (
    SELECT
        al.log_id,
        al.created_at,
        al.actor_name,
        al.entity_id::uuid AS request_id,
        f.field,
        ((al.details->'changes'->f.field->>'from')::timestamptz AT TIME ZONE 'Asia/Colombo')::date AS from_date,
        ((al.details->'changes'->f.field->>'to')::timestamptz   AT TIME ZONE 'Asia/Colombo')::date AS to_date
    FROM activity_log al
    CROSS JOIN (VALUES ('start_date'), ('requested_end_date')) AS f(field)
    WHERE al.action_type = 'SERVICE_REQUEST_UPDATED'
      AND al.details->'changes' ? f.field
      AND al.details->'changes'->f.field->>'from' IS NOT NULL
      AND al.details->'changes'->f.field->>'to'   IS NOT NULL
),
per_field AS (
    SELECT
        request_id,
        field,
        COUNT(*) FILTER (WHERE to_date = from_date - 1)           AS one_day_back_shifts,
        COUNT(*) FILTER (WHERE to_date <> from_date - 1)          AS other_changes,
        MIN(created_at) FILTER (WHERE to_date = from_date - 1)    AS first_shift_at,
        MAX(created_at) FILTER (WHERE to_date = from_date - 1)    AS last_shift_at,
        -- The date before the first shift = most likely the intended date.
        (ARRAY_AGG(from_date ORDER BY created_at) FILTER (WHERE to_date = from_date - 1))[1] AS date_before_first_shift,
        STRING_AGG(DISTINCT actor_name, ', ')                     AS edited_by
    FROM changes
    GROUP BY request_id, field
)
SELECT
    sr.service_request_code,
    pf.request_id,
    pf.field,
    CASE pf.field WHEN 'start_date' THEN sr.start_date ELSE sr.requested_end_date END AS current_value,
    pf.date_before_first_shift                                                          AS likely_correct_value,
    pf.one_day_back_shifts,
    pf.other_changes,       -- > 0 means someone also changed this date on purpose: check by hand
    pf.first_shift_at,
    pf.last_shift_at,
    pf.edited_by,
    sr.status,
    EXISTS (SELECT 1 FROM bookings b WHERE b.request_id = sr.request_id)               AS has_booking
FROM per_field pf
JOIN service_requests sr ON sr.request_id = pf.request_id
WHERE pf.one_day_back_shifts > 0
ORDER BY pf.last_shift_at DESC;
