const db = require('../config/db');
const { sendWhatsAppMessage } = require('../utils/whatsapp');
const { sendStaffDeductionNotice, sendStaffSalarySheet } = require('../utils/metaWhatsapp');
const { sendSms } = require('../utils/sms');
const { logActivity } = require('../utils/activityLogger');
const { generateAndUploadSalarySheet } = require('../utils/salaryPdf');
const { creditRecruiterForStaff } = require('../services/recruiterService');
const { resolveBankAccountId } = require('../utils/pettyCash');
const { toE164, isValidPhone } = require('../utils/phone');

const _MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const _METHOD_LABELS = { BANK_TRANSFER: 'Bank Transfer', CASH: 'Cash', CHEQUE: 'Cheque' };
const _VALID_PAYOUT_METHODS = ['BANK_TRANSFER', 'CASH', 'CHEQUE'];

function _extractActorRole(role) {
    const raw = Array.isArray(role) ? role[0] : role;
    return typeof raw === 'string' ? raw.replace(/\{|\}/g, '').split(',')[0].trim() : String(raw);
}

// Self-service routes (bank accounts, etc.) are shared between the staff-app owner and
// internal admins. SUPER_ADMIN always passes; other internal roles need the matching
// staff_permissions grant; anyone else is only allowed onto their own staff_profile_id.
async function _canAccessStaffRecord(req, staff_profile_id, permissionKey) {
    const actorRole = _extractActorRole(req.user.role);
    if (actorRole === 'SUPER_ADMIN') return true;

    const permRes = await db.query(
        'SELECT 1 FROM staff_permissions WHERE user_id = $1 AND permission_key = $2',
        [req.user.user_id, permissionKey]
    );
    if (permRes.rows.length > 0) return true;

    const ownProfile = await db.query('SELECT staff_profile_id FROM staff_profiles WHERE user_id = $1', [req.user.user_id]);
    return ownProfile.rows.length > 0 && String(ownProfile.rows[0].staff_profile_id) === String(staff_profile_id);
}

async function _sendSalaryPayoutNotifications(staffProfileId, payoutAmount, paymentMethod, referenceNumber, notes, staffPaymentId, monthYear, autoSend) {
    const staffRes = await db.query(`
        SELECT sp.full_name, sp.designation, u.mobile_number
        FROM staff_profiles sp
        JOIN users u ON sp.user_id = u.user_id
        WHERE sp.staff_profile_id = $1
    `, [staffProfileId]);

    if (!staffRes.rows.length || !staffRes.rows[0].mobile_number) return;
    const staff = staffRes.rows[0];

    const params = [staffProfileId];
    let joinMonthFilter = '';   // for queries where transactions is aliased as "t"
    let plainMonthFilter = '';  // for standalone queries with no alias
    if (monthYear) {
        params.push(monthYear.year, monthYear.month);
        const yi = params.length - 1;
        const mi = params.length;
        joinMonthFilter  = `AND EXTRACT(YEAR FROM t.created_at) = $${yi} AND EXTRACT(MONTH FROM t.created_at) = $${mi}`;
        plainMonthFilter = `AND EXTRACT(YEAR FROM created_at) = $${yi} AND EXTRACT(MONTH FROM created_at) = $${mi}`;
    }

    const breakdownRes = await db.query(`
        SELECT
            bsa.booking_id, b.booking_code,
            bsa.service_start_date, bsa.service_end_date, bsa.daily_rate,
            cp.full_name AS client_name,
            pp.full_name AS patient_name,
            COALESCE(json_agg(
                json_build_object('date', t.created_at::date, 'amount', t.amount)
                ORDER BY t.created_at
            ) FILTER (WHERE t.transaction_id IS NOT NULL), '[]'::json) AS daily_entries,
            COALESCE(SUM(t.amount), 0) AS total_salary_earned
        FROM booking_staff_assignments bsa
        JOIN bookings b ON bsa.booking_id = b.booking_id
        LEFT JOIN client_profiles cp ON b.client_id = cp.client_profile_id
        LEFT JOIN patient_profiles pp ON b.patient_id = pp.patient_id
        LEFT JOIN transactions t
            ON t.staff_profile_id = bsa.staff_profile_id
            AND t.booking_id = bsa.booking_id
            AND t.category = 'STAFF_SALARY'
            ${joinMonthFilter}
        WHERE bsa.staff_profile_id = $1
        GROUP BY bsa.assignment_id, bsa.booking_id, b.booking_code,
                 bsa.service_start_date, bsa.service_end_date, bsa.daily_rate,
                 cp.full_name, pp.full_name
        HAVING COALESCE(SUM(t.amount), 0) > 0
        ORDER BY bsa.service_start_date DESC
    `, params);

    const deductionsRes = await db.query(`
        SELECT amount, notes AS reason, created_at
        FROM transactions
        WHERE staff_profile_id = $1 AND category = 'STAFF_DEDUCTION' ${plainMonthFilter}
        ORDER BY created_at
    `, params);

    const advancesRes = await db.query(`
        SELECT amount, notes, created_at
        FROM transactions
        WHERE staff_profile_id = $1 AND category = 'STAFF_ADVANCE' ${plainMonthFilter}
        ORDER BY created_at
    `, params);

    // Previous payouts in the same period (exclude the current one just inserted)
    let priorPayoutsRes = { rows: [] };
    if (monthYear && staffPaymentId) {
        priorPayoutsRes = await db.query(`
            SELECT amount_paid, paid_at, payment_method, reference_number
            FROM staff_payments_tracking
            WHERE staff_profile_id = $1
              AND EXTRACT(YEAR FROM paid_at) = $2 AND EXTRACT(MONTH FROM paid_at) = $3
              AND staff_payment_id != $4
            ORDER BY paid_at
        `, [staffProfileId, monthYear.year, monthYear.month, staffPaymentId]);
    }

    // Outstanding balance carried over from all months before the selected one
    let previous_leftover = 0;
    if (monthYear) {
        const [preTxnRes, prePayRes] = await Promise.all([
            db.query(`
                SELECT
                    COALESCE(SUM(CASE WHEN category = 'STAFF_SALARY'    THEN amount ELSE 0 END), 0) AS pre_gross,
                    COALESCE(SUM(CASE WHEN category = 'STAFF_DEDUCTION' THEN amount ELSE 0 END), 0) AS pre_deductions,
                    COALESCE(SUM(CASE WHEN category = 'STAFF_ADVANCE'   THEN amount ELSE 0 END), 0) AS pre_advances
                FROM transactions
                WHERE staff_profile_id = $1
                  AND category IN ('STAFF_SALARY', 'STAFF_DEDUCTION', 'STAFF_ADVANCE')
                  AND (
                      EXTRACT(YEAR  FROM created_at)::int < $2
                   OR (EXTRACT(YEAR  FROM created_at)::int = $2 AND EXTRACT(MONTH FROM created_at)::int < $3)
                  )
            `, [staffProfileId, monthYear.year, monthYear.month]),
            db.query(`
                SELECT COALESCE(SUM(amount_paid), 0) AS pre_payouts
                FROM staff_payments_tracking
                WHERE staff_profile_id = $1
                  AND (
                      EXTRACT(YEAR  FROM paid_at)::int < $2
                   OR (EXTRACT(YEAR  FROM paid_at)::int = $2 AND EXTRACT(MONTH FROM paid_at)::int < $3)
                  )
            `, [staffProfileId, monthYear.year, monthYear.month]),
        ]);
        const pre = preTxnRes.rows[0];
        previous_leftover = Math.max(
            0,
            parseFloat(pre.pre_gross) - parseFloat(pre.pre_deductions) - parseFloat(pre.pre_advances) - parseFloat(prePayRes.rows[0].pre_payouts)
        );
    }

    const now = new Date();
    const monthLabel = monthYear
        ? `${_MONTH_NAMES[monthYear.month - 1]} ${monthYear.year}`
        : `${_MONTH_NAMES[now.getMonth()]} ${now.getFullYear()}`;
    const paymentDate = now.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    const lkrFmt = new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR', maximumFractionDigits: 2 });
    const formattedAmount = lkrFmt.format(payoutAmount);

    // Net payable = what was outstanding before this payout (shown in the template)
    const _grossTotal        = breakdownRes.rows.reduce((s, r) => s + parseFloat(r.total_salary_earned || 0), 0);
    const _totalDeductions   = deductionsRes.rows.reduce((s, r) => s + parseFloat(r.amount || 0), 0);
    const _totalAdvances     = advancesRes.rows.reduce((s, r) => s + parseFloat(r.amount || 0), 0);
    const _totalPriorPayouts = priorPayoutsRes.rows.reduce((s, r) => s + parseFloat(r.amount_paid || 0), 0);
    const _monthNet          = Math.max(0, _grossTotal - _totalDeductions - _totalAdvances - _totalPriorPayouts);
    const _netPayable        = _monthNet + previous_leftover;
    const formattedNetPayable = lkrFmt.format(_netPayable);

    const pdfUrl = await generateAndUploadSalarySheet({
        staff_name: staff.full_name,
        designation: staff.designation,
        payment_amount: payoutAmount,
        payment_date: paymentDate,
        payment_method: paymentMethod,
        reference_number: referenceNumber,
        notes,
        month_label: monthLabel,
        generated_at: paymentDate,
        breakdown: breakdownRes.rows,
        deductions: deductionsRes.rows,
        advances: advancesRes.rows,
        prior_payouts: priorPayoutsRes.rows,
        previous_leftover,
    });

    if (staffPaymentId) {
        await db.query(
            `UPDATE staff_payments_tracking SET salary_sheet_url = $1 WHERE staff_payment_id = $2`,
            [pdfUrl, staffPaymentId]
        );
    }

    if (autoSend) {
        const methodLabel = _METHOD_LABELS[paymentMethod] || paymentMethod || 'Bank Transfer';

        await sendStaffSalarySheet(
            staff.mobile_number,
            staff.full_name,
            monthLabel,
            formattedNetPayable,
            formattedAmount,
            paymentDate,
            methodLabel,
            referenceNumber || 'N/A',
            pdfUrl
        );

        await sendSms(
            staff.mobile_number,
            `VCare Nursing: Your ${monthLabel} salary of ${formattedAmount} has been paid via ${methodLabel}.${referenceNumber ? ' Ref: ' + referenceNumber + '.' : ''} Net payable was ${formattedNetPayable}. Check WhatsApp for your full salary sheet.`
        );
    }
}

// Resend WhatsApp + SMS for an existing payout record (no PDF regeneration)
async function _sendNotificationForPayoutId(staffPaymentId) {
    const payoutRes = await db.query(`
        SELECT spt.*, sp.full_name, sp.designation, u.mobile_number
        FROM staff_payments_tracking spt
        JOIN staff_profiles sp ON spt.staff_profile_id = sp.staff_profile_id
        JOIN users u ON sp.user_id = u.user_id
        WHERE spt.staff_payment_id = $1
    `, [staffPaymentId]);

    if (!payoutRes.rows.length) throw new Error('Payout record not found');
    const payout = payoutRes.rows[0];
    if (!payout.salary_sheet_url) throw new Error('No salary sheet PDF associated with this payout');
    if (!payout.mobile_number) throw new Error('Staff member has no mobile number');

    const paidAt = new Date(payout.paid_at);
    const monthYear = { year: paidAt.getFullYear(), month: paidAt.getMonth() + 1 };
    const label = `${_MONTH_NAMES[monthYear.month - 1]} ${monthYear.year}`;
    const paymentDate = paidAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    const lkrFmt = new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR', maximumFractionDigits: 2 });

    const params = [payout.staff_profile_id, monthYear.year, monthYear.month];
    const joinMonthFilter = `AND EXTRACT(YEAR FROM t.created_at) = $2 AND EXTRACT(MONTH FROM t.created_at) = $3`;
    const plainMonthFilter = `AND EXTRACT(YEAR FROM created_at) = $2 AND EXTRACT(MONTH FROM created_at) = $3`;

    const [breakdownRes, deductionsRes, advancesRes] = await Promise.all([
        db.query(`
            SELECT COALESCE(SUM(t.amount), 0) AS total_salary_earned
            FROM booking_staff_assignments bsa
            JOIN bookings b ON bsa.booking_id = b.booking_id
            LEFT JOIN transactions t
                ON t.staff_profile_id = bsa.staff_profile_id
                AND t.booking_id = bsa.booking_id
                AND t.category = 'STAFF_SALARY'
                ${joinMonthFilter}
            WHERE bsa.staff_profile_id = $1
            GROUP BY bsa.assignment_id
            HAVING COALESCE(SUM(t.amount), 0) > 0
        `, params),
        db.query(`SELECT amount FROM transactions WHERE staff_profile_id = $1 AND category = 'STAFF_DEDUCTION' ${plainMonthFilter} ORDER BY created_at`, params),
        db.query(`SELECT amount FROM transactions WHERE staff_profile_id = $1 AND category = 'STAFF_ADVANCE' ${plainMonthFilter} ORDER BY created_at`, params),
    ]);

    const priorPayoutsRes = await db.query(`
        SELECT amount_paid FROM staff_payments_tracking
        WHERE staff_profile_id = $1
          AND EXTRACT(YEAR FROM paid_at) = $2 AND EXTRACT(MONTH FROM paid_at) = $3
          AND staff_payment_id != $4
        ORDER BY paid_at
    `, [payout.staff_profile_id, monthYear.year, monthYear.month, staffPaymentId]);

    const [preTxnRes, prePayRes] = await Promise.all([
        db.query(`
            SELECT
                COALESCE(SUM(CASE WHEN category = 'STAFF_SALARY'    THEN amount ELSE 0 END), 0) AS pre_gross,
                COALESCE(SUM(CASE WHEN category = 'STAFF_DEDUCTION' THEN amount ELSE 0 END), 0) AS pre_deductions,
                COALESCE(SUM(CASE WHEN category = 'STAFF_ADVANCE'   THEN amount ELSE 0 END), 0) AS pre_advances
            FROM transactions
            WHERE staff_profile_id = $1
              AND category IN ('STAFF_SALARY', 'STAFF_DEDUCTION', 'STAFF_ADVANCE')
              AND (EXTRACT(YEAR FROM created_at)::int < $2 OR (EXTRACT(YEAR FROM created_at)::int = $2 AND EXTRACT(MONTH FROM created_at)::int < $3))
        `, [payout.staff_profile_id, monthYear.year, monthYear.month]),
        db.query(`
            SELECT COALESCE(SUM(amount_paid), 0) AS pre_payouts
            FROM staff_payments_tracking
            WHERE staff_profile_id = $1
              AND (EXTRACT(YEAR FROM paid_at)::int < $2 OR (EXTRACT(YEAR FROM paid_at)::int = $2 AND EXTRACT(MONTH FROM paid_at)::int < $3))
        `, [payout.staff_profile_id, monthYear.year, monthYear.month]),
    ]);

    const pre = preTxnRes.rows[0];
    const previous_leftover = Math.max(0,
        parseFloat(pre.pre_gross) - parseFloat(pre.pre_deductions) - parseFloat(pre.pre_advances) - parseFloat(prePayRes.rows[0].pre_payouts)
    );
    const _grossTotal        = breakdownRes.rows.reduce((s, r) => s + parseFloat(r.total_salary_earned || 0), 0);
    const _totalDeductions   = deductionsRes.rows.reduce((s, r) => s + parseFloat(r.amount || 0), 0);
    const _totalAdvances     = advancesRes.rows.reduce((s, r) => s + parseFloat(r.amount || 0), 0);
    const _totalPriorPayouts = priorPayoutsRes.rows.reduce((s, r) => s + parseFloat(r.amount_paid || 0), 0);
    const _netPayable        = Math.max(0, _grossTotal - _totalDeductions - _totalAdvances - _totalPriorPayouts) + previous_leftover;

    const formattedAmount     = lkrFmt.format(payout.amount_paid);
    const formattedNetPayable = lkrFmt.format(_netPayable);
    const methodLabel         = _METHOD_LABELS[payout.payment_method] || payout.payment_method || 'Bank Transfer';

    let anySent = false;

    try {
        await sendStaffSalarySheet(
            payout.mobile_number, payout.full_name, label,
            formattedNetPayable, formattedAmount, paymentDate,
            methodLabel, payout.reference_number || 'N/A', payout.salary_sheet_url
        );
        anySent = true;
    } catch (waErr) {
        const waMsg = waErr.response?.data?.error?.message ?? waErr.message;
        console.error(`[Salary Notification] WhatsApp failed for payout ${staffPaymentId}: ${waMsg}`);
    }

    try {
        await sendSms(
            payout.mobile_number,
            `VCare Nursing: Your ${label} salary of ${formattedAmount} has been paid via ${methodLabel}.${payout.reference_number ? ' Ref: ' + payout.reference_number + '.' : ''} Net payable was ${formattedNetPayable}. Check WhatsApp for your full salary sheet.`
        );
        anySent = true;
    } catch (smsErr) {
        console.error(`[Salary Notification] SMS failed for payout ${staffPaymentId}:`, smsErr.message);
    }

    if (!anySent) throw new Error('Both WhatsApp and SMS failed — check server logs');

    await db.query(
        `UPDATE staff_payments_tracking SET notification_sent_at = NOW() WHERE staff_payment_id = $1`,
        [staffPaymentId]
    );
}

const getUploadedFileUrl = (files, fieldName) => (files && files[fieldName] && files[fieldName][0]) ? files[fieldName][0].location : null;

// Get staff member by ID
exports.getStaffByID = async (req, res) => {
    const { staff_id } = req.params;

    try {
        const query = `
            SELECT 
                sp.staff_profile_id,
                sp.full_name,
                sp.designation,
                sp.qualifications,
                sp.document_urls,
                sp.home_address,
                sp.location,
                sp.gps_coordinates,
                sp.profile_picture_url,
                sp.current_status,
                sp.verification_status,
                sp.gender,
                sp.willing_to_live_in,
                sp.date_of_birth,
                sp.experience_level,
                sp.doc_upload_token,
                sp.grama_niladhari_url,
                sp.police_report_url,
                sp.created_at,
                sp.advance_threshold_amount,
                CAST(sp.average_rating AS FLOAT) as average_rating,
                sp.total_reviews,
                u.user_id,
                u.email,
                u.mobile_number,
                u.role,
                u.is_active,
                u.is_email_verified,
                u.created_at as user_created_at
            FROM staff_profiles sp
            JOIN users u ON sp.user_id = u.user_id
            WHERE sp.staff_profile_id = $1
        `;

        const result = await db.query(query, [staff_id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ 
                status: 'error',
                message: 'Staff member not found' 
            });
        }

        res.status(200).json({
            status: 'success',
            data: result.rows[0]
        });

    } catch (error) {
        console.error('Get Staff by ID Error:', error);
        res.status(500).json({ 
            status: 'error',
            message: 'Server error while fetching staff member' 
        });
    }
};

// Get staff member by user_id
exports.getStaffByUserID = async (req, res) => {
    const { user_id } = req.params;

    try {
        const query = `
            SELECT 
                sp.staff_profile_id,
                sp.full_name,
                sp.qualifications,
                sp.document_urls,
                sp.home_address,
                sp.gps_coordinates,
                sp.profile_picture_url,
                sp.current_status,
                sp.verification_status,
                sp.gender,
                sp.advance_threshold_amount,
                sp.willing_to_live_in,
                sp.date_of_birth,
                sp.experience_level,
                sp.doc_upload_token,
                sp.grama_niladhari_url,
                sp.police_report_url,
                sp.location,
                sp.nic_number,
                sp.created_at,
                u.user_id,
                u.email,
                u.mobile_number,
                u.role,
                u.is_active,
                u.is_email_verified,
                u.created_at as user_created_at
            FROM staff_profiles sp
            JOIN users u ON sp.user_id = u.user_id
            WHERE sp.user_id = $1
        `;

        const result = await db.query(query, [user_id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ 
                status: 'error',
                message: 'Staff member not found' 
            });
        }

        res.status(200).json({
            status: 'success',
            data: result.rows[0]
        });

    } catch (error) {
        console.error('Get Staff by User ID Error:', error);
        res.status(500).json({ 
            status: 'error',
            message: 'Server error while fetching staff member' 
        });
    }
};

