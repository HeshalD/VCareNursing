// services/paymentEdits.js
//
// Super-admin edits to an already-recorded client payment, started from a receipt on
// the Client Payments page. One public entry point: editReceiptPayment.
//
// What an edit does, per receipt source_type:
//   CLIENT_PAYMENT  - the Record Payment flow. Amount, allocation split and every detail
//                     are editable. Wallet credits/earmarks move by the delta.
//   BOOKING_PAYMENT - a direct payment onto a booking's ledger. Amount + details.
//   PRODUCT_INVOICE - one instalment against a product/rental invoice. Amount + details;
//                     the invoice flips PAID <-> PENDING to match.
//   QUOTE_PAYMENT   - details only (method, bank, cheque, reference, date, notes, slip).
//                     One quotation payment can fan out into registration fee, service
//                     charges, custom charges, product invoices and wallet/booking
//                     overflow, and its wallet credit is not linked back to the payment
//                     row, so its amount cannot be changed safely.
//
// Every edit runs in ONE database transaction and then:
//   - updates the linked ledger rows IN PLACE (the "Edited" marker columns on
//     transactions are set, same as the invoice amount edits - see utils/editedAmount.js),
//   - re-opens the most recent wallet draw-downs if a reduced credit leaves the wallet
//     short (restoreWalletFloor), recording exactly which ones,
//   - VOIDS the original receipt and issues a new one (new receipt_code), linked both ways,
//   - writes a payment_edit_log row (before/after, reason, re-opened items).
// Bank / petty-cash balances are computed from the transactions ledger, so they follow
// the edited rows automatically.

const db = require('../config/db');
const { resolveBankAccountId } = require('../utils/pettyCash');
const { creditClientWallet } = require('./walletService');
const { generateReceiptPdf } = require('./receiptService');

class PaymentEditError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}
const fail = (statusCode, message) => { throw new PaymentEditError(statusCode, message); };

const VALID_METHODS = ['BANK_TRANSFER', 'CASH_DEPOSIT', 'CASH', 'CHEQUE'];
const num = (v) => parseFloat(v || 0);
const money = (v) => Math.round(num(v) * 100) / 100;

// Calendar day in the server's local zone (pg returns DATE columns as local-midnight Dates,
// so toISOString() would shift the day for zones ahead of UTC).
const localDay = (v) => {
  if (!v) return null;
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
  const d = new Date(v);
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
};

// ─── Details (method / bank / cheque / reference / date / notes / slip) ──────────────
// `current` is the payment row as stored. Anything absent from `changes` keeps its value;
// an empty string clears an optional field. Validation mirrors the record-payment flows.
async function resolveDetails(client, changes, current) {
  const has = (k) => changes[k] !== undefined;
  const val = (k) => (has(k) ? (changes[k] === '' ? null : changes[k]) : (current[k] ?? null));

  const payment_method = has('payment_method') ? changes.payment_method : current.payment_method;
  if (!VALID_METHODS.includes(payment_method)) {
    fail(400, `payment_method must be one of: ${VALID_METHODS.join(', ')}`);
  }
  const methodChanged = payment_method !== current.payment_method;

  // Switching method without naming a bank must not silently keep the old bank
  // (e.g. CASH -> BANK_TRANSFER would otherwise keep the Petty Cash account).
  const bankInput = has('bank_account_id')
    ? (changes.bank_account_id || null)
    : (methodChanged ? null : current.bank_account_id || null);
  if (['BANK_TRANSFER', 'CASH_DEPOSIT'].includes(payment_method) && !bankInput) {
    fail(400, `bank_account_id is required for ${payment_method}`);
  }
  const bank_account_id = await resolveBankAccountId(payment_method, bankInput);
  if (bank_account_id && bank_account_id !== current.bank_account_id) {
    const bank = await client.query('SELECT is_active FROM bank_accounts WHERE account_id = $1', [bank_account_id]);
    if (bank.rows.length === 0 || !bank.rows[0].is_active) fail(400, 'Bank account not found or not active');
  }

  let cheque_number = null;
  let cheque_date = null;
  if (payment_method === 'CHEQUE') {
    cheque_number = val('cheque_number');
    cheque_date = val('cheque_date') ? localDay(val('cheque_date')) : null;
    if (!cheque_number || !cheque_date) fail(400, 'cheque_number and cheque_date are required for CHEQUE payments');
  }

  // A changed date re-dates the ledger rows; a future date would put the ledger ahead of reality.
  const currentDay = localDay(current.payment_date);
  let payment_date = currentDay;
  let ledger_ts = null;
  if (has('payment_date') && changes.payment_date) {
    const parsed = new Date(changes.payment_date);
    if (isNaN(parsed.getTime())) fail(400, 'payment_date is not a valid date');
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);
    if (parsed.getTime() > endOfToday.getTime()) fail(400, 'payment_date cannot be in the future');
    payment_date = String(changes.payment_date).slice(0, 10);
    if (payment_date !== currentDay) {
      // A backdated payment keeps its date; one moved to today lands at the current time.
      ledger_ts = payment_date < localDay(new Date()) ? new Date(payment_date) : new Date();
    }
  }

  return {
    payment_method,
    bank_account_id,
    cheque_number,
    cheque_date,
    reference_number: val('reference_number'),
    notes: val('notes'),
    notes_changed: has('notes'),
    slip_url: has('slip_url') ? changes.slip_url : (current.slip_url ?? null),
    payment_date,
    ledger_ts,
  };
}

