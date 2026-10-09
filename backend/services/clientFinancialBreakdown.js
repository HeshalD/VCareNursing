// services/clientFinancialBreakdown.js
// Explains, row by row, how each headline money figure on the admin client page
// is made up — Payments Made, Total Invoiced, Overdue Amount and Wallet Balance —
// so any misalignment of funds can be traced to the entries behind it.
//
// Every builder reads the same ledger and applies the same rules as
// services/clientFinancials.js (the code behind the headline numbers), then adds
// up the rows it lists. `summary.matches` says whether the table adds up to the
// headline; when it doesn't, the difference is the thing to investigate.
//
// Response shape (all four metrics):
//   summary  { headline, derived, difference, matches, headline_label, derived_label }
//   formula  [{ label, value }]           how the derived figure is assembled
//   rules    [string]                     plain-language rules behind it
//   checks   [{ label, ok, detail }]      side-by-side sanity checks
//   sections [{ key, title, description, tone, columns, rows, total }]
// Columns carry a `type` the page knows how to render (see
// client/src/modules/admin/user_managemnet/ClientFinancialBreakdownPage.jsx).
// A row's `counted: false` dims it; `flag` raises a warning chip; `edit` carries
// the "Edited" marker fields (utils/editedAmount.js).

const db = require('../config/db');
const { transactionEditColumns } = require('../utils/editedAmount');
const { walletEffect, WALLET_ADJUSTMENT, EXPLAINED_SOURCES } = require('./walletLedger');
const {
  NON_PAYMENT_CREDIT_CATEGORIES,
  NON_CHARGE_DEBIT_CATEGORIES,
  BOOKING_NON_CHARGE_DEBIT_CATEGORIES,
  bookingChargeSql,
  bookingSettledSql,
  getClientFinancialTotals,
} = require('./clientFinancials');

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const num = (v) => parseFloat(v || 0);
const sum = (rows, pick) => round2(rows.reduce((s, r) => s + pick(r), 0));
const MATCH_TOLERANCE = 0.01;

const summarise = ({ headline, derived, headline_label, derived_label }) => {
  const difference = round2(headline - derived);
  return { headline: round2(headline), derived: round2(derived), difference, matches: Math.abs(difference) < MATCH_TOLERANCE, headline_label, derived_label };
};

const humanizeCategory = (c) => String(c || '').replace(/_/g, ' ').toLowerCase().replace(/^\w/, (x) => x.toUpperCase());

const editOf = (r) => (r.edited_at
  ? { original_amount: r.original_amount, edited_at: r.edited_at, edited_by_name: r.edited_by_name, edit_reason: r.edit_reason, edit_count: r.edit_count }
  : null);

// ── Shared columns ───────────────────────────────────────────────────────────
const col = (key, label, type = 'text', extra = {}) => ({ key, label, type, ...extra });
const COL = {
  date: col('date', 'Date', 'datetime'),
  code: col('code', 'Ref', 'mono'),
  category: col('category', 'Category', 'category'),
  method: col('method', 'Method', 'method'),
  booking: col('booking_code', 'Booking', 'booking'),
  notes: col('notes', 'Details', 'notes'),
  why: col('why', 'Why', 'text', { muted: true }),
};

// The client's ledger, oldest first, with the booking code and edit marker.
const fetchLedger = async (clientId) => {
  const res = await db.query(
    `SELECT t.transaction_id AS id, t.transaction_code AS code, t.created_at AS date,
            t.category::text AS category, t.transaction_type AS type, t.amount,
            t.payment_method AS method, t.reference_number AS reference, t.notes, t.status,
            t.booking_id, b.booking_code,
            ${transactionEditColumns('t')}
     FROM transactions t
     LEFT JOIN bookings b ON b.booking_id = t.booking_id
     WHERE t.client_id = $1
     ORDER BY t.created_at ASC, t.transaction_id ASC`,
    [clientId]
  );
  return res.rows;
};

const ledgerRow = (r, extra = {}) => ({
  id: r.id, code: r.code, date: r.date, category: r.category, type: r.type,
  method: r.method, notes: r.notes, status: r.status,
  booking_id: r.booking_id, booking_code: r.booking_code,
  amount: num(r.amount), edit: editOf(r),
  ...extra,
});

// ─────────────────────────────────────────────────────────────────────────────
// PAYMENTS MADE
// ─────────────────────────────────────────────────────────────────────────────
const NOT_A_PAYMENT_WHY = {
  WALLET_REFUND: 'A credit back to the client/booking (a reversal or audit entry), not money they paid',
  SETTLEMENT_FORFEITURE: 'Unused prepayment forfeited at settlement — company income, not a new payment',
  STAFF_SALARY: 'Staff salary entry — not client money',
  WALLET_ADJUSTMENT: 'Wallet bookkeeping entry — money already held, not a new payment',
};
const WALLET_DRAW_WHY = 'Drawn from the wallet — moves money already received (it counted when it was paid in)';

