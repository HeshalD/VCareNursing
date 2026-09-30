const db = require('../config/db');
const { logActivity, resolveActorName } = require('../utils/activityLogger');
const { isValidNic, normalizeNic, NIC_FORMAT_MESSAGE } = require('../utils/nic');
const { resolveCity } = require('../utils/cityHelper');

const ALLOWED_PROFILE_FIELDS = [
  'full_name', 'home_address', 'location', 'gender', 'date_of_birth',
  'willing_to_live_in', 'qualifications', 'nic_number',
  'profile_picture_url', 'nic_front_url', 'nic_back_url'
];

const BANK_EDITABLE_FIELDS = ['account_holder_name', 'bank_name', 'branch_name', 'account_number', 'currency'];

async function getStaffProfile(userId) {
  const result = await db.query(
    'SELECT staff_profile_id, full_name FROM staff_profiles WHERE user_id = $1',
    [userId]
  );
  return result.rows[0] || null;
}

// Reviewer names live in different tables depending on who the admin is: field staff in
// staff_profiles, internal staff (coordinators, accounts, sales...) in internal_staff.
async function getReviewerName(userId) {
  try {
    return (await resolveActorName(userId)) || 'Admin';
  } catch (err) {
    console.error('getReviewerName lookup failed:', err.message);
    return 'Admin';
  }
}

