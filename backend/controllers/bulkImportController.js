const XLSX = require('xlsx');
const bcrypt = require('bcryptjs');
const db = require('../config/db');
const { creditStaffSalary } = require('../services/billingService');
const { creditRecruiterForStaff } = require('../services/recruiterService');
const { creditSalespersonForRegistration } = require('../services/clientSalespersonService');
const { logActivity } = require('../utils/activityLogger');
const { toE164, isValidPhone } = require('../utils/phone');

const SHEET_NAMES = {
  staff: 'Staff',
  clients: 'Clients',
  patients: 'Care Profiles',
  bookings: 'Active Bookings',
};

const VALID_STAFF_ROLES = ['NURSE', 'NANNY', 'CARETAKER', 'COORDINATOR', 'NURSING_ASSISTANT', 'PHYSIOTHERAPIST', 'COUNSELLOR'];
const VALID_GENDERS = ['MALE', 'FEMALE', 'OTHER'];
const VALID_HONORIFICS = ['Mr.', 'Mrs.', 'Ms.', 'Dr.', 'Prof.', 'Rev.'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// ─── Spreadsheet parsing ────────────────────────────────────────────────────

// Columns that hold dates — if the admin picked them via Excel's date entry
// (rather than typing plain text), the cell is stored as a real date, not a
// string, and must be reformatted to YYYY-MM-DD ourselves (see findSheet).
const DATE_FIELDS_BY_SHEET = {
  [SHEET_NAMES.staff]: ['date_of_birth'],
  [SHEET_NAMES.clients]: ['reg_fee_paid_date'],
  [SHEET_NAMES.patients]: [],
  [SHEET_NAMES.bookings]: ['start_date'],
};

// Excel/SheetJS date cells round-trip as timezone-agnostic UTC-midnight
// Date objects — use the UTC getters, not local ones, to avoid an off-by-one
// day shift on machines running outside UTC.
function formatDateUTC(date) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function findSheet(workbook, wantedName) {
  const target = wantedName.trim().toLowerCase();
  const actualName = workbook.SheetNames.find((n) => n.trim().toLowerCase() === target);
  if (!actualName) return [];
  const sheet = workbook.Sheets[actualName];

  // raw: false gives us sensible text for everything (crucially, it preserves
  // mobile numbers / staff codes typed as text) but formats genuine date
  // cells using the spreadsheet's own locale (e.g. "6/5/1998"), which is both
  // ambiguous and not what the template expects. So we also parse the same
  // sheet with raw: true (date cells become real JS Date objects, since the
  // workbook was read with cellDates: true) purely to recover the exact
  // calendar date for the known date columns, and splice that in.
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });
  const dateFields = DATE_FIELDS_BY_SHEET[wantedName] || [];
  if (dateFields.length) {
    const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: true });
    rows.forEach((row, i) => {
      dateFields.forEach((field) => {
        const rawVal = rawRows[i][field];
        if (rawVal instanceof Date && !Number.isNaN(rawVal.getTime())) {
          row[field] = formatDateUTC(rawVal);
        }
      });
    });
  }
  return rows;
}

function trimRow(row) {
  const out = {};
  for (const key of Object.keys(row)) {
    const cleanKey = String(key).trim();
    const val = row[key];
    out[cleanKey] = typeof val === 'string' ? val.trim() : val;
  }
  return out;
}

function parseWorkbook(buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  return {
    staff: findSheet(workbook, SHEET_NAMES.staff).map(trimRow),
    clients: findSheet(workbook, SHEET_NAMES.clients).map(trimRow),
    patients: findSheet(workbook, SHEET_NAMES.patients).map(trimRow),
    bookings: findSheet(workbook, SHEET_NAMES.bookings).map(trimRow),
  };
}

function toNumberOrNull(v) {
  if (v === '' || v === null || v === undefined) return null;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : NaN; // NaN signals "present but not a valid number"
}

function isYes(v) {
  return ['y', 'yes', 'true', '1'].includes(String(v || '').trim().toLowerCase());
}

// Validates + normalizes a phone column to E.164, pushing an error (and
// returning the original raw value) instead of silently trusting bad input.
function normalizePhoneField(rawValue, fieldLabel, errors) {
  const raw = String(rawValue || '').trim();
  if (!raw) return raw;
  if (!isValidPhone(raw)) {
    errors.push(`${fieldLabel} is not a valid phone number`);
    return raw;
  }
  return toE164(raw);
}

// ─── Per-row normalization + validation (no DB access) ─────────────────────

function normalizeStaffRow(row) {
  const errors = [];
  if (!String(row.mobile_number || '').trim()) errors.push('mobile_number is required');
  const mobile_number = normalizePhoneField(row.mobile_number, 'mobile_number', errors);
  const full_name = String(row.full_name || '').trim();
  if (!full_name) errors.push('full_name is required');

  const gender = row.gender ? String(row.gender).trim().toUpperCase() : null;
  if (gender && !VALID_GENDERS.includes(gender)) errors.push(`gender must be one of ${VALID_GENDERS.join(', ')}`);

  const date_of_birth = row.date_of_birth ? String(row.date_of_birth).trim() : null;
  if (date_of_birth && !DATE_RE.test(date_of_birth)) errors.push('date_of_birth must be in YYYY-MM-DD format');

  const role = row.role ? String(row.role).trim().toUpperCase() : 'NURSE';
  if (!VALID_STAFF_ROLES.includes(role)) errors.push(`role must be one of ${VALID_STAFF_ROLES.join(', ')}`);

  const current_earnings_opening = toNumberOrNull(row.current_earnings_opening);
  if (Number.isNaN(current_earnings_opening)) errors.push('current_earnings_opening must be a number');

  const designation = row.designation ? String(row.designation).trim() : null;
  const nic_number = row.nic_number ? String(row.nic_number).trim() : null;
  const staff_code = row.staff_code ? String(row.staff_code).trim() : null;
  const experience_level = row.experience_level ? String(row.experience_level).trim() : null;
  const admin_remarks = row.admin_remarks ? String(row.admin_remarks).trim() : null;
  const recruiter_email = row.recruiter_email ? String(row.recruiter_email).trim().toLowerCase() : null;

  const onboarding_status = (designation && gender && date_of_birth && nic_number) ? 'ACTIVE' : 'PENDING_MIGRATION';

  return {
    errors,
    data: {
      mobile_number, full_name, designation, gender, date_of_birth, nic_number,
      role, staff_code, experience_level, admin_remarks,
      current_earnings_opening: current_earnings_opening || null,
      recruiter_email, onboarding_status,
    },
  };
}