const buildPaymentsMade = async (clientId, totals) => {
  const ledger = (await fetchLedger(clientId)).filter((r) => r.type === 'CREDIT');
  const counted = [];
  const excluded = [];
  let running = 0;
  for (const r of ledger) {
    const notPayment = NON_PAYMENT_CREDIT_CATEGORIES.includes(r.category);
    const fromWallet = r.method === 'WALLET';
    if (!notPayment && !fromWallet) {
      running = round2(running + num(r.amount));
      counted.push(ledgerRow(r, { running, reference: r.reference }));
    } else {
      excluded.push(ledgerRow(r, { why: notPayment ? NOT_A_PAYMENT_WHY[r.category] : WALLET_DRAW_WHY }));
    }
  }
  const derived = sum(counted, (r) => r.amount);

  return {
    summary: summarise({
      headline: totals.totalPaid, derived,
      headline_label: 'Payments Made on the client page', derived_label: 'Added up from the entries below',
    }),
    formula: [{ label: 'Money received from the client', value: derived }],
    rules: [
      'Counts every ledger CREDIT that is real money handed over — cash, bank transfer, cheque, deposit, wallet top-ups and registration-fee payments.',
      'Does not count draws from the wallet (payment method WALLET): that money was already counted when it was paid in.',
      'Does not count WALLET_REFUND, SETTLEMENT_FORFEITURE or STAFF_SALARY credits — reversals, write-offs and staff entries are not payments.',
      'A payment whose amount was corrected shows its current amount with an "Edited" marker; the original is in the marker.',
    ],
    checks: [],
    sections: [
      {
        key: 'counted', tone: 'counted', title: 'Counted as payments',
        description: 'Every entry that adds to Payments Made.',
        columns: [COL.date, COL.code, COL.category, COL.method, col('reference', 'Reference', 'mono'), COL.booking, COL.notes,
          col('amount', 'Amount', 'money', { editable: true }), col('running', 'Running total', 'running')],
        rows: counted,
        total: { label: 'Total payments made', value: derived },
        empty: 'No payments have been recorded for this client.',
      },
      {
        key: 'excluded', tone: 'excluded', title: 'Credits not counted as payments',
        description: 'Credits on this client’s ledger that are deliberately left out. If a real payment appears here, that is the misalignment.',
        columns: [COL.date, COL.code, COL.category, COL.method, COL.booking, COL.notes, col('amount', 'Amount', 'money', { editable: true }), COL.why],
        rows: excluded,
        total: { label: 'Total not counted', value: sum(excluded, (r) => r.amount), muted: true },
        empty: 'Nothing is excluded — every credit counts as a payment.',
      },
    ],
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// TOTAL INVOICED
// ─────────────────────────────────────────────────────────────────────────────
const NOT_A_CHARGE_WHY = {
  WALLET_DEBIT: 'Bookkeeping mirror of a wallet payoff — not a charge to the client',
  CLIENT_REFUND: 'Money paid back to the client — not a charge',
  DEPOSIT_REFUND: 'A deposit returned to the client — not a charge',
  WALLET_ADJUSTMENT: 'Wallet bookkeeping entry — not a charge to the client',
};

const buildTotalInvoiced = async (clientId, totals) => {
  const [ledger, regRes, legacyRes, dayRes, reversalRes] = await Promise.all([
    fetchLedger(clientId),
    db.query(
      `SELECT overdue_invoice_id AS id, invoice_code AS code, source_type, status, amount, invoiced_at AS date
       FROM overdue_invoices WHERE client_id = $1 ORDER BY invoiced_at ASC`,
      [clientId]
    ),
    db.query(
      `SELECT c.correction_id AS id, c.created_at AS date, b.booking_id, b.booking_code,
              c.service_date::text AS service_date, c.old_amount, c.new_amount, c.delta_amount,
              c.reason, c.corrected_by_name
       FROM booking_amount_corrections c
       JOIN bookings b ON b.booking_id = c.booking_id
       WHERE b.client_id = $1 AND c.target_type = 'INVOICE'
         AND c.applied_in_place = false AND c.delta_amount < 0
       ORDER BY c.created_at ASC`,
      [clientId]
    ),
    db.query(
      `SELECT
         COALESCE(SUM(bdi.amount) FILTER (WHERE bdi.status = 'INVOICED'), 0) AS billed,
         COALESCE(SUM(bdi.amount) FILTER (WHERE bdi.status = 'REVOKED' AND bdi.settlement_action = 'NO_REFUND'), 0) AS kept
       FROM booking_daily_invoices bdi
       JOIN bookings b ON b.booking_id = bdi.booking_id
       WHERE b.client_id = $1`,
      [clientId]
    ),
    // A revoked day is reversed by a credit on the ledger (reverseServiceInvoice), and a day
    // that is re-invoiced afterwards reuses its row — so the original charge has no row of
    // its own any more and only nets out against that reversal.
    db.query(
      `SELECT COALESCE(SUM(amount), 0) AS reversed
       FROM transactions
       WHERE client_id = $1 AND category::text = 'WALLET_REFUND' AND transaction_type = 'CREDIT'
         AND notes LIKE 'Reversal of %'`,
      [clientId]
    ),
  ]);

  const debits = ledger.filter((r) => r.type === 'DEBIT');
  const charges = [];
  const notCharges = [];
  let running = 0;
  for (const r of debits) {
    if (NON_CHARGE_DEBIT_CATEGORIES.includes(r.category)) {
      notCharges.push(ledgerRow(r, { why: NOT_A_CHARGE_WHY[r.category] }));
    } else {
      running = round2(running + num(r.amount));
      charges.push(ledgerRow(r, { running }));
    }
  }
  const regInvoices = regRes.rows.map((r) => ({
    id: r.id, date: r.date, code: r.code, source_type: r.source_type, status: r.status, amount: num(r.amount),
  }));
  const legacy = legacyRes.rows.map((r) => ({
    id: r.id, date: r.date, booking_id: r.booking_id, booking_code: r.booking_code, service_date: r.service_date,
    old_amount: num(r.old_amount), new_amount: num(r.new_amount), amount: num(r.delta_amount),
    reason: r.reason, by: r.corrected_by_name,
  }));

  const chargeTotal = sum(charges, (r) => r.amount);
  const regTotal = sum(regInvoices, (r) => r.amount);
  const legacyTotal = sum(legacy, (r) => r.amount); // negative
  const derived = round2(chargeTotal + regTotal + legacyTotal);

  // What the care-day invoices (Invoices tab) say the client was billed must equal what the
  // ledger says once reversals are netted off.
  const serviceCharges = sum(charges.filter((r) => r.category === 'SERVICE_INVOICE'), (r) => r.amount);
  const reversed = num(reversalRes.rows[0].reversed);
  const ledgerNet = round2(serviceCharges - reversed);
  const dayBilled = num(dayRes.rows[0].billed);
  const dayKept = num(dayRes.rows[0].kept);
  // Older reductions left the full charge on the ledger while the day row shows the reduced figure.
  const expectedOnLedger = round2(dayBilled + dayKept + Math.abs(legacyTotal));
  const careOk = Math.abs(ledgerNet - expectedOnLedger) < MATCH_TOLERANCE;

  return {
    summary: summarise({
      headline: totals.totalInvoiced, derived,
      headline_label: 'Total Invoiced on the client page', derived_label: 'Added up from the entries below',
    }),
    formula: [
      { label: 'Charges on the ledger', value: chargeTotal },
      { label: 'Registration-fee invoices', value: regTotal },
      { label: 'Older corrections not folded into the ledger', value: legacyTotal },
    ],
    rules: [
      'Counts every ledger DEBIT that is a charge: daily/shift service invoices and registration-fee charges raised on a booking.',
      'Does not count WALLET_DEBIT, CLIENT_REFUND or DEPOSIT_REFUND debits — wallet bookkeeping and money paid back are not charges.',
      'Adds every registration-fee invoice ever raised (the overdue-invoices list), whether it was paid or not.',
      'Subtracts care-day invoice reductions made before corrections edited the ledger entry in place — those left the original charge on the ledger.',
      'A revoked day keeps its original charge here; its reversal is a credit that settles the booking on the Overdue side.',
    ],
    checks: [
      {
        label: 'Care-day invoices agree with the ledger',
        ok: careOk,
        detail: `Ledger: ${serviceCharges.toFixed(2)} charged − ${reversed.toFixed(2)} reversed = ${ledgerNet.toFixed(2)}. `
          + `Care-day invoices: ${dayBilled.toFixed(2)} billed`
          + (dayKept ? ` + ${dayKept.toFixed(2)} revoked without refund` : '')
          + (legacyTotal ? ` + ${Math.abs(legacyTotal).toFixed(2)} of older reductions` : '') + ` = ${expectedOnLedger.toFixed(2)}.`
          + (careOk ? '' : ' These should match — a gap means a day invoice and its ledger entry have drifted apart (for example a day charged twice).'),
      },
    ],
    sections: [
      {
        key: 'charges', tone: 'counted', title: 'Charges on the ledger',
        description: 'Every DEBIT that counts as an invoice to the client.',
        columns: [COL.date, COL.code, COL.category, COL.booking, COL.notes, col('amount', 'Amount', 'money', { editable: true }), col('running', 'Running total', 'running')],
        rows: charges,
        total: { label: 'Total charges', value: chargeTotal },
        empty: 'No charges on the ledger.',
      },
      {
        key: 'reg-fee-invoices', tone: 'counted', title: 'Registration-fee invoices',
        description: 'From the overdue-invoices list — counted as soon as they are sent, paid or not.',
        columns: [COL.date, col('code', 'Invoice', 'mono'), col('source_type', 'Type', 'category'), col('status', 'Status', 'category'), col('amount', 'Amount', 'money')],
        rows: regInvoices,
        total: { label: 'Total registration-fee invoices', value: regTotal },
        empty: 'No registration-fee invoices.',
      },
      {
        key: 'legacy', tone: 'adjustment', title: 'Older corrections (subtracted)',
        description: 'Reductions made before corrections edited the original ledger entry. The ledger still holds the full charge, so the reduction is taken off here.',
        columns: [COL.date, COL.booking, col('service_date', 'Service day', 'date'), col('old_amount', 'Was', 'money'), col('new_amount', 'Became', 'money'),
          col('amount', 'Reduction', 'signed'), col('reason', 'Reason', 'notes'), col('by', 'By', 'text')],
        rows: legacy,
        total: { label: 'Total subtracted', value: legacyTotal },
        empty: 'No older corrections — nothing to subtract.',
      },
      {
        key: 'not-charges', tone: 'excluded', title: 'Debits not counted as invoices',
        description: 'Debits on the ledger that are deliberately left out of Total Invoiced.',
        columns: [COL.date, COL.code, COL.category, COL.booking, COL.notes, col('amount', 'Amount', 'money'), COL.why],
        rows: notCharges,
        total: { label: 'Total not counted', value: sum(notCharges, (r) => r.amount), muted: true },
        empty: 'Nothing is excluded.',
      },
    ],
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// OVERDUE AMOUNT
// ─────────────────────────────────────────────────────────────────────────────
const NOT_A_BOOKING_CHARGE_WHY = {
  ...NOT_A_CHARGE_WHY,
  STAFF_SALARY: 'Staff salary clawback — staff money, not an invoice to the client',
};

const buildOverdue = async (clientId, totals) => {
  const [bookingRes, entryRes, openRes, regDriftRes] = await Promise.all([
    db.query(
      `SELECT b.booking_id, b.booking_code, b.status, b.service_type, b.service_model,
              led.invoiced, led.settled
       FROM bookings b
       JOIN LATERAL (
         SELECT
           COALESCE(SUM(t.amount) FILTER (WHERE ${bookingChargeSql('t')}), 0) AS invoiced,
           COALESCE(SUM(t.amount) FILTER (WHERE ${bookingSettledSql('t')}), 0) AS settled
         FROM transactions t WHERE t.booking_id = b.booking_id
       ) led ON true
       WHERE b.client_id = $1
       ORDER BY b.created_at DESC`,
      [clientId]
    ),
    db.query(
      `SELECT t.transaction_id AS id, t.transaction_code AS code, t.created_at AS date,
              t.category::text AS category, t.transaction_type AS type, t.amount, t.payment_method AS method,
              t.notes, t.booking_id, b.booking_code, ${transactionEditColumns('t')}
       FROM transactions t
       JOIN bookings b ON b.booking_id = t.booking_id
       WHERE b.client_id = $1
         AND NOT (t.transaction_type = 'CREDIT' AND t.category = 'STAFF_SALARY')
       ORDER BY b.booking_code, t.created_at ASC, t.transaction_id ASC`,
      [clientId]
    ),
    db.query(
      `SELECT overdue_invoice_id AS id, invoice_code AS code, source_type, amount, invoiced_at AS date
       FROM overdue_invoices WHERE client_id = $1 AND status = 'OVERDUE' ORDER BY invoiced_at ASC`,
      [clientId]
    ),
    // A booking's registration-fee charge should equal the fee the client actually paid.
    db.query(
      `SELECT b.booking_code, d.amount AS charged, c.amount AS paid
       FROM transactions d
       JOIN transactions c ON c.client_id = d.client_id AND c.quote_id = d.quote_id
                          AND c.category::text = 'REGISTRATION_FEE' AND c.transaction_type = 'CREDIT'
       LEFT JOIN bookings b ON b.booking_id = d.booking_id
       WHERE d.client_id = $1 AND d.category::text = 'REGISTRATION_FEE' AND d.transaction_type = 'DEBIT'
         AND d.quote_id IS NOT NULL AND d.amount <> c.amount`,
      [clientId]
    ),
  ]);

  const bookings = bookingRes.rows
    .filter((r) => num(r.invoiced) !== 0 || num(r.settled) !== 0)
    .map((r) => {
      const invoiced = num(r.invoiced);
      const settled = num(r.settled);
      const balance = round2(invoiced - settled);
      const owing = invoiced > settled;
      return {
        id: r.booking_id, booking_id: r.booking_id, booking_code: r.booking_code, status: r.status,
        service: [r.service_type, r.service_model].filter(Boolean).join(' · '),
        invoiced, settled, amount: owing ? balance : 0, balance, counted: owing,
        why: owing ? null : (settled - invoiced > MATCH_TOLERANCE
          ? `Paid ${round2(settled - invoiced).toFixed(2)} more than invoiced — that surplus does not offset other bookings`
          : 'Fully settled'),
      };
    });
  const owingBookings = bookings.filter((r) => r.counted);
  const settledBookings = bookings.filter((r) => !r.counted);
  const openInvoices = openRes.rows.map((r) => ({ id: r.id, date: r.date, code: r.code, source_type: r.source_type, amount: num(r.amount) }));

  const bookingTotal = sum(owingBookings, (r) => r.amount);
  const invoiceTotal = sum(openInvoices, (r) => r.amount);
  const derived = Math.max(round2(bookingTotal + invoiceTotal), 0);

  const entries = entryRes.rows.map((r) => {
    const isDebit = r.type === 'DEBIT';
    const ignored = isDebit && BOOKING_NON_CHARGE_DEBIT_CATEGORIES.includes(r.category);
    return {
      id: r.id, code: r.code, date: r.date, category: r.category, method: r.method, notes: r.notes,
      booking_id: r.booking_id, booking_code: r.booking_code,
      invoiced: isDebit && !ignored ? num(r.amount) : null,
      settled: isDebit ? null : num(r.amount),
      ignored: ignored ? num(r.amount) : null,
      counted: !ignored,
      why: ignored ? NOT_A_BOOKING_CHARGE_WHY[r.category] : null,
      amount: num(r.amount), edit: editOf(r),
    };
  });

  return {
    summary: summarise({
      headline: totals.balanceDue, derived,
      headline_label: 'Overdue Amount on the client page', derived_label: 'Added up from the entries below',
    }),
    formula: [
      { label: 'Bookings with an unpaid balance', value: bookingTotal },
      { label: 'Open registration-fee invoices', value: invoiceTotal },
    ],
    rules: [
      'Worked out booking by booking: everything invoiced to the booking (ledger debits) minus everything settled against it (ledger credits, excluding staff salary).',
      'Only a booking that has been invoiced more than it has been settled counts. A booking paid ahead does not cancel another booking’s debt.',
      'Adds registration-fee invoices that are still marked overdue.',
      'Settled amounts here include wallet draws, refunds and forfeitures — anything credited to the booking — so they can differ from Payments Made.',
      'Not counted as invoices: wallet-payoff mirrors, refunds paid out, wallet adjustments and staff-salary clawbacks. They appear dimmed in the entries table with the reason, so a wallet payoff visibly settles a booking instead of being added to what it owes.',
    ],
    checks: [
      {
        label: 'Registration-fee charges match the fee paid',
        ok: regDriftRes.rows.length === 0,
        detail: regDriftRes.rows.length === 0
          ? 'Every registration-fee charge on a booking equals the fee that was paid.'
          : `${regDriftRes.rows.map((r) => `${r.booking_code || 'A booking'} was charged ${num(r.charged).toFixed(2)} but ${num(r.paid).toFixed(2)} was paid`).join('; ')} — the difference shows as owing even though the fee is settled.`,
      },
    ],
    sections: [
      {
        key: 'owing', tone: 'counted', title: 'Bookings with an unpaid balance',
        description: 'Invoiced more than settled. These make up the overdue amount.',
        columns: [COL.booking, col('status', 'Status', 'category'), col('service', 'Service', 'text'),
          col('invoiced', 'Invoiced', 'money'), col('settled', 'Settled', 'money'), col('amount', 'Owing', 'money')],
        rows: owingBookings,
        total: { label: 'Total owing on bookings', value: bookingTotal },
        empty: 'No booking has an unpaid balance.',
      },
      {
        key: 'open-invoices', tone: 'counted', title: 'Open registration-fee invoices',
        description: 'Registration-fee invoices still marked overdue.',
        columns: [COL.date, col('code', 'Invoice', 'mono'), col('source_type', 'Type', 'category'), col('amount', 'Amount', 'money')],
        rows: openInvoices,
        total: { label: 'Total open invoices', value: invoiceTotal },
        empty: 'No overdue registration-fee invoices.',
      },
      {
        key: 'settled', tone: 'excluded', title: 'Bookings not counted',
        description: 'Settled in full (or ahead). Shown so a surplus on one booking is visible next to a debt on another.',
        columns: [COL.booking, col('status', 'Status', 'category'), col('service', 'Service', 'text'),
          col('invoiced', 'Invoiced', 'money'), col('settled', 'Settled', 'money'), col('balance', 'Balance', 'signed'), COL.why],
        rows: settledBookings,
        total: null,
        empty: 'Every booking with ledger activity is in the table above.',
      },
      {
        key: 'entries', tone: 'info', title: 'Ledger entries behind the booking balances',
        description: 'Every debit (invoiced) and credit (settled) posted against this client’s bookings. Filter by booking code to follow one booking.',
        columns: [COL.booking, COL.date, COL.code, COL.category, COL.method, COL.notes,
          col('invoiced', 'Invoiced', 'money', { editable: true }), col('settled', 'Settled', 'money', { editable: true }),
          col('ignored', 'Not counted', 'money'), COL.why],
        rows: entries,
        total: null,
        filterable: true,
        empty: 'No ledger entries are linked to this client’s bookings.',
      },
    ],
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// WALLET BALANCE
// ─────────────────────────────────────────────────────────────────────────────
// What each ledger entry does to client_profiles.wallet_balance is defined once, in
// services/walletLedger.js. Two independent records are lined up here:
//   • the LEDGER   — transactions that say the wallet should have moved, and
//   • the AUDIT    — client_wallet_movements, written by a database trigger every time
//                    the stored balance actually changed (so it also sees scripts and
//                    manual edits). A change with no ledger entry, or an entry with no
//                    change, is exactly where funds drift apart.
const AUDIT_FLAG_MOVEMENT = 'The stored balance changed here but no ledger entry explains it';
const AUDIT_FLAG_ENTRY = 'This entry says the wallet moved, but no matching change to the stored balance was recorded';

const timeKey = (d) => new Date(d).getTime();

// Pairs recorded balance changes with the ledger entries that explain them. Entries and
// changes made in one database transaction share a timestamp, so they pair as a group;
// anything left over is matched by amount alone (a backdated payment keeps its real
// payment date on the ledger, so it won't share the timestamp).
const pairMovementsWithEntries = (movements, moves) => {
  const changes = movements.filter((m) => m.kind === 'CHANGE');
  const byTime = (items, pick) => items.reduce((map, item) => {
    const k = timeKey(pick(item));
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(item);
    return map;
  }, new Map());
  const entryGroups = byTime(moves, (r) => r.date);
  const matchedEntries = new Set();

  for (const [k, group] of byTime(changes, (m) => m.changed_at)) {
    const entries = entryGroups.get(k) || [];
    if (!entries.length) continue;
    const moved = round2(group.reduce((s, m) => s + m.delta, 0));
    const expected = round2(entries.reduce((s, r) => s + (r.paid_in || 0) - (r.paid_out || 0), 0));
    if (Math.abs(moved - expected) < MATCH_TOLERANCE) {
      group.forEach((m) => { m.paired = entries; });
      entries.forEach((r) => matchedEntries.add(r));
    }
  }
  for (const m of changes.filter((c) => !c.paired)) {
    const hit = moves.find((r) => !matchedEntries.has(r) && Math.abs(((r.paid_in || 0) - (r.paid_out || 0)) - m.delta) < MATCH_TOLERANCE);
    if (hit) { m.paired = [hit]; matchedEntries.add(hit); }
  }
  return matchedEntries;
};

const buildWallet = async (clientId, totals, client) => {
  const [ledger, earmarkRes, movementRes, auditStartRes] = await Promise.all([
    fetchLedger(clientId),
    db.query(
      `SELECT booking_id, booking_code, status, COALESCE(wallet_earmarked, 0) AS earmarked
       FROM bookings WHERE client_id = $1 AND COALESCE(wallet_earmarked, 0) > 0
       ORDER BY created_at DESC`,
      [clientId]
    ),
    db.query(
      `SELECT movement_id, kind, delta, new_balance, changed_at, db_user, application_name
       FROM client_wallet_movements WHERE client_id = $1 ORDER BY movement_id ASC`,
      [clientId]
    ),
    db.query(`SELECT MIN(changed_at) AS started FROM client_wallet_movements`),
  ]);
  const auditStart = auditStartRes.rows[0]?.started || null;

  const moves = [];
  const noEffect = [];
  let running = 0;
  for (const r of ledger) {
    const w = walletEffect(r);
    if (!w) continue;
    if (w.effect === 0) {
      noEffect.push(ledgerRow(r, { why: w.rule }));
      continue;
    }
    running = round2(running + w.effect);
    moves.push(ledgerRow(r, {
      rule: w.rule,
      paid_in: w.effect > 0 ? w.effect : null,
      paid_out: w.effect < 0 ? -w.effect : null,
      running,
    }));
  }
  const paidIn = sum(moves, (r) => r.paid_in || 0);
  const paidOut = sum(moves, (r) => r.paid_out || 0);
  const derived = round2(paidIn - paidOut);
  const stored = round2(num(client.wallet_balance));

  const movements = movementRes.rows.map((m) => ({
    id: m.movement_id, kind: m.kind, delta: num(m.delta), balance_after: num(m.new_balance),
    changed_at: m.changed_at, by: m.application_name || m.db_user || '—',
    explained: EXPLAINED_SOURCES[m.application_name] || null,
  }));
  const matchedEntries = pairMovementsWithEntries(movements, moves);

  // An entry made after auditing began should have left a recorded change. A carried-over
  // or adjustment entry explains money the wallet already holds, so it has no change.
  if (auditStart) {
    moves.forEach((r) => {
      if (!matchedEntries.has(r) && r.category !== WALLET_ADJUSTMENT && new Date(r.date) >= new Date(auditStart)) {
        r.flag = AUDIT_FLAG_ENTRY;
      }
    });
  }
  const unmatchedMovements = movements.filter((m) => m.kind === 'CHANGE' && !m.paired && !m.explained);
  const auditRows = movements.map((m) => ({
    id: m.id,
    date: m.changed_at,
    kind: m.kind === 'BASELINE' ? 'Balance when auditing began' : 'Change',
    amount: m.delta,
    balance_after: m.balance_after,
    entry: m.kind === 'BASELINE'
      ? 'Nothing earlier was recorded individually'
      : m.paired ? m.paired.map((r) => `${r.code || 'Entry'} · ${humanizeCategory(r.category)}`).join(', ')
        : m.explained || 'No matching ledger entry',
    by: m.by,
    flag: m.kind === 'CHANGE' && !m.paired && !m.explained ? AUDIT_FLAG_MOVEMENT : null,
  }));
  const auditTotal = sum(movements, (m) => m.delta);

  const reserved = earmarkRes.rows.map((r) => ({
    id: r.booking_id, booking_id: r.booking_id, booking_code: r.booking_code, status: r.status, amount: num(r.earmarked),
  }));
  const reservedTotal = sum(reserved, (r) => r.amount);
  const free = round2(stored - reservedTotal);

  const difference = round2(stored - derived);
  const flaggedEntries = moves.filter((r) => r.flag).length;
  return {
    summary: summarise({
      headline: stored, derived,
      headline_label: 'Wallet Balance stored on the client', derived_label: 'What the ledger entries add up to',
    }),
    formula: [
      { label: 'Paid into the wallet', value: paidIn },
      { label: 'Drawn out of the wallet', value: -paidOut },
    ],
    rules: [
      'The wallet is a running balance kept on the client, changed whenever money is paid in or drawn out. This page rebuilds it from the ledger entries those actions leave behind.',
      'Paid in: WALLET_TOPUP credits (service-charge prepayments, overpayments and explicit top-ups) and days reversed back to the wallet.',
      'Drawn out: credits paid with method WALLET (daily charges and registration fee), forfeited prepayments and prepayments refunded at settlement.',
      'Wallet adjustments are bookkeeping entries for money the wallet holds that nothing else explains (for example a prepayment carried over when a booking was hard-deleted). They are not payments.',
      'A second record — written by the database every time the stored balance changes — is lined up against the ledger below. A change with no ledger entry, or an entry with no change, is where the two have drifted.',
      'If the stored balance and the ledger differ, check the audit table: changes made before auditing began were not recorded individually, so they appear only as the opening balance.',
    ],
    checks: [
      {
        label: 'The ledger reproduces the stored balance',
        ok: Math.abs(difference) < MATCH_TOLERANCE,
        detail: Math.abs(difference) < MATCH_TOLERANCE
          ? `Stored ${stored.toFixed(2)} equals the ledger total.`
          : `Stored ${stored.toFixed(2)} vs ledger ${derived.toFixed(2)} — ${Math.abs(difference).toFixed(2)} ${difference > 0 ? 'in the wallet that the ledger cannot account for' : 'recorded in the ledger but missing from the wallet'}.`,
      },
      {
        label: 'Every recorded change to the balance has a ledger entry',
        ok: unmatchedMovements.length === 0,
        detail: unmatchedMovements.length === 0
          ? 'Each change since auditing began is explained by a ledger entry.'
          : `${unmatchedMovements.length} change${unmatchedMovements.length === 1 ? '' : 's'} to the stored balance (${unmatchedMovements.map((m) => `${m.delta >= 0 ? '+' : '−'}${Math.abs(m.delta).toFixed(2)} on ${new Date(m.changed_at).toISOString().slice(0, 10)} by ${m.by}`).join('; ')}) ${unmatchedMovements.length === 1 ? 'has' : 'have'} no matching ledger entry — a script, a manual edit or a code path that skips the ledger.`,
      },
      {
        label: 'Every ledger wallet entry reached the stored balance',
        ok: flaggedEntries === 0,
        detail: flaggedEntries === 0
          ? 'Every wallet entry made since auditing began changed the stored balance as it should.'
          : `${flaggedEntries} ledger entr${flaggedEntries === 1 ? 'y says' : 'ies say'} the wallet moved but the stored balance never did.`,
      },
      {
        label: 'The audit trail adds up to the stored balance',
        ok: Math.abs(round2(stored - auditTotal)) < MATCH_TOLERANCE,
        detail: `Opening balance and recorded changes total ${auditTotal.toFixed(2)}; stored balance is ${stored.toFixed(2)}.`
          + (Math.abs(round2(stored - auditTotal)) < MATCH_TOLERANCE ? '' : ' The balance was changed in a way the audit could not see.'),
      },
      {
        label: 'Money reserved for bookings fits inside the wallet',
        ok: reservedTotal <= stored + MATCH_TOLERANCE,
        detail: `Reserved across bookings: ${reservedTotal.toFixed(2)}. Wallet: ${stored.toFixed(2)}. Free to use: ${free.toFixed(2)}.`
          + (reservedTotal > stored + MATCH_TOLERANCE ? ' Reservations exceed the wallet — a booking is relying on money that is not there.' : ''),
      },
    ],
    sections: [
      {
        key: 'moves', tone: 'counted', title: 'Wallet movements from the ledger',
        description: 'Every ledger entry that adds to or draws from the wallet, oldest first, with the balance after each.',
        columns: [COL.date, COL.code, COL.category, COL.booking, COL.notes, col('paid_in', 'Paid in', 'money', { editable: true }),
          col('paid_out', 'Drawn out', 'money', { editable: true }), col('running', 'Balance after', 'running'),
          col('rule', 'What it did', 'text', { muted: true }), col('flag', 'Check', 'flag')],
        rows: moves,
        total: { label: 'Wallet according to the ledger', value: derived },
        empty: 'The ledger has no wallet movements for this client.',
      },
      {
        key: 'audit', tone: 'info', title: 'Recorded changes to the stored balance',
        description: 'Written by the database each time the stored wallet balance changed, whoever or whatever changed it, and paired with the ledger entry that explains it.',
        columns: [COL.date, col('kind', 'What', 'text'), col('amount', 'Change', 'signed'), col('balance_after', 'Balance after', 'running'),
          col('entry', 'Ledger entry', 'text', { muted: true }), col('by', 'Changed by', 'text', { muted: true }), col('flag', 'Check', 'flag')],
        rows: auditRows,
        total: { label: 'Opening balance + recorded changes', value: auditTotal },
        empty: 'No changes to the stored balance have been recorded for this client.',
      },
      {
        key: 'no-effect', tone: 'excluded', title: 'Wallet-related entries that move nothing',
        description: 'Entries that look wallet-related but leave the balance unchanged.',
        columns: [COL.date, COL.code, COL.category, COL.booking, COL.notes, col('amount', 'Amount', 'money'), COL.why],
        rows: noEffect,
        total: null,
        empty: 'None.',
      },
      {
        key: 'reserved', tone: 'info', title: 'Where the balance is reserved',
        description: 'Prepaid money set aside for a specific booking. The rest of the balance is free for any of this client’s bookings.',
        columns: [COL.booking, col('status', 'Status', 'category'), col('amount', 'Reserved', 'money')],
        rows: reserved,
        total: { label: `Reserved for bookings (free to use: ${free.toFixed(2)})`, value: reservedTotal },
        empty: 'Nothing is reserved for a specific booking — the whole balance is free.',
      },
    ],
  };
};

// ─────────────────────────────────────────────────────────────────────────────
const BUILDERS = {
  'payments-made': { title: 'Payments Made', build: buildPaymentsMade },
  'total-invoiced': { title: 'Total Invoiced', build: buildTotalInvoiced },
  overdue: { title: 'Overdue Amount', build: buildOverdue },
  wallet: { title: 'Wallet Balance', build: buildWallet },
};

const getClientFinancialBreakdown = async (clientId, metric) => {
  const def = BUILDERS[metric];
  if (!def) {
    const err = new Error(`Unknown breakdown "${metric}"`);
    err.statusCode = 404;
    throw err;
  }
  const clientRes = await db.query(
    `SELECT client_profile_id, client_code, full_name, wallet_balance FROM client_profiles WHERE client_profile_id = $1`,
    [clientId]
  );
  if (clientRes.rows.length === 0) {
    const err = new Error('Client not found');
    err.statusCode = 404;
    throw err;
  }
  const client = clientRes.rows[0];
  const totals = await getClientFinancialTotals(clientId);
  const body = await def.build(clientId, totals, client);
  return {
    metric,
    title: def.title,
    client: { client_id: client.client_profile_id, client_code: client.client_code, name: client.full_name },
    ...body,
  };
};

module.exports = { getClientFinancialBreakdown, BREAKDOWN_METRICS: Object.keys(BUILDERS), _internal: { walletEffect } };
