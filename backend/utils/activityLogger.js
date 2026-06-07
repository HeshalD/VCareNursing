const db = require('../config/db');

async function logActivity({ actorUserId, actorName, actorRole, actionType, entityType, entityId, details }) {
  await db.query(
    `INSERT INTO activity_log
     (actor_user_id, actor_name, actor_role, action_type, entity_type, entity_id, details)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [actorUserId, actorName, actorRole, actionType, entityType, entityId, details ? JSON.stringify(details) : null]
  );
}

module.exports = { logActivity };