// Rental units (physical inventory) + rental agreements (the "who has what,
// billed how" record) + deposits held against a rental agreement.
//
// A rental agreement bills either:
//  - ONE_TIME: a single invoice covering the whole agreed period, created here.
//  - RECURRING: a first invoice created here for the opening period, then
//    cron/rentalInvoicing.js generates one more per billing cycle while the
//    agreement stays ACTIVE.
// Any deposit_amount on the agreement rides along on that first invoice —
// the deposits row itself is only created once that invoice is actually
// paid (see invoiceController.recordInvoicePayment), so `deposits` only ever
// contains deposits that were genuinely collected.

const db = require('../config/db');
const { logActivity } = require('../utils/activityLogger');
const { resolveBankAccountId } = require('../utils/pettyCash');
const { createVendorBillCore, applyVendorBillPayment } = require('./vendorController');

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

const VALID_PAYMENT_METHODS = ['BANK_TRANSFER', 'CASH_DEPOSIT', 'CASH', 'CHEQUE'];

class RentalAgreementError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// Shared by the direct "New Rental Agreement" endpoint (createRentalAgreement
// below) and quoteController.acceptProductQuote (converting an accepted
// quotation's rental line item straight into a live agreement). Runs on a
// caller-supplied pgClient — the caller owns BEGIN/COMMIT/ROLLBACK so it can
// bundle in its own side effects (e.g. marking a quotation ACCEPTED) in the
// same transaction. Throws RentalAgreementError for anything the caller
// should turn into a 4xx response; caller is responsible for rolling back.
async function createRentalAgreementCore(pgClient, {
  product_id, unit_id, client_id, walk_in_customer_id, quote_id,
  billing_type, rate, start_date, end_date, deposit_amount, notes, createdBy,
  vendor_payment,
}) {
  if (!product_id) throw new RentalAgreementError(400, 'product_id is required');
  if (!client_id && !walk_in_customer_id) {
    throw new RentalAgreementError(400, 'Either client_id or walk_in_customer_id is required');
  }
  if (!['ONE_TIME', 'RECURRING'].includes(billing_type)) {
    throw new RentalAgreementError(400, 'billing_type must be ONE_TIME or RECURRING');
  }
  if (!rate || parseFloat(rate) <= 0) {
    throw new RentalAgreementError(400, 'rate must be a positive number');
  }
  if (billing_type === 'ONE_TIME' && !end_date) {
    throw new RentalAgreementError(400, 'end_date is required for ONE_TIME rentals');
  }

  const startDate = start_date || new Date().toISOString().slice(0, 10);
  const depositAmt = parseFloat(deposit_amount) || 0;

  // Pick a unit: explicit unit_id (validated AVAILABLE) or the first
  // AVAILABLE unit for the product, locked so concurrent requests can't
  // double-book the same physical item.
  let unit;
  if (unit_id) {
    const unitResult = await pgClient.query(
      `SELECT * FROM rental_units WHERE unit_id = $1 AND product_id = $2 FOR UPDATE`,
      [unit_id, product_id]
    );
    if (unitResult.rows.length === 0) {
      throw new RentalAgreementError(404, 'Rental unit not found for this product');
    }
    if (unitResult.rows[0].status !== 'AVAILABLE') {
      throw new RentalAgreementError(409, 'This unit is not available');
    }
    unit = unitResult.rows[0];
  } else {
    const unitResult = await pgClient.query(
      `SELECT * FROM rental_units WHERE product_id = $1 AND status = 'AVAILABLE'
       ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED`,
      [product_id]
    );
    if (unitResult.rows.length === 0) {
      throw new RentalAgreementError(409, 'No available units for this product');
    }
    unit = unitResult.rows[0];
  }

  await pgClient.query(`UPDATE rental_units SET status = 'RENTED', updated_at = NOW() WHERE unit_id = $1`, [unit.unit_id]);

  const periodEnd = billing_type === 'ONE_TIME'
    ? end_date
    : (() => { const d = new Date(startDate); d.setMonth(d.getMonth() + 1); d.setDate(d.getDate() - 1); return d.toISOString().slice(0, 10); })();

  const nextInvoiceDate = billing_type === 'RECURRING' ? addOneMonth(startDate) : null;

  const agreementResult = await pgClient.query(
    `INSERT INTO rental_agreements
       (unit_id, product_id, client_id, walk_in_customer_id, quote_id, billing_type,
        rate, start_date, end_date, next_invoice_date, deposit_amount, notes, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     RETURNING *`,
    [
      unit.unit_id, product_id, client_id || null, walk_in_customer_id || null, quote_id || null,
      billing_type, rate, startDate, billing_type === 'ONE_TIME' ? end_date : null,
      nextInvoiceDate, depositAmt, notes || null, createdBy || null,
    ]
  );
  const agreement = agreementResult.rows[0];

  const invoiceAmount = parseFloat(rate) + depositAmt;
  const invoiceCategory = billing_type === 'ONE_TIME' ? 'RENTAL_ONE_TIME' : 'RENTAL_RECURRING';

  const invoiceResult = await pgClient.query(
    `INSERT INTO invoices
       (category, client_id, walk_in_customer_id, quote_id, rental_agreement_id,
        amount, billing_period_start, billing_period_end, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     RETURNING *`,
    [
      invoiceCategory, client_id || null, walk_in_customer_id || null, quote_id || null,
      agreement.rental_agreement_id, invoiceAmount, startDate, periodEnd, createdBy || null,
    ]
  );

  // If this product is sourced from a vendor, record what's owed to them for
  // this rental and (if the admin chose to pay now) settle it immediately —
  // same pgClient/transaction as the rest of the agreement.
  let vendorBill = null;
  const productResult = await pgClient.query('SELECT vendor_id, cost_price FROM products WHERE product_id = $1', [product_id]);
  const product = productResult.rows[0];
  if (product?.vendor_id) {
    const decision = vendor_payment || {};
    const billAmount = decision.amount !== undefined && decision.amount !== null && decision.amount !== ''
      ? parseFloat(decision.amount)
      : parseFloat(product.cost_price || 0);

    if (billAmount > 0) {
      vendorBill = await createVendorBillCore(pgClient, {
        vendor_id: product.vendor_id,
        source_type: 'RENTAL',
        product_id,
        reference_id: agreement.rental_agreement_id,
        amount: billAmount,
        description: `Rental agreement ${agreement.rental_agreement_id}`,
        createdBy,
      });

      if (decision.pay_now) {
        const vendorResult = await pgClient.query('SELECT * FROM vendors WHERE vendor_id = $1', [product.vendor_id]);
        await applyVendorBillPayment(pgClient, {
          bill: vendorBill,
          vendor: vendorResult.rows[0],
          amount: billAmount,
          payment_method: decision.payment_method,
          bank_account_id: decision.bank_account_id,
          cheque_number: decision.cheque_number,
          cheque_date: decision.cheque_date,
          reference_number: decision.reference_number,
          notes: decision.notes,
          actorUserId: createdBy || null,
        });
      }
    }
  }

  return { agreement, invoice: invoiceResult.rows[0], unit, vendor_bill: vendorBill };
}

