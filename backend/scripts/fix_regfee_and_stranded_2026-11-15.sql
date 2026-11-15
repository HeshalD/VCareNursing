-- Fix: registration fees paid but never invoiced, stranded service requests,
-- plus review reports. Written 2026-11-15.
--
-- DRY RUN (default, always rolls back):
--     bash ~/pq.sh -f fix_regfee_and_stranded_2026-11-15.sql
-- APPLY (after taking a pg_dump backup and reading the dry-run output):
--     bash ~/pq.sh -v commit=1 -f fix_regfee_and_stranded_2026-11-15.sql
--
-- What it CHANGES:
--   1. Adds the missing REGISTRATION_FEE invoice (DEBIT) for clients whose fee was
--      entered as an admin "backdated" payment, dated to the payment date.
--      Excludes test accounts CL-05451 / CL-05480 and anyone who already has a
--      registration debit or a registration overdue invoice.
--   2. Relinks stranded service requests to the client's single surviving booking.
-- What it only REPORTS (no changes): the 8 ambiguous clients, the 2 double-count
-- clients, the stand-alone transport quotes, the missing service days.
-- Invoice PDF documents (client_reg_fee_invoices) are NOT created here — SQL cannot
-- generate PDFs; do that later with a Node script.

\set ON_ERROR_STOP on
\if :{?commit}
\else
  \set commit 0
\endif

BEGIN;

\echo '=== 1. Registration invoice (debit) for admin-backdated fees ==='
CREATE TEMP TABLE fix1 AS
SELECT t.client_id, cp.client_code, SUM(t.amount) AS amount, MIN(t.created_at) AS paid_at
FROM transactions t
JOIN client_profiles cp ON cp.client_profile_id = t.client_id
WHERE t.category::text = 'REGISTRATION_FEE'
  AND t.transaction_type = 'CREDIT'
  AND t.notes ILIKE '%backdated%'
  AND cp.client_code NOT IN ('CL-05451', 'CL-05480')
  AND NOT EXISTS (SELECT 1 FROM transactions d
                  WHERE d.client_id = t.client_id AND d.category::text = 'REGISTRATION_FEE'
                    AND d.transaction_type = 'DEBIT')
  AND NOT EXISTS (SELECT 1 FROM overdue_invoices o
                  WHERE o.client_id = t.client_id AND o.source_type = 'REGISTRATION_FEE')
GROUP BY t.client_id, cp.client_code;

SELECT COUNT(*) AS clients_to_fix, SUM(amount) AS total_debit_to_add FROM fix1;

INSERT INTO transactions (client_id, category, amount, transaction_type, status, notes, created_at)
SELECT client_id, 'REGISTRATION_FEE', amount, 'DEBIT', 'COMPLETED',
       'Registration fee invoiced (backfilled 2026-11-15)', paid_at
FROM fix1;

\echo '=== 2. Stranded service requests: relink to the client''s only booking ==='
CREATE TEMP TABLE fix2 AS
SELECT sr.request_id, sr.service_request_code, cp.client_code, b.booking_id, b.booking_code
FROM service_requests sr
JOIN client_profiles cp ON cp.client_profile_id = sr.client_id
JOIN bookings b ON b.client_id = sr.client_id
WHERE sr.status = 'BOOKING_CREATED'
  AND NOT EXISTS (SELECT 1 FROM bookings x WHERE x.request_id = sr.request_id)
  AND b.request_id IS NULL
  AND (SELECT COUNT(*) FROM bookings y WHERE y.client_id = sr.client_id) = 1;

SELECT * FROM fix2 ORDER BY service_request_code;

UPDATE bookings b SET request_id = f.request_id
FROM fix2 f WHERE b.booking_id = f.booking_id AND b.request_id IS NULL;

\echo '--- Stranded requests NOT relinked (client has 0 or 2+ bookings, or booking already linked) ---'
SELECT sr.service_request_code, cp.client_code, cp.full_name,
       (SELECT COUNT(*) FROM bookings b WHERE b.client_id = sr.client_id) AS client_bookings
FROM service_requests sr JOIN client_profiles cp ON cp.client_profile_id = sr.client_id
WHERE sr.status = 'BOOKING_CREATED'
  AND NOT EXISTS (SELECT 1 FROM bookings x WHERE x.request_id = sr.request_id)
ORDER BY 1;

\echo '=== REPORT A: the 8 ambiguous clients (review, no changes) ==='
SELECT cp.client_code, cp.full_name, cp.reg_fee_status, cp.reg_fee_amount,
       (SELECT SUM(amount) FROM transactions t WHERE t.client_id = cp.client_profile_id
          AND t.category::text = 'REGISTRATION_FEE' AND t.transaction_type = 'CREDIT') AS fee_credit,
       (SELECT string_agg(DISTINCT COALESCE(t.payment_method::text, '-'), ',') FROM transactions t
          WHERE t.client_id = cp.client_profile_id AND t.category::text = 'REGISTRATION_FEE') AS pay_method,
       (SELECT COUNT(*) FROM client_reg_fee_invoices i WHERE i.client_id = cp.client_profile_id) AS inv_docs,
       (SELECT string_agg(b.booking_code || '/' || b.status, ', ') FROM bookings b
          WHERE b.client_id = cp.client_profile_id) AS bookings