// Admin: Aggregate staff detail (profile + earnings + current/previous bookings + reviews + payout summary)
exports.getAdminStaffDetail = async (req, res) => {
    const { staff_profile_id } = req.params;

    try {
        // 1) Profile + user
        const profileQuery = `
            SELECT sp.*, u.user_id, u.email, u.mobile_number, u.role, u.is_active,
                   sa.agreement_sent_at
            FROM staff_profiles sp
            JOIN users u ON sp.user_id = u.user_id
            LEFT JOIN LATERAL (
                SELECT agreement_sent_at FROM staff_applications
                WHERE mobile_number = u.mobile_number AND status = 'ACCEPTED'
                ORDER BY applied_at DESC LIMIT 1
            ) sa ON true
            WHERE sp.staff_profile_id = $1
        `;
        const profileRes = await db.query(profileQuery, [staff_profile_id]);
        if (profileRes.rows.length === 0) {
            return res.status(404).json({ status: 'error', message: 'Staff not found' });
        }
        const profile = profileRes.rows[0];

        // 2) Earnings summary
        const totalEarnedRes = await db.query(`
            SELECT COALESCE(SUM(amount), 0) as total_earned
            FROM transactions
            WHERE staff_profile_id = $1 AND category = 'STAFF_SALARY' AND transaction_type = 'CREDIT' AND status = 'COMPLETED'
        `, [staff_profile_id]);

        const totalPaidRes = await db.query(`
            SELECT COALESCE(SUM(amount), 0) as total_paid_out
            FROM transactions
            WHERE staff_profile_id = $1 AND category = 'STAFF_SALARY_PAID' AND transaction_type = 'DEBIT' AND status = 'COMPLETED'
        `, [staff_profile_id]);

        const currentEarnings = parseFloat(profile.current_earnings || 0);
        const totalEarned = parseFloat(totalEarnedRes.rows[0].total_earned || 0);
        const totalPaidOut = parseFloat(totalPaidRes.rows[0].total_paid_out || 0);
        const outstanding = currentEarnings; // current_earnings reflects unpaid balance

        // 3) Current active assignment / booking
        // pending_end (LATERAL): a scheduled-but-not-yet-executed COMPLETION/TERMINATION
        // on this booking — service_end_date stays NULL until the cron actually runs, so
        // without this the assignment looks open-ended even though it's due to wrap up.
        const currentAssignRes = await db.query(`
            SELECT bsa.*, b.booking_id, b.status as booking_status, b.start_date, b.daily_rate as booking_daily_rate,
                   c.full_name as client_name, p.full_name as patient_name,
                   pending_end.effective_date as pending_end_date, pending_end.action_type as pending_end_action_type
            FROM booking_staff_assignments bsa
            LEFT JOIN bookings b ON bsa.booking_id = b.booking_id
            LEFT JOIN client_profiles c ON b.client_id = c.client_profile_id
            LEFT JOIN patient_profiles p ON b.patient_id = p.patient_id
            LEFT JOIN LATERAL (
                SELECT sa.effective_date, sa.action_type
                FROM scheduled_actions sa
                WHERE sa.booking_id = bsa.booking_id
                  AND sa.action_type IN ('COMPLETION', 'TERMINATION')
                  AND sa.status = 'SCHEDULED'
                ORDER BY sa.effective_date ASC
                LIMIT 1
            ) pending_end ON true
            WHERE bsa.staff_profile_id = $1 AND bsa.status = 'ACTIVE'
            ORDER BY bsa.service_start_date ASC
            LIMIT 1
        `, [staff_profile_id]);

        const current_assignment = currentAssignRes.rows[0] || null;

        // 4) Previous assignments / booking history (recent)
        const historyRes = await db.query(`
            SELECT bsa.assignment_id, bsa.booking_id, bsa.service_start_date, bsa.service_end_date, bsa.daily_rate, bsa.amount_allocated, bsa.status,
                   b.client_id, b.status as booking_status, b.service_type, b.service_model,
                   c.full_name as client_name, p.full_name as patient_name,
                   COALESCE(salary_totals.total_salary_paid, 0) as total_salary_paid
            FROM booking_staff_assignments bsa
            LEFT JOIN bookings b ON bsa.booking_id = b.booking_id
            LEFT JOIN client_profiles c ON b.client_id = c.client_profile_id
            LEFT JOIN patient_profiles p ON b.patient_id = p.patient_id
            LEFT JOIN (
                SELECT staff_profile_id, booking_id, COALESCE(SUM(amount),0) as total_salary_paid
                FROM transactions
                WHERE category = 'STAFF_SALARY' OR category = 'STAFF_SALARY_PAID'
                GROUP BY staff_profile_id, booking_id
            ) salary_totals ON salary_totals.staff_profile_id = bsa.staff_profile_id AND salary_totals.booking_id = bsa.booking_id
            WHERE bsa.staff_profile_id = $1
            ORDER BY bsa.service_start_date DESC
            LIMIT 20
        `, [staff_profile_id]);

        const booking_history = historyRes.rows;

        // 4b) Unique clients & patients stats + swap-out count
        const statsRes = await db.query(`
            SELECT
                COUNT(DISTINCT b.client_id) as unique_clients,
                COUNT(DISTINCT b.patient_id) as unique_patients,
                COUNT(bsa.assignment_id) as total_assignments
            FROM booking_staff_assignments bsa
            LEFT JOIN bookings b ON bsa.booking_id = b.booking_id
            WHERE bsa.staff_profile_id = $1
        `, [staff_profile_id]);

        const swapCountRes = await db.query(
            `SELECT COUNT(*) as swap_out_count FROM staff_swaps WHERE old_staff_id = $1`,
            [staff_profile_id]
        );

        const stats = {
            unique_clients: parseInt(statsRes.rows[0]?.unique_clients || 0),
            unique_patients: parseInt(statsRes.rows[0]?.unique_patients || 0),
            total_assignments: parseInt(statsRes.rows[0]?.total_assignments || 0),
            swap_out_count: parseInt(swapCountRes.rows[0]?.swap_out_count || 0),
        };

        // 5) Reviews summary & recent reviews
        const reviewsRes = await db.query(`
            SELECT sr.review_id, sr.rating, sr.review_text, sr.created_at, cp.full_name as client_name
            FROM staff_reviews sr
            LEFT JOIN client_profiles cp ON sr.client_profile_id = cp.client_profile_id
            WHERE sr.staff_profile_id = $1 AND sr.is_visible = true
            ORDER BY sr.created_at DESC
            LIMIT 20
        `, [staff_profile_id]);

        const distributionRes = await db.query(`
            SELECT rating, COUNT(*) as count
            FROM staff_reviews
            WHERE staff_profile_id = $1 AND is_visible = true
            GROUP BY rating
            ORDER BY rating DESC
        `, [staff_profile_id]);

        // 6) Payout summary (paid totals)
        const payoutsRes = await db.query(`
            SELECT COALESCE(SUM(amount),0) as total_payouts, COUNT(*) as payouts_count
            FROM transactions
            WHERE staff_profile_id = $1 AND category = 'STAFF_SALARY_PAID' AND transaction_type = 'DEBIT' AND status = 'COMPLETED'
        `, [staff_profile_id]);

        const payout_summary = payoutsRes.rows[0] || { total_payouts: 0, payouts_count: 0 };

        return res.status(200).json({
            status: 'success',
            data: {
                profile,
                earnings: {
                    current_earnings: currentEarnings,
                    total_earned: totalEarned,
                    total_paid_out: totalPaidOut,
                    outstanding: outstanding
                },
                stats,
                current_assignment,
                booking_history,
                reviews: {
                    recent: reviewsRes.rows,
                    distribution: distributionRes.rows
                },
                payout_summary
            }
        });

    } catch (error) {
        console.error('getAdminStaffDetail Error:', error);
        return res.status(500).json({ status: 'error', message: 'Server error while fetching admin staff detail' });
    }
};

// Earnings summary for admin/staff views
exports.getEarningsSummary = async (req, res) => {
    const { staff_profile_id } = req.params;

    try {
        const profileRes = await db.query(`SELECT current_earnings FROM staff_profiles WHERE staff_profile_id = $1`, [staff_profile_id]);
        if (profileRes.rows.length === 0) {
            return res.status(404).json({ status: 'error', message: 'Staff not found' });
        }

        const currentEarnings = parseFloat(profileRes.rows[0].current_earnings || 0);

        const totalEarnedRes = await db.query(`
            SELECT COALESCE(SUM(amount),0) as total_earned
            FROM transactions
            WHERE staff_profile_id = $1 AND category = 'STAFF_SALARY' AND transaction_type = 'CREDIT' AND status = 'COMPLETED'
        `, [staff_profile_id]);

        const totalPaidRes = await db.query(`
            SELECT COALESCE(SUM(amount),0) as total_paid_out
            FROM transactions
            WHERE staff_profile_id = $1 AND category = 'STAFF_SALARY_PAID' AND transaction_type = 'DEBIT' AND status = 'COMPLETED'
        `, [staff_profile_id]);

        const totalEarned = parseFloat(totalEarnedRes.rows[0].total_earned || 0);
        const totalPaidOut = parseFloat(totalPaidRes.rows[0].total_paid_out || 0);
        const outstanding = currentEarnings;

        return res.status(200).json({
            status: 'success',
            data: {
                current_earnings: currentEarnings,
                total_earned: totalEarned,
                total_paid_out: totalPaidOut,
                outstanding_payable: outstanding
            }
        });

    } catch (error) {
        console.error('getEarningsSummary Error:', error);
        return res.status(500).json({ status: 'error', message: 'Server error while fetching earnings summary' });
    }
};

// Paginated earnings transactions (STAFF_SALARY and STAFF_SALARY_PAID)
exports.getEarningsTransactions = async (req, res) => {
    const { staff_profile_id } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;

    try {
        const countRes = await db.query(`
            SELECT COUNT(*) as total_count
            FROM transactions
            WHERE staff_profile_id = $1 AND (category = 'STAFF_SALARY' OR category = 'STAFF_SALARY_PAID')
        `, [staff_profile_id]);

        const totalCount = parseInt(countRes.rows[0].total_count || 0);

        const dataRes = await db.query(`
            SELECT transaction_id, category, amount, transaction_type, payment_method, bank_account_id, reference_number, status, created_at
            FROM transactions
            WHERE staff_profile_id = $1 AND (category = 'STAFF_SALARY' OR category = 'STAFF_SALARY_PAID')
            ORDER BY created_at DESC
            LIMIT $2 OFFSET $3
        `, [staff_profile_id, limit, offset]);

        return res.status(200).json({
            status: 'success',
            data: dataRes.rows,
            pagination: {
                current_page: page,
                per_page: limit,
                total_count: totalCount,
                total_pages: Math.ceil(totalCount / limit)
            }
        });

    } catch (error) {
        console.error('getEarningsTransactions Error:', error);
        return res.status(500).json({ status: 'error', message: 'Server error while fetching earnings transactions' });
    }
};

// Get current active booking/assignment for a staff member
exports.getCurrentBooking = async (req, res) => {
    const { staff_profile_id } = req.params;

    try {
        const currentAssignRes = await db.query(`
            SELECT bsa.assignment_id, bsa.booking_id, bsa.assigned_on, bsa.service_start_date, bsa.service_end_date, bsa.daily_rate, bsa.amount_allocated, bsa.status,
                         b.booking_id as booking_id, b.status as booking_status, b.start_date as booking_start_date, b.daily_rate as booking_daily_rate,
                         c.client_profile_id, c.full_name as client_name,
                         p.patient_id, p.full_name as patient_name,
                         pending_end.effective_date as pending_end_date, pending_end.action_type as pending_end_action_type
            FROM booking_staff_assignments bsa
            LEFT JOIN bookings b ON bsa.booking_id = b.booking_id
            LEFT JOIN client_profiles c ON b.client_id = c.client_profile_id
            LEFT JOIN patient_profiles p ON b.patient_id = p.patient_id
            LEFT JOIN LATERAL (
                SELECT sa.effective_date, sa.action_type
                FROM scheduled_actions sa
                WHERE sa.booking_id = bsa.booking_id
                  AND sa.action_type IN ('COMPLETION', 'TERMINATION')
                  AND sa.status = 'SCHEDULED'
                ORDER BY sa.effective_date ASC
                LIMIT 1
            ) pending_end ON true
            WHERE bsa.staff_profile_id = $1 AND bsa.status = 'ACTIVE'
            ORDER BY bsa.assigned_on DESC
            LIMIT 1
        `, [staff_profile_id]);

        const current = currentAssignRes.rows[0] || null;
        return res.status(200).json({ status: 'success', data: current });

    } catch (error) {
        console.error('getCurrentBooking Error:', error);
        return res.status(500).json({ status: 'error', message: 'Server error while fetching current booking' });
    }
};

// Paginated booking history (assignment-centric) for a staff member
exports.getBookingHistory = async (req, res) => {
    const { staff_profile_id } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const status = req.query.status; // optional filter by assignment status
    const offset = (page - 1) * limit;

    try {
        // Count
        const countQuery = status ?
            `SELECT COUNT(*) as total_count FROM booking_staff_assignments WHERE staff_profile_id = $1 AND status = $2` :
            `SELECT COUNT(*) as total_count FROM booking_staff_assignments WHERE staff_profile_id = $1`;

        const countParams = status ? [staff_profile_id, status] : [staff_profile_id];
        const countRes = await db.query(countQuery, countParams);
        const totalCount = parseInt(countRes.rows[0].total_count || 0);

        // Data query with salary totals per booking
        const dataQuery = `
            SELECT bsa.assignment_id, bsa.booking_id, bsa.service_start_date, bsa.service_end_date, bsa.daily_rate, bsa.amount_allocated, bsa.status,
                         b.client_id, b.status as booking_status, b.service_type, b.service_model,
                         c.full_name as client_name, p.full_name as patient_name,
                         COALESCE(salary_totals.total_salary, 0) as total_salary
            FROM booking_staff_assignments bsa
            LEFT JOIN bookings b ON bsa.booking_id = b.booking_id
            LEFT JOIN client_profiles c ON b.client_id = c.client_profile_id
            LEFT JOIN patient_profiles p ON b.patient_id = p.patient_id
            LEFT JOIN (
                SELECT staff_profile_id, booking_id, COALESCE(SUM(amount),0) as total_salary
                FROM transactions
                WHERE category = 'STAFF_SALARY' OR category = 'STAFF_SALARY_PAID'
                GROUP BY staff_profile_id, booking_id
            ) salary_totals ON salary_totals.staff_profile_id = bsa.staff_profile_id AND salary_totals.booking_id = bsa.booking_id
            WHERE bsa.staff_profile_id = $1
            ${status ? "AND bsa.status = $2" : ''}
            ORDER BY bsa.service_start_date DESC
            LIMIT $${status ? 3 : 2} OFFSET $${status ? 4 : 3}
        `;

        const dataParams = status ? [staff_profile_id, status, limit, offset] : [staff_profile_id, limit, offset];

        const dataRes = await db.query(dataQuery, dataParams);

        return res.status(200).json({
            status: 'success',
            data: dataRes.rows,
            pagination: {
                current_page: page,
                per_page: limit,
                total_count: totalCount,
                total_pages: Math.ceil(totalCount / limit)
            }
        });

    } catch (error) {
        console.error('getBookingHistory Error:', error);
        return res.status(500).json({ status: 'error', message: 'Server error while fetching booking history' });
    }
};

// Batched schedule lookup for staff-picker UIs: given a set of staff_profile_ids,
// returns each one's current + future commitments (status ACTIVE or SCHEDULED) so an
// admin assigning/swapping/reassigning staff can see at a glance whether the person
// they're about to pick is already busy on another booking around the same dates.
exports.getStaffSchedules = async (req, res) => {
    const idsParam = req.query.ids;
    if (!idsParam) return res.status(200).json({ status: 'success', data: {} });

    const ids = String(idsParam).split(',').map((s) => s.trim()).filter(Boolean);
    if (ids.length === 0) return res.status(200).json({ status: 'success', data: {} });

    try {
        const result = await db.query(`
            SELECT bsa.staff_profile_id, bsa.booking_id, bsa.status,
                   bsa.service_start_date,
                   COALESCE(bsa.service_end_date, sa.effective_date) AS service_end_date,
                   b.booking_code, b.service_model,
                   c.full_name AS client_name, p.full_name AS patient_name,
                   s.shift_number, s.label AS shift_label
            FROM booking_staff_assignments bsa
            JOIN bookings b ON bsa.booking_id = b.booking_id
            LEFT JOIN client_profiles c ON b.client_id = c.client_profile_id
            LEFT JOIN patient_profiles p ON b.patient_id = p.patient_id
            LEFT JOIN booking_shift_slots s ON bsa.shift_slot_id = s.shift_slot_id
            LEFT JOIN LATERAL (
                SELECT effective_date FROM scheduled_actions
                WHERE booking_id = bsa.booking_id
                  AND action_type IN ('TERMINATION', 'COMPLETION')
                  AND status = 'SCHEDULED'
                ORDER BY effective_date ASC
                LIMIT 1
            ) sa ON bsa.service_end_date IS NULL
            WHERE bsa.staff_profile_id = ANY($1::uuid[])
              AND bsa.status IN ('ACTIVE', 'SCHEDULED')
            ORDER BY bsa.staff_profile_id, bsa.service_start_date ASC
        `, [ids]);

        const byStaff = {};
        for (const id of ids) byStaff[id] = [];
        for (const row of result.rows) {
            (byStaff[row.staff_profile_id] ||= []).push(row);
        }

        return res.status(200).json({ status: 'success', data: byStaff });
    } catch (error) {
        console.error('getStaffSchedules Error:', error);
        return res.status(500).json({ status: 'error', message: 'Server error while fetching staff schedules' });
    }
};

// Future-dated assignments (status = 'SCHEDULED') for a staff member — bookings/shifts
// this staff member is queued to start on a future date but hasn't begun yet. Each row
// carries the matching scheduled_actions.action_id (if still open) so the admin can
// cancel the future assignment directly from the staff profile.
exports.getFutureBookings = async (req, res) => {
    const { staff_profile_id } = req.params;

    try {
        const dataRes = await db.query(`
            SELECT bsa.assignment_id, bsa.booking_id, bsa.assigned_on, bsa.service_start_date, bsa.daily_rate, bsa.amount_allocated, bsa.status,
                   b.status as booking_status, b.service_type, b.service_model,
                   c.full_name as client_name, p.full_name as patient_name,
                   s.shift_number, s.label as shift_label, s.start_time as shift_start_time,
                   sa.action_id
            FROM booking_staff_assignments bsa
            LEFT JOIN bookings b ON bsa.booking_id = b.booking_id
            LEFT JOIN client_profiles c ON b.client_id = c.client_profile_id
            LEFT JOIN patient_profiles p ON b.patient_id = p.patient_id
            LEFT JOIN booking_shift_slots s ON bsa.shift_slot_id = s.shift_slot_id
            LEFT JOIN scheduled_actions sa ON sa.action_type = 'ASSIGNMENT_START' AND sa.status = 'SCHEDULED'
                AND (sa.payload->>'assignment_id')::uuid = bsa.assignment_id
            WHERE bsa.staff_profile_id = $1 AND bsa.status = 'SCHEDULED'
            ORDER BY bsa.service_start_date ASC
        `, [staff_profile_id]);

        return res.status(200).json({ status: 'success', data: dataRes.rows });

    } catch (error) {
        console.error('getFutureBookings Error:', error);
        return res.status(500).json({ status: 'error', message: 'Server error while fetching future bookings' });
    }
};

