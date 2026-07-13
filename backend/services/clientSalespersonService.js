/**
 * CLIENT REGISTRATION SALESPERSON CREDITING SERVICE
 *
 * Salespersons are internal_staff. When a client's registration fee is
 * confirmed PAID, it is credited ONCE to the salesperson who brought that
 * client in, and their "registrations brought" count is incremented by 1.
 * Both the credited amount and the count are PERMANENT — they stay with the
 * original (origin) salesperson forever and never move, even if the client
 * is later reassigned.
 *
 * The "currently assigned salesperson" is a separate, mutable pointer
 * (is_current) — this is who manages the client until someone with higher
 * authority reassigns them. Switching only moves the pointer; it does NOT
 * touch registrations_total_amount or registrations_brought_count for anyone.
 *
 * client_salesperson_assignments holds the full audit trail:
 *   - is_origin  → the salesperson who originally brought the registration in (holds credit)
 *   - is_current → the salesperson currently managing the client
 *   - action     → 'CREDITED' (initial) | 'SWITCHED'
 *
 * Mirrors services/salespersonService.js (booking crediting) exactly, at the
 * client-registration level instead of the booking level.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

class ClientSalespersonError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ClientSalespersonError';
    this.code = code; // e.g. 'INVALID_ID', 'SALESPERSON_NOT_FOUND', 'CLIENT_NOT_FOUND', 'NO_CURRENT', 'SAME_SALESPERSON'
  }
}

const isUuid = (v) => typeof v === 'string' && UUID_RE.test(v);

/**
 * Credit a client's registration fee to a salesperson and mark them current + origin.
 * Idempotent: if the client already has an origin salesperson, nothing changes and
 * { credited: false, alreadyCredited: true } is returned.
 *
 * @returns {Promise<{credited: boolean, alreadyCredited?: boolean, credited_amount?: number, assignment?: object}>}
 */
async function creditSalespersonForRegistration(executor, { client_id, salesperson_id, assigned_by }) {
  if (!isUuid(client_id) || !isUuid(salesperson_id)) {
    throw new ClientSalespersonError('INVALID_ID', 'Invalid client or salesperson ID format');
  }

  const salespersonRes = await executor.query(
    `SELECT id, full_name, status FROM internal_staff WHERE id = $1`,
    [salesperson_id]
  );
  if (salespersonRes.rows.length === 0) {
    throw new ClientSalespersonError('SALESPERSON_NOT_FOUND', 'Salesperson not found');
  }

  // Already credited? Keep idempotent so retries / double submits don't double-count.
  const originRes = await executor.query(
    `SELECT id, salesperson_id FROM client_salesperson_assignments
     WHERE client_id = $1 AND is_origin = true`,
    [client_id]
  );
  if (originRes.rows.length > 0) {
    return { credited: false, alreadyCredited: true, origin: originRes.rows[0] };
  }

  const clientRes = await executor.query(
    `SELECT client_profile_id, reg_fee_amount FROM client_profiles WHERE client_profile_id = $1`,
    [client_id]
  );
  if (clientRes.rows.length === 0) {
    throw new ClientSalespersonError('CLIENT_NOT_FOUND', 'Client not found');
  }

  const creditedAmount = parseFloat(clientRes.rows[0].reg_fee_amount || 0);

  const insertRes = await executor.query(
    `INSERT INTO client_salesperson_assignments
       (client_id, salesperson_id, credited_amount, is_current, is_origin, action, assigned_by)
     VALUES ($1, $2, $3, true, true, 'CREDITED', $4)
     RETURNING id, client_id, salesperson_id, credited_amount, is_current, is_origin, action, assigned_at`,
    [client_id, salesperson_id, creditedAmount, assigned_by || null]
  );

  await executor.query(
    `UPDATE internal_staff
     SET registrations_total_amount = registrations_total_amount + $2,
         registrations_brought_count = registrations_brought_count + 1,
         updated_at = NOW()
     WHERE id = $1`,
    [salesperson_id, creditedAmount]
  );

  return {
    credited: true,
    credited_amount: creditedAmount,
    assignment: insertRes.rows[0],
    salesperson_name: salespersonRes.rows[0].full_name,
  };
}

/**
 * Switch the currently managing salesperson for a client. Pointer-only change:
 * does NOT alter registrations_total_amount or registrations_brought_count for anyone.
 *
 * @returns {Promise<{switched: boolean, from: string, to: string, assignment: object}>}
 */
async function switchClientSalesperson(executor, { client_id, new_salesperson_id, assigned_by, switch_reason }) {
  if (!isUuid(client_id) || !isUuid(new_salesperson_id)) {
    throw new ClientSalespersonError('INVALID_ID', 'Invalid client or salesperson ID format');
  }

  const salespersonRes = await executor.query(
    `SELECT id, full_name FROM internal_staff WHERE id = $1`,
    [new_salesperson_id]
  );
  if (salespersonRes.rows.length === 0) {
    throw new ClientSalespersonError('SALESPERSON_NOT_FOUND', 'Salesperson not found');
  }

  const currentRes = await executor.query(
    `SELECT id, salesperson_id FROM client_salesperson_assignments
     WHERE client_id = $1 AND is_current = true`,
    [client_id]
  );
  if (currentRes.rows.length === 0) {
    throw new ClientSalespersonError('NO_CURRENT', 'This client has no credited salesperson yet. Credit one first.');
  }

  const current = currentRes.rows[0];
  if (current.salesperson_id === new_salesperson_id) {
    throw new ClientSalespersonError('SAME_SALESPERSON', 'That salesperson already manages this client');
  }

  // Demote the existing current pointer first (partial unique index allows only one).
  await executor.query(
    `UPDATE client_salesperson_assignments SET is_current = false WHERE id = $1`,
    [current.id]
  );

  // New current pointer. Not an origin row, so no credit and no count.
  const insertRes = await executor.query(
    `INSERT INTO client_salesperson_assignments
       (client_id, salesperson_id, credited_amount, is_current, is_origin, action, switch_reason, assigned_by)
     VALUES ($1, $2, 0, true, false, 'SWITCHED', $3, $4)
     RETURNING id, client_id, salesperson_id, is_current, is_origin, action, switch_reason, assigned_at`,
    [client_id, new_salesperson_id, switch_reason || null, assigned_by || null]
  );

  return {
    switched: true,
    from: current.salesperson_id,
    to: new_salesperson_id,
    assignment: insertRes.rows[0],
    salesperson_name: salespersonRes.rows[0].full_name,
  };
}

/**
 * Get the current + origin salesperson and full assignment history for a client.
 */
async function getClientSalesperson(executor, client_id) {
  if (!isUuid(client_id)) {
    throw new ClientSalespersonError('INVALID_ID', 'Invalid client ID format');
  }

  const historyRes = await executor.query(
    `SELECT csa.id, csa.salesperson_id, ist.full_name AS salesperson_name, ist.role AS salesperson_role,
            csa.credited_amount, csa.is_current, csa.is_origin, csa.action, csa.switch_reason,
            csa.assigned_by, csa.assigned_at
     FROM client_salesperson_assignments csa
     JOIN internal_staff ist ON csa.salesperson_id = ist.id
     WHERE csa.client_id = $1
     ORDER BY csa.assigned_at ASC`,
    [client_id]
  );

  const rows = historyRes.rows;
  return {
    current: rows.find((r) => r.is_current) || null,
    origin: rows.find((r) => r.is_origin) || null,
    history: rows,
  };
}

module.exports = {
  ClientSalespersonError,
  creditSalespersonForRegistration,
  switchClientSalesperson,
  getClientSalesperson,
};