function normalizeClientRow(row) {
  const errors = [];
  if (!String(row.mobile_number || '').trim()) errors.push('mobile_number is required');
  const mobile_number = normalizePhoneField(row.mobile_number, 'mobile_number', errors);
  const full_name = String(row.full_name || '').trim();
  if (!full_name) errors.push('full_name is required');

  const gender = row.gender ? String(row.gender).trim().toUpperCase() : null;
  if (gender && !VALID_GENDERS.includes(gender)) errors.push(`gender must be one of ${VALID_GENDERS.join(', ')}`);

  const honorific = row.honorific ? String(row.honorific).trim() : null;
  if (honorific && !VALID_HONORIFICS.includes(honorific)) errors.push(`honorific must be one of ${VALID_HONORIFICS.join(', ')}`);

  const wallet_balance_opening = toNumberOrNull(row.wallet_balance_opening);
  if (Number.isNaN(wallet_balance_opening)) errors.push('wallet_balance_opening must be a number');

  const reg_fee_paid = isYes(row.reg_fee_paid);
  const reg_fee_amount = toNumberOrNull(row.reg_fee_amount);
  if (Number.isNaN(reg_fee_amount)) errors.push('reg_fee_amount must be a number');
  const reg_fee_paid_date = row.reg_fee_paid_date ? String(row.reg_fee_paid_date).trim() : null;
  if (reg_fee_paid_date && !DATE_RE.test(reg_fee_paid_date)) errors.push('reg_fee_paid_date must be in YYYY-MM-DD format');
  if (reg_fee_paid && !reg_fee_amount) errors.push('reg_fee_amount is required when reg_fee_paid is Y');
  if (reg_fee_paid && !reg_fee_paid_date) errors.push('reg_fee_paid_date is required when reg_fee_paid is Y');

  const legacy_overdue_balance = toNumberOrNull(row.legacy_overdue_balance);
  if (Number.isNaN(legacy_overdue_balance)) errors.push('legacy_overdue_balance must be a number');

  const salesperson_email = row.salesperson_email ? String(row.salesperson_email).trim().toLowerCase() : null;

  const onboarding_status = (gender && row.primary_address) ? 'ACTIVE' : 'PENDING_MIGRATION';

  return {
    errors,
    data: {
      mobile_number, full_name, gender, honorific,
      email: row.email ? String(row.email).trim() : null,
      primary_address: row.primary_address ? String(row.primary_address).trim() : null,
      client_type: row.client_type ? String(row.client_type).trim().toUpperCase() : 'INDIVIDUAL',
      company_name: row.company_name ? String(row.company_name).trim() : null,
      wallet_balance_opening: wallet_balance_opening || null,
      reg_fee_paid, reg_fee_amount: reg_fee_amount || null, reg_fee_paid_date,
      salesperson_email,
      legacy_overdue_balance: legacy_overdue_balance || null,
      onboarding_status,
    },
  };
}

function normalizeCareProfileRow(row) {
  const errors = [];
  if (!String(row.client_mobile_number || '').trim()) errors.push('client_mobile_number is required');
  const client_mobile_number = normalizePhoneField(row.client_mobile_number, 'client_mobile_number', errors);
  const full_name = String(row.full_name || '').trim();
  const age = toNumberOrNull(row.age);
  if (!full_name) errors.push('full_name is required');
  if (!age || Number.isNaN(age)) errors.push('age is required and must be a number');

  const gender = row.gender ? String(row.gender).trim().toUpperCase() : null;
  if (gender && !VALID_GENDERS.includes(gender)) errors.push(`gender must be one of ${VALID_GENDERS.join(', ')}`);

  return {
    errors,
    data: {
      client_mobile_number, full_name, age: age || null, gender,
      relationship_to_client: row.relationship_to_client ? String(row.relationship_to_client).trim() : null,
      medical_condition: row.medical_condition ? String(row.medical_condition).trim() : null,
      residential_address: row.residential_address ? String(row.residential_address).trim() : null,
      emergency_contact_name: row.emergency_contact_name ? String(row.emergency_contact_name).trim() : null,
      emergency_contact_number: row.emergency_contact_number ? String(row.emergency_contact_number).trim() : null,
    },
  };
}

// A `booking_ref` shared by multiple rows means "these rows are the same
// booking" — the first row with a given ref creates the booking as usual;
// later rows with the same ref only add another staff member to a specific
// shift (SHIFT_BASED only, since that's the only service model with more
// than one concurrent staff slot). computeAdditionalStaffFlags marks which
// rows are "additional staff" rows vs. the primary/booking-creating row.
function computeAdditionalStaffFlags(rows) {
  const seenRefs = new Set();
  return rows.map((row) => {
    const ref = row.booking_ref ? String(row.booking_ref).trim() : '';
    if (!ref) return false;
    if (seenRefs.has(ref)) return true;
    seenRefs.add(ref);
    return false;
  });
}

function normalizeBookingRow(row, { isAdditionalStaffRow = false } = {}) {
  const errors = [];
  if (!String(row.client_mobile_number || '').trim()) errors.push('client_mobile_number is required');
  const client_mobile_number = normalizePhoneField(row.client_mobile_number, 'client_mobile_number', errors);
  const patient_full_name = String(row.patient_full_name || '').trim();
  if (!patient_full_name) errors.push('patient_full_name is required');

  const booking_ref = row.booking_ref ? String(row.booking_ref).trim() : null;

  const assigned_staff_mobile_number = row.assigned_staff_mobile_number
    ? normalizePhoneField(row.assigned_staff_mobile_number, 'assigned_staff_mobile_number', errors)
    : null;

  const staff_daily_rate = toNumberOrNull(row.staff_daily_rate);
  if (Number.isNaN(staff_daily_rate)) errors.push('staff_daily_rate must be a number');

  const shift_number = row.shift_number ? Math.trunc(toNumberOrNull(row.shift_number)) : 1;
  if (Number.isNaN(shift_number) || shift_number < 1) errors.push('shift_number must be a positive whole number');

  // Additional-staff rows only add one more staff assignment to an existing
  // SHIFT_BASED booking's slot — none of the booking-creation fields below
  // apply to them and are ignored even if filled in.
  if (isAdditionalStaffRow) {
    if (!assigned_staff_mobile_number) errors.push('assigned_staff_mobile_number is required on an additional-staff row (same booking_ref as an earlier row)');
    if (!staff_daily_rate) errors.push('staff_daily_rate is required on an additional-staff row');

    // Optional — if given, corrects THIS shift's own start time/duration
    // (the slot is otherwise created with a placeholder copied from the
    // primary row, since the sheet only captures one time per booking row
    // until this shift's own row arrives).
    const shift_start_time = row.shift_start_time ? String(row.shift_start_time).trim() : null;
    if (shift_start_time && !/^\d{1,2}:\d{2}$/.test(shift_start_time)) {
      errors.push('shift_start_time must be in HH:MM format');
    }
    const shift_duration_hours = toNumberOrNull(row.shift_duration_hours);
    if (Number.isNaN(shift_duration_hours)) errors.push('shift_duration_hours must be a number');

    return {
      errors,
      data: {
        client_mobile_number, patient_full_name, booking_ref,
        assigned_staff_mobile_number, staff_daily_rate: staff_daily_rate || null,
        shift_number: shift_number || 1,
        shift_start_time, shift_duration_hours: shift_duration_hours || null,
      },
    };
  }

  const amount_paid = toNumberOrNull(row.amount_paid) || 0;
  const amount_outstanding = toNumberOrNull(row.amount_outstanding) || 0;
  if (Number.isNaN(amount_paid)) errors.push('amount_paid must be a number');
  if (Number.isNaN(amount_outstanding)) errors.push('amount_outstanding must be a number');

  const start_date = row.start_date ? String(row.start_date).trim() : null;
  if (start_date && !DATE_RE.test(start_date)) errors.push('start_date must be in YYYY-MM-DD format');
  // This sheet is for bookings already in progress — status/staffing/billing all go
  // live immediately on commit, with none of the SCHEDULED/ASSIGNMENT_START deferral
  // machinery the normal booking flow uses for a future start date. A future-dated
  // row here would start billing the client and paying the staff before service has
  // actually begun.
  if (start_date && DATE_RE.test(start_date)) {
    const todayStr = new Date().toISOString().slice(0, 10);
    if (start_date > todayStr) {
      errors.push('start_date cannot be in the future — Active Bookings import is for bookings already in progress; use the normal Assign Staff flow for upcoming bookings');
    }
  }

  if (assigned_staff_mobile_number && !staff_daily_rate) {
    errors.push('staff_daily_rate is required when assigned_staff_mobile_number is provided (needed to credit the staff member\'s ongoing daily earnings)');
  }

  // Always required (not just when staff is pre-assigned) so every imported booking
  // gets a backfilled quote with a real client rate — otherwise a booking imported
  // without staff has no linked quote, and assigning staff to it later has no client
  // rate to bill against.
  const client_daily_rate = toNumberOrNull(row.client_daily_rate);
  if (Number.isNaN(client_daily_rate)) errors.push('client_daily_rate must be a number');
  if (!client_daily_rate) {
    errors.push('client_daily_rate is required (this is what the client is billed going forward — it can differ from staff_daily_rate)');
  }

  const service_model = row.service_model ? String(row.service_model).trim().toUpperCase() : 'SHIFT_BASED';

  const shift_count = row.shift_count ? Math.trunc(toNumberOrNull(row.shift_count)) : 1;
  if (Number.isNaN(shift_count) || shift_count < 1) errors.push('shift_count must be a positive whole number');

  const shift_start_time = row.shift_start_time ? String(row.shift_start_time).trim() : null;
  const shift_duration_hours = toNumberOrNull(row.shift_duration_hours);
  if (Number.isNaN(shift_duration_hours)) errors.push('shift_duration_hours must be a number');
  if (service_model === 'SHIFT_BASED') {
    if (!shift_start_time || !/^\d{1,2}:\d{2}$/.test(shift_start_time)) {
      errors.push('shift_start_time is required and must be in HH:MM format when service_model is SHIFT_BASED');
    }
    if (!shift_duration_hours) {
      errors.push('shift_duration_hours is required when service_model is SHIFT_BASED');
    }
  }
  if (booking_ref && service_model !== 'SHIFT_BASED') {
    errors.push('booking_ref (multiple staff per booking) is only supported for SHIFT_BASED bookings');
  }

  return {
    errors,
    data: {
      client_mobile_number, patient_full_name, booking_ref,
      assigned_staff_mobile_number,
      staff_daily_rate: staff_daily_rate || null,
      client_daily_rate: client_daily_rate || null,
      service_type: row.service_type ? String(row.service_type).trim() : null,
      service_model,
      shift_count: shift_count || 1,
      shift_start_time,
      shift_duration_hours: shift_duration_hours || null,
      start_date,
      amount_paid, amount_outstanding,
    },
  };
}