module.exports.RentalAgreementError = RentalAgreementError;
module.exports.createRentalAgreementCore = createRentalAgreementCore;

// ==================== RENTAL UNITS ====================

exports.createRentalUnit = async (req, res) => {
  const { product_id, unit_code, notes } = req.body;

  if (!product_id) {
    return res.status(400).json({ message: 'product_id is required' });
  }

  try {
    const productResult = await db.query(
      'SELECT product_id, product_type FROM products WHERE product_id = $1',
      [product_id]
    );
    if (productResult.rows.length === 0) {
      return res.status(404).json({ message: 'Product not found' });
    }
    if (productResult.rows[0].product_type !== 'RENTAL') {
      return res.status(400).json({ message: 'Rental units can only be added to RENTAL-type products' });
    }

    const result = await db.query(
      `INSERT INTO rental_units (product_id, unit_code, notes) VALUES ($1, $2, $3) RETURNING *`,
      [product_id, unit_code || null, notes || null]
    );

    res.status(201).json({ status: 'success', data: result.rows[0] });
  } catch (error) {
    console.error('Create Rental Unit Error:', error);
    res.status(500).json({ message: 'Failed to create rental unit' });
  }
};

exports.getRentalUnits = async (req, res) => {
  const { product_id, status } = req.query;

  try {
    const conditions = [];
    const params = [];
    if (product_id) {
      params.push(product_id);
      conditions.push(`ru.product_id = $${params.length}`);
    }
    if (status) {
      params.push(status);
      conditions.push(`ru.status = $${params.length}`);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await db.query(
      `SELECT ru.*, p.name as product_name,
              ra.rental_agreement_id, ra.billing_type as rental_billing_type,
              ra.end_date as rental_end_date, ra.next_invoice_date as rental_next_invoice_date,
              cp.full_name as rented_to_client_name, wc.full_name as rented_to_walk_in_name
       FROM rental_units ru
       JOIN products p ON ru.product_id = p.product_id
       LEFT JOIN rental_agreements ra ON ra.unit_id = ru.unit_id AND ra.status = 'ACTIVE'
       LEFT JOIN client_profiles cp ON ra.client_id = cp.client_profile_id
       LEFT JOIN walk_in_customers wc ON ra.walk_in_customer_id = wc.walk_in_customer_id
       ${where}
       ORDER BY ru.created_at DESC`,
      params
    );
    res.status(200).json({ status: 'success', data: result.rows });
  } catch (error) {
    console.error('Get Rental Units Error:', error);
    res.status(500).json({ message: 'Failed to fetch rental units' });
  }
};

exports.updateRentalUnitStatus = async (req, res) => {
  const { unit_id } = req.params;
  const { status, notes } = req.body;

  if (!['AVAILABLE', 'MAINTENANCE'].includes(status)) {
    return res.status(400).json({ message: 'status must be AVAILABLE or MAINTENANCE (RENTED is set automatically)' });
  }

  try {
    const current = await db.query('SELECT status FROM rental_units WHERE unit_id = $1', [unit_id]);
    if (current.rows.length === 0) {
      return res.status(404).json({ message: 'Rental unit not found' });
    }
    if (current.rows[0].status === 'RENTED') {
      return res.status(409).json({ message: 'This unit is currently rented out — it cannot be changed until returned' });
    }

    const result = await db.query(
      `UPDATE rental_units SET status = $1, notes = COALESCE($2, notes), updated_at = CURRENT_TIMESTAMP
       WHERE unit_id = $3 RETURNING *`,
      [status, notes, unit_id]
    );
    res.status(200).json({ status: 'success', data: result.rows[0] });
  } catch (error) {
    console.error('Update Rental Unit Status Error:', error);
    res.status(500).json({ message: 'Failed to update rental unit' });
  }
};

// ==================== RENTAL AGREEMENTS ====================

function addOneMonth(dateStr) {
  const d = new Date(dateStr);
  d.setMonth(d.getMonth() + 1);
  return d.toISOString().slice(0, 10);
}

exports.createRentalAgreement = async (req, res) => {
  const pgClient = await db.pool.connect();
  const {
    product_id, unit_id, client_id, walk_in_customer_id, quote_id,
    billing_type, rate, start_date, end_date, deposit_amount, notes,
    vendor_payment,
  } = req.body;

  try {
    await pgClient.query('BEGIN');

    const { agreement, invoice, unit, vendor_bill } = await createRentalAgreementCore(pgClient, {
      product_id, unit_id, client_id, walk_in_customer_id, quote_id,
      billing_type, rate, start_date, end_date, deposit_amount, notes,
      vendor_payment,
      createdBy: req.user?.user_id,
    });

    await pgClient.query('COMMIT');

    await safeLog({
      actorUserId: req.user?.user_id,
      actorRole: extractActorRole(req.user?.role),
      actionType: 'RENTAL_AGREEMENT_CREATED',
      entityType: 'RENTAL_AGREEMENT',
      entityId: agreement.rental_agreement_id,
      details: { unit_id: unit.unit_id, product_id, billing_type, rate, deposit_amount: parseFloat(deposit_amount) || 0, vendor_bill_id: vendor_bill?.vendor_bill_id || null },
    });

    res.status(201).json({
      status: 'success',
      data: { ...agreement, invoice, vendor_bill },
    });
  } catch (error) {
    await pgClient.query('ROLLBACK');
    if (error instanceof RentalAgreementError) {
      return res.status(error.status).json({ message: error.message });
    }
    console.error('Create Rental Agreement Error:', error);
    res.status(500).json({ message: 'Failed to create rental agreement' });
  } finally {
    pgClient.release();
  }
};

exports.listRentalAgreements = async (req, res) => {
  const { status, client_id } = req.query;

  try {
    const conditions = [];
    const params = [];
    if (status) {
      params.push(status);
      conditions.push(`ra.status = $${params.length}`);
    }
    if (client_id) {
      params.push(client_id);
      conditions.push(`ra.client_id = $${params.length}`);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await db.query(
      `SELECT ra.*, p.name as product_name, ru.unit_code,
              cp.full_name as client_name, u.mobile_number as client_mobile,
              wc.full_name as walk_in_name, wc.mobile_number as walk_in_mobile,
              d.deposit_id, d.status as deposit_status, d.amount as deposit_collected_amount
       FROM rental_agreements ra
       JOIN products p ON ra.product_id = p.product_id
       JOIN rental_units ru ON ra.unit_id = ru.unit_id
       LEFT JOIN client_profiles cp ON ra.client_id = cp.client_profile_id
       LEFT JOIN users u ON cp.user_id = u.user_id
       LEFT JOIN walk_in_customers wc ON ra.walk_in_customer_id = wc.walk_in_customer_id
       LEFT JOIN deposits d ON d.rental_agreement_id = ra.rental_agreement_id
       ${where}
       ORDER BY ra.created_at DESC`,
      params
    );
    res.status(200).json({ status: 'success', data: result.rows });
  } catch (error) {
    console.error('List Rental Agreements Error:', error);
    res.status(500).json({ message: 'Failed to fetch rental agreements' });
  }
};

exports.getRentalAgreement = async (req, res) => {
  const { rental_agreement_id } = req.params;

  try {
    const agreementResult = await db.query(
      `SELECT ra.*, p.name as product_name, ru.unit_code,
              cp.full_name as client_name, u.mobile_number as client_mobile,
              wc.full_name as walk_in_name, wc.mobile_number as walk_in_mobile,
              d.deposit_id, d.status as deposit_status, d.amount as deposit_collected_amount,
              d.held_at as deposit_held_at, d.refunded_at as deposit_refunded_at
       FROM rental_agreements ra
       JOIN products p ON ra.product_id = p.product_id
       JOIN rental_units ru ON ra.unit_id = ru.unit_id
       LEFT JOIN client_profiles cp ON ra.client_id = cp.client_profile_id
       LEFT JOIN users u ON cp.user_id = u.user_id
       LEFT JOIN walk_in_customers wc ON ra.walk_in_customer_id = wc.walk_in_customer_id
       LEFT JOIN deposits d ON d.rental_agreement_id = ra.rental_agreement_id
       WHERE ra.rental_agreement_id = $1`,
      [rental_agreement_id]
    );
    if (agreementResult.rows.length === 0) {
      return res.status(404).json({ message: 'Rental agreement not found' });
    }

    const invoicesResult = await db.query(
      `SELECT * FROM invoices WHERE rental_agreement_id = $1 ORDER BY created_at DESC`,
      [rental_agreement_id]
    );

    res.status(200).json({
      status: 'success',
      data: { ...agreementResult.rows[0], invoices: invoicesResult.rows },
    });
  } catch (error) {
    console.error('Get Rental Agreement Error:', error);
    res.status(500).json({ message: 'Failed to fetch rental agreement' });
  }
};

// POST /api/rentals/:rental_agreement_id/return
exports.returnRentalUnit = async (req, res) => {
  const pgClient = await db.pool.connect();
  const { rental_agreement_id } = req.params;

  try {
    await pgClient.query('BEGIN');

    const agreementResult = await pgClient.query(
      `SELECT * FROM rental_agreements WHERE rental_agreement_id = $1 FOR UPDATE`,
      [rental_agreement_id]
    );
    if (agreementResult.rows.length === 0) {
      await pgClient.query('ROLLBACK');
      return res.status(404).json({ message: 'Rental agreement not found' });
    }
    const agreement = agreementResult.rows[0];
    if (agreement.status !== 'ACTIVE') {
      await pgClient.query('ROLLBACK');
      return res.status(409).json({ message: `Agreement is already ${agreement.status}` });
    }

    await pgClient.query(
      `UPDATE rental_agreements SET status = 'COMPLETED', returned_at = NOW(), next_invoice_date = NULL
       WHERE rental_agreement_id = $1`,
      [rental_agreement_id]
    );
    await pgClient.query(`UPDATE rental_units SET status = 'AVAILABLE', updated_at = NOW() WHERE unit_id = $1`, [agreement.unit_id]);

    await pgClient.query('COMMIT');

    await safeLog({
      actorUserId: req.user?.user_id,
      actorRole: extractActorRole(req.user?.role),
      actionType: 'RENTAL_UNIT_RETURNED',
      entityType: 'RENTAL_AGREEMENT',
      entityId: rental_agreement_id,
      details: { unit_id: agreement.unit_id },
    });

    res.status(200).json({ status: 'success', message: 'Unit marked as returned' });
  } catch (error) {
    await pgClient.query('ROLLBACK');
    console.error('Return Rental Unit Error:', error);
    res.status(500).json({ message: 'Failed to mark unit as returned' });
  } finally {
    pgClient.release();
  }
};

// ==================== DEPOSITS ====================

// GET /api/rentals/deposits?status=HELD — a flat, global view across all
// agreements, so an admin can see everything currently held (or refunded/
// forfeited for audit purposes) without drilling into each rental agreement.
exports.listDeposits = async (req, res) => {
  const { status, client_id } = req.query;

  try {
    const conditions = [];
    const params = [];
    if (status) {
      params.push(status);
      conditions.push(`d.status = $${params.length}`);
    }
    if (client_id) {
      params.push(client_id);
      conditions.push(`COALESCE(ra.client_id, d.client_id) = $${params.length}`);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await db.query(
      `SELECT d.*,
              ra.product_id,
              COALESCE(ra.client_id, d.client_id) as client_id,
              COALESCE(ra.walk_in_customer_id, d.walk_in_customer_id) as walk_in_customer_id,
              ra.status as agreement_status,
              p.name as product_name, ru.unit_code, q.estimate_number,
              cp.full_name as client_name, u.mobile_number as client_mobile,
              wc.full_name as walk_in_name, wc.mobile_number as walk_in_mobile
       FROM deposits d
       LEFT JOIN rental_agreements ra ON d.rental_agreement_id = ra.rental_agreement_id
       LEFT JOIN products p ON ra.product_id = p.product_id
       LEFT JOIN rental_units ru ON ra.unit_id = ru.unit_id
       LEFT JOIN quotations q ON d.quote_id = q.quote_id
       LEFT JOIN client_profiles cp ON COALESCE(ra.client_id, d.client_id) = cp.client_profile_id
       LEFT JOIN users u ON cp.user_id = u.user_id
       LEFT JOIN walk_in_customers wc ON COALESCE(ra.walk_in_customer_id, d.walk_in_customer_id) = wc.walk_in_customer_id
       ${where}
       ORDER BY d.held_at DESC`,
      params
    );
    res.status(200).json({ status: 'success', data: result.rows });
  } catch (error) {
    console.error('List Deposits Error:', error);
    res.status(500).json({ message: 'Failed to fetch deposits' });
  }
};

// Shared by refundDeposit and forfeitDeposit for the "part of the deposit
// goes back to the client via a real payout" half of a (possibly partial)
// settlement. Runs on the caller's transaction — caller owns BEGIN/COMMIT.
// Returns the created transaction_id.
async function createDepositRefundTransaction(pgClient, deposit, { refundAmount, paymentMethod, companyBankAccountId, notes, actorUserId }) {
  let refundClientId = deposit.client_id || null;
  if (deposit.rental_agreement_id) {
    const agreementResult = await pgClient.query(
      'SELECT client_id FROM rental_agreements WHERE rental_agreement_id = $1',
      [deposit.rental_agreement_id]
    );
    refundClientId = agreementResult.rows[0]?.client_id || null;
  }

  // A CASH refund is physical cash leaving the till — route it to Petty Cash
  // instead of leaving bank_account_id null.
  const resolvedBankAccountId = await resolveBankAccountId(paymentMethod, companyBankAccountId);

  const txResult = await pgClient.query(
    `INSERT INTO transactions (client_id, category, transaction_type, amount, payment_method, bank_account_id, notes, status, verified_by)
     VALUES ($1, 'DEPOSIT_REFUND', 'DEBIT', $2, $3, $4, $5, 'COMPLETED', $6)
     RETURNING transaction_id`,
    [refundClientId, refundAmount, paymentMethod, resolvedBankAccountId, notes || null, actorUserId || null]
  );
  return txResult.rows[0].transaction_id;
}

// POST /api/rentals/deposits/:deposit_id/refund
// refund_amount is optional — omit (or pass the full deposit amount) for a
// full refund. A smaller refund_amount refunds only that much to the client
// and forfeits (keeps) the remainder as a charge (e.g. repair/transport fee),
// recorded as status PARTIALLY_REFUNDED.
exports.refundDeposit = async (req, res) => {
  const pgClient = await db.pool.connect();
  const { deposit_id } = req.params;
  const { payment_method, notes, company_bank_account_id, refund_amount } = req.body;

  if (!VALID_PAYMENT_METHODS.includes(payment_method)) {
    return res.status(400).json({ message: `payment_method must be one of: ${VALID_PAYMENT_METHODS.join(', ')}` });
  }

  try {
    await pgClient.query('BEGIN');

    const depositResult = await pgClient.query('SELECT * FROM deposits WHERE deposit_id = $1 FOR UPDATE', [deposit_id]);
    if (depositResult.rows.length === 0) {
      await pgClient.query('ROLLBACK');
      return res.status(404).json({ message: 'Deposit not found' });
    }
    const deposit = depositResult.rows[0];
    if (deposit.status !== 'HELD') {
      await pgClient.query('ROLLBACK');
      return res.status(409).json({ message: `Deposit is already ${deposit.status}` });
    }

    const totalAmount = parseFloat(deposit.amount);
    const refundAmt = refund_amount === undefined || refund_amount === null || refund_amount === ''
      ? totalAmount
      : parseFloat(refund_amount);
    if (Number.isNaN(refundAmt) || refundAmt <= 0 || refundAmt > totalAmount) {
      await pgClient.query('ROLLBACK');
      return res.status(400).json({ message: `refund_amount must be greater than 0 and at most ${totalAmount}` });
    }
    const forfeitAmt = Math.round((totalAmount - refundAmt) * 100) / 100;

    if (company_bank_account_id) {
      const accountCheck = await pgClient.query('SELECT account_id FROM bank_accounts WHERE account_id = $1', [company_bank_account_id]);
      if (accountCheck.rows.length === 0) {
        await pgClient.query('ROLLBACK');
        return res.status(404).json({ message: 'Company bank account not found' });
      }
    }

    const refundTransactionId = await createDepositRefundTransaction(pgClient, deposit, {
      refundAmount: refundAmt,
      paymentMethod: payment_method,
      companyBankAccountId: company_bank_account_id,
      notes,
      actorUserId: req.user?.user_id,
    });

    const status = forfeitAmt > 0 ? 'PARTIALLY_REFUNDED' : 'REFUNDED';
    const updated = await pgClient.query(
      `UPDATE deposits SET status = $1, refund_transaction_id = $2, refunded_at = NOW(),
              refunded_amount = $3, forfeited_amount = $4, notes = COALESCE($5, notes)
       WHERE deposit_id = $6 RETURNING *`,
      [status, refundTransactionId, refundAmt, forfeitAmt, notes || null, deposit_id]
    );

    await pgClient.query('COMMIT');

    await safeLog({
      actorUserId: req.user?.user_id,
      actorRole: extractActorRole(req.user?.role),
      actionType: 'DEPOSIT_REFUNDED',
      entityType: 'DEPOSIT',
      entityId: deposit_id,
      details: { amount: totalAmount, refunded_amount: refundAmt, forfeited_amount: forfeitAmt, payment_method },
    });

    res.status(200).json({ status: 'success', data: updated.rows[0] });
  } catch (error) {
    await pgClient.query('ROLLBACK');
    console.error('Refund Deposit Error:', error);
    res.status(500).json({ message: 'Failed to refund deposit' });
  } finally {
    pgClient.release();
  }
};

// POST /api/rentals/deposits/:deposit_id/forfeit
// forfeit_amount is optional — omit (or pass the full deposit amount) for a
// full forfeit (no payout, no transaction — matches the original behaviour).
// A smaller forfeit_amount keeps only that much and refunds the remainder to
// the client (requires payment_method), recorded as status PARTIALLY_REFUNDED.
exports.forfeitDeposit = async (req, res) => {
  const pgClient = await db.pool.connect();
  const { deposit_id } = req.params;
  const { notes, forfeit_amount, payment_method, company_bank_account_id } = req.body;

  try {
    await pgClient.query('BEGIN');

    const depositResult = await pgClient.query('SELECT * FROM deposits WHERE deposit_id = $1 FOR UPDATE', [deposit_id]);
    if (depositResult.rows.length === 0) {
      await pgClient.query('ROLLBACK');
      return res.status(404).json({ message: 'Deposit not found' });
    }
    const deposit = depositResult.rows[0];
    if (deposit.status !== 'HELD') {
      await pgClient.query('ROLLBACK');
      return res.status(409).json({ message: `Deposit is already ${deposit.status}` });
    }

    const totalAmount = parseFloat(deposit.amount);
    const forfeitAmt = forfeit_amount === undefined || forfeit_amount === null || forfeit_amount === ''
      ? totalAmount
      : parseFloat(forfeit_amount);
    if (Number.isNaN(forfeitAmt) || forfeitAmt <= 0 || forfeitAmt > totalAmount) {
      await pgClient.query('ROLLBACK');
      return res.status(400).json({ message: `forfeit_amount must be greater than 0 and at most ${totalAmount}` });
    }
    const refundAmt = Math.round((totalAmount - forfeitAmt) * 100) / 100;

    let refundTransactionId = null;
    if (refundAmt > 0) {
      if (!VALID_PAYMENT_METHODS.includes(payment_method)) {
        await pgClient.query('ROLLBACK');
        return res.status(400).json({ message: `payment_method must be one of: ${VALID_PAYMENT_METHODS.join(', ')} to refund the remaining ${refundAmt}` });
      }
      if (company_bank_account_id) {
        const accountCheck = await pgClient.query('SELECT account_id FROM bank_accounts WHERE account_id = $1', [company_bank_account_id]);
        if (accountCheck.rows.length === 0) {
          await pgClient.query('ROLLBACK');
          return res.status(404).json({ message: 'Company bank account not found' });
        }
      }
      refundTransactionId = await createDepositRefundTransaction(pgClient, deposit, {
        refundAmount: refundAmt,
        paymentMethod: payment_method,
        companyBankAccountId: company_bank_account_id,
        notes,
        actorUserId: req.user?.user_id,
      });
    }

    const status = refundAmt > 0 ? 'PARTIALLY_REFUNDED' : 'FORFEITED';
    const result = await pgClient.query(
      `UPDATE deposits SET status = $1, notes = COALESCE($2, notes), forfeited_amount = $3,
              refunded_amount = $4, refund_transaction_id = COALESCE($5, refund_transaction_id),
              refunded_at = CASE WHEN $4 > 0 THEN NOW() ELSE refunded_at END
       WHERE deposit_id = $6 RETURNING *`,
      [status, notes || null, forfeitAmt, refundAmt, refundTransactionId, deposit_id]
    );

    await pgClient.query('COMMIT');

    await safeLog({
      actorUserId: req.user?.user_id,
      actorRole: extractActorRole(req.user?.role),
      actionType: 'DEPOSIT_FORFEITED',
      entityType: 'DEPOSIT',
      entityId: deposit_id,
      details: { amount: totalAmount, forfeited_amount: forfeitAmt, refunded_amount: refundAmt, notes },
    });

    res.status(200).json({ status: 'success', data: result.rows[0] });
  } catch (error) {
    await pgClient.query('ROLLBACK');
    console.error('Forfeit Deposit Error:', error);
    res.status(500).json({ message: 'Failed to forfeit deposit' });
  } finally {
    pgClient.release();
  }
};