// Full assignment span + daily attendance history for the staff calendar view.
// Unlike getBookingHistory (paginated, recent-first), this returns everything
// needed to render a continuous past/future calendar: every assignment this
// staff member has ever had (so future-dated/ongoing assignments show as
// "scheduled"), and every staff_daily_attendance row (so each day can be
// marked paid/pending/skipped with who decided it).
exports.getAttendanceCalendar = async (req, res) => {
    const { staff_profile_id } = req.params;

    try {
        const actorRole = _extractActorRole(req.user.role);
        if (!['SUPER_ADMIN', 'COORDINATOR', 'ACCOUNTS'].includes(actorRole)) {
            const ownProfile = await db.query(
                'SELECT staff_profile_id FROM staff_profiles WHERE user_id = $1',
                [req.user.user_id]
            );
            if (!ownProfile.rows.length || String(ownProfile.rows[0].staff_profile_id) !== String(staff_profile_id)) {
                return res.status(403).json({ status: 'error', message: 'Not authorized to view this attendance calendar' });
            }
        }

        const [assignmentsRes, attendanceRes, reschedulesRes, pendingResumptionsRes] = await Promise.all([
            db.query(`
                SELECT
                    bsa.assignment_id, bsa.booking_id, bsa.service_start_date, bsa.service_end_date,
                    bsa.daily_rate, bsa.status as assignment_status, bsa.shift_slot_id, bsa.reschedule_id,
                    ss.shift_number, ss.label as shift_label, ss.start_time as shift_start_time,
                    b.booking_code, b.status as booking_status, b.service_type, b.service_model,
                    c.full_name as client_name, p.full_name as patient_name,
                    pending_end.effective_date as pending_end_date, pending_end.action_type as pending_end_action_type
                FROM booking_staff_assignments bsa
                LEFT JOIN bookings b ON bsa.booking_id = b.booking_id
                LEFT JOIN client_profiles c ON b.client_id = c.client_profile_id
                LEFT JOIN patient_profiles p ON b.patient_id = p.patient_id
                LEFT JOIN booking_shift_slots ss ON bsa.shift_slot_id = ss.shift_slot_id
                LEFT JOIN LATERAL (
                    SELECT sa.effective_date, sa.action_type
                    FROM scheduled_actions sa
                    WHERE sa.booking_id = bsa.booking_id
                      AND sa.action_type IN ('COMPLETION', 'TERMINATION')
                      AND sa.status = 'SCHEDULED'
                    ORDER BY sa.effective_date ASC
                    LIMIT 1
                ) pending_end ON true
                WHERE bsa.staff_profile_id = $1
                ORDER BY bsa.service_start_date ASC
            `, [staff_profile_id]),
            db.query(`
                SELECT
                    attendance_id, booking_id, assignment_id, service_date::text as service_date,
                    in_time, out_time, hours_served, entry_mode, salary_status, salary_amount,
                    decided_by_name, decided_at, notes, shift_slot_id, reschedule_id
                FROM staff_daily_attendance
                WHERE staff_profile_id = $1
                ORDER BY service_date ASC
            `, [staff_profile_id]),
            db.query(`
                SELECT r.reschedule_id, r.booking_id, r.shift_slot_id, r.original_date::text, r.new_date::text, r.new_start_time::text
                FROM shift_reschedules r
                JOIN booking_staff_assignments bsa ON bsa.booking_id = r.booking_id
                WHERE bsa.staff_profile_id = $1 AND r.status = 'ACTIVE'
            `, [staff_profile_id]),
            // Bookings currently PAUSED (not yet resumed) with a fixed target resume date,
            // where this staff member was the one whose assignment closed exactly on the
            // pause date — i.e. they're expected back on this booking from that date, same
            // "projected" treatment CareTimeline gives the booking side of a pending resume.
            // scheduled_end_date (if any) caps how far the projection should be trusted.
            db.query(`
                SELECT
                    bp.booking_id, bp.resume_date::text as resume_date, bp.paused_date::text as paused_date,
                    b.daily_rate, c.full_name as client_name, p.full_name as patient_name,
                    (SELECT MIN(sa.effective_date)::text FROM scheduled_actions sa
                     WHERE sa.booking_id = bp.booking_id AND sa.action_type IN ('COMPLETION', 'TERMINATION') AND sa.status = 'SCHEDULED'
                    ) as scheduled_end_date
                FROM booking_pauses bp
                JOIN bookings b ON b.booking_id = bp.booking_id
                LEFT JOIN client_profiles c ON b.client_id = c.client_profile_id
                LEFT JOIN patient_profiles p ON b.patient_id = p.patient_id
                WHERE bp.resumed_at IS NULL
                  AND bp.resume_date IS NOT NULL
                  AND EXISTS (
                    SELECT 1 FROM booking_staff_assignments bsa
                    WHERE bsa.booking_id = bp.booking_id
                      AND bsa.staff_profile_id = $1
                      AND bsa.service_end_date::date = bp.paused_date::date
                  )
            `, [staff_profile_id])
        ]);

        return res.status(200).json({
            status: 'success',
            data: {
                assignments: assignmentsRes.rows,
                attendance: attendanceRes.rows,
                reschedules: reschedulesRes.rows,
                pending_resumptions: pendingResumptionsRes.rows
            }
        });
    } catch (error) {
        console.error('getAttendanceCalendar Error:', error);
        return res.status(500).json({ status: 'error', message: 'Server error while fetching attendance calendar' });
    }
};

// Paginated payouts history for a staff member
exports.getPayouts = async (req, res) => {
    const { staff_profile_id } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const status = req.query.status;
    const offset = (page - 1) * limit;

    try {
        const countQuery = status ? 
            `SELECT COUNT(*) as total_count FROM staff_payments_tracking WHERE staff_profile_id = $1 AND status = $2` :
            `SELECT COUNT(*) as total_count FROM staff_payments_tracking WHERE staff_profile_id = $1`;

        const countParams = status ? [staff_profile_id, status] : [staff_profile_id];
        const countRes = await db.query(countQuery, countParams);
        const totalCount = parseInt(countRes.rows[0].total_count || 0);

        const dataQuery = `
            SELECT spt.staff_payment_id, spt.transaction_id, spt.amount_paid, spt.payment_method, spt.reference_number, spt.notes,
                         spt.paid_by, u.email as paid_by_email, u.mobile_number as paid_by_mobile,
                         spt.company_bank_account_id, ba.account_nickname as company_account_name,
                         spt.staff_bank_account_id, spt.paid_at, spt.status, spt.created_at
            FROM staff_payments_tracking spt
            LEFT JOIN users u ON spt.paid_by = u.user_id
            LEFT JOIN bank_accounts ba ON spt.company_bank_account_id = ba.account_id
            WHERE spt.staff_profile_id = $1
            ${status ? 'AND spt.status = $2' : ''}
            ORDER BY spt.paid_at DESC
            LIMIT $${status ? 3 : 2} OFFSET $${status ? 4 : 3}
        `;

        const dataParams = status ? [staff_profile_id, status, limit, offset] : [staff_profile_id, limit, offset];
        const dataRes = await db.query(dataQuery, dataParams);

        return res.status(200).json({
            status: 'success',
            data: dataRes.rows,
            pagination: {
                current_page: page,
                per_page: limit,
                total_count: totalCount,
                total_pages: Math.ceil(totalCount / limit)
            }
        });

    } catch (error) {
        console.error('getPayouts Error:', error);
        return res.status(500).json({ status: 'error', message: 'Server error while fetching payouts' });
    }
};

// Payouts summary: all-time paid, paid this month, outstanding
exports.getPayoutsSummary = async (req, res) => {
    const { staff_profile_id } = req.params;

    try {
        const allTimeRes = await db.query(`
            SELECT COALESCE(SUM(amount_paid),0) as all_time_paid, COALESCE(COUNT(*),0) as payouts_count
            FROM staff_payments_tracking
            WHERE staff_profile_id = $1 AND status = 'COMPLETED'
        `, [staff_profile_id]);

        const monthRes = await db.query(`
            SELECT COALESCE(SUM(amount_paid),0) as paid_this_month
            FROM staff_payments_tracking
            WHERE staff_profile_id = $1 AND status = 'COMPLETED' AND paid_at >= date_trunc('month', now())
        `, [staff_profile_id]);

        const earningsRes = await db.query(`SELECT COALESCE(current_earnings,0) as current_earnings FROM staff_profiles WHERE staff_profile_id = $1`, [staff_profile_id]);
        if (earningsRes.rows.length === 0) {
            return res.status(404).json({ status: 'error', message: 'Staff not found' });
        }

        const all_time_paid = parseFloat(allTimeRes.rows[0].all_time_paid || 0);
        const payouts_count = parseInt(allTimeRes.rows[0].payouts_count || 0);
        const paid_this_month = parseFloat(monthRes.rows[0].paid_this_month || 0);
        const current_earnings = parseFloat(earningsRes.rows[0].current_earnings || 0);

        return res.status(200).json({
            status: 'success',
            data: {
                all_time_paid,
                paid_this_month,
                payouts_count,
                outstanding: current_earnings
            }
        });

    } catch (error) {
        console.error('getPayoutsSummary Error:', error);
        return res.status(500).json({ status: 'error', message: 'Server error while fetching payouts summary' });
    }
};

// --- Staff bank account management ---
// List staff bank accounts
exports.getStaffBankAccounts = async (req, res) => {
    const { staff_profile_id } = req.params;
    try {
        if (!(await _canAccessStaffRecord(req, staff_profile_id, 'VIEW_USER_MANAGEMENT'))) {
            return res.status(403).json({ status: 'error', message: 'Not authorized to view this staff member\'s bank accounts' });
        }
        const resDb = await db.query(
            `SELECT * FROM staff_bank_accounts WHERE staff_profile_id = $1 AND is_active = true ORDER BY created_at DESC`,
            [staff_profile_id]
        );
        return res.status(200).json({ status: 'success', data: resDb.rows });
    } catch (error) {
        console.error('getStaffBankAccounts Error:', error);
        return res.status(500).json({ status: 'error', message: 'Server error fetching staff bank accounts' });
    }
};

// Create a staff bank account (owner or admin)
exports.createStaffBankAccount = async (req, res) => {
    const { staff_profile_id } = req.params;
    const { account_holder_name, bank_name, branch_name, account_number, currency } = req.body;

    if (!account_holder_name || !bank_name || !account_number) {
        return res.status(400).json({ status: 'error', message: 'Missing required bank account fields' });
    }

    try {
        if (!(await _canAccessStaffRecord(req, staff_profile_id, 'STAFF_ADD_BANK_ACCOUNT'))) {
            return res.status(403).json({ status: 'error', message: 'Not authorized to add a bank account for this staff member' });
        }
        const staffRes = await db.query('SELECT user_id FROM staff_profiles WHERE staff_profile_id = $1', [staff_profile_id]);
        if (staffRes.rows.length === 0) return res.status(404).json({ status: 'error', message: 'Staff not found' });

        const insertRes = await db.query(
            `INSERT INTO staff_bank_accounts (staff_profile_id, account_holder_name, bank_name, branch_name, account_number, currency, is_verified, is_active)
             VALUES ($1,$2,$3,$4,$5,$6,false,true) RETURNING *`,
            [staff_profile_id, account_holder_name, bank_name, branch_name || null, account_number, currency || 'LKR']
        );

        try {
            const actorNameRes = await db.query('SELECT full_name FROM staff_profiles WHERE user_id = $1', [req.user.user_id]);
            const actorName = actorNameRes.rows[0]?.full_name || 'Admin';
            const actorRole = Array.isArray(req.user?.role) ? req.user.role[0] : req.user?.role;
            await logActivity({
                actorUserId: req.user.user_id,
                actorName,
                actorRole: typeof actorRole === 'string' ? actorRole.replace(/\{|\}/g, '').split(',')[0].trim() : String(actorRole),
                actionType: 'STAFF_BANK_ACCOUNT_CREATED',
                entityType: 'STAFF_BANK_ACCOUNT',
                entityId: String(insertRes.rows[0].staff_bank_account_id),
                details: { staff_profile_id, bank_name, account_holder_name },
            });
        } catch (logErr) {
            console.error('Activity log failed (createStaffBankAccount):', logErr.message);
        }

        return res.status(201).json({ status: 'success', data: insertRes.rows[0] });

    } catch (error) {
        console.error('createStaffBankAccount Error:', error);
        return res.status(500).json({ status: 'error', message: 'Server error creating bank account' });
    }
};

// Update a staff bank account (owner or admin)
exports.updateStaffBankAccount = async (req, res) => {
    const { staff_profile_id, staff_bank_account_id } = req.params;
    const { account_holder_name, bank_name, branch_name, account_number, currency, is_verified, is_active } = req.body;

    try {
        if (!(await _canAccessStaffRecord(req, staff_profile_id, 'STAFF_EDIT_BANK_ACCOUNT'))) {
            return res.status(403).json({ status: 'error', message: 'Not authorized to edit this staff member\'s bank account' });
        }

        const acctRes = await db.query('SELECT staff_profile_id FROM staff_bank_accounts WHERE staff_bank_account_id = $1', [staff_bank_account_id]);
        if (acctRes.rows.length === 0) return res.status(404).json({ status: 'error', message: 'Bank account not found' });

        // confirm it belongs to the provided staff_profile_id
        if (acctRes.rows[0].staff_profile_id !== staff_profile_id) {
            return res.status(400).json({ status: 'error', message: 'Bank account does not belong to the specified staff' });
        }

        const updateQuery = `
            UPDATE staff_bank_accounts SET
                account_holder_name = COALESCE($1, account_holder_name),
                bank_name = COALESCE($2, bank_name),
                branch_name = COALESCE($3, branch_name),
                account_number = COALESCE($4, account_number),
                currency = COALESCE($5, currency),
                is_verified = COALESCE($6, is_verified),
                is_active = COALESCE($7, is_active)
            WHERE staff_bank_account_id = $8
            RETURNING *
        `;

        const updateRes = await db.query(updateQuery, [account_holder_name, bank_name, branch_name, account_number, currency, is_verified, is_active, staff_bank_account_id]);

        try {
            const actorNameRes = await db.query('SELECT full_name FROM staff_profiles WHERE user_id = $1', [req.user.user_id]);
            const actorName = actorNameRes.rows[0]?.full_name || 'Admin';
            const actorRole = Array.isArray(req.user?.role) ? req.user.role[0] : req.user?.role;
            await logActivity({
                actorUserId: req.user.user_id,
                actorName,
                actorRole: typeof actorRole === 'string' ? actorRole.replace(/\{|\}/g, '').split(',')[0].trim() : String(actorRole),
                actionType: 'STAFF_BANK_ACCOUNT_UPDATED',
                entityType: 'STAFF_BANK_ACCOUNT',
                entityId: String(staff_bank_account_id),
                details: { staff_profile_id, bank_name, account_holder_name },
            });
        } catch (logErr) {
            console.error('Activity log failed (updateStaffBankAccount):', logErr.message);
        }

        return res.status(200).json({ status: 'success', data: updateRes.rows[0] });

    } catch (error) {
        console.error('updateStaffBankAccount Error:', error);
        return res.status(500).json({ status: 'error', message: 'Server error updating bank account' });
    }
};

// Soft-delete a staff bank account (owner or admin)
exports.deleteStaffBankAccount = async (req, res) => {
    const { staff_profile_id, staff_bank_account_id } = req.params;

    try {
        if (!(await _canAccessStaffRecord(req, staff_profile_id, 'STAFF_DELETE_BANK_ACCOUNT'))) {
            return res.status(403).json({ status: 'error', message: 'Not authorized to delete this staff member\'s bank account' });
        }

        const acctRes = await db.query('SELECT staff_profile_id FROM staff_bank_accounts WHERE staff_bank_account_id = $1', [staff_bank_account_id]);
        if (acctRes.rows.length === 0) return res.status(404).json({ status: 'error', message: 'Bank account not found' });
        if (acctRes.rows[0].staff_profile_id !== staff_profile_id) {
            return res.status(400).json({ status: 'error', message: 'Bank account does not belong to the specified staff' });
        }

        await db.query('UPDATE staff_bank_accounts SET is_active = false WHERE staff_bank_account_id = $1', [staff_bank_account_id]);

        try {
            const actorNameRes = await db.query('SELECT full_name FROM staff_profiles WHERE user_id = $1', [req.user.user_id]);
            const actorName = actorNameRes.rows[0]?.full_name || 'Admin';
            const actorRole = Array.isArray(req.user?.role) ? req.user.role[0] : req.user?.role;
            await logActivity({
                actorUserId: req.user.user_id,
                actorName,
                actorRole: typeof actorRole === 'string' ? actorRole.replace(/\{|\}/g, '').split(',')[0].trim() : String(actorRole),
                actionType: 'STAFF_BANK_ACCOUNT_DELETED',
                entityType: 'STAFF_BANK_ACCOUNT',
                entityId: String(staff_bank_account_id),
                details: { staff_profile_id },
            });
        } catch (logErr) {
            console.error('Activity log failed (deleteStaffBankAccount):', logErr.message);
        }

        return res.status(200).json({ status: 'success', message: 'Bank account deactivated' });

    } catch (error) {
        console.error('deleteStaffBankAccount Error:', error);
        return res.status(500).json({ status: 'error', message: 'Server error deleting bank account' });
    }
};

// Soft deactivate a staff account by disabling the linked user and marking the staff unavailable
exports.deactivateStaffAccount = async (req, res) => {
    const { staff_profile_id } = req.params;
    const client = await db.pool.connect();

    try {
        await client.query('BEGIN');

        const staffRes = await client.query(
            'SELECT user_id, is_active FROM staff_profiles WHERE staff_profile_id = $1 FOR UPDATE',
            [staff_profile_id]
        );

        if (staffRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ status: 'error', message: 'Staff not found' });
        }

        const userId = staffRes.rows[0].user_id;

        await client.query(
            'UPDATE users SET is_active = false WHERE user_id = $1',
            [userId]
        );

        const updateRes = await client.query(
            `UPDATE staff_profiles
             SET current_status = 'UNAVAILABLE'
             WHERE staff_profile_id = $1
             RETURNING staff_profile_id, full_name, current_status, is_active`,
            [staff_profile_id]
        );

        await client.query('COMMIT');

        try {
            const actorNameRes = await db.query('SELECT full_name FROM staff_profiles WHERE user_id = $1', [req.user.user_id]);
            const actorName = actorNameRes.rows[0]?.full_name || 'Admin';
            const actorRole = Array.isArray(req.user?.role) ? req.user.role[0] : req.user?.role;
            await logActivity({
                actorUserId: req.user.user_id,
                actorName,
                actorRole: typeof actorRole === 'string' ? actorRole.replace(/\{|\}/g, '').split(',')[0].trim() : String(actorRole),
                actionType: 'STAFF_ACCOUNT_DEACTIVATED',
                entityType: 'STAFF',
                entityId: String(staff_profile_id),
                details: { staff_name: updateRes.rows[0].full_name },
            });
        } catch (logErr) {
            console.error('Activity log failed (deactivateStaffAccount):', logErr.message);
        }

        return res.status(200).json({
            status: 'success',
            message: 'Staff account deactivated successfully',
            data: updateRes.rows[0]
        });
    } catch (error) {
        try { await client.query('ROLLBACK'); } catch (rollbackError) { /* ignore */ }
        console.error('deactivateStaffAccount Error:', error);
        return res.status(500).json({ status: 'error', message: 'Server error while deactivating staff account' });
    } finally {
        client.release();
    }
};

// Reactivate a staff account by enabling the linked user and restoring availability
exports.reactivateStaffAccount = async (req, res) => {
    const { staff_profile_id } = req.params;
    const client = await db.pool.connect();

    try {
        await client.query('BEGIN');

        const staffRes = await client.query(
            'SELECT user_id FROM staff_profiles WHERE staff_profile_id = $1 FOR UPDATE',
            [staff_profile_id]
        );

        if (staffRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ status: 'error', message: 'Staff not found' });
        }

        const userId = staffRes.rows[0].user_id;

        await client.query(
            'UPDATE users SET is_active = true WHERE user_id = $1',
            [userId]
        );

        const updateRes = await client.query(
            `UPDATE staff_profiles
             SET current_status = 'AVAILABLE'
             WHERE staff_profile_id = $1
             RETURNING staff_profile_id, full_name, current_status, is_active`,
            [staff_profile_id]
        );

        await client.query('COMMIT');

        try {
            const actorNameRes = await db.query('SELECT full_name FROM staff_profiles WHERE user_id = $1', [req.user.user_id]);
            const actorName = actorNameRes.rows[0]?.full_name || 'Admin';
            const actorRole = Array.isArray(req.user?.role) ? req.user.role[0] : req.user?.role;
            await logActivity({
                actorUserId: req.user.user_id,
                actorName,
                actorRole: typeof actorRole === 'string' ? actorRole.replace(/\{|\}/g, '').split(',')[0].trim() : String(actorRole),
                actionType: 'STAFF_ACCOUNT_REACTIVATED',
                entityType: 'STAFF',
                entityId: String(staff_profile_id),
                details: { staff_name: updateRes.rows[0].full_name },
            });
        } catch (logErr) {
            console.error('Activity log failed (reactivateStaffAccount):', logErr.message);
        }

        return res.status(200).json({
            status: 'success',
            message: 'Staff account reactivated successfully',
            data: updateRes.rows[0]
        });
    } catch (error) {
        try { await client.query('ROLLBACK'); } catch (rollbackError) { /* ignore */ }
        console.error('reactivateStaffAccount Error:', error);
        return res.status(500).json({ status: 'error', message: 'Server error while reactivating staff account' });
    } finally {
        client.release();
    }
};

