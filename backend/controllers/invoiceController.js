// Generic invoice handling for anything that isn't a booking daily-invoice
// (see bookingController.getBookingDailyInvoices/confirmDailyInvoice) or a
// registration-fee invoice (see clientController's reg-fee endpoints).
// Phase 1 only produces category = 'PRODUCT' invoices, created once a
// quote_type = 'PRODUCT' quotation is accepted.

const db = require('../config/db');
const html_to_pdf = require('html-pdf-node');
const estimateTemplate = require('../templates/estimateTemplate');
const { uploadBufferToS3 } = require('../config/s3Config');
const { logActivity } = require('../utils/activityLogger');
const { createPaymentReceipt } = require('../services/receiptService');
const { ensureCombinedInvoice } = require('./quoteController');
const { sendClientInvoice } = require('../utils/metaWhatsapp');
const { resolveBankAccountId } = require('../utils/pettyCash');

const VALID_PAYMENT_METHODS = ['BANK_TRANSFER', 'CASH_DEPOSIT', 'CASH', 'CHEQUE'];

function extractActorRole(role) {
  const raw = Array.isArray(role) ? role[0] : role;
  return typeof raw === 'string' ? raw.replace(/\{|\}/g, '').split(',')[0].trim() : String(raw);
}

async function safeLog(params) {
  try {
    await logActivity(params);
  } catch (err) {
    console.error('Activity log error:', err);
  }
}