// Ledger-row fields shared by every transaction belonging to the payment.
const txDetailFields = (d) => ({
  payment_method: d.payment_method,
  bank_account_id: d.bank_account_id,
  cheque_number: d.cheque_number,
  cheque_date: d.cheque_date,
  reference_number: d.reference_number,
  receipt_url: d.slip_url,
  ...(d.ledger_ts ? { created_at: d.ledger_ts } : {}),
  ...(d.notes_changed ? { notes: d.notes } : {}),
});

const TX_EDITABLE = [
  'amount', 'payment_method', 'bank_account_id', 'cheque_number', 'cheque_date',
  'reference_number', 'receipt_url', 'notes', 'created_at', 'custom_category_label',
];

// Updates a transactions row in place and stamps the "Edited" marker (original_amount is
// kept from the first edit only).
async function updateTx(client, txId, fields, actor, reason) {
  const vals = [txId];
  const sets = [];
  for (const key of TX_EDITABLE) {
    if (fields[key] !== undefined) {
      vals.push(fields[key]);
      sets.push(`${key} = $${vals.length}`);
    }
  }
  vals.push(actor.user_id, actor.name, reason);
  const n = vals.length;
  await client.query(
    `UPDATE transactions SET ${sets.length ? sets.join(', ') + ',' : ''}
       original_amount = COALESCE(original_amount, amount),
       edited_at = NOW(), edited_by = $${n - 2}, edited_by_name = $${n - 1}, edit_reason = $${n},
       edit_count = edit_count + 1
     WHERE transaction_id = $1`,
    vals
  );
}

// ─── Wallet helpers ──────────────────────────────────────────────────────────────────
const lockWallet = async (client, clientId) => {
  const r = await client.query(
    'SELECT COALESCE(wallet_balance, 0) AS wallet_balance FROM client_profiles WHERE client_profile_id = $1 FOR UPDATE',
    [clientId]
  );
  if (r.rows.length === 0) fail(404, 'Client not found');
  return num(r.rows[0].wallet_balance);
};

const adjustWallet = (client, clientId, delta) =>
  client.query(
    'UPDATE client_profiles SET wallet_balance = COALESCE(wallet_balance, 0) + $1 WHERE client_profile_id = $2',
    [delta, clientId]
  );

// Money earmarked for a booking moves with the credit that funded it (never below zero).
const adjustEarmark = (client, bookingId, delta) => {
  if (!bookingId || Math.abs(delta) < 0.005) return Promise.resolve();
  return client.query(
    'UPDATE bookings SET wallet_earmarked = GREATEST(COALESCE(wallet_earmarked, 0) + $1, 0) WHERE booking_id = $2',
    [delta, bookingId]
  );
};

const recomputeBookingPaid = (client, bookingId) =>
  client.query(
    `UPDATE bookings
     SET amount_paid = (
       SELECT COALESCE(SUM(amount_received), 0) FROM booking_payment_tracking
       WHERE booking_id = $1 AND status = 'VERIFIED'
     )
     WHERE booking_id = $1`,
    [bookingId]
  );

// After a credit was reduced/removed the wallet can be negative: the money was already
// spent paying invoices. Un-pay the most recent wallet draw-downs (newest first, across
// all of the client's bookings) until the balance is back to zero. A draw is a
// booking_payment_tracking row (method WALLET) plus its BOOKING_PAYMENT transaction;
// reducing/removing them re-opens the charge on the booking ledger (it simply becomes
// unpaid again - paid-ness is computed from the ledger). Returns what was re-opened.
async function restoreWalletFloor(client, clientId) {
  let balance = num((await client.query(
    'SELECT COALESCE(wallet_balance, 0) AS b FROM client_profiles WHERE client_profile_id = $1',
    [clientId]
  )).rows[0]?.b);
  if (balance >= -0.005) return [];

  const draws = await client.query(
    `SELECT bpt.booking_payment_id, bpt.booking_id, bpt.amount_received, bpt.created_at, b.booking_code
     FROM booking_payment_tracking bpt
     JOIN bookings b ON b.booking_id = bpt.booking_id
     WHERE bpt.client_id = $1 AND bpt.payment_method = 'WALLET' AND bpt.status = 'VERIFIED'
     ORDER BY bpt.created_at DESC, bpt.booking_payment_id
     FOR UPDATE OF bpt`,
    [clientId]
  );

  const reopened = [];
  const touchedBookings = new Set();
  for (const draw of draws.rows) {
    if (balance >= -0.005) break;
    const drawAmount = num(draw.amount_received);
    const give = Math.min(-balance, drawAmount);

    const tx = await client.query(
      `SELECT transaction_id, amount,
              ABS(EXTRACT(EPOCH FROM (created_at - $3::timestamptz))) AS gap
       FROM transactions
       WHERE booking_id = $1 AND category = 'BOOKING_PAYMENT' AND transaction_type = 'CREDIT'
         AND payment_method = 'WALLET' AND ABS(amount - $2) < 0.005
       ORDER BY ABS(EXTRACT(EPOCH FROM (created_at - $3::timestamptz))) LIMIT 1
       FOR UPDATE`,
      [draw.booking_id, drawAmount, draw.created_at]
    );
    if (tx.rows.length === 0 || num(tx.rows[0].gap) > 120) {
      fail(409, `Cannot safely re-open the wallet payment on booking ${draw.booking_code}: its ledger entry could not be matched. Nothing was changed.`);
    }

    const remaining = drawAmount - give;
    if (remaining < 0.005) {
      await client.query('DELETE FROM booking_payment_tracking WHERE booking_payment_id = $1', [draw.booking_payment_id]);
      await client.query('DELETE FROM transactions WHERE transaction_id = $1', [tx.rows[0].transaction_id]);
    } else {
      await client.query('UPDATE booking_payment_tracking SET amount_received = $2 WHERE booking_payment_id = $1', [draw.booking_payment_id, remaining]);
      await client.query('UPDATE transactions SET amount = $2 WHERE transaction_id = $1', [tx.rows[0].transaction_id, remaining]);
    }

    await adjustWallet(client, clientId, give);
    balance += give;
    touchedBookings.add(draw.booking_id);
    reopened.push({
      booking_id: draw.booking_id,
      booking_code: draw.booking_code,
      amount: money(give),
      was: money(drawAmount),
      now: money(remaining < 0.005 ? 0 : remaining),
    });
  }

  if (balance < -0.005) {
    fail(409, `The wallet is short by ${money(-balance)} and there are not enough wallet payments to re-open. Nothing was changed.`);
  }
  for (const bookingId of touchedBookings) await recomputeBookingPaid(client, bookingId);
  return reopened;
}

// ─── Handlers ────────────────────────────────────────────────────────────────────────
// Each returns { details, total_amount, line_items, before, after, reopened, warnings }.

async function editBookingPayment(client, { receipt, changes, newTotal, actor, reason }) {
  const bptRes = await client.query('SELECT * FROM booking_payment_tracking WHERE booking_payment_id = $1 FOR UPDATE', [receipt.source_id]);
  const bpt = bptRes.rows[0];
  if (!bpt) fail(404, 'The booking payment behind this receipt no longer exists');
  if (bpt.status !== 'VERIFIED') fail(409, 'Only verified payments can be edited');
  if (bpt.payment_method === 'WALLET') fail(409, 'Wallet draw-downs are not payments and cannot be edited');

  const details = await resolveDetails(client, changes, bpt);
  const oldAmount = money(bpt.amount_received);
  const amount = newTotal ?? oldAmount;

  // The ledger row carries the same instant as the payment row (both stamped in one statement).
  const txRes = await client.query(
    `SELECT transaction_id, amount,
            ABS(EXTRACT(EPOCH FROM (created_at - $4::timestamptz))) AS gap
     FROM transactions
     WHERE booking_id = $1 AND category = 'BOOKING_PAYMENT' AND transaction_type = 'CREDIT'
       AND payment_method IS NOT DISTINCT FROM $2 AND ABS(amount - $3) < 0.005
     ORDER BY ABS(EXTRACT(EPOCH FROM (created_at - $4::timestamptz))) LIMIT 1
     FOR UPDATE`,
    [bpt.booking_id, bpt.payment_method, oldAmount, bpt.payment_date]
  );
  if (txRes.rows.length === 0 || num(txRes.rows[0].gap) > 120) {
    fail(409, 'This payment\'s ledger entry could not be matched safely, so it cannot be edited.');
  }

  await client.query(
    `UPDATE booking_payment_tracking
     SET amount_received = $2, payment_method = $3, bank_account_id = $4, cheque_number = $5,
         cheque_date = $6, reference_number = $7, slip_url = $8, notes = $9,
         payment_date = COALESCE($10::timestamptz, payment_date)
     WHERE booking_payment_id = $1`,
    [bpt.booking_payment_id, amount, details.payment_method, details.bank_account_id, details.cheque_number,
      details.cheque_date, details.reference_number, details.slip_url, details.notes_changed ? details.notes : bpt.notes,
      details.ledger_ts]
  );
  await updateTx(client, txRes.rows[0].transaction_id, { ...txDetailFields(details), amount }, actor, reason);
  await recomputeBookingPaid(client, bpt.booking_id);

  const lineItems = (Array.isArray(receipt.line_items) ? receipt.line_items : []).map((li) => ({ ...li, amount }));
  return {
    details,
    total_amount: amount,
    line_items: lineItems.length ? lineItems : [{ label: 'Booking payment', description: '', amount }],
    before: { amount: oldAmount, payment_method: bpt.payment_method, reference_number: bpt.reference_number },
    after: { amount, payment_method: details.payment_method, reference_number: details.reference_number },
    reopened: [],
    warnings: [],
  };
}

async function editProductInvoicePayment(client, { receipt, changes, newTotal, actor, reason }) {
  const invRes = await client.query('SELECT * FROM invoices WHERE invoice_id = $1 FOR UPDATE', [receipt.source_id]);
  const invoice = invRes.rows[0];
  if (!invoice) fail(404, 'The invoice behind this receipt no longer exists');

  // A receipt points at the invoice, not at one instalment: find the instalment that has this
  // receipt's amount, nearest in time. Refuse rather than guess if two are indistinguishable.
  const cands = await client.query(
    `SELECT ip.*, ABS(EXTRACT(EPOCH FROM (COALESCE(t.created_at, ip.created_at) - $3::timestamptz))) AS gap
     FROM invoice_payments ip
     LEFT JOIN transactions t ON t.transaction_id = ip.transaction_id
     WHERE ip.invoice_id = $1 AND ABS(ip.amount - $2) < 0.005
     ORDER BY gap, ip.created_at
     FOR UPDATE OF ip`,
    [invoice.invoice_id, receipt.total_amount, receipt.payment_date]
  );
  if (cands.rows.length === 0) fail(409, 'The invoice instalment behind this receipt could not be found');
  if (cands.rows.length > 1 && Math.abs(num(cands.rows[0].gap) - num(cands.rows[1].gap)) < 2) {
    fail(409, 'This invoice has more than one identical instalment and this receipt cannot be matched to just one of them.');
  }
  const pay = cands.rows[0];
  if (!pay.transaction_id) fail(409, 'This instalment has no ledger entry and cannot be edited');

  const details = await resolveDetails(client, changes, {
    ...pay,
    cheque_date: pay.cheque_date,
    payment_date: receipt.payment_date,
    notes: pay.notes,
  });
  const oldAmount = money(pay.amount);
  const amount = newTotal ?? oldAmount;

  const othersRes = await client.query(
    'SELECT COALESCE(SUM(amount), 0) AS paid FROM invoice_payments WHERE invoice_id = $1 AND invoice_payment_id <> $2',
    [invoice.invoice_id, pay.invoice_payment_id]
  );
  const paidTotal = num(othersRes.rows[0].paid) + amount;
  if (paidTotal > num(invoice.amount) + 0.01) {
    fail(400, `That would overpay invoice ${invoice.invoice_code}: it is for ${money(invoice.amount)} and the other instalments already total ${money(num(othersRes.rows[0].paid))}.`);
  }

  await client.query(
    `UPDATE invoice_payments
     SET amount = $2, payment_method = $3, bank_account_id = $4, cheque_number = $5, cheque_date = $6,
         reference_number = $7, slip_url = $8, notes = $9
     WHERE invoice_payment_id = $1`,
    [pay.invoice_payment_id, amount, details.payment_method, details.bank_account_id, details.cheque_number,
      details.cheque_date, details.reference_number, details.slip_url, details.notes_changed ? details.notes : pay.notes]
  );
  await updateTx(client, pay.transaction_id, { ...txDetailFields(details), amount }, actor, reason);

  const warnings = [];
  const fullyPaid = paidTotal >= num(invoice.amount) - 0.01;
  if (fullyPaid && invoice.status !== 'PAID') {
    await client.query(
      `UPDATE invoices SET status = 'PAID', transaction_id = $2, paid_at = COALESCE($3::timestamptz, NOW()) WHERE invoice_id = $1`,
      [invoice.invoice_id, pay.transaction_id, details.ledger_ts]
    );
  } else if (!fullyPaid && invoice.status === 'PAID') {
    await client.query(
      `UPDATE invoices SET status = 'PENDING', transaction_id = NULL, paid_at = NULL WHERE invoice_id = $1`,
      [invoice.invoice_id]
    );
    warnings.push(`Invoice ${invoice.invoice_code} is no longer fully paid and is back to PENDING.`);
    const held = await client.query('SELECT COUNT(*)::int AS n FROM deposits WHERE collected_transaction_id = $1', [pay.transaction_id]);
    if (held.rows[0].n > 0) warnings.push('A deposit was recorded when this invoice was first paid. It was left as it is - review it if needed.');
  } else if (fullyPaid && details.ledger_ts) {
    await client.query('UPDATE invoices SET paid_at = $2 WHERE invoice_id = $1', [invoice.invoice_id, details.ledger_ts]);
  }

  const lineItems = (Array.isArray(receipt.line_items) ? receipt.line_items : []).map((li) => ({ ...li, amount }));
  return {
    details,
    total_amount: amount,
    line_items: lineItems.length ? lineItems : [{ label: 'Product Invoice', description: invoice.invoice_code, amount }],
    before: { amount: oldAmount, payment_method: pay.payment_method, reference_number: pay.reference_number },
    after: { amount, payment_method: details.payment_method, reference_number: details.reference_number },
    reopened: [],
    warnings,
  };
}

async function editQuotePayment(client, { receipt, changes, newTotal, actor, reason }) {
  if (newTotal !== null && Math.abs(newTotal - num(receipt.total_amount)) > 0.005) {
    fail(422, 'The amount of a quotation payment cannot be edited: one payment can be split across the registration fee, service charges, custom charges, product invoices and the wallet. You can still edit its method, bank, cheque, reference, date, notes and slip.');
  }
  const ptRes = await client.query('SELECT * FROM payment_tracking WHERE payment_id = $1 FOR UPDATE', [receipt.source_id]);
  const pt = ptRes.rows[0];
  if (!pt) fail(409, 'This receipt is not linked to a service-charge payment record, so it cannot be edited.');

  const details = await resolveDetails(client, changes, pt);

  // Everything this payment wrote to the ledger carries the payment's own timestamp, client,
  // method and reference (they are stamped together inside one database transaction).
  const txRes = await client.query(
    `SELECT transaction_id FROM transactions
     WHERE client_id = $1
       AND (payment_tracking_id = $2
            OR (created_at = $3::timestamptz
                AND payment_method IS NOT DISTINCT FROM $4
                AND reference_number IS NOT DISTINCT FROM $5
                AND category::text IN ('REGISTRATION_FEE', 'WALLET_TOPUP', 'BOOKING_PAYMENT', 'PRODUCT_SALE', 'RENTAL_PAYMENT')))
     FOR UPDATE`,
    [pt.client_id, pt.payment_id, pt.payment_date, pt.payment_method, pt.reference_number]
  );
  const txIds = txRes.rows.map((r) => r.transaction_id);

  await client.query(
    `UPDATE payment_tracking
     SET payment_method = $2, bank_account_id = $3, cheque_number = $4, cheque_date = $5,
         reference_number = $6, slip_url = $7, notes = $8, payment_date = COALESCE($9::timestamptz, payment_date)
     WHERE payment_id = $1`,
    [pt.payment_id, details.payment_method, details.bank_account_id, details.cheque_number, details.cheque_date,
      details.reference_number, details.slip_url, details.notes_changed ? details.notes : pt.notes, details.ledger_ts]
  );
  for (const txId of txIds) await updateTx(client, txId, txDetailFields(details), actor, reason);

  if (txIds.length) {
    await client.query(
      `UPDATE invoice_payments
       SET payment_method = $2, bank_account_id = $3, cheque_number = $4, cheque_date = $5,
           reference_number = $6, slip_url = $7
       WHERE transaction_id = ANY($1::uuid[])`,
      [txIds, details.payment_method, details.bank_account_id, details.cheque_number, details.cheque_date,
        details.reference_number, details.slip_url]
    );
  }
  // An overflow that paid off an overdue booking is stored as a direct booking payment.
  await client.query(
    `UPDATE booking_payment_tracking
     SET payment_method = $2, bank_account_id = $3, cheque_number = $4, cheque_date = $5,
         reference_number = $6, slip_url = $7,
         payment_date = COALESCE($8::timestamptz, payment_date)
     WHERE client_id = $1 AND payment_method IS NOT DISTINCT FROM $9 AND payment_method <> 'WALLET'
       AND payment_date = $10::timestamptz AND reference_number IS NOT DISTINCT FROM $11`,
    [pt.client_id, details.payment_method, details.bank_account_id, details.cheque_number, details.cheque_date,
      details.reference_number, details.slip_url, details.ledger_ts, pt.payment_method, pt.payment_date, pt.reference_number]
  );

  return {
    details,
    total_amount: money(receipt.total_amount),
    line_items: receipt.line_items,
    before: { payment_method: pt.payment_method, reference_number: pt.reference_number, notes: pt.notes },
    after: { payment_method: details.payment_method, reference_number: details.reference_number, notes: details.notes },
    reopened: [],
    warnings: [],
  };
}

