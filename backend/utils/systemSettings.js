const db = require('../config/db');

// Messaging switches. Defaults preserve behaviour from before the admin toggle existed:
// SMS was hard-blocked, WhatsApp was on unless WHATSAPP_ENABLED=false.
const DEFAULTS = {
  sms_enabled: false,
  whatsapp_enabled: process.env.WHATSAPP_ENABLED !== 'false',
};

const TTL_MS = 10 * 1000;
let cache = null;
let cachedAt = 0;

async function getMessagingSettings(force = false) {
  if (!force && cache && Date.now() - cachedAt < TTL_MS) return cache;
  try {
    const res = await db.query(
      `SELECT setting_key, setting_value FROM system_settings WHERE setting_key = ANY($1)`,
      [Object.keys(DEFAULTS)]
    );
    const next = { ...DEFAULTS };
    for (const row of res.rows) next[row.setting_key] = row.setting_value === true;
    cache = next;
    cachedAt = Date.now();
  } catch (err) {
    console.error('[settings] failed to load messaging settings, using last known/defaults:', err.message);
    return cache || { ...DEFAULTS };
  }
  return cache;
}

async function setMessagingSetting(key, value, userId) {
  if (!(key in DEFAULTS)) throw new Error('Unknown setting');
  await db.query(
    `INSERT INTO system_settings (setting_key, setting_value, updated_by, updated_at)
     VALUES ($1, $2::jsonb, $3, NOW())
     ON CONFLICT (setting_key) DO UPDATE
       SET setting_value = EXCLUDED.setting_value, updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
    [key, JSON.stringify(!!value), userId || null]
  );
  cache = null;
}

const isSmsEnabled = async () => (await getMessagingSettings()).sms_enabled;
const isWhatsAppEnabled = async () => (await getMessagingSettings()).whatsapp_enabled;

module.exports = { getMessagingSettings, setMessagingSetting, isSmsEnabled, isWhatsAppEnabled };
