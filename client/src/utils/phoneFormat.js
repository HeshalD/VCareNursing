import { parsePhoneNumber } from 'libphonenumber-js';

/**
 * Formats a stored phone number (E.164, e.g. "+94771234567") for display,
 * e.g. "+94 77 700 4068". Falls back to the raw value if it can't be parsed
 * (empty, malformed, legacy non-E.164 data, etc.) so display never breaks.
 */
export function formatMobileNumbers(values) {
  if (!Array.isArray(values)) return [];
  return values.filter(Boolean).map(formatMobileNumber);
}

export function formatMobileNumber(value) {
  if (!value) return value;
  try {
    const phone = parsePhoneNumber(String(value), 'LK');
    if (phone) return phone.formatInternational();
  } catch {
    // fall through to raw value
  }
  return value;
}
