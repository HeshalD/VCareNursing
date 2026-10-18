const db = require('../config/db');
const { EVENTS, EVENT_BY_KEY, settingKey } = require('./messageEvents');

// Legacy channel switches. They are no longer a separate gate: the channel "master" shown in the
// admin UI is derived from the per-event switches (all off / some on / all on).
// These values now only serve two purposes:
//   1. the default for a per-event switch that has never been saved, so behaviour is unchanged
//      until an admin touches it (SMS was hard-blocked, WhatsApp on unless WHATSAPP_ENABLED=false)
//   2. the answer for sends that carry no (or an unknown) event key
// They are kept in sync with the events whenever an admin saves a change.
const DEFAULTS = {
  sms_enabled: false,
  whatsapp_enabled: process.env.WHATSAPP_ENABLED !== 'false',
};
const CHANNEL_FLAG = { whatsapp: 'whatsapp_enabled', sms: 'sms_enabled' };

const EVENT_SETTING_KEYS = EVENTS.flatMap((e) => [
  ...(e.whatsapp ? [settingKey(e.key, 'whatsapp')] : []),
  ...(e.sms ? [settingKey(e.key, 'sms')] : []),
]);

const TTL_MS = 10 * 1000;
let cache = null;
let cachedAt = 0;

async function getMessagingSettings(force = false) {
  if (!force && cache && Date.now() - cachedAt < TTL_MS) return cache;
  try {
    const res = await db.query(
      `SELECT setting_key, setting_value FROM system_settings WHERE setting_key = ANY($1)`,
      [[...Object.keys(DEFAULTS), ...EVENT_SETTING_KEYS]]
    );
    const next = { ...DEFAULTS, events: {} };
    const eventRows = [];
    for (const row of res.rows) {
      if (row.setting_key in DEFAULTS) next[row.setting_key] = row.setting_value === true;
      else eventRows.push(row);
    }
    // Unsaved events inherit the legacy channel flag; saved ones use their own value.
    for (const e of EVENTS) {
      next.events[e.key] = {
        whatsapp: e.whatsapp ? next.whatsapp_enabled : null,
        sms: e.sms ? next.sms_enabled : null,
      };
    }
    for (const row of eventRows) {
      const m = /^msg\.(.+)\.(whatsapp|sms)$/.exec(row.setting_key);
      if (m && next.events[m[1]] && next.events[m[1]][m[2]] !== null) next.events[m[1]][m[2]] = row.setting_value === true;
    }
    cache = next;
    cachedAt = Date.now();
  } catch (err) {
    console.error('[settings] failed to load messaging settings, using last known/defaults:', err.message);
    return cache || { ...DEFAULTS, events: {} };
  }
  return cache;
}

// Derived state of a channel across every event that uses it: 'all' | 'some' | 'none'.
function channelState(settings, channel) {
  const vals = EVENTS.filter((e) => e[channel]).map((e) => settings.events?.[e.key]?.[channel] === true);
  if (vals.length === 0 || vals.every((v) => !v)) return 'none';
  return vals.every(Boolean) ? 'all' : 'some';
}

// Writes the given { settingKey: boolean } entries in one statement.
async function upsertMany(entries, userId) {
  const keys = Object.keys(entries);
  if (keys.length === 0) return;
  await db.query(
    `INSERT INTO system_settings (setting_key, setting_value, updated_by, updated_at)
     SELECT k, to_jsonb(v), $3::uuid, NOW() FROM unnest($1::text[], $2::boolean[]) AS t(k, v)
     ON CONFLICT (setting_key) DO UPDATE
       SET setting_value = EXCLUDED.setting_value, updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
    [keys, keys.map((k) => !!entries[k]), userId || null]
  );
  cache = null;
}

// Saves a change to one channel. `changes` is { eventKey: boolean }. Every event on the channel is
// written explicitly (unsaved ones keep their current effective value) so the legacy flag can then
// be re-synced without flipping events the admin never touched.
async function applyChannelChanges(channel, changes, userId) {
  if (!['whatsapp', 'sms'].includes(channel)) throw new Error('Unknown channel');
  for (const k of Object.keys(changes)) {
    if (!EVENT_BY_KEY[k] || !EVENT_BY_KEY[k][channel]) throw new Error('Unknown message event/channel');
  }
  const current = await getMessagingSettings(true);
  const entries = {};
  let anyOn = false;
  for (const e of EVENTS) {
    if (!e[channel]) continue;
    const value = e.key in changes ? !!changes[e.key] : current.events[e.key][channel] === true;
    entries[settingKey(e.key, channel)] = value;
    anyOn = anyOn || value;
  }
  entries[CHANNEL_FLAG[channel]] = anyOn;
  await upsertMany(entries, userId);
}

const setEventSetting = (eventKey, channel, value, userId) =>
  applyChannelChanges(channel, { [eventKey]: !!value }, userId);

const setChannelAll = (channel, value, userId) =>
  applyChannelChanges(channel, Object.fromEntries(EVENTS.filter((e) => e[channel]).map((e) => [e.key, !!value])), userId);

const isSmsEnabled = async () => (await getMessagingSettings()).sms_enabled;
const isWhatsAppEnabled = async () => (await getMessagingSettings()).whatsapp_enabled;

// True when this specific message is enabled for the channel. A missing/unknown event key falls back
// to the legacy channel flag (which tracks "any event on").
async function isMessageEnabled(channel, eventKey) {
  const s = await getMessagingSettings();
  const ev = eventKey && s.events?.[eventKey];
  if (ev && ev[channel] !== null && ev[channel] !== undefined) return ev[channel] === true;
  return channel === 'sms' ? s.sms_enabled : s.whatsapp_enabled;
}

module.exports = { getMessagingSettings, channelState, setEventSetting, setChannelAll, isSmsEnabled, isWhatsAppEnabled, isMessageEnabled };
