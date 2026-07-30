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

module.exports = { toE164, isValidPhone, toMessagingDigits, DEFAULT_COUNTRY };
