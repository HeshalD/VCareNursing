const db = require('../config/db');

exports.getActivityLog = async (req, res) => {
  const { page = 1, limit = 50, action_type, from, to } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  try {
    const params = [];
    const conditions = [];

    if (action_type) {
      params.push(action_type);
      conditions.push(`action_type = $${params.length}`);
    }
    if (from) {
      params.push(from);
      conditions.push(`created_at >= $${params.length}`);
    }
    if (to) {
      params.push(to);
      conditions.push(`created_at <= $${params.length}`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    params.push(parseInt(limit));
    const limitParam = params.length;
    params.push(offset);
    const offsetParam = params.length;

    const [rows, countResult] = await Promise.all([
      db.query(
        `SELECT * FROM activity_log ${whereClause} ORDER BY created_at DESC LIMIT $${limitParam} OFFSET $${offsetParam}`,
        params
      ),
      db.query(
        `SELECT COUNT(*) FROM activity_log ${whereClause}`,
        params.slice(0, params.length - 2)
      )
    ]);

    res.status(200).json({
      status: 'success',
      data: rows.rows,
      pagination: {
        total: parseInt(countResult.rows[0].count),
        page: parseInt(page),
        limit: parseInt(limit)
      }
    });

  } catch (error) {
    console.error('getActivityLog Error:', error);
    res.status(500).json({ status: 'error', message: 'Internal server error' });
  }
};

// All activity for and by a specific client: actions taken directly on the
// client's profile, plus actions on entities that belong to them (bookings,
// invoices, quotations, statements, care profiles, reviews) — whether the
// actor was staff/admin or the client themselves.
exports.getActivityLogByClient = async (req, res) => {
  const { client_id } = req.params;
  const { page = 1, limit = 50, action_type, from, to } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  try {
    const params = [client_id];
    const conditions = [
      `(
        (entity_type IN ('CLIENT', 'client') AND entity_id = $1)
        OR (entity_type IN ('BOOKING', 'booking') AND entity_id IN (SELECT booking_id FROM bookings WHERE client_id = $1))
        OR (entity_type = 'PATIENT' AND entity_id IN (SELECT patient_id FROM patient_profiles WHERE client_id = $1))
        OR (entity_type = 'SERVICE_REQUEST' AND entity_id IN (SELECT request_id FROM service_requests WHERE client_id = $1))
        OR (entity_type = 'QUOTATION' AND entity_id IN (
              SELECT q.quote_id FROM quotations q
              JOIN service_requests sr ON sr.request_id = q.request_id
              WHERE sr.client_id = $1
            ))
        OR (entity_type = 'INVOICE' AND entity_id IN (SELECT invoice_id FROM invoices WHERE client_id = $1))
        OR (entity_type = 'PAYMENT' AND entity_id IN (SELECT payment_id FROM payment_tracking WHERE client_id = $1))
        OR (entity_type = 'DEPOSIT' AND entity_id IN (
              SELECT d.deposit_id FROM deposits d
              JOIN rental_agreements ra ON ra.rental_agreement_id = d.rental_agreement_id
              WHERE ra.client_id = $1
            ))
        OR (entity_type = 'STATEMENT' AND entity_id IN (SELECT statement_id FROM saved_statements WHERE client_id = $1))
        OR (entity_type = 'STAFF_REVIEW' AND entity_id IN (SELECT review_id FROM staff_reviews WHERE client_profile_id = $1))
        OR (entity_type IN ('client_payment_record', 'payment_receipt') AND (details->>'client_id')::uuid = $1)
      )`
    ];

    if (action_type) {
      params.push(action_type);
      conditions.push(`action_type = $${params.length}`);
    }
    if (from) {
      params.push(from);
      conditions.push(`created_at >= $${params.length}`);
    }
    if (to) {
      params.push(to);
      conditions.push(`created_at <= $${params.length}`);
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    params.push(parseInt(limit));
    const limitParam = params.length;
    params.push(offset);
    const offsetParam = params.length;

    const [rows, countResult] = await Promise.all([
      db.query(
        `SELECT * FROM activity_log ${whereClause} ORDER BY created_at DESC LIMIT $${limitParam} OFFSET $${offsetParam}`,
        params
      ),
      db.query(
        `SELECT COUNT(*) FROM activity_log ${whereClause}`,
        params.slice(0, params.length - 2)
      )
    ]);

    res.status(200).json({
      status: 'success',
      data: rows.rows,
      pagination: {
        total: parseInt(countResult.rows[0].count),
        page: parseInt(page),
        limit: parseInt(limit)
      }
    });

  } catch (error) {
    console.error('getActivityLogByClient Error:', error);
    res.status(500).json({ status: 'error', message: 'Internal server error' });
  }
};

// All activity for a specific booking: actions logged directly against the
// booking (invoicing, staff swaps/assignments, terminations, notes, etc.),
// plus entities that belong to it (quotations, invoices, staff reviews,
// payments, staff-assignment lifecycle events).
exports.getActivityLogByBooking = async (req, res) => {
  const { booking_id } = req.params;
  const { page = 1, limit = 50, action_type, from, to } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  try {
    const params = [booking_id];
    const conditions = [
      `(
        (entity_type IN ('BOOKING', 'booking') AND entity_id = $1)
        OR (entity_type = 'QUOTATION' AND entity_id IN (SELECT quote_id FROM quotations WHERE booking_id = $1))
        OR (entity_type = 'INVOICE' AND entity_id IN (
              SELECT invoice_id FROM invoices WHERE quote_id IN (SELECT quote_id FROM quotations WHERE booking_id = $1)
            ))
        OR (entity_type = 'PAYMENT' AND entity_id IN (
              SELECT payment_id FROM payment_tracking WHERE quote_id IN (SELECT quote_id FROM quotations WHERE booking_id = $1)
            ))
        OR (entity_type = 'STAFF_REVIEW' AND entity_id IN (SELECT review_id FROM staff_reviews WHERE booking_id = $1))
        OR (entity_type = 'staff_assignment' AND (details->>'assignment_id')::uuid IN (
              SELECT assignment_id FROM booking_staff_assignments WHERE booking_id = $1
            ))
      )`
    ];

    if (action_type) {
      params.push(action_type);
      conditions.push(`action_type = $${params.length}`);
    }
    if (from) {
      params.push(from);
      conditions.push(`created_at >= $${params.length}`);
    }
    if (to) {
      params.push(to);
      conditions.push(`created_at <= $${params.length}`);
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    params.push(parseInt(limit));
    const limitParam = params.length;
    params.push(offset);
    const offsetParam = params.length;

    const [rows, countResult] = await Promise.all([
      db.query(
        `SELECT * FROM activity_log ${whereClause} ORDER BY created_at DESC LIMIT $${limitParam} OFFSET $${offsetParam}`,
        params
      ),
      db.query(
        `SELECT COUNT(*) FROM activity_log ${whereClause}`,
        params.slice(0, params.length - 2)
      )
    ]);

    res.status(200).json({
      status: 'success',
      data: rows.rows,
      pagination: {
        total: parseInt(countResult.rows[0].count),
        page: parseInt(page),
        limit: parseInt(limit)
      }
    });

  } catch (error) {
    console.error('getActivityLogByBooking Error:', error);
    res.status(500).json({ status: 'error', message: 'Internal server error' });
  }
};

// All activity for a specific staff member (caregiver): actions logged
// directly against their staff_profile, plus entities that belong to them
// (bank accounts, advances, payouts, leave, change requests, reviews), plus
// EVERY logged action on any booking they were ever assigned to — attendance,
// in/out time, salary confirm/skip, day confirm/revoke, amount corrections,
// completion, terminations, swaps in and out, invoicing changes, etc. Most of
// those key on assignment_id or nothing staff-specific at all (not
// staff_profile_id), so per-field detail matching alone would miss them —
// matching by "any booking with an assignment row for this staff" catches
// them all. Trade-off: on a booking that changed hands via a swap, both the
// outgoing and incoming staff will see each other's later/earlier entries for
// that same booking, since attribution here is at the booking level, not
// per-shift. entity_id semantics are also inconsistent across controllers —
// some log the staff_profile_id directly, some the user_id, some leave
// entity_id null and only carry staff_profile_id inside `details` — so each
// branch matches whichever the writing controller actually used.
exports.getActivityLogByStaff = async (req, res) => {
  const { staff_profile_id } = req.params;
  const { page = 1, limit = 50, action_type, from, to } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  try {
    const params = [staff_profile_id];
    const conditions = [
      `(
        (entity_type IN ('STAFF_PROFILE', 'staff_profile') AND entity_id = $1)
        OR (entity_type = 'STAFF' AND (
              entity_id = $1
              OR entity_id IN (SELECT user_id FROM staff_profiles WHERE staff_profile_id = $1)
            ))
        OR (entity_type IN ('STAFF_BANK_ACCOUNT', 'STAFF_ADVANCE', 'STAFF_PAYOUT', 'SALARY_SHEET')
              AND (details->>'staff_profile_id')::uuid = $1)
        OR (entity_type = 'STAFF_LEAVE' AND entity_id IN (SELECT leave_id FROM staff_leave_requests WHERE staff_profile_id = $1))
        OR (entity_type = 'STAFF_CHANGE_REQUEST' AND entity_id IN (SELECT request_id FROM staff_change_requests WHERE staff_profile_id = $1))
        OR (entity_type = 'STAFF_REVIEW' AND entity_id IN (SELECT review_id FROM staff_reviews WHERE staff_profile_id = $1))
        OR (entity_type IN ('BOOKING', 'booking') AND (
              entity_id IN (SELECT DISTINCT booking_id FROM booking_staff_assignments WHERE staff_profile_id = $1)
              OR (details->>'staff_profile_id')::uuid = $1
              OR (details->>'old_staff_id')::uuid = $1
              OR (details->>'new_staff_id')::uuid = $1
            ))
        OR (entity_type = 'staff_assignment' AND (
              (details->>'staff_profile_id')::uuid = $1
              OR (details->>'assignment_id')::uuid IN (SELECT assignment_id FROM booking_staff_assignments WHERE staff_profile_id = $1)
            ))
      )`
    ];

    if (action_type) {
      params.push(action_type);
      conditions.push(`action_type = $${params.length}`);
    }
    if (from) {
      params.push(from);
      conditions.push(`created_at >= $${params.length}`);
    }
    if (to) {
      params.push(to);
      conditions.push(`created_at <= $${params.length}`);
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    params.push(parseInt(limit));
    const limitParam = params.length;
    params.push(offset);
    const offsetParam = params.length;

    const [rows, countResult] = await Promise.all([
      db.query(
        `SELECT * FROM activity_log ${whereClause} ORDER BY created_at DESC LIMIT $${limitParam} OFFSET $${offsetParam}`,
        params
      ),
      db.query(
        `SELECT COUNT(*) FROM activity_log ${whereClause}`,
        params.slice(0, params.length - 2)
      )
    ]);

    res.status(200).json({
      status: 'success',
      data: rows.rows,
      pagination: {
        total: parseInt(countResult.rows[0].count),
        page: parseInt(page),
        limit: parseInt(limit)
      }
    });

  } catch (error) {
    console.error('getActivityLogByStaff Error:', error);
    res.status(500).json({ status: 'error', message: 'Internal server error' });
  }
};

exports.getActivityLogByActor = async (req, res) => {
  const { user_id } = req.params;
  const { page = 1, limit = 50, action_type, from, to } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  try {
    const params = [user_id];
    const conditions = ['actor_user_id = $1'];

    if (action_type) {
      params.push(action_type);
      conditions.push(`action_type = $${params.length}`);
    }
    if (from) {
      params.push(from);
      conditions.push(`created_at >= $${params.length}`);
    }
    if (to) {
      params.push(to);
      conditions.push(`created_at <= $${params.length}`);
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    params.push(parseInt(limit));
    const limitParam = params.length;
    params.push(offset);
    const offsetParam = params.length;

    const [rows, countResult] = await Promise.all([
      db.query(
        `SELECT * FROM activity_log ${whereClause} ORDER BY created_at DESC LIMIT $${limitParam} OFFSET $${offsetParam}`,
        params
      ),
      db.query(
        `SELECT COUNT(*) FROM activity_log ${whereClause}`,
        params.slice(0, params.length - 2)
      )
    ]);

    res.status(200).json({
      status: 'success',
      data: rows.rows,
      pagination: {
        total: parseInt(countResult.rows[0].count),
        page: parseInt(page),
        limit: parseInt(limit)
      }
    });

  } catch (error) {
    console.error('getActivityLogByActor Error:', error);
    res.status(500).json({ status: 'error', message: 'Internal server error' });
  }
};
