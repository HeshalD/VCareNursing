// services/ledgerHealth.js
// A read-only audit of the books. It never changes money, invoices or bookings. It looks for
// the kinds of drift that have hurt before (a charge on a quotation that nobody invoiced, an
// invoice with no ledger charge, a booking billing Rs. 0 a day, client totals that do not add
// up) and records each problem so it can be seen, acknowledged with a note, and tracked until it
// is gone.
//
// The rule behind most checks: every charge taken from a client through a quotation must end up
// as an invoice. Care and shift rates are the exception; the nightly job invoices them day by day.
//
// Each check returns rows of
//   { entity_type, entity_id, entity_label, client_id, booking_id, amount, detail, severity? }
// A check's own `severity` is the default; a row may override it.

const db = require('../config/db');
const { getClientFinancialBreakdown, BREAKDOWN_METRICS } = require('./clientFinancialBreakdown');
const { bookingChargeSql, bookingSettledSql, unbookedDueInvoiceSql, invoiceUnpaidSql } = require('./clientFinancials');

// Free-form custom charges were removed from the quotation builders on this date. A custom charge
// line created on or after it means something bypassed the screens.
const CUSTOM_CHARGES_REMOVED_ON = '2026-11-20';
const OLD_UNPAID_DAYS = 30;
const CHARGEABLE = `('PRODUCT', 'RENTAL_ONE_TIME', 'RENTAL_RECURRING')`;
const LIVE_STATUSES = `('ACTIVE', 'OVERDUE', 'PAUSED', 'COMPLETED')`;

const rs = (n) => `Rs. ${Number(n || 0).toLocaleString('en-LK', { maximumFractionDigits: 2 })}`;

// What a booking owes right now, by the same rule as the client's overdue amount.
const bookingOwedSql = (b = 'b') => `(
  SELECT COALESCE(SUM(t.amount) FILTER (WHERE ${bookingChargeSql('t')}), 0)
       - COALESCE(SUM(t.amount) FILTER (WHERE ${bookingSettledSql('t')}), 0)
  FROM transactions t WHERE t.booking_id = ${b}.booking_id
)`;

const q = async (sql, params = []) => (await db.query(sql, params)).rows;

// Where an admin goes to look at a finding. These are the app's real routes.
const clientPath = (id) => (id ? `/admin/users/${id}/detail` : null);
const bookingPath = (id) => (id ? `/admin/bookings/${id}/detail` : null);
const quotePath = (id) => (id ? `/admin/quotations/${id}` : null);
const BREAKDOWN_PATH = { 'payments-made': 'payments-made', 'total-invoiced': 'total-invoiced', overdue: 'overdue-amount', wallet: 'wallet-balance' };

// ─── Checks ──────────────────────────────────────────────────────────────────