// ─── DB lookup helpers (shared by preview + commit) ─────────────────────────

async function findClientIdByMobile(executor, mobileNumber) {
  const res = await executor.query(
    `SELECT cp.client_profile_id FROM client_profiles cp
     JOIN users u ON cp.user_id = u.user_id
     WHERE u.mobile_number = $1`,
    [mobileNumber]
  );
  return res.rows[0]?.client_profile_id || null;
}

async function findStaffIdByMobile(executor, mobileNumber) {
  const res = await executor.query(
    `SELECT sp.staff_profile_id FROM staff_profiles sp
     JOIN users u ON sp.user_id = u.user_id
     WHERE u.mobile_number = $1`,
    [mobileNumber]
  );
  return res.rows[0]?.staff_profile_id || null;
}

async function findPatientIdByClientAndName(executor, clientId, fullName) {
  const res = await executor.query(
    `SELECT patient_id FROM patient_profiles WHERE client_id = $1 AND full_name ILIKE $2 LIMIT 1`,
    [clientId, fullName]
  );
  return res.rows[0]?.patient_id || null;
}

async function findInternalStaffIdByEmail(executor, email) {
  const res = await executor.query(`SELECT id FROM internal_staff WHERE LOWER(email) = $1`, [email]);
  return res.rows[0]?.id || null;
}

async function mobileNumberTaken(executor, mobileNumber) {
  const res = await executor.query(`SELECT 1 FROM users WHERE mobile_number = $1`, [mobileNumber]);
  return res.rows.length > 0;
}

// Mirrors the conflict check in staffAssignmentController.assignStaffToBooking — a
// staff member already committed to an overlapping ACTIVE/SCHEDULED assignment
// elsewhere must not be silently double-booked by the import. excludeBookingId lets
// a staff member legitimately cover more than one shift slot on the SAME booking
// (e.g. an additional-staff row assigning them to a second shift) without tripping
// this check against their own other slot.
async function findConflictingAssignment(executor, staffId, serviceStartDate, excludeBookingId = null) {
  const res = await executor.query(
    `SELECT 1
     FROM booking_staff_assignments bsa
     LEFT JOIN LATERAL (
         SELECT effective_date FROM scheduled_actions
         WHERE booking_id = bsa.booking_id
           AND action_type IN ('TERMINATION', 'COMPLETION')
           AND status = 'SCHEDULED'
         ORDER BY effective_date ASC
         LIMIT 1
     ) sa ON bsa.service_end_date IS NULL
     WHERE bsa.staff_profile_id = $1
       AND ($2::uuid IS NULL OR bsa.booking_id != $2)
       AND bsa.status IN ('ACTIVE', 'SCHEDULED')
       AND bsa.service_start_date <= $3::date
       AND (COALESCE(bsa.service_end_date, sa.effective_date) IS NULL
            OR COALESCE(bsa.service_end_date, sa.effective_date) >= $3::date)
     LIMIT 1`,
    [staffId, excludeBookingId, serviceStartDate]
  );
  return res.rows.length > 0;
}

// The nightly billing cron (and SHIFT_BASED confirm flow) bills the CLIENT off
// a linked quotation's rate, falling back to the STAFF's own pay rate
// (booking_staff_assignments.daily_rate) when no quote exists. Imported
// bookings have no quote by default, which would silently bill the client
// exactly what the staff is paid — no agency margin. When a distinct
// client_daily_rate is supplied, synthesize the minimal service_request +
// quotation chain the cron already knows how to join against, so the client
// is billed at the correct rate going forward. This mirrors the shape used by
// the real quote-to-booking flow (bookingController.js's convertToBookingInternal)
// closely enough to be indistinguishable to every downstream reader, without
// needing a live sales quote to have ever been sent.
async function createBackfilledQuoteForBooking(client, { clientId, patientFullName, serviceType, serviceModel, startDate, clientDailyRate, totalContractAmount }) {
  const requestRes = await client.query(
    `INSERT INTO service_requests (
       client_id, patient_name, service_type, service_model, start_date, status, remarks, created_at
     ) VALUES ($1, $2, $3, $4::service_model_enum, $5, 'BOOKING_CREATED', 'LEGACY_IMPORT', COALESCE($5::date, NOW()))
     RETURNING request_id`,
    [clientId, patientFullName, serviceType, serviceModel, startDate]
  );
  const requestId = requestRes.rows[0].request_id;

  let estimateNumber;
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = `EST-IMP${Math.floor(100000 + Math.random() * 900000)}`;
    const exists = await client.query(`SELECT 1 FROM quotations WHERE estimate_number = $1`, [candidate]);
    if (exists.rows.length === 0) { estimateNumber = candidate; break; }
  }
  if (!estimateNumber) throw new Error('Could not generate a unique estimate number for the backfilled quote');

  // total_amount/sub_total must be the booking's REAL total contract value
  // (amount_paid + amount_outstanding), not just the per-day/shift rate —
  // getClientOverdueBreakdown (clientController.js) computes each booking's
  // outstanding balance as COALESCE(quote.total_amount, booking.amount_quotated)
  // minus what's actually been paid, and PREFERS the quote's total_amount when
  // a quote is linked. A quote carrying only a nominal one-unit amount here
  // would silently mask real outstanding balances (already paid > nominal
  // amount clamps the balance to 0, hiding a genuinely overdue booking).
  const perShiftRate = serviceModel === 'SHIFT_BASED' ? clientDailyRate : null;
  const quoteRes = await client.query(
    `INSERT INTO quotations (
       estimate_number, request_id, registration_fee, daily_rate, per_shift_rate,
       qty_days, transport_fee, sub_total, total_amount, status
     ) VALUES ($1, $2, 0, $3, $4, 1, 0, $5, $5, 'IMPORTED')
     RETURNING quote_id`,
    [estimateNumber, requestId, clientDailyRate, perShiftRate, totalContractAmount]
  );
  const quoteId = quoteRes.rows[0].quote_id;

  await client.query(`UPDATE service_requests SET active_quote_id = $1 WHERE request_id = $2`, [quoteId, requestId]);

  return { requestId, quoteId };
}

