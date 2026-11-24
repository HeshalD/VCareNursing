// services/statementLedger.js
// The one place that decides what a client's Statement of Accounts contains.
//
// The statement is modelled on the Zoho Books one the business used before this system:
//   * one running balance where OWING IS POSITIVE (invoices raise it, payments lower it,
//     credit shows as a negative balance);
//   * only REAL money counts as a payment — a draw from the wallet moves money the client
//     already paid, so it is hidden (counting it as well as the top-up double-counted it);
//   * payments are applied to the oldest unpaid invoice first (the Zoho statement printed that as
//     "LKR3,800.00 for payment of INV-…" lines). We still work it out - `allocations` on every row -
//     but the lines are NOT printed by default: clients found them confusing. Pass
//     { showAllocations: true } to buildStatement for the detailed version.
//   * wording is plain language ("Care service - 05 Nov 2026", "Invoice INV-…", "Invoice Cancelled"),
//     not accounting jargon.
//
// Everything here except loadLedgerRows() is pure (no database), so the Zoho scenario is
// unit-tested in tests/statementLedger.test.js.

const { transactionEditColumns } = require('../utils/editedAmount');

const STATEMENT_TZ = 'Asia/Colombo';

// ── small helpers ────────────────────────────────────────────────────────────

const toCents = (v) => Math.round((Number(v) + Number.EPSILON) * 100);
const fromCents = (c) => c / 100;

// 12345.6 -> "12,345.60", -5 -> "-5.00"
const fmtMoney = (n) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const colomboDateOf = (value) => new Date(value).toLocaleDateString('en-CA', { timeZone: STATEMENT_TZ }); // YYYY-MM-DD

// Accepts 'YYYY-MM-DD', a Date or any ISO string; always returns the Sri Lanka calendar day.
const toColomboDay = (value) => {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  if (value instanceof Date || typeof value === 'string') {
    const s = value instanceof Date ? value.toISOString() : value;
    // A bare date followed by a time ("2026-07-01T00:00:00Z" from a DATE column cast) is still a
    // plain calendar day; only real instants need the time-zone shift.
    const m = /^(\d{4}-\d{2}-\d{2})T00:00:00(\.0+)?Z$/.exec(s);
    if (m && !(value instanceof Date)) return m[1];
    return colomboDateOf(s);
  }
  throw new Error('Invalid statement date');
};

// "2026-07-01" -> "01 Jul 2026" (fixed month names: Node's en-GB prints "Sept")
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const fmtDay = (day) => {
  const [y, m, d] = String(day).slice(0, 10).split('-');
  return `${d} ${MONTHS[Number(m) - 1]} ${y}`;
};

// ── classification ───────────────────────────────────────────────────────────

const KIND = {
  INVOICE: 'INVOICE',
  PAYMENT: 'PAYMENT',
  CREDIT_NOTE: 'CREDIT_NOTE',
  REFUND: 'REFUND',
  FORFEIT: 'FORFEIT',
  ADJUSTMENT: 'ADJUSTMENT',
};

const LABEL = {
  INVOICE: 'Invoice',
  PAYMENT: 'Payment Received',
  CREDIT_NOTE: 'Credit',
  REFUND: 'Refund',
  FORFEIT: 'Unused Advance Payment',
  ADJUSTMENT: 'Adjustment',
};

// +1 raises what the client owes, -1 lowers it.
const SIGN = { INVOICE: 1, PAYMENT: -1, CREDIT_NOTE: -1, REFUND: 1, FORFEIT: 1 };

// Sort order within one day. Invoices first, so a payment made that day pays that day's invoice
// (the Zoho statement does the same).
const RANK = { INVOICE: 0, CREDIT_NOTE: 1, PAYMENT: 2, ADJUSTMENT: 3, REFUND: 4, FORFEIT: 5 };

