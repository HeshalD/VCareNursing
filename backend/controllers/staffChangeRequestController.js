const db = require('../config/db');
const { logActivity } = require('../utils/activityLogger');

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

async function getReviewerName(userId) {
  const result = await db.query(
    'SELECT full_name FROM staff_profiles WHERE user_id = $1',
    [userId]
  );
  return result.rows[0]?.full_name || 'Admin';
}

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

      for (const field of validFields) {
        requestedChanges[field] = { old_value: currentData[field], new_value: submitted[field] };
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
    const params = [];
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
         u.mobile_number AS staff_mobile
       FROM staff_change_requests scr
       JOIN staff_profiles sp ON scr.staff_profile_id = sp.staff_profile_id
       JOIN users u ON sp.user_id = u.user_id
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
  try {
    const reviewerName = await getReviewerName(req.user.user_id);

    // Atomic: only succeeds if the request is still PENDING and unclaimed
    const result = await db.query(
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
      const existing = await db.query(
        'SELECT status, reviewer_name FROM staff_change_requests WHERE request_id = $1',
        [id]
      );
      if (existing.rows.length === 0) {
        return res.status(404).json({ status: 'error', message: 'Change request not found' });
      }
      const { status: curStatus, reviewer_name } = existing.rows[0];
      return res.status(409).json({
        status: 'error',
        message: `Request is already ${curStatus}${reviewer_name ? ` and is being reviewed by ${reviewer_name}` : ''}`
      });
    }

    const claimed = result.rows[0];

    await db.query(
      `INSERT INTO staff_change_request_logs
         (request_id, staff_profile_id, action, performed_by_user_id, performed_by_name, changes_snapshot)
       VALUES ($1, $2, 'CLAIMED', $3, $4, $5)`,
      [claimed.request_id, claimed.staff_profile_id, req.user.user_id, reviewerName, claimed.requested_changes]
    );

    await logActivity({
      actorUserId: req.user.user_id,
      actorName: reviewerName,
      actorRole: extractActorRole(req.user.role),
      actionType: 'CHANGE_REQUEST_CLAIMED',
      entityType: 'STAFF_CHANGE_REQUEST',
      entityId: claimed.request_id,
      details: { request_type: claimed.request_type, staff_profile_id: claimed.staff_profile_id }
    });

    res.status(200).json({ status: 'success', data: claimed });

  } catch (error) {
    console.error('claimChangeRequest Error:', error);
    res.status(500).json({ status: 'error', message: 'Internal server error' });
  }
};

exports.resolveChangeRequest = async (req, res) => {
  const { id } = req.params;
  const { action, review_notes } = req.body;

  if (!['APPROVE', 'REJECT'].includes(action)) {
    return res.status(400).json({ status: 'error', message: 'action must be APPROVE or REJECT' });
  }

  try {
    const existing = await db.query(
      'SELECT * FROM staff_change_requests WHERE request_id = $1',
      [id]
    );
    if (existing.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Change request not found' });
    }
    const changeReq = existing.rows[0];

    if (changeReq.status !== 'UNDER_REVIEW') {
      return res.status(409).json({ status: 'error', message: `Request is ${changeReq.status}, not UNDER_REVIEW` });
    }
    if (changeReq.reviewer_user_id !== req.user.user_id) {
      return res.status(403).json({ status: 'error', message: 'Only the reviewer who claimed this request can resolve it' });
    }

    const newStatus = action === 'APPROVE' ? 'APPROVED' : 'REJECTED';

    if (action === 'APPROVE') {
      await applyChanges(changeReq);
    }

    await db.query(
      `UPDATE staff_change_requests
       SET status = $1, review_notes = $2, reviewed_at = NOW(), updated_at = NOW()
       WHERE request_id = $3`,
      [newStatus, review_notes || null, id]
    );

    await db.query(
      `INSERT INTO staff_change_request_logs
         (request_id, staff_profile_id, action, performed_by_user_id, performed_by_name, changes_snapshot, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [id, changeReq.staff_profile_id, newStatus, req.user.user_id, changeReq.reviewer_name, changeReq.requested_changes, review_notes || null]
    );

    await logActivity({
      actorUserId: req.user.user_id,
      actorName: changeReq.reviewer_name,
      actorRole: extractActorRole(req.user.role),
      actionType: `CHANGE_REQUEST_${newStatus}`,
      entityType: 'STAFF_CHANGE_REQUEST',
      entityId: id,
      details: { request_type: changeReq.request_type, staff_profile_id: changeReq.staff_profile_id, review_notes: review_notes || null }
    });

    res.status(200).json({ status: 'success', message: `Request ${newStatus.toLowerCase()}` });

  } catch (error) {
    console.error('resolveChangeRequest Error:', error);
    res.status(500).json({ status: 'error', message: 'Internal server error' });
  }
};

async function applyChanges(changeReq) {
  const changes = changeReq.requested_changes;

  if (changeReq.request_type === 'PROFILE_UPDATE') {
    const fields = Object.keys(changes).filter(f => ALLOWED_PROFILE_FIELDS.includes(f));
    if (fields.length === 0) return;
    const setClauses = fields.map((f, i) => `${f} = $${i + 1}`);
    const values = fields.map(f => changes[f].new_value);
    values.push(changeReq.staff_profile_id);
    await db.query(
      `UPDATE staff_profiles SET ${setClauses.join(', ')} WHERE staff_profile_id = $${values.length}`,
      values
    );

  } else if (changeReq.request_type === 'BANK_ACCOUNT_ADD') {
    await db.query(
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
    values.push(changeReq.target_bank_account_id);
    await db.query(
      `UPDATE staff_bank_accounts SET ${setClauses.join(', ')} WHERE staff_bank_account_id = $${values.length}`,
      values
    );

  } else if (changeReq.request_type === 'BANK_ACCOUNT_REMOVE') {
    await db.query(
      'UPDATE staff_bank_accounts SET is_active = false WHERE staff_bank_account_id = $1',
      [changeReq.target_bank_account_id]
    );
  }
}

exports.getChangeRequestLogs = async (req, res) => {
  const { id } = req.params;
  try {
    const result = await db.query(
      `SELECT * FROM staff_change_request_logs WHERE request_id = $1 ORDER BY created_at ASC`,
      [id]
    );
    res.status(200).json({ status: 'success', data: result.rows });
  } catch (error) {
    console.error('getChangeRequestLogs Error:', error);
    res.status(500).json({ status: 'error', message: 'Internal server error' });
  }
};
