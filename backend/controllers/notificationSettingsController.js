const db = require('../config/db');
const { logActivity } = require('../utils/activityLogger');
const { getMessagingSettings, setMessagingSetting } = require('../utils/systemSettings');

exports.getSettings = async (req, res) => {
  try {
    const settings = await getMessagingSettings(true);
    res.json({ success: true, data: settings });
  } catch (err) {
    console.error('getSettings error:', err);
    res.status(500).json({ success: false, message: 'Failed to load settings' });
  }
};

exports.updateSettings = async (req, res) => {
  try {
    const allowed = ['sms_enabled', 'whatsapp_enabled'];
    const updates = allowed.filter((k) => typeof req.body?.[k] === 'boolean');
    if (updates.length === 0) {
      return res.status(400).json({ success: false, message: 'Provide sms_enabled and/or whatsapp_enabled as boolean' });
    }
    const before = await getMessagingSettings(true);
    for (const k of updates) await setMessagingSetting(k, req.body[k], req.user.user_id);

    const nameRes = await db.query('SELECT full_name FROM staff_profiles WHERE user_id = $1', [req.user.user_id]);
    const role = Array.isArray(req.user.role) ? req.user.role[0] : req.user.role;
    await logActivity({
      actorUserId: req.user.user_id,
      actorName: nameRes.rows[0]?.full_name || 'Admin',
      actorRole: role,
      actionType: 'NOTIFICATION_SETTINGS_UPDATED',
      entityType: 'system_settings',
      entityId: null,
      details: Object.fromEntries(updates.map((k) => [k, { from: before[k], to: req.body[k] }])),
    }).catch((e) => console.error('activity log failed:', e.message));

    res.json({ success: true, data: await getMessagingSettings(true) });
  } catch (err) {
    console.error('updateSettings error:', err);
    res.status(500).json({ success: false, message: 'Failed to update settings' });
  }
};