const INV_CODE_RE = /^(INV-[A-Za-z0-9-]+)/;
const invoiceCodeFromNotes = (notes) => {
  const m = INV_CODE_RE.exec(String(notes || '').trim());
  return m ? m[1] : null;
};
// "INV-000041 — Transport" -> "Transport"
const descriptionFromNotes = (notes) => {
  const s = String(notes || '').trim();
  const i = s.indexOf(' — ');
  return i >= 0 ? s.slice(i + 3).trim() : '';
};
// "Reversal of 2026-11-05 invoice (unpaid, charge cancelled) — Nopay" -> "Nopay"
const reasonFromReversalNotes = (notes) => {
  const s = String(notes || '');
  const i = s.indexOf(' — ');
  return i >= 0 ? s.slice(i + 3).trim() : '';
};

const METHOD_TEXT = { BANK_TRANSFER: 'Bank transfer', CASH: 'Cash', CHEQUE: 'Cheque', CARD: 'Card', ONLINE: 'Online payment' };
const methodText = (m) => {
  const key = String(m || '').toUpperCase();
  if (!key) return '';
  return METHOD_TEXT[key] || key.charAt(0) + key.slice(1).toLowerCase().replace(/_/g, ' ');
};
// RCP-… is a receipt number; anything else (TR-… / a Zoho payment number) is just a reference.
const paymentRefText = (n) => (n ? (/^RCP/i.test(n) ? `Receipt ${n}` : `Ref ${n}`) : '');

const creditNoteNumber = (r) => `CN-${String(r.transaction_code || r.transaction_id).replace(/^TR-/, '')}`;

/**
 * Turns one ledger row into zero, one or two statement rows. Returns { rows, unclassified }.
 * `rows` carry no running balance yet.
 *
 * The rules (see the table in the implementation plan):
 *   invoices (care day, product/rental, registration fee) ........ INVOICE
 *   real money in (top-up, direct booking/product/reg-fee payment) PAYMENT
 *   credit with method WALLET / "Auto-applied from client wallet" HIDDEN  (same money as the top-up)
 *   WALLET_DEBIT mirror, WALLET_DEPOSIT audit rows ............... HIDDEN
 *   WALLET_REFUND (reversed day, correction) ..................... CREDIT_NOTE
 *   CLIENT_REFUND / DEPOSIT_REFUND ............................... REFUND
 *   SETTLEMENT_FORFEITURE ........................................ FORFEIT
 *   WALLET_ADJUSTMENT ............................................ ADJUSTMENT
 */
