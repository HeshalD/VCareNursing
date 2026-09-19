const db = require('../config/db');
const { logActivity } = require('../utils/activityLogger');
const { generateAndUploadInternalSalaryPdf } = require('../utils/internalSalaryPdf');
const { sendInternalStaffSalarySheet } = require('../utils/metaWhatsapp');

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

const EPF_EMPLOYEE_RATE = 0.08;
const EPF_EMPLOYER_RATE = 0.12;
const ETF_EMPLOYER_RATE = 0.03;

const monthLabel = (month) => {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
};

const monthRange = (month) => {
  const [y, m] = month.split('-').map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 1));
  return { start: start.toISOString(), end: end.toISOString() };
};

// ── Presets ──────────────────────────────────────────────────────────────

exports.listPresets = async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, name, type, is_active, created_at FROM internal_staff_salary_presets
       ORDER BY type, name`
    );
    res.json({ presets: result.rows });
  } catch (err) {
    console.error('internalStaffSalary.listPresets error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.createPreset = async (req, res) => {
  const { name, type } = req.body;
  if (!name?.trim() || !['ALLOWANCE', 'DEDUCTION'].includes(type)) {
    return res.status(400).json({ message: 'name and type (ALLOWANCE|DEDUCTION) are required' });
  }
  try {
    const result = await db.query(
      `INSERT INTO internal_staff_salary_presets (name, type) VALUES ($1, $2) RETURNING id, name, type, is_active, created_at`,
      [name.trim(), type]
    );
    res.status(201).json({ preset: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ message: 'A preset with this name already exists for this type' });
    }
    console.error('internalStaffSalary.createPreset error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.updatePreset = async (req, res) => {
  const { id } = req.params;
  const { name, is_active } = req.body;
  const setClauses = [];
  const values = [];
  let idx = 1;
  if (name !== undefined) { setClauses.push(`name = $${idx++}`); values.push(name.trim()); }
  if (is_active !== undefined) { setClauses.push(`is_active = $${idx++}`); values.push(!!is_active); }
  if (setClauses.length === 0) {
    return res.status(400).json({ message: 'No fields to update' });
  }
  values.push(id);
  try {
    const result = await db.query(
      `UPDATE internal_staff_salary_presets SET ${setClauses.join(', ')} WHERE id = $${idx} RETURNING id, name, type, is_active, created_at`,
      values
    );
    if (!result.rows.length) return res.status(404).json({ message: 'Preset not found' });
    res.json({ preset: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ message: 'A preset with this name already exists for this type' });
    }
    console.error('internalStaffSalary.updatePreset error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// Presets are never hard-deleted (line items may reference them by id for
// audit trail) — "delete" from the UI just deactivates.
exports.deactivatePreset = async (req, res) => {
  const { id } = req.params;
  try {
    const result = await db.query(
      `UPDATE internal_staff_salary_presets SET is_active = false WHERE id = $1 RETURNING id`,
      [id]
    );
    if (!result.rows.length) return res.status(404).json({ message: 'Preset not found' });
    res.json({ message: 'Preset deactivated' });
  } catch (err) {
    console.error('internalStaffSalary.deactivatePreset error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// ── Company-wide sheet list (module list page) ───────────────────────────

exports.listSheets = async (req, res) => {
  const { status, search } = req.query;
  const clauses = [];
  const values = [];
  let idx = 1;

  if (status && status !== 'All') {
    clauses.push(`sh.status = $${idx++}`);
    values.push(status);
  }
  if (search) {
    clauses.push(`s.full_name ILIKE $${idx++}`);
    values.push(`%${search}%`);
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

  try {
    const result = await db.query(
      `SELECT sh.id, sh.month, sh.status, sh.net_payable, sh.finalized_at, sh.created_at,
              s.id AS staff_id, s.full_name AS staff_name, s.role AS staff_role
       FROM internal_staff_salary_sheets sh
       JOIN internal_staff s ON s.id = sh.staff_id
       ${where}
       ORDER BY sh.month DESC, s.full_name`,
      values
    );
    res.json({ sheets: result.rows });
  } catch (err) {
    console.error('internalStaffSalary.listSheets error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// ── Staff profile (details + sheet history) ─────────────────────────────

exports.getStaffProfile = async (req, res) => {
  const { staffId } = req.params;
  try {
    const staffRes = await db.query(
      `SELECT id, full_name, role, email, phone, base_salary, joined_date, status,
              epf_applicable, etf_applicable, total_sales_amount, bookings_brought_count,
              registrations_brought_count, registrations_total_amount
       FROM internal_staff WHERE id = $1`,
      [staffId]
    );
    if (!staffRes.rows.length) return res.status(404).json({ message: 'Staff member not found' });

    const sheetsRes = await db.query(
      `SELECT id, month, status, gross_earnings, total_deductions, net_payable, pdf_url, finalized_at, created_at
       FROM internal_staff_salary_sheets WHERE staff_id = $1 ORDER BY month DESC`,
      [staffId]
    );

    res.json({ staff: staffRes.rows[0], sheets: sheetsRes.rows });
  } catch (err) {
    console.error('internalStaffSalary.getStaffProfile error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// ── Sales attribution (read-only, feeds the commission section) ─────────

exports.getSalesAttribution = async (req, res) => {
  const { staffId } = req.params;
  const { month } = req.query;
  if (!month || !MONTH_RE.test(month)) {
    return res.status(400).json({ message: 'month is required in YYYY-MM format' });
  }
  const { start, end } = monthRange(month);
  try {
    const registrations = await db.query(
      `SELECT csa.id, csa.client_id, cp.full_name AS client_name,
              csa.credited_amount, csa.commission_amount, csa.assigned_at
       FROM client_salesperson_assignments csa
       JOIN client_profiles cp ON csa.client_id = cp.client_profile_id
       WHERE csa.salesperson_id = $1 AND csa.is_current = true
         AND csa.assigned_at >= $2 AND csa.assigned_at < $3
       ORDER BY csa.assigned_at DESC`,
      [staffId, start, end]
    );

    const bookings = await db.query(
      `SELECT bsa.id, bsa.booking_id, b.booking_code, cp.full_name AS client_name,
              bsa.credited_amount, bsa.assigned_at
       FROM booking_salesperson_assignments bsa
       JOIN bookings b ON bsa.booking_id = b.booking_id
       LEFT JOIN client_profiles cp ON b.client_id = cp.client_profile_id
       WHERE bsa.salesperson_id = $1 AND bsa.is_current = true
         AND bsa.assigned_at >= $2 AND bsa.assigned_at < $3
       ORDER BY bsa.assigned_at DESC`,
      [staffId, start, end]
    );

    res.json({
      registrations: registrations.rows.map((r) => ({
        ...r,
        credited_amount: parseFloat(r.credited_amount || 0),
        commission_amount: parseFloat(r.commission_amount || 0),
      })),
      bookings: bookings.rows.map((r) => ({ ...r, credited_amount: parseFloat(r.credited_amount || 0) })),
    });
  } catch (err) {
    console.error('internalStaffSalary.getSalesAttribution error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// Admin sets how much commission an internal staff member personally earns
// for one specific registration they brought in — separate from
// credited_amount (the client's registration fee, used for company sales
// reporting only). Always available, regardless of role, so any internal
// staff member's registrations can be individually commissioned.
exports.updateRegistrationCommission = async (req, res) => {
  const { assignmentId } = req.params;
  const { amount } = req.body;
  if (amount === undefined || amount === null || isNaN(parseFloat(amount)) || parseFloat(amount) < 0) {
    return res.status(400).json({ message: 'amount must be a non-negative number' });
  }
  const amt = round2(amount);
  try {
    const result = await db.query(
      `UPDATE client_salesperson_assignments SET commission_amount = $1 WHERE id = $2
       RETURNING id, client_id, salesperson_id, commission_amount`,
      [amt, assignmentId]
    );
    if (!result.rows.length) return res.status(404).json({ message: 'Registration assignment not found' });
    res.json({ assignment: { ...result.rows[0], commission_amount: parseFloat(result.rows[0].commission_amount) } });
  } catch (err) {
    console.error('internalStaffSalary.updateRegistrationCommission error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// ── Sheet builder ─────────────────────────────────────────────────────────

// Recomputes gross/deductions/net from line items + statutory + commission +
// performance allowance + advances. Server-authoritative — never trusts
// client-submitted totals.
function computeTotals({
  basicSalary, epfEmployeeApplicable, etfEmployerApplicable, commissionAmount,
  lineItems, performanceAllowanceAmount = 0, advancesDeducted = 0,
}) {
  const allowancesTotal = lineItems.filter((i) => i.item_type === 'ALLOWANCE').reduce((s, i) => s + parseFloat(i.amount || 0), 0);
  const deductionsTotal = lineItems.filter((i) => i.item_type === 'DEDUCTION').reduce((s, i) => s + parseFloat(i.amount || 0), 0);

  const epfEmployeeAmount = epfEmployeeApplicable ? round2(basicSalary * EPF_EMPLOYEE_RATE) : 0;
  const epfEmployerAmount = epfEmployeeApplicable ? round2(basicSalary * EPF_EMPLOYER_RATE) : 0;
  const etfEmployerAmount = etfEmployerApplicable ? round2(basicSalary * ETF_EMPLOYER_RATE) : 0;

  const grossEarnings = round2(basicSalary + allowancesTotal + parseFloat(commissionAmount || 0) + parseFloat(performanceAllowanceAmount || 0));
  const totalDeductions = round2(deductionsTotal + epfEmployeeAmount + parseFloat(advancesDeducted || 0));
  const netPayable = round2(grossEarnings - totalDeductions);

  return { epfEmployeeAmount, epfEmployerAmount, etfEmployerAmount, grossEarnings, totalDeductions, netPayable };
}

// Sum of this staff member's registrations for `month` (same query shape as
// getSalesAttribution below, count-only).
async function countRegistrations(client, staffId, month) {
  const { start, end } = monthRange(month);
  const res = await client.query(
    `SELECT COUNT(*)::int AS count FROM client_salesperson_assignments
     WHERE salesperson_id = $1 AND is_current = true AND assigned_at >= $2 AND assigned_at < $3`,
    [staffId, start, end]
  );
  return res.rows[0].count;
}

// Sum of unsettled advances for this staff+month (not yet pulled into a
// finalized sheet).
async function sumUnsettledAdvances(client, staffId, month) {
  const res = await client.query(
    `SELECT COALESCE(SUM(amount), 0) AS total FROM internal_staff_advances
     WHERE staff_id = $1 AND month = $2 AND settled_sheet_id IS NULL`,
    [staffId, month]
  );
  return round2(res.rows[0].total);
}

// Sum of admin-set per-registration commissions for this staff+month (see
// updateRegistrationCommission — separate from credited_amount).
async function sumRegistrationCommissions(client, staffId, month) {
  const { start, end } = monthRange(month);
  const res = await client.query(
    `SELECT COALESCE(SUM(commission_amount), 0) AS total FROM client_salesperson_assignments
     WHERE salesperson_id = $1 AND is_current = true AND assigned_at >= $2 AND assigned_at < $3`,
    [staffId, start, end]
  );
  return round2(res.rows[0].total);
}

// Resolves the performance allowance amount for a staff+month, given a mode:
//  - GOAL: the reward of the first ACTIVE goal for that month whose target is met
//  - PER_REGISTRATION: sum of the admin-set commission_amount on each of this
//    staff member's registrations that month (see updateRegistrationCommission)
//  - TIER: legacy range-based reward (kept for backward compatibility, no
//    longer offered as a choice in the builder UI)
//  - NONE: 0
// Always recomputed server-side — never trusts a client-submitted amount.
async function resolvePerformanceAllowance(client, staffId, month, mode) {
  if (mode === 'BOTH') {
    const [goalAmt, perRegAmt] = await Promise.all([
      resolvePerformanceAllowance(client, staffId, month, 'GOAL'),
      resolvePerformanceAllowance(client, staffId, month, 'PER_REGISTRATION'),
    ]);
    return round2(goalAmt + perRegAmt);
  }
  if (mode === 'PER_REGISTRATION') {
    return sumRegistrationCommissions(client, staffId, month);
  }
  if (mode !== 'GOAL' && mode !== 'TIER') return 0;
  const registrationCount = await countRegistrations(client, staffId, month);

  if (mode === 'GOAL') {
    const goalRes = await client.query(
      `SELECT id, target_count, reward_amount FROM internal_staff_goals
       WHERE staff_id = $1 AND status = 'ACTIVE' AND goal_type = 'REGISTRATION_COUNT'
         AND (month = $2 OR month IS NULL)
       ORDER BY month NULLS LAST LIMIT 1`,
      [staffId, month]
    );
    if (!goalRes.rows.length) return 0;
    const goal = goalRes.rows[0];
    return registrationCount >= goal.target_count ? round2(goal.reward_amount) : 0;
  }

  const tierRes = await client.query(
    `SELECT reward_amount FROM internal_staff_performance_tiers
     WHERE is_active = true AND min_count <= $1 AND (max_count IS NULL OR max_count >= $1)
     ORDER BY min_count DESC LIMIT 1`,
    [registrationCount]
  );
  return tierRes.rows.length ? round2(tierRes.rows[0].reward_amount) : 0;
}

function round2(n) {
  return Math.round((parseFloat(n) || 0) * 100) / 100;
}

async function fetchSheetWithItems(client, sheetId) {
  const sheetRes = await client.query(
    `SELECT sh.*, s.full_name AS staff_name, s.role AS staff_role, s.email AS staff_email, s.phone AS staff_phone
     FROM internal_staff_salary_sheets sh
     JOIN internal_staff s ON s.id = sh.staff_id
     WHERE sh.id = $1`,
    [sheetId]
  );
  if (!sheetRes.rows.length) return null;
  const itemsRes = await client.query(
    `SELECT id, item_type, preset_id, label, amount FROM internal_staff_salary_line_items WHERE sheet_id = $1 ORDER BY id`,
    [sheetId]
  );
  return { ...sheetRes.rows[0], line_items: itemsRes.rows };
}

exports.createDraftSheet = async (req, res) => {
  const { staffId } = req.params;
  const { month } = req.body;
  if (!month || !MONTH_RE.test(month)) {
    return res.status(400).json({ message: 'month is required in YYYY-MM format' });
  }
  try {
    const existing = await db.query(
      `SELECT id FROM internal_staff_salary_sheets WHERE staff_id = $1 AND month = $2`,
      [staffId, month]
    );
    if (existing.rows.length) {
      const sheet = await fetchSheetWithItems(db, existing.rows[0].id);
      return res.json({ sheet });
    }

    const staffRes = await db.query(
      `SELECT full_name, base_salary, epf_applicable, etf_applicable, status FROM internal_staff WHERE id = $1`,
      [staffId]
    );
    if (!staffRes.rows.length) return res.status(404).json({ message: 'Staff member not found' });
    const staff = staffRes.rows[0];

    const basicSalary = parseFloat(staff.base_salary || 0);
    const advancesDeducted = await sumUnsettledAdvances(db, staffId, month);
    const totals = computeTotals({
      basicSalary,
      epfEmployeeApplicable: staff.epf_applicable,
      etfEmployerApplicable: staff.etf_applicable,
      commissionAmount: 0,
      lineItems: [],
      performanceAllowanceAmount: 0,
      advancesDeducted,
    });

    const inserted = await db.query(
      `INSERT INTO internal_staff_salary_sheets
        (staff_id, month, basic_salary, epf_employee_applicable, etf_employer_applicable,
         epf_employee_amount, epf_employer_amount, etf_employer_amount,
         gross_earnings, total_deductions, net_payable, advances_deducted, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING id`,
      [
        staffId, month, basicSalary, staff.epf_applicable, staff.etf_applicable,
        totals.epfEmployeeAmount, totals.epfEmployerAmount, totals.etfEmployerAmount,
        totals.grossEarnings, totals.totalDeductions, totals.netPayable, advancesDeducted, req.user?.user_id,
      ]
    );

    const sheet = await fetchSheetWithItems(db, inserted.rows[0].id);
    res.status(201).json({ sheet });
  } catch (err) {
    console.error('internalStaffSalary.createDraftSheet error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.getSheet = async (req, res) => {
  try {
    const sheet = await fetchSheetWithItems(db, req.params.id);
    if (!sheet) return res.status(404).json({ message: 'Sheet not found' });
    res.json({ sheet });
  } catch (err) {
    console.error('internalStaffSalary.getSheet error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.updateDraftSheet = async (req, res) => {
  const { id } = req.params;
  const { epf_employee_applicable, etf_employer_applicable, commission_amount, line_items, notes, performance_allowance_mode } = req.body;

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    const sheetRes = await client.query(`SELECT * FROM internal_staff_salary_sheets WHERE id = $1 FOR UPDATE`, [id]);
    if (!sheetRes.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Sheet not found' });
    }
    const sheet = sheetRes.rows[0];
    if (sheet.status !== 'DRAFT') {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Only draft sheets can be edited' });
    }

    const epfApplicable = epf_employee_applicable !== undefined ? !!epf_employee_applicable : sheet.epf_employee_applicable;
    const etfApplicable = etf_employer_applicable !== undefined ? !!etf_employer_applicable : sheet.etf_employer_applicable;
    const commissionAmount = commission_amount !== undefined ? parseFloat(commission_amount || 0) : parseFloat(sheet.commission_amount || 0);
    const performanceAllowanceMode = ['NONE', 'GOAL', 'TIER', 'PER_REGISTRATION', 'BOTH'].includes(performance_allowance_mode)
      ? performance_allowance_mode
      : sheet.performance_allowance_mode;
    // Always recomputed server-side from live registration/goal/tier data —
    // never trusts a client-submitted amount (see resolvePerformanceAllowance).
    const performanceAllowanceAmount = await resolvePerformanceAllowance(client, sheet.staff_id, sheet.month, performanceAllowanceMode);
    // Advances are re-pulled every save so a mid-month advance shows up
    // immediately; only unsettled ones (settled_sheet_id IS NULL) count.
    const advancesDeducted = await sumUnsettledAdvances(client, sheet.staff_id, sheet.month);

    let items = null;
    if (Array.isArray(line_items)) {
      items = line_items
        .filter((i) => i && (i.item_type === 'ALLOWANCE' || i.item_type === 'DEDUCTION') && i.label?.trim())
        .map((i) => ({
          item_type: i.item_type,
          preset_id: i.preset_id || null,
          label: i.label.trim(),
          amount: round2(i.amount),
        }));

      await client.query(`DELETE FROM internal_staff_salary_line_items WHERE sheet_id = $1`, [id]);
      for (const item of items) {
        await client.query(
          `INSERT INTO internal_staff_salary_line_items (sheet_id, item_type, preset_id, label, amount)
           VALUES ($1, $2, $3, $4, $5)`,
          [id, item.item_type, item.preset_id, item.label, item.amount]
        );
      }
    } else {
      const existingItems = await client.query(
        `SELECT item_type, amount FROM internal_staff_salary_line_items WHERE sheet_id = $1`,
        [id]
      );
      items = existingItems.rows;
    }

    const totals = computeTotals({
      basicSalary: parseFloat(sheet.basic_salary),
      epfEmployeeApplicable: epfApplicable,
      etfEmployerApplicable: etfApplicable,
      commissionAmount,
      lineItems: items,
      performanceAllowanceAmount,
      advancesDeducted,
    });

    await client.query(
      `UPDATE internal_staff_salary_sheets
       SET epf_employee_applicable = $1, etf_employer_applicable = $2, commission_amount = $3,
           epf_employee_amount = $4, epf_employer_amount = $5, etf_employer_amount = $6,
           gross_earnings = $7, total_deductions = $8, net_payable = $9,
           performance_allowance_mode = $10, performance_allowance_amount = $11, advances_deducted = $12,
           notes = COALESCE($13, notes)
       WHERE id = $14`,
      [
        epfApplicable, etfApplicable, commissionAmount,
        totals.epfEmployeeAmount, totals.epfEmployerAmount, totals.etfEmployerAmount,
        totals.grossEarnings, totals.totalDeductions, totals.netPayable,
        performanceAllowanceMode, performanceAllowanceAmount, advancesDeducted,
        notes !== undefined ? notes : null, id,
      ]
    );

    await client.query('COMMIT');

    const updated = await fetchSheetWithItems(db, id);
    res.json({ sheet: updated });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('internalStaffSalary.updateDraftSheet error:', err);
    res.status(500).json({ message: 'Internal server error' });
  } finally {
    client.release();
  }
};

exports.previewSheet = async (req, res) => {
  try {
    const sheet = await fetchSheetWithItems(db, req.params.id);
    if (!sheet) return res.status(404).json({ message: 'Sheet not found' });
    res.json({ preview: buildPayslipData(sheet) });
  } catch (err) {
    console.error('internalStaffSalary.previewSheet error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

function buildPayslipData(sheet) {
  return {
    staff_name: sheet.staff_name,
    designation: sheet.staff_role,
    month: sheet.month,
    month_label: monthLabel(sheet.month),
    basic_salary: parseFloat(sheet.basic_salary),
    allowances: sheet.line_items.filter((i) => i.item_type === 'ALLOWANCE').map((i) => ({ label: i.label, amount: parseFloat(i.amount) })),
    deductions: sheet.line_items.filter((i) => i.item_type === 'DEDUCTION').map((i) => ({ label: i.label, amount: parseFloat(i.amount) })),
    commission_amount: parseFloat(sheet.commission_amount || 0),
    performance_allowance_mode: sheet.performance_allowance_mode,
    performance_allowance_amount: parseFloat(sheet.performance_allowance_amount || 0),
    advances_deducted: parseFloat(sheet.advances_deducted || 0),
    epf_employee_applicable: sheet.epf_employee_applicable,
    etf_employer_applicable: sheet.etf_employer_applicable,
    epf_employee_amount: parseFloat(sheet.epf_employee_amount || 0),
    epf_employer_amount: parseFloat(sheet.epf_employer_amount || 0),
    etf_employer_amount: parseFloat(sheet.etf_employer_amount || 0),
    gross_earnings: parseFloat(sheet.gross_earnings || 0),
    total_deductions: parseFloat(sheet.total_deductions || 0),
    net_payable: parseFloat(sheet.net_payable || 0),
    pay_date: sheet.finalized_at ? new Date(sheet.finalized_at) : new Date(),
  };
}

exports.finalizeSheet = async (req, res) => {
  const { id } = req.params;
  const client = await db.pool.connect();
  let finalizedSheet = null;
  try {
    await client.query('BEGIN');

    const sheet = await fetchSheetWithItems(client, id);
    if (!sheet) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Sheet not found' });
    }
    if (sheet.status !== 'DRAFT') {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'This sheet has already been finalized' });
    }

    const txnRes = await client.query(
      `INSERT INTO transactions
        (internal_staff_id, category, transaction_type, amount, status, notes,
         is_manual, created_by, verified_by, created_at)
       VALUES ($1, 'INTERNAL_STAFF_SALARY', 'DEBIT', $2, 'COMPLETED', $3, true, $4, $4, NOW())
       RETURNING transaction_id`,
      [
        sheet.staff_id, sheet.net_payable,
        `Internal staff salary — ${sheet.staff_name} — ${monthLabel(sheet.month)}`,
        req.user?.user_id,
      ]
    );
    const transactionId = txnRes.rows[0].transaction_id;

    await client.query(
      `UPDATE internal_staff_salary_sheets
       SET status = 'FINALIZED', transaction_id = $1, finalized_at = NOW()
       WHERE id = $2`,
      [transactionId, id]
    );

    // Lock in the advances that were folded into this sheet's deductions so a
    // later sheet never deducts the same advance twice.
    await client.query(
      `UPDATE internal_staff_advances
       SET status = 'SETTLED', settled_sheet_id = $1
       WHERE staff_id = $2 AND month = $3 AND settled_sheet_id IS NULL`,
      [id, sheet.staff_id, sheet.month]
    );

    await client.query('COMMIT');

    finalizedSheet = await fetchSheetWithItems(db, id);

    logActivity({
      actorUserId: req.user?.user_id,
      actorRole: req.user?.role,
      actionType: 'INTERNAL_STAFF_SALARY_FINALIZED',
      entityType: 'STAFF',
      entityId: String(sheet.staff_id),
      details: { sheet_id: id, month: sheet.month, net_payable: sheet.net_payable },
    }).catch((e) => console.error('Activity log failed:', e));
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('internalStaffSalary.finalizeSheet error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  } finally {
    client.release();
  }

  // Payment is already committed at this point — PDF generation and WhatsApp
  // notification are best-effort and must never roll back a finalized payment.
  let notify_sent = false;
  try {
    const payload = buildPayslipData(finalizedSheet);
    const pdfUrl = await generateAndUploadInternalSalaryPdf(payload);
    await db.query(`UPDATE internal_staff_salary_sheets SET pdf_url = $1 WHERE id = $2`, [pdfUrl, id]);
    finalizedSheet.pdf_url = pdfUrl;

    if (finalizedSheet.staff_phone) {
      await sendInternalStaffSalarySheet(
        finalizedSheet.staff_phone,
        finalizedSheet.staff_name,
        monthLabel(finalizedSheet.month),
        payload.net_payable.toLocaleString('en-LK', { minimumFractionDigits: 2 }),
        new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
        pdfUrl
      );
      notify_sent = true;
    }
  } catch (err) {
    console.error('internalStaffSalary.finalizeSheet notify error:', err);
  }

  res.json({ sheet: finalizedSheet, notify_sent });
};

// ── Goals ────────────────────────────────────────────────────────────────

exports.listGoals = async (req, res) => {
  const { staffId } = req.params;
  try {
    const result = await db.query(
      `SELECT id, staff_id, month, goal_type, target_count, reward_amount, status, created_at
       FROM internal_staff_goals WHERE staff_id = $1 ORDER BY created_at DESC`,
      [staffId]
    );
    res.json({ goals: result.rows });
  } catch (err) {
    console.error('internalStaffSalary.listGoals error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.createGoal = async (req, res) => {
  const { staffId } = req.params;
  const { month, target_count, reward_amount, goal_type } = req.body;
  const targetCount = parseInt(target_count, 10);
  if (!targetCount || targetCount <= 0) {
    return res.status(400).json({ message: 'target_count must be a positive number' });
  }
  if (month && !MONTH_RE.test(month)) {
    return res.status(400).json({ message: 'month must be in YYYY-MM format' });
  }
  try {
    const result = await db.query(
      `INSERT INTO internal_staff_goals (staff_id, month, goal_type, target_count, reward_amount, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, staff_id, month, goal_type, target_count, reward_amount, status, created_at`,
      [staffId, month || null, goal_type || 'REGISTRATION_COUNT', targetCount, round2(reward_amount), req.user?.user_id]
    );
    res.status(201).json({ goal: result.rows[0] });
  } catch (err) {
    console.error('internalStaffSalary.createGoal error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.updateGoal = async (req, res) => {
  const { id } = req.params;
  const { status, target_count, reward_amount } = req.body;
  const setClauses = [];
  const values = [];
  let idx = 1;
  if (status !== undefined) {
    if (!['ACTIVE', 'ACHIEVED', 'CLOSED'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }
    setClauses.push(`status = $${idx++}`); values.push(status);
  }
  if (target_count !== undefined) { setClauses.push(`target_count = $${idx++}`); values.push(parseInt(target_count, 10)); }
  if (reward_amount !== undefined) { setClauses.push(`reward_amount = $${idx++}`); values.push(round2(reward_amount)); }
  if (!setClauses.length) return res.status(400).json({ message: 'No fields to update' });
  values.push(id);
  try {
    const result = await db.query(
      `UPDATE internal_staff_goals SET ${setClauses.join(', ')} WHERE id = $${idx}
       RETURNING id, staff_id, month, goal_type, target_count, reward_amount, status, created_at`,
      values
    );
    if (!result.rows.length) return res.status(404).json({ message: 'Goal not found' });
    res.json({ goal: result.rows[0] });
  } catch (err) {
    console.error('internalStaffSalary.updateGoal error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// ── Performance tiers (admin-editable range config) ─────────────────────

exports.listPerformanceTiers = async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, min_count, max_count, reward_amount, is_active
       FROM internal_staff_performance_tiers WHERE is_active = true ORDER BY min_count`
    );
    res.json({ tiers: result.rows });
  } catch (err) {
    console.error('internalStaffSalary.listPerformanceTiers error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// Replaces the whole active tier set in one go (small admin settings table,
// no per-row edit UI needed) — deactivates the old rows and inserts the new.
exports.upsertPerformanceTiers = async (req, res) => {
  const { tiers } = req.body;
  if (!Array.isArray(tiers) || !tiers.length) {
    return res.status(400).json({ message: 'tiers[] is required' });
  }
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`UPDATE internal_staff_performance_tiers SET is_active = false`);
    const inserted = [];
    for (const t of tiers) {
      const r = await client.query(
        `INSERT INTO internal_staff_performance_tiers (min_count, max_count, reward_amount, is_active)
         VALUES ($1, $2, $3, true) RETURNING id, min_count, max_count, reward_amount, is_active`,
        [parseInt(t.min_count, 10), t.max_count === null || t.max_count === '' ? null : parseInt(t.max_count, 10), round2(t.reward_amount)]
      );
      inserted.push(r.rows[0]);
    }
    await client.query('COMMIT');
    res.json({ tiers: inserted });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('internalStaffSalary.upsertPerformanceTiers error:', err);
    res.status(500).json({ message: 'Internal server error' });
  } finally {
    client.release();
  }
};

