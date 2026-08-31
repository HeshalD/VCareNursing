// Sri Lankan National Identity Card number validation.
//
// Two valid shapes:
//   - Old format: 9 digits followed by 'V' or 'X'  (e.g. "000000000V")
//   - New format: 12 digits                        (e.g. "200332112486")
//
// Anything else is rejected. Lowercase suffixes and surrounding whitespace are
// tolerated on input and normalized away before storage, so the DB only ever
// holds one canonical shape per NIC.

const OLD_NIC = /^\d{9}[VX]$/;
const NEW_NIC = /^\d{12}$/;

// Uppercases and strips all whitespace, so "  123456789 v " and "123456789v"
// both normalize to "123456789V". Matches sanitizeNicInput on the client, so a
// value the UI accepts is never rejected by the API for spacing alone.
// Does NOT validate — pair it with isValidNic.
const normalizeNic = (raw) => {
  if (raw === undefined || raw === null) return null;
  const cleaned = String(raw).replace(/\s+/g, '').toUpperCase();
  return cleaned === '' ? null : cleaned;
};

const isValidNic = (raw) => {
  const nic = normalizeNic(raw);
  if (!nic) return false;
  return OLD_NIC.test(nic) || NEW_NIC.test(nic);
};

// Returns the canonical NIC for storage, or null when the input is blank or
// malformed. Callers that must reject bad input should check isValidNic first —
// this collapses "blank" and "invalid" into the same null.
const toStoredNic = (raw) => (isValidNic(raw) ? normalizeNic(raw) : null);

const NIC_FORMAT_MESSAGE =
  'NIC must be 9 digits followed by V or X (e.g. 000000000V), or 12 digits (e.g. 200332112486).';

module.exports = { isValidNic, normalizeNic, toStoredNic, NIC_FORMAT_MESSAGE };