// Get all staff members with optional filtering
exports.getAllStaff = async (req, res) => {
    try {
        // Optional query parameters for filtering
        const { status, verification_status, role, search = '', pending_migration = '', page = 1, limit = 10 } = req.query;

        // Build WHERE clause dynamically
        let whereClause = '';
        const queryParams = [];
        let paramIndex = 1;

        if (status) {
            whereClause += ` AND LOWER(sp.current_status) = $${paramIndex}`;
            queryParams.push(status.toLowerCase());
            paramIndex++;
        }

        if (verification_status) {
            whereClause += ` AND sp.verification_status = $${paramIndex}`;
            queryParams.push(verification_status);
            paramIndex++;
        }

        if (role) {
            whereClause += ` AND u.role @> ARRAY[$${paramIndex}]::user_role_enum[]`;
            queryParams.push(role);
            paramIndex++;
        }

        if (pending_migration === 'true') {
            whereClause += ` AND sp.onboarding_status = 'PENDING_MIGRATION'`;
        }

        if (search) {
            whereClause += ` AND (sp.full_name ILIKE $${paramIndex} OR u.mobile_number ILIKE $${paramIndex} OR sp.staff_code ILIKE $${paramIndex} OR sp.designation ILIKE $${paramIndex})`;
            queryParams.push(`%${search}%`);
            paramIndex++;
        }

        // Pagination
        const offset = (page - 1) * limit;

        // Tab/badge counts always reflect the full dataset, independent of the
        // current filters — mirrors clientController.getAllClients' counts behavior.
        const countsRes = await db.query(`
            SELECT
              COUNT(*) AS all_count,
              COUNT(*) FILTER (WHERE LOWER(sp.current_status) = 'available') AS available_count,
              COUNT(*) FILTER (WHERE LOWER(sp.current_status) = 'unavailable') AS unavailable_count,
              COUNT(*) FILTER (WHERE LOWER(sp.current_status) = 'assigned') AS assigned_count,
              COUNT(*) FILTER (WHERE sp.onboarding_status = 'PENDING_MIGRATION') AS pending_migration_count
            FROM staff_profiles sp
            JOIN users u ON sp.user_id = u.user_id
        `);

        const countQuery = `
            SELECT COUNT(*) as total_count
            FROM staff_profiles sp
            JOIN users u ON sp.user_id = u.user_id
            WHERE 1=1 ${whereClause}
        `;

        const query = `
            SELECT
                sp.staff_profile_id,
                sp.full_name,
                sp.designation,
                sp.qualifications,
                sp.document_urls,
                sp.home_address,
                sp.location,
                sp.gps_coordinates,
                sp.profile_picture_url,
                sp.current_status,
                sp.verification_status,
                sp.gender,
                sp.willing_to_live_in,
                sp.date_of_birth,
                sp.experience_level,
                sp.doc_upload_token,
                sp.grama_niladhari_url,
                sp.police_report_url,
                sp.admin_remarks,
                sp.created_at,
                sp.advance_threshold_amount,
                sp.current_earnings,
                sp.nic_number,
                sp.nic_front_url,
                sp.nic_back_url,
                sp.staff_code,
                sp.onboarding_status,
                CAST(sp.average_rating AS FLOAT) as average_rating,
                u.user_id,
                u.email,
                u.mobile_number,
                u.role,
                u.is_active,
                u.is_email_verified,
                u.created_at as user_created_at,
                active_assign.service_end_date as active_assignment_end_date,
                active_assign.booking_client_name as active_assignment_client
            FROM staff_profiles sp
            JOIN users u ON sp.user_id = u.user_id
            LEFT JOIN LATERAL (
                SELECT bsa.service_end_date,
                       COALESCE(cp.full_name, sr.payer_name) AS booking_client_name
                FROM booking_staff_assignments bsa
                JOIN bookings b ON bsa.booking_id = b.booking_id
                LEFT JOIN client_profiles cp ON b.client_id = cp.client_profile_id
                LEFT JOIN service_requests sr ON b.request_id = sr.request_id
                WHERE bsa.staff_profile_id = sp.staff_profile_id
                  AND bsa.status IN ('ACTIVE', 'SCHEDULED')
                ORDER BY bsa.service_start_date DESC
                LIMIT 1
            ) active_assign ON true
            WHERE 1=1 ${whereClause}
            ORDER BY sp.created_at DESC
            LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
        `;

        queryParams.push(limit, offset);

        // Execute both queries in parallel
        const [countResult, dataResult] = await Promise.all([
            db.query(countQuery, queryParams.slice(0, -2)), // Exclude limit and offset for count
            db.query(query, queryParams)
        ]);

        console.log('All fields returned:', Object.keys(dataResult.rows[0] || {}));
        console.log('Average rating present:', 'average_rating' in (dataResult.rows[0] || {}));
        const totalCount = parseInt(countResult.rows[0].total_count);
        const totalPages = Math.ceil(totalCount / limit);
        const c = countsRes.rows[0];

        res.status(200).json({
            status: 'success',
            data: dataResult.rows,
            pagination: {
                current_page: parseInt(page),
                total_pages: totalPages,
                total_count: totalCount,
                per_page: parseInt(limit),
                has_next: page < totalPages,
                has_prev: page > 1
            },
            counts: {
                All: parseInt(c.all_count, 10),
                available: parseInt(c.available_count, 10),
                unavailable: parseInt(c.unavailable_count, 10),
                assigned: parseInt(c.assigned_count, 10),
                pending_migration: parseInt(c.pending_migration_count, 10),
            }
        });

    } catch (error) {
        console.error('Get All Staff Error:', error);
        res.status(500).json({
            status: 'error',
            message: 'Server error while fetching staff members'
        });
    }
};

// Get all staff members with current_status as 'available'
exports.getAvailableStaff = async (req, res) => {
    try {
        const query = `
            SELECT 
                sp.staff_profile_id,
                sp.full_name,
                sp.designation,
                sp.qualifications,
                sp.document_urls,
                sp.home_address,
                sp.location,
                sp.gps_coordinates,
                sp.profile_picture_url,
                sp.current_status,
                sp.verification_status,
                sp.gender,
                sp.willing_to_live_in,
                sp.date_of_birth,
                sp.experience_level,
                sp.doc_upload_token,
                sp.grama_niladhari_url,
                sp.police_report_url,
                sp.created_at,
                sp.advance_threshold_amount,
                CAST(sp.average_rating AS FLOAT) as average_rating,
                u.user_id,
                u.email,
                u.mobile_number,
                u.role,
                u.is_active,
                u.is_email_verified,
                u.created_at as user_created_at
            FROM staff_profiles sp
            JOIN users u ON sp.user_id = u.user_id
            WHERE sp.current_status = 'AVAILABLE'
            ORDER BY sp.created_at DESC
        `;

        const result = await db.query(query);

        res.status(200).json({
            status: 'success',
            data: result.rows,
            count: result.rows.length
        });

    } catch (error) {
        console.error('Get Available Staff Error:', error);
        res.status(500).json({
            status: 'error',
            message: 'Server error while fetching available staff members'
        });
    }
};

// Update staff member status to unavailable
exports.updateStaffToUnavailable = async (req, res) => {
    const { staff_profile_id } = req.params;

    try {
        const query = `
            UPDATE staff_profiles 
            SET current_status = 'UNAVAILABLE'
            WHERE staff_profile_id = $1
            RETURNING staff_profile_id, full_name, current_status
        `;

        const result = await db.query(query, [staff_profile_id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ 
                status: 'error',
                message: 'Staff member not found' 
            });
        }

        res.status(200).json({
            status: 'success',
            message: 'Staff member status updated to unavailable',
            data: result.rows[0]
        });

    } catch (error) {
        console.error('Update Staff to Unavailable Error:', error);
        res.status(500).json({ 
            status: 'error',
            message: 'Server error while updating staff member status' 
        });
    }
};

// Update staff member status (general method)
exports.updateStaffStatus = async (req, res) => {
    const { staff_profile_id } = req.params;
    const { current_status } = req.body;

    try {
        const query = `
            UPDATE staff_profiles 
            SET current_status = $1
            WHERE staff_profile_id = $2
            RETURNING staff_profile_id, full_name, current_status
        `;

        const result = await db.query(query, [current_status, staff_profile_id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ 
                status: 'error',
                message: 'Staff member not found' 
            });
        }

        res.status(200).json({
            status: 'success',
            message: `Staff member status updated to ${current_status}`,
            data: result.rows[0]
        });

    } catch (error) {
        console.error('Update Staff Status Error:', error);
        res.status(500).json({
            status: 'error',
            message: 'Server error while updating staff member status'
        });
    }
};

const VALID_EXPERIENCE_LEVELS = ['BEGINNER', '1_YEAR', '2_YEARS', '3_YEARS', '4_YEARS', '5_YEARS', 'MORE_THAN_5_YEARS'];

// Update a staff member's years of experience.
// Admins can set this for any staff member; staff can only set their own (enforced below).
exports.updateStaffExperienceLevel = async (req, res) => {
    const { staff_profile_id } = req.params;
    const { experience_level } = req.body;

    if (!VALID_EXPERIENCE_LEVELS.includes(experience_level)) {
        return res.status(400).json({
            status: 'error',
            message: `Invalid experience level. Must be one of: ${VALID_EXPERIENCE_LEVELS.join(', ')}`
        });
    }

    try {
        const result = await db.query(
            `UPDATE staff_profiles
             SET experience_level = $1
             WHERE staff_profile_id = $2
             RETURNING staff_profile_id, full_name, experience_level`,
            [experience_level, staff_profile_id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                status: 'error',
                message: 'Staff member not found'
            });
        }

        res.status(200).json({
            status: 'success',
            message: 'Experience level updated successfully',
            data: result.rows[0]
        });

    } catch (error) {
        console.error('Update Staff Experience Level Error:', error);
        res.status(500).json({
            status: 'error',
            message: 'Server error while updating experience level'
        });
    }
};

// Record a payout to a staff member (company -> staff personal account)
exports.createStaffPayout = async (req, res) => {
        const { staff_profile_id } = req.params;
        const {
            amount,
            company_bank_account_id,
            staff_bank_account_id,
            payment_method,
            reference_number,
            notes,
            month_year,
        } = req.body;

        if (!amount || isNaN(amount) || Number(amount) <= 0) {
            return res.status(400).json({ status: 'error', message: 'Invalid amount' });
        }

        if (payment_method && !_VALID_PAYOUT_METHODS.includes(payment_method)) {
            return res.status(400).json({ status: 'error', message: `payment_method must be one of: ${_VALID_PAYOUT_METHODS.join(', ')}` });
        }

        if (payment_method === 'BANK_TRANSFER' && !company_bank_account_id) {
            return res.status(400).json({ status: 'error', message: 'company_bank_account_id is required for BANK_TRANSFER' });
        }

        const client = await db.pool.connect();
        try {
            await client.query('BEGIN');

            // Lock staff profile row to prevent race conditions
            const sel = await client.query(
                `SELECT current_earnings FROM staff_profiles WHERE staff_profile_id = $1 FOR UPDATE`,
                [staff_profile_id]
            );

            if (sel.rows.length === 0) {
                await client.query('ROLLBACK');
                return res.status(404).json({ status: 'error', message: 'Staff profile not found' });
            }

            const currentEarnings = parseFloat(sel.rows[0].current_earnings || 0);
            const payoutAmount = parseFloat(amount);

            if (payoutAmount > currentEarnings) {
                await client.query('ROLLBACK');
                return res.status(400).json({ status: 'error', message: 'Insufficient staff balance for payout' });
            }

            const newEarnings = (currentEarnings - payoutAmount).toFixed(2);

            await client.query(`UPDATE staff_profiles SET current_earnings = $1 WHERE staff_profile_id = $2`, [newEarnings, staff_profile_id]);

            await client.query(
                `UPDATE staff_wallet SET balance = GREATEST(balance - $1, 0), updated_at = NOW() WHERE staff_profile_id = $2`,
                [payoutAmount, staff_profile_id]
            );

            // A CASH payout is physical cash paid out of the till — route it to Petty Cash.
            const resolvedCompanyBankAccountId = await resolveBankAccountId(payment_method, company_bank_account_id);

            // Insert into transactions ledger
            const insertTrans = await client.query(
                `INSERT INTO transactions (staff_profile_id, category, amount, transaction_type, bank_account_id, payment_method, reference_number, verified_by, status, created_at)
                 VALUES ($1, 'STAFF_SALARY_PAID', $2, 'DEBIT', $3, $4, $5, $6, 'COMPLETED', NOW()) RETURNING transaction_id`,
                [staff_profile_id, payoutAmount, resolvedCompanyBankAccountId, payment_method || null, reference_number || null, req.user.user_id]
            );

            const transaction_id = insertTrans.rows[0].transaction_id;

            // Insert into staff_payments_tracking for audit
            const insertPayment = await client.query(
                `INSERT INTO staff_payments_tracking (staff_profile_id, company_bank_account_id, staff_bank_account_id, transaction_id, amount_paid, payment_method, reference_number, notes, paid_by, paid_at, status, created_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), 'COMPLETED', NOW())
                 RETURNING staff_payment_id`,
                [staff_profile_id, resolvedCompanyBankAccountId, staff_bank_account_id || null, transaction_id, payoutAmount, payment_method || null, reference_number || null, notes || null, req.user.user_id]
            );
            const staffPaymentId = insertPayment.rows[0].staff_payment_id;

            await client.query('COMMIT');

            try {
                const actorNameRes = await db.query('SELECT full_name FROM staff_profiles WHERE user_id = $1', [req.user.user_id]);
                const actorName = actorNameRes.rows[0]?.full_name || 'Admin';
                const actorRole = Array.isArray(req.user?.role) ? req.user.role[0] : req.user?.role;
                await logActivity({
                    actorUserId: req.user.user_id,
                    actorName,
                    actorRole: typeof actorRole === 'string' ? actorRole.replace(/\{|\}/g, '').split(',')[0].trim() : String(actorRole),
                    actionType: 'STAFF_PAYOUT_CREATED',
                    entityType: 'STAFF_PAYOUT',
                    entityId: String(transaction_id),
                    details: { staff_profile_id, amount: payoutAmount, payment_method: payment_method || null },
                });
            } catch (logErr) {
                console.error('Activity log failed (createStaffPayout):', logErr.message);
            }

            _sendSalaryPayoutNotifications(staff_profile_id, payoutAmount, payment_method, reference_number, notes, staffPaymentId, month_year || null, false)
                .catch(err => console.error('[Salary Notification] createStaffPayout:', err.message));

            return res.status(201).json({ status: 'success', message: 'Payout recorded', data: { transaction_id } });

        } catch (error) {
            console.error('createStaffPayout Error:', error);
            try { await client.query('ROLLBACK'); } catch (e) { /* ignore */ }
            return res.status(500).json({ status: 'error', message: 'Server error while recording payout' });
        } finally {
            client.release();
        }
};

