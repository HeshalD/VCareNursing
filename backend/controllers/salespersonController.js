const db = require('../config/db');
const { logActivity } = require('../utils/activityLogger');
const {
  SalespersonError,
  creditSalespersonForBooking,
  switchBookingSalesperson,
  getBookingSalesperson,
} = require('../services/salespersonService');
const {
  ClientSalespersonError,
  creditSalespersonForRegistration,
  switchClientSalesperson,
  getClientSalesperson,
} = require('../services/clientSalespersonService');

function extractActorRole(role) {
  const raw = Array.isArray(role) ? role[0] : role;
  return typeof raw === 'string' ? raw.replace(/\{|\}/g, '').split(',')[0].trim() : String(raw);
}

// Map service-layer error codes to HTTP statuses.
const ERROR_STATUS = {
  INVALID_ID: 400,
  SALESPERSON_NOT_FOUND: 404,
  BOOKING_NOT_FOUND: 404,
  CLIENT_NOT_FOUND: 404,
  NO_CURRENT: 400,
  SAME_SALESPERSON: 400,
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/salespersons
 * List sales-eligible internal staff with their permanent sales aggregates.
 * Salespersons are internal_staff whose role contains "sales" (case-insensitive).
 * Pass ?all=true to return every internal_staff member instead.
 */
exports.listSalespersons = async (req, res) => {
  try {
    const includeAll = String(req.query.all || '').toLowerCase() === 'true';
    const where = includeAll ? '' : `WHERE role ILIKE '%sales%'`;
    const result = await db.query(
      `SELECT id, full_name, role, email, phone, status,
              total_sales_amount, bookings_brought_count,
              registrations_total_amount, registrations_brought_count
       FROM internal_staff
       ${where}
       ORDER BY bookings_brought_count DESC, full_name ASC`
    );
    res.json({
      status: 'success',
      count: result.rows.length,
      data: result.rows.map((r) => ({
        ...r,
        total_sales_amount: parseFloat(r.total_sales_amount || 0),
        bookings_brought_count: parseInt(r.bookings_brought_count || 0, 10),
        registrations_total_amount: parseFloat(r.registrations_total_amount || 0),
        registrations_brought_count: parseInt(r.registrations_brought_count || 0, 10),
      })),
    });
  } catch (err) {
    console.error('listSalespersons error:', err);
    res.status(500).json({ status: 'error', message: 'Failed to list salespersons' });
  }
};

/**
 * GET /api/salespersons/:salesperson_id/bookings
 * Audit view: every booking-salesperson assignment row for one salesperson,
 * plus their current aggregate totals.
 */
exports.getSalespersonBookings = async (req, res) => {
  const { salesperson_id } = req.params;
  if (!UUID_RE.test(salesperson_id)) {
    return res.status(400).json({ status: 'error', message: 'Invalid salesperson ID format' });
  }
  try {
    const staffRes = await db.query(
      `SELECT id, full_name, role, email, phone, status, joined_date,
              total_sales_amount, bookings_brought_count,
              registrations_total_amount, registrations_brought_count
       FROM internal_staff WHERE id = $1`,
      [salesperson_id]
    );
    if (staffRes.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Salesperson not found' });
    }

    const rowsRes = await db.query(
      `SELECT bsa.id, bsa.booking_id, b.booking_code, b.status AS booking_status,
              b.service_type, b.start_date, b.amount_paid,
              cp.full_name AS client_name,
              COALESCE(pp.full_name, sr.patient_name) AS patient_name,
              bsa.credited_amount, bsa.is_current, bsa.is_origin, bsa.action,
              bsa.switch_reason, bsa.assigned_at
       FROM booking_salesperson_assignments bsa
       JOIN bookings b ON bsa.booking_id = b.booking_id
       LEFT JOIN client_profiles cp ON b.client_id = cp.client_profile_id
       LEFT JOIN service_requests sr ON b.request_id = sr.request_id
       LEFT JOIN patient_profiles pp ON b.patient_id = pp.patient_id
       WHERE bsa.salesperson_id = $1
       ORDER BY bsa.assigned_at DESC`,
      [salesperson_id]
    );

    const staff = staffRes.rows[0];
    res.json({
      status: 'success',
      data: {
        salesperson: {
          id: staff.id,
          full_name: staff.full_name,
          role: staff.role,
          email: staff.email,
          phone: staff.phone,
          status: staff.status,
          joined_date: staff.joined_date,
          total_sales_amount: parseFloat(staff.total_sales_amount || 0),
          bookings_brought_count: parseInt(staff.bookings_brought_count || 0, 10),
          registrations_total_amount: parseFloat(staff.registrations_total_amount || 0),
          registrations_brought_count: parseInt(staff.registrations_brought_count || 0, 10),
        },
        assignments: rowsRes.rows.map((r) => ({
          ...r,
          credited_amount: parseFloat(r.credited_amount || 0),
          amount_paid: parseFloat(r.amount_paid || 0),
        })),
      },
    });
  } catch (err) {
    console.error('getSalespersonBookings error:', err);
    res.status(500).json({ status: 'error', message: 'Failed to fetch salesperson bookings' });
  }
};

/**
 * GET /api/salespersons/booking/:booking_id
 * Current + origin salesperson and full history for one booking.
 */
exports.getBookingSalespersonHandler = async (req, res) => {
  const { booking_id } = req.params;
  try {
    const data = await getBookingSalesperson(db, booking_id);
    res.json({
      status: 'success',
      data: {
        current: data.current,
        origin: data.origin,
        history: data.history.map((r) => ({ ...r, credited_amount: parseFloat(r.credited_amount || 0) })),
      },
    });
  } catch (err) {
    if (err instanceof SalespersonError) {
      return res.status(ERROR_STATUS[err.code] || 400).json({ status: 'error', message: err.message });
    }
    console.error('getBookingSalespersonHandler error:', err);
    res.status(500).json({ status: 'error', message: 'Failed to fetch booking salesperson' });
  }
};

/**
 * POST /api/salespersons/booking/:booking_id/credit
 * Credit the booking's paid amount to a salesperson (initial assignment).
 * @body { salesperson_id }
 */
exports.creditHandler = async (req, res) => {
  const { booking_id } = req.params;
  const { salesperson_id } = req.body;
  const assigned_by = req.user?.user_id;

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const result = await creditSalespersonForBooking(client, { booking_id, salesperson_id, assigned_by });
    await client.query('COMMIT');

    if (!result.credited && result.alreadyCredited) {
      return res.status(409).json({
        status: 'error',
        message: 'This booking already has a credited (origin) salesperson. Use switch to change the current one.',
      });
    }

    // Fire-and-forget audit log.
    logActivity({
      actorUserId: assigned_by,
      actorRole: extractActorRole(req.user?.role),
      actionType: 'SALESPERSON_CREDITED',
      entityType: 'booking',
      entityId: String(booking_id),
      details: { booking_id, salesperson_id, credited_amount: result.credited_amount },
    }).catch((e) => console.error('[Salesperson] activity log error:', e.message));

    res.status(201).json({
      status: 'success',
      message: `${result.salesperson_name} credited with ${result.credited_amount}`,
      data: result.assignment,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err instanceof SalespersonError) {
      return res.status(ERROR_STATUS[err.code] || 400).json({ status: 'error', message: err.message });
    }
    console.error('creditHandler error:', err);
    res.status(500).json({ status: 'error', message: 'Failed to credit salesperson' });
  } finally {
    client.release();
  }
};

/**
 * PUT /api/salespersons/booking/:booking_id/switch
 * Switch the currently assigned salesperson (pointer only — amount & count stay).
 * @body { salesperson_id, switch_reason (optional) }
 */
exports.switchHandler = async (req, res) => {
  const { booking_id } = req.params;
  const { salesperson_id, switch_reason } = req.body;
  const assigned_by = req.user?.user_id;

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const result = await switchBookingSalesperson(client, {
      booking_id,
      new_salesperson_id: salesperson_id,
      assigned_by,
      switch_reason,
    });
    await client.query('COMMIT');

    logActivity({
      actorUserId: assigned_by,
      actorRole: extractActorRole(req.user?.role),
      actionType: 'SALESPERSON_SWITCHED',
      entityType: 'booking',
      entityId: String(booking_id),
      details: { booking_id, from: result.from, to: result.to, switch_reason: switch_reason || null },
    }).catch((e) => console.error('[Salesperson] activity log error:', e.message));

    res.json({
      status: 'success',
      message: `Current salesperson switched to ${result.salesperson_name}`,
      data: result.assignment,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err instanceof SalespersonError) {
      return res.status(ERROR_STATUS[err.code] || 400).json({ status: 'error', message: err.message });
    }
    console.error('switchHandler error:', err);
    res.status(500).json({ status: 'error', message: 'Failed to switch salesperson' });
  } finally {
    client.release();
  }
};

// =========================================================
// CLIENT REGISTRATION SALESPERSON CREDITING
// Separate metric from the booking-based one above: "sales" here means the
// count of client registrations (reg fee payments) a salesperson brought in.
// =========================================================

/**
 * GET /api/salespersons/:salesperson_id/clients
 * Audit view: every client-salesperson assignment row for one salesperson,
 * plus their current registration aggregates.
 */
exports.getSalespersonClients = async (req, res) => {
  const { salesperson_id } = req.params;
  if (!UUID_RE.test(salesperson_id)) {
    return res.status(400).json({ status: 'error', message: 'Invalid salesperson ID format' });
  }
  try {
    const staffRes = await db.query(
      `SELECT id, full_name, role, email, phone, status, joined_date,
              registrations_total_amount, registrations_brought_count
       FROM internal_staff WHERE id = $1`,
      [salesperson_id]
    );
    if (staffRes.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Salesperson not found' });
    }

    const rowsRes = await db.query(
      `SELECT csa.id, csa.client_id, cp.full_name AS client_name, u.mobile_number,
              cp.reg_fee_status, cp.reg_fee_paid_at, cp.reg_fee_expires_at,
              csa.credited_amount, csa.is_current, csa.is_origin, csa.action,
              csa.switch_reason, csa.assigned_at
       FROM client_salesperson_assignments csa
       JOIN client_profiles cp ON csa.client_id = cp.client_profile_id
       LEFT JOIN users u ON cp.user_id = u.user_id
       WHERE csa.salesperson_id = $1
       ORDER BY csa.assigned_at DESC`,
      [salesperson_id]
    );

    const staff = staffRes.rows[0];
    res.json({
      status: 'success',
      data: {
        salesperson: {
          id: staff.id,
          full_name: staff.full_name,
          role: staff.role,
          email: staff.email,
          phone: staff.phone,
          status: staff.status,
          joined_date: staff.joined_date,
          registrations_total_amount: parseFloat(staff.registrations_total_amount || 0),
          registrations_brought_count: parseInt(staff.registrations_brought_count || 0, 10),
        },
        assignments: rowsRes.rows.map((r) => ({ ...r, credited_amount: parseFloat(r.credited_amount || 0) })),
      },
    });
  } catch (err) {
    console.error('getSalespersonClients error:', err);
    res.status(500).json({ status: 'error', message: 'Failed to fetch salesperson clients' });
  }
};

/**
 * GET /api/salespersons/client/:client_id
 * Current + origin salesperson and full history for one client.
 */
exports.getClientSalespersonHandler = async (req, res) => {
  const { client_id } = req.params;
  try {
    const data = await getClientSalesperson(db, client_id);
    res.json({
      status: 'success',
      data: {
        current: data.current,
        origin: data.origin,
        history: data.history.map((r) => ({ ...r, credited_amount: parseFloat(r.credited_amount || 0) })),
      },
    });
  } catch (err) {
    if (err instanceof ClientSalespersonError) {
      return res.status(ERROR_STATUS[err.code] || 400).json({ status: 'error', message: err.message });
    }
    console.error('getClientSalespersonHandler error:', err);
    res.status(500).json({ status: 'error', message: 'Failed to fetch client salesperson' });
  }
};

/**
 * POST /api/salespersons/client/:client_id/credit
 * Credit the client's registration fee to a salesperson (initial assignment).
 * @body { salesperson_id }
 */
exports.creditClientHandler = async (req, res) => {
  const { client_id } = req.params;
  const { salesperson_id } = req.body;
  const assigned_by = req.user?.user_id;

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const result = await creditSalespersonForRegistration(client, { client_id, salesperson_id, assigned_by });
    await client.query('COMMIT');

    if (!result.credited && result.alreadyCredited) {
      return res.status(409).json({
        status: 'error',
        message: 'This client already has a credited (origin) salesperson. Use switch to change the current one.',
      });
    }

    logActivity({
      actorUserId: assigned_by,
      actorRole: extractActorRole(req.user?.role),
      actionType: 'CLIENT_SALESPERSON_CREDITED',
      entityType: 'client',
      entityId: String(client_id),
      details: { client_id, salesperson_id, credited_amount: result.credited_amount },
    }).catch((e) => console.error('[Salesperson] activity log error:', e.message));

    res.status(201).json({
      status: 'success',
      message: `${result.salesperson_name} credited with this registration`,
      data: result.assignment,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err instanceof ClientSalespersonError) {
      return res.status(ERROR_STATUS[err.code] || 400).json({ status: 'error', message: err.message });
    }
    console.error('creditClientHandler error:', err);
    res.status(500).json({ status: 'error', message: 'Failed to credit salesperson' });
  } finally {
    client.release();
  }
};

/**
 * PUT /api/salespersons/client/:client_id/switch
 * Switch the salesperson currently managing a client (pointer only — credit stays put).
 * @body { salesperson_id, switch_reason (optional) }
 */
exports.switchClientHandler = async (req, res) => {
  const { client_id } = req.params;
  const { salesperson_id, switch_reason } = req.body;
  const assigned_by = req.user?.user_id;

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const result = await switchClientSalesperson(client, {
      client_id,
      new_salesperson_id: salesperson_id,
      assigned_by,
      switch_reason,
    });
    await client.query('COMMIT');

    logActivity({
      actorUserId: assigned_by,
      actorRole: extractActorRole(req.user?.role),
      actionType: 'CLIENT_SALESPERSON_SWITCHED',
      entityType: 'client',
      entityId: String(client_id),
      details: { client_id, from: result.from, to: result.to, switch_reason: switch_reason || null },
    }).catch((e) => console.error('[Salesperson] activity log error:', e.message));

    res.json({
      status: 'success',
      message: `Client is now managed by ${result.salesperson_name}`,
      data: result.assignment,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err instanceof ClientSalespersonError) {
      return res.status(ERROR_STATUS[err.code] || 400).json({ status: 'error', message: err.message });
    }
    console.error('switchClientHandler error:', err);
    res.status(500).json({ status: 'error', message: 'Failed to switch salesperson' });
  } finally {
    client.release();
  }
};