// The activity log is an audit side-effect. If it fails after the real work has been
// committed, that must never turn a successful action into a 500.
async function safeLogActivity(payload) {
  try {
    await logActivity(payload);
  } catch (err) {
    console.error('logActivity failed (non-fatal):', err.message);
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Thrown when an approved change can no longer be applied (target row gone, value taken).
class ChangeNotApplicableError extends Error {}

function extractActorRole(role) {
  const raw = Array.isArray(role) ? role[0] : role;
  return typeof raw === 'string' ? raw.replace(/\{|\}/g, '').trim() : String(raw);
}

exports.submitChangeRequest = async (req, res) => {
  const { request_type, changes, target_bank_account_id } = req.body;

  const validTypes = ['PROFILE_UPDATE', 'BANK_ACCOUNT_ADD', 'BANK_ACCOUNT_EDIT', 'BANK_ACCOUNT_REMOVE'];
  if (!validTypes.includes(request_type)) {
    return res.status(400).json({ status: 'error', message: 'Invalid request_type' });
  }
  if (!changes && request_type !== 'BANK_ACCOUNT_REMOVE') {
    return res.status(400).json({ status: 'error', message: 'changes is required' });
  }

  try {
    const staff = await getStaffProfile(req.user.user_id);
    if (!staff) {
      return res.status(404).json({ status: 'error', message: 'Staff profile not found' });
    }

    let requestedChanges = {};

    if (request_type === 'PROFILE_UPDATE') {
      const submitted = changes || {};
      const validFields = Object.keys(submitted).filter(f => ALLOWED_PROFILE_FIELDS.includes(f));
      if (validFields.length === 0) {
        return res.status(400).json({ status: 'error', message: 'No valid profile fields provided' });
      }

      const current = await db.query(
        `SELECT ${ALLOWED_PROFILE_FIELDS.join(', ')} FROM staff_profiles WHERE staff_profile_id = $1`,
        [staff.staff_profile_id]
      );
      const currentData = current.rows[0];

      // A requested NIC change is validated here, at submission, so a malformed
      // value never sits in the queue waiting for an admin to approve it into
      // staff_profiles. Stored normalized (uppercase, trimmed).
      if (validFields.includes('nic_number')) {
        if (!isValidNic(submitted.nic_number)) {
          return res.status(400).json({ status: 'error', message: NIC_FORMAT_MESSAGE });
        }
        submitted.nic_number = normalizeNic(submitted.nic_number);
      }

      // A requested city must come from the master list. The chosen city_id is
      // stored next to the name so approval can set both `location` and `city_id`.
      let requestedCity = null;
      if (validFields.includes('location')) {
        try {
          requestedCity = await resolveCity(submitted.city_id);
        } catch (cityError) {
          return res.status(400).json({ status: 'error', message: cityError.message });
        }
        if (!requestedCity) {
          return res.status(400).json({ status: 'error', message: 'Please select your city from the list.' });
        }
      }

      for (const field of validFields) {
        requestedChanges[field] = { old_value: currentData[field], new_value: submitted[field] };
      }
      if (requestedCity) {
        requestedChanges.location.new_value = requestedCity.name;
        requestedChanges.location.new_city_id = requestedCity.city_id;
      }

    } else if (request_type === 'BANK_ACCOUNT_ADD') {
      const { account_holder_name, bank_name, account_number, branch_name, currency } = changes;
      if (!account_holder_name || !bank_name || !account_number) {
        return res.status(400).json({ status: 'error', message: 'account_holder_name, bank_name, and account_number are required' });
      }
      requestedChanges = { account_holder_name, bank_name, branch_name: branch_name || null, account_number, currency: currency || 'LKR' };

    } else if (request_type === 'BANK_ACCOUNT_EDIT') {
      if (!target_bank_account_id) {
        return res.status(400).json({ status: 'error', message: 'target_bank_account_id is required for BANK_ACCOUNT_EDIT' });
      }
      const current = await db.query(
        `SELECT ${BANK_EDITABLE_FIELDS.join(', ')} FROM staff_bank_accounts
         WHERE staff_bank_account_id = $1 AND staff_profile_id = $2 AND is_active = true`,
        [target_bank_account_id, staff.staff_profile_id]
      );
      if (current.rows.length === 0) {
        return res.status(404).json({ status: 'error', message: 'Bank account not found' });
      }
      const currentData = current.rows[0];
      for (const field of BANK_EDITABLE_FIELDS) {
        if ((changes)[field] !== undefined) {
          requestedChanges[field] = { old_value: currentData[field], new_value: (changes)[field] };
        }
      }
      if (Object.keys(requestedChanges).length === 0) {
        return res.status(400).json({ status: 'error', message: 'No valid bank account fields provided' });
      }

    } else if (request_type === 'BANK_ACCOUNT_REMOVE') {
      if (!target_bank_account_id) {
        return res.status(400).json({ status: 'error', message: 'target_bank_account_id is required for BANK_ACCOUNT_REMOVE' });
      }
      const exists = await db.query(
        'SELECT 1 FROM staff_bank_accounts WHERE staff_bank_account_id = $1 AND staff_profile_id = $2 AND is_active = true',
        [target_bank_account_id, staff.staff_profile_id]
      );
      if (exists.rows.length === 0) {
        return res.status(404).json({ status: 'error', message: 'Bank account not found or already inactive' });
      }
      requestedChanges = { staff_bank_account_id: target_bank_account_id };
    }

    const insertResult = await db.query(
      `INSERT INTO staff_change_requests
         (staff_profile_id, request_type, requested_changes, target_bank_account_id)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [staff.staff_profile_id, request_type, JSON.stringify(requestedChanges), target_bank_account_id || null]
    );
    const newRequest = insertResult.rows[0];

    await db.query(
      `INSERT INTO staff_change_request_logs
         (request_id, staff_profile_id, action, performed_by_user_id, performed_by_name, changes_snapshot)
       VALUES ($1, $2, 'SUBMITTED', $3, $4, $5)`,
      [newRequest.request_id, staff.staff_profile_id, req.user.user_id, staff.full_name, JSON.stringify(requestedChanges)]
    );

    await logActivity({
      actorUserId: req.user.user_id,
      actorName: staff.full_name,
      actorRole: extractActorRole(req.user.role),
      actionType: 'CHANGE_REQUEST_SUBMITTED',
      entityType: 'STAFF_CHANGE_REQUEST',
      entityId: newRequest.request_id,
      details: { request_type }
    });

    res.status(201).json({ status: 'success', data: newRequest });

  } catch (error) {
    console.error('submitChangeRequest Error:', error);
    res.status(500).json({ status: 'error', message: 'Internal server error' });
  }
};

exports.getMyChangeRequests = async (req, res) => {
  try {
    const staff = await getStaffProfile(req.user.user_id);
    if (!staff) {
      return res.status(404).json({ status: 'error', message: 'Staff profile not found' });
    }

    const result = await db.query(
      `SELECT * FROM staff_change_requests WHERE staff_profile_id = $1 ORDER BY created_at DESC`,
      [staff.staff_profile_id]
    );

    res.status(200).json({ status: 'success', data: result.rows });

  } catch (error) {
    console.error('getMyChangeRequests Error:', error);
    res.status(500).json({ status: 'error', message: 'Internal server error' });
  }
};

exports.getAllChangeRequests = async (req, res) => {
  const { status, staff_profile_id } = req.query;
  try {
    const params = [req.user.user_id];
    const conditions = [];

    if (status) {
      params.push(status);
      conditions.push(`scr.status = $${params.length}`);
    }
    if (staff_profile_id) {
      params.push(staff_profile_id);
      conditions.push(`scr.staff_profile_id = $${params.length}`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await db.query(
      `SELECT
         scr.*,
         sp.full_name AS staff_name,
         u.mobile_number AS staff_mobile,
         (scr.reviewer_user_id IS NOT NULL AND scr.reviewer_user_id = $1) AS is_mine,
         COALESCE(rsp.full_name, rist.full_name, scr.reviewer_name) AS reviewer_name,
         sba.bank_name AS target_bank_name,
         RIGHT(sba.account_number, 4) AS target_bank_last4
       FROM staff_change_requests scr
       JOIN staff_profiles sp ON scr.staff_profile_id = sp.staff_profile_id
       JOIN users u ON sp.user_id = u.user_id
       LEFT JOIN staff_profiles rsp ON rsp.user_id = scr.reviewer_user_id
       LEFT JOIN internal_staff rist ON rist.user_id = scr.reviewer_user_id
       LEFT JOIN staff_bank_accounts sba ON sba.staff_bank_account_id = scr.target_bank_account_id
       ${whereClause}
       ORDER BY scr.created_at DESC`,
      params
    );

    res.status(200).json({ status: 'success', data: result.rows });

  } catch (error) {
    console.error('getAllChangeRequests Error:', error);
    res.status(500).json({ status: 'error', message: 'Internal server error' });
  }
};

exports.claimChangeRequest = async (req, res) => {
  const { id } = req.params;
  if (!UUID_RE.test(id)) {
    return res.status(404).json({ status: 'error', message: 'Change request not found' });
  }

  const reviewerName = await getReviewerName(req.user.user_id);
  const client = await db.pool.connect();
  let claimed;
  try {
    await client.query('BEGIN');

    // Atomic: only succeeds if the request is still PENDING and unclaimed
    const result = await client.query(
      `UPDATE staff_change_requests
       SET status = 'UNDER_REVIEW',
           reviewer_user_id = $1,
           reviewer_name = $2,
           updated_at = NOW()
       WHERE request_id = $3
         AND status = 'PENDING'
         AND reviewer_user_id IS NULL
       RETURNING *`,
      [req.user.user_id, reviewerName, id]
    );

    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      const existing = await db.query(
        'SELECT status, reviewer_name FROM staff_change_requests WHERE request_id = $1',
        [id]
      );
      if (existing.rows.length === 0) {
        return res.status(404).json({ status: 'error', message: 'Change request not found' });
      }
      const { status: curStatus, reviewer_name } = existing.rows[0];
      const readable = String(curStatus).replace(/_/g, ' ').toLowerCase();
      return res.status(409).json({
        status: 'error',
        message: `This request is already ${readable}${reviewer_name ? ` and is being reviewed by ${reviewer_name}` : ''}.`
      });
    }

    claimed = result.rows[0];

    // Written in the same transaction so a claim can never exist without its audit entry.
    await client.query(
      `INSERT INTO staff_change_request_logs
         (request_id, staff_profile_id, action, performed_by_user_id, performed_by_name, changes_snapshot)
       VALUES ($1, $2, 'CLAIMED', $3, $4, $5)`,
      [claimed.request_id, claimed.staff_profile_id, req.user.user_id, reviewerName, JSON.stringify(claimed.requested_changes)]
    );

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('claimChangeRequest Error:', error);
    return res.status(500).json({ status: 'error', message: 'Could not claim this request. Nothing was changed, please try again.' });
  } finally {
    client.release();
  }

  await safeLogActivity({
    actorUserId: req.user.user_id,
    actorName: reviewerName,
    actorRole: extractActorRole(req.user.role),
    actionType: 'CHANGE_REQUEST_CLAIMED',
    entityType: 'STAFF_CHANGE_REQUEST',
    entityId: claimed.request_id,
    details: { request_type: claimed.request_type, staff_profile_id: claimed.staff_profile_id }
  });

  res.status(200).json({ status: 'success', data: { ...claimed, is_mine: true } });
};

exports.resolveChangeRequest = async (req, res) => {
  const { id } = req.params;
  const { action, review_notes } = req.body;

  if (!['APPROVE', 'REJECT'].includes(action)) {
    return res.status(400).json({ status: 'error', message: 'action must be APPROVE or REJECT' });
  }
  if (!UUID_RE.test(id)) {
    return res.status(404).json({ status: 'error', message: 'Change request not found' });
  }

  const client = await db.pool.connect();
  let changeReq;
  let newStatus;
  try {
    await client.query('BEGIN');

    // Lock the row so two resolves (double click, two tabs) can't both apply the change.
    const existing = await client.query(
      'SELECT * FROM staff_change_requests WHERE request_id = $1 FOR UPDATE',
      [id]
    );
    if (existing.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ status: 'error', message: 'Change request not found' });
    }
    changeReq = existing.rows[0];

    if (changeReq.status !== 'UNDER_REVIEW') {
      await client.query('ROLLBACK');
      return res.status(409).json({ status: 'error', message: `This request is already ${String(changeReq.status).replace(/_/g, ' ').toLowerCase()}.` });
    }
    if (changeReq.reviewer_user_id !== req.user.user_id) {
      await client.query('ROLLBACK');
      return res.status(403).json({ status: 'error', message: 'Only the reviewer who claimed this request can resolve it' });
    }

    newStatus = action === 'APPROVE' ? 'APPROVED' : 'REJECTED';
    // Older claims may have "Admin" stored; the person resolving is the reviewer, so use their real name.
    changeReq.reviewer_name = await getReviewerName(req.user.user_id);

    if (action === 'APPROVE') {
      await applyChanges(client, changeReq);
    }

    await client.query(
      `UPDATE staff_change_requests
       SET status = $1, review_notes = $2, reviewed_at = NOW(), updated_at = NOW()
       WHERE request_id = $3`,
      [newStatus, review_notes || null, id]
    );

    await client.query(
      `INSERT INTO staff_change_request_logs
         (request_id, staff_profile_id, action, performed_by_user_id, performed_by_name, changes_snapshot, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [id, changeReq.staff_profile_id, newStatus, req.user.user_id, changeReq.reviewer_name || 'Admin', JSON.stringify(changeReq.requested_changes), review_notes || null]
    );

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    if (error instanceof ChangeNotApplicableError) {
      return res.status(409).json({ status: 'error', message: `${error.message} Nothing was changed. You can reject this request instead.` });
    }
    if (error.code === '23505') {
      return res.status(409).json({ status: 'error', message: 'This change conflicts with existing data (for example an NIC or account number that is already in use). Nothing was changed. You can reject this request instead.' });
    }
    console.error('resolveChangeRequest Error:', error);
    return res.status(500).json({ status: 'error', message: 'Could not resolve this request. Nothing was changed, please try again.' });
  } finally {
    client.release();
  }

  await safeLogActivity({
    actorUserId: req.user.user_id,
    actorName: changeReq.reviewer_name,
    actorRole: extractActorRole(req.user.role),
    actionType: `CHANGE_REQUEST_${newStatus}`,
    entityType: 'STAFF_CHANGE_REQUEST',
    entityId: id,
    details: { request_type: changeReq.request_type, staff_profile_id: changeReq.staff_profile_id, review_notes: review_notes || null }
  });

  res.status(200).json({ status: 'success', message: `Request ${newStatus.toLowerCase()}` });
};

// Runs inside the resolve transaction, so a failure here leaves the request UNDER_REVIEW
// and nothing half-applied.
async function applyChanges(client, changeReq) {
  const changes = changeReq.requested_changes || {};

  if (changeReq.request_type === 'PROFILE_UPDATE') {
    const fields = Object.keys(changes).filter(f => ALLOWED_PROFILE_FIELDS.includes(f));
    if (fields.length === 0) return;
    const setClauses = fields.map((f, i) => `${f} = $${i + 1}`);
    const values = fields.map(f => changes[f].new_value);
    // An approved location change also moves the staff member's city_id
    // (older requests without new_city_id only update the text, as before).
    if (fields.includes('location') && changes.location.new_city_id) {
      values.push(changes.location.new_city_id);
      setClauses.push(`city_id = $${values.length}`);
    }
    values.push(changeReq.staff_profile_id);
    await client.query(
      `UPDATE staff_profiles SET ${setClauses.join(', ')} WHERE staff_profile_id = $${values.length}`,
      values
    );

  } else if (changeReq.request_type === 'BANK_ACCOUNT_ADD') {
    await client.query(
      `INSERT INTO staff_bank_accounts
         (staff_profile_id, account_holder_name, bank_name, branch_name, account_number, currency)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [changeReq.staff_profile_id, changes.account_holder_name, changes.bank_name, changes.branch_name || null, changes.account_number, changes.currency || 'LKR']
    );

  } else if (changeReq.request_type === 'BANK_ACCOUNT_EDIT') {
    const fields = Object.keys(changes).filter(f => BANK_EDITABLE_FIELDS.includes(f));
    if (fields.length === 0) return;
    const setClauses = fields.map((f, i) => `${f} = $${i + 1}`);
    const values = fields.map(f => changes[f].new_value);
    values.push(changeReq.target_bank_account_id, changeReq.staff_profile_id);
    const result = await client.query(
      `UPDATE staff_bank_accounts SET ${setClauses.join(', ')}
       WHERE staff_bank_account_id = $${values.length - 1} AND staff_profile_id = $${values.length} AND is_active = true`,
      values
    );
    if (result.rowCount === 0) {
      throw new ChangeNotApplicableError('The bank account this request edits no longer exists or has been removed.');
    }

  } else if (changeReq.request_type === 'BANK_ACCOUNT_REMOVE') {
    const result = await client.query(
      'UPDATE staff_bank_accounts SET is_active = false WHERE staff_bank_account_id = $1 AND staff_profile_id = $2 AND is_active = true',
      [changeReq.target_bank_account_id, changeReq.staff_profile_id]
    );
    if (result.rowCount === 0) {
      throw new ChangeNotApplicableError('The bank account this request removes no longer exists or was already removed.');
    }
  }
}

exports.getChangeRequestLogs = async (req, res) => {
  const { id } = req.params;
  try {
    const result = await db.query(
      `SELECT l.*,
              COALESCE(psp.full_name, pist.full_name, l.performed_by_name) AS performed_by_name
       FROM staff_change_request_logs l
       LEFT JOIN staff_profiles psp ON psp.user_id = l.performed_by_user_id
       LEFT JOIN internal_staff pist ON pist.user_id = l.performed_by_user_id
       WHERE l.request_id = $1
       ORDER BY l.created_at ASC`,
      [id]
    );
    res.status(200).json({ status: 'success', data: result.rows });
  } catch (error) {
    console.error('getChangeRequestLogs Error:', error);
    res.status(500).json({ status: 'error', message: 'Internal server error' });
  }
};
