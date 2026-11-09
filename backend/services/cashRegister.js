// services/cashRegister.js
//
// Frontdesk cash register: ONE shared till per business day.
//
// How the day's numbers are built (nothing here is a parallel ledger):
//   - A payment taken at the desk is a payment_receipts row stamped with the session
//     (register_session_id / register_cashier_id - see receiptService + middleware/
//     registerSession). One receipt = one payment, however many ledger lines it fans out
//     into. Edited payments are reissued receipts that inherit the stamp; voided receipts
//     are excluded from every total.
//   - Money taken out of the drawer (petty cash, client refund, cash banked) is a
//     transactions DEBIT row stamped with the session and a register_entry_kind.
//   - Totals across ALL payment methods describe the day's takings. Only CASH is in the
//     drawer, so the figure the cashier counts against is
//         expected cash = opening float + cash received - cash paid out.

const db = require('../config/db');
const { getPettyCashAccountId } = require('../utils/pettyCash');

class RegisterError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}
const fail = (statusCode, message) => { throw new RegisterError(statusCode, message); };

const num = (v) => parseFloat(v || 0);
const money = (v) => Math.round(num(v) * 100) / 100;

// Server-local calendar day, matching how the rest of the app dates a payment.
function todayLocal() {
  const d = new Date();
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
}

const CASH_OUT_KINDS = ['PETTY_CASH', 'CLIENT_REFUND', 'BANKING'];

// ─── Reads ───────────────────────────────────────────────────────────────────────────

async function getSessionRow(sessionId, executor = db) {
  const r = await executor.query(
    `SELECT s.*,
            to_char(s.business_date, 'YYYY-MM-DD') AS business_date_str
     FROM cash_register_sessions s WHERE s.session_id = $1`,
    [sessionId]
  );
  return r.rows[0] || null;
}

async function getOpenSession(executor = db) {
  const r = await executor.query(
    `SELECT s.*, to_char(s.business_date, 'YYYY-MM-DD') AS business_date_str
     FROM cash_register_sessions s WHERE s.status = 'OPEN' LIMIT 1`
  );
  return r.rows[0] || null;
}

// Per-method takings, cash paid out, and the cash the drawer should hold.
async function getSessionTotals(session, executor = db) {
  const received = await executor.query(
    `SELECT COALESCE(payment_method, 'OTHER') AS payment_method,
            COUNT(*)::int AS payment_count,
            COALESCE(SUM(total_amount), 0) AS total
     FROM payment_receipts
     WHERE register_session_id = $1 AND voided_at IS NULL
     GROUP BY COALESCE(payment_method, 'OTHER')
     ORDER BY 3 DESC`,
    [session.session_id]
  );
  const out = await executor.query(
    `SELECT register_entry_kind AS kind, COUNT(*)::int AS entry_count, COALESCE(SUM(amount), 0) AS total
     FROM transactions
     WHERE register_session_id = $1 AND status = 'COMPLETED' AND transaction_type = 'DEBIT'
       AND register_entry_kind = ANY($2::text[])
     GROUP BY register_entry_kind`,
    [session.session_id, CASH_OUT_KINDS]
  );

  const byMethod = received.rows.map((r) => ({
    payment_method: r.payment_method,
    payment_count: r.payment_count,
    total: money(r.total),
  }));
  const totalReceived = money(byMethod.reduce((s, m) => s + m.total, 0));
  const cashReceived = money(byMethod.find((m) => m.payment_method === 'CASH')?.total || 0);
  const paymentCount = byMethod.reduce((s, m) => s + m.payment_count, 0);

  const cashOutByKind = Object.fromEntries(CASH_OUT_KINDS.map((k) => [k, 0]));
  let cashOutCount = 0;
  for (const r of out.rows) {
    cashOutByKind[r.kind] = money(r.total);
    cashOutCount += r.entry_count;
  }
  const cashOutTotal = money(Object.values(cashOutByKind).reduce((s, v) => s + v, 0));

  const openingFloat = money(session.opening_float);
  const expectedCash = money(openingFloat + cashReceived - cashOutTotal);

  return {
    opening_float: openingFloat,
    payment_count: paymentCount,
    total_received: totalReceived,
    received_by_method: byMethod,
    cash_received: cashReceived,
    non_cash_received: money(totalReceived - cashReceived),
    cash_out_total: cashOutTotal,
    cash_out_count: cashOutCount,
    cash_out_by_kind: cashOutByKind,
    expected_cash: expectedCash,
  };
}

