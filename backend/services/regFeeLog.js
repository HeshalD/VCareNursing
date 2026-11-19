// services/regFeeLog.js
// One tiny helper so every registration-fee path writes a REG_FEE_* activity entry the
// same way. Never throws and never blocks the caller — logging is best-effort.
const { logActivity } = require('../utils/activityLogger');

function logRegFee({ userId = null, role = null, name = null, action, clientId, details = {} }) {
  if (!clientId) return;
  logActivity({
    actorUserId: userId,
    actorName: name || (userId ? undefined : 'System'),
    actorRole: role || (userId ? 'ADMIN' : 'SYSTEM'),
    actionType: action,
    entityType: 'CLIENT',
    entityId: String(clientId),
    details,
  }).catch((e) => console.error(`Activity log error (${action}):`, e.message));
}

module.exports = { logRegFee };