// The Record Payment flow: a master record plus one allocation per bucket.
async function editClientPayment(client, { receipt, changes, newTotal, actor, reason }) {
  const recRes = await client.query('SELECT * FROM client_payment_records WHERE record_id = $1 FOR UPDATE', [receipt.source_id]);
  const record = recRes.rows[0];
  if (!record) fail(404, 'The payment record behind this receipt no longer exists');
  const clientId = record.client_id;

  const existing = (await client.query(
    'SELECT * FROM client_payment_allocations WHERE record_id = $1 ORDER BY created_at FOR UPDATE',
    [record.record_id]
  )).rows;
  const details = await resolveDetails(client, changes, record);
  await lockWallet(client, clientId);

  // Work out the desired allocations.
  let desired;
  if (changes.allocations !== undefined) {
    let raw = changes.allocations;
    if (typeof raw === 'string') {
      try { raw = JSON.parse(raw); } catch { fail(400, 'allocations must be valid JSON'); }
    }
    if (!Array.isArray(raw) || raw.length === 0) fail(400, 'At least one allocation is required');
    desired = raw.map((a) => ({
      allocation_id: a.allocation_id || null,
      type: a.type,
      amount: money(a.amount),
      booking_id: a.booking_id || null,
      description: String(a.description || '').trim(),
    }));
  } else if (newTotal !== null && Math.abs(newTotal - num(record.total_amount)) > 0.005) {
    if (existing.length !== 1) fail(400, 'This payment is split across several allocations - send the new allocations with the new total.');
    const a = existing[0];
    desired = [{ allocation_id: a.allocation_id, type: a.allocation_type, amount: newTotal, booking_id: a.booking_id, description: a.description || '' }];
  } else {
    desired = existing.map((a) => ({
      allocation_id: a.allocation_id, type: a.allocation_type, amount: money(a.amount),
      booking_id: a.booking_id, description: a.description || '',
    }));
  }

  const total = money(desired.reduce((s, a) => s + a.amount, 0));
  if (newTotal !== null && Math.abs(newTotal - total) > 0.01) {
    fail(400, `Allocation total (${total}) must equal total_amount (${newTotal})`);
  }
  if (total <= 0) fail(400, 'total_amount must be greater than 0');

  for (const a of desired) {
    if (!['BOOKING', 'NEW_BOOKING', 'WALLET', 'OTHER'].includes(a.type)) fail(400, `Invalid allocation type: ${a.type}`);
    if (!(a.amount > 0)) fail(400, 'Each allocation must have a positive amount');
    if (a.type === 'BOOKING' && !a.booking_id) fail(400, 'booking_id is required for BOOKING allocations');
    if (a.type === 'OTHER' && !a.description) fail(400, 'description is required for OTHER allocations');
    if (a.type === 'NEW_BOOKING' && !a.allocation_id) fail(400, 'A new booking cannot be created while editing a payment');
  }

  // Pair desired with existing: same id + same type + same booking = an in-place update,
  // anything else = remove the old bucket and add a new one.
  const byId = new Map(existing.map((a) => [a.allocation_id, a]));
  const updates = [];
  const adds = [];
  const keptIds = new Set();
  for (const d of desired) {
    const old = d.allocation_id ? byId.get(d.allocation_id) : null;
    if (d.allocation_id && !old) fail(400, 'An allocation in the request does not belong to this payment');
    const sameBucket = old && old.allocation_type === d.type && (old.booking_id || null) === (d.booking_id || null);
    if (sameBucket && !keptIds.has(old.allocation_id)) {
      updates.push({ old, d });
      keptIds.add(old.allocation_id);
    } else {
      adds.push(d);
    }
  }
  const removals = existing.filter((a) => !keptIds.has(a.allocation_id));

  const before = {
    total_amount: money(record.total_amount),
    payment_method: record.payment_method,
    reference_number: record.reference_number,
    allocations: existing.map((a) => ({ type: a.allocation_type, amount: money(a.amount), booking_id: a.booking_id, description: a.description })),
  };

  // 1. Removals
  for (const a of removals) {
    if (a.allocation_type === 'NEW_BOOKING') fail(409, 'The allocation that created a new booking cannot be removed');
    if (a.allocation_type !== 'OTHER') {
      await adjustWallet(client, clientId, -num(a.amount));
      await adjustEarmark(client, a.booking_id, -num(a.amount));
    }
    await client.query('DELETE FROM client_payment_allocations WHERE allocation_id = $1', [a.allocation_id]);
    if (a.transaction_id) await client.query('DELETE FROM transactions WHERE transaction_id = $1', [a.transaction_id]);
  }

  // 2. In-place updates
  const txFields = txDetailFields(details);
  for (const { old, d } of updates) {
    const delta = d.amount - num(old.amount);
    if (old.allocation_type !== 'OTHER' && Math.abs(delta) > 0.005) {
      await adjustWallet(client, clientId, delta);
      await adjustEarmark(client, old.booking_id, delta);
    }
    if (old.transaction_id) {
      const fields = { ...txFields, amount: d.amount };
      if (old.allocation_type === 'OTHER') {
        fields.custom_category_label = d.description;
        if (!details.notes_changed) fields.notes = d.description;
      }
      await updateTx(client, old.transaction_id, fields, actor, reason);
    }
    await client.query(
      'UPDATE client_payment_allocations SET amount = $2, description = $3 WHERE allocation_id = $1',
      [old.allocation_id, d.amount, old.allocation_type === 'OTHER' ? d.description : old.description]
    );
  }

  // 3. Additions - same ledger shape as the Record Payment flow.
  const addTs = details.ledger_ts || (localDay(record.payment_date) < localDay(new Date()) ? new Date(localDay(record.payment_date)) : null);
  for (const d of adds) {
    if (d.type === 'OTHER') {
      const tx = await client.query(
        `INSERT INTO transactions (
           client_id, category, custom_category_label, transaction_type, amount,
           payment_method, bank_account_id, cheque_number, cheque_date,
           reference_number, receipt_url, notes, status, verified_by, created_at
         ) VALUES ($1,'OTHER_INCOME',$2,'CREDIT',$3,$4,$5,$6,$7,$8,$9,$10,'COMPLETED',$11,
                   COALESCE($12::timestamptz, CURRENT_TIMESTAMP))
         RETURNING transaction_id`,
        [clientId, d.description, d.amount, details.payment_method, details.bank_account_id,
          details.cheque_number, details.cheque_date, details.reference_number, details.slip_url,
          details.notes || d.description, actor.user_id, addTs]
      );
      await client.query(
        `INSERT INTO client_payment_allocations (record_id, allocation_type, amount, transaction_id, description)
         VALUES ($1,'OTHER',$2,$3,$4)`,
        [record.record_id, d.amount, tx.rows[0].transaction_id, d.description]
      );
      continue;
    }
    if (d.type === 'NEW_BOOKING') fail(400, 'A new booking cannot be created while editing a payment');
    if (d.type === 'BOOKING') {
      const b = await client.query('SELECT client_id, status FROM bookings WHERE booking_id = $1', [d.booking_id]);
      if (b.rows.length === 0) fail(404, `Booking ${d.booking_id} not found`);
      if (b.rows[0].client_id !== clientId) fail(403, `Booking ${d.booking_id} does not belong to this client`);
      if (!['ACTIVE', 'OVERDUE'].includes(b.rows[0].status)) fail(400, `Booking ${d.booking_id} must be ACTIVE or OVERDUE (current status: ${b.rows[0].status})`);
    }
    const transaction_id = await creditClientWallet(client, {
      client_id: clientId,
      earmark_booking_id: d.type === 'BOOKING' ? d.booking_id : null,
      amount: d.amount,
      payment_method: details.payment_method,
      bank_account_id: details.bank_account_id,
      cheque_number: details.cheque_number,
      cheque_date: details.cheque_date,
      reference_number: details.reference_number,
      receipt_url: details.slip_url,
      notes: details.notes || (d.type === 'BOOKING' ? `Payment toward booking ${d.booking_id} credited to wallet` : null),
      verified_by: actor.user_id,
      created_at: addTs,
    });
    await client.query(
      `INSERT INTO client_payment_allocations (record_id, allocation_type, amount, booking_id, transaction_id)
       VALUES ($1,$2,$3,$4,$5)`,
      [record.record_id, d.type, d.amount, d.type === 'BOOKING' ? d.booking_id : null, transaction_id]
    );
  }

  // 4. Reduced credits that were already spent: re-open the latest wallet draw-downs.
  const reopened = await restoreWalletFloor(client, clientId);

  // 5. The master record
  await client.query(
    `UPDATE client_payment_records
     SET total_amount = $2, payment_method = $3, bank_account_id = $4, cheque_number = $5, cheque_date = $6,
         reference_number = $7, slip_url = $8, notes = $9, payment_date = $10::date
     WHERE record_id = $1`,
    [record.record_id, total, details.payment_method, details.bank_account_id, details.cheque_number,
      details.cheque_date, details.reference_number, details.slip_url,
      details.notes_changed ? details.notes : record.notes, details.payment_date]
  );

  // Receipt lines, rebuilt from the final allocations (same wording as the original receipt).
  const finalAllocs = (await client.query(
    'SELECT * FROM client_payment_allocations WHERE record_id = $1 ORDER BY created_at', [record.record_id]
  )).rows;
  const lineItems = [];
  for (const a of finalAllocs) {
    const amt = money(a.amount);
    if (a.allocation_type === 'WALLET') {
      lineItems.push({ label: 'Wallet Top-up', description: 'Credited to client wallet balance', amount: amt });
    } else if (a.allocation_type === 'OTHER') {
      lineItems.push({ label: a.description, description: 'Not linked to a booking or quotation', amount: amt });
    } else {
      const info = await client.query(
        `SELECT b.booking_code, b.service_type, pp.full_name AS patient_name
         FROM bookings b LEFT JOIN patient_profiles pp ON pp.patient_id = b.patient_id
         WHERE b.booking_id = $1`,
        [a.booking_id]
      );
      const row = info.rows[0] || {};
      const parts = [];
      if (row.patient_name) parts.push(`Patient: ${row.patient_name}`);
      if (row.service_type) parts.push(String(row.service_type).replace(/_/g, ' '));
      lineItems.push({
        label: `${a.allocation_type === 'NEW_BOOKING' ? 'New Booking' : 'Booking'} ${row.booking_code || ''}`.trim(),
        description: parts.join(' · '),
        amount: amt,
      });
    }
  }

  return {
    details,
    total_amount: total,
    line_items: lineItems,
    before,
    after: {
      total_amount: total,
      payment_method: details.payment_method,
      reference_number: details.reference_number,
      allocations: finalAllocs.map((a) => ({ type: a.allocation_type, amount: money(a.amount), booking_id: a.booking_id, description: a.description })),
    },
    reopened,
    warnings: [],
  };
}