function classifyRow(r) {
  const cat = String(r.category || '');
  const type = String(r.transaction_type || '');
  const method = String(r.payment_method || '').toUpperCase();
  const notes = String(r.notes || '');
  const amount = toCents(r.amount);
  const hidden = { rows: [], unclassified: null };
  if (!(amount > 0)) return hidden;
  if (r.staff_profile_id) return hidden;
  if (r.status && ['VOIDED', 'VOID', 'CANCELLED', 'FAILED', 'REJECTED'].includes(String(r.status).toUpperCase())) return hidden;

  const base = {
    transaction_id: r.transaction_id,
    transaction_ids: [r.transaction_id],
    date: r.eff_date,
    ts: r.created_at ? new Date(r.created_at).getTime() : 0,
    // Exact (microsecond) creation instant: entries made by one action share it. A backdated payment is
    // stamped at exactly midnight, which is only a DATE (unrelated payments share it), so it is not used.
    created_key: r.created_key && !/ 00:00:00\.000000$/.test(r.created_key) ? r.created_key : null,
    amount,
    booking_code: r.booking_code || null,
    receipt_code: r.receipt_code || null,
    original_amount: r.original_amount ?? null,
    edited_at: r.edited_at ?? null,
    edited_by_name: r.edited_by_name ?? null,
    edit_reason: r.edit_reason ?? null,
    edit_count: r.edit_count ?? null,
    category: cat,
  };
  const one = (extra) => ({ rows: [{ ...base, ...extra }], unclassified: null });

  const invoiceRow = () => {
    const code = r.invoice_code || invoiceCodeFromNotes(notes);
    // Said only when it is not simply the day of the charge (product / registration invoices can be due later).
    const dueLine = r.due_date && r.due_date !== r.eff_date ? [`Due ${fmtDay(r.due_date)}`] : [];
    let lines;
    if (cat === 'REGISTRATION_FEE') {
      lines = ['Registration Fee', ...dueLine];
    } else if (cat === 'PRODUCT_INVOICE') {
      lines = [descriptionFromNotes(notes) || 'Product charge', ...dueLine];
    } else {
      lines = [`Care service - ${fmtDay(r.eff_date)}`];
    }
    if (code) lines.push(`Invoice ${code}`);
    return one({ kind: KIND.INVOICE, doc_number: code, details: lines.join('\n') });
  };

  // ── debits ──
  if (type === 'DEBIT') {
    if (cat === 'SERVICE_INVOICE' || cat === 'PRODUCT_INVOICE' || cat === 'REGISTRATION_FEE') return invoiceRow();
    if (cat === 'WALLET_DEBIT') return hidden;
    if (cat === 'CLIENT_REFUND' || cat === 'DEPOSIT_REFUND') {
      return one({ kind: KIND.REFUND, doc_number: null, details: descriptionFromNotes(notes) || notes.split('|')[0].trim() || 'Refund' });
    }
    if (cat === 'WALLET_ADJUSTMENT') {
      return one({ kind: KIND.ADJUSTMENT, direction: 1, doc_number: null, details: notes });
    }
    return { rows: [], unclassified: `${cat}/DEBIT` };
  }

  // ── credits ──
  if (type === 'CREDIT') {
    if (cat === 'WALLET_REFUND') {
      if (notes.includes('Settlement action: WALLET_DEPOSIT')) return hidden; // audit row, no money moved
      const reason = reasonFromReversalNotes(notes);
      const row = {
        kind: KIND.CREDIT_NOTE,
        doc_number: creditNoteNumber(r),
        reverses_transaction_id: r.reverses_transaction_id || null,
        reverses_day: r.reversed_service_date || null,
        reason,
        details: null, // filled in once the invoice number it reverses is known
        raw_notes: notes,
      };
      const rows = [{ ...base, ...row }];
      if (/bank refund/i.test(notes)) {
        // Cash left the system outside the ledger: show the refund too so the balance nets out.
        rows.push({
          ...base, transaction_id: `${r.transaction_id}:refund`, transaction_ids: [r.transaction_id],
          kind: KIND.REFUND, doc_number: null, details: 'Refund processed externally', ts: base.ts + 1,
        });
      }
      return { rows, unclassified: null };
    }
    if (cat === 'SETTLEMENT_FORFEITURE') {
      return one({ kind: KIND.FORFEIT, doc_number: null, details: 'Unused advance payment, not refunded' });
    }
    if (cat === 'WALLET_ADJUSTMENT') {
      return one({ kind: KIND.ADJUSTMENT, direction: -1, doc_number: null, details: notes });
    }
    // Everything else is money in — unless it is a wallet draw, which only moves money already counted.
    if (method === 'WALLET' || /^Auto-applied from client wallet/i.test(notes)) return hidden;
    const number = r.receipt_code || r.transaction_code || null;
    return one({ kind: KIND.PAYMENT, doc_number: number, details: null, payment_method: (r.payment_method || '').toUpperCase() });
  }

  return { rows: [], unclassified: `${cat}/${type}` };
}

// ── building the statement ───────────────────────────────────────────────────

const signedEffect = (row) => {
  if (row.kind === KIND.ADJUSTMENT) return row.direction * row.amount;
  return SIGN[row.kind] * row.amount;
};