// ─── Preview (dry run, no writes) ───────────────────────────────────────────

exports.previewImport = async (req, res) => {
  if (!req.file) return res.status(400).json({ status: 'error', message: 'No file uploaded' });

  let sheets;
  try {
    sheets = parseWorkbook(req.file.buffer);
  } catch (err) {
    return res.status(400).json({ status: 'error', message: `Could not read spreadsheet: ${err.message}` });
  }

  const results = { staff: [], clients: [], patients: [], bookings: [] };
  // In-batch reservation maps so later sheets can reference earlier rows in this same file.
  const seenStaffMobiles = new Set();
  const seenClientMobiles = new Set();
  const seenPatients = new Set(); // `${client_mobile}::${full_name_lower}`

  for (let i = 0; i < sheets.staff.length; i++) {
    const rowNumber = i + 2; // header is row 1
    const { errors, data } = normalizeStaffRow(sheets.staff[i]);
    if (!errors.length) {
      if (seenStaffMobiles.has(data.mobile_number) || await mobileNumberTaken(db, data.mobile_number)) {
        errors.push(`mobile_number ${data.mobile_number} already exists`);
      }
      if (data.staff_code) {
        const codeRes = await db.query(`SELECT 1 FROM staff_profiles WHERE staff_code = $1`, [data.staff_code]);
        if (codeRes.rows.length > 0) errors.push(`staff_code ${data.staff_code} already exists`);
      }
      if (data.recruiter_email && !(await findInternalStaffIdByEmail(db, data.recruiter_email))) {
        errors.push(`recruiter_email ${data.recruiter_email} does not match any internal staff member`);
      }
    }
    if (!errors.length) seenStaffMobiles.add(data.mobile_number);
    results.staff.push({ row_number: rowNumber, status: errors.length ? 'error' : 'ok', errors });
  }

  for (let i = 0; i < sheets.clients.length; i++) {
    const rowNumber = i + 2;
    const { errors, data } = normalizeClientRow(sheets.clients[i]);
    if (!errors.length) {
      if (seenClientMobiles.has(data.mobile_number) || await mobileNumberTaken(db, data.mobile_number)) {
        errors.push(`mobile_number ${data.mobile_number} already exists`);
      }
      if (data.salesperson_email && !(await findInternalStaffIdByEmail(db, data.salesperson_email))) {
        errors.push(`salesperson_email ${data.salesperson_email} does not match any internal staff member`);
      }
    }
    if (!errors.length) seenClientMobiles.add(data.mobile_number);
    results.clients.push({ row_number: rowNumber, status: errors.length ? 'error' : 'ok', errors });
  }

  for (let i = 0; i < sheets.patients.length; i++) {
    const rowNumber = i + 2;
    const { errors, data } = normalizeCareProfileRow(sheets.patients[i]);
    if (!errors.length) {
      const clientKnown = seenClientMobiles.has(data.client_mobile_number) || await findClientIdByMobile(db, data.client_mobile_number);
      if (!clientKnown) errors.push(`client_mobile_number ${data.client_mobile_number} not found in Clients sheet or existing clients`);
    }
    if (!errors.length) seenPatients.add(`${data.client_mobile_number}::${data.full_name.toLowerCase()}`);
    results.patients.push({ row_number: rowNumber, status: errors.length ? 'error' : 'ok', errors });
  }

  const bookingAdditionalStaffFlags = computeAdditionalStaffFlags(sheets.bookings);
  const bookingRefPrimaries = new Map(); // booking_ref -> { client_mobile_number, patient_full_name, shift_count }

  for (let i = 0; i < sheets.bookings.length; i++) {
    const rowNumber = i + 2;
    const isAdditionalStaffRow = bookingAdditionalStaffFlags[i];
    const { errors, data } = normalizeBookingRow(sheets.bookings[i], { isAdditionalStaffRow });

    if (!errors.length && isAdditionalStaffRow) {
      const primary = bookingRefPrimaries.get(data.booking_ref);
      if (!primary) {
        errors.push(`booking_ref ${data.booking_ref} does not match any earlier row in this sheet`);
      } else {
        if (primary.client_mobile_number !== data.client_mobile_number || primary.patient_full_name.toLowerCase() !== data.patient_full_name.toLowerCase()) {
          errors.push(`booking_ref ${data.booking_ref} refers to a different client/patient than its first row`);
        }
        if (data.shift_number < 1 || data.shift_number > primary.shift_count) {
          errors.push(`shift_number ${data.shift_number} is out of range for booking_ref ${data.booking_ref} (this booking has ${primary.shift_count} shift(s))`);
        }
        const existingStaffId = await findStaffIdByMobile(db, data.assigned_staff_mobile_number);
        const staffKnown = seenStaffMobiles.has(data.assigned_staff_mobile_number) || existingStaffId;
        if (!staffKnown) errors.push(`assigned_staff_mobile_number ${data.assigned_staff_mobile_number} not found in Staff sheet or existing staff`);
        // Only checkable against staff who already exist in the DB — a brand-new
        // staff member created earlier in this same batch can't have a prior
        // conflicting assignment. excludeBookingId is the primary row's own booking
        // once it exists post-commit; at preview time nothing has been created yet,
        // so this can only catch conflicts against OTHER pre-existing bookings.
        if (existingStaffId && primary && await findConflictingAssignment(db, existingStaffId, primary.start_date)) {
          errors.push(`assigned_staff_mobile_number ${data.assigned_staff_mobile_number} is already committed to another active booking over this date range`);
        }
      }
      results.bookings.push({ row_number: rowNumber, status: errors.length ? 'error' : 'ok', errors });
      continue;
    }

    if (!errors.length) {
      const clientKnown = seenClientMobiles.has(data.client_mobile_number) || await findClientIdByMobile(db, data.client_mobile_number);
      if (!clientKnown) errors.push(`client_mobile_number ${data.client_mobile_number} not found in Clients sheet or existing clients`);

      const patientKey = `${data.client_mobile_number}::${data.patient_full_name.toLowerCase()}`;
      let patientKnown = seenPatients.has(patientKey);
      if (!patientKnown && clientKnown) {
        const clientId = await findClientIdByMobile(db, data.client_mobile_number);
        patientKnown = clientId && !!(await findPatientIdByClientAndName(db, clientId, data.patient_full_name));
      }
      if (!patientKnown) errors.push(`patient_full_name "${data.patient_full_name}" not found for this client in Care Profiles sheet or existing care profiles`);

      if (data.assigned_staff_mobile_number) {
        const existingStaffId = await findStaffIdByMobile(db, data.assigned_staff_mobile_number);
        const staffKnown = seenStaffMobiles.has(data.assigned_staff_mobile_number) || existingStaffId;
        if (!staffKnown) errors.push(`assigned_staff_mobile_number ${data.assigned_staff_mobile_number} not found in Staff sheet or existing staff`);
        if (existingStaffId && await findConflictingAssignment(db, existingStaffId, data.start_date || new Date().toISOString().slice(0, 10))) {
          errors.push(`assigned_staff_mobile_number ${data.assigned_staff_mobile_number} is already committed to another active booking over this date range`);
        }
      }
    }
    if (!errors.length && data.booking_ref) {
      bookingRefPrimaries.set(data.booking_ref, {
        client_mobile_number: data.client_mobile_number,
        patient_full_name: data.patient_full_name,
        shift_count: data.shift_count,
        start_date: data.start_date || new Date().toISOString().slice(0, 10),
      });
    }
    results.bookings.push({ row_number: rowNumber, status: errors.length ? 'error' : 'ok', errors });
  }

  const countErrors = (arr) => arr.filter((r) => r.status === 'error').length;
  res.status(200).json({
    status: 'success',
    data: {
      results,
      summary: {
        staff: { total: results.staff.length, errors: countErrors(results.staff) },
        clients: { total: results.clients.length, errors: countErrors(results.clients) },
        patients: { total: results.patients.length, errors: countErrors(results.patients) },
        bookings: { total: results.bookings.length, errors: countErrors(results.bookings) },
      },
    },
  });
};

