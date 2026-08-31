// Sri Lankan NIC validation, mirroring backend/utils/nic.js.
//
// Two valid shapes:
//   - Old format: 9 digits followed by 'V' or 'X'  (e.g. "000000000V")
//   - New format: 12 digits                        (e.g. "200332112486")

const OLD_NIC = /^\d{9}[VX]$/;
const NEW_NIC = /^\d{12}$/;

export const NIC_FORMAT_MESSAGE =
  'NIC must be 9 digits followed by V or X (e.g. 000000000V), or 12 digits (e.g. 200332112486).';

// Uppercases and strips whitespace. Does NOT validate.
export function normalizeNic(value) {
  if (value === undefined || value === null) return '';
  return String(value).trim().toUpperCase();
}

export function isValidNic(value) {
  const nic = normalizeNic(value);
  if (!nic) return false;
  return OLD_NIC.test(nic) || NEW_NIC.test(nic);
}

// Keystroke-level filter for NIC inputs: allows only digits plus a trailing
// V/X, capped at the longest valid length. Lets the field reject junk as it is
// typed while still permitting partial values mid-entry.
export function sanitizeNicInput(value) {
  const upper = normalizeNic(value).replace(/[^0-9VX]/g, '');
  const digits = upper.replace(/[VX]/g, '');
  // A V/X suffix is only meaningful after exactly 9 digits (old format).
  if (digits.length === 9 && /[VX]$/.test(upper)) return `${digits}${upper.slice(-1)}`;
  return digits.slice(0, 12);
}

// Returns an error string for a NIC field, or '' when acceptable.
// `required` controls whether a blank value is an error.
export function validateNic(value, { required = false } = {}) {
  const nic = normalizeNic(value);
  if (!nic) return required ? 'NIC number is required' : '';
  return isValidNic(nic) ? '' : NIC_FORMAT_MESSAGE;
}