// One payment from the client is one row on the statement, however the system booked it.
// A single transfer is often stored as several ledger entries (service charges credited to the wallet,
// a product invoice, the registration fee). Entries belong together when
//   * they share a receipt, or
//   * they were created by the same action (identical creation instant, to the microsecond), by the
//     same client, with the same payment method — and do not carry two DIFFERENT receipts.
function mergeSharedReceipts(rows) {
  const out = [];
  const payments = [];
  for (const row of rows) {
    if (row.kind !== KIND.PAYMENT) { out.push(row); continue; }
    const home = payments.find((p) => {
      if (row.receipt_code && p.receipt_code) return row.receipt_code === p.receipt_code;
      return row.created_key && p.created_key === row.created_key && (row.payment_method || '') === (p.payment_method || '');
    });
    if (!home) { payments.push(row); out.push(row); continue; }

    home.amount += row.amount;
    home.transaction_ids.push(...row.transaction_ids);
    if (row.date < home.date) home.date = row.date;
    if (row.ts < home.ts) home.ts = row.ts;
    // The number shown is the receipt when any part of the payment has one.
    if (!home.receipt_code && row.receipt_code) { home.receipt_code = row.receipt_code; home.doc_number = row.doc_number; }
    if (!home.booking_code && row.booking_code) home.booking_code = row.booking_code;
    else if (row.booking_code && home.booking_code !== row.booking_code) home.extra_bookings = [...(home.extra_bookings || []), row.booking_code];
    if (home.original_amount == null && row.original_amount != null) {
      home.original_amount = row.original_amount; home.edited_at = row.edited_at;
      home.edited_by_name = row.edited_by_name; home.edit_reason = row.edit_reason; home.edit_count = row.edit_count;
    }
  }
  return out;
}

const bookingTag = (code, multi) => (multi && code ? ` (${code})` : '');

/**
 * @param {Array} classifiedRows  rows from classifyRow(), unsorted
 * @param {{start:string,end:string}} range  Sri Lanka calendar days (inclusive)
 * @param {{showAllocations?:boolean}} opts  print the "LKR… for payment of INV-…" lines (default: no)
 */
