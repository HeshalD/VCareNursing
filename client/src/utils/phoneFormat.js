import { parsePhoneNumber } from 'libphonenumber-js';

/**
 * Formats a list of secondary phone numbers for display. Accepts the current
 * { number, name } object shape as well as legacy plain E.164 strings, and
 * returns a normalized array of { number: <formatted>, name } so callers
 * don't need to branch on the two shapes.
 */
export function formatMobileNumbers(values) {
  if (!Array.isArray(values)) return [];
  return values
    .map(v => (typeof v === 'string' ? { number: v, name: '' } : { number: v?.number || '', name: v?.name || '' }))
    .filter(v => v.number)
    .map(v => ({ number: formatMobileNumber(v.number), name: v.name }));
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
