// services/registrationFeeIntegrity.js
//
// Read-only checks that find clients whose registration fee is not in order. Used by
// scripts/regFeeIntegrity.js (command-line report) and GET /api/client/reg-fee-integrity
// (admin list). Test accounts CL-05451 / CL-05480 are ignored.
//
// "Paying" = any client-side credit that is money in: booking payment, wallet top-up,
// registration fee or product sale. "Booked" = has at least one booking.

const db = require('../config/db');

const TEST = `('CL-05451', 'CL-05480')`;
const PAYING = `EXISTS (SELECT 1 FROM transactions p WHERE p.client_id = cp.client_profile_id
                 AND p.transaction_type = 'CREDIT'
                 AND p.category::text IN ('BOOKING_PAYMENT','WALLET_TOPUP','REGISTRATION_FEE','PRODUCT_SALE'))`;
const BOOKED = `EXISTS (SELECT 1 FROM bookings b WHERE b.client_id = cp.client_profile_id)`;
const REG = (type) => `EXISTS (SELECT 1 FROM transactions r WHERE r.client_id = cp.client_profile_id
                          AND r.category::text = 'REGISTRATION_FEE' AND r.transaction_type = '${type}')`;
const OD = `EXISTS (SELECT 1 FROM overdue_invoices o WHERE o.client_id = cp.client_profile_id AND o.source_type = 'REGISTRATION_FEE')`;
const PDF = `EXISTS (SELECT 1 FROM client_reg_fee_invoices i WHERE i.client_id = cp.client_profile_id)`;

const CHECKS = [
  {
    code: 'NO_REGISTRATION_INVOICE',
    label: 'Has paid the system, but the registration fee was never invoiced',
    severity: 'high',
    where: `cp.reg_fee_status IN ('PENDING','INVOICED','EXPIRED') AND ${PAYING} AND NOT ${REG('DEBIT')} AND NOT ${OD}`,
  },
  {
    code: 'BOOKED_NOT_INVOICED',
    label: 'Has a booking but no payment recorded, and the registration fee was never invoiced',
    severity: 'medium',
    where: `cp.reg_fee_status IN ('PENDING','INVOICED','EXPIRED') AND ${BOOKED} AND NOT ${PAYING} AND NOT ${REG('DEBIT')} AND NOT ${OD}`,
  },
  {
    code: 'PAID_NO_PAYMENT',
    label: 'Marked PAID but no registration payment is recorded',
    severity: 'high',
    where: `cp.reg_fee_status = 'PAID' AND NOT ${REG('CREDIT')} AND NOT cp.reg_fee_pre_system
            AND NOT (cp.import_batch_id IS NOT NULL AND cp.reg_fee_paid_at < cp.created_at)`,
  },
  {
    code: 'PAYMENT_NO_INVOICE',
    label: 'A registration payment exists but the fee was never invoiced',
    severity: 'high',
    where: `${REG('CREDIT')} AND NOT ${REG('DEBIT')} AND NOT ${OD}`,
  },
  {
    code: 'DUPLICATE_INVOICE',
    label: 'More than one registration charge',
    severity: 'high',
    where: `(SELECT COUNT(*) FROM transactions r WHERE r.client_id = cp.client_profile_id
              AND r.category::text = 'REGISTRATION_FEE' AND r.transaction_type = 'DEBIT') > 1
            AND cp.reg_fee_status <> 'EXPIRED'`,
  },
  {
    code: 'AMOUNT_MISMATCH',
    label: 'Registration payments do not equal the registration charge',
    severity: 'medium',
    where: `${REG('DEBIT')} AND ${REG('CREDIT')} AND
            (SELECT COALESCE(SUM(amount),0) FROM transactions r WHERE r.client_id = cp.client_profile_id
               AND r.category::text = 'REGISTRATION_FEE' AND r.transaction_type = 'DEBIT')
            <> (SELECT COALESCE(SUM(amount),0) FROM transactions r WHERE r.client_id = cp.client_profile_id
               AND r.category::text = 'REGISTRATION_FEE' AND r.transaction_type = 'CREDIT')`,
  },
  {
    code: 'PAID_NO_EXPIRY',
    label: 'Marked PAID or WAIVED with no expiry date',
    severity: 'medium',
    where: `cp.reg_fee_status IN ('PAID','WAIVED') AND cp.reg_fee_expires_at IS NULL`,
  },
  {
    code: 'OVERDUE_BUT_PAID',
    label: 'An open registration overdue invoice remains although the fee is PAID',
    severity: 'medium',
    where: `cp.reg_fee_status = 'PAID' AND EXISTS (SELECT 1 FROM overdue_invoices o
              WHERE o.client_id = cp.client_profile_id AND o.source_type = 'REGISTRATION_FEE' AND o.status = 'OVERDUE')`,
  },
  {
    code: 'CHARGED_NO_DOCUMENT',
    label: 'Registration charged but no invoice document exists',
    severity: 'low',
    where: `${REG('DEBIT')} AND NOT ${PDF}`,
  },
];

async function runChecks({ limitPerCheck = 500 } = {}) {
  const results = [];
  for (const c of CHECKS) {
    const res = await db.query(
      `SELECT cp.client_profile_id, cp.client_code, cp.full_name, cp.reg_fee_status AS status, cp.reg_fee_amount AS fee,
              (cp.import_batch_id IS NOT NULL) AS imported
       FROM client_profiles cp
       WHERE cp.client_code NOT IN ${TEST} AND ${c.where}
       ORDER BY cp.client_code LIMIT ${Number(limitPerCheck)}`
    );
    const count = await db.query(
      `SELECT COUNT(*)::int AS n FROM client_profiles cp WHERE cp.client_code NOT IN ${TEST} AND ${c.where}`
    );
    results.push({ code: c.code, label: c.label, severity: c.severity, count: count.rows[0].n, clients: res.rows });
  }
  return results;
}

module.exports = { runChecks, CHECKS, TEST_CLIENTS_SQL: TEST };