const HANDLERS = {
  CLIENT_PAYMENT: editClientPayment,
  BOOKING_PAYMENT: editBookingPayment,
  PRODUCT_INVOICE: editProductInvoicePayment,
  QUOTE_PAYMENT: editQuotePayment,
};

// ─── Entry point ─────────────────────────────────────────────────────────────────────
// changes: { total_amount, payment_method, bank_account_id, cheque_number, cheque_date,
//            reference_number, payment_date, notes, slip_url, allocations } - all optional.
// actor:   { user_id, name, role }
async function editReceiptPayment({ receipt_id, changes = {}, reason, actor }) {
  const cleanReason = String(reason || '').trim();
  if (cleanReason.length < 3) fail(400, 'A reason for the edit is required');

  let newTotal = null;
  if (changes.total_amount !== undefined && changes.total_amount !== '') {
    newTotal = money(changes.total_amount);
    if (!(newTotal > 0)) fail(400, 'total_amount must be greater than 0');
  }

  const client = await db.pool.connect();
  let newReceipt;
  let result;
  try {
    await client.query('BEGIN');

    const recRes = await client.query('SELECT * FROM payment_receipts WHERE receipt_id = $1 FOR UPDATE', [receipt_id]);
    const receipt = recRes.rows[0];
    if (!receipt) fail(404, 'Receipt not found');
    if (receipt.voided_at) fail(409, 'This receipt has already been voided and replaced. Edit the current receipt instead.');
    const handler = HANDLERS[receipt.source_type];
    if (!handler) fail(422, `Payments of type ${receipt.source_type} cannot be edited from here`);

    result = await handler(client, { receipt, changes, newTotal, actor, reason: cleanReason });
    const { details } = result;

    // Void the old receipt and issue its replacement (same payment, corrected figures).
    const ins = await client.query(
      `INSERT INTO payment_receipts
         (client_id, source_type, source_id, total_amount, payment_method, payment_date,
          reference_number, cheque_number, bank_account_id, received_from, line_items,
          generated_by, replaces_receipt_id)
       VALUES ($1,$2,$3,$4,$5,COALESCE($6::timestamptz, $7::timestamptz),$8,$9,$10,$11,$12::jsonb,$13,$14)
       RETURNING *`,
      [receipt.client_id, receipt.source_type, receipt.source_id, result.total_amount,
        details.payment_method, details.ledger_ts, receipt.payment_date, details.reference_number,
        details.cheque_number, details.bank_account_id, receipt.received_from,
        JSON.stringify(result.line_items || []), actor.user_id, receipt.receipt_id]
    );
    newReceipt = ins.rows[0];
    await client.query(
      `UPDATE payment_receipts
       SET voided_at = NOW(), voided_by = $2, void_reason = $3, replaced_by_receipt_id = $4
       WHERE receipt_id = $1`,
      [receipt.receipt_id, actor.user_id, cleanReason, newReceipt.receipt_id]
    );

    await client.query(
      `INSERT INTO payment_edit_log
         (client_id, source_type, source_id, old_receipt_id, new_receipt_id, reason,
          before_state, after_state, reopened, edited_by, edited_by_name)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9::jsonb,$10,$11)`,
      [receipt.client_id, receipt.source_type, receipt.source_id, receipt.receipt_id, newReceipt.receipt_id,
        cleanReason, JSON.stringify(result.before || {}), JSON.stringify(result.after || {}),
        JSON.stringify(result.reopened || []), actor.user_id, actor.name]
    );

    await client.query('COMMIT');
    result.old_receipt = receipt;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }

  // The PDF is rendered after commit: a rendering failure must not undo the edit. A receipt
  // without a PDF is regenerated on demand the next time it is sent (see sendReceiptWhatsApp).
  try {
    newReceipt.pdf_url = await generateReceiptPdf(newReceipt);
  } catch (err) {
    console.error(`[PaymentEdit] PDF generation failed for ${newReceipt.receipt_code}:`, err.message);
  }

  return {
    old_receipt: result.old_receipt,
    new_receipt: newReceipt,
    reopened: result.reopened,
    warnings: result.warnings,
    before: result.before,
    after: result.after,
  };
}