function buildStatement(classifiedRows, { start, end }, { showAllocations = false } = {}) {
  let rows = mergeSharedReceipts(classifiedRows.filter((r) => r.date <= end));
  rows.sort((a, b) =>
    (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)
    || RANK[a.kind] - RANK[b.kind]
    || a.ts - b.ts
    || String(a.transaction_id).localeCompare(String(b.transaction_id)));

  const allBookings = new Set();
  for (const r of rows) {
    if (r.booking_code) allBookings.add(r.booking_code);
    (r.extra_bookings || []).forEach((c) => allBookings.add(c));
  }
  const multiBooking = allBookings.size > 1;

  // Credit notes name the invoice they cancel.
  const invoiceById = new Map();
  for (const r of rows) if (r.kind === KIND.INVOICE) invoiceById.set(String(r.transaction_id), r);

  const open = [];  // unpaid invoices, oldest first: { row, remaining }
  const pool = [];  // unapplied credit, oldest first: { ref, remaining }
  let balance = 0;
  let opening = 0;
  let openingSet = false;
  const out = [];

  const takeFromPool = (need, invoiceEntry, annotations) => {
    for (const credit of pool) {
      if (need <= 0) break;
      if (credit.remaining <= 0) continue;
      const take = Math.min(need, credit.remaining);
      credit.remaining -= take;
      need -= take;
      annotations.push(`LKR${fmtMoney(fromCents(take))} from ${credit.refLabel}`);
    }
    invoiceEntry.remaining = need;
    while (pool.length && pool[0].remaining <= 0) pool.shift();
  };

  // Applies a credit to open invoices oldest first; leftover becomes pool credit.
  const applyCredit = (row, { targetId = null } = {}) => {
    const lines = [];
    let left = row.amount;
    const targets = [];
    if (targetId && invoiceById.has(String(targetId))) {
      const t = open.find((o) => String(o.row.transaction_id) === String(targetId));
      if (t) targets.push(t);
    }
    if (!targets.length) targets.push(...open);
    for (const t of targets) {
      if (left <= 0) break;
      if (t.remaining <= 0) continue;
      const take = Math.min(left, t.remaining);
      t.remaining -= take;
      left -= take;
      // A credit note that cancels its own invoice already says so in its details line.
      if (row.kind === KIND.CREDIT_NOTE && targetId && String(t.row.transaction_id) === String(targetId)) continue;
      const label = row.kind === KIND.CREDIT_NOTE ? 'credit note against' : 'payment of';
      lines.push(`LKR${fmtMoney(fromCents(take))} for ${label} ${t.row.doc_number || (t.row.category === 'REGISTRATION_FEE' ? 'Registration Fee' : 'invoice')}${bookingTag(t.row.booking_code, multiBooking)}`);
    }
    for (let i = open.length - 1; i >= 0; i--) if (open[i].remaining <= 0) open.splice(i, 1);
    if (left > 0) {
      const refLabel = row.kind === KIND.CREDIT_NOTE
        ? `credit note ${row.doc_number}`
        : `payment ${row.doc_number || ''}`.trim();
      pool.push({ remaining: left, refLabel });
      if (row.kind !== KIND.CREDIT_NOTE) lines.push(`LKR${fmtMoney(fromCents(left))} in excess payments`);
    }
    return lines;
  };

  for (const row of rows) {
    // Opening balance = everything strictly before the period start.
    if (!openingSet && row.date >= start) { opening = balance; openingSet = true; }

    const annotations = [];
    if (row.kind === KIND.INVOICE) {
      const entry = { row, remaining: row.amount };
      takeFromPool(row.amount, entry, annotations);
      if (entry.remaining > 0) open.push(entry);
    } else if (row.kind === KIND.PAYMENT) {
      annotations.push(...applyCredit(row));
    } else if (row.kind === KIND.CREDIT_NOTE) {
      const target = row.reverses_transaction_id ? invoiceById.get(String(row.reverses_transaction_id)) : null;
      const ref = target ? target.doc_number : null;
      const dayText = row.reverses_day ? ` (care on ${fmtDay(row.reverses_day)})` : '';
      // A revoked day links to the invoice it cancels; anything else is a plain credit to the account.
      if (ref || row.reverses_day) {
        row.label = 'Invoice Cancelled';
        row.details = ref ? `Invoice ${ref} cancelled${dayText}` : `Invoice cancelled${dayText}`;
      } else {
        row.details = 'Credit applied to your account';
      }
      if (row.reason) row.details += `\n${row.reason}`;
      annotations.push(...applyCredit(row, { targetId: row.reverses_transaction_id }));
    } else if (row.kind === KIND.ADJUSTMENT && row.direction < 0) {
      annotations.push(...applyCredit({ ...row, kind: KIND.PAYMENT, doc_number: row.doc_number }));
    } else if (row.kind === KIND.ADJUSTMENT) {
      const entry = { row, remaining: row.amount };
      takeFromPool(row.amount, entry, annotations);
      if (entry.remaining > 0) open.push(entry);
    } else {
      // Refund / forfeit: takes credit back out of the pool (oldest first); any shortfall is owed.
      let need = row.amount;
      for (const credit of pool) {
        if (need <= 0) break;
        const take = Math.min(need, credit.remaining);
        credit.remaining -= take; need -= take;
      }
      while (pool.length && pool[0].remaining <= 0) pool.shift();
      if (need > 0) open.push({ row, remaining: need });
    }

    balance += signedEffect(row);
    row._balance = balance;
    row._annotations = annotations;
    out.push(row);
  }
  if (!openingSet) opening = balance;

  // ── shape the visible rows ──
  const visible = out.filter((r) => r.date >= start && r.date <= end);
  let invoiced = 0;
  let paid = 0;
  const ledger = visible.map((r) => {
    const debit = signedEffect(r) > 0;
    if (debit) invoiced += r.amount; else paid += r.amount;
    const detailLines = [];
    if (r.kind === KIND.PAYMENT) {
      const head = [methodText(r.payment_method), paymentRefText(r.doc_number)].filter(Boolean).join(' - ');
      if (head) detailLines.push(head);
      if (r.details) detailLines.push(r.details);
    } else if (r.details) {
      detailLines.push(r.details);
    }
    const codes = [r.booking_code, ...(r.extra_bookings || [])].filter(Boolean);
    if (codes.length && r.kind !== KIND.ADJUSTMENT) detailLines.push(`Booking ${[...new Set(codes)].join(', ')}`);
    if (showAllocations) detailLines.push(...r._annotations);
    return {
      transaction_id: r.transaction_id,
      transaction_ids: r.transaction_ids,
      date: r.date,
      row_type: r.kind,
      label: r.label || LABEL[r.kind],
      doc_number: r.doc_number || null,
      details: detailLines.join('\n'),
      booking_codes: [...new Set(codes)],
      annotations: showAllocations ? r._annotations : [], // the lines printed in `details`
      allocations: r._annotations, // always: how the payment/credit was applied, for the detailed view
      amount_invoiced: debit ? fromCents(r.amount) : 0,
      amount_paid: debit ? 0 : fromCents(r.amount),
      balance: fromCents(r._balance),
      payment_method: r.payment_method || null,
      original_amount: r.original_amount,
      edited_at: r.edited_at,
      edited_by_name: r.edited_by_name,
      edit_reason: r.edit_reason,
      edit_count: r.edit_count,
    };
  });

  return {
    opening: fromCents(opening),
    invoiced: fromCents(invoiced),
    paid: fromCents(paid),
    balance: fromCents(opening + invoiced - paid),
    ledger,
    multiBooking,
  };
}