// POST /api/product-invoices/from-quote/:quote_id
// Snapshots an accepted PRODUCT quotation's total into a new PENDING invoice.
// Locks the quotations row for the duration of the check+insert so two
// concurrent calls (e.g. PaymentAllocationModal's auto-invoice effect firing
// twice) can't both pass the "no existing invoice" check and create
// duplicate invoices for the same quote — the second caller blocks on the
// row lock and then sees the first caller's insert.
exports.createInvoiceFromQuote = async (req, res) => {
  const { quote_id } = req.params;
  const { due_date } = req.body;
  const pgClient = await db.pool.connect();

  try {
    await pgClient.query('BEGIN');

    const quoteResult = await pgClient.query(
      `SELECT quote_id, quote_type, client_id, walk_in_customer_id, total_amount, status
       FROM quotations WHERE quote_id = $1 FOR UPDATE`,
      [quote_id]
    );

    if (quoteResult.rows.length === 0) {
      await pgClient.query('ROLLBACK');
      return res.status(404).json({ message: 'Quote not found' });
    }

    const quote = quoteResult.rows[0];
    if (quote.quote_type !== 'PRODUCT') {
      await pgClient.query('ROLLBACK');
      return res.status(400).json({ message: 'Only PRODUCT quotes can be invoiced through this endpoint' });
    }

    // This endpoint only knows how to fold a quote's total_amount into one
    // flat invoice — it has no concept of RENTAL line items, which need their
    // own rental_agreements row + unit marked RENTED (see
    // quoteController.acceptProductQuote / createRentalAgreementCore). If we
    // let a rental slip through here, the client gets charged the full
    // amount but the rental is never actually recorded as out — see the
    // EST-1368/BED-003 incident. Route those quotes through /accept instead.
    const rentalCheck = await pgClient.query(
      `SELECT 1 FROM quote_line_items li
       JOIN products p ON li.product_id = p.product_id
       WHERE li.quote_id = $1 AND p.product_type = 'RENTAL' LIMIT 1`,
      [quote_id]
    );
    if (rentalCheck.rows.length > 0) {
      await pgClient.query('ROLLBACK');
      return res.status(400).json({
        message: 'This quote contains rental items and must be accepted via POST /api/quotes/product/:quote_id/accept instead — that endpoint creates the rental agreement(s) and marks the unit(s) as rented.',
      });
    }

    const existing = await pgClient.query('SELECT invoice_id FROM invoices WHERE quote_id = $1', [quote_id]);
    if (existing.rows.length > 0) {
      await pgClient.query('ROLLBACK');
      return res.status(409).json({ message: 'An invoice already exists for this quote', invoice_id: existing.rows[0].invoice_id });
    }

    const result = await pgClient.query(
      `INSERT INTO invoices (category, client_id, walk_in_customer_id, quote_id, amount, due_date, created_by)
       VALUES ('PRODUCT', $1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [quote.client_id, quote.walk_in_customer_id, quote_id, quote.total_amount, due_date || null, req.user?.user_id || null]
    );

    await pgClient.query(`UPDATE quotations SET status = 'ACCEPTED' WHERE quote_id = $1`, [quote_id]);

    await pgClient.query('COMMIT');

    await safeLog({
      actorUserId: req.user?.user_id,
      actorRole: extractActorRole(req.user?.role),
      actionType: 'PRODUCT_INVOICE_CREATED',
      entityType: 'INVOICE',
      entityId: result.rows[0].invoice_id,
      details: { quote_id, amount: quote.total_amount },
    });

    res.status(201).json({ status: 'success', data: result.rows[0] });
  } catch (error) {
    await pgClient.query('ROLLBACK');
    console.error('Create Invoice From Quote Error:', error);
    res.status(500).json({ message: 'Failed to create invoice' });
  } finally {
    pgClient.release();
  }
};

// Generates (once) a standalone invoice for a single quote line item —
// independent of quoteController.ensureCombinedInvoice's all-or-nothing
// combined invoice, and independent of payment allocation (this is a
// documentation action an admin triggers manually, not a ledger entry tied
// to how much of the line item has actually been paid). One invoice per
// line item — idx_invoices_line_item_unique (migrate.js) enforces this at
// the DB level, so a concurrent duplicate call is caught below.
async function generateLineItemInvoice(lineItemId, { actorUserId } = {}) {
  const existing = await db.query(`SELECT * FROM invoices WHERE line_item_id = $1`, [lineItemId]);
  if (existing.rows.length > 0) {
    return ensureInvoicePdf(existing.rows[0].invoice_id);
  }

  const pg = await db.pool.connect();
  let invoice;
  try {
    await pg.query('BEGIN');

    // Lock the quotation row: acceptProductQuote takes the same lock, so an item can't be
    // invoiced here and by the quote's own product invoice at the same moment.
    const liRes = await pg.query(
      `SELECT li.line_item_id, li.amount, li.quote_id,
              q.client_id AS quote_client_id, q.walk_in_customer_id, q.request_id,
              q.quote_type, q.status AS quote_status
       FROM quote_line_items li
       JOIN quotations q ON li.quote_id = q.quote_id
       WHERE li.line_item_id = $1
       FOR UPDATE OF q`,
      [lineItemId]
    );
    if (liRes.rows.length === 0) {
      await pg.query('ROLLBACK');
      return null;
    }
    const li = liRes.rows[0];

    // Once a product quote has been accepted, every one of its items is already billed (by the
    // quote's product invoice or a rental agreement's invoice). A second, individual invoice for
    // the same item would just be a duplicate, so none is created. To invoice an item on its own,
    // do it before the quote is accepted.
    if (li.quote_type === 'PRODUCT' && li.quote_status === 'ACCEPTED') {
      await pg.query('ROLLBACK');
      return null;
    }

    // SERVICE-type quotes carry the client on service_requests, not on the
    // quotations row itself (see migrate.js:1389 — client_id there is only
    // populated for PRODUCT-type quotes).
    let client_id = li.quote_client_id;
    if (!client_id && li.request_id) {
      const reqRes = await pg.query(`SELECT client_id FROM service_requests WHERE request_id = $1`, [li.request_id]);
      client_id = reqRes.rows[0]?.client_id || null;
    }

    try {
      await pg.query('SAVEPOINT create_line_item_invoice');
      const insertRes = await pg.query(
        `INSERT INTO invoices (category, client_id, walk_in_customer_id, quote_id, line_item_id, amount, status, created_by)
         VALUES ('LINE_ITEM', $1, $2, $3, $4, $5, 'PENDING', $6)
         RETURNING *`,
        [client_id, li.walk_in_customer_id, li.quote_id, lineItemId, li.amount, actorUserId || null]
      );
      invoice = insertRes.rows[0];
    } catch (err) {
      // Unique violation on idx_invoices_line_item_unique — another request
      // won the race, use its invoice instead.
      if (err.code === '23505') {
        await pg.query('ROLLBACK TO SAVEPOINT create_line_item_invoice');
        const raceRes = await pg.query(`SELECT * FROM invoices WHERE line_item_id = $1`, [lineItemId]);
        invoice = raceRes.rows[0];
      } else {
        throw err;
      }
    }
    await pg.query('COMMIT');
  } catch (err) {
    await pg.query('ROLLBACK').catch(() => {});
    // The database guard (migrate.js) refused it: the item is already billed by its accepted quote.
    if (err.message === 'line_item_already_invoiced') return null;
    throw err;
  } finally {
    pg.release();
  }
  if (!invoice) return null;

  return ensureInvoicePdf(invoice.invoice_id);
}
exports.generateLineItemInvoice = generateLineItemInvoice;

// POST /api/quotes/:quote_id/line-item-invoices — body: { line_item_ids: [...] }
// Bulk version of generateLineItemInvoice for the admin-facing "create
// invoices for these line items" picker shown after recording a payment
// (see service_request_summary.jsx's payment-recorded popup chain). :quote_id
// is only used to identify the actor's context in the log entry — each line
// item is looked up (and validated) independently, since items can belong
// either to this SERVICE quote or its linked PRODUCT quote.
exports.createLineItemInvoices = async (req, res) => {
  const { quote_id } = req.params;
  const { line_item_ids } = req.body;

  if (!Array.isArray(line_item_ids) || line_item_ids.length === 0) {
    return res.status(400).json({ message: 'line_item_ids must be a non-empty array' });
  }

  try {
    const invoices = [];
    // Items that were not invoiced because they are already billed (see generateLineItemInvoice).
    const skipped = [];
    for (const lineItemId of line_item_ids) {
      const invoice = await generateLineItemInvoice(lineItemId, { actorUserId: req.user?.user_id });
      if (invoice) invoices.push(invoice);
      else skipped.push(lineItemId);
    }

    await safeLog({
      actorUserId: req.user?.user_id,
      actorRole: extractActorRole(req.user?.role),
      actionType: 'LINE_ITEM_INVOICE_CREATED',
      entityType: 'QUOTATION',
      entityId: quote_id,
      details: { line_item_ids, invoice_codes: invoices.map(i => i.invoice_code) },
    });

    res.status(201).json({ status: 'success', data: invoices, skipped_line_item_ids: skipped });
  } catch (error) {
    console.error('Create Line Item Invoices Error:', error);
    res.status(500).json({ message: 'Failed to create line item invoices' });
  }
};

// A LINE_ITEM invoice on a PRODUCT quote is normally the payable invoice for that item (an
// admin chose to invoice it individually, so accepting the quote skips it — see
// quoteController.acceptProductQuote). It is a leftover DUPLICATE when the item is also billed
// elsewhere: a rental item always has its own rental-agreement invoice, and a non-rental item is
// billed twice when the quote's product invoice already covers every non-rental item. Duplicates
// only mirror what was paid on the real invoice and must never count towards balances or payments.
// `a` is the SQL alias of the invoices row being tested.
const lineItemDuplicateSql = (a) => `(
  ${a}.line_item_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM quotations dq WHERE dq.quote_id = ${a}.quote_id AND dq.quote_type = 'PRODUCT')
  AND (
    EXISTS (SELECT 1 FROM quote_line_items dl WHERE dl.line_item_id = ${a}.line_item_id AND dl.rental_billing_type IS NOT NULL)
    OR EXISTS (
      SELECT 1 FROM invoices dg
      WHERE dg.quote_id = ${a}.quote_id AND dg.category = 'PRODUCT'
        AND dg.amount >= (
          SELECT COALESCE(SUM(dn.amount), 0) FROM quote_line_items dn
          WHERE dn.quote_id = ${a}.quote_id AND dn.rental_billing_type IS NULL AND dn.is_registration_fee = false
        ) - 0.01
    )
  )
)`;
exports.lineItemDuplicateSql = lineItemDuplicateSql;

// GET /api/product-invoices?category=PRODUCT&status=PENDING&client_id=...
exports.listInvoices = async (req, res) => {
  const { category, status, client_id, walk_in_customer_id, quote_id } = req.query;

  try {
    // Registration-fee line items get their own dedicated invoice the moment
    // they're settled (see quoteController.ensureRegFeeInvoiceRecord) and are
    // shown in the client's "Registration Fee Invoices" list — a LINE_ITEM
    // invoice manually generated for that same line item (see
    // invoiceController.generateLineItemInvoice /
    // PaymentAllocationModal.handleCreateLineItemInvoice) would just be a
    // duplicate document here, so it's excluded from this listing entirely.
    const conditions = [`NOT (i.line_item_id IS NOT NULL AND sli.is_registration_fee = true)`];
    const params = [];

    if (category) {
      params.push(category);
      conditions.push(`i.category = $${params.length}`);
    }
    if (status) {
      params.push(status);
      conditions.push(`i.status = $${params.length}`);
    }
    if (client_id) {
      params.push(client_id);
      conditions.push(`i.client_id = $${params.length}`);
    }
    if (walk_in_customer_id) {
      params.push(walk_in_customer_id);
      conditions.push(`i.walk_in_customer_id = $${params.length}`);
    }
    if (quote_id) {
      params.push(quote_id);
      conditions.push(`i.quote_id = $${params.length}`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    // A custom-charge (LINE_ITEM) invoice is settled through the quotation's payment
    // allocation form, which records what went to each line item in
    // quote_line_item_payments rather than in invoice_payments. Count both so the
    // invoice shows what has really been paid. (Table check keeps this working before
    // `npm run migrate` has created it.)
    const allocTable = await db.query(`SELECT to_regclass('public.quote_line_item_payments') AS t`);
    const allocPaidSql = allocTable.rows[0].t
      ? `+ COALESCE((SELECT SUM(a.amount) FROM quote_line_item_payments a WHERE a.line_item_id = i.line_item_id), 0)`
      : '';

    const result = await db.query(
      `SELECT i.*, q.estimate_number, q.quote_type,
              CASE WHEN cp.display_name_source = 'COMPANY_NAME' AND NULLIF(cp.company_name, '') IS NOT NULL
                   THEN cp.company_name ELSE NULLIF(CONCAT_WS(' ', NULLIF(cp.honorific, ''), cp.full_name), '') END AS client_name,
              u.mobile_number as client_mobile,
              wc.full_name as walk_in_name, wc.mobile_number as walk_in_mobile,
              -- A per-line-item invoice is only a document: money is never recorded against it
              -- directly, so what it shows as paid comes from where the money really went (see the
              -- lateral join below). Everything else reads straight off invoice_payments.
              CASE WHEN i.line_item_id IS NOT NULL THEN lip.paid
                   ELSE COALESCE((SELECT SUM(ip.amount) FROM invoice_payments ip WHERE ip.invoice_id = i.invoice_id), 0)
              END as amount_paid,
              COALESCE(dup.is_dup, false) AS is_duplicate,
              -- Placed after i.* on purpose: the effective status replaces the stored one.
              CASE WHEN i.line_item_id IS NOT NULL AND i.status <> 'PAID' AND lip.paid >= i.amount - 0.01
                   THEN 'PAID' ELSE i.status END AS status,
              -- What this invoice is actually for, so the list doesn't just show
              -- an amount with no context: the rental's product+unit, the single
              -- line item it was raised for, or (for a whole PRODUCT-quote
              -- invoice) every non-registration-fee item on that quote.
              CASE
                WHEN i.rental_agreement_id IS NOT NULL THEN rp.name || ' — Unit ' || ru.unit_code
                WHEN i.line_item_id IS NOT NULL THEN sli.description
                ELSE qli_agg.items_summary
              END AS item_summary
       FROM invoices i
       LEFT JOIN quotations q ON i.quote_id = q.quote_id
       LEFT JOIN client_profiles cp ON i.client_id = cp.client_profile_id
       LEFT JOIN users u ON cp.user_id = u.user_id
       LEFT JOIN walk_in_customers wc ON i.walk_in_customer_id = wc.walk_in_customer_id
       LEFT JOIN rental_agreements ra ON i.rental_agreement_id = ra.rental_agreement_id
       LEFT JOIN products rp ON ra.product_id = rp.product_id
       LEFT JOIN rental_units ru ON ra.unit_id = ru.unit_id
       LEFT JOIN quote_line_items sli ON sli.line_item_id = i.line_item_id
       LEFT JOIN LATERAL (SELECT ${lineItemDuplicateSql('i')} AS is_dup) dup ON true
       LEFT JOIN LATERAL (
         SELECT CASE
           WHEN i.line_item_id IS NULL THEN NULL
           -- Duplicate rental item invoice: covered by what was paid on its rental agreement's invoices.
           WHEN dup.is_dup AND sli.rental_billing_type IS NOT NULL THEN
             LEAST(i.amount, COALESCE((
               SELECT SUM(GREATEST(
                        COALESCE((SELECT SUM(ip.amount) FROM invoice_payments ip WHERE ip.invoice_id = ri.invoice_id), 0),
                        CASE WHEN ri.status = 'PAID' THEN ri.amount ELSE 0 END))
               FROM invoices ri
               JOIN rental_agreements ra ON ra.rental_agreement_id = ri.rental_agreement_id
               WHERE ra.quote_id = i.quote_id AND ra.product_id = sli.product_id AND ra.unit_id = sli.unit_id
             ), 0))
           -- Duplicate of a non-rental item: its share of what was paid on the quote's product invoice(s).
           WHEN dup.is_dup THEN
             i.amount * COALESCE((
               SELECT LEAST(1, SUM(g.pay) / NULLIF(SUM(g.amount), 0))
               FROM (
                 SELECT gi.amount,
                        GREATEST(
                          COALESCE((SELECT SUM(ip.amount) FROM invoice_payments ip WHERE ip.invoice_id = gi.invoice_id), 0),
                          CASE WHEN gi.status = 'PAID' THEN gi.amount ELSE 0 END) AS pay
                 FROM invoices gi
                 WHERE gi.quote_id = i.quote_id AND gi.category = 'PRODUCT'
               ) g
             ), 0)
           -- Otherwise the invoice is its own ledger: payments applied to it, plus (for a custom
           -- charge on a service quote) what the payment form allocated to that line item.
           ELSE COALESCE((SELECT SUM(ip.amount) FROM invoice_payments ip WHERE ip.invoice_id = i.invoice_id), 0) ${allocPaidSql}
         END AS paid
       ) lip ON true
       LEFT JOIN LATERAL (
         SELECT STRING_AGG(qli.description, ', ' ORDER BY qli.sort_order) AS items_summary
         FROM quote_line_items qli
         WHERE qli.quote_id = i.quote_id AND qli.is_registration_fee = false
           -- A product-quote's own invoice bills only the non-rental items; rentals have their own invoices.
           AND (i.category <> 'PRODUCT' OR qli.rental_billing_type IS NULL)
       ) qli_agg ON i.rental_agreement_id IS NULL AND i.line_item_id IS NULL
       ${where}
       ORDER BY i.created_at DESC`,
      params
    );

    res.status(200).json({ status: 'success', data: result.rows });
  } catch (error) {
    console.error('List Invoices Error:', error);
    res.status(500).json({ message: 'Failed to fetch invoices' });
  }
};

// GET /api/product-invoices/:invoice_id
exports.getInvoice = async (req, res) => {
  const { invoice_id } = req.params;

  try {
    const result = await db.query(
      `SELECT i.*, q.estimate_number,
              CASE WHEN cp.display_name_source = 'COMPANY_NAME' AND NULLIF(cp.company_name, '') IS NOT NULL
                   THEN cp.company_name ELSE NULLIF(CONCAT_WS(' ', NULLIF(cp.honorific, ''), cp.full_name), '') END AS client_name,
              u.mobile_number as client_mobile,
              wc.full_name as walk_in_name, wc.mobile_number as walk_in_mobile,
              COALESCE(json_agg(
                  json_build_object(
                      'description', li.description,
                      'quantity', li.quantity,
                      'unit_price', li.unit_price,
                      'amount', li.amount
                  ) ORDER BY li.sort_order
              ) FILTER (WHERE li.line_item_id IS NOT NULL), '[]') as line_items
       FROM invoices i
       LEFT JOIN quotations q ON i.quote_id = q.quote_id
       LEFT JOIN client_profiles cp ON i.client_id = cp.client_profile_id
       LEFT JOIN users u ON cp.user_id = u.user_id
       LEFT JOIN walk_in_customers wc ON i.walk_in_customer_id = wc.walk_in_customer_id
       LEFT JOIN quote_line_items li ON li.quote_id = i.quote_id AND (i.line_item_id IS NULL OR li.line_item_id = i.line_item_id)
       WHERE i.invoice_id = $1
       GROUP BY i.invoice_id, q.estimate_number, cp.full_name, cp.honorific, cp.company_name, cp.display_name_source, u.mobile_number, wc.full_name, wc.mobile_number`,
      [invoice_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Invoice not found' });
    }

    res.status(200).json({ status: 'success', data: result.rows[0] });
  } catch (error) {
    console.error('Get Invoice Error:', error);
    res.status(500).json({ message: 'Failed to fetch invoice' });
  }
};

// Generates (once) a standalone PDF for a generic invoice — PRODUCT (one-off
// item purchases + standalone deposits, sourced from the underlying quote's
// line items) or RENTAL_ONE_TIME/RENTAL_RECURRING (sourced straight from the
// invoice's rental_agreement, since a rental invoice is 1:1 with one agreement
// rather than a whole quote's line items). Mirrors quoteController.
// ensureCombinedInvoice's idempotency (checks pdf_url first) and reuses the
// same estimateTemplate/invoice_code_seq numbering.
async function ensureInvoicePdf(invoiceId) {
  const invRes = await db.query(
    `SELECT i.*,
            CASE WHEN cp.display_name_source = 'COMPANY_NAME' AND NULLIF(cp.company_name, '') IS NOT NULL
                 THEN cp.company_name ELSE NULLIF(CONCAT_WS(' ', NULLIF(cp.honorific, ''), cp.full_name), '') END AS client_name,
            u.mobile_number as client_mobile,
            wc.full_name as walk_in_name, wc.mobile_number as walk_in_mobile
     FROM invoices i
     LEFT JOIN client_profiles cp ON i.client_id = cp.client_profile_id
     LEFT JOIN users u ON cp.user_id = u.user_id
     LEFT JOIN walk_in_customers wc ON i.walk_in_customer_id = wc.walk_in_customer_id
     WHERE i.invoice_id = $1`,
    [invoiceId]
  );
  if (invRes.rows.length === 0) return null;
  const invoice = invRes.rows[0];
  if (invoice.pdf_url) return invoice;

  const payer_name = invoice.client_name || invoice.walk_in_name || 'Customer';
  const payer_mobile = invoice.client_mobile || invoice.walk_in_mobile || null;

  let line_items = [];
  if (invoice.rental_agreement_id) {
    const agrRes = await db.query(
      `SELECT ra.rate, ra.billing_type, ra.deposit_amount, p.name as product_name, ru.unit_code
       FROM rental_agreements ra
       JOIN products p ON ra.product_id = p.product_id
       JOIN rental_units ru ON ra.unit_id = ru.unit_id
       WHERE ra.rental_agreement_id = $1`,
      [invoice.rental_agreement_id]
    );
    const agreement = agrRes.rows[0];
    if (agreement) {
      line_items.push({
        description: `${agreement.product_name} — Unit ${agreement.unit_code} (${agreement.billing_type === 'RECURRING' ? 'Billed monthly' : 'One-time'})`,
        quantity: 1, unit_price: agreement.rate, amount: agreement.rate,
      });
      if (Number(agreement.deposit_amount) > 0) {
        line_items.push({
          description: `Refundable Deposit — ${agreement.product_name} (Unit ${agreement.unit_code})`,
          quantity: 1, unit_price: agreement.deposit_amount, amount: agreement.deposit_amount,
        });
      }
    }
  } else if (invoice.line_item_id) {
    // Standalone per-line-item invoice (see generateLineItemInvoice) — only
    // its own line item, not the whole quote's.
    const liRes = await db.query(
      `SELECT description, quantity, unit_price, amount FROM quote_line_items WHERE line_item_id = $1`,
      [invoice.line_item_id]
    );
    line_items = liRes.rows;
  } else if (invoice.quote_id) {
    const liRes = await db.query(
      `SELECT description, quantity, unit_price, amount FROM quote_line_items WHERE quote_id = $1 ORDER BY sort_order`,
      [invoice.quote_id]
    );
    line_items = liRes.rows;
  }
  if (line_items.length === 0) {
    line_items = [{ description: `${invoice.category} Invoice`, quantity: 1, unit_price: invoice.amount, amount: invoice.amount }];
  }

  const data = {
    payer_name,
    payer_mobile,
    estimate_number: invoice.invoice_code,
    estimate_date: invoice.created_at,
    document_label: 'Invoice',
    document_number: invoice.invoice_code,
    line_items,
    total_amount: parseFloat(invoice.amount) || 0,
  };

  const html = estimateTemplate(data);
  const pdfBuffer = await html_to_pdf.generatePdf({ content: html }, { format: 'A4' });
  const pdfKey = `invoices/Invoice_${invoice.invoice_code}_${Date.now()}.pdf`;
  const pdfUrl = await uploadBufferToS3(pdfBuffer, pdfKey, 'application/pdf');

  await db.query(`UPDATE invoices SET pdf_url = $1 WHERE invoice_id = $2`, [pdfUrl, invoiceId]);
  invoice.pdf_url = pdfUrl;
  return invoice;
}

exports.ensureInvoicePdf = ensureInvoicePdf;

// GET /api/product-invoices/:invoice_id/pdf — generate (if needed) and return the PDF URL
exports.getInvoicePdf = async (req, res) => {
  const { invoice_id } = req.params;
  try {
    const invoice = await ensureInvoicePdf(invoice_id);
    if (!invoice) {
      return res.status(404).json({ message: 'Invoice not found' });
    }
    res.status(200).json({ status: 'success', pdf_url: invoice.pdf_url });
  } catch (error) {
    console.error('Get Invoice PDF Error:', error);
    res.status(500).json({ message: 'Failed to generate invoice PDF' });
  }
};

// POST /api/product-invoices/:invoice_id/resend
// Send (or resend) a PRODUCT/RENTAL invoice's PDF to the client/walk-in
// customer over WhatsApp. Generates the PDF first if it doesn't exist yet.
exports.resendInvoice = async (req, res) => {
  const { invoice_id } = req.params;
  try {
    const invoice = await ensureInvoicePdf(invoice_id);
    if (!invoice) {
      return res.status(404).json({ message: 'Invoice not found' });
    }

    const mobile = invoice.client_mobile || invoice.walk_in_mobile;
    const name = invoice.client_name || invoice.walk_in_name || 'Customer';
    if (!mobile) {
      return res.status(400).json({ message: 'No mobile number on file for this invoice\'s recipient' });
    }

    try {
      await sendClientInvoice(mobile, name, invoice.invoice_code, invoice.amount, invoice.pdf_url);
    } catch (sendErr) {
      console.error('Resend Product Invoice WhatsApp Error:', sendErr.message);
      return res.status(502).json({ message: 'WhatsApp send failed — the "vcare_client_invoice" template may not be approved yet' });
    }

    await db.query(`UPDATE invoices SET whatsapp_sent_at = NOW() WHERE invoice_id = $1`, [invoice_id]);

    await safeLog({
      actorUserId: req.user?.user_id,
      actorRole: extractActorRole(req.user?.role),
      actionType: 'PRODUCT_INVOICE_RESENT',
      entityType: 'INVOICE',
      entityId: invoice_id,
      details: { invoice_code: invoice.invoice_code, mobile },
    });

    res.status(200).json({ status: 'success', message: 'Invoice sent via WhatsApp.', data: { pdf_url: invoice.pdf_url } });
  } catch (error) {
    console.error('Resend Invoice Error:', error);
    res.status(500).json({ message: 'Failed to resend invoice' });
  }
};

// Applies one (possibly partial) payment to an already-locked `invoices` row
// within the caller's transaction: inserts a transactions row for exactly
// `amount`, records it in invoice_payments, and only flips the invoice to
// PAID once cumulative invoice_payments reach invoice.amount. Deposit
// side-effects (rental agreement deposit / standalone DEPOSIT line items)
// are idempotent (existence-checked) so it's safe to call this on every
// instalment — they only actually insert on whichever call first covers them.
// Shared by recordInvoicePayment below and paymentTrackingController's
// combined allocation endpoint, which pays a product invoice as one bucket
// of a single admin-recorded payment.
async function applyInvoicePayment(pgClient, {
  invoice, amount, payment_method, bank_account_id, cheque_number, cheque_date,
  reference_number, slip_url, notes, actorUserId,
}) {
  const paidSoFarResult = await pgClient.query(
    `SELECT COALESCE(SUM(amount), 0) as paid FROM invoice_payments WHERE invoice_id = $1`,
    [invoice.invoice_id]
  );
  const paidSoFar = parseFloat(paidSoFarResult.rows[0].paid || 0);
  const remaining = parseFloat(invoice.amount) - paidSoFar;

  if (amount <= 0 || amount > remaining + 0.01) {
    const err = new Error(`Payment amount must be between 0 and the remaining balance (${remaining.toFixed(2)})`);
    err.statusCode = 400;
    throw err;
  }

  const isRentalInvoice = invoice.category === 'RENTAL_ONE_TIME' || invoice.category === 'RENTAL_RECURRING';
  const transactionCategory = isRentalInvoice ? 'RENTAL_PAYMENT' : 'PRODUCT_SALE';
  // Statement "Details" column reads straight off this notes field — fall back to an
  // auto-generated line (matching the SERVICE_INVOICE daily-charge pattern) when the
  // admin didn't type one in, so the row never renders blank on the client statement.
  const fallbackNotes = isRentalInvoice
    ? `${invoice.invoice_code} — Rental invoice payment`
    : `${invoice.invoice_code} — Product invoice payment`;
  const finalNotes = notes || fallbackNotes;

  // CASH payments have no client-supplied bank account — route them to Petty Cash instead.
  const resolvedBankAccountId = await resolveBankAccountId(payment_method, bank_account_id);

  const txResult = await pgClient.query(
    `INSERT INTO transactions
       (client_id, quote_id, category, transaction_type, amount, payment_method,
        bank_account_id, cheque_number, cheque_date, reference_number, receipt_url,
        notes, status, verified_by)
     VALUES ($1,$2,$3,'CREDIT',$4,$5,$6,$7,$8,$9,$10,$11,'COMPLETED',$12)
     RETURNING transaction_id`,
    [
      invoice.client_id, invoice.quote_id, transactionCategory, amount, payment_method,
      resolvedBankAccountId, cheque_number || null, cheque_date || null,
      reference_number || null, slip_url || null, finalNotes, actorUserId,
    ]
  );
  const transaction_id = txResult.rows[0].transaction_id;

  await pgClient.query(
    `INSERT INTO invoice_payments
       (invoice_id, transaction_id, amount, payment_method, bank_account_id,
        cheque_number, cheque_date, reference_number, slip_url, notes, verified_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [
      invoice.invoice_id, transaction_id, amount, payment_method, resolvedBankAccountId,
      cheque_number || null, cheque_date || null, reference_number || null,
      slip_url || null, finalNotes, actorUserId,
    ]
  );

  const newTotalPaid = paidSoFar + amount;
  const newlyFullyPaid = newTotalPaid >= parseFloat(invoice.amount) - 0.01;

  let updatedInvoice = invoice;
  if (newlyFullyPaid) {
    const updateResult = await pgClient.query(
      `UPDATE invoices SET status = 'PAID', transaction_id = $1, paid_at = NOW() WHERE invoice_id = $2 RETURNING *`,
      [transaction_id, invoice.invoice_id]
    );
    updatedInvoice = updateResult.rows[0];
  }

  // First payment on a rental agreement's invoice also settles its deposit
  // (bundled into the invoice amount at agreement-creation time — see
  // rentalController.createRentalAgreement). Only ever create this once.
  if (invoice.rental_agreement_id) {
    const agreementResult = await pgClient.query(
      'SELECT deposit_amount FROM rental_agreements WHERE rental_agreement_id = $1',
      [invoice.rental_agreement_id]
    );
    const depositAmount = parseFloat(agreementResult.rows[0]?.deposit_amount || 0);
    if (depositAmount > 0) {
      const existingDeposit = await pgClient.query(
        'SELECT deposit_id FROM deposits WHERE rental_agreement_id = $1',
        [invoice.rental_agreement_id]
      );
      if (existingDeposit.rows.length === 0) {
        await pgClient.query(
          `INSERT INTO deposits (rental_agreement_id, amount, status, collected_transaction_id, held_at)
           VALUES ($1, $2, 'HELD', $3, NOW())`,
          [invoice.rental_agreement_id, depositAmount, transaction_id]
        );
      }
    }
  }

  // Standalone deposits — 'DEPOSIT'-type line items on the underlying
  // quote, held by the company independent of any rental item. Each such
  // line item becomes its own deposits row once this invoice (which
  // bundles the deposit amount in with whatever else was quoted) is paid.
  if (invoice.quote_id) {
    const depositLineItems = await pgClient.query(
      `SELECT line_item_id, description, amount FROM quote_line_items
       WHERE quote_id = $1 AND item_type = 'DEPOSIT'`,
      [invoice.quote_id]
    );
    for (const li of depositLineItems.rows) {
      const existing = await pgClient.query(
        'SELECT deposit_id FROM deposits WHERE source_line_item_id = $1',
        [li.line_item_id]
      );
      if (existing.rows.length === 0) {
        await pgClient.query(
          `INSERT INTO deposits
             (quote_id, client_id, walk_in_customer_id, amount, status, collected_transaction_id, held_at, description, source_line_item_id)
           VALUES ($1, $2, $3, $4, 'HELD', $5, NOW(), $6, $7)`,
          [invoice.quote_id, invoice.client_id, invoice.walk_in_customer_id, li.amount, transaction_id, li.description, li.line_item_id]
        );
      }
    }
  }

  // If this PRODUCT invoice's quote was created alongside a SERVICE quote
  // (via ModularQuoteBuilder's Products & Rentals section — see
  // quotations.linked_quote_id), generate the combined Invoice PDF for the
  // full package the first time either portion is paid. No-op if one
  // already exists, and a no-op if this product quote has no SERVICE anchor
  // (e.g. a standalone quote built directly from the Products page).
  if (invoice.quote_id) {
    db.query(`SELECT linked_quote_id FROM quotations WHERE quote_id = $1`, [invoice.quote_id])
      .then((r) => {
        const serviceQuoteId = r.rows[0]?.linked_quote_id;
        if (serviceQuoteId) {
          return ensureCombinedInvoice(serviceQuoteId);
        }
      })
      .catch((e) => console.error('[Invoice] Generation error (applyInvoicePayment):', e.message));
  }

  return { invoice: updatedInvoice, transaction_id, amount_paid: newTotalPaid, newlyFullyPaid };
}

// POST /api/product-invoices/:invoice_id/record-payment
// Admin-recorded manual payment — mirrors clientPaymentController's pattern
// (bank_account_id/cheque/reference_number/slip_url), scoped to a single invoice.
// `amount` is optional and defaults to the invoice's full remaining balance
// (preserving the historical all-or-nothing behaviour for callers — e.g.
// ProductsPage/CreateProductInvoiceDrawer — that never send one); pass a
// smaller amount to record a partial instalment instead.
exports.recordInvoicePayment = async (req, res) => {
  const pgClient = await db.pool.connect();
  const { invoice_id } = req.params;

  try {
    const uploadedSlipUrl = req.file?.location || null;
    const { payment_method, bank_account_id, cheque_number, cheque_date, reference_number, slip_url, notes, amount } = req.body;
    const finalSlipUrl = uploadedSlipUrl || slip_url || null;

    if (!VALID_PAYMENT_METHODS.includes(payment_method)) {
      return res.status(400).json({ message: `payment_method must be one of: ${VALID_PAYMENT_METHODS.join(', ')}` });
    }
    if (['BANK_TRANSFER', 'CASH_DEPOSIT'].includes(payment_method) && !bank_account_id) {
      return res.status(400).json({ message: `bank_account_id is required for ${payment_method}` });
    }
    if (payment_method === 'CHEQUE' && (!cheque_number || !cheque_date)) {
      return res.status(400).json({ message: 'cheque_number and cheque_date are required for CHEQUE payments' });
    }

    await pgClient.query('BEGIN');

    const invoiceResult = await pgClient.query('SELECT * FROM invoices WHERE invoice_id = $1 FOR UPDATE', [invoice_id]);
    if (invoiceResult.rows.length === 0) {
      await pgClient.query('ROLLBACK');
      return res.status(404).json({ message: 'Invoice not found' });
    }
    const invoice = invoiceResult.rows[0];
    if (invoice.status === 'PAID') {
      await pgClient.query('ROLLBACK');
      return res.status(409).json({ message: 'Invoice is already paid' });
    }

    const actorUserId = req.user?.user_id || null;
    const actorRole = extractActorRole(req.user?.role);

    const paidSoFarResult = await pgClient.query(
      `SELECT COALESCE(SUM(amount), 0) as paid FROM invoice_payments WHERE invoice_id = $1`,
      [invoice_id]
    );
    const remaining = parseFloat(invoice.amount) - parseFloat(paidSoFarResult.rows[0].paid || 0);
    const parsedAmount = amount !== undefined && amount !== null && amount !== '' ? parseFloat(amount) : remaining;

    let result;
    try {
      result = await applyInvoicePayment(pgClient, {
        invoice,
        amount: parsedAmount,
        payment_method,
        bank_account_id,
        cheque_number,
        cheque_date,
        reference_number,
        slip_url: finalSlipUrl,
        notes,
        actorUserId,
      });
    } catch (err) {
      await pgClient.query('ROLLBACK');
      return res.status(err.statusCode || 500).json({ message: err.message || 'Failed to record invoice payment' });
    }

    await pgClient.query('COMMIT');

    // CASH payments have no client-supplied bank account — route them to Petty Cash instead.
    const resolvedBankAccountId = await resolveBankAccountId(payment_method, bank_account_id);

    await safeLog({
      actorUserId,
      actorRole,
      actionType: result.newlyFullyPaid ? 'PRODUCT_INVOICE_PAID' : 'PRODUCT_INVOICE_PARTIALLY_PAID',
      entityType: 'INVOICE',
      entityId: invoice_id,
      details: { invoice_id, amount: parsedAmount, payment_method },
    });

    // Receipts require a real client_id (payment_receipts.client_id is NOT NULL) —
    // walk-in-customer invoices skip receipt generation for now.
    if (invoice.client_id) {
      createPaymentReceipt({
        client_id: invoice.client_id,
        source_type: 'PRODUCT_INVOICE',
        source_id: invoice_id,
        total_amount: parsedAmount,
        payment_method,
        reference_number: reference_number || null,
        cheque_number: cheque_number || null,
        bank_account_id: resolvedBankAccountId,
        payment_date: new Date(),
        line_items: [{ label: 'Product Invoice', description: invoice.invoice_code, amount: parsedAmount }],
        generated_by: actorUserId,
      }).catch(e => console.error('[Receipt] Generation error (recordInvoicePayment):', e.message));
    }

    res.status(200).json({ status: 'success', data: { ...result.invoice, amount_paid: result.amount_paid } });
  } catch (error) {
    await pgClient.query('ROLLBACK');
    console.error('Record Invoice Payment Error:', error);
    res.status(500).json({ message: 'Failed to record invoice payment' });
  } finally {
    pgClient.release();
  }
};

exports.applyInvoicePayment = applyInvoicePayment;
