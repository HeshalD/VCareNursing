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
exports.createInvoiceFromQuote = async (req, res) => {
  const { quote_id } = req.params;
  const { due_date } = req.body;

  try {
    const quoteResult = await db.query(
      `SELECT quote_id, quote_type, client_id, walk_in_customer_id, total_amount, status
       FROM quotations WHERE quote_id = $1`,
      [quote_id]
    );

    if (quoteResult.rows.length === 0) {
      return res.status(404).json({ message: 'Quote not found' });
    }

    const quote = quoteResult.rows[0];
    if (quote.quote_type !== 'PRODUCT') {
      return res.status(400).json({ message: 'Only PRODUCT quotes can be invoiced through this endpoint' });
    }

    const existing = await db.query('SELECT invoice_id FROM invoices WHERE quote_id = $1', [quote_id]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ message: 'An invoice already exists for this quote', invoice_id: existing.rows[0].invoice_id });
    }

    const result = await db.query(
      `INSERT INTO invoices (category, client_id, walk_in_customer_id, quote_id, amount, due_date, created_by)
       VALUES ('PRODUCT', $1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [quote.client_id, quote.walk_in_customer_id, quote_id, quote.total_amount, due_date || null, req.user?.user_id || null]
    );

    await db.query(`UPDATE quotations SET status = 'ACCEPTED' WHERE quote_id = $1`, [quote_id]);

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
    console.error('Create Invoice From Quote Error:', error);
    res.status(500).json({ message: 'Failed to create invoice' });
  }
};

// GET /api/product-invoices?category=PRODUCT&status=PENDING&client_id=...
exports.listInvoices = async (req, res) => {
  const { category, status, client_id, walk_in_customer_id, quote_id } = req.query;

  try {
    const conditions = [];
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

    const result = await db.query(
      `SELECT i.*, q.estimate_number,
              cp.full_name as client_name, u.mobile_number as client_mobile,
              wc.full_name as walk_in_name, wc.mobile_number as walk_in_mobile
       FROM invoices i
       LEFT JOIN quotations q ON i.quote_id = q.quote_id
       LEFT JOIN client_profiles cp ON i.client_id = cp.client_profile_id
       LEFT JOIN users u ON cp.user_id = u.user_id
       LEFT JOIN walk_in_customers wc ON i.walk_in_customer_id = wc.walk_in_customer_id
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
              cp.full_name as client_name, u.mobile_number as client_mobile,
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
       LEFT JOIN quote_line_items li ON i.quote_id = li.quote_id
       WHERE i.invoice_id = $1
       GROUP BY i.invoice_id, q.estimate_number, cp.full_name, u.mobile_number, wc.full_name, wc.mobile_number`,
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
    `SELECT i.*, cp.full_name as client_name, u.mobile_number as client_mobile,
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

// POST /api/product-invoices/:invoice_id/record-payment
// Admin-recorded manual payment — mirrors clientPaymentController's pattern
// (bank_account_id/cheque/reference_number/slip_url), scoped to a single invoice.
exports.recordInvoicePayment = async (req, res) => {
  const pgClient = await db.pool.connect();
  const { invoice_id } = req.params;

  try {
    const uploadedSlipUrl = req.file?.location || null;
    const { payment_method, bank_account_id, cheque_number, cheque_date, reference_number, slip_url, notes } = req.body;
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
    const isRentalInvoice = invoice.category === 'RENTAL_ONE_TIME' || invoice.category === 'RENTAL_RECURRING';
    const transactionCategory = isRentalInvoice ? 'RENTAL_PAYMENT' : 'PRODUCT_SALE';
    // Statement "Details" column reads straight off this notes field — fall back to an
    // auto-generated line (matching the SERVICE_INVOICE daily-charge pattern) when the
    // admin didn't type one in, so the row never renders blank on the client statement.
    const fallbackNotes = isRentalInvoice
      ? `${invoice.invoice_code} — Rental invoice payment`
      : `${invoice.invoice_code} — Product invoice payment`;
    const finalNotes = notes || fallbackNotes;

    const txResult = await pgClient.query(
      `INSERT INTO transactions
         (client_id, quote_id, category, transaction_type, amount, payment_method,
          bank_account_id, cheque_number, cheque_date, reference_number, receipt_url,
          notes, status, verified_by)
       VALUES ($1,$2,$3,'CREDIT',$4,$5,$6,$7,$8,$9,$10,$11,'COMPLETED',$12)
       RETURNING transaction_id`,
      [
        invoice.client_id, invoice.quote_id, transactionCategory, invoice.amount, payment_method,
        bank_account_id || null, cheque_number || null, cheque_date || null,
        reference_number || null, finalSlipUrl, finalNotes, actorUserId,
      ]
    );
    const transaction_id = txResult.rows[0].transaction_id;

    const updateResult = await pgClient.query(
      `UPDATE invoices SET status = 'PAID', transaction_id = $1, paid_at = NOW() WHERE invoice_id = $2 RETURNING *`,
      [transaction_id, invoice_id]
    );

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

    await pgClient.query('COMMIT');

    await safeLog({
      actorUserId,
      actorRole,
      actionType: 'PRODUCT_INVOICE_PAID',
      entityType: 'INVOICE',
      entityId: invoice_id,
      details: { invoice_id, amount: invoice.amount, payment_method },
    });

    // Receipts require a real client_id (payment_receipts.client_id is NOT NULL) —
    // walk-in-customer invoices skip receipt generation for now.
    if (invoice.client_id) {
      createPaymentReceipt({
        client_id: invoice.client_id,
        source_type: 'PRODUCT_INVOICE',
        source_id: invoice_id,
        total_amount: invoice.amount,
        payment_method,
        reference_number: reference_number || null,
        cheque_number: cheque_number || null,
        bank_account_id: bank_account_id || null,
        payment_date: new Date(),
        line_items: [{ label: 'Product Invoice', description: invoice.invoice_code, amount: invoice.amount }],
        generated_by: actorUserId,
      }).catch(e => console.error('[Receipt] Generation error (recordInvoicePayment):', e.message));
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
        .catch((e) => console.error('[Invoice] Generation error (recordInvoicePayment):', e.message));
    }

    res.status(200).json({ status: 'success', data: updateResult.rows[0] });
  } catch (error) {
    await pgClient.query('ROLLBACK');
    console.error('Record Invoice Payment Error:', error);
    res.status(500).json({ message: 'Failed to record invoice payment' });
  } finally {
    pgClient.release();
  }
};