// What the edit form needs to open pre-filled: the payment's current details, whether (and
// why not) its amount can be edited, its allocations, and the client's bookings to pick from.
async function getEditContext(receipt_id) {
  const rRes = await db.query('SELECT * FROM payment_receipts WHERE receipt_id = $1', [receipt_id]);
  const receipt = rRes.rows[0];
  if (!receipt) fail(404, 'Receipt not found');

  const ctx = {
    receipt_id: receipt.receipt_id,
    receipt_code: receipt.receipt_code,
    source_type: receipt.source_type,
    client_id: receipt.client_id,
    total_amount: money(receipt.total_amount),
    editable: true,
    reason: null,
    amount_editable: true,
    amount_note: null,
    details: null,
    allocations: null,
    bookings: [],
  };
  if (receipt.voided_at) return { ...ctx, editable: false, reason: 'This receipt was voided and replaced. Edit the current receipt instead.' };
  if (!HANDLERS[receipt.source_type]) {
    return { ...ctx, editable: false, reason: `Payments of type ${receipt.source_type} cannot be edited from here.` };
  }

  const pick = (row) => ({
    payment_method: row.payment_method,
    bank_account_id: row.bank_account_id,
    cheque_number: row.cheque_number,
    cheque_date: row.cheque_date ? localDay(row.cheque_date) : null,
    reference_number: row.reference_number,
    notes: row.notes,
    slip_url: row.slip_url,
    payment_date: localDay(row.payment_date || receipt.payment_date),
  });

  if (receipt.source_type === 'CLIENT_PAYMENT') {
    const rec = (await db.query('SELECT * FROM client_payment_records WHERE record_id = $1', [receipt.source_id])).rows[0];
    if (!rec) return { ...ctx, editable: false, reason: 'The payment record behind this receipt no longer exists.' };
    ctx.details = pick(rec);
    ctx.allocations = (await db.query(
      `SELECT a.allocation_id, a.allocation_type AS type, a.amount, a.booking_id, a.description, b.booking_code
       FROM client_payment_allocations a LEFT JOIN bookings b ON b.booking_id = a.booking_id
       WHERE a.record_id = $1 ORDER BY a.created_at`,
      [rec.record_id]
    )).rows.map((a) => ({ ...a, amount: money(a.amount) }));
  } else if (receipt.source_type === 'BOOKING_PAYMENT') {
    const bpt = (await db.query('SELECT * FROM booking_payment_tracking WHERE booking_payment_id = $1', [receipt.source_id])).rows[0];
    if (!bpt) return { ...ctx, editable: false, reason: 'The booking payment behind this receipt no longer exists.' };
    ctx.details = pick(bpt);
  } else if (receipt.source_type === 'PRODUCT_INVOICE') {
    const cands = (await db.query(
      `SELECT ip.*, ABS(EXTRACT(EPOCH FROM (COALESCE(t.created_at, ip.created_at) - $3::timestamptz))) AS gap
       FROM invoice_payments ip LEFT JOIN transactions t ON t.transaction_id = ip.transaction_id
       WHERE ip.invoice_id = $1 AND ABS(ip.amount - $2) < 0.005 ORDER BY gap, ip.created_at`,
      [receipt.source_id, receipt.total_amount, receipt.payment_date]
    )).rows;
    if (cands.length === 0) return { ...ctx, editable: false, reason: 'The invoice instalment behind this receipt could not be found.' };
    if (cands.length > 1 && Math.abs(num(cands[0].gap) - num(cands[1].gap)) < 2) {
      return { ...ctx, editable: false, reason: 'This invoice has more than one identical instalment, so this receipt cannot be matched to just one of them.' };
    }
    ctx.details = pick({ ...cands[0], payment_date: receipt.payment_date });
  } else if (receipt.source_type === 'QUOTE_PAYMENT') {
    const pt = (await db.query('SELECT * FROM payment_tracking WHERE payment_id = $1', [receipt.source_id])).rows[0];
    if (!pt) return { ...ctx, editable: false, reason: 'This receipt is not linked to a service-charge payment record, so it cannot be edited.' };
    ctx.details = pick(pt);
    ctx.amount_editable = false;
    ctx.amount_note = 'A quotation payment can be split across the registration fee, service charges, custom charges, product invoices and the wallet, so its amount cannot be changed here. Everything else can.';
  }

  if (receipt.source_type === 'CLIENT_PAYMENT') {
    const keep = (ctx.allocations || []).map((a) => a.booking_id).filter(Boolean);
    ctx.bookings = (await db.query(
      `SELECT b.booking_id, b.booking_code, b.service_type, b.status, pp.full_name AS patient_name
       FROM bookings b LEFT JOIN patient_profiles pp ON pp.patient_id = b.patient_id
       WHERE b.client_id = $1 AND (b.status IN ('ACTIVE', 'OVERDUE') OR b.booking_id = ANY($2::uuid[]))
       ORDER BY b.created_at DESC`,
      [receipt.client_id, keep]
    )).rows;
  }
  return ctx;
}

module.exports = { editReceiptPayment, getEditContext, PaymentEditError };