const CHECKS = [
  // ── Invoices must be on the ledger ─────────────────────────────────────────
  {
    key: 'invoice_without_charge', group: 'Invoices', severity: 'ERROR',
    title: 'Invoice missing from the client’s ledger',
    help: 'A product or rental invoice has no charge on the client’s ledger, so it is missing from Total Invoiced and statements.',
    run: async () => (await q(`
      SELECT i.invoice_id AS id, i.invoice_code AS label, i.client_id, i.booking_id, i.amount, i.category
      FROM invoices i
      WHERE i.category IN ${CHARGEABLE} AND i.client_id IS NOT NULL AND i.charge_transaction_id IS NULL`))
      .map((r) => ({ entity_type: 'INVOICE', entity_id: r.id, entity_label: r.label, client_id: r.client_id, booking_id: r.booking_id, amount: r.amount, link_path: clientPath(r.client_id),
        detail: `${r.category} invoice ${r.label} for ${rs(r.amount)} has no charge on the client's ledger.` })),
  },
  {
    key: 'invoice_charge_mismatch', group: 'Invoices', severity: 'ERROR',
    title: 'Invoice and its ledger charge disagree',
    help: 'The invoice amount, client or booking differs from the charge it posted to the ledger.',
    run: async () => (await q(`
      SELECT i.invoice_id AS id, i.invoice_code AS label, i.client_id, i.booking_id, i.amount, t.amount AS charge,
             t.booking_id AS charge_booking, t.client_id AS charge_client
      FROM invoices i JOIN transactions t ON t.transaction_id = i.charge_transaction_id
      WHERE abs(i.amount - t.amount) > 0.005 OR t.booking_id IS DISTINCT FROM i.booking_id OR t.client_id IS DISTINCT FROM i.client_id`))
      .map((r) => ({ entity_type: 'INVOICE', entity_id: r.id, entity_label: r.label, client_id: r.client_id, booking_id: r.booking_id, amount: r.amount, link_path: clientPath(r.client_id),
        detail: Math.abs(r.amount - r.charge) > 0.005
          ? `Invoice ${r.label} is ${rs(r.amount)} but its ledger charge is ${rs(r.charge)}.`
          : `Invoice ${r.label} and its ledger charge point to a different ${r.charge_client !== r.client_id ? 'client' : 'booking'}.` })),
  },
  {
    key: 'orphan_charge', group: 'Invoices', severity: 'ERROR',
    title: 'Ledger charge with no invoice',
    help: 'A product-invoice charge exists on the ledger but no invoice points to it, so Total Invoiced counts money nobody was invoiced for.',
    run: async () => (await q(`
      SELECT t.transaction_id AS id, t.client_id, t.booking_id, t.amount, t.notes
      FROM transactions t
      WHERE t.category::text = 'PRODUCT_INVOICE'
        AND NOT EXISTS (SELECT 1 FROM invoices i WHERE i.charge_transaction_id = t.transaction_id)`))
      .map((r) => ({ entity_type: 'TRANSACTION', entity_id: r.id, entity_label: (r.notes || '').slice(0, 60) || 'Charge', client_id: r.client_id, booking_id: r.booking_id, amount: r.amount, link_path: clientPath(r.client_id),
        detail: `A ${rs(r.amount)} product-invoice charge has no invoice.` })),
  },
  {
    key: 'paid_without_payment', group: 'Invoices', severity: 'WARNING',
    title: 'Invoice marked Paid with no payment behind it',
    help: 'The invoice shows Paid, but no payment was recorded on it, none was allocated to its quotation line, and its booking is not in credit.',
    run: async () => (await q(`
      SELECT i.invoice_id AS id, i.invoice_code AS label, i.client_id, i.booking_id, i.amount
      FROM invoices i
      WHERE i.category IN ${CHARGEABLE} AND i.status = 'PAID' AND i.amount > 0
        AND NOT EXISTS (SELECT 1 FROM invoice_payments ip WHERE ip.invoice_id = i.invoice_id)
        AND NOT EXISTS (SELECT 1 FROM quote_line_item_payments a JOIN quote_line_items li ON li.line_item_id = a.line_item_id
                        WHERE li.quote_id = i.quote_id)
        AND NOT (i.booking_id IS NOT NULL AND (SELECT ${bookingOwedSql('bk')} FROM bookings bk WHERE bk.booking_id = i.booking_id) <= 0.005)`))
      .map((r) => ({ entity_type: 'INVOICE', entity_id: r.id, entity_label: r.label, client_id: r.client_id, booking_id: r.booking_id, amount: r.amount, link_path: clientPath(r.client_id),
        detail: `Invoice ${r.label} (${rs(r.amount)}) is marked Paid but no payment is recorded against it.` })),
  },
  {
    key: 'old_unpaid_invoice', group: 'Invoices', severity: 'WARNING',
    title: `Product invoice unpaid for over ${OLD_UNPAID_DAYS} days`,
    help: 'A product invoice has been sitting unpaid. It is counted in the client’s overdue amount.',
    run: async () => (await q(`
      SELECT i.invoice_id AS id, i.invoice_code AS label, i.client_id, i.booking_id, ${invoiceUnpaidSql('i')} AS owing,
             (CURRENT_DATE - i.created_at::date) AS age
      FROM invoices i
      WHERE i.category = 'PRODUCT' AND i.status <> 'PAID' AND ${invoiceUnpaidSql('i')} > 0.005
        AND i.created_at < NOW() - INTERVAL '${OLD_UNPAID_DAYS} days'`))
      .map((r) => ({ entity_type: 'INVOICE', entity_id: r.id, entity_label: r.label, client_id: r.client_id, booking_id: r.booking_id, amount: r.owing, link_path: clientPath(r.client_id),
        detail: `${rs(r.owing)} on invoice ${r.label} has been unpaid for ${r.age} days.` })),
  },

  // ── Every quotation charge must become an invoice ──────────────────────────
  {
    key: 'products_not_invoiced', group: 'Quotation charges', severity: 'ERROR',
    title: 'Products on a quotation were never invoiced',
    help: 'The client has a booking or has paid on the quotation, but its products (for example transport) were never accepted and invoiced.',
    run: async () => (await q(`
      SELECT pq.quote_id AS id, pq.estimate_number AS label, sq.quote_id AS service_quote_id, sq.estimate_number AS service_est, pq.total_amount AS amount,
             COALESCE(pq.client_id, sr.client_id) AS client_id,
             (SELECT b.booking_id FROM bookings b WHERE b.booking_id = sq.booking_id OR b.request_id = sq.request_id ORDER BY b.created_at DESC LIMIT 1) AS booking_id
      FROM quotations pq
      JOIN quotations sq ON sq.quote_id = pq.linked_quote_id AND sq.quote_type = 'SERVICE'
      LEFT JOIN service_requests sr ON sr.request_id = sq.request_id
      WHERE pq.quote_type = 'PRODUCT' AND COALESCE(pq.status, '') <> 'REJECTED'
        AND EXISTS (SELECT 1 FROM quote_line_items li WHERE li.quote_id = pq.quote_id)
        AND (EXISTS (SELECT 1 FROM bookings b WHERE b.booking_id = sq.booking_id OR b.request_id = sq.request_id)
             OR EXISTS (SELECT 1 FROM payment_tracking p WHERE p.quote_id = sq.quote_id AND p.status = 'VERIFIED'))
        AND NOT EXISTS (SELECT 1 FROM invoices i WHERE i.quote_id = pq.quote_id AND i.category <> 'LINE_ITEM')
        AND NOT EXISTS (SELECT 1 FROM rental_agreements ra WHERE ra.quote_id = pq.quote_id)`))
      .map((r) => ({ entity_type: 'QUOTATION', entity_id: r.id, entity_label: `${r.label} (for ${r.service_est})`, client_id: r.client_id, booking_id: r.booking_id, amount: r.amount, link_path: quotePath(r.service_quote_id),
        detail: `Products worth ${rs(r.amount)} on ${r.label}, quoted with ${r.service_est}, have no invoice although the client is booked or has paid.` })),
  },
  {
    key: 'custom_charge_line', group: 'Quotation charges', severity: 'WARNING',
    title: 'Free-form custom charge on a quotation',
    help: 'Custom charges are no longer allowed. An old one is not invoiced anywhere unless it is transport on a quotation that becomes a booking. A new one means something bypassed the screens.',
    run: async () => (await q(`
      SELECT li.line_item_id AS id, qt.quote_id AS quote_id, qt.estimate_number AS est, li.description, li.amount, li.created_at,
             COALESCE(sr.client_id, qt.client_id) AS client_id,
             (SELECT b.booking_id FROM bookings b WHERE b.booking_id = qt.booking_id OR b.request_id = qt.request_id ORDER BY b.created_at DESC LIMIT 1) AS booking_id,
             (li.description ILIKE '%trans%' OR li.description ILIKE '%trasport%') AS is_transport
      FROM quote_line_items li
      JOIN quotations qt ON qt.quote_id = li.quote_id AND qt.quote_type = 'SERVICE'
      LEFT JOIN service_requests sr ON sr.request_id = qt.request_id
      WHERE li.item_type = 'CHARGE' AND li.is_registration_fee = false AND li.item_subtype IS NULL
        -- A rejected quotation, or one replaced by a newer quotation and never booked, can never be paid.
        AND COALESCE(qt.status, '') <> 'REJECTED'
        AND (qt.booking_id IS NOT NULL OR sr.active_quote_id = qt.quote_id)`))
      .map((r) => {
        const isNew = new Date(r.created_at) >= new Date(CUSTOM_CHARGES_REMOVED_ON);
        const note = r.is_transport
          ? (r.booking_id ? 'Its quotation already has a booking, so this transport was not converted into an invoice.' : 'It will be invoiced as a transport product when its quotation becomes a booking.')
          : 'It is not transport, so nothing will ever invoice it. Move it to a product or remove it.';
        return {
          entity_type: 'QUOTE_LINE', entity_id: r.id, entity_label: `${r.est} · ${r.description}`, client_id: r.client_id, booking_id: r.booking_id, amount: r.amount, link_path: quotePath(r.quote_id),
          severity: isNew ? 'ERROR' : 'WARNING',
          detail: `"${r.description}" (${rs(r.amount)}) on ${r.est}${isNew ? ' was added after custom charges were removed.' : ' is an old custom charge.'} ${note}`,
        };
      }),
  },
  {
    key: 'reg_fee_not_invoiced', group: 'Quotation charges', severity: 'WARNING',
    title: 'Registration fee paid but not invoiced',
    help: 'A payment was recorded on a quotation with a registration fee, but the client has no registration-fee invoice for it.',
    run: async () => (await q(`
      SELECT sq.quote_id AS id, sq.estimate_number AS label, sr.client_id, li.amount
      FROM quotations sq
      JOIN service_requests sr ON sr.request_id = sq.request_id
      JOIN quote_line_items li ON li.quote_id = sq.quote_id AND li.is_registration_fee = true AND li.amount > 0
      WHERE sq.quote_type = 'SERVICE' AND sr.client_id IS NOT NULL
        AND EXISTS (SELECT 1 FROM payment_tracking p WHERE p.quote_id = sq.quote_id AND p.status = 'VERIFIED')
        AND NOT EXISTS (SELECT 1 FROM client_reg_fee_invoices c WHERE c.client_id = sr.client_id)
        AND NOT EXISTS (SELECT 1 FROM overdue_invoices o WHERE o.client_id = sr.client_id AND o.source_type = 'REGISTRATION_FEE')
        AND NOT EXISTS (SELECT 1 FROM transactions t WHERE t.client_id = sr.client_id AND t.category::text = 'REGISTRATION_FEE' AND t.transaction_type = 'DEBIT')`))
      .map((r) => ({ entity_type: 'QUOTATION', entity_id: r.id, entity_label: r.label, client_id: r.client_id, amount: r.amount, link_path: quotePath(r.id),
        detail: `Quotation ${r.label} has a ${rs(r.amount)} registration fee and a recorded payment, but the client has no registration-fee invoice.` })),
  },

  // ── Care and shift billing ─────────────────────────────────────────────────
  {
    key: 'booking_zero_rate', group: 'Care billing', severity: 'ERROR',
    title: 'Booking is billing Rs. 0',
    help: 'A running booking has no daily or shift rate, so every day is billed at nothing while staff are still paid.',
    run: async () => (await q(`
      SELECT b.booking_id AS id, b.booking_code AS label, b.client_id, b.status, b.service_model,
             (SELECT count(*)::int FROM booking_daily_invoices d WHERE d.booking_id = b.booking_id AND d.status = 'INVOICED') AS billed_days,
             (SELECT count(*)::int FROM booking_daily_invoices d WHERE d.booking_id = b.booking_id AND d.status = 'INVOICED' AND COALESCE(d.amount, 0) = 0) AS zero_days
      FROM bookings b
      WHERE b.status IN ${LIVE_STATUSES}
        AND ((b.service_model IN ('LIVE_IN', 'VISITING') AND COALESCE(b.daily_rate, 0) = 0)
          OR (b.service_model = 'SHIFT_BASED' AND COALESCE(b.shift_rate, 0) = 0 AND COALESCE(b.daily_rate, 0) = 0))
        AND (b.status IN ('ACTIVE', 'OVERDUE', 'PAUSED')
             OR EXISTS (SELECT 1 FROM booking_daily_invoices d WHERE d.booking_id = b.booking_id AND d.status = 'INVOICED'))`))
      .map((r) => ({ entity_type: 'BOOKING', entity_id: r.id, entity_label: r.label, client_id: r.client_id, booking_id: r.id, link_path: bookingPath(r.id),
        detail: `${r.label} (${r.status}) has no ${r.service_model === 'SHIFT_BASED' ? 'shift' : 'daily'} rate. ${r.billed_days} billed day${r.billed_days === 1 ? '' : 's'}, ${r.zero_days} of them at Rs. 0.` })),
  },
  {
    key: 'booking_rate_differs_from_quote', group: 'Care billing', severity: 'WARNING',
    title: 'Booking rate differs from the quoted rate',
    help: 'The rate the booking bills at is not the rate on its quotation. Fine if it was changed on purpose; acknowledge it with a note.',
    run: async () => (await q(`
      SELECT b.booking_id AS id, b.booking_code AS label, b.client_id, b.daily_rate, b.shift_rate,
             qt.estimate_number AS est, rl.item_subtype, rl.unit_price
      FROM bookings b
      JOIN quotations qt ON qt.booking_id = b.booking_id AND qt.quote_type = 'SERVICE'
      JOIN quote_line_items rl ON rl.quote_id = qt.quote_id AND rl.item_subtype IN ('RATE_DAILY', 'RATE_SHIFT')
      WHERE b.status IN ${LIVE_STATUSES}
        AND ((rl.item_subtype = 'RATE_DAILY' AND COALESCE(b.daily_rate, 0) > 0 AND abs(b.daily_rate - rl.unit_price) > 0.005)
          OR (rl.item_subtype = 'RATE_SHIFT' AND COALESCE(b.shift_rate, 0) > 0 AND abs(b.shift_rate - rl.unit_price) > 0.005))`))
      .map((r) => {
        const kind = r.item_subtype === 'RATE_SHIFT' ? 'shift' : 'daily';
        const booked = r.item_subtype === 'RATE_SHIFT' ? r.shift_rate : r.daily_rate;
        return { entity_type: 'BOOKING', entity_id: r.id, entity_label: r.label, client_id: r.client_id, booking_id: r.id, link_path: bookingPath(r.id),
          detail: `${r.label} bills a ${kind} rate of ${rs(booked)} but quotation ${r.est} says ${rs(r.unit_price)}.` };
      }),
  },
  {
    key: 'booking_status_mismatch', group: 'Care billing', severity: 'WARNING',
    title: 'Booking status does not match what it owes',
    help: 'The nightly job marks a booking overdue when it owes money. This booking’s status says otherwise.',
    run: async () => (await q(`
      SELECT b.booking_id AS id, b.booking_code AS label, b.client_id, b.status, ${bookingOwedSql('b')} AS owed
      FROM bookings b
      WHERE (b.status = 'ACTIVE' AND ${bookingOwedSql('b')} > 0.005)
         OR (b.status = 'OVERDUE' AND ${bookingOwedSql('b')} <= 0.005)`))
      .map((r) => ({ entity_type: 'BOOKING', entity_id: r.id, entity_label: r.label, client_id: r.client_id, booking_id: r.id, amount: Math.max(Number(r.owed), 0), link_path: bookingPath(r.id),
        detail: r.status === 'ACTIVE'
          ? `${r.label} is Active but owes ${rs(r.owed)}; it should be flagged overdue.`
          : `${r.label} is flagged Overdue but owes nothing (${rs(r.owed)}).` })),
  },
];