// Every desk entry of the session, newest first: payments (receipts) and cash-outs.
// Voided ones are included so the day reads as it happened; replaced receipts (an edit's
// "before") are left out - the replacement stands in for them.
async function getSessionEntries(sessionId, executor = db) {
  const payments = await executor.query(
    `SELECT r.receipt_id, r.receipt_code, r.source_type, r.client_id, r.received_from,
            r.total_amount, r.payment_method, r.reference_number, r.line_items, r.created_at,
            r.voided_at, r.void_reason, r.replaces_receipt_id, r.register_cashier_id, r.pdf_url,
            COALESCE(sp.full_name, ist.full_name) AS cashier_name
     FROM payment_receipts r
     LEFT JOIN staff_profiles sp ON sp.user_id = r.register_cashier_id
     LEFT JOIN internal_staff ist ON ist.user_id = r.register_cashier_id
     WHERE r.register_session_id = $1
       AND (r.voided_at IS NULL OR r.replaced_by_receipt_id IS NULL)
     ORDER BY r.created_at DESC`,
    [sessionId]
  );
  const cashOuts = await executor.query(
    `SELECT t.transaction_id, t.transaction_code, t.register_entry_kind AS kind, t.amount, t.status,
            t.external_party, t.notes, t.client_id, t.created_at, t.register_voided_at,
            t.register_void_reason, t.register_cashier_id,
            NULLIF(CONCAT_WS(' ', NULLIF(cp.honorific, ''), cp.full_name), '') AS client_name,
            ba.account_nickname AS bank_account_nickname,
            COALESCE(sp.full_name, ist.full_name) AS cashier_name
     FROM transactions t
     LEFT JOIN client_profiles cp ON cp.client_profile_id = t.client_id
     LEFT JOIN staff_profiles sp ON sp.user_id = t.register_cashier_id
     LEFT JOIN internal_staff ist ON ist.user_id = t.register_cashier_id
     LEFT JOIN transactions pair ON pair.register_session_id = t.register_session_id
          AND t.register_entry_kind = 'BANKING' AND pair.register_entry_kind = 'BANKING'
          AND pair.transaction_type = 'CREDIT' AND pair.created_at = t.created_at
          AND pair.amount = t.amount
     LEFT JOIN bank_accounts ba ON ba.account_id = pair.bank_account_id
     WHERE t.register_session_id = $1 AND t.transaction_type = 'DEBIT'
       AND t.register_entry_kind = ANY($2::text[])
     ORDER BY t.created_at DESC`,
    [sessionId, CASH_OUT_KINDS]
  );

  const entries = [
    ...payments.rows.map((r) => ({
      entry_type: 'PAYMENT',
      id: r.receipt_id,
      receipt_id: r.receipt_id,
      receipt_code: r.receipt_code,
      source_type: r.source_type,
      client_id: r.client_id,
      party: r.received_from,
      amount: money(r.total_amount),
      payment_method: r.payment_method,
      reference_number: r.reference_number,
      line_items: r.line_items,
      pdf_url: r.pdf_url,
      cashier_id: r.register_cashier_id,
      cashier_name: r.cashier_name,
      created_at: r.created_at,
      voided: !!r.voided_at,
      void_reason: r.void_reason,
      is_reissue: !!r.replaces_receipt_id,
    })),
    ...cashOuts.rows.map((r) => ({
      entry_type: 'CASH_OUT',
      id: r.transaction_id,
      transaction_id: r.transaction_id,
      transaction_code: r.transaction_code,
      kind: r.kind,
      client_id: r.client_id,
      party: r.kind === 'CLIENT_REFUND' ? r.client_name : r.kind === 'BANKING' ? (r.bank_account_nickname || 'Bank') : r.external_party,
      amount: money(r.amount),
      payment_method: 'CASH',
      notes: r.notes,
      cashier_id: r.register_cashier_id,
      cashier_name: r.cashier_name,
      created_at: r.created_at,
      voided: r.status === 'VOIDED',
      void_reason: r.register_void_reason,
    })),
  ];
  entries.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  return entries;
}