FROM client_profiles cp
WHERE cp.client_code IN ('CL-04490','CL-05599','CL-05633','CL-05663','CL-05666','CL-05673','CL-05705','CL-05725')
ORDER BY 1;

\echo '=== REPORT B: double-counted registration fee (debit + overdue invoice) ==='
SELECT cp.client_code, 'ledger debit' AS src, t.transaction_code AS ref, t.amount, t.created_at::date AS dt, t.notes AS info
FROM client_profiles cp JOIN transactions t ON t.client_id = cp.client_profile_id
WHERE cp.client_code IN ('CL-05733','CL-05738') AND t.category::text = 'REGISTRATION_FEE' AND t.transaction_type = 'DEBIT'
UNION ALL
SELECT cp.client_code, 'overdue_invoices', o.invoice_code, o.amount, o.created_at::date, o.status::text
FROM client_profiles cp JOIN overdue_invoices o ON o.client_id = cp.client_profile_id
WHERE cp.client_code IN ('CL-05733','CL-05738') AND o.source_type = 'REGISTRATION_FEE'
ORDER BY 1, 2;

\echo '=== REPORT C: stand-alone transport quotes with no ledger entry ==='
SELECT cp.client_code, q.estimate_number, q.status, q.total_amount, q.created_at::date,
       (SELECT string_agg(description, ', ') FROM quote_line_items l WHERE l.quote_id = q.quote_id) AS items,
       (SELECT COUNT(*) FROM bookings b WHERE b.client_id = q.client_id) AS client_bookings
FROM quotations q JOIN client_profiles cp ON cp.client_profile_id = q.client_id
WHERE q.quote_type = 'PRODUCT' AND q.booking_id IS NULL AND q.request_id IS NULL
  AND NOT EXISTS (SELECT 1 FROM transactions t WHERE t.quote_id = q.quote_id)
  AND EXISTS (SELECT 1 FROM quote_line_items l WHERE l.quote_id = q.quote_id AND l.description ILIKE '%transport%')
ORDER BY q.created_at;

\echo '=== REPORT D: live-in service days with no invoice (paused days excluded) ==='
WITH b AS (
  SELECT bk.booking_id, bk.booking_code, bk.status, bk.start_date, bk.daily_rate, cp.client_code,
         (SELECT MAX(service_date) FROM booking_daily_invoices d WHERE d.booking_id = bk.booking_id) AS last_d
  FROM bookings bk JOIN client_profiles cp ON cp.client_profile_id = bk.client_id
  WHERE bk.service_model = 'LIVE_IN' AND bk.start_date IS NOT NULL)
SELECT b.client_code, b.booking_code, b.status, g::date AS missing_day, b.daily_rate,
       EXISTS (SELECT 1 FROM staff_daily_attendance a WHERE a.booking_id = b.booking_id AND a.service_date = g::date) AS has_attendance
FROM b, generate_series(b.start_date, b.last_d, interval '1 day') g
WHERE b.last_d IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM booking_daily_invoices d WHERE d.booking_id = b.booking_id AND d.service_date = g::date)
  AND NOT EXISTS (SELECT 1 FROM booking_pauses p WHERE p.booking_id = b.booking_id
                  AND g::date >= p.paused_date AND g::date < COALESCE(p.resumed_date, p.resume_date, '9999-12-31'::date))
ORDER BY b.client_code, missing_day;

\echo '=== Verification: registration credit with no debit left (admin backdated) ==='
SELECT COUNT(*) AS still_unfixed FROM transactions t JOIN client_profiles cp ON cp.client_profile_id = t.client_id
WHERE t.category::text = 'REGISTRATION_FEE' AND t.transaction_type = 'CREDIT' AND t.notes ILIKE '%backdated%'
  AND cp.client_code NOT IN ('CL-05451','CL-05480')
  AND NOT EXISTS (SELECT 1 FROM transactions d WHERE d.client_id = t.client_id
                  AND d.category::text = 'REGISTRATION_FEE' AND d.transaction_type = 'DEBIT')
  AND NOT EXISTS (SELECT 1 FROM overdue_invoices o WHERE o.client_id = t.client_id AND o.source_type = 'REGISTRATION_FEE');

\if :commit
  \echo '>>> COMMITTING'
  COMMIT;
\else
  \echo '>>> DRY RUN — ROLLING BACK (re-run with -v commit=1 to apply)'
  ROLLBACK;
\endif