// ─── Client totals reconcile ─────────────────────────────────────────────────
// Reuses the drill-down pages: each headline figure (Payments Made, Total Invoiced, Overdue,
// Wallet) must equal the sum of the entries listed beneath it. A mismatch means money exists
// somewhere the headline does not see.
const BREAKDOWN_LABEL = { 'payments-made': 'Payments Made', 'total-invoiced': 'Total Invoiced', overdue: 'Overdue', wallet: 'Wallet' };

const clientBreakdownCheck = {
  key: 'client_totals_mismatch', group: 'Client totals', severity: 'ERROR',
  title: 'Client figure does not add up',
  help: 'A client’s headline figure differs from the sum of the entries behind it, or one of the page’s own cross-checks failed.',
  run: async () => {
    const clients = await q(`
      SELECT cp.client_profile_id AS id, COALESCE(NULLIF(cp.client_code, ''), '') AS code, cp.full_name
      FROM client_profiles cp
      WHERE EXISTS (SELECT 1 FROM transactions t WHERE t.client_id = cp.client_profile_id)
         OR EXISTS (SELECT 1 FROM bookings b WHERE b.client_id = cp.client_profile_id)
         OR EXISTS (SELECT 1 FROM invoices i WHERE i.client_id = cp.client_profile_id)`);
    const rows = [];
    const metrics = BREAKDOWN_METRICS.filter((m) => BREAKDOWN_LABEL[m]);
    for (let i = 0; i < clients.length; i += 5) {
      await Promise.all(clients.slice(i, i + 5).map(async (c) => {
        for (const metric of metrics) {
          try {
            const b = await getClientFinancialBreakdown(c.id, metric);
            const failed = (b.checks || []).filter((x) => x.ok === false);
            if (b.summary?.matches === false || failed.length) {
              const why = b.summary?.matches === false
                ? `${BREAKDOWN_LABEL[metric]} shows ${rs(b.summary.headline)} but the entries add up to ${rs(b.summary.derived)}.`
                : `${BREAKDOWN_LABEL[metric]} check failed: ${failed.map((x) => x.label).join('; ')}.`;
              // A headline that does not add up is an error. A failed cross-check (for example the
              // wallet audit trail after a manual database edit) is a warning to look at and acknowledge.
              rows.push({ entity_type: 'CLIENT', entity_id: `${c.id}:${metric}`, entity_label: `${c.code} ${c.full_name || ''}`.trim(), client_id: c.id, link_path: clientPath(c.id) && `/admin/users/${c.id}/${BREAKDOWN_PATH[metric]}`,
                severity: b.summary?.matches === false ? 'ERROR' : 'WARNING',
                amount: b.summary?.matches === false ? Math.abs(Number(b.summary.headline) - Number(b.summary.derived)) : null, detail: why });
            }
          } catch (err) {
            rows.push({ entity_type: 'CLIENT', entity_id: `${c.id}:${metric}`, entity_label: `${c.code} ${c.full_name || ''}`.trim(), client_id: c.id, link_path: `/admin/users/${c.id}/${BREAKDOWN_PATH[metric]}`,
              detail: `${BREAKDOWN_LABEL[metric]} could not be worked out: ${err.message}` });
          }
        }
      }));
    }
    return rows;
  },
};