// Session + totals (+ entries when asked) in one object for the API.
async function describeSession(session, { withEntries = true, executor = db } = {}) {
  const totals = await getSessionTotals(session, executor);
  const out = {
    session_id: session.session_id,
    business_date: session.business_date_str || session.business_date,
    status: session.status,
    opening_float: money(session.opening_float),
    suggested_float: session.suggested_float === null ? null : money(session.suggested_float),
    opening_float_note: session.opening_float_note,
    opened_by_name: session.opened_by_name,
    opened_at: session.opened_at,
    // Once closed the figures that were counted against are frozen on the row.
    expected_cash: session.status === 'CLOSED' && session.expected_cash !== null ? money(session.expected_cash) : totals.expected_cash,
    counted_cash: session.counted_cash === null ? null : money(session.counted_cash),
    variance: session.variance === null ? null : money(session.variance),
    variance_note: session.variance_note,
    flagged: session.flagged,
    closed_by_name: session.closed_by_name,
    closed_at: session.closed_at,
    reviewed_by_name: session.reviewed_by_name,
    reviewed_at: session.reviewed_at,
    review_note: session.review_note,
    reopen_count: session.reopen_count,
    last_reopened_by_name: session.last_reopened_by_name,
    last_reopened_at: session.last_reopened_at,
    last_reopen_reason: session.last_reopen_reason,
    totals,
  };
  if (withEntries) out.entries = await getSessionEntries(session.session_id, executor);
  return out;
}

// What the next opening float should default to: the cash counted when the last day closed.
async function getSuggestedFloat(executor = db) {
  const r = await executor.query(
    `SELECT counted_cash FROM cash_register_sessions
     WHERE status = 'CLOSED' AND counted_cash IS NOT NULL
     ORDER BY business_date DESC LIMIT 1`
  );
  return r.rows.length ? money(r.rows[0].counted_cash) : null;
}

// ─── Events ──────────────────────────────────────────────────────────────────────────

async function recordEvent(executor, { sessionId, type, actor, details = {} }) {
  await executor.query(
    `INSERT INTO cash_register_events (session_id, event_type, actor_id, actor_name, details)
     VALUES ($1,$2,$3,$4,$5::jsonb)`,
    [sessionId, type, actor?.user_id || null, actor?.name || null, JSON.stringify(details)]
  );
}

async function getSessionEvents(sessionId) {
  const r = await db.query(
    `SELECT event_type, actor_name, details, created_at
     FROM cash_register_events WHERE session_id = $1 ORDER BY created_at ASC`,
    [sessionId]
  );
  return r.rows;
}

// ─── Open / close / reopen / review ──────────────────────────────────────────────────

