const db = require('../config/db');

async function resolveActorName(userId) {
  if (!userId) return null;

  const result = await db.query(
    `SELECT COALESCE(sp.full_name, ist.full_name, cp.full_name) AS full_name
     FROM users u
     LEFT JOIN staff_profiles  sp  ON sp.user_id  = u.user_id
     LEFT JOIN internal_staff  ist ON ist.user_id  = u.user_id
     LEFT JOIN client_profiles cp  ON cp.user_id  = u.user_id
     WHERE u.user_id = $1`,
    [userId]
  );
  return result.rows[0]?.full_name || null;
}

async function logActivity({ actorUserId, actorName, actorRole, actionType, entityType, entityId, details }) {
  // Always resolve from DB when we have a userId — covers COORDINATOR/ACCOUNTS
  // whose names are in internal_staff, not staff_profiles.
  // Falls back to the caller-supplied actorName (used by public routes where userId is null).
  let resolvedName = actorName;
  if (actorUserId) {
    try {
      resolvedName = await resolveActorName(actorUserId) || actorName || 'Admin';
    } catch {
      resolvedName = actorName || 'Admin';
    }
  }

  await db.query(
    `INSERT INTO activity_log
     (actor_user_id, actor_name, actor_role, action_type, entity_type, entity_id, details)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [actorUserId, resolvedName, actorRole, actionType, entityType, entityId, details ? JSON.stringify(details) : null]
  );
}

module.exports = { logActivity, resolveActorName };
