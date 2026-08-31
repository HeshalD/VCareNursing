const { parsePhoneNumberFromString, isValidPhoneNumber } = require('libphonenumber-js');

// Default country used when a number has no explicit country code (e.g. legacy
// local-format numbers like "0771234567" still in the DB or typed by users).
const DEFAULT_COUNTRY = 'LK';

// Normalizes any input (already E.164, or a legacy local number) to E.164
// ("+94771234567") for storage and for exact-match DB lookups. Returns null
// if the number can't be parsed as valid for the given/default country.
const toE164 = (raw, defaultCountry = DEFAULT_COUNTRY) => {
  if (!raw) return null;
  const parsed = parsePhoneNumberFromString(String(raw).trim(), defaultCountry);
  if (!parsed || !parsed.isValid()) return null;
  return parsed.number;
};

const isValidPhone = (raw, defaultCountry = DEFAULT_COUNTRY) => {
  if (!raw) return false;
  try {
    return isValidPhoneNumber(String(raw).trim(), defaultCountry);
  } catch {
    return false;
  }
};

// Digits-only with country code, no '+' — the shape smsapi.lk and the Meta
// WhatsApp Graph API expect (e.g. "94771234567"). Accepts either an
// already-E.164 value or a legacy local number.
const toMessagingDigits = (raw, defaultCountry = DEFAULT_COUNTRY) => {
  const e164 = toE164(raw, defaultCountry);
  return e164 ? e164.replace('+', '') : null;
};

// Normalizes a list of phone numbers to a deduped E.164 array. Accepts either a
// real array or a JSON-array string (how arrays arrive through multipart form
// data, same as `languages`/`roles`). Invalid or blank entries are dropped so
// junk never reaches the DB. Returns null when `raw` is undefined/null — the
// "leave unchanged" signal for COALESCE-style updates.
const toE164List = (raw, defaultCountry = DEFAULT_COUNTRY) => {
  if (raw === undefined || raw === null) return null;
  let list = raw;
  if (typeof list === 'string') {
    try { list = JSON.parse(list); } catch { return []; }
  }
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  for (const entry of list) {
    const e164 = toE164(entry, defaultCountry);
    if (e164) seen.add(e164);
  }
  return Array.from(seen);
};

module.exports = { toE164, toE164List, isValidPhone, toMessagingDigits, DEFAULT_COUNTRY };