const ALL_CHECKS = [...CHECKS, clientBreakdownCheck];

// ─── Running and recording ───────────────────────────────────────────────────

const ADVISORY_LOCK_KEY = 88442211;
const fingerprintOf = (checkKey, row) => `${checkKey}|${row.entity_type}|${row.entity_id}`;

/**
 * Runs every check and records the result. Read-only against the books; it only writes to its own
 * two tables. Returns the run summary. Throws if another run is in progress.
 */
async function runLedgerHealth({ trigger = 'CRON', triggeredBy = null } = {}) {
  const lock = await db.pool.connect();
  let runId = null;
  try {
    const got = (await lock.query('SELECT pg_try_advisory_lock($1) AS ok', [ADVISORY_LOCK_KEY])).rows[0].ok;
    if (!got) throw Object.assign(new Error('A ledger health run is already in progress'), { statusCode: 409 });

    const started = Date.now();
    runId = (await db.query(
      `INSERT INTO ledger_health_runs (trigger_source, triggered_by) VALUES ($1, $2) RETURNING run_id`, [trigger, triggeredBy]
    )).rows[0].run_id;

    const failedChecks = [];
    for (const check of ALL_CHECKS) {
      let rows;
      try {
        rows = await check.run();
      } catch (err) {
        // A check that could not run says nothing about its findings, so they are left as they were.
        failedChecks.push(`${check.key}: ${err.message}`);
        console.error(`[ledgerHealth] ${check.key} failed:`, err.message);
        continue;
      }

      const seen = [];
      for (const r of rows) {
        const fp = fingerprintOf(check.key, r);
        seen.push(fp);
        await db.query(
          `INSERT INTO ledger_health_findings
             (fingerprint, check_key, severity, entity_type, entity_id, entity_label, client_id, booking_id, amount, title, detail, link_path, first_seen_run, last_seen_run)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$13,$12,$12)
           ON CONFLICT (fingerprint) DO UPDATE SET
             severity = EXCLUDED.severity, entity_label = EXCLUDED.entity_label, client_id = EXCLUDED.client_id, booking_id = EXCLUDED.booking_id,
             amount = EXCLUDED.amount, title = EXCLUDED.title, detail = EXCLUDED.detail, link_path = EXCLUDED.link_path,
             last_seen_run = EXCLUDED.last_seen_run, last_seen_at = NOW(),
             -- A problem that comes back after being resolved is new again, and no longer acknowledged.
             first_seen_run = CASE WHEN ledger_health_findings.resolved_at IS NOT NULL THEN EXCLUDED.first_seen_run ELSE ledger_health_findings.first_seen_run END,
             first_seen_at  = CASE WHEN ledger_health_findings.resolved_at IS NOT NULL THEN NOW() ELSE ledger_health_findings.first_seen_at END,
             acknowledged_at = CASE WHEN ledger_health_findings.resolved_at IS NOT NULL THEN NULL ELSE ledger_health_findings.acknowledged_at END,
             acknowledged_by = CASE WHEN ledger_health_findings.resolved_at IS NOT NULL THEN NULL ELSE ledger_health_findings.acknowledged_by END,
             acknowledged_by_name = CASE WHEN ledger_health_findings.resolved_at IS NOT NULL THEN NULL ELSE ledger_health_findings.acknowledged_by_name END,
             acknowledge_note = CASE WHEN ledger_health_findings.resolved_at IS NOT NULL THEN NULL ELSE ledger_health_findings.acknowledge_note END,
             resolved_at = NULL`,
          [fp, check.key, r.severity || check.severity, r.entity_type, String(r.entity_id), r.entity_label || null, r.client_id || null, r.booking_id || null,
            r.amount ?? null, check.title, r.detail || null, runId, r.link_path || null]
        );
      }
      // Anything this check reported before but no longer sees has been fixed.
      await db.query(
        `UPDATE ledger_health_findings SET resolved_at = NOW()
         WHERE check_key = $1 AND resolved_at IS NULL AND NOT (fingerprint = ANY($2::text[]))`,
        [check.key, seen]
      );
    }

    const counts = (await db.query(
      `SELECT COUNT(*) FILTER (WHERE severity = 'ERROR' AND acknowledged_at IS NULL)::int AS errors,
              COUNT(*) FILTER (WHERE severity = 'WARNING' AND acknowledged_at IS NULL)::int AS warnings,
              COUNT(*) FILTER (WHERE severity = 'ERROR' AND acknowledged_at IS NULL AND first_seen_run = $1)::int AS new_errors
       FROM ledger_health_findings WHERE resolved_at IS NULL`, [runId]
    )).rows[0];
    const duration = Date.now() - started;
    await db.query(
      `UPDATE ledger_health_runs SET finished_at = NOW(), status = $2, error_count = $3, warning_count = $4, new_error_count = $5, duration_ms = $6, notes = $7
       WHERE run_id = $1`,
      [runId, failedChecks.length ? 'PARTIAL' : 'OK', counts.errors, counts.warnings, counts.new_errors, duration, failedChecks.join('\n') || null]
    );
    return { run_id: runId, status: failedChecks.length ? 'PARTIAL' : 'OK', ...counts, duration_ms: duration, failed_checks: failedChecks };
  } catch (err) {
    if (runId) await db.query(`UPDATE ledger_health_runs SET finished_at = NOW(), status = 'FAILED', notes = $2 WHERE run_id = $1`, [runId, err.message]).catch(() => {});
    throw err;
  } finally {
    await lock.query('SELECT pg_advisory_unlock($1)', [ADVISORY_LOCK_KEY]).catch(() => {});
    lock.release();
  }
}

module.exports = { runLedgerHealth, ALL_CHECKS, CUSTOM_CHARGES_REMOVED_ON };