// ── loading ──────────────────────────────────────────────────────────────────

/**
 * Every ledger row for a client up to the end of `endDay`. The WHOLE history is needed, not just
 * the period, because the payment allocation lines ("payment of INV-155488") refer to older invoices.
 */
async function loadLedgerRows(clientId, endDay) {
  const db = require('../config/db'); // lazy: the pure logic above is unit-tested without a database
  const res = await db.query(
    `SELECT
        t.transaction_id, t.transaction_code, t.category::text AS category, t.transaction_type::text AS transaction_type,
        t.amount, t.payment_method, t.notes, t.created_at, t.status, t.staff_profile_id,
        to_char(t.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS.US') AS created_key,
        COALESCE(b.booking_code, eb.booking_code) AS booking_code,
        CASE WHEN t.category::text = 'SERVICE_INVOICE' AND d.service_date IS NOT NULL
             THEN to_char(d.service_date, 'YYYY-MM-DD')
             ELSE to_char(t.created_at AT TIME ZONE '${STATEMENT_TZ}', 'YYYY-MM-DD') END AS eff_date,
        inv.invoice_code, to_char(inv.due_date, 'YYYY-MM-DD') AS due_date,
        rev.transaction_id AS reverses_transaction_id,
        to_char(rev.service_date, 'YYYY-MM-DD') AS reversed_service_date,
        rcp.receipt_code,
        ${transactionEditColumns('t')}
     FROM transactions t
     LEFT JOIN bookings b  ON b.booking_id  = t.booking_id
     LEFT JOIN bookings eb ON eb.booking_id = t.earmarked_booking_id
     LEFT JOIN LATERAL (SELECT service_date FROM booking_daily_invoices WHERE transaction_id = t.transaction_id LIMIT 1) d ON true
     LEFT JOIN LATERAL (SELECT transaction_id, service_date FROM booking_daily_invoices WHERE reversal_transaction_id = t.transaction_id LIMIT 1) rev ON true
     LEFT JOIN LATERAL (SELECT invoice_code, due_date FROM invoices WHERE charge_transaction_id = t.transaction_id LIMIT 1) inv ON true
     LEFT JOIN LATERAL (
        SELECT pr.receipt_code
        FROM payment_receipts pr
        WHERE t.transaction_type::text = 'CREDIT' AND COALESCE(t.payment_method, '') <> 'WALLET' AND (
              pr.source_id = (SELECT a.record_id FROM client_payment_allocations a WHERE a.transaction_id = t.transaction_id LIMIT 1)
           OR (t.payment_tracking_id IS NOT NULL AND pr.source_id = t.payment_tracking_id)
           OR (t.quote_id IS NOT NULL AND pr.source_type = 'QUOTE_PAYMENT'
               AND pr.source_id IN (SELECT p.payment_id FROM payment_tracking p WHERE p.quote_id = t.quote_id AND p.client_id = t.client_id)
               AND abs(extract(epoch FROM pr.payment_date - t.created_at)) < 172800)
           OR (t.category::text = 'BOOKING_PAYMENT' AND pr.source_type = 'BOOKING_PAYMENT' AND pr.client_id = t.client_id
               AND pr.total_amount = t.amount AND abs(extract(epoch FROM pr.payment_date - t.created_at)) < 172800)
        )
        ORDER BY abs(extract(epoch FROM pr.payment_date - t.created_at)) LIMIT 1
     ) rcp ON true
     WHERE t.client_id = $1 AND t.staff_profile_id IS NULL
       AND COALESCE(t.status, 'COMPLETED') NOT IN ('VOIDED', 'VOID', 'CANCELLED', 'FAILED', 'REJECTED')
     ORDER BY t.created_at, t.transaction_id`,
    [clientId]
  );
  return res.rows.filter((r) => r.eff_date <= endDay);
}

