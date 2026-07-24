// Vendors — external suppliers a product can be sourced from, and
// recurring-expense payees (utilities etc.) tracked the same way.
//
// vendor_bills/vendor_bill_payments mirrors invoices/invoice_payments
// (see invoiceController.applyInvoicePayment): one "amount owed" header
// row + N payment rows, each optionally linked to a bank_account_id/
// transaction_id. A vendor's outstanding balance is always computed live
// from these rows, never stored — same approach bank_accounts uses for
// current_balance.

const db = require('../config/db');
const { logActivity } = require('../utils/activityLogger');
const { resolveBankAccountId } = require('../utils/pettyCash');

const VALID_PAYMENT_METHODS = ['BANK_TRANSFER', 'CASH_DEPOSIT', 'CASH', 'CHEQUE'];
const VALID_VENDOR_TYPES = ['SUPPLIER', 'UTILITY', 'OTHER'];
const VALID_BILL_SOURCE_TYPES = ['PRODUCT_SALE', 'RENTAL', 'UTILITY', 'OTHER'];

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

// ==================== VENDORS ====================

exports.getAllVendors = async (req, res) => {
  const { vendor_type, include_inactive } = req.query;

  try {
    const conditions = [];
    const params = [];

    if (!include_inactive) {
      conditions.push('v.is_active = true');
    }
    if (vendor_type) {
      params.push(vendor_type);
      conditions.push(`v.vendor_type = $${params.length}`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await db.query(
      `SELECT v.*,
              COALESCE(bills.total_billed, 0) - COALESCE(bills.total_paid, 0) AS outstanding_balance
       FROM vendors v
       LEFT JOIN (
         SELECT vb.vendor_id,
                SUM(vb.amount) AS total_billed,
                SUM(COALESCE(paid.amount_paid, 0)) AS total_paid
         FROM vendor_bills vb
         LEFT JOIN (
           SELECT vendor_bill_id, SUM(amount) AS amount_paid
           FROM vendor_bill_payments
           GROUP BY vendor_bill_id
         ) paid ON paid.vendor_bill_id = vb.vendor_bill_id
         GROUP BY vb.vendor_id
       ) bills ON bills.vendor_id = v.vendor_id
       ${where}
       ORDER BY v.name`,
      params
    );
    res.status(200).json({ status: 'success', data: result.rows });
  } catch (error) {
    console.error('Get All Vendors Error:', error);
    res.status(500).json({ message: 'Error fetching vendors' });
  }
};

exports.getVendor = async (req, res) => {
  const { id } = req.params;

  try {
    const result = await db.query('SELECT * FROM vendors WHERE vendor_id = $1', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Vendor not found' });
    }

    const balanceResult = await db.query(
      `SELECT COALESCE(SUM(vb.amount), 0) AS total_billed,
              COALESCE(SUM(paid.amount_paid), 0) AS total_paid
       FROM vendor_bills vb
       LEFT JOIN (
         SELECT vendor_bill_id, SUM(amount) AS amount_paid
         FROM vendor_bill_payments
         GROUP BY vendor_bill_id
       ) paid ON paid.vendor_bill_id = vb.vendor_bill_id
       WHERE vb.vendor_id = $1`,
      [id]
    );
    const { total_billed, total_paid } = balanceResult.rows[0];

    res.status(200).json({
      status: 'success',
      data: {
        ...result.rows[0],
        total_billed: parseFloat(total_billed),
        total_paid: parseFloat(total_paid),
        outstanding_balance: parseFloat(total_billed) - parseFloat(total_paid),
      },
    });
  } catch (error) {
    console.error('Get Vendor Error:', error);
    res.status(500).json({ message: 'Error fetching vendor' });
  }
};

exports.createVendor = async (req, res) => {
  const { name, vendor_type, contact_person, phone, email, address, notes } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ message: 'name is required' });
  }
  if (vendor_type && !VALID_VENDOR_TYPES.includes(vendor_type)) {
    return res.status(400).json({ message: `vendor_type must be one of: ${VALID_VENDOR_TYPES.join(', ')}` });
  }

  try {
    const result = await db.query(
      `INSERT INTO vendors (name, vendor_type, contact_person, phone, email, address, notes, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [name.trim(), vendor_type || 'SUPPLIER', contact_person || null, phone || null, email || null, address || null, notes || null, req.user?.user_id || null]
    );

    await safeLog({
      actorUserId: req.user?.user_id,
      actorRole: extractActorRole(req.user?.role),
      actionType: 'VENDOR_CREATED',
      entityType: 'VENDOR',
      entityId: result.rows[0].vendor_id,
      details: { name, vendor_type: result.rows[0].vendor_type },
    });

    res.status(201).json({ status: 'success', data: result.rows[0] });
  } catch (error) {
    console.error('Create Vendor Error:', error);
    res.status(500).json({ message: 'Error creating vendor' });
  }
};

exports.updateVendor = async (req, res) => {
  const { id } = req.params;
  const { name, vendor_type, contact_person, phone, email, address, notes, is_active } = req.body;

  if (vendor_type && !VALID_VENDOR_TYPES.includes(vendor_type)) {
    return res.status(400).json({ message: `vendor_type must be one of: ${VALID_VENDOR_TYPES.join(', ')}` });
  }

  try {
    const existing = await db.query('SELECT * FROM vendors WHERE vendor_id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ message: 'Vendor not found' });
    }
    const current = existing.rows[0];

    const result = await db.query(
      `UPDATE vendors
       SET name = $1, vendor_type = $2, contact_person = $3, phone = $4, email = $5,
           address = $6, notes = $7, is_active = $8, updated_at = CURRENT_TIMESTAMP
       WHERE vendor_id = $9
       RETURNING *`,
      [
        name || current.name,
        vendor_type || current.vendor_type,
        contact_person !== undefined ? contact_person : current.contact_person,
        phone !== undefined ? phone : current.phone,
        email !== undefined ? email : current.email,
        address !== undefined ? address : current.address,
        notes !== undefined ? notes : current.notes,
        is_active === undefined ? current.is_active : (is_active === 'true' || is_active === true),
        id,
      ]
    );

    await safeLog({
      actorUserId: req.user?.user_id,
      actorRole: extractActorRole(req.user?.role),
      actionType: 'VENDOR_UPDATED',
      entityType: 'VENDOR',
      entityId: id,
      details: { name: result.rows[0].name },
    });

    res.status(200).json({ status: 'success', data: result.rows[0] });
  } catch (error) {
    console.error('Update Vendor Error:', error);
    res.status(500).json({ message: 'Error updating vendor' });
  }
};

exports.deactivateVendor = async (req, res) => {
  const { id } = req.params;

  try {
    const result = await db.query(
      `UPDATE vendors SET is_active = false, updated_at = CURRENT_TIMESTAMP
       WHERE vendor_id = $1 RETURNING *`,
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Vendor not found' });
    }

    await safeLog({
      actorUserId: req.user?.user_id,
      actorRole: extractActorRole(req.user?.role),
      actionType: 'VENDOR_DEACTIVATED',
      entityType: 'VENDOR',
      entityId: id,
      details: {},
    });

    res.status(200).json({ status: 'success', message: 'Vendor deactivated' });
  } catch (error) {
    console.error('Deactivate Vendor Error:', error);
    res.status(500).json({ message: 'Error deactivating vendor' });
  }
};

// ==================== VENDOR BILLS ====================

exports.getVendorBills = async (req, res) => {
  const { id } = req.params;

  try {
    const result = await db.query(
      `SELECT vb.*,
              COALESCE(paid.amount_paid, 0) AS amount_paid,
              p.name AS product_name
       FROM vendor_bills vb
       LEFT JOIN (
         SELECT vendor_bill_id, SUM(amount) AS amount_paid
         FROM vendor_bill_payments
         GROUP BY vendor_bill_id
       ) paid ON paid.vendor_bill_id = vb.vendor_bill_id
       LEFT JOIN products p ON p.product_id = vb.product_id
       WHERE vb.vendor_id = $1
       ORDER BY vb.created_at DESC`,
      [id]
    );
    res.status(200).json({ status: 'success', data: result.rows });
  } catch (error) {
    console.error('Get Vendor Bills Error:', error);
    res.status(500).json({ message: 'Error fetching vendor bills' });
  }
};

exports.getVendorBillPayments = async (req, res) => {
  const { billId } = req.params;

  try {
    const result = await db.query(
      `SELECT * FROM vendor_bill_payments WHERE vendor_bill_id = $1 ORDER BY created_at DESC`,
      [billId]
    );
    res.status(200).json({ status: 'success', data: result.rows });
  } catch (error) {
    console.error('Get Vendor Bill Payments Error:', error);
    res.status(500).json({ message: 'Error fetching vendor bill payments' });
  }
};

// Shared core — inserts one vendor_bills row. Runs on a caller-supplied
// pgClient so it can be called either standalone (manual "Record Bill") or
// bundled inside acceptProductQuote/createRentalAgreementCore's own
// transaction when a sold/rented product has a vendor_id.
async function createVendorBillCore(pgClient, {
  vendor_id, source_type, product_id, reference_id, amount, description, createdBy,
}) {
  if (!vendor_id) throw Object.assign(new Error('vendor_id is required'), { statusCode: 400 });
  if (!VALID_BILL_SOURCE_TYPES.includes(source_type)) {
    throw Object.assign(new Error(`source_type must be one of: ${VALID_BILL_SOURCE_TYPES.join(', ')}`), { statusCode: 400 });
  }
  if (!amount || parseFloat(amount) <= 0) {
    throw Object.assign(new Error('amount must be a positive number'), { statusCode: 400 });
  }

  const result = await pgClient.query(
    `INSERT INTO vendor_bills (vendor_id, source_type, product_id, reference_id, amount, description, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     RETURNING *`,
    [vendor_id, source_type, product_id || null, reference_id || null, amount, description || null, createdBy || null]
  );
  return result.rows[0];
}
exports.createVendorBillCore = createVendorBillCore;

// POST /api/vendors/:id/bills — manual "Record Bill" for UTILITY/OTHER
// vendors (WiFi, electricity, water, etc.) with no linked product/sale.
exports.createVendorBill = async (req, res) => {
  const { id } = req.params;
  const { source_type, amount, description } = req.body;

  try {
    const vendorResult = await db.query('SELECT * FROM vendors WHERE vendor_id = $1 AND is_active = true', [id]);
    if (vendorResult.rows.length === 0) {
      return res.status(404).json({ message: 'Vendor not found or inactive' });
    }

    const bill = await createVendorBillCore(db, {
      vendor_id: id,
      source_type: source_type || 'OTHER',
      amount,
      description,
      createdBy: req.user?.user_id,
    });

    await safeLog({
      actorUserId: req.user?.user_id,
      actorRole: extractActorRole(req.user?.role),
      actionType: 'VENDOR_BILL_CREATED',
      entityType: 'VENDOR_BILL',
      entityId: bill.vendor_bill_id,
      details: { vendor_id: id, amount: bill.amount, source_type: bill.source_type },
    });

    res.status(201).json({ status: 'success', data: bill });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    console.error('Create Vendor Bill Error:', error);
    res.status(500).json({ message: 'Error creating vendor bill' });
  }
};

// Shared core for applying a payment against a vendor bill — mirrors
// invoiceController.applyInvoicePayment. Runs on a caller-supplied pgClient
// inside an open transaction; caller owns BEGIN/COMMIT/ROLLBACK.
async function applyVendorBillPayment(pgClient, {
  bill, vendor, amount, payment_method, bank_account_id, cheque_number, cheque_date,
  reference_number, notes, actorUserId,
}) {
  const paidSoFarResult = await pgClient.query(
    `SELECT COALESCE(SUM(amount), 0) as paid FROM vendor_bill_payments WHERE vendor_bill_id = $1`,
    [bill.vendor_bill_id]
  );
  const paidSoFar = parseFloat(paidSoFarResult.rows[0].paid || 0);
  const remaining = parseFloat(bill.amount) - paidSoFar;

  if (amount <= 0 || amount > remaining + 0.01) {
    const err = new Error(`Payment amount must be between 0 and the remaining balance (${remaining.toFixed(2)})`);
    err.statusCode = 400;
    throw err;
  }

  const resolvedBankAccountId = await resolveBankAccountId(payment_method, bank_account_id);
  const finalNotes = notes || `${vendor.name} — vendor bill payment`;

  const txResult = await pgClient.query(
    `INSERT INTO transactions
       (category, transaction_type, amount, payment_method, bank_account_id,
        cheque_number, cheque_date, reference_number, notes, status, verified_by, external_party)
     VALUES ('VENDOR_PAYMENT','DEBIT',$1,$2,$3,$4,$5,$6,$7,'COMPLETED',$8,$9)
     RETURNING transaction_id`,
    [
      amount, payment_method, resolvedBankAccountId, cheque_number || null, cheque_date || null,
      reference_number || null, finalNotes, actorUserId, vendor.name,
    ]
  );
  const transaction_id = txResult.rows[0].transaction_id;

  await pgClient.query(
    `INSERT INTO vendor_bill_payments
       (vendor_bill_id, transaction_id, amount, payment_method, bank_account_id,
        cheque_number, cheque_date, reference_number, notes, verified_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [
      bill.vendor_bill_id, transaction_id, amount, payment_method, resolvedBankAccountId,
      cheque_number || null, cheque_date || null, reference_number || null, finalNotes, actorUserId,
    ]
  );

  const newTotalPaid = paidSoFar + amount;
  const newStatus = newTotalPaid >= parseFloat(bill.amount) - 0.01 ? 'PAID' : 'PARTIALLY_PAID';
  const updatedBillResult = await pgClient.query(
    `UPDATE vendor_bills SET status = $1 WHERE vendor_bill_id = $2 RETURNING *`,
    [newStatus, bill.vendor_bill_id]
  );

  return { bill: updatedBillResult.rows[0], amount_paid: newTotalPaid, transaction_id };
}
exports.applyVendorBillPayment = applyVendorBillPayment;

// POST /api/vendors/bills/:billId/payments
exports.recordVendorBillPayment = async (req, res) => {
  const pgClient = await db.pool.connect();
  const { billId } = req.params;

  try {
    const { payment_method, bank_account_id, cheque_number, cheque_date, reference_number, notes, amount } = req.body;

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

    const billResult = await pgClient.query('SELECT * FROM vendor_bills WHERE vendor_bill_id = $1 FOR UPDATE', [billId]);
    if (billResult.rows.length === 0) {
      await pgClient.query('ROLLBACK');
      return res.status(404).json({ message: 'Vendor bill not found' });
    }
    const bill = billResult.rows[0];
    if (bill.status === 'PAID') {
      await pgClient.query('ROLLBACK');
      return res.status(409).json({ message: 'Vendor bill is already fully paid' });
    }

    const vendorResult = await pgClient.query('SELECT * FROM vendors WHERE vendor_id = $1', [bill.vendor_id]);
    const vendor = vendorResult.rows[0];

    const paidSoFarResult = await pgClient.query(
      `SELECT COALESCE(SUM(amount), 0) as paid FROM vendor_bill_payments WHERE vendor_bill_id = $1`,
      [billId]
    );
    const remaining = parseFloat(bill.amount) - parseFloat(paidSoFarResult.rows[0].paid || 0);
    const parsedAmount = amount !== undefined && amount !== null && amount !== '' ? parseFloat(amount) : remaining;

    let result;
    try {
      result = await applyVendorBillPayment(pgClient, {
        bill,
        vendor,
        amount: parsedAmount,
        payment_method,
        bank_account_id,
        cheque_number,
        cheque_date,
        reference_number,
        notes,
        actorUserId: req.user?.user_id || null,
      });
    } catch (err) {
      await pgClient.query('ROLLBACK');
      return res.status(err.statusCode || 500).json({ message: err.message || 'Failed to record vendor bill payment' });
    }

    await pgClient.query('COMMIT');

    await safeLog({
      actorUserId: req.user?.user_id,
      actorRole: extractActorRole(req.user?.role),
      actionType: 'VENDOR_BILL_PAYMENT_RECORDED',
      entityType: 'VENDOR_BILL',
      entityId: billId,
      details: { amount: parsedAmount, payment_method },
    });

    res.status(200).json({ status: 'success', data: { ...result.bill, amount_paid: result.amount_paid } });
  } catch (error) {
    await pgClient.query('ROLLBACK');
    console.error('Record Vendor Bill Payment Error:', error);
    res.status(500).json({ message: 'Failed to record vendor bill payment' });
  } finally {
    pgClient.release();
  }
};