async function openDay({ openingFloat, note, actor }) {
  const float = money(openingFloat);
  if (!(float >= 0) || openingFloat === '' || openingFloat === null || openingFloat === undefined || Number.isNaN(num(openingFloat))) {
    fail(400, 'opening_float is required and cannot be negative');
  }

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('LOCK TABLE cash_register_sessions IN SHARE ROW EXCLUSIVE MODE');

    const open = await getOpenSession(client);
    if (open) {
      fail(409, open.business_date_str === todayLocal()
        ? 'Today\'s register is already open.'
        : `The register for ${open.business_date_str} is still open. Close that day before opening a new one.`);
    }
    const today = todayLocal();
    const existing = await client.query('SELECT status FROM cash_register_sessions WHERE business_date = $1', [today]);
    if (existing.rows.length) {
      fail(409, 'Today\'s register has already been opened and closed. A super-admin can reopen it if a correction is needed.');
    }

    const suggested = await getSuggestedFloat(client);
    const cleanNote = String(note || '').trim();
    // A different figure from last night's count means cash appeared or went missing
    // overnight - make the cashier say why.
    if (suggested !== null && Math.abs(float - suggested) > 0.005 && cleanNote.length < 3) {
      fail(400, `The opening float differs from yesterday's counted ${suggested.toFixed(2)}. Please give a reason.`);
    }

    const ins = await client.query(
      `INSERT INTO cash_register_sessions
         (business_date, opening_float, suggested_float, opening_float_note, opened_by, opened_by_name)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [today, float, suggested, cleanNote || null, actor.user_id, actor.name]
    );
    const session = ins.rows[0];
    await recordEvent(client, {
      sessionId: session.session_id, type: 'OPENED', actor,
      details: { opening_float: float, suggested_float: suggested, note: cleanNote || null },
    });
    await client.query('COMMIT');
    return await getSessionRow(session.session_id);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

async function closeDay({ sessionId, countedCash, note, actor }) {
  if (countedCash === '' || countedCash === null || countedCash === undefined || Number.isNaN(num(countedCash)) || num(countedCash) < 0) {
    fail(400, 'counted_cash is required and cannot be negative');
  }
  const counted = money(countedCash);

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const sRes = await client.query('SELECT * FROM cash_register_sessions WHERE session_id = $1 FOR UPDATE', [sessionId]);
    const session = sRes.rows[0];
    if (!session) fail(404, 'Register session not found');
    if (session.status !== 'OPEN') fail(409, 'This register day is already closed');

    const totals = await getSessionTotals(session, client);
    const variance = money(counted - totals.expected_cash);
    const flagged = Math.abs(variance) >= 0.005;
    const cleanNote = String(note || '').trim();
    if (flagged && cleanNote.length < 3) {
      fail(400, `The count differs from the expected cash by ${variance.toFixed(2)}. Please explain the difference.`);
    }

    await client.query(
      `UPDATE cash_register_sessions
       SET status = 'CLOSED', expected_cash = $2, counted_cash = $3, variance = $4, variance_note = $5,
           flagged = $6, closed_by = $7, closed_by_name = $8, closed_at = NOW(),
           reviewed_by = NULL, reviewed_by_name = NULL, reviewed_at = NULL, review_note = NULL
       WHERE session_id = $1`,
      [sessionId, totals.expected_cash, counted, variance, cleanNote || null, flagged, actor.user_id, actor.name]
    );
    await recordEvent(client, {
      sessionId, type: 'CLOSED', actor,
      details: { expected_cash: totals.expected_cash, counted_cash: counted, variance, flagged, note: cleanNote || null, total_received: totals.total_received },
    });
    await client.query('COMMIT');
    return { session: await getSessionRow(sessionId), variance, flagged, expected_cash: totals.expected_cash };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

async function reopenDay({ sessionId, reason, actor }) {
  const cleanReason = String(reason || '').trim();
  if (cleanReason.length < 3) fail(400, 'A reason for reopening is required');

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('LOCK TABLE cash_register_sessions IN SHARE ROW EXCLUSIVE MODE');
    const sRes = await client.query('SELECT * FROM cash_register_sessions WHERE session_id = $1 FOR UPDATE', [sessionId]);
    const session = sRes.rows[0];
    if (!session) fail(404, 'Register session not found');
    if (session.status !== 'CLOSED') fail(409, 'This register day is not closed');
    const open = await getOpenSession(client);
    if (open) fail(409, `The register for ${open.business_date_str} is open. Close it before reopening another day.`);

    await client.query(
      `UPDATE cash_register_sessions
       SET status = 'OPEN', expected_cash = NULL, counted_cash = NULL, variance = NULL, variance_note = NULL,
           flagged = FALSE, closed_by = NULL, closed_by_name = NULL, closed_at = NULL,
           reviewed_by = NULL, reviewed_by_name = NULL, reviewed_at = NULL, review_note = NULL,
           reopen_count = reopen_count + 1, last_reopened_by = $2, last_reopened_by_name = $3,
           last_reopened_at = NOW(), last_reopen_reason = $4
       WHERE session_id = $1`,
      [sessionId, actor.user_id, actor.name, cleanReason]
    );
    await recordEvent(client, {
      sessionId, type: 'REOPENED', actor,
      details: {
        reason: cleanReason,
        previous_close: {
          expected_cash: session.expected_cash === null ? null : money(session.expected_cash),
          counted_cash: session.counted_cash === null ? null : money(session.counted_cash),
          variance: session.variance === null ? null : money(session.variance),
          variance_note: session.variance_note,
          closed_by_name: session.closed_by_name,
          closed_at: session.closed_at,
        },
      },
    });
    await client.query('COMMIT');
    return await getSessionRow(sessionId);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

async function reviewSession({ sessionId, note, actor }) {
  const r = await db.query('SELECT status, flagged, reviewed_at FROM cash_register_sessions WHERE session_id = $1', [sessionId]);
  const session = r.rows[0];
  if (!session) fail(404, 'Register session not found');
  if (session.status !== 'CLOSED') fail(409, 'Only a closed day can be reviewed');
  if (!session.flagged) fail(409, 'This day has no flagged variance to review');
  const cleanNote = String(note || '').trim();
  await db.query(
    `UPDATE cash_register_sessions
     SET reviewed_by = $2, reviewed_by_name = $3, reviewed_at = NOW(), review_note = $4
     WHERE session_id = $1`,
    [sessionId, actor.user_id, actor.name, cleanNote || null]
  );
  await recordEvent(db, { sessionId, type: 'REVIEWED', actor, details: { note: cleanNote || null } });
  return await getSessionRow(sessionId);
}

// ─── Cash out ────────────────────────────────────────────────────────────────────────
// Money leaving the drawer. All three kinds are CASH rows on the Petty Cash account (the
// physical cash pot), stamped to the session so they reduce the expected cash.
//   PETTY_CASH    - small purchase paid from the drawer         (OTHER_EXPENSE)
//   CLIENT_REFUND - cash handed back to a client                (CLIENT_REFUND)
//   BANKING       - cash taken out to be deposited at the bank  (ACCOUNT_TRANSFER pair)
async function recordCashOut({ sessionId, kind, amount, paidTo, clientId, bankAccountId, notes, referenceNumber, actor }) {
  if (!CASH_OUT_KINDS.includes(kind)) fail(400, `kind must be one of: ${CASH_OUT_KINDS.join(', ')}`);
  const value = money(amount);
  if (!(value > 0)) fail(400, 'amount is required and must be greater than 0');
  const cleanNotes = String(notes || '').trim();
  const cleanPaidTo = String(paidTo || '').trim();

  if (kind === 'PETTY_CASH' && !cleanPaidTo) fail(400, 'Please say who was paid');
  if (kind === 'PETTY_CASH' && cleanNotes.length < 3) fail(400, 'Please say what the petty cash was for');
  if (kind === 'CLIENT_REFUND' && !clientId) fail(400, 'Please choose the client being refunded');
  if (kind === 'CLIENT_REFUND' && cleanNotes.length < 3) fail(400, 'Please give the reason for the refund');
  if (kind === 'BANKING' && !bankAccountId) fail(400, 'Please choose the bank account the cash is going to');

  const pettyCashId = await getPettyCashAccountId();
  if (!pettyCashId) fail(500, 'Petty cash account is not configured');

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const sRes = await client.query('SELECT * FROM cash_register_sessions WHERE session_id = $1 FOR UPDATE', [sessionId]);
    const session = sRes.rows[0];
    if (!session) fail(404, 'Register session not found');
    if (session.status !== 'OPEN') fail(409, 'This register day is closed');

    // Can't pay out cash that isn't in the drawer.
    const totals = await getSessionTotals(session, client);
    if (value > totals.expected_cash + 0.005) {
      fail(400, `Only ${totals.expected_cash.toFixed(2)} of cash is in the drawer - cannot pay out ${value.toFixed(2)}.`);
    }

    let result;
    if (kind === 'PETTY_CASH') {
      const tx = await client.query(
        `INSERT INTO transactions
           (category, transaction_type, amount, payment_method, bank_account_id, reference_number,
            external_party, custom_category_label, notes, transaction_date, status, is_manual,
            created_by, verified_by, register_session_id, register_cashier_id, register_entry_kind)
         VALUES ('OTHER_EXPENSE','DEBIT',$1,'CASH',$2,$3,$4,'Petty Cash',$5,CURRENT_DATE,'COMPLETED',TRUE,
                 $6,$6,$7,$6,'PETTY_CASH')
         RETURNING transaction_id`,
        [value, pettyCashId, referenceNumber || null, cleanPaidTo, cleanNotes, actor.user_id, sessionId]
      );
      result = { transaction_id: tx.rows[0].transaction_id };
    } else if (kind === 'CLIENT_REFUND') {
      const c = await client.query('SELECT client_profile_id FROM client_profiles WHERE client_profile_id = $1', [clientId]);
      if (!c.rows.length) fail(404, 'Client not found');
      const tx = await client.query(
        `INSERT INTO transactions
           (client_id, category, transaction_type, amount, payment_method, bank_account_id, reference_number,
            notes, transaction_date, status, is_manual, created_by, verified_by,
            register_session_id, register_cashier_id, register_entry_kind)
         VALUES ($1,'CLIENT_REFUND','DEBIT',$2,'CASH',$3,$4,$5,CURRENT_DATE,'COMPLETED',TRUE,$6,$6,$7,$6,'CLIENT_REFUND')
         RETURNING transaction_id`,
        [clientId, value, pettyCashId, referenceNumber || null, cleanNotes, actor.user_id, sessionId]
      );
      result = { transaction_id: tx.rows[0].transaction_id };
    } else {
      const dest = await client.query('SELECT account_id, account_nickname, is_active, is_petty_cash FROM bank_accounts WHERE account_id = $1', [bankAccountId]);
      const bank = dest.rows[0];
      if (!bank || !bank.is_active) fail(400, 'Bank account not found or not active');
      if (bank.is_petty_cash) fail(400, 'Choose a real bank account, not Petty Cash');
      const stamp = await client.query('SELECT NOW() AS now');
      const at = stamp.rows[0].now;
      const debit = await client.query(
        `INSERT INTO transactions
           (category, transaction_type, amount, payment_method, bank_account_id, reference_number, notes,
            transaction_date, status, is_manual, created_by, verified_by, created_at,
            register_session_id, register_cashier_id, register_entry_kind)
         VALUES ('ACCOUNT_TRANSFER','DEBIT',$1,'ACCOUNT_TRANSFER',$2,$3,$4,CURRENT_DATE,'COMPLETED',TRUE,$5,$5,$6,$7,$5,'BANKING')
         RETURNING transaction_id`,
        [value, pettyCashId, referenceNumber || null, cleanNotes || `Cash banked to ${bank.account_nickname}`, actor.user_id, at, sessionId]
      );
      const credit = await client.query(
        `INSERT INTO transactions
           (category, transaction_type, amount, payment_method, bank_account_id, reference_number, notes,
            transaction_date, status, is_manual, created_by, verified_by, created_at,
            register_session_id, register_cashier_id, register_entry_kind)
         VALUES ('ACCOUNT_TRANSFER','CREDIT',$1,'ACCOUNT_TRANSFER',$2,$3,$4,CURRENT_DATE,'COMPLETED',TRUE,$5,$5,$6,$7,$5,'BANKING')
         RETURNING transaction_id`,
        [value, bankAccountId, referenceNumber || null, cleanNotes || 'Cash deposited from the front desk register', actor.user_id, at, sessionId]
      );
      result = { transaction_id: debit.rows[0].transaction_id, credit_transaction_id: credit.rows[0].transaction_id, bank_account_nickname: bank.account_nickname };
    }

    await recordEvent(client, {
      sessionId, type: 'CASH_OUT', actor,
      details: { kind, amount: value, paid_to: cleanPaidTo || null, client_id: clientId || null, bank_account_id: bankAccountId || null, notes: cleanNotes || null, transaction_id: result.transaction_id },
    });
    await client.query('COMMIT');
    return { ...result, amount: value, kind };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

// Voids a cash-out of an OPEN day. The row stays (status VOIDED) so the day reads as it
// happened; every balance formula in the app counts COMPLETED rows only, so it drops out of
// the Petty Cash account and the drawer total automatically. A banking entry voids both legs.
async function voidCashOut({ transactionId, reason, actor, canManageAll }) {
  const cleanReason = String(reason || '').trim();
  if (cleanReason.length < 3) fail(400, 'A reason for voiding is required');

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const tRes = await client.query(
      `SELECT t.*, s.status AS session_status
       FROM transactions t JOIN cash_register_sessions s ON s.session_id = t.register_session_id
       WHERE t.transaction_id = $1 FOR UPDATE OF t`,
      [transactionId]
    );
    const tx = tRes.rows[0];
    if (!tx || !CASH_OUT_KINDS.includes(tx.register_entry_kind) || tx.transaction_type !== 'DEBIT') {
      fail(404, 'Cash-out entry not found');
    }
    if (tx.session_status !== 'OPEN') fail(409, 'This register day is closed');
    if (tx.status === 'VOIDED') fail(409, 'This entry has already been voided');
    if (!canManageAll && tx.register_cashier_id !== actor.user_id) fail(403, 'You can only void your own entries');

    await client.query(
      `UPDATE transactions
       SET status = 'VOIDED', register_voided_at = NOW(), register_voided_by = $2, register_void_reason = $3
       WHERE transaction_id = $1`,
      [transactionId, actor.user_id, cleanReason]
    );
    if (tx.register_entry_kind === 'BANKING') {
      await client.query(
        `UPDATE transactions
         SET status = 'VOIDED', register_voided_at = NOW(), register_voided_by = $2, register_void_reason = $3
         WHERE register_session_id = $4 AND register_entry_kind = 'BANKING' AND transaction_type = 'CREDIT'
           AND created_at = $5 AND amount = $6 AND status = 'COMPLETED' AND transaction_id <> $1`,
        [transactionId, actor.user_id, cleanReason, tx.register_session_id, tx.created_at, tx.amount]
      );
    }
    await recordEvent(client, {
      sessionId: tx.register_session_id, type: 'CASH_OUT_VOIDED', actor,
      details: { kind: tx.register_entry_kind, amount: money(tx.amount), reason: cleanReason, transaction_id: transactionId },
    });
    await client.query('COMMIT');
    return { session_id: tx.register_session_id, kind: tx.register_entry_kind, amount: money(tx.amount) };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

// Loads a desk payment (receipt) the caller is allowed to edit/void: it must belong to a
// register session that is still OPEN, be current (not voided), and be the caller's own
// unless they may manage everyone's.
async function loadManageableReceipt({ receiptId, user, canManageAll }) {
  const r = await db.query(
    `SELECT r.receipt_id, r.receipt_code, r.register_session_id, r.register_cashier_id, r.voided_at,
            s.status AS session_status
     FROM payment_receipts r
     LEFT JOIN cash_register_sessions s ON s.session_id = r.register_session_id
     WHERE r.receipt_id = $1`,
    [receiptId]
  );
  const receipt = r.rows[0];
  if (!receipt || !receipt.register_session_id) fail(404, 'This payment was not taken through the cash register');
  if (receipt.session_status !== 'OPEN') fail(409, 'This register day is closed. Ask a super-admin to reopen it to make changes.');
  if (receipt.voided_at) fail(409, 'This payment has already been voided or replaced');
  if (!canManageAll && receipt.register_cashier_id !== user.user_id) fail(403, 'You can only change your own entries');
  return receipt;
}

module.exports = {
  RegisterError,
  todayLocal,
  CASH_OUT_KINDS,
  getSessionRow,
  getOpenSession,
  getSessionTotals,
  getSessionEntries,
  describeSession,
  getSuggestedFloat,
  getSessionEvents,
  recordEvent,
  openDay,
  closeDay,
  reopenDay,
  reviewSession,
  recordCashOut,
  voidCashOut,
  loadManageableReceipt,
};