const ALL_TIME_START = '1970-01-01';

/**
 * What the PDF template prints (all numbers already formatted). Pure.
 * "All time" has no real start date, so the first entry's day is shown instead of 01 Jan 1970.
 */
function toPdfData(clientName, st) {
  const firstDay = st.ledger.length ? st.ledger[0].date : st.end;
  const periodStartDay = st.start === ALL_TIME_START ? firstDay : st.start;
  return {
    clientName,
    periodStart: fmtDay(periodStartDay),
    periodEnd: fmtDay(st.end),
    summary: {
      openingBalance: fmtMoney(st.opening),
      invoicedAmount: fmtMoney(st.invoiced),
      amountPaid: fmtMoney(st.paid),
      balanceDue: fmtMoney(st.balance),
    },
    ledger: [
      {
        date: fmtDay(periodStartDay), transactions: '***Opening Balance***', details: '',
        amount: fmtMoney(st.opening), payments: '', balance: fmtMoney(st.opening), isOpening: true,
      },
      ...st.ledger.map((line) => ({
        date: fmtDay(line.date),
        transactions: line.label,
        details: line.details || '',
        amount: line.amount_invoiced ? fmtMoney(line.amount_invoiced) : '',
        payments: line.amount_paid ? fmtMoney(line.amount_paid) : '',
        balance: fmtMoney(line.balance),
        isOpening: false,
      })),
    ],
  };
}

/** Loads + classifies + builds. `start`/`end` may be dates or ISO strings. */
async function getClientStatementData(clientId, startValue, endValue) {
  const start = toColomboDay(startValue);
  const end = toColomboDay(endValue);
  const raw = await loadLedgerRows(clientId, end);
  const classified = [];
  const unclassified = new Set();
  for (const r of raw) {
    const { rows, unclassified: u } = classifyRow(r);
    classified.push(...rows);
    if (u) unclassified.add(u);
  }
  if (unclassified.size) console.warn('[statement] unclassified ledger rows hidden:', [...unclassified].join(', '), 'client', clientId);
  return { ...buildStatement(classified, { start, end }), start, end };
}

module.exports = {
  KIND, LABEL,
  fmtMoney, fmtDay, toColomboDay, toCents,
  classifyRow, buildStatement, mergeSharedReceipts, toPdfData,
  loadLedgerRows, getClientStatementData,
};