// ─── Commit (actual writes, one transaction per row) ────────────────────────

async function commitStaffRow(data, assignedBy) {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    if (await mobileNumberTaken(client, data.mobile_number)) {
      throw new Error(`mobile_number ${data.mobile_number} already exists`);
    }
    if (data.staff_code) {
      const codeRes = await client.query(`SELECT 1 FROM staff_profiles WHERE staff_code = $1`, [data.staff_code]);
      if (codeRes.rows.length > 0) throw new Error(`staff_code ${data.staff_code} already exists`);
    }

    let recruiterId = null;
    if (data.recruiter_email) {
      recruiterId = await findInternalStaffIdByEmail(client, data.recruiter_email);
      if (!recruiterId) throw new Error(`recruiter_email ${data.recruiter_email} does not match any internal staff member`);
    }

    const tempPassword = Math.random().toString(36).slice(-8);
    const hashedPassword = await bcrypt.hash(tempPassword, 12);

    const userRes = await client.query(
      `INSERT INTO users (email, password_hash, mobile_number, role, is_email_verified)
       VALUES (NULL, $1, $2, ARRAY[$3::user_role_enum], true)
       RETURNING user_id`,
      [hashedPassword, data.mobile_number, data.role]
    );
    const userId = userRes.rows[0].user_id;

    const profileRes = await client.query(
      `INSERT INTO staff_profiles (
         user_id, full_name, designation, nic_number, gender, date_of_birth,
         staff_code, experience_level, admin_remarks, current_status,
         verification_status, onboarding_status, import_batch_id, created_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'PENDING', $11, $12, NOW())
       RETURNING staff_profile_id`,
      [
        userId, data.full_name, data.designation, data.nic_number, data.gender, data.date_of_birth,
        data.staff_code, data.experience_level, data.admin_remarks,
        data.onboarding_status === 'PENDING_MIGRATION' ? 'UNAVAILABLE' : 'AVAILABLE',
        data.onboarding_status, assignedBy.import_batch_id,
      ]
    );
    const staffProfileId = profileRes.rows[0].staff_profile_id;

    if (data.current_earnings_opening) {
      await creditStaffSalary(client, {
        staff_profile_id: staffProfileId,
        booking_id: null,
        amount: data.current_earnings_opening,
        notes: 'LEGACY_IMPORT: opening earnings balance',
      });
    }

    if (recruiterId) {
      await creditRecruiterForStaff(client, {
        staff_profile_id: staffProfileId,
        recruiter_id: recruiterId,
        assigned_by: assignedBy.user_id,
      });
    }

    await client.query('COMMIT');
    return { staff_profile_id: staffProfileId, mobile_number: data.mobile_number };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function commitClientRow(data, assignedBy) {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    if (await mobileNumberTaken(client, data.mobile_number)) {
      throw new Error(`mobile_number ${data.mobile_number} already exists`);
    }

    let salespersonId = null;
    if (data.salesperson_email) {
      salespersonId = await findInternalStaffIdByEmail(client, data.salesperson_email);
      if (!salespersonId) throw new Error(`salesperson_email ${data.salesperson_email} does not match any internal staff member`);
    }

    const tempPassword = Math.random().toString(36).slice(-8);
    const hashedPassword = await bcrypt.hash(tempPassword, 12);

    const userRes = await client.query(
      `INSERT INTO users (mobile_number, password_hash, email, is_email_verified)
       VALUES ($1, $2, $3, $4) RETURNING user_id`,
      [data.mobile_number, hashedPassword, data.email, !!data.email]
    );
    const userId = userRes.rows[0].user_id;

    const profileRes = await client.query(
      `INSERT INTO client_profiles (
         user_id, full_name, client_type, gender, primary_address, company_name,
         honorific, onboarding_status, import_batch_id
       ) VALUES ($1, $2, $3, $4::gender_enum, $5, $6, $7, $8, $9)
       RETURNING client_profile_id`,
      [userId, data.full_name, data.client_type, data.gender, data.primary_address, data.company_name,
        data.honorific, data.onboarding_status, assignedBy.import_batch_id]
    );
    const clientId = profileRes.rows[0].client_profile_id;

    if (data.wallet_balance_opening) {
      await client.query(`UPDATE client_profiles SET wallet_balance = $1 WHERE client_profile_id = $2`,
        [data.wallet_balance_opening, clientId]);
    }

    if (data.reg_fee_paid) {
      // A legacy client may have paid well over 365 days ago — the nightly
      // regFeeExpiry cron (cron/regFeeExpiry.js) only flips PAID -> EXPIRED
      // for rows that are already PAID at the time it runs, so writing 'PAID'
      // unconditionally here would leave an already-lapsed membership stuck
      // showing as PAID (with a buggy "expires today" display) until the next
      // midnight tick. Compute the correct terminal status up front instead.
      const expiresAt = new Date(data.reg_fee_paid_date);
      expiresAt.setDate(expiresAt.getDate() + 365);
      const alreadyExpired = expiresAt <= new Date();

      await client.query(
        `UPDATE client_profiles
         SET reg_fee_status = $1, reg_fee_amount = $2, reg_fee_paid_at = $3,
             reg_fee_expires_at = $3::timestamptz + INTERVAL '365 days', is_registration_fee_paid = $4
         WHERE client_profile_id = $5`,
        [alreadyExpired ? 'EXPIRED' : 'PAID', data.reg_fee_amount, data.reg_fee_paid_date, !alreadyExpired, clientId]
      );

      if (salespersonId) {
        await creditSalespersonForRegistration(client, {
          client_id: clientId,
          salesperson_id: salespersonId,
          assigned_by: assignedBy.user_id,
        });
      }
    }

    if (data.legacy_overdue_balance) {
      await client.query(
        `INSERT INTO transactions (client_id, booking_id, category, transaction_type, amount, status, notes, created_at)
         VALUES ($1, NULL, 'SERVICE_INVOICE', 'DEBIT', $2, 'COMPLETED', 'LEGACY_IMPORT: opening balance carried over from migration', NOW())`,
        [clientId, data.legacy_overdue_balance]
      );
      await client.query(
        `UPDATE client_profiles SET legacy_opening_balance = $1 WHERE client_profile_id = $2`,
        [data.legacy_overdue_balance, clientId]
      );
    }

    await client.query('COMMIT');
    return { client_profile_id: clientId, mobile_number: data.mobile_number };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function commitPatientRow(data, clientId) {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const res = await client.query(
      `INSERT INTO patient_profiles (
         client_id, full_name, age, relationship_to_client, medical_condition,
         residential_address, emergency_contact_name, emergency_contact_number, gender,
         is_registration_fee_paid
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, false)
       RETURNING patient_id`,
      [clientId, data.full_name, data.age, data.relationship_to_client, data.medical_condition,
        data.residential_address, data.emergency_contact_name, data.emergency_contact_number, data.gender]
    );
    await client.query('COMMIT');
    return { patient_id: res.rows[0].patient_id };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// Adds one more staff member to an already-imported SHIFT_BASED booking's
// shift slot (a "same booking_ref" row). Does not touch bookings/transactions
// — those were already created by the primary row for this booking_ref.
async function commitAdditionalStaffAssignmentRow(data, targetBookingId, shiftSlotId, staffId, assignedBy, serviceStartDate, bookingAmountPaid) {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    const existing = await client.query(
      `SELECT 1 FROM booking_staff_assignments WHERE shift_slot_id = $1 AND status = 'ACTIVE'`,
      [shiftSlotId]
    );
    if (existing.rows.length > 0) {
      throw new Error(`shift_number ${data.shift_number} for booking_ref ${data.booking_ref} already has an active staff assignment`);
    }

    if (await findConflictingAssignment(client, staffId, serviceStartDate, targetBookingId)) {
      throw new Error(`assigned_staff_mobile_number for shift_number ${data.shift_number} is already committed to another active booking over this date range`);
    }

    // The slot was created with a placeholder time copied from the primary
    // row when the booking was first inserted — correct it now that this
    // shift's own time is known, and drop the "needs review" label.
    if (data.shift_start_time || data.shift_duration_hours) {
      await client.query(
        `UPDATE booking_shift_slots
         SET start_time = COALESCE($1, start_time),
             duration_hours = COALESCE($2, duration_hours),
             label = NULL
         WHERE shift_slot_id = $3`,
        [data.shift_start_time, data.shift_duration_hours, shiftSlotId]
      );
    }

    await client.query(
      `INSERT INTO booking_staff_assignments (
         booking_id, staff_profile_id, assigned_on, assigned_by, daily_rate,
         service_start_date, amount_allocated, status, shift_slot_id, notes
       ) VALUES ($1, $2, NOW(), $3, $4, $5, $6, 'ACTIVE', $7, 'LEGACY_IMPORT: migrated assignment (additional shift)')`,
      [targetBookingId, staffId, assignedBy?.user_id || null, data.staff_daily_rate, serviceStartDate, bookingAmountPaid || null, shiftSlotId]
    );

    await client.query(
      `UPDATE staff_profiles SET current_status = 'ASSIGNED' WHERE staff_profile_id = $1`,
      [staffId]
    );

    await client.query('COMMIT');
    return { booking_id: targetBookingId };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function commitBookingRow(data, clientId, patientId, staffId, assignedBy) {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    const amountQuotated = data.amount_paid + data.amount_outstanding;
    const serviceStartDate = data.start_date || new Date().toISOString().slice(0, 10);

    if (staffId && await findConflictingAssignment(client, staffId, serviceStartDate)) {
      throw new Error('assigned_staff_mobile_number is already committed to another active booking over this date range');
    }

    // client_daily_rate is always required now (see normalizeBookingRow), so every
    // imported booking gets a backfilled quote — both so the client is billed at the
    // correct rate going forward instead of the staff's own pay rate (no margin), and
    // so a booking imported without staff still has a rate to assign staff against later.
    let requestId = null;
    let quoteId = null;
    if (data.client_daily_rate) {
      const backfilled = await createBackfilledQuoteForBooking(client, {
        clientId,
        patientFullName: data.patient_full_name,
        serviceType: data.service_type,
        serviceModel: data.service_model,
        startDate: data.start_date,
        clientDailyRate: data.client_daily_rate,
        totalContractAmount: amountQuotated,
      });
      requestId = backfilled.requestId;
      quoteId = backfilled.quoteId;
    }

    const isShiftBased = data.service_model === 'SHIFT_BASED';
    // ot_rate has no sheet column — default to 500, matching assignStaffToBooking's
    // own fallback when an admin doesn't specify one via the real assign-staff form.
    const bookingRes = await client.query(
      `INSERT INTO bookings (
         client_id, patient_id, service_type, service_model, start_date, assigned_staff_id,
         status, amount_quotated, amount_paid, request_id, daily_rate, shift_rate, ot_rate
       ) VALUES ($1, $2, $3, $4::service_model_enum, $5, $6, 'ACTIVE', $7, $8, $9, $10, $11, 500)
       RETURNING booking_id`,
      [
        clientId, patientId, data.service_type, data.service_model, data.start_date, staffId,
        amountQuotated, data.amount_paid, requestId,
        isShiftBased ? null : data.client_daily_rate,
        isShiftBased ? data.client_daily_rate : null,
      ]
    );
    const bookingId = bookingRes.rows[0].booking_id;

    if (quoteId) {
      await client.query(`UPDATE quotations SET booking_id = $1 WHERE quote_id = $2`, [bookingId, quoteId]);
    }

    // Only the amount already owed as of the migration cutover (amount_outstanding)
    // is invoiced here — NOT the full contract value (amountQuotated). The nightly
    // cron (LIVE_IN) / manual attendance flows (SHIFT_BASED/VISITING) invoice
    // day-by-day exactly like any other booking, starting from today; pre-invoicing
    // the whole contract here would double-bill the client as those future days are
    // delivered and invoiced for real. amountQuotated is still recorded on
    // bookings.amount_quotated and the backfilled quote's total_amount purely as a
    // reference total — see getClientOverdueBreakdown, which nets it against paid to
    // reconstruct amount_outstanding for the client-level overdue summary.
    if (data.amount_outstanding > 0) {
      await client.query(
        `INSERT INTO transactions (client_id, booking_id, category, transaction_type, amount, status, notes, created_at)
         VALUES ($1, $2, 'SERVICE_INVOICE', 'DEBIT', $3, 'COMPLETED', 'LEGACY_IMPORT: opening balance already owed as of migration', NOW())`,
        [clientId, bookingId, data.amount_outstanding]
      );
    }

    if (data.amount_paid > 0) {
      await client.query(
        `INSERT INTO booking_payment_tracking (
           booking_id, client_id, amount_received, payment_method, notes, status, verified_at
         ) VALUES ($1, $2, $3, 'LEGACY_IMPORT', 'Migrated legacy payment', 'VERIFIED', NOW())`,
        [bookingId, clientId, data.amount_paid]
      );

      await client.query(
        `INSERT INTO transactions (client_id, booking_id, category, transaction_type, amount, payment_method, status, notes, created_at)
         VALUES ($1, $2, 'BOOKING_PAYMENT', 'CREDIT', $3, 'LEGACY_IMPORT', 'COMPLETED', 'LEGACY_IMPORT: migrated booking payment', NOW())`,
        [clientId, bookingId, data.amount_paid]
      );
    }

    // SHIFT_BASED billing/attendance is driven entirely by booking_shift_patterns
    // + booking_shift_slots (recurring shift definitions, not per-date rows) —
    // the nightly cron ignores this service model completely. Create the
    // pattern/slots whenever the sheet describes one, independent of whether a
    // staff member is assigned yet, so the recurring schedule exists for an
    // admin to staff (fully or the remaining shifts) later.
    let firstSlotId = null;
    if (isShiftBased && data.shift_start_time && data.shift_duration_hours) {
      const patternRes = await client.query(
        `INSERT INTO booking_shift_patterns (booking_id, shift_count, effective_from_date, status, created_by, notes)
         VALUES ($1, $2, $3, 'ACTIVE', $4, 'LEGACY_IMPORT: migrated shift pattern')
         RETURNING pattern_id`,
        [bookingId, data.shift_count, serviceStartDate, assignedBy?.user_id || null]
      );
      const patternId = patternRes.rows[0].pattern_id;

      for (let shiftNumber = 1; shiftNumber <= data.shift_count; shiftNumber++) {
        const slotRes = await client.query(
          `INSERT INTO booking_shift_slots (pattern_id, shift_number, start_time, duration_hours, label)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING shift_slot_id`,
          [
            patternId, shiftNumber,
            data.shift_start_time,
            data.shift_duration_hours,
            shiftNumber === 1 ? null : `Shift ${shiftNumber} (needs review)`,
          ]
        );
        if (shiftNumber === 1) firstSlotId = slotRes.rows[0].shift_slot_id;
      }
    }

    if (staffId) {
      // bookings.assigned_staff_id (set above) is only a denormalized mirror —
      // booking_staff_assignments is the real source of truth read by the
      // staff's own dashboard/active-assignment views and by the nightly
      // daily-invoicing cron that accrues future earnings. Mirrors the real
      // assignment flow in staffAssignmentController.assignStaffToBooking
      // (plus shiftPatternController's slot-assignment shape for SHIFT_BASED).
      await client.query(
        `INSERT INTO booking_staff_assignments (
           booking_id, staff_profile_id, assigned_on, assigned_by, daily_rate,
           service_start_date, amount_allocated, status, shift_slot_id, notes
         ) VALUES ($1, $2, NOW(), $3, $4, $5, $6, 'ACTIVE', $7, 'LEGACY_IMPORT: migrated assignment')`,
        [bookingId, staffId, assignedBy?.user_id || null, data.staff_daily_rate, serviceStartDate, data.amount_paid || null, firstSlotId]
      );

      await client.query(
        `UPDATE staff_profiles SET current_status = 'ASSIGNED' WHERE staff_profile_id = $1`,
        [staffId]
      );
    }

    await client.query('COMMIT');
    return { booking_id: bookingId };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

exports.commitImport = async (req, res) => {
  if (!req.file) return res.status(400).json({ status: 'error', message: 'No file uploaded' });

  let sheets;
  try {
    sheets = parseWorkbook(req.file.buffer);
  } catch (err) {
    return res.status(400).json({ status: 'error', message: `Could not read spreadsheet: ${err.message}` });
  }

  const batchRes = await db.query(
    `INSERT INTO import_batches (uploaded_by, original_filename) VALUES ($1, $2) RETURNING import_batch_id`,
    [req.user?.user_id || null, req.file.originalname || null]
  );
  const importBatchId = batchRes.rows[0].import_batch_id;
  const assignedBy = { user_id: req.user?.user_id || null, import_batch_id: importBatchId };

  const results = { staff: [], clients: [], patients: [], bookings: [] };
  const staffIdByMobile = new Map();
  const clientIdByMobile = new Map();
  const patientIdByKey = new Map(); // `${client_mobile}::${full_name_lower}`

  for (let i = 0; i < sheets.staff.length; i++) {
    const rowNumber = i + 2;
    const { errors, data } = normalizeStaffRow(sheets.staff[i]);
    if (errors.length) {
      results.staff.push({ row_number: rowNumber, status: 'error', message: errors.join('; ') });
      continue;
    }
    try {
      const created = await commitStaffRow(data, assignedBy);
      staffIdByMobile.set(data.mobile_number, created.staff_profile_id);
      results.staff.push({ row_number: rowNumber, status: 'created', staff_profile_id: created.staff_profile_id });
    } catch (err) {
      results.staff.push({ row_number: rowNumber, status: 'error', message: err.message });
    }
  }

  for (let i = 0; i < sheets.clients.length; i++) {
    const rowNumber = i + 2;
    const { errors, data } = normalizeClientRow(sheets.clients[i]);
    if (errors.length) {
      results.clients.push({ row_number: rowNumber, status: 'error', message: errors.join('; ') });
      continue;
    }
    try {
      const created = await commitClientRow(data, assignedBy);
      clientIdByMobile.set(data.mobile_number, created.client_profile_id);
      results.clients.push({ row_number: rowNumber, status: 'created', client_profile_id: created.client_profile_id });
    } catch (err) {
      results.clients.push({ row_number: rowNumber, status: 'error', message: err.message });
    }
  }

  for (let i = 0; i < sheets.patients.length; i++) {
    const rowNumber = i + 2;
    const { errors, data } = normalizeCareProfileRow(sheets.patients[i]);
    if (errors.length) {
      results.patients.push({ row_number: rowNumber, status: 'error', message: errors.join('; ') });
      continue;
    }
    try {
      const clientId = clientIdByMobile.get(data.client_mobile_number) || await findClientIdByMobile(db, data.client_mobile_number);
      if (!clientId) throw new Error(`client_mobile_number ${data.client_mobile_number} not found`);
      const created = await commitPatientRow(data, clientId);
      patientIdByKey.set(`${data.client_mobile_number}::${data.full_name.toLowerCase()}`, created.patient_id);
      results.patients.push({ row_number: rowNumber, status: 'created', patient_id: created.patient_id });
    } catch (err) {
      results.patients.push({ row_number: rowNumber, status: 'error', message: err.message });
    }
  }

  const bookingAdditionalStaffFlags = computeAdditionalStaffFlags(sheets.bookings);
  const bookingRefMap = new Map(); // booking_ref -> { booking_id, pattern_id, shift_count, client_mobile_number, patient_full_name }

  for (let i = 0; i < sheets.bookings.length; i++) {
    const rowNumber = i + 2;
    const isAdditionalStaffRow = bookingAdditionalStaffFlags[i];
    const { errors, data } = normalizeBookingRow(sheets.bookings[i], { isAdditionalStaffRow });
    if (errors.length) {
      results.bookings.push({ row_number: rowNumber, status: 'error', message: errors.join('; ') });
      continue;
    }

    if (isAdditionalStaffRow) {
      try {
        const primary = bookingRefMap.get(data.booking_ref);
        if (!primary) throw new Error(`booking_ref ${data.booking_ref} does not match any earlier row in this sheet`);
        if (primary.client_mobile_number !== data.client_mobile_number || primary.patient_full_name.toLowerCase() !== data.patient_full_name.toLowerCase()) {
          throw new Error(`booking_ref ${data.booking_ref} refers to a different client/patient than its first row`);
        }
        if (!primary.pattern_id) {
          throw new Error(`booking_ref ${data.booking_ref}'s booking is not SHIFT_BASED — additional staff rows are only supported for SHIFT_BASED bookings`);
        }
        if (data.shift_number < 1 || data.shift_number > primary.shift_count) {
          throw new Error(`shift_number ${data.shift_number} is out of range for booking_ref ${data.booking_ref} (this booking has ${primary.shift_count} shift(s))`);
        }

        const staffId = staffIdByMobile.get(data.assigned_staff_mobile_number) || await findStaffIdByMobile(db, data.assigned_staff_mobile_number);
        if (!staffId) throw new Error(`assigned_staff_mobile_number ${data.assigned_staff_mobile_number} not found`);

        const slotRes = await db.query(
          `SELECT shift_slot_id FROM booking_shift_slots WHERE pattern_id = $1 AND shift_number = $2`,
          [primary.pattern_id, data.shift_number]
        );
        if (!slotRes.rows[0]) throw new Error(`shift_number ${data.shift_number} slot not found for booking_ref ${data.booking_ref}`);

        await commitAdditionalStaffAssignmentRow(data, primary.booking_id, slotRes.rows[0].shift_slot_id, staffId, assignedBy, primary.start_date, primary.amount_paid);
        results.bookings.push({ row_number: rowNumber, status: 'created', booking_id: primary.booking_id, message: `Staff added to shift ${data.shift_number}` });
      } catch (err) {
        results.bookings.push({ row_number: rowNumber, status: 'error', message: err.message });
      }
      continue;
    }

    try {
      const clientId = clientIdByMobile.get(data.client_mobile_number) || await findClientIdByMobile(db, data.client_mobile_number);
      if (!clientId) throw new Error(`client_mobile_number ${data.client_mobile_number} not found`);

      const patientKey = `${data.client_mobile_number}::${data.patient_full_name.toLowerCase()}`;
      const patientId = patientIdByKey.get(patientKey) || await findPatientIdByClientAndName(db, clientId, data.patient_full_name);
      if (!patientId) throw new Error(`patient_full_name "${data.patient_full_name}" not found for this client`);

      let staffId = null;
      if (data.assigned_staff_mobile_number) {
        staffId = staffIdByMobile.get(data.assigned_staff_mobile_number) || await findStaffIdByMobile(db, data.assigned_staff_mobile_number);
        if (!staffId) throw new Error(`assigned_staff_mobile_number ${data.assigned_staff_mobile_number} not found`);
      }

      const created = await commitBookingRow(data, clientId, patientId, staffId, assignedBy);

      if (data.booking_ref) {
        let patternId = null;
        if (data.service_model === 'SHIFT_BASED') {
          const patRes = await db.query(`SELECT pattern_id FROM booking_shift_patterns WHERE booking_id = $1`, [created.booking_id]);
          patternId = patRes.rows[0]?.pattern_id || null;
        }
        bookingRefMap.set(data.booking_ref, {
          booking_id: created.booking_id, pattern_id: patternId, shift_count: data.shift_count,
          client_mobile_number: data.client_mobile_number, patient_full_name: data.patient_full_name,
          amount_paid: data.amount_paid,
          start_date: data.start_date || new Date().toISOString().slice(0, 10),
        });
      }

      results.bookings.push({ row_number: rowNumber, status: 'created', booking_id: created.booking_id });
    } catch (err) {
      results.bookings.push({ row_number: rowNumber, status: 'error', message: err.message });
    }
  }

  await db.query(`UPDATE import_batches SET row_summary = $1 WHERE import_batch_id = $2`,
    [JSON.stringify(results), importBatchId]);

  const countCreated = (rows) => rows.filter(r => r.status === 'created').length;
  logActivity({
    actorUserId: req.user?.user_id,
    actorRole: req.user?.role,
    actionType: 'BULK_IMPORT_COMMITTED',
    entityType: 'BULK_IMPORT',
    entityId: String(importBatchId),
    details: {
      original_filename: req.file.originalname || null,
      staff_created: countCreated(results.staff),
      clients_created: countCreated(results.clients),
      patients_created: countCreated(results.patients),
      bookings_created: countCreated(results.bookings),
    },
  }).catch(err => console.error('Activity log failed:', err));

  res.status(200).json({ status: 'success', data: { import_batch_id: importBatchId, results } });
};

exports.getBatch = async (req, res) => {
  const { id } = req.params;
  try {
    const result = await db.query(`SELECT * FROM import_batches WHERE import_batch_id = $1`, [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Import batch not found' });
    }
    res.status(200).json({ status: 'success', data: result.rows[0] });
  } catch (err) {
    console.error('getBatch error:', err);
    res.status(500).json({ status: 'error', message: 'Failed to fetch import batch' });
  }
};

exports.listBatches = async (req, res) => {
  try {
    const result = await db.query(
      `SELECT import_batch_id, uploaded_by, original_filename, created_at FROM import_batches ORDER BY created_at DESC LIMIT 50`
    );
    res.status(200).json({ status: 'success', data: result.rows });
  } catch (err) {
    console.error('listBatches error:', err);
    res.status(500).json({ status: 'error', message: 'Failed to list import batches' });
  }
};

// ─── Template download ───────────────────────────────────────────────────────

exports.downloadTemplate = (req, res) => {
  const workbook = XLSX.utils.book_new();

  const staffSheet = XLSX.utils.aoa_to_sheet([
    ['mobile_number', 'full_name', 'designation', 'gender', 'date_of_birth', 'nic_number', 'role', 'staff_code', 'experience_level', 'admin_remarks', 'current_earnings_opening', 'recruiter_email'],
    ['0771234567', 'Jane Silva', 'Senior Caregiver', 'FEMALE', '1990-05-12', '901234567V', 'NURSE', 'EMP-5001', '5 years', '', '15000', 'recruiter@example.com'],
  ]);
  XLSX.utils.book_append_sheet(workbook, staffSheet, SHEET_NAMES.staff);

  const clientsSheet = XLSX.utils.aoa_to_sheet([
    ['mobile_number', 'full_name', 'honorific', 'gender', 'email', 'primary_address', 'client_type', 'company_name', 'wallet_balance_opening', 'reg_fee_paid', 'reg_fee_amount', 'reg_fee_paid_date', 'salesperson_email', 'legacy_overdue_balance'],
    ['0712345678', 'Perera', 'Mr.', 'MALE', '', 'Colombo 5', 'INDIVIDUAL', '', '5000', 'Y', '10000', '2025-01-15', 'sales@example.com', '2000'],
  ]);
  XLSX.utils.book_append_sheet(workbook, clientsSheet, SHEET_NAMES.clients);

  const patientsSheet = XLSX.utils.aoa_to_sheet([
    ['client_mobile_number', 'full_name', 'age', 'gender', 'relationship_to_client', 'medical_condition', 'residential_address', 'emergency_contact_name', 'emergency_contact_number'],
    ['0712345678', 'Mr. Sunil', '78', 'MALE', 'Father', 'Diabetes', 'Colombo 5', "Sunil's wife", '0719876543'],
  ]);
  XLSX.utils.book_append_sheet(workbook, patientsSheet, SHEET_NAMES.patients);

  const bookingsSheet = XLSX.utils.aoa_to_sheet([
    ['client_mobile_number', 'patient_full_name', 'assigned_staff_mobile_number', 'staff_daily_rate', 'client_daily_rate', 'service_type', 'service_model', 'start_date', 'amount_paid', 'amount_outstanding', 'shift_count', 'shift_start_time', 'shift_duration_hours', 'booking_ref', 'shift_number'],
    ['0712345678', 'Mr. Sunil', '0771234567', '3500', '5000', 'Live-in nursing care', 'LIVE_IN', '2025-06-01', '30000', '5000', '', '', '', '', ''],
    // Two staff on one SHIFT_BASED booking: same booking_ref links both rows to
    // the same booking. The first row (shift_number 1) creates the booking —
    // client_daily_rate/service_type/etc apply only to this row. The second
    // row only needs booking_ref, assigned_staff_mobile_number, staff_daily_rate
    // and shift_number — every other column is ignored on it.
    ['0712345678', 'Mrs. Kumari', '0771234568', '2000', '3000', 'Overnight shift care', 'SHIFT_BASED', '2025-06-01', '14000', '2000', '2', '20:00', '12', 'BK1', '1'],
    ['0712345678', 'Mrs. Kumari', '0771234569', '1800', '', '', '', '', '', '', '', '', '', 'BK1', '2'],
  ]);
  XLSX.utils.book_append_sheet(workbook, bookingsSheet, SHEET_NAMES.bookings);

  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="vcare_bulk_import_template.xlsx"');
  res.send(buffer);
};
