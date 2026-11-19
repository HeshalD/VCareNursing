-- Fix: every client who has paid the system anything must have a registration-fee
-- INVOICE (REGISTRATION_FEE DEBIT in the ledger). Written 2026-11-19.
--
-- DRY RUN (default, always rolls back):
--     bash ~/pq.sh -f fix_regfee_invoicing_2026-11-19.sql
-- APPLY (after a pg_dump backup and reading the dry-run output):
--     bash ~/pq.sh -v commit=1 -f fix_regfee_invoicing_2026-11-19.sql
--
-- CHANGES (ledger debits only, tagged 'backfilled 2026-11-19'):
--   A1  client paid for services but the fee was never invoiced and never paid
--       -> DEBIT of reg_fee_amount dated NOW. No wallet draw, status stays PENDING,
--          the fee simply shows as an outstanding invoice.
--   B   fee already PAID (CREDIT exists) but no DEBIT
--       -> DEBIT equal to the credit, dated to the first credit (same as the 11-15 fix).
--
-- NOT TOUCHED (need a human decision; listed in the reports at the end):
--   A2 PAID with no payment trail, A3 PDF only, CL-05607 partial payment,
--   CL-05739 double payment, PDF documents (done afterwards by a Node script).
-- Excludes test accounts CL-05451 / CL-05480 and anyone WAIVED.

\set ON_ERROR_STOP on
\if :{?commit}
\else
  \set commit 0
\endif

BEGIN;

CREATE TEMP TABLE payers AS
SELECT cp.client_profile_id AS client_id, cp.client_code, cp.full_name, cp.reg_fee_status,
       cp.reg_fee_amount
FROM client_profiles cp
WHERE cp.client_code NOT IN ('CL-05451', 'CL-05480')
  AND cp.reg_fee_status <> 'WAIVED'
  AND EXISTS (SELECT 1 FROM transactions t
              WHERE t.client_id = cp.client_profile_id AND t.transaction_type = 'CREDIT'
                AND t.category::text IN ('BOOKING_PAYMENT','REGISTRATION_FEE','WALLET_TOPUP','PRODUCT_SALE'))
  AND NOT EXISTS (SELECT 1 FROM transactions d
                  WHERE d.client_id = cp.client_profile_id
                    AND d.category::text = 'REGISTRATION_FEE' AND d.transaction_type = 'DEBIT')
  AND NOT EXISTS (SELECT 1 FROM overdue_invoices o
                  WHERE o.client_id = cp.client_profile_id AND o.source_type = 'REGISTRATION_FEE');

\echo '=== A1: never invoiced, fee never paid -> new unpaid debit ==='
CREATE TEMP TABLE fixa AS
SELECT p.* FROM payers p
WHERE p.reg_fee_status = 'PENDING'
  AND NOT EXISTS (SELECT 1 FROM transactions c WHERE c.client_id = p.client_id
                  AND c.category::text = 'REGISTRATION_FEE')
  AND NOT EXISTS (SELECT 1 FROM client_reg_fee_invoices i WHERE i.client_id = p.client_id);
SELECT COUNT(*) AS clients, SUM(reg_fee_amount) AS total_debit FROM fixa;

INSERT INTO transactions (client_id, category, amount, transaction_type, status, notes, created_at)
SELECT client_id, 'REGISTRATION_FEE', reg_fee_amount, 'DEBIT', 'COMPLETED',
       'Registration fee invoiced (backfilled 2026-11-19)', NOW()
FROM fixa;

\echo '=== B: fee paid but never invoiced -> debit equal to the credit, dated to payment ==='
CREATE TEMP TABLE fixb AS
SELECT p.client_id, p.client_code, SUM(t.amount) AS amount, MIN(t.created_at) AS paid_at
FROM payers p
JOIN transactions t ON t.client_id = p.client_id
 AND t.category::text = 'REGISTRATION_FEE' AND t.transaction_type = 'CREDIT'
WHERE p.client_id NOT IN (SELECT client_id FROM fixa)
  AND p.client_code <> 'CL-05739'                    -- double payment: needs a decision
  AND p.reg_fee_status = 'PAID'
GROUP BY p.client_id, p.client_code
HAVING SUM(t.amount) = MAX(p.reg_fee_amount);        -- only exact-fee payments
SELECT COUNT(*) AS clients, SUM(amount) AS total_debit FROM fixb;

INSERT INTO transactions (client_id, category, amount, transaction_type, status, notes, created_at)
SELECT client_id, 'REGISTRATION_FEE', amount, 'DEBIT', 'COMPLETED',
       'Registration fee invoiced (backfilled 2026-11-19)', paid_at
FROM fixb;

\echo '=== Debits written ==='
SELECT cp.client_code, t.amount, t.created_at::date AS dated
FROM transactions t JOIN client_profiles cp ON cp.client_profile_id = t.client_id
WHERE t.notes = 'Registration fee invoiced (backfilled 2026-11-19)'
ORDER BY t.created_at, cp.client_code;

\echo '=== REPORT: payers still without a debit after this run (need a decision) ==='
SELECT p.client_code, p.full_name, p.reg_fee_status, p.reg_fee_amount,
       (SELECT COALESCE(SUM(amount),0) FROM transactions c WHERE c.client_id = p.client_id
          AND c.category::text='REGISTRATION_FEE' AND c.transaction_type='CREDIT') AS fee_credit,
       (SELECT COUNT(*) FROM client_reg_fee_invoices i WHERE i.client_id = p.client_id) AS pdfs
FROM payers p
WHERE p.client_id NOT IN (SELECT client_id FROM fixa)
  AND p.client_id NOT IN (SELECT client_id FROM fixb)
ORDER BY p.client_code;

\echo '=== REPORT: payers with a debit but a different amount than credit (need a decision) ==='
SELECT cp.client_code, cp.reg_fee_status,
       SUM(t.amount) FILTER (WHERE t.transaction_type='DEBIT')  AS debit,
       SUM(t.amount) FILTER (WHERE t.transaction_type='CREDIT') AS credit
FROM transactions t JOIN client_profiles cp ON cp.client_profile_id = t.client_id
WHERE t.category::text='REGISTRATION_FEE' AND cp.client_code NOT IN ('CL-05451','CL-05480')
GROUP BY cp.client_code, cp.reg_fee_status
HAVING SUM(t.amount) FILTER (WHERE t.transaction_type='CREDIT') IS NOT NULL
   AND COALESCE(SUM(t.amount) FILTER (WHERE t.transaction_type='DEBIT'),0)
       <> SUM(t.amount) FILTER (WHERE t.transaction_type='CREDIT');

\if :commit
  \echo '*** COMMIT ***'
  COMMIT;
\else
  \echo '*** DRY RUN: rolled back, nothing saved ***'
  ROLLBACK;
\endif