// Apply a manual deduction to a staff member's earnings and wallet
exports.createStaffDeduction = async (req, res) => {
    const { staff_profile_id } = req.params;
    const { amount, reason } = req.body;

    if (!amount || isNaN(amount) || Number(amount) <= 0) {
        return res.status(400).json({ status: 'error', message: 'Invalid amount' });
    }
    if (!reason || !String(reason).trim()) {
        return res.status(400).json({ status: 'error', message: 'Reason is required' });
    }

    const client = await db.pool.connect();
    try {
        await client.query('BEGIN');

        const sel = await client.query(
            `SELECT sp.current_earnings, sp.full_name, u.mobile_number,
                    COALESCE(sw.balance, 0) AS wallet_balance
             FROM staff_profiles sp
             JOIN users u ON u.user_id = sp.user_id
             LEFT JOIN staff_wallet sw ON sw.staff_profile_id = sp.staff_profile_id
             WHERE sp.staff_profile_id = $1
             FOR UPDATE OF sp`,
            [staff_profile_id]
        );

        if (!sel.rows.length) {
            await client.query('ROLLBACK');
            return res.status(404).json({ status: 'error', message: 'Staff profile not found' });
        }

        const { current_earnings, full_name, mobile_number, wallet_balance } = sel.rows[0];
        const deductionAmount = parseFloat(amount);
        const trimmedReason = String(reason).trim();

        const newEarnings = Math.max(0, parseFloat(current_earnings || 0) - deductionAmount).toFixed(2);
        await client.query(
            `UPDATE staff_profiles SET current_earnings = $1 WHERE staff_profile_id = $2`,
            [newEarnings, staff_profile_id]
        );

        await client.query(
            `UPDATE staff_wallet SET balance = GREATEST(balance - $1, 0), updated_at = NOW()
             WHERE staff_profile_id = $2`,
            [deductionAmount, staff_profile_id]
        );

        const insertTrans = await client.query(
            `INSERT INTO transactions (staff_profile_id, category, amount, transaction_type, notes, created_by, verified_by, status, created_at)
             VALUES ($1, 'STAFF_DEDUCTION', $2, 'DEBIT', $3, $4, $4, 'COMPLETED', NOW())
             RETURNING transaction_id`,
            [staff_profile_id, deductionAmount, trimmedReason, req.user.user_id]
        );
        const transaction_id = insertTrans.rows[0].transaction_id;

        await client.query(
            `INSERT INTO staff_wallet_transactions (staff_profile_id, type, amount, reason, reference_id, created_at)
             VALUES ($1, 'DEBIT', $2, 'MANUAL_DEDUCTION', $3, NOW())`,
            [staff_profile_id, deductionAmount, transaction_id]
        );

        await client.query('COMMIT');

        try {
            const actorNameRes = await db.query('SELECT full_name FROM staff_profiles WHERE user_id = $1', [req.user.user_id]);
            const actorName = actorNameRes.rows[0]?.full_name || 'Admin';
            const actorRole = Array.isArray(req.user?.role) ? req.user.role[0] : req.user?.role;
            await logActivity({
                actorUserId: req.user.user_id,
                actorName,
                actorRole: typeof actorRole === 'string' ? actorRole.replace(/\{|\}/g, '').split(',')[0].trim() : String(actorRole),
                actionType: 'DEDUCTION_APPLIED',
                entityType: 'STAFF',
                entityId: String(staff_profile_id),
                details: { staff_name: full_name, amount: deductionAmount, reason: trimmedReason },
            });
        } catch (logErr) {
            console.error('Activity log failed (createStaffDeduction):', logErr.message);
        }

        if (mobile_number) {
            const formattedDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
            const formattedAmount = `Rs. ${deductionAmount.toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

            try {
                await sendStaffDeductionNotice(mobile_number, full_name, formattedAmount, trimmedReason, formattedDate);
            } catch (waErr) {
                console.error('WhatsApp deduction notice failed:', waErr.message);
            }

            try {
                await sendSms(mobile_number, `VCare: Dear ${full_name}, a deduction of ${formattedAmount} has been applied to your earnings. Reason: ${trimmedReason}. Date: ${formattedDate}. Contact us for queries.`);
            } catch (smsErr) {
                console.error('SMS deduction notice failed:', smsErr.message);
            }
        }

        return res.status(201).json({ status: 'success', message: 'Deduction applied', data: { transaction_id } });

    } catch (error) {
        console.error('createStaffDeduction Error:', error);
        try { await client.query('ROLLBACK'); } catch (e) { /* ignore */ }
        return res.status(500).json({ status: 'error', message: 'Server error while applying deduction' });
    } finally {
        client.release();
    }
};

// Get deduction history for a staff member
exports.getStaffDeductions = async (req, res) => {
    const { staff_profile_id } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;

    try {
        const [countRes, dataRes] = await Promise.all([
            db.query(
                `SELECT COUNT(*) AS total_count FROM transactions WHERE staff_profile_id = $1 AND category = 'STAFF_DEDUCTION'`,
                [staff_profile_id]
            ),
            db.query(
                `SELECT t.transaction_id, t.amount, t.notes AS reason, t.created_at, t.status,
                        sp.full_name AS recorded_by
                 FROM transactions t
                 LEFT JOIN staff_profiles sp ON sp.user_id = t.created_by
                 WHERE t.staff_profile_id = $1 AND t.category = 'STAFF_DEDUCTION'
                 ORDER BY t.created_at DESC
                 LIMIT $2 OFFSET $3`,
                [staff_profile_id, limit, offset]
            ),
        ]);

        return res.json({
            status: 'success',
            data: dataRes.rows,
            pagination: {
                current_page: page,
                per_page: limit,
                total_count: parseInt(countRes.rows[0].total_count),
                total_pages: Math.ceil(parseInt(countRes.rows[0].total_count) / limit),
            },
        });
    } catch (error) {
        console.error('getStaffDeductions Error:', error);
        return res.status(500).json({ status: 'error', message: 'Server error' });
    }
};

// ── Admin Notes (multiple notes per staff profile) ──────────────────────────
const _actorRole = (role) => {
    const raw = Array.isArray(role) ? role[0] : role;
    return typeof raw === 'string' ? raw.replace(/\{|\}/g, '').split(',')[0].trim() : String(raw);
};
const _logNoteActivity = async (req, actionType, staffProfileId, details) => {
    try {
        const r = await db.query('SELECT full_name FROM staff_profiles WHERE user_id = $1', [req.user.user_id]);
        await logActivity({
            actorUserId: req.user.user_id,
            actorName: r.rows[0]?.full_name || 'Admin',
            actorRole: _actorRole(req.user?.role),
            actionType,
            entityType: 'STAFF',
            entityId: String(staffProfileId),
            details,
        });
    } catch (e) {
        console.error('Admin note activity log failed:', e.message);
    }
};

exports.getStaffAdminNotes = async (req, res) => {
    const { staff_profile_id } = req.params;
    try {
        const result = await db.query(
            `SELECT n.note_id, n.note, n.created_at, n.updated_at,
                    sp.full_name AS author_name
             FROM staff_admin_notes n
             LEFT JOIN staff_profiles sp ON sp.user_id = n.created_by
             WHERE n.staff_profile_id = $1
             ORDER BY n.created_at DESC`,
            [staff_profile_id]
        );
        return res.json({ status: 'success', data: result.rows });
    } catch (error) {
        console.error('getStaffAdminNotes Error:', error);
        return res.status(500).json({ status: 'error', message: 'Server error' });
    }
};

exports.createStaffAdminNote = async (req, res) => {
    const { staff_profile_id } = req.params;
    const { note } = req.body;

    if (!note || !String(note).trim()) {
        return res.status(400).json({ status: 'error', message: 'Note text is required' });
    }

    try {
        const staffRes = await db.query(
            'SELECT full_name FROM staff_profiles WHERE staff_profile_id = $1',
            [staff_profile_id]
        );
        if (!staffRes.rows.length) {
            return res.status(404).json({ status: 'error', message: 'Staff profile not found' });
        }

        const inserted = await db.query(
            `INSERT INTO staff_admin_notes (staff_profile_id, note, created_by)
             VALUES ($1, $2, $3)
             RETURNING note_id, note, created_at, updated_at`,
            [staff_profile_id, String(note).trim(), req.user.user_id]
        );

        await _logNoteActivity(req, 'STAFF_NOTE_ADDED', staff_profile_id, {
            staff_name: staffRes.rows[0].full_name, note: String(note).trim(),
        });

        return res.status(201).json({ status: 'success', data: inserted.rows[0] });
    } catch (error) {
        console.error('createStaffAdminNote Error:', error);
        return res.status(500).json({ status: 'error', message: 'Server error' });
    }
};

exports.updateStaffAdminNote = async (req, res) => {
    const { staff_profile_id, note_id } = req.params;
    const { note } = req.body;

    if (!note || !String(note).trim()) {
        return res.status(400).json({ status: 'error', message: 'Note text is required' });
    }

    try {
        const updated = await db.query(
            `UPDATE staff_admin_notes
             SET note = $1, updated_at = CURRENT_TIMESTAMP
             WHERE note_id = $2 AND staff_profile_id = $3
             RETURNING note_id, note, created_at, updated_at`,
            [String(note).trim(), note_id, staff_profile_id]
        );

        if (!updated.rows.length) {
            return res.status(404).json({ status: 'error', message: 'Note not found' });
        }

        await _logNoteActivity(req, 'STAFF_NOTE_UPDATED', staff_profile_id, { note: String(note).trim() });

        return res.json({ status: 'success', data: updated.rows[0] });
    } catch (error) {
        console.error('updateStaffAdminNote Error:', error);
        return res.status(500).json({ status: 'error', message: 'Server error' });
    }
};

exports.deleteStaffAdminNote = async (req, res) => {
    const { staff_profile_id, note_id } = req.params;
    try {
        const deleted = await db.query(
            `DELETE FROM staff_admin_notes
             WHERE note_id = $1 AND staff_profile_id = $2
             RETURNING note_id`,
            [note_id, staff_profile_id]
        );

        if (!deleted.rows.length) {
            return res.status(404).json({ status: 'error', message: 'Note not found' });
        }

        await _logNoteActivity(req, 'STAFF_NOTE_DELETED', staff_profile_id, { note_id });

        return res.json({ status: 'success', message: 'Note deleted' });
    } catch (error) {
        console.error('deleteStaffAdminNote Error:', error);
        return res.status(500).json({ status: 'error', message: 'Server error' });
    }
};

// Get staff members by their role
exports.getStaffByRole = async (req, res) => {
    try {
        const { role } = req.params;
        const { page = 1, limit = 10, status, verification_status } = req.query;
        
        // Build WHERE clause dynamically
        let whereClause = ' AND u.role @> ARRAY[$1]::user_role_enum[]';
        const queryParams = [role];
        let paramIndex = 2;

        if (status) {
            whereClause += ` AND sp.current_status = $${paramIndex}`;
            queryParams.push(status);
            paramIndex++;
        }

        if (verification_status) {
            whereClause += ` AND sp.verification_status = $${paramIndex}`;
            queryParams.push(verification_status);
            paramIndex++;
        }

        // Pagination
        const offset = (page - 1) * limit;
        
        const countQuery = `
            SELECT COUNT(*) as total_count
            FROM staff_profiles sp
            JOIN users u ON sp.user_id = u.user_id
            WHERE 1=1 ${whereClause}
        `;

        const query = `
            SELECT 
                sp.staff_profile_id,
                sp.full_name,
                sp.qualifications,
                sp.document_urls,
                sp.home_address,
                sp.gps_coordinates,
                sp.profile_picture_url,
                sp.current_status,
                sp.verification_status,
                sp.gender,
                sp.willing_to_live_in,
                sp.date_of_birth,
                sp.created_at,
                CAST(sp.average_rating AS FLOAT) as average_rating,
                u.user_id,
                u.email,
                u.mobile_number,
                u.role,
                u.is_active,
                u.is_email_verified,
                u.created_at as user_created_at
            FROM staff_profiles sp
            JOIN users u ON sp.user_id = u.user_id
            WHERE 1=1 ${whereClause}
            ORDER BY sp.created_at DESC
            LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
        `;

        queryParams.push(limit, offset);

        // Execute both queries in parallel
        const [countResult, dataResult] = await Promise.all([
            db.query(countQuery, queryParams.slice(0, -2)), // Exclude limit and offset for count
            db.query(query, queryParams)
        ]);

        console.log('All fields returned:', Object.keys(dataResult.rows[0] || {}));
        console.log('Average rating present:', 'average_rating' in (dataResult.rows[0] || {}));
        const totalCount = parseInt(countResult.rows[0].total_count);
        const totalPages = Math.ceil(totalCount / limit);

        res.status(200).json({
            status: 'success',
            data: dataResult.rows,
            pagination: {
                current_page: parseInt(page),
                total_pages: totalPages,
                total_count: totalCount,
                per_page: parseInt(limit),
                has_next: page < totalPages,
                has_prev: page > 1
            }
        });

    } catch (error) {
        console.error('Get Staff by Role Error:', error);
        res.status(500).json({ 
            status: 'error',
            message: 'Server error while fetching staff members by role' 
        });
    }
};

// Get staff members by their gender
exports.getStaffByGender = async (req, res) => {
    try {
        const { gender } = req.params;
        const { page = 1, limit = 10, status, verification_status } = req.query;
        
        // Build WHERE clause dynamically
        let whereClause = ' AND sp.gender = $1';
        const queryParams = [gender];
        let paramIndex = 2;

        if (status) {
            whereClause += ` AND sp.current_status = $${paramIndex}`;
            queryParams.push(status);
            paramIndex++;
        }

        if (verification_status) {
            whereClause += ` AND sp.verification_status = $${paramIndex}`;
            queryParams.push(verification_status);
            paramIndex++;
        }

        // Pagination
        const offset = (page - 1) * limit;
        
        const countQuery = `
            SELECT COUNT(*) as total_count
            FROM staff_profiles sp
            JOIN users u ON sp.user_id = u.user_id
            WHERE 1=1 ${whereClause}
        `;

        const query = `
            SELECT 
                sp.staff_profile_id,
                sp.full_name,
                sp.qualifications,
                sp.document_urls,
                sp.home_address,
                sp.gps_coordinates,
                sp.profile_picture_url,
                sp.current_status,
                sp.verification_status,
                sp.gender,
                sp.willing_to_live_in,
                sp.date_of_birth,
                sp.created_at,
                u.user_id,
                u.email,
                u.mobile_number,
                u.role,
                u.is_active,
                u.is_email_verified,
                u.created_at as user_created_at
            FROM staff_profiles sp
            JOIN users u ON sp.user_id = u.user_id
            WHERE 1=1 ${whereClause}
            ORDER BY sp.created_at DESC
            LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
        `;

        queryParams.push(limit, offset);

        // Execute both queries in parallel
        const [countResult, dataResult] = await Promise.all([
            db.query(countQuery, queryParams.slice(0, -2)), // Exclude limit and offset for count
            db.query(query, queryParams)
        ]);

        console.log('All fields returned:', Object.keys(dataResult.rows[0] || {}));
        console.log('Average rating present:', 'average_rating' in (dataResult.rows[0] || {}));
        const totalCount = parseInt(countResult.rows[0].total_count);
        const totalPages = Math.ceil(totalCount / limit);

        res.status(200).json({
            status: 'success',
            data: dataResult.rows,
            pagination: {
                current_page: parseInt(page),
                total_pages: totalPages,
                total_count: totalCount,
                per_page: parseInt(limit),
                has_next: page < totalPages,
                has_prev: page > 1
            }
        });

    } catch (error) {
        console.error('Get Staff by Gender Error:', error);
        res.status(500).json({ 
            status: 'error',
            message: 'Server error while fetching staff members by gender' 
        });
    }
};

// Get staff members who are willing to live in with clients
exports.getStaffWillingToLiveIn = async (req, res) => {
    try {
        const { page = 1, limit = 10, status, verification_status, role } = req.query;
        
        // Build WHERE clause dynamically
        let whereClause = ' AND sp.willing_to_live_in = TRUE';
        const queryParams = [];
        let paramIndex = 1;

        if (status) {
            whereClause += ` AND sp.current_status = $${paramIndex}`;
            queryParams.push(status);
            paramIndex++;
        }

        if (verification_status) {
            whereClause += ` AND sp.verification_status = $${paramIndex}`;
            queryParams.push(verification_status);
            paramIndex++;
        }

        if (role) {
            whereClause += ` AND u.role @> ARRAY[$${paramIndex}]::user_role_enum[]`;
            queryParams.push(role);
            paramIndex++;
        }

        // Pagination
        const offset = (page - 1) * limit;
        
        const countQuery = `
            SELECT COUNT(*) as total_count
            FROM staff_profiles sp
            JOIN users u ON sp.user_id = u.user_id
            WHERE 1=1 ${whereClause}
        `;

        const query = `
            SELECT 
                sp.staff_profile_id,
                sp.full_name,
                sp.qualifications,
                sp.document_urls,
                sp.home_address,
                sp.gps_coordinates,
                sp.profile_picture_url,
                sp.current_status,
                sp.verification_status,
                sp.gender,
                sp.willing_to_live_in,
                sp.date_of_birth,
                sp.created_at,
                u.user_id,
                u.email,
                u.mobile_number,
                u.role,
                u.is_active,
                u.is_email_verified,
                u.created_at as user_created_at
            FROM staff_profiles sp
            JOIN users u ON sp.user_id = u.user_id
            WHERE 1=1 ${whereClause}
            ORDER BY sp.created_at DESC
            LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
        `;

        queryParams.push(limit, offset);

        // Execute both queries in parallel
        const [countResult, dataResult] = await Promise.all([
            db.query(countQuery, queryParams.slice(0, -2)), // Exclude limit and offset for count
            db.query(query, queryParams)
        ]);

        console.log('All fields returned:', Object.keys(dataResult.rows[0] || {}));
        console.log('Average rating present:', 'average_rating' in (dataResult.rows[0] || {}));
        const totalCount = parseInt(countResult.rows[0].total_count);
        const totalPages = Math.ceil(totalCount / limit);

        res.status(200).json({
            status: 'success',
            data: dataResult.rows,
            pagination: {
                current_page: parseInt(page),
                total_pages: totalPages,
                total_count: totalCount,
                per_page: parseInt(limit),
                has_next: page < totalPages,
                has_prev: page > 1
            }
        });

    } catch (error) {
        console.error('Get Staff Willing to Live In Error:', error);
        res.status(500).json({ 
            status: 'error',
            message: 'Server error while fetching staff members willing to live in' 
        });
    }
};

// Get all bookings assigned to a specific staff member
exports.getStaffAssignments = async (req, res) => {
    const { staff_profile_id } = req.params;
    const { status } = req.query; // Optional: Filter by 'ACTIVE', 'COMPLETED', 'CANCELLED'

    try {
        let query = `
            SELECT 
                b.booking_id,
                b.start_date,
                b.status as booking_status,
                b.created_at as booking_date,
                p.full_name as patient_name,
                p.age as patient_age,
                p.medical_condition,
                p.residential_address as patient_address,
                p.emergency_contact_name,
                p.emergency_contact_number,
                c.primary_address as client_address,
                c.full_name as client_name,
                u.mobile_number as client_mobile
            FROM bookings b
            JOIN patient_profiles p ON b.patient_id = p.patient_id
            JOIN client_profiles c ON b.client_id = c.client_profile_id
            JOIN users u ON c.user_id = u.user_id
            WHERE b.assigned_staff_id = $1
        `;

        const queryParams = [staff_profile_id];

        // Add Status Filter if provided
        if (status) {
            query += ` AND b.status = $2`;
            queryParams.push(status);
        }

        // Sort by newest first
        query += ` ORDER BY b.start_date DESC`;

        const result = await db.query(query, queryParams);

        // Logic Check: If patient address is null (Standard Mode), use Client Address
        const assignments = result.rows.map(row => ({
            ...row,
            final_location: row.patient_address || row.client_address // Proxy Mode vs Standard Mode
        }));

        res.status(200).json({
            status: 'success',
            count: assignments.length,
            data: assignments
        });

    } catch (error) {
        console.error('Get Staff Assignments Error:', error);
        res.status(500).json({ 
            status: 'error', 
            message: 'Server error while fetching assignments' 
        });
    }
};

// Delete a staff profile
exports.deleteStaffProfile = async (req, res) => {
    const { staff_profile_id } = req.params;

    try {
        // First check if staff member exists
        const checkQuery = `
            SELECT staff_profile_id, full_name, user_id
            FROM staff_profiles 
            WHERE staff_profile_id = $1
        `;

        const checkResult = await db.query(checkQuery, [staff_profile_id]);

        if (checkResult.rows.length === 0) {
            return res.status(404).json({ 
                status: 'error',
                message: 'Staff member not found' 
            });
        }

        const staffMember = checkResult.rows[0];

        // Check if staff member has active bookings
        const activeBookingsQuery = `
            SELECT COUNT(*) as active_bookings
            FROM bookings 
            WHERE assigned_staff_id = $1 AND status IN ('ACTIVE', 'PENDING')
        `;

        const activeBookingsResult = await db.query(activeBookingsQuery, [staff_profile_id]);
        const activeBookingsCount = parseInt(activeBookingsResult.rows[0].active_bookings);

        if (activeBookingsCount > 0) {
            return res.status(400).json({ 
                status: 'error',
                message: 'Cannot delete staff member with active bookings' 
            });
        }

        // Delete staff profile (this will cascade delete related records if properly set up)
        const deleteQuery = `
            DELETE FROM staff_profiles 
            WHERE staff_profile_id = $1
            RETURNING staff_profile_id, full_name
        `;

        const deleteResult = await db.query(deleteQuery, [staff_profile_id]);

        // Delete the associated user account entirely
        const deleteUserQuery = `
            DELETE FROM users 
            WHERE user_id = $1
        `;

        await db.query(deleteUserQuery, [staffMember.user_id]);

        res.status(200).json({
            status: 'success',
            message: 'Staff profile and associated user account deleted successfully',
            data: deleteResult.rows[0]
        });

    } catch (error) {
        console.error('Delete Staff Profile Error:', error);
        res.status(500).json({ 
            status: 'error',
            message: 'Server error while deleting staff profile' 
        });
    }
};

// Update staff profile (Admin only)
exports.updateStaffProfile = async (req, res) => {
    const { staff_profile_id } = req.params;
    const {
        full_name,
        designation,
        qualifications,
        home_address,
        location,
        gender,
        willing_to_live_in,
        date_of_birth,
        email,
        mobile_number: rawMobileNumber,
        role,
        roles: rolesRaw,
        nic_number,
        staff_code,
        experience_level,
        remove_document_urls
    } = req.body;

    if (experience_level && !VALID_EXPERIENCE_LEVELS.includes(experience_level)) {
        return res.status(400).json({
            status: 'error',
            message: `Invalid experience level. Must be one of: ${VALID_EXPERIENCE_LEVELS.join(', ')}`
        });
    }

    if (rawMobileNumber && !isValidPhone(rawMobileNumber)) {
        return res.status(400).json({ status: 'error', message: 'Enter a valid mobile number.' });
    }
    const mobile_number = rawMobileNumber ? toE164(rawMobileNumber) : rawMobileNumber;

    // Extract file URLs from multer/S3
    const uploadedDocuments = req.files && req.files.documents ? req.files.documents.map(file => file.location) : [];
    const uploadedProfilePicture = req.files && req.files.profile_picture ? req.files.profile_picture[0].location : null;
    const uploadedNicFront = getUploadedFileUrl(req.files, 'nic_front');
    const uploadedNicBack = getUploadedFileUrl(req.files, 'nic_back');
    const uploadedGramaNiladhari = getUploadedFileUrl(req.files, 'grama_niladhari');
    const uploadedPoliceReport = getUploadedFileUrl(req.files, 'police_report');

    try {
        // Validate staff exists
        const existingQuery = `
            SELECT staff_profile_id, user_id, profile_picture_url, document_urls,
                   nic_front_url, nic_back_url, grama_niladhari_url, police_report_url
            FROM staff_profiles
            WHERE staff_profile_id = $1
        `;

        const existingResult = await db.query(existingQuery, [staff_profile_id]);

        if (existingResult.rows.length === 0) {
            return res.status(404).json({
                status: 'error',
                message: 'Staff member not found'
            });
        }

        const existingStaff = existingResult.rows[0];

        // Validate required fields if provided
        if (full_name === '' || designation === '' || gender === '' || date_of_birth === '') {
            return res.status(400).json({
                status: 'error',
                message: 'Required fields cannot be empty'
            });
        }

        // Validate and set role(s) if provided. `roles` (JSON array, e.g. from a
        // multi-select) takes priority over the legacy single `role` field, which
        // some older callers still send.
        let rolesToSet = null;
        if (rolesRaw !== undefined) {
            try {
                rolesToSet = JSON.parse(rolesRaw);
            } catch {
                return res.status(400).json({ status: 'error', message: 'Invalid roles payload.' });
            }
            if (!Array.isArray(rolesToSet) || rolesToSet.length === 0) {
                return res.status(400).json({ status: 'error', message: 'At least one role must be selected.' });
            }
            rolesToSet = rolesToSet.map(r => String(r).toUpperCase());
        } else if (role) {
            rolesToSet = [role.toUpperCase()];
        }

        if (rolesToSet) {
            const validRoles = ['NURSE', 'NANNY', 'CARETAKER', 'COORDINATOR', 'NURSING_ASSISTANT', 'PHYSIOTHERAPIST', 'COUNSELLOR'];
            const invalidRole = rolesToSet.find(r => !validRoles.includes(r));

            if (invalidRole) {
                return res.status(400).json({
                    status: 'error',
                    message: `Invalid role "${invalidRole}". Must be one of: ${validRoles.join(', ')}`
                });
            }

            const updateUserRoleQuery = `
                UPDATE users
                SET role = $1::user_role_enum[]
                WHERE user_id = $2
            `;
            await db.query(updateUserRoleQuery, [rolesToSet, existingStaff.user_id]);
        }

        // Validate date format if provided
        if (date_of_birth) {
            const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
            if (!dateRegex.test(date_of_birth)) {
                return res.status(400).json({
                    status: 'error',
                    message: 'Invalid date format. Use YYYY-MM-DD'
                });
            }
        }

        // Validate gender if provided
        if (gender) {
            const validGenders = ['MALE', 'FEMALE', 'OTHER'];
            if (!validGenders.includes(gender.toUpperCase())) {
                return res.status(400).json({
                    status: 'error',
                    message: 'Invalid gender. Must be MALE, FEMALE, or OTHER'
                });
            }
        }

        // Validate staff_code uniqueness if changing it
        if (staff_code !== undefined && String(staff_code).trim() === '') {
            return res.status(400).json({ status: 'error', message: 'Staff code cannot be empty' });
        }
        if (staff_code) {
            const codeConflict = await db.query(
                'SELECT 1 FROM staff_profiles WHERE staff_code = $1 AND staff_profile_id <> $2',
                [String(staff_code).trim(), staff_profile_id]
            );
            if (codeConflict.rows.length > 0) {
                return res.status(409).json({ status: 'error', message: 'This staff code is already in use by another staff member.' });
            }
        }

        // Update login credentials on the users table if email / mobile provided
        if (email || mobile_number) {
            const userConflict = await db.query(
                'SELECT user_id FROM users WHERE (email = $1 OR mobile_number = $2) AND user_id <> $3',
                [email || null, mobile_number || null, existingStaff.user_id]
            );
            if (userConflict.rows.length > 0) {
                return res.status(409).json({ status: 'error', message: 'Another user already has this email or mobile number.' });
            }
            await db.query(
                `UPDATE users
                 SET email = COALESCE($1, email), mobile_number = COALESCE($2, mobile_number)
                 WHERE user_id = $3`,
                [email || null, mobile_number || null, existingStaff.user_id]
            );
        }

        // Prepare document URLs - start from existing, drop any explicitly removed, then append newly uploaded ones
        let baseDocumentUrls = Array.isArray(existingStaff.document_urls) ? existingStaff.document_urls : [];
        if (remove_document_urls) {
            try {
                const toRemove = JSON.parse(remove_document_urls);
                if (Array.isArray(toRemove) && toRemove.length > 0) {
                    baseDocumentUrls = baseDocumentUrls.filter(url => !toRemove.includes(url));
                }
            } catch { /* ignore malformed payload, keep existing docs */ }
        }
        const finalDocumentUrls = [...baseDocumentUrls, ...uploadedDocuments];

        // Prepare profile picture - use new one if uploaded, otherwise keep existing
        const finalProfilePicture = uploadedProfilePicture || existingStaff.profile_picture_url;
        const finalNicFront = uploadedNicFront || existingStaff.nic_front_url;
        const finalNicBack = uploadedNicBack || existingStaff.nic_back_url;
        const finalGramaNiladhari = uploadedGramaNiladhari || existingStaff.grama_niladhari_url;
        const finalPoliceReport = uploadedPoliceReport || existingStaff.police_report_url;

        // Update staff profile.
        // `completeness` mirrors the fields WorkerRegistrationPage.jsx's isFormValid()
        // treats as required (minus mobile_number, which is NOT NULL on `users` already;
        // grama_niladhari/police_report, which aren't collected on that form; and
        // supporting documents, which admins don't need to chase for migration purposes).
        // It's computed once via a CTE and reused for both status flips below so a
        // PENDING_MIGRATION record only clears once every one of those fields is filled in.
        const updateQuery = `
            WITH completeness AS (
                SELECT (
                    COALESCE($2, full_name) IS NOT NULL
                    AND COALESCE($3, designation) IS NOT NULL
                    AND COALESCE($4, qualifications) IS NOT NULL
                    AND COALESCE($6, home_address) IS NOT NULL
                    AND COALESCE($7, location) IS NOT NULL
                    AND COALESCE($8, profile_picture_url) IS NOT NULL
                    AND COALESCE($9, gender) IS NOT NULL
                    AND COALESCE($11, date_of_birth) IS NOT NULL
                    AND COALESCE($13, nic_number) IS NOT NULL
                    AND COALESCE($14, nic_front_url) IS NOT NULL
                    AND COALESCE($15, nic_back_url) IS NOT NULL
                ) AS is_complete
                FROM staff_profiles
                WHERE staff_profile_id = $1
            )
            UPDATE staff_profiles
            SET
                full_name = COALESCE($2, full_name),
                designation = COALESCE($3, designation),
                qualifications = COALESCE($4, qualifications),
                document_urls = $5,
                home_address = COALESCE($6, home_address),
                location = COALESCE($7, location),
                profile_picture_url = COALESCE($8, profile_picture_url),
                gender = COALESCE($9, gender),
                willing_to_live_in = COALESCE($10, willing_to_live_in),
                date_of_birth = COALESCE($11, date_of_birth),
                staff_code = COALESCE($12, staff_code),
                nic_number = COALESCE($13, nic_number),
                nic_front_url = COALESCE($14, nic_front_url),
                nic_back_url = COALESCE($15, nic_back_url),
                grama_niladhari_url = COALESCE($16, grama_niladhari_url),
                police_report_url = COALESCE($17, police_report_url),
                experience_level = COALESCE($18, experience_level),
                onboarding_status = CASE
                    WHEN onboarding_status = 'PENDING_MIGRATION'
                     AND (SELECT is_complete FROM completeness)
                    THEN 'ACTIVE'
                    ELSE onboarding_status
                END,
                current_status = CASE
                    WHEN onboarding_status = 'PENDING_MIGRATION'
                     AND current_status = 'UNAVAILABLE'
                     AND (SELECT is_complete FROM completeness)
                    THEN 'AVAILABLE'
                    ELSE current_status
                END
            WHERE staff_profile_id = $1
            RETURNING
                staff_profile_id,
                staff_code,
                nic_number,
                nic_front_url,
                nic_back_url,
                user_id,
                full_name,
                designation,
                qualifications,
                document_urls,
                home_address,
                location,
                profile_picture_url,
                gender,
                willing_to_live_in,
                date_of_birth,
                grama_niladhari_url,
                police_report_url,
                current_status,
                verification_status,
                onboarding_status,
                experience_level,
                created_at
        `;

        const updateValues = [
            staff_profile_id,
            full_name || null,
            designation || null,
            qualifications || null,
            finalDocumentUrls,
            home_address || null,
            location || null,
            finalProfilePicture || null,
            gender ? gender.toUpperCase() : null,
            willing_to_live_in !== undefined ? willing_to_live_in : null,
            date_of_birth || null,
            staff_code ? String(staff_code).trim() : null,
            nic_number || null,
            finalNicFront || null,
            finalNicBack || null,
            finalGramaNiladhari || null,
            finalPoliceReport || null,
            experience_level || null
        ];

        const result = await db.query(updateQuery, updateValues);

        // Get updated user info
        const userQuery = `
            SELECT user_id, email, mobile_number, role
            FROM users 
            WHERE user_id = $1
        `;

        const userResult = await db.query(userQuery, [existingStaff.user_id]);
        const user = userResult.rows[0];

        try {
            const actorNameRes = await db.query('SELECT full_name FROM staff_profiles WHERE user_id = $1', [req.user.user_id]);
            const actorName = actorNameRes.rows[0]?.full_name || 'Admin';
            const actorRole = Array.isArray(req.user?.role) ? req.user.role[0] : req.user?.role;
            await logActivity({
                actorUserId: req.user.user_id,
                actorName,
                actorRole: typeof actorRole === 'string' ? actorRole.replace(/\{|\}/g, '').split(',')[0].trim() : String(actorRole),
                actionType: 'STAFF_PROFILE_UPDATED',
                entityType: 'STAFF',
                entityId: String(staff_profile_id),
                details: { staff_name: result.rows[0].full_name, updated_fields: Object.keys(req.body) },
            });
        } catch (logErr) {
            console.error('Activity log failed (updateStaffProfile):', logErr.message);
        }

        res.status(200).json({
            status: 'success',
            message: 'Staff profile updated successfully',
            data: {
                ...result.rows[0],
                user_info: {
                    user_id: user.user_id,
                    email: user.email,
                    mobile_number: user.mobile_number,
                    role: user.role
                }
            }
        });

    } catch (error) {
        console.error('Update Staff Profile Error:', error);
        if (error.code === '23505') {
            return res.status(409).json({
                status: 'error',
                message: 'A staff member or user with this staff code, email or mobile number already exists.'
            });
        }
        res.status(500).json({
            status: 'error',
            message: 'Server error while updating staff profile'
        });
    }
};

// Create staff profile manually (Admin only)
exports.createStaffProfile = async (req, res) => {
    const {
        user_id,
        full_name,
        designation,
        qualifications,
        document_urls,
        home_address,
        location,
        gps_coordinates,
        gender,
        willing_to_live_in,
        date_of_birth,
        email,
        mobile_number: rawMobileNumber,
        role,
        nic_number,
        staff_code,
        experience_level,
        admin_remarks,
        recruiter_id
    } = req.body;

    // Extract file URLs from multer/S3
    const uploadedDocuments = req.files && req.files.documents ? req.files.documents.map(file => file.location) : [];
    const uploadedProfilePicture = req.files && req.files.profile_picture ? req.files.profile_picture[0].location : null;
    const uploadedNicFront = req.files && req.files.nic_front ? req.files.nic_front[0].location : null;
    const uploadedNicBack = req.files && req.files.nic_back ? req.files.nic_back[0].location : null;
    const uploadedGramaNiladhari = req.files && req.files.grama_niladhari ? req.files.grama_niladhari[0].location : null;
    const uploadedPoliceReport = req.files && req.files.police_report ? req.files.police_report[0].location : null;

    try {
        // Validate required fields
        if (!full_name || !designation || !gender || !date_of_birth || !nic_number || !uploadedNicFront || !uploadedNicBack) {
            return res.status(400).json({
                status: 'error',
                message: 'Missing required fields: full_name, designation, gender, date_of_birth, nic_number, nic_front, nic_back'
            });
        }

        // Validate and set role (default to NURSE if not provided)
        const userRole = role ? [role.toUpperCase()] : ['NURSE'];
        const validRoles = ['NURSE', 'NANNY', 'CARETAKER', 'COORDINATOR', 'NURSING_ASSISTANT', 'PHYSIOTHERAPIST', 'COUNSELLOR'];

        if (!validRoles.includes(userRole[0])) {
            return res.status(400).json({
                status: 'error',
                message: 'Invalid role. Must be one of: NURSE, NANNY, CARETAKER, COORDINATOR, NURSING_ASSISTANT, PHYSIOTHERAPIST, COUNSELLOR'
            });
        }

        // Always create new user for staff profile creation (Admin only).
        // Mobile number is the login username, so it is the only required contact field;
        // email is optional.
        if (!rawMobileNumber) {
            return res.status(400).json({
                status: 'error',
                message: 'Mobile number is required for staff profile creation'
            });
        }
        if (!isValidPhone(rawMobileNumber)) {
            return res.status(400).json({
                status: 'error',
                message: 'Enter a valid mobile number.'
            });
        }
        const mobile_number = toE164(rawMobileNumber);
        const finalEmail = email && String(email).trim() ? String(email).trim() : null;

        // Check if user already exists by mobile (or email, when one was provided)
        const userCheckResult = await db.query(
            `SELECT user_id, email, mobile_number
             FROM users
             WHERE mobile_number = $1 OR ($2::text IS NOT NULL AND email = $2)`,
            [mobile_number, finalEmail]
        );

        if (userCheckResult.rows.length > 0) {
            return res.status(400).json({
                status: 'error',
                message: 'User with this email or mobile number already exists'
            });
        }

        // Enforce staff_code uniqueness server-side
        if (staff_code) {
            const codeCheck = await db.query(
                'SELECT 1 FROM staff_profiles WHERE staff_code = $1',
                [String(staff_code).trim()]
            );
            if (codeCheck.rows.length > 0) {
                return res.status(409).json({
                    status: 'error',
                    message: 'This staff code is already assigned to another staff member.'
                });
            }
        }

        // Generate temporary password
        const tempPassword = Math.random().toString(36).slice(-8);
        const bcrypt = require('bcryptjs');
        const hashedPassword = await bcrypt.hash(tempPassword, 12);

        // Create new user
        const createUserQuery = `
            INSERT INTO users (email, password_hash, mobile_number, role, is_email_verified)
            VALUES ($1, $2, $3, $4::user_role_enum[], true)
            RETURNING user_id, email, mobile_number, role
        `;

        const userResult = await db.query(createUserQuery, [finalEmail, hashedPassword, mobile_number, userRole]);
        const user = userResult.rows[0];
        const finalUserId = user.user_id;

        // Check if staff profile already exists for this user
        const existingProfileQuery = `
            SELECT staff_profile_id
            FROM staff_profiles 
            WHERE user_id = $1
        `;

        const existingResult = await db.query(existingProfileQuery, [finalUserId]);

        if (existingResult.rows.length > 0) {
            return res.status(400).json({
                status: 'error',
                message: 'Staff profile already exists for this user'
            });
        }

        // Validate date format
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!dateRegex.test(date_of_birth)) {
            return res.status(400).json({
                status: 'error',
                message: 'Invalid date format. Use YYYY-MM-DD'
            });
        }

        // Validate gender
        const validGenders = ['MALE', 'FEMALE', 'OTHER'];
        if (!validGenders.includes(gender.toUpperCase())) {
            return res.status(400).json({
                status: 'error',
                message: 'Invalid gender. Must be MALE, FEMALE, or OTHER'
            });
        }

        // Use uploaded documents if available, otherwise use empty array
        const finalDocumentUrls = uploadedDocuments.length > 0 ? uploadedDocuments : [];

        // Insert new staff profile
        const insertQuery = `
            INSERT INTO staff_profiles (
                user_id,
                full_name,
                designation,
                qualifications,
                document_urls,
                home_address,
                location,
                profile_picture_url,
                nic_number,
                nic_front_url,
                nic_back_url,
                gender,
                willing_to_live_in,
                date_of_birth,
                staff_code,
                experience_level,
                admin_remarks,
                grama_niladhari_url,
                police_report_url,
                current_status,
                verification_status,
                created_at
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, 'AVAILABLE', 'VERIFIED', NOW()
            )
            RETURNING
                staff_profile_id,
                staff_code,
                experience_level,
                admin_remarks,
                grama_niladhari_url,
                police_report_url,
                user_id,
                full_name,
                designation,
                qualifications,
                document_urls,
                home_address,
                location,
                profile_picture_url,
                nic_number,
                nic_front_url,
                nic_back_url,
                gender,
                willing_to_live_in,
                date_of_birth,
                current_status,
                verification_status,
                created_at
        `;

        const insertValues = [
            finalUserId,
            full_name,
            designation,
            qualifications || null,
            finalDocumentUrls.length > 0 ? finalDocumentUrls : null,
            home_address || null,
            location || null,
            uploadedProfilePicture || null,
            nic_number,
            uploadedNicFront,
            uploadedNicBack,
            gender.toUpperCase(),
            willing_to_live_in || false,
            date_of_birth,
            staff_code ? String(staff_code).trim() : null,
            experience_level || null,
            admin_remarks || null,
            uploadedGramaNiladhari || null,
            uploadedPoliceReport || null
        ];

        const result = await db.query(insertQuery, insertValues);

        // Activity log (non-fatal)
        try {
            const actorRole = Array.isArray(req.user.role) ? req.user.role[0] : req.user.role;
            const actorNameResult = await db.query('SELECT full_name FROM staff_profiles WHERE user_id = $1', [req.user.user_id]);
            const actorName = actorNameResult.rows[0]?.full_name || 'Admin';
            await logActivity({
                actorUserId: req.user.user_id,
                actorName,
                actorRole: typeof actorRole === 'string' ? actorRole.replace(/\{|\}/g, '').split(',')[0].trim() : String(actorRole),
                actionType: 'STAFF_PROFILE_CREATED',
                entityType: 'STAFF_PROFILE',
                entityId: String(result.rows[0].staff_profile_id),
                details: { full_name, email, mobile_number, designation, role: userRole }
            });
        } catch (logErr) {
            console.error('Activity log failed (createStaffProfile):', logErr.message);
        }

        // Credit the recruiter who brought this hire in, if one was selected (non-fatal).
        if (recruiter_id) {
            try {
                await creditRecruiterForStaff(db, {
                    staff_profile_id: result.rows[0].staff_profile_id,
                    recruiter_id,
                    assigned_by: req.user.user_id
                });
            } catch (recruiterErr) {
                console.error('Recruiter crediting failed (createStaffProfile):', recruiterErr.message);
            }
        }

        // Send WhatsApp notification with the login credentials (mobile number is the username)
        const messageBody = `Hello ${full_name}!

Great news! Your staff account has been created by the administrator!

Here are your login details:

PHONE NUMBER: ${mobile_number}
TEMPORARY PASSWORD: ${tempPassword}

STEP 1: Go to VCare website
STEP 2: Click "Login"
STEP 3: Enter your PHONE NUMBER: ${mobile_number}
STEP 4: Enter your temporary password: ${tempPassword}
STEP 5: You'll be automatically prompted to set your own permanent password

We're excited to have you join our team of dedicated healthcare professionals!

With love,
The VCare Team`;

        Promise.allSettled([
            sendWhatsAppMessage(mobile_number, messageBody)
        ]);

        res.status(201).json({
            status: 'success',
            message: 'Staff profile created successfully',
            data: {
                ...result.rows[0],
                user_info: {
                    user_id: user.user_id,
                    email: user.email,
                    mobile_number: user.mobile_number,
                    role: user.role
                }
            }
        });

    } catch (error) {
        console.error('Create Staff Profile Error:', error);
        
        // Handle specific database errors
        if (error.code === '23503') {
            return res.status(400).json({
                status: 'error',
                message: 'Foreign key violation: user_id does not exist'
            });
        }

        if (error.code === '23505') {
            return res.status(400).json({
                status: 'error',
                message: 'Duplicate entry: staff profile already exists for this user'
            });
        }

        res.status(500).json({
            status: 'error',
            message: 'Server error while creating staff profile'
        });
    }
};

// Total earnings breakdown: all STAFF_SALARY credits grouped by booking with full booking context
exports.getTotalEarningsBreakdown = async (req, res) => {
    const { staff_profile_id } = req.params;

    try {
        const profileRes = await db.query(
            `SELECT sp.full_name FROM staff_profiles sp WHERE sp.staff_profile_id = $1`,
            [staff_profile_id]
        );
        if (profileRes.rows.length === 0) {
            return res.status(404).json({ status: 'error', message: 'Staff not found' });
        }
        const staff_name = profileRes.rows[0].full_name;

        // Summary totals
        const summaryRes = await db.query(`
            SELECT
                COALESCE(SUM(t.amount), 0)            AS total_earned,
                COUNT(DISTINCT t.booking_id)           AS total_bookings,
                COUNT(t.transaction_id)                AS total_days_credited
            FROM transactions t
            WHERE t.staff_profile_id = $1
              AND t.category = 'STAFF_SALARY'
              AND t.transaction_type = 'CREDIT'
              AND t.status = 'COMPLETED'
        `, [staff_profile_id]);

        // Per-booking grouped breakdown
        const breakdownRes = await db.query(`
            SELECT
                t.booking_id,
                b.start_date                          AS booking_start_date,
                b.service_type,
                b.service_model,
                c.full_name                           AS client_name,
                p.full_name                           AS patient_name,
                bsa.daily_rate,
                bsa.service_start_date,
                bsa.service_end_date,
                bsa.amount_allocated,
                bsa.status                            AS assignment_status,
                COALESCE(SUM(t.amount), 0)            AS total_earned_from_booking,
                COUNT(t.transaction_id)               AS days_credited,
                MIN(t.created_at)                     AS first_earning_date,
                MAX(t.created_at)                     AS last_earning_date
            FROM transactions t
            LEFT JOIN bookings b ON t.booking_id = b.booking_id
            LEFT JOIN client_profiles c ON b.client_id = c.client_profile_id
            LEFT JOIN patient_profiles p ON b.patient_id = p.patient_id
            LEFT JOIN booking_staff_assignments bsa
                   ON bsa.booking_id = t.booking_id
                  AND bsa.staff_profile_id = t.staff_profile_id
            WHERE t.staff_profile_id = $1
              AND t.category = 'STAFF_SALARY'
              AND t.transaction_type = 'CREDIT'
              AND t.status = 'COMPLETED'
            GROUP BY
                t.booking_id,
                b.start_date,
                b.service_type,
                b.service_model,
                c.full_name,
                p.full_name,
                bsa.daily_rate,
                bsa.service_start_date,
                bsa.service_end_date,
                bsa.amount_allocated,
                bsa.status
            ORDER BY last_earning_date DESC
        `, [staff_profile_id]);

        return res.status(200).json({
            status: 'success',
            data: {
                staff_name,
                summary: {
                    total_earned: parseFloat(summaryRes.rows[0].total_earned || 0),
                    total_bookings: parseInt(summaryRes.rows[0].total_bookings || 0),
                    total_days_credited: parseInt(summaryRes.rows[0].total_days_credited || 0),
                },
                bookings: breakdownRes.rows
            }
        });

    } catch (error) {
        console.error('getTotalEarningsBreakdown Error:', error);
        return res.status(500).json({ status: 'error', message: 'Server error while fetching total earnings breakdown' });
    }
};

// Current earnings breakdown: full ledger (earnings + payouts with running balance) + approved advances
exports.getCurrentEarningsBreakdown = async (req, res) => {
    const { staff_profile_id } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const offset = (page - 1) * limit;

    try {
        const profileRes = await db.query(
            `SELECT sp.full_name, sp.current_earnings FROM staff_profiles sp WHERE sp.staff_profile_id = $1`,
            [staff_profile_id]
        );
        if (profileRes.rows.length === 0) {
            return res.status(404).json({ status: 'error', message: 'Staff not found' });
        }
        const { full_name: staff_name, current_earnings } = profileRes.rows[0];

        // Summary
        const summaryRes = await db.query(`
            SELECT
                COALESCE(SUM(CASE WHEN category = 'STAFF_SALARY'      AND transaction_type = 'CREDIT' THEN amount ELSE 0 END), 0) AS total_earned,
                COALESCE(SUM(CASE WHEN category = 'STAFF_SALARY_PAID' AND transaction_type = 'DEBIT'  THEN amount ELSE 0 END), 0) AS total_paid_out
            FROM transactions
            WHERE staff_profile_id = $1
              AND (category = 'STAFF_SALARY' OR category = 'STAFF_SALARY_PAID')
              AND status = 'COMPLETED'
        `, [staff_profile_id]);

        const advanceSumRes = await db.query(`
            SELECT COALESCE(SUM(amount_requested), 0) AS total_advances_approved
            FROM staff_advances
            WHERE staff_profile_id = $1 AND status = 'APPROVED'
        `, [staff_profile_id]);

        // Count for pagination
        const countRes = await db.query(`
            SELECT COUNT(*) AS total_count
            FROM transactions
            WHERE staff_profile_id = $1
              AND (category = 'STAFF_SALARY' OR category = 'STAFF_SALARY_PAID')
              AND status = 'COMPLETED'
        `, [staff_profile_id]);
        const totalCount = parseInt(countRes.rows[0].total_count || 0);

        // Ledger with running balance (window function computed ASC, returned in DESC order)
        const ledgerRes = await db.query(`
            SELECT *
            FROM (
                SELECT
                    t.transaction_id,
                    t.booking_id,
                    t.category,
                    t.amount,
                    t.transaction_type,
                    t.payment_method,
                    t.reference_number,
                    t.notes,
                    t.created_at,
                    SUM(
                        CASE WHEN t.transaction_type = 'CREDIT' THEN t.amount ELSE -t.amount END
                    ) OVER (
                        ORDER BY t.created_at ASC, t.transaction_id ASC
                        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
                    ) AS running_balance,
                    b.service_type,
                    b.service_model,
                    c.full_name                          AS client_name,
                    p.full_name                          AS patient_name,
                    spt.notes                            AS payout_notes,
                    spt.paid_at,
                    u_payer.email                        AS paid_by_email,
                    ba.account_nickname                  AS company_account_name,
                    sba.bank_name                        AS staff_bank_name,
                    sba.account_number                   AS staff_account_number
                FROM transactions t
                LEFT JOIN bookings b ON t.booking_id = b.booking_id
                LEFT JOIN client_profiles c ON b.client_id = c.client_profile_id
                LEFT JOIN patient_profiles p ON b.patient_id = p.patient_id
                LEFT JOIN staff_payments_tracking spt ON spt.transaction_id = t.transaction_id
                LEFT JOIN users u_payer ON spt.paid_by = u_payer.user_id
                LEFT JOIN bank_accounts ba ON spt.company_bank_account_id = ba.account_id
                LEFT JOIN staff_bank_accounts sba ON spt.staff_bank_account_id = sba.staff_bank_account_id
                WHERE t.staff_profile_id = $1
                  AND (t.category = 'STAFF_SALARY' OR t.category = 'STAFF_SALARY_PAID')
                  AND t.status = 'COMPLETED'
            ) ledger
            ORDER BY created_at DESC, transaction_id DESC
            LIMIT $2 OFFSET $3
        `, [staff_profile_id, limit, offset]);

        // Approved advances for this staff member
        const advancesRes = await db.query(`
            SELECT
                advance_id,
                amount_requested,
                status,
                requested_at,
                approved_at,
                reviewed_by_name
            FROM staff_advances
            WHERE staff_profile_id = $1 AND status = 'APPROVED'
            ORDER BY approved_at DESC
        `, [staff_profile_id]);

        return res.status(200).json({
            status: 'success',
            data: {
                staff_name,
                summary: {
                    current_earnings: parseFloat(current_earnings || 0),
                    total_earned: parseFloat(summaryRes.rows[0].total_earned || 0),
                    total_paid_out: parseFloat(summaryRes.rows[0].total_paid_out || 0),
                    total_advances_approved: parseFloat(advanceSumRes.rows[0].total_advances_approved || 0),
                },
                ledger: ledgerRes.rows,
                advances: advancesRes.rows,
                pagination: {
                    current_page: page,
                    per_page: limit,
                    total_count: totalCount,
                    total_pages: Math.ceil(totalCount / limit)
                }
            }
        });

    } catch (error) {
        console.error('getCurrentEarningsBreakdown Error:', error);
        return res.status(500).json({ status: 'error', message: 'Server error while fetching current earnings breakdown' });
    }
};

// Get top 5 staff members by highest average ratings
exports.getTopRatedStaff = async (req, res) => {
    try {
        const query = `
            SELECT 
                sp.staff_profile_id,
                sp.full_name,
                sp.designation,
                sp.qualifications,
                sp.document_urls,
                sp.home_address,
                sp.location,
                sp.gps_coordinates,
                sp.profile_picture_url,
                sp.current_status,
                sp.verification_status,
                sp.gender,
                sp.willing_to_live_in,
                sp.date_of_birth,
                sp.experience_level,
                sp.doc_upload_token,
                sp.grama_niladhari_url,
                sp.police_report_url,
                sp.created_at,
                sp.advance_threshold_amount,
                CAST(sp.average_rating AS FLOAT) as average_rating,
                u.user_id,
                u.email,
                u.mobile_number,
                u.role,
                u.is_active,
                u.is_email_verified,
                u.created_at as user_created_at
            FROM staff_profiles sp
            JOIN users u ON sp.user_id = u.user_id
            WHERE sp.average_rating IS NOT NULL AND sp.average_rating > 0
            ORDER BY sp.average_rating DESC
            LIMIT 5
        `;

        const result = await db.query(query);

        res.status(200).json({
            status: 'success',
            data: result.rows,
            count: result.rows.length
        });

    } catch (error) {
        console.error('Get Top Rated Staff Error:', error);
        res.status(500).json({
            status: 'error',
            message: 'Server error while fetching top rated staff members'
        });
    }
};

// Admin: Aggregate salary overview for all staff
exports.getStaffSalariesOverview = async (req, res) => {
    const showAll = req.query.all === 'true';
    try {
        const result = await db.query(`
            SELECT
                sp.staff_profile_id,
                sp.full_name,
                sp.designation,
                sp.current_status,
                COALESCE(sp.current_earnings, 0) AS current_earnings,
                u.mobile_number,
                COALESCE(earned.total_earned, 0) AS total_earned,
                COALESCE(paid.total_paid, 0) AS total_paid_out,
                last_pay.paid_at AS last_paid_at,
                sba.staff_bank_account_id,
                sba.bank_name,
                sba.account_number,
                sba.account_holder_name
            FROM staff_profiles sp
            JOIN users u ON sp.user_id = u.user_id
            LEFT JOIN (
                SELECT staff_profile_id, SUM(amount) AS total_earned
                FROM transactions WHERE category = 'STAFF_SALARY'
                GROUP BY staff_profile_id
            ) earned ON earned.staff_profile_id = sp.staff_profile_id
            LEFT JOIN (
                SELECT staff_profile_id, SUM(amount_paid) AS total_paid
                FROM staff_payments_tracking
                GROUP BY staff_profile_id
            ) paid ON paid.staff_profile_id = sp.staff_profile_id
            LEFT JOIN LATERAL (
                SELECT paid_at FROM staff_payments_tracking
                WHERE staff_profile_id = sp.staff_profile_id
                ORDER BY paid_at DESC LIMIT 1
            ) last_pay ON true
            LEFT JOIN LATERAL (
                SELECT staff_bank_account_id, bank_name, account_number, account_holder_name
                FROM staff_bank_accounts
                WHERE staff_profile_id = sp.staff_profile_id
                ORDER BY created_at ASC LIMIT 1
            ) sba ON true
            ${showAll ? '' : 'WHERE sp.current_earnings > 0'}
            ORDER BY sp.current_earnings DESC
        `);

        const totalOutstanding = result.rows.reduce((sum, r) => sum + parseFloat(r.current_earnings), 0);

        res.status(200).json({
            status: 'success',
            data: {
                staff: result.rows,
                total_outstanding: totalOutstanding,
                staff_count: result.rows.length
            }
        });
    } catch (error) {
        console.error('getStaffSalariesOverview Error:', error);
        res.status(500).json({ status: 'error', message: 'Server error while fetching salary overview' });
    }
};

// Admin: Per-booking salary breakdown for a single staff member
exports.getStaffBookingSalaryBreakdown = async (req, res) => {
    const { staff_profile_id } = req.params;
    try {
        const staffRes = await db.query(
            `SELECT sp.full_name, sp.designation, COALESCE(sp.current_earnings, 0) AS current_earnings
             FROM staff_profiles sp WHERE sp.staff_profile_id = $1`,
            [staff_profile_id]
        );
        if (!staffRes.rows.length) {
            return res.status(404).json({ status: 'error', message: 'Staff not found' });
        }

        const breakdownRes = await db.query(`
            SELECT
                bsa.assignment_id,
                bsa.booking_id,
                b.booking_code,
                bsa.service_start_date,
                bsa.service_end_date,
                bsa.daily_rate,
                bsa.amount_allocated,
                bsa.status,
                pp.patient_id,
                pp.full_name AS patient_name,
                COALESCE(
                    json_agg(
                        json_build_object('date', t.created_at::date, 'amount', t.amount)
                        ORDER BY t.created_at
                    ) FILTER (WHERE t.transaction_id IS NOT NULL),
                    '[]'::json
                ) AS daily_entries,
                COALESCE(SUM(t.amount), 0) AS total_salary_earned
            FROM booking_staff_assignments bsa
            JOIN bookings b ON bsa.booking_id = b.booking_id
            LEFT JOIN patient_profiles pp ON b.patient_id = pp.patient_id
            LEFT JOIN transactions t
                ON t.staff_profile_id = bsa.staff_profile_id
                AND t.booking_id = bsa.booking_id
                AND t.category = 'STAFF_SALARY'
            WHERE bsa.staff_profile_id = $1
            GROUP BY bsa.assignment_id, bsa.booking_id, b.booking_code,
                     bsa.service_start_date, bsa.service_end_date,
                     bsa.daily_rate, bsa.amount_allocated, bsa.status,
                     pp.patient_id, pp.full_name
            ORDER BY bsa.service_start_date DESC
        `, [staff_profile_id]);

        const [payoutsRes, deductionsRes, advancesRes] = await Promise.all([
            db.query(`
                SELECT
                    spt.staff_payment_id,
                    spt.amount_paid,
                    spt.payment_method,
                    spt.reference_number,
                    spt.notes,
                    spt.paid_at,
                    spt.status,
                    spt.salary_sheet_url,
                    ba.account_nickname AS company_account,
                    sba.bank_name AS staff_bank_name,
                    sba.account_number AS staff_account_number
                FROM staff_payments_tracking spt
                LEFT JOIN bank_accounts ba ON spt.company_bank_account_id = ba.account_id
                LEFT JOIN staff_bank_accounts sba ON spt.staff_bank_account_id = sba.staff_bank_account_id
                WHERE spt.staff_profile_id = $1
                ORDER BY spt.paid_at DESC
            `, [staff_profile_id]),
            db.query(`
                SELECT amount, notes AS reason, created_at
                FROM transactions
                WHERE staff_profile_id = $1 AND category = 'STAFF_DEDUCTION'
                ORDER BY created_at
            `, [staff_profile_id]),
            db.query(`
                SELECT amount, notes, created_at
                FROM transactions
                WHERE staff_profile_id = $1 AND category = 'STAFF_ADVANCE'
                ORDER BY created_at
            `, [staff_profile_id]),
        ]);

        const gross_total = breakdownRes.rows.reduce((s, r) => s + parseFloat(r.total_salary_earned || 0), 0);
        const total_deductions = deductionsRes.rows.reduce((s, r) => s + parseFloat(r.amount || 0), 0);
        const total_advances = advancesRes.rows.reduce((s, r) => s + parseFloat(r.amount || 0), 0);
        const total_paid_out = payoutsRes.rows.reduce((s, r) => s + parseFloat(r.amount_paid || 0), 0);
        const net_current_earnings = Math.max(0, gross_total - total_deductions - total_advances - total_paid_out);

        res.status(200).json({
            status: 'success',
            data: {
                staff: staffRes.rows[0],
                breakdown: breakdownRes.rows,
                deductions: deductionsRes.rows,
                advances: advancesRes.rows,
                payouts: payoutsRes.rows,
                gross_total,
                total_deductions,
                total_advances,
                total_paid_out,
                net_current_earnings,
            }
        });
    } catch (error) {
        console.error('getStaffBookingSalaryBreakdown Error:', error);
        res.status(500).json({ status: 'error', message: 'Server error while fetching salary breakdown' });
    }
};

// Admin: Monthly earnings breakdown for a staff member (used in individual Pay Modal preview)
exports.getStaffMonthlyEarnings = async (req, res) => {
    const { staff_profile_id } = req.params;
    const { year, month } = req.query;
    if (!year || !month) {
        return res.status(400).json({ status: 'error', message: 'year and month are required' });
    }
    try {
        const staffRes = await db.query(
            `SELECT sp.full_name, sp.designation, COALESCE(sp.current_earnings, 0) AS current_earnings
             FROM staff_profiles sp WHERE sp.staff_profile_id = $1`,
            [staff_profile_id]
        );
        if (!staffRes.rows.length) {
            return res.status(404).json({ status: 'error', message: 'Staff not found' });
        }

        const breakdownRes = await db.query(`
            SELECT
                bsa.assignment_id,
                bsa.booking_id,
                b.booking_code,
                bsa.service_start_date,
                bsa.service_end_date,
                bsa.daily_rate,
                bsa.status,
                cp.full_name AS client_name,
                pp.full_name AS patient_name,
                COALESCE(
                    json_agg(
                        json_build_object('date', t.created_at::date, 'amount', t.amount)
                        ORDER BY t.created_at
                    ) FILTER (WHERE t.transaction_id IS NOT NULL),
                    '[]'::json
                ) AS daily_entries,
                COALESCE(SUM(t.amount), 0) AS total_salary_earned
            FROM booking_staff_assignments bsa
            JOIN bookings b ON bsa.booking_id = b.booking_id
            LEFT JOIN client_profiles cp ON b.client_id = cp.client_profile_id
            LEFT JOIN patient_profiles pp ON b.patient_id = pp.patient_id
            LEFT JOIN transactions t
                ON t.staff_profile_id = bsa.staff_profile_id
                AND t.booking_id = bsa.booking_id
                AND t.category = 'STAFF_SALARY'
                AND EXTRACT(YEAR FROM t.created_at) = $2
                AND EXTRACT(MONTH FROM t.created_at) = $3
            WHERE bsa.staff_profile_id = $1
            GROUP BY bsa.assignment_id, bsa.booking_id, b.booking_code,
                     bsa.service_start_date, bsa.service_end_date,
                     bsa.daily_rate, bsa.status, cp.full_name, pp.full_name
            HAVING COALESCE(SUM(t.amount), 0) > 0
            ORDER BY bsa.service_start_date DESC
        `, [staff_profile_id, parseInt(year), parseInt(month)]);

        const deductionsRes = await db.query(`
            SELECT amount, notes AS reason, created_at
            FROM transactions
            WHERE staff_profile_id = $1 AND category = 'STAFF_DEDUCTION'
              AND EXTRACT(YEAR FROM created_at) = $2 AND EXTRACT(MONTH FROM created_at) = $3
            ORDER BY created_at
        `, [staff_profile_id, parseInt(year), parseInt(month)]);

        const advancesRes = await db.query(`
            SELECT amount, notes, created_at
            FROM transactions
            WHERE staff_profile_id = $1 AND category = 'STAFF_ADVANCE'
              AND EXTRACT(YEAR FROM created_at) = $2 AND EXTRACT(MONTH FROM created_at) = $3
            ORDER BY created_at
        `, [staff_profile_id, parseInt(year), parseInt(month)]);

        const payoutsRes = await db.query(`
            SELECT amount_paid, paid_at, payment_method, reference_number
            FROM staff_payments_tracking
            WHERE staff_profile_id = $1
              AND EXTRACT(YEAR FROM paid_at) = $2 AND EXTRACT(MONTH FROM paid_at) = $3
            ORDER BY paid_at
        `, [staff_profile_id, parseInt(year), parseInt(month)]);

        // Transactions and payouts strictly before the selected month — to compute carried-over outstanding
        const [preTxnRes, prePayoutsRes] = await Promise.all([
            db.query(`
                SELECT
                    COALESCE(SUM(CASE WHEN category = 'STAFF_SALARY'    THEN amount ELSE 0 END), 0) AS pre_gross,
                    COALESCE(SUM(CASE WHEN category = 'STAFF_DEDUCTION' THEN amount ELSE 0 END), 0) AS pre_deductions,
                    COALESCE(SUM(CASE WHEN category = 'STAFF_ADVANCE'   THEN amount ELSE 0 END), 0) AS pre_advances
                FROM transactions
                WHERE staff_profile_id = $1
                  AND category IN ('STAFF_SALARY', 'STAFF_DEDUCTION', 'STAFF_ADVANCE')
                  AND (
                      EXTRACT(YEAR  FROM created_at)::int < $2
                   OR (EXTRACT(YEAR  FROM created_at)::int = $2 AND EXTRACT(MONTH FROM created_at)::int < $3)
                  )
            `, [staff_profile_id, parseInt(year), parseInt(month)]),
            db.query(`
                SELECT COALESCE(SUM(amount_paid), 0) AS pre_payouts
                FROM staff_payments_tracking
                WHERE staff_profile_id = $1
                  AND (
                      EXTRACT(YEAR  FROM paid_at)::int < $2
                   OR (EXTRACT(YEAR  FROM paid_at)::int = $2 AND EXTRACT(MONTH FROM paid_at)::int < $3)
                  )
            `, [staff_profile_id, parseInt(year), parseInt(month)]),
        ]);

        const gross_total = breakdownRes.rows.reduce((s, r) => s + parseFloat(r.total_salary_earned || 0), 0);
        const total_deductions = deductionsRes.rows.reduce((s, r) => s + parseFloat(r.amount || 0), 0);
        const total_advances = advancesRes.rows.reduce((s, r) => s + parseFloat(r.amount || 0), 0);
        const total_payouts = payoutsRes.rows.reduce((s, r) => s + parseFloat(r.amount_paid || 0), 0);
        const month_net = Math.max(0, gross_total - total_deductions - total_advances - total_payouts);

        const pre = preTxnRes.rows[0];
        const previous_leftover = Math.max(
            0,
            parseFloat(pre.pre_gross) - parseFloat(pre.pre_deductions) - parseFloat(pre.pre_advances) - parseFloat(prePayoutsRes.rows[0].pre_payouts)
        );

        const month_total = month_net + previous_leftover;

        res.status(200).json({
            status: 'success',
            data: {
                staff: staffRes.rows[0],
                breakdown: breakdownRes.rows,
                deductions: deductionsRes.rows,
                advances: advancesRes.rows,
                payouts: payoutsRes.rows,
                gross_total,
                total_deductions,
                total_advances,
                total_payouts,
                month_net,
                previous_leftover,
                month_total,
            }
        });
    } catch (error) {
        console.error('getStaffMonthlyEarnings Error:', error);
        res.status(500).json({ status: 'error', message: 'Server error' });
    }
};

// Admin: Ledger of all generated salary sheet PDFs
exports.getSalarySheetLedger = async (req, res) => {
    try {
        const result = await db.query(`
            SELECT
                spt.staff_payment_id,
                spt.staff_profile_id,
                spt.amount_paid,
                spt.payment_method,
                spt.reference_number,
                spt.notes,
                spt.paid_at,
                spt.status,
                spt.salary_sheet_url,
                spt.notification_sent_at,
                sp.full_name AS staff_name,
                sp.designation,
                ba.account_nickname AS company_account,
                sba.bank_name AS staff_bank_name
            FROM staff_payments_tracking spt
            JOIN staff_profiles sp ON spt.staff_profile_id = sp.staff_profile_id
            LEFT JOIN bank_accounts ba ON spt.company_bank_account_id = ba.account_id
            LEFT JOIN staff_bank_accounts sba ON spt.staff_bank_account_id = sba.staff_bank_account_id
            WHERE spt.salary_sheet_url IS NOT NULL
            ORDER BY spt.paid_at DESC
        `);
        res.status(200).json({ status: 'success', data: result.rows });
    } catch (error) {
        console.error('getSalarySheetLedger Error:', error);
        res.status(500).json({ status: 'error', message: 'Server error' });
    }
};

// Admin: Bulk payout for multiple staff members
exports.bulkStaffPayouts = async (req, res) => {
    const { payouts, company_bank_account_id, payment_method, reference_number, notes } = req.body;

    if (!Array.isArray(payouts) || payouts.length === 0) {
        return res.status(400).json({ status: 'error', message: 'payouts array is required' });
    }

    const bulkPaymentMethod = payment_method || 'BANK_TRANSFER';
    if (!_VALID_PAYOUT_METHODS.includes(bulkPaymentMethod)) {
        return res.status(400).json({ status: 'error', message: `payment_method must be one of: ${_VALID_PAYOUT_METHODS.join(', ')}` });
    }
    if (bulkPaymentMethod === 'BANK_TRANSFER' && !company_bank_account_id) {
        return res.status(400).json({ status: 'error', message: 'company_bank_account_id is required for BANK_TRANSFER' });
    }

    // A CASH payout is physical cash paid out of the till — route it to Petty Cash.
    const resolvedCompanyBankAccountId = await resolveBankAccountId(bulkPaymentMethod, company_bank_account_id);

    const results = [];

    for (const item of payouts) {
        const { staff_profile_id, amount, staff_bank_account_id } = item;

        if (!staff_profile_id || !amount || isNaN(amount) || Number(amount) <= 0) {
            results.push({ staff_profile_id, status: 'error', message: 'Invalid staff_profile_id or amount' });
            continue;
        }

        const client = await db.pool.connect();
        try {
            await client.query('BEGIN');

            const sel = await client.query(
                `SELECT current_earnings FROM staff_profiles WHERE staff_profile_id = $1 FOR UPDATE`,
                [staff_profile_id]
            );

            if (!sel.rows.length) {
                await client.query('ROLLBACK');
                results.push({ staff_profile_id, status: 'error', message: 'Staff not found' });
                continue;
            }

            const currentEarnings = parseFloat(sel.rows[0].current_earnings || 0);
            const payoutAmount = parseFloat(amount);

            if (payoutAmount > currentEarnings) {
                await client.query('ROLLBACK');
                results.push({ staff_profile_id, status: 'error', message: 'Insufficient balance' });
                continue;
            }

            const newEarnings = (currentEarnings - payoutAmount).toFixed(2);
            await client.query(
                `UPDATE staff_profiles SET current_earnings = $1 WHERE staff_profile_id = $2`,
                [newEarnings, staff_profile_id]
            );

            await client.query(
                `UPDATE staff_wallet SET balance = GREATEST(balance - $1, 0), updated_at = NOW() WHERE staff_profile_id = $2`,
                [payoutAmount, staff_profile_id]
            );

            const insertTrans = await client.query(
                `INSERT INTO transactions (staff_profile_id, category, amount, transaction_type, bank_account_id, payment_method, reference_number, verified_by, status, created_at)
                 VALUES ($1, 'STAFF_SALARY_PAID', $2, 'DEBIT', $3, $4, $5, $6, 'COMPLETED', NOW())
                 RETURNING transaction_id`,
                [staff_profile_id, payoutAmount, resolvedCompanyBankAccountId, bulkPaymentMethod, reference_number || null, req.user.user_id]
            );

            const transaction_id = insertTrans.rows[0].transaction_id;

            const insertBulkPayment = await client.query(
                `INSERT INTO staff_payments_tracking (staff_profile_id, company_bank_account_id, staff_bank_account_id, transaction_id, amount_paid, payment_method, reference_number, notes, paid_by, paid_at, status, created_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), 'COMPLETED', NOW())
                 RETURNING staff_payment_id`,
                [staff_profile_id, resolvedCompanyBankAccountId, staff_bank_account_id || null, transaction_id, payoutAmount, bulkPaymentMethod, reference_number || null, notes || null, req.user.user_id]
            );
            const bulkStaffPaymentId = insertBulkPayment.rows[0].staff_payment_id;

            await client.query('COMMIT');

            try {
                const actorNameRes = await db.query('SELECT full_name FROM staff_profiles WHERE user_id = $1', [req.user.user_id]);
                const actorName = actorNameRes.rows[0]?.full_name || 'Admin';
                const actorRole = Array.isArray(req.user?.role) ? req.user.role[0] : req.user?.role;
                await logActivity({
                    actorUserId: req.user.user_id,
                    actorName,
                    actorRole: typeof actorRole === 'string' ? actorRole.replace(/\{|\}/g, '').split(',')[0].trim() : String(actorRole),
                    actionType: 'STAFF_PAYOUT_CREATED',
                    entityType: 'STAFF_PAYOUT',
                    entityId: String(transaction_id),
                    details: { staff_profile_id, amount: payoutAmount, payment_method: bulkPaymentMethod, bulk: true },
                });
            } catch (logErr) {
                console.error('Activity log failed (bulkStaffPayouts):', logErr.message);
            }

            const _now = new Date();
            const _bulkMonthYear = { year: _now.getFullYear(), month: _now.getMonth() + 1 };
            _sendSalaryPayoutNotifications(staff_profile_id, payoutAmount, payment_method || 'BANK_TRANSFER', reference_number, notes, bulkStaffPaymentId, _bulkMonthYear, true)
                .catch(err => console.error('[Salary Notification] bulkStaffPayouts:', err.message));

            results.push({ staff_profile_id, status: 'success', transaction_id });
        } catch (error) {
            console.error('bulkStaffPayouts item error:', error);
            try { await client.query('ROLLBACK'); } catch (e) { /* ignore */ }
            results.push({ staff_profile_id, status: 'error', message: 'Server error' });
        } finally {
            client.release();
        }
    }

    const allOk = results.every(r => r.status === 'success');
    const anyOk = results.some(r => r.status === 'success');
    return res.status(200).json({
        status: allOk ? 'success' : anyOk ? 'partial' : 'error',
        message: allOk ? 'All payouts processed' : anyOk ? 'Some payouts failed' : 'All payouts failed',
        results
    });
};

// Admin: Resend WhatsApp + SMS for a single salary sheet payout
exports.resendSalarySheetNotification = async (req, res) => {
    const { staff_payment_id } = req.params;
    try {
        await _sendNotificationForPayoutId(staff_payment_id);
        res.status(200).json({ status: 'success', message: 'Notification sent successfully' });

        // Activity log — non-fatal, fire after response
        try {
            const payoutRes = await db.query(`
                SELECT spt.amount_paid, spt.payment_method, spt.paid_at, sp.full_name AS staff_name
                FROM staff_payments_tracking spt
                JOIN staff_profiles sp ON spt.staff_profile_id = sp.staff_profile_id
                WHERE spt.staff_payment_id = $1
            `, [staff_payment_id]);
            const p = payoutRes.rows[0];
            const monthLabel = p ? new Date(p.paid_at).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }) : '';
            const actorRole = Array.isArray(req.user.role) ? req.user.role[0] : req.user.role;
            const actorNameRes = await db.query('SELECT full_name FROM staff_profiles WHERE user_id = $1', [req.user.user_id]);
            const actorName = actorNameRes.rows[0]?.full_name || 'Admin';
            await logActivity({
                actorUserId: req.user.user_id,
                actorName,
                actorRole: typeof actorRole === 'string' ? actorRole.replace(/\{|\}/g, '').split(',')[0].trim() : String(actorRole),
                actionType: 'SALARY_SHEET_NOTIFICATION_SENT',
                entityType: 'SALARY_SHEET',
                entityId: String(staff_payment_id),
                details: {
                    mode: 'individual',
                    staff_name: p?.staff_name,
                    month: monthLabel,
                    amount_paid: p?.amount_paid,
                    payment_method: p?.payment_method,
                },
            });
        } catch (logErr) {
            console.error('Activity log failed (resendSalarySheetNotification):', logErr.message);
        }
    } catch (error) {
        console.error('resendSalarySheetNotification Error:', error);
        res.status(error.message === 'Payout record not found' ? 404 : 500)
           .json({ status: 'error', message: error.message || 'Server error' });
    }
};

// Admin: Bulk resend WhatsApp + SMS for multiple salary sheet payouts
exports.bulkResendSalarySheetNotifications = async (req, res) => {
    const { staff_payment_ids, mode = 'selective' } = req.body;

    if (!Array.isArray(staff_payment_ids) || staff_payment_ids.length === 0) {
        return res.status(400).json({ status: 'error', message: 'staff_payment_ids array is required' });
    }

    const results = [];
    for (const id of staff_payment_ids) {
        try {
            await _sendNotificationForPayoutId(id);
            results.push({ staff_payment_id: id, status: 'success' });
        } catch (err) {
            console.error(`bulkResendSalarySheetNotifications: error for ${id}:`, err.message);
            results.push({ staff_payment_id: id, status: 'error', message: err.message });
        }
    }

    const successCount = results.filter(r => r.status === 'success').length;
    const failCount = results.length - successCount;
    res.status(200).json({ status: 'success', results, successCount, total: staff_payment_ids.length });

    // Activity log — non-fatal, fire after response
    // mode: 'selective' = user picked specific checkboxes, 'all' = send all in view, 'unsent' = send unsent only
    if (successCount > 0) {
        try {
            const actionType = mode === 'selective'
                ? 'SALARY_SHEET_NOTIFICATIONS_SENT_SELECTIVE'
                : 'SALARY_SHEET_NOTIFICATIONS_SENT_BULK';
            const actorRole = Array.isArray(req.user.role) ? req.user.role[0] : req.user.role;
            const actorNameRes = await db.query('SELECT full_name FROM staff_profiles WHERE user_id = $1', [req.user.user_id]);
            const actorName = actorNameRes.rows[0]?.full_name || 'Admin';

            const successIds = results.filter(r => r.status === 'success').map(r => r.staff_payment_id);

            // For selective sends, look up the specific sheets that were sent
            let sent_sheets = undefined;
            if (mode === 'selective' && successIds.length > 0) {
                const sheetsRes = await db.query(`
                    SELECT spt.staff_payment_id, spt.amount_paid, spt.payment_method, spt.reference_number, spt.paid_at,
                           sp.full_name AS staff_name, sp.designation
                    FROM staff_payments_tracking spt
                    JOIN staff_profiles sp ON spt.staff_profile_id = sp.staff_profile_id
                    WHERE spt.staff_payment_id = ANY($1::uuid[])
                    ORDER BY sp.full_name
                `, [successIds]);
                sent_sheets = sheetsRes.rows.map(r => ({
                    staff_payment_id: r.staff_payment_id,
                    staff_name: r.staff_name,
                    designation: r.designation,
                    month: new Date(r.paid_at).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }),
                    amount_paid: r.amount_paid,
                    payment_method: r.payment_method,
                    reference_number: r.reference_number || null,
                }));
            }

            await logActivity({
                actorUserId: req.user.user_id,
                actorName,
                actorRole: typeof actorRole === 'string' ? actorRole.replace(/\{|\}/g, '').split(',')[0].trim() : String(actorRole),
                actionType,
                entityType: 'SALARY_SHEET',
                entityId: null,
                details: {
                    mode,
                    success_count: successCount,
                    fail_count: failCount,
                    total: staff_payment_ids.length,
                    ...(sent_sheets !== undefined && { sent_sheets }),
                    failed_ids: results.filter(r => r.status === 'error').map(r => r.staff_payment_id),
                },
            });
        } catch (logErr) {
            console.error('Activity log failed (bulkResendSalarySheetNotifications):', logErr.message);
        }
    }
};

// Admin: Full export data for Excel download (all staff, all transactions)
exports.getStaffSalariesExportData = async (req, res) => {
    try {
        const [overviewRes, salaryRes, payoutRes] = await Promise.all([
            db.query(`
                SELECT
                    sp.staff_profile_id,
                    sp.full_name,
                    sp.designation,
                    sp.current_status,
                    COALESCE(sp.current_earnings, 0) AS current_earnings,
                    u.mobile_number,
                    COALESCE(earned.total_earned, 0) AS total_earned,
                    COALESCE(paid.total_paid, 0) AS total_paid_out,
                    last_pay.paid_at AS last_paid_at,
                    sba.bank_name,
                    sba.account_number
                FROM staff_profiles sp
                JOIN users u ON sp.user_id = u.user_id
                LEFT JOIN (
                    SELECT staff_profile_id, SUM(amount) AS total_earned
                    FROM transactions WHERE category = 'STAFF_SALARY'
                    GROUP BY staff_profile_id
                ) earned ON earned.staff_profile_id = sp.staff_profile_id
                LEFT JOIN (
                    SELECT staff_profile_id, SUM(amount_paid) AS total_paid
                    FROM staff_payments_tracking GROUP BY staff_profile_id
                ) paid ON paid.staff_profile_id = sp.staff_profile_id
                LEFT JOIN LATERAL (
                    SELECT paid_at FROM staff_payments_tracking
                    WHERE staff_profile_id = sp.staff_profile_id
                    ORDER BY paid_at DESC LIMIT 1
                ) last_pay ON true
                LEFT JOIN LATERAL (
                    SELECT bank_name, account_number
                    FROM staff_bank_accounts
                    WHERE staff_profile_id = sp.staff_profile_id
                    ORDER BY created_at ASC LIMIT 1
                ) sba ON true
                ORDER BY sp.full_name ASC
            `),
            db.query(`
                SELECT
                    sp.staff_profile_id,
                    sp.full_name,
                    sp.designation,
                    b.booking_code,
                    pp.full_name AS patient_name,
                    bsa.daily_rate,
                    bsa.service_start_date,
                    bsa.service_end_date,
                    t.created_at AS earned_date,
                    t.amount AS earned_amount
                FROM transactions t
                JOIN staff_profiles sp ON t.staff_profile_id = sp.staff_profile_id
                LEFT JOIN bookings b ON t.booking_id = b.booking_id
                LEFT JOIN booking_staff_assignments bsa
                    ON bsa.booking_id = t.booking_id AND bsa.staff_profile_id = t.staff_profile_id
                LEFT JOIN patient_profiles pp ON b.patient_id = pp.patient_id
                WHERE t.category = 'STAFF_SALARY'
                ORDER BY t.created_at DESC
            `),
            db.query(`
                SELECT
                    sp.staff_profile_id,
                    sp.full_name,
                    spt.amount_paid,
                    spt.payment_method,
                    spt.reference_number,
                    spt.notes,
                    spt.paid_at,
                    spt.status,
                    ba.account_nickname AS company_account,
                    sba.bank_name AS staff_bank_name,
                    sba.account_number AS staff_account_number
                FROM staff_payments_tracking spt
                JOIN staff_profiles sp ON spt.staff_profile_id = sp.staff_profile_id
                LEFT JOIN bank_accounts ba ON spt.company_bank_account_id = ba.account_id
                LEFT JOIN staff_bank_accounts sba ON spt.staff_bank_account_id = sba.staff_bank_account_id
                ORDER BY spt.paid_at DESC
            `)
        ]);

        try {
            const actorNameRes = await db.query('SELECT full_name FROM staff_profiles WHERE user_id = $1', [req.user.user_id]);
            const actorName = actorNameRes.rows[0]?.full_name || 'Admin';
            const actorRole = Array.isArray(req.user?.role) ? req.user.role[0] : req.user?.role;
            await logActivity({
                actorUserId: req.user.user_id,
                actorName,
                actorRole: typeof actorRole === 'string' ? actorRole.replace(/\{|\}/g, '').split(',')[0].trim() : String(actorRole),
                actionType: 'SALARY_EXPORT_DOWNLOADED',
                entityType: 'SALARY_REPORT',
                entityId: 'all',
                details: {
                    staff_count: overviewRes.rows.length,
                    salary_transaction_count: salaryRes.rows.length,
                    payout_count: payoutRes.rows.length,
                },
            });
        } catch (logErr) {
            console.error('Activity log failed (getStaffSalariesExportData):', logErr.message);
        }

        res.status(200).json({
            status: 'success',
            data: {
                staff_overview: overviewRes.rows,
                salary_transactions: salaryRes.rows,
                payout_transactions: payoutRes.rows
            }
        });
    } catch (error) {
        console.error('getStaffSalariesExportData Error:', error);
        res.status(500).json({ status: 'error', message: 'Server error while fetching export data' });
    }
};

