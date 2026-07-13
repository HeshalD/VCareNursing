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

exports.createWalkInCustomer = async (req, res) => {
  const { full_name, mobile_number, address } = req.body;

  if (!full_name) {
    return res.status(400).json({ message: 'full_name is required' });
  }

  try {
    const result = await db.query(
      `INSERT INTO walk_in_customers (full_name, mobile_number, address, created_by)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [full_name, mobile_number || null, address || null, req.user?.user_id || null]
    );

    await safeLog({
      actorUserId: req.user?.user_id,
      actorRole: extractActorRole(req.user?.role),
      actionType: 'WALK_IN_CUSTOMER_CREATED',
      entityType: 'WALK_IN_CUSTOMER',
      entityId: result.rows[0].walk_in_customer_id,
      details: { full_name, mobile_number },
    });

    res.status(201).json({ status: 'success', data: result.rows[0] });
  } catch (error) {
    console.error('Create Walk-In Customer Error:', error);
    res.status(500).json({ message: 'Error creating walk-in customer' });
  }
};

exports.searchWalkInCustomers = async (req, res) => {
  const { q } = req.query;

  try {
    const result = await db.query(
      `SELECT * FROM walk_in_customers
       WHERE ($1::text IS NULL OR full_name ILIKE '%' || $1 || '%' OR mobile_number ILIKE '%' || $1 || '%')
       ORDER BY created_at DESC
       LIMIT 50`,
      [q || null]
    );
    res.status(200).json({ status: 'success', data: result.rows });
  } catch (error) {
    console.error('Search Walk-In Customers Error:', error);
    res.status(500).json({ message: 'Error searching walk-in customers' });
  }
};
