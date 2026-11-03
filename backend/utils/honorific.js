// The one list of honorifics the system accepts, and the tolerant parser every write path uses.
// Abbreviations always carry their dot (Mr., Mrs., Ms., Dr., Prof., Rev.); Miss is a full word
// and has none. A database trigger (see migrate.js) enforces the same rules as a backstop, so a
// value like "Mr" or "Doc" can never be stored again, whichever path or script writes it.
const HONORIFICS = ['Mr.', 'Mrs.', 'Miss', 'Ms.', 'Dr.', 'Prof.', 'Rev.'];

// Lower-cased input (dot stripped) -> canonical value
const ALIASES = {
  mr: 'Mr.', mrs: 'Mrs.', miss: 'Miss', ms: 'Ms.',
  dr: 'Dr.', doc: 'Dr.', doctor: 'Dr.',
  prof: 'Prof.', professor: 'Prof.',
  rev: 'Rev.', reverend: 'Rev.',
};

// Returns { value, valid }. Empty input is valid and means "no honorific".
function normalizeHonorific(input) {
  if (input === undefined || input === null) return { value: null, valid: true };
  const raw = String(input).trim();
  if (raw === '') return { value: null, valid: true };
  const canonical = ALIASES[raw.toLowerCase().replace(/\.+$/, '')];
  return canonical ? { value: canonical, valid: true } : { value: null, valid: false };
}

// Express middleware: auto-corrects req.body.honorific (Mr -> Mr., Doc -> Dr.) or rejects an unknown one.
const normalizeHonorificBody = (req, res, next) => {
  if (req.body && req.body.honorific !== undefined) {
    const { value, valid } = normalizeHonorific(req.body.honorific);
    if (!valid) {
      return res.status(400).json({ message: `Honorific must be one of: ${HONORIFICS.join(', ')}.` });
    }
    req.body.honorific = value;
  }
  next();
};

module.exports = { HONORIFICS, normalizeHonorific, normalizeHonorificBody };