// Read-only summary for the "Calculate Performance Allowance" button — shows
// both GOAL and TIER outcomes side by side so the admin can pick a mode
// before saving it onto the draft sheet via updateDraftSheet.
exports.getPerformanceSummary = async (req, res) => {
  const { staffId } = req.params;
  const { month } = req.query;
  if (!month || !MONTH_RE.test(month)) {
    return res.status(400).json({ message: 'month is required in YYYY-MM format' });
  }
  try {
    const registrationCount = await countRegistrations(db, staffId, month);
    const goalAmount = await resolvePerformanceAllowance(db, staffId, month, 'GOAL');
    const tierAmount = await resolvePerformanceAllowance(db, staffId, month, 'TIER');
    const perRegistrationAmount = await sumRegistrationCommissions(db, staffId, month);
    const tiersRes = await db.query(
      `SELECT id, min_count, max_count, reward_amount FROM internal_staff_performance_tiers
       WHERE is_active = true ORDER BY min_count`
    );
    const goalRes = await db.query(
      `SELECT id, month, target_count, reward_amount, status FROM internal_staff_goals
       WHERE staff_id = $1 AND status = 'ACTIVE' AND goal_type = 'REGISTRATION_COUNT'
         AND (month = $2 OR month IS NULL)
       ORDER BY month NULLS LAST LIMIT 1`,
      [staffId, month]
    );
    res.json({
      month,
      registration_count: registrationCount,
      goal: goalRes.rows[0] || null,
      goal_amount: goalAmount,
      tier_amount: tierAmount,
      per_registration_amount: perRegistrationAmount,
      tiers: tiersRes.rows,
    });
  } catch (err) {
    console.error('internalStaffSalary.getPerformanceSummary error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// Monthly registration/booking counts + credited amounts for the last 12
// months — feeds the performance chart on InternalStaffProfilePage.
exports.getPerformanceHistory = async (req, res) => {
  const { staffId } = req.params;
  try {
    const regRes = await db.query(
      `SELECT to_char(assigned_at, 'YYYY-MM') AS month, COUNT(*)::int AS registrations,
              COALESCE(SUM(credited_amount), 0) AS registrations_amount
       FROM client_salesperson_assignments
       WHERE salesperson_id = $1 AND is_current = true AND assigned_at >= NOW() - INTERVAL '12 months'
       GROUP BY 1`,
      [staffId]
    );
    const bookRes = await db.query(
      `SELECT to_char(assigned_at, 'YYYY-MM') AS month, COUNT(*)::int AS bookings,
              COALESCE(SUM(credited_amount), 0) AS bookings_amount
       FROM booking_salesperson_assignments
       WHERE salesperson_id = $1 AND is_current = true AND assigned_at >= NOW() - INTERVAL '12 months'
       GROUP BY 1`,
      [staffId]
    );
    const byMonth = {};
    for (const r of regRes.rows) {
      byMonth[r.month] = { month: r.month, registrations: r.registrations, registrations_amount: parseFloat(r.registrations_amount), bookings: 0, bookings_amount: 0 };
    }
    for (const r of bookRes.rows) {
      if (!byMonth[r.month]) byMonth[r.month] = { month: r.month, registrations: 0, registrations_amount: 0, bookings: 0, bookings_amount: 0 };
      byMonth[r.month].bookings = r.bookings;
      byMonth[r.month].bookings_amount = parseFloat(r.bookings_amount);
    }
    const history = Object.values(byMonth).sort((a, b) => a.month.localeCompare(b.month));
    res.json({ history });
  } catch (err) {
    console.error('internalStaffSalary.getPerformanceHistory error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// Resolves the logged-in admin's own internal_staff row, if any — used by the
// proxy service-request/booking drawers to detect a coordinator mismatch
// before submit (see requireOwnCoordinatorRecord for the server-side lock).
exports.getMyInternalStaffId = async (req, res) => {
  try {
    const result = await db.query(`SELECT id, full_name FROM internal_staff WHERE user_id = $1`, [req.user.user_id]);
    if (!result.rows.length) return res.json({ staff_id: null, full_name: null });
    res.json({ staff_id: result.rows[0].id, full_name: result.rows[0].full_name });
  } catch (err) {
    console.error('internalStaffSalary.getMyInternalStaffId error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// ── Coordinator-owned work (for the profile page's "Work" tab) ──────────

exports.getCoordinatorWork = async (req, res) => {
  const { staffId } = req.params;
  try {
    const [serviceRequests, bookings, clients, careProfiles] = await Promise.all([
      db.query(
        `SELECT request_id, payer_name, patient_name, service_type, status, created_at
         FROM service_requests WHERE coordinator_staff_id = $1 ORDER BY created_at DESC LIMIT 100`,
        [staffId]
      ),
      db.query(
        `SELECT b.booking_id, b.booking_code, b.service_type, b.status, b.start_date, cp.full_name AS client_name
         FROM bookings b LEFT JOIN client_profiles cp ON cp.client_profile_id = b.client_id
         WHERE b.coordinator_staff_id = $1 ORDER BY b.start_date DESC LIMIT 100`,
        [staffId]
      ),
      db.query(
        `SELECT cp.client_profile_id, cp.full_name, cp.client_code, cp.reg_fee_status, u.mobile_number
         FROM client_profiles cp JOIN users u ON u.user_id = cp.user_id
         WHERE cp.coordinator_staff_id = $1 ORDER BY cp.created_at DESC LIMIT 100`,
        [staffId]
      ),
      db.query(
        `SELECT pp.patient_id, pp.full_name, pp.age, pp.relationship_to_client, cp.full_name AS client_name
         FROM patient_profiles pp LEFT JOIN client_profiles cp ON cp.client_profile_id = pp.client_id
         WHERE pp.coordinator_staff_id = $1 ORDER BY pp.created_at DESC LIMIT 100`,
        [staffId]
      ),
    ]);
    res.json({
      service_requests: serviceRequests.rows,
      bookings: bookings.rows,
      clients: clients.rows,
      care_profiles: careProfiles.rows,
    });
  } catch (err) {
    console.error('internalStaffSalary.getCoordinatorWork error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// ── Advances ─────────────────────────────────────────────────────────────

exports.listAdvances = async (req, res) => {
  const { staffId } = req.params;
  try {
    const result = await db.query(
      `SELECT id, staff_id, amount, reason, month, status, given_at, settled_sheet_id
       FROM internal_staff_advances WHERE staff_id = $1 ORDER BY given_at DESC`,
      [staffId]
    );
    res.json({ advances: result.rows });
  } catch (err) {
    console.error('internalStaffSalary.listAdvances error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.giveAdvance = async (req, res) => {
  const { staffId } = req.params;
  const { amount, reason, month } = req.body;
  const amt = round2(amount);
  if (!amt || amt <= 0) return res.status(400).json({ message: 'amount must be a positive number' });
  if (!month || !MONTH_RE.test(month)) return res.status(400).json({ message: 'month is required in YYYY-MM format' });

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    const staffRes = await client.query(`SELECT full_name FROM internal_staff WHERE id = $1`, [staffId]);
    if (!staffRes.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Staff member not found' });
    }

    const txnRes = await client.query(
      `INSERT INTO transactions
        (internal_staff_id, category, transaction_type, amount, status, notes, is_manual, created_by, verified_by, created_at)
       VALUES ($1, 'INTERNAL_STAFF_ADVANCE', 'DEBIT', $2, 'COMPLETED', $3, true, $4, $4, NOW())
       RETURNING transaction_id`,
      [staffId, amt, `Internal staff advance — ${staffRes.rows[0].full_name} — ${monthLabel(month)}`, req.user?.user_id]
    );

    const advanceRes = await client.query(
      `INSERT INTO internal_staff_advances (staff_id, amount, reason, month, transaction_id, given_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, staff_id, amount, reason, month, status, given_at, settled_sheet_id`,
      [staffId, amt, reason || null, month, txnRes.rows[0].transaction_id, req.user?.user_id]
    );

    await client.query('COMMIT');

    logActivity({
      actorUserId: req.user?.user_id,
      actorRole: req.user?.role,
      actionType: 'INTERNAL_STAFF_ADVANCE_GIVEN',
      entityType: 'STAFF',
      entityId: String(staffId),
      details: { advance_id: advanceRes.rows[0].id, amount: amt, month },
    }).catch((e) => console.error('Activity log failed:', e));

    res.status(201).json({ advance: advanceRes.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('internalStaffSalary.giveAdvance error:', err);
    res.status(500).json({ message: 'Internal server error' });
  } finally {
    client.release();
  }
};
