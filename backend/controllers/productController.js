const db = require('../config/db');
const { logActivity } = require('../utils/activityLogger');

async function safeLog(params) {
  try {
    await logActivity(params);
  } catch (err) {
    console.error('Activity log error:', err);
  }
}

function extractActorRole(role) {
  const raw = Array.isArray(role) ? role[0] : role;
  return typeof raw === 'string' ? raw.replace(/\{|\}/g, '').split(',')[0].trim() : String(raw);
}

const PRODUCT_TYPES = ['ITEM', 'RENTAL', 'ONE_TIME_SERVICE'];
function normalizeProductType(product_type) {
  return PRODUCT_TYPES.includes(product_type) ? product_type : 'ITEM';
}

// 1. Get All Products (catalog browse — public + admin, optionally filtered)
exports.getAllProducts = async (req, res) => {
  const { product_type, category_id, include_unavailable } = req.query;

  try {
    const conditions = [];
    const params = [];

    if (!include_unavailable) {
      conditions.push('p.is_available = true');
    }
    if (product_type) {
      params.push(product_type);
      conditions.push(`p.product_type = $${params.length}`);
    }
    if (category_id) {
      params.push(category_id);
      conditions.push(`p.category_id = $${params.length}`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await db.query(
      `SELECT p.*, c.name as category_name, v.name as vendor_name
       FROM products p
       LEFT JOIN categories c ON p.category_id = c.category_id
       LEFT JOIN vendors v ON p.vendor_id = v.vendor_id
       ${where}
       ORDER BY p.created_at DESC`,
      params
    );
    res.status(200).json({ status: 'success', data: result.rows });
  } catch (error) {
    console.error('Get All Products Error:', error);
    res.status(500).json({ message: "Error fetching products" });
  }
};

// Get a single product (used for the admin edit form / product detail)
exports.getProduct = async (req, res) => {
  const { id } = req.params;

  try {
    const result = await db.query(
      `SELECT p.*, c.name as category_name, v.name as vendor_name
       FROM products p
       LEFT JOIN categories c ON p.category_id = c.category_id
       LEFT JOIN vendors v ON p.vendor_id = v.vendor_id
       WHERE p.product_id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Product not found' });
    }

    res.status(200).json({ status: 'success', data: result.rows[0] });
  } catch (error) {
    console.error('Get Product Error:', error);
    res.status(500).json({ message: 'Error fetching product' });
  }
};

// Purchase history for an ITEM-type product — every quotation line item that
// referenced this product, plus the invoice generated for that quote (if
// any). A PRODUCT quote's invoice is per-quote, not per-line-item, so if a
// quote bundled several different products together, the same invoice_code
// will show up under each of their histories — invoice_amount is the whole
// invoice's total, li.amount is just this line's share of it.
exports.getProductPurchaseHistory = async (req, res) => {
  const { id } = req.params;

  try {
    const result = await db.query(
      `SELECT li.line_item_id, li.quantity, li.unit_price, li.amount,
              q.quote_id, q.estimate_number, q.created_at AS quoted_at, q.status AS quote_status,
              cp.full_name AS client_name, wc.full_name AS walk_in_name,
              i.invoice_id, i.invoice_code, i.status AS invoice_status, i.amount AS invoice_amount, i.paid_at
       FROM quote_line_items li
       JOIN quotations q ON li.quote_id = q.quote_id
       LEFT JOIN client_profiles cp ON q.client_id = cp.client_profile_id
       LEFT JOIN walk_in_customers wc ON q.walk_in_customer_id = wc.walk_in_customer_id
       LEFT JOIN invoices i ON i.quote_id = q.quote_id
       WHERE li.product_id = $1
       ORDER BY q.created_at DESC`,
      [id]
    );

    res.status(200).json({ status: 'success', data: result.rows });
  } catch (error) {
    console.error('Get Product Purchase History Error:', error);
    res.status(500).json({ message: 'Error fetching purchase history' });
  }
};

// GET /api/products/mine — the logged-in client's own purchased items and
// rental agreements (with deposit status), for the client portal "My Products" page.
exports.getMyOrders = async (req, res) => {
  try {
    const clientResult = await db.query(
      'SELECT client_profile_id FROM client_profiles WHERE user_id = $1',
      [req.user.user_id]
    );
    if (clientResult.rows.length === 0) {
      return res.status(404).json({ message: 'Client profile not found for this account' });
    }
    const client_id = clientResult.rows[0].client_profile_id;

    const purchasesResult = await db.query(
      `SELECT li.line_item_id, li.quantity, li.unit_price, li.amount,
              p.product_id, p.name AS product_name, p.image_url,
              q.quote_id, q.estimate_number, q.status AS quote_status, q.created_at AS quoted_at,
              i.invoice_id, i.invoice_code, i.status AS invoice_status, i.amount AS invoice_amount, i.paid_at
       FROM quote_line_items li
       JOIN quotations q ON li.quote_id = q.quote_id
       JOIN products p ON li.product_id = p.product_id
       LEFT JOIN invoices i ON i.quote_id = q.quote_id
       WHERE q.quote_type = 'PRODUCT' AND q.client_id = $1 AND p.product_type != 'RENTAL'
       ORDER BY q.created_at DESC`,
      [client_id]
    );

    const rentalsResult = await db.query(
      `SELECT ra.rental_agreement_id, ra.billing_type, ra.rate, ra.start_date, ra.end_date,
              ra.next_invoice_date, ra.deposit_amount, ra.status, ra.created_at, ra.returned_at,
              p.product_id, p.name AS product_name, p.image_url, ru.unit_code,
              d.deposit_id, d.status AS deposit_status, d.amount AS deposit_collected_amount,
              d.held_at AS deposit_held_at, d.refunded_at AS deposit_refunded_at
       FROM rental_agreements ra
       JOIN products p ON ra.product_id = p.product_id
       JOIN rental_units ru ON ra.unit_id = ru.unit_id
       LEFT JOIN deposits d ON d.rental_agreement_id = ra.rental_agreement_id
       WHERE ra.client_id = $1
       ORDER BY ra.created_at DESC`,
      [client_id]
    );

    res.status(200).json({
      status: 'success',
      data: { purchases: purchasesResult.rows, rentals: rentalsResult.rows },
    });
  } catch (error) {
    console.error('Get My Orders Error:', error);
    res.status(500).json({ message: 'Failed to fetch your products' });
  }
};

// 2. Create Product (Admin Only)
exports.createProduct = async (req, res) => {
  const { name, category_id, description, price, cost_price, stock_quantity, product_type, vendor_id } = req.body;

  // The URL of the uploaded image on S3
  const image_url = req.file ? req.file.location : null;

  try {
    const query = `
      INSERT INTO products (name, category_id, description, price, cost_price, stock_quantity, image_url, product_type, vendor_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *;
    `;
    const result = await db.query(query, [
      name,
      category_id || null,
      description,
      price,
      cost_price || 0,
      stock_quantity || 0,
      image_url,
      normalizeProductType(product_type),
      vendor_id || null,
    ]);

    await safeLog({
      actorUserId: req.user?.user_id,
      actorRole: extractActorRole(req.user?.role),
      actionType: 'PRODUCT_CREATED',
      entityType: 'PRODUCT',
      entityId: result.rows[0].product_id,
      details: { name, product_type: result.rows[0].product_type, price },
    });

    res.status(201).json({ status: 'success', data: result.rows[0] });
  } catch (error) {
    console.error('Create Product Error:', error);
    res.status(500).json({ message: "Error creating product" });
  }
};

// Update Product (Admin Only) — image is optional, keeps existing image_url if not re-uploaded
exports.updateProduct = async (req, res) => {
  const { id } = req.params;
  const { name, category_id, description, price, cost_price, stock_quantity, product_type, is_available, vendor_id } = req.body;

  try {
    const existing = await db.query('SELECT image_url FROM products WHERE product_id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ message: 'Product not found' });
    }

    const image_url = req.file ? req.file.location : existing.rows[0].image_url;

    const result = await db.query(
      `UPDATE products
       SET name = $1, category_id = $2, description = $3, price = $4, cost_price = $5, stock_quantity = $6,
           image_url = $7, product_type = $8, is_available = $9, vendor_id = $10, updated_at = CURRENT_TIMESTAMP
       WHERE product_id = $11
       RETURNING *`,
      [
        name,
        category_id || null,
        description,
        price,
        cost_price || 0,
        stock_quantity || 0,
        image_url,
        normalizeProductType(product_type),
        is_available === undefined ? true : is_available === 'true' || is_available === true,
        vendor_id || null,
        id,
      ]
    );

    await safeLog({
      actorUserId: req.user?.user_id,
      actorRole: extractActorRole(req.user?.role),
      actionType: 'PRODUCT_UPDATED',
      entityType: 'PRODUCT',
      entityId: id,
      details: { name, product_type: result.rows[0].product_type, price },
    });

    res.status(200).json({ status: 'success', data: result.rows[0] });
  } catch (error) {
    console.error('Update Product Error:', error);
    res.status(500).json({ message: 'Error updating product' });
  }
};

// Deactivate Product (soft delete — matches preset-item convention elsewhere)
exports.deactivateProduct = async (req, res) => {
  const { id } = req.params;

  try {
    const result = await db.query(
      `UPDATE products SET is_available = false, updated_at = CURRENT_TIMESTAMP
       WHERE product_id = $1 RETURNING *`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Product not found' });
    }

    await safeLog({
      actorUserId: req.user?.user_id,
      actorRole: extractActorRole(req.user?.role),
      actionType: 'PRODUCT_DEACTIVATED',
      entityType: 'PRODUCT',
      entityId: id,
      details: { product_id: id },
    });

    res.status(200).json({ status: 'success', message: 'Product deactivated' });
  } catch (error) {
    console.error('Deactivate Product Error:', error);
    res.status(500).json({ message: 'Error deactivating product' });
  }
};

// ==================== CATEGORIES ====================

exports.getCategories = async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM categories ORDER BY name');
    res.status(200).json({ status: 'success', data: result.rows });
  } catch (error) {
    console.error('Get Categories Error:', error);
    res.status(500).json({ message: 'Error fetching categories' });
  }
};

exports.createCategory = async (req, res) => {
  const { name, description } = req.body;

  try {
    const result = await db.query(
      'INSERT INTO categories (name, description) VALUES ($1, $2) RETURNING *',
      [name, description || null]
    );
    res.status(201).json({ status: 'success', data: result.rows[0] });
  } catch (error) {
    console.error('Create Category Error:', error);
    res.status(500).json({ message: 'Error creating category' });
  }
};
