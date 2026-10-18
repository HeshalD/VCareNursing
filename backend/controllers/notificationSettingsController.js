const db = require('../config/db');
const { logActivity } = require('../utils/activityLogger');
const { getMessagingSettings, channelState, setEventSetting, setChannelAll } = require('../utils/systemSettings');
const { EVENTS, EVENT_BY_KEY } = require('../utils/messageEvents');

// Per-event list (metadata + current on/off per channel; null = channel not used by that event) and the
// derived state of each channel: 'all' | 'some' | 'none'.
const buildPayload = async (force = false) => {
  const s = await getMessagingSettings(force);
  return {
    channels: { whatsapp: channelState(s, 'whatsapp'), sms: channelState(s, 'sms') },
    events: EVENTS.map((e) => ({
      key: e.key,
      group: e.group,
      label: e.label,
      desc: e.desc,
      whatsapp: s.events?.[e.key]?.whatsapp ?? null,
      sms: s.events?.[e.key]?.sms ?? null,
    })),
  };
};

exports.getSettings = async (req, res) => {
  try {
    res.json({ success: true, data: await buildPayload(true) });
  } catch (err) {
    console.error('getSettings error:', err);
    res.status(500).json({ success: false, message: 'Failed to load settings' });
  }
};

// Body is either { event_key, channel, enabled } for one message, or { channel, enabled } for every message on the channel.
exports.updateSettings = async (req, res) => {
  try {
    const { event_key, channel, enabled } = req.body || {};
    const isEventUpdate = event_key !== undefined;
    const ev = isEventUpdate ? EVENT_BY_KEY[event_key] : null;
    if (!['whatsapp', 'sms'].includes(channel) || typeof enabled !== 'boolean' || (isEventUpdate && (!ev || !ev[channel]))) {
      return res.status(400).json({ success: false, message: 'Provide channel (whatsapp|sms), enabled boolean and optionally a valid event_key' });
    }

    const before = await getMessagingSettings(true);
    if (isEventUpdate) await setEventSetting(event_key, channel, enabled, req.user.user_id);
    else await setChannelAll(channel, enabled, req.user.user_id);

    const nameRes = await db.query('SELECT full_name FROM staff_profiles WHERE user_id = $1', [req.user.user_id]);
    const role = Array.isArray(req.user.role) ? req.user.role[0] : req.user.role;
    await logActivity({
      actorUserId: req.user.user_id,
      actorName: nameRes.rows[0]?.full_name || 'Admin',
      actorRole: role,
      actionType: 'NOTIFICATION_SETTINGS_UPDATED',
      entityType: 'system_settings',
      entityId: null,
      details: isEventUpdate
        ? { event_key, channel, from: before.events?.[event_key]?.[channel], to: enabled }
        : { channel, scope: 'all messages', from: channelState(before, channel), to: enabled ? 'all' : 'none' },
    }).catch((e) => console.error('activity log failed:', e.message));

    res.json({ success: true, data: await buildPayload(true) });
  } catch (err) {
    console.error('updateSettings error:', err);
    res.status(500).json({ success: false, message: 'Failed to update settings' });
  }
};
