const express = require('express');
const router = express.Router();
const staffAppController = require('../controllers/staffAppController');
const staffController = require('../controllers/staffController');
const staffDocUploadController = require('../controllers/staffDocUploadController');
const { uploadApplicationFiles } = require('../middleware/uploadMiddleware');
const { protect, restrictTo, requirePermission } = require('../middleware/authMiddleware');
const db = require('../config/db');
const { toE164 } = require('../utils/phone');

// Public: Check if a mobile number is already registered as a non-CLIENT user
router.get('/check-mobile/:mobile', async (req, res) => {
  try {
    const result = await db.query(
      'SELECT role FROM users WHERE mobile_number = $1',
      [toE164(req.params.mobile) || req.params.mobile]
    );
    if (result.rows.length === 0) return res.json({ available: true });
    const raw = result.rows[0].role;
    const roles = Array.isArray(raw)
      ? raw
      : typeof raw === 'string'
        ? raw.replace(/^\{|\}$/g, '').split(',').map(r => r.trim()).filter(Boolean)
        : [];
    const hasNonClientRole = roles.some(r => r !== 'CLIENT' && r !== '');
    res.json({ available: !hasNonClientRole });
  } catch (err) {
    console.error('Check mobile error:', err.message);
    res.status(500).json({ available: true });
  }
});

// Admin: Check if a mobile number is already used by an existing staff profile
router.get('/check-staff-mobile/:mobile', protect, requirePermission('VIEW_USER_MANAGEMENT'), async (req, res) => {
  try {
    const result = await db.query(
      'SELECT 1 FROM staff_profiles sp JOIN users u ON sp.user_id = u.user_id WHERE u.mobile_number = $1',
      [toE164(req.params.mobile) || req.params.mobile]
    );
    res.json({ available: result.rows.length === 0 });
  } catch (err) {
    console.error('Check staff mobile error:', err.message);
    res.status(500).json({ available: true });
  }
});

// Admin: Check if a staff code is already taken
router.get('/check-staff-code/:code', protect, requirePermission('VIEW_USER_MANAGEMENT'), async (req, res) => {
  try {
    const result = await db.query(
      'SELECT 1 FROM staff_profiles WHERE LOWER(staff_code) = LOWER($1)',
      [req.params.code]
    );
    res.json({ available: result.rows.length === 0 });
  } catch (err) {
    console.error('Check staff code error:', err.message);
    res.status(500).json({ available: true });
  }
});

// Public: Apply to join VCare
router.post('/apply', uploadApplicationFiles, staffAppController.submitApplication);

// Public: Verify phone OTP after application submission
router.post('/verify-otp', staffAppController.verifyStaffApplicationOtp);

// Public: Resend phone OTP for application
router.post('/resend-otp', staffAppController.resendStaffApplicationOtp);

// Admin Only: View all applications (includes docs_complete flag for accepted applications)
router.get('/applications', protect, requirePermission('VIEW_WORKER_VERIFICATIONS'), async (req, res) => {
  const apps = await db.query(`
    SELECT sa.*,
      sp.grama_niladhari_url,
      sp.police_report_url,
      CASE
        WHEN sa.status = 'ACCEPTED'
          AND (sp.grama_niladhari_url IS NULL OR sp.police_report_url IS NULL)
        THEN false
        ELSE true
      END AS docs_complete,
      COALESCE((
        SELECT COUNT(*) > 0
        FROM staff_bank_accounts sba
        WHERE sba.staff_profile_id = sp.staff_profile_id
      ), false) AS has_bank_account
    FROM staff_applications sa
    LEFT JOIN users u ON u.mobile_number = sa.mobile_number
    LEFT JOIN staff_profiles sp ON sp.user_id = u.user_id
    ORDER BY sa.applied_at DESC
  `);
  res.status(200).json(apps.rows);
});

// Admin Only: Get single application by ID (includes staff profile compliance fields when accepted)
router.get('/applications/:applicationId', protect, requirePermission('VIEW_WORKER_VERIFICATIONS'), async (req, res) => {
  try {
    const result = await db.query(`
      SELECT sa.*,
        sp.staff_profile_id,
        sp.doc_upload_token,
        sp.grama_niladhari_url,
        sp.police_report_url,
        sp.doc_request_sent_at
      FROM staff_applications sa
      LEFT JOIN users u ON u.mobile_number = sa.mobile_number
      LEFT JOIN staff_profiles sp ON sp.user_id = u.user_id
      WHERE sa.application_id = $1
    `, [req.params.applicationId]);
    if (result.rows.length === 0) return res.status(404).json({ message: 'Application not found' });
    res.status(200).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching application' });
  }
});

// Admin Only: Update application details
router.put('/applications/:applicationId', uploadApplicationFiles, protect, requirePermission('APPLICATION_UPDATE'), staffAppController.updateApplication);

// Admin Only: Send the Independent Contractor Agreement PDF to an approved applicant via WhatsApp
router.post('/applications/:applicationId/send-agreement', protect, requirePermission('APPLICATION_SEND_AGREEMENT'), staffAppController.sendApplicationAgreement);

// Admin Only: Suggest the next auto-generated Staff ID (EMP-5000 onwards)
router.get('/next-staff-code', protect, requirePermission('VIEW_WORKER_VERIFICATIONS'), staffAppController.getNextStaffCode);

// Admin Only: Accept Application
router.post(
  '/accept',
  protect,
  requirePermission('APPLICATION_ACCEPT'),
  staffAppController.acceptApplication
);

// Admin Only: Reject Application
router.post(
  '/reject',
  protect,
  requirePermission('APPLICATION_REJECT'),
  staffAppController.rejectApplication
);

router.get(
  '/available',
  staffAppController.getAvailableStaffByRole
);

// Staff Login (for new staff with temporary passwords)
router.post('/login', staffAppController.staffLogin);

// Change Password (for staff members)
router.post('/change-password', protect, staffAppController.changeStaffPassword);

// Public: Get all staff with optional filtering (for landing page)
router.get('/', staffController.getAllStaff);

// Public: Get top 5 staff members by highest average ratings
router.get('/top-rated', staffController.getTopRatedStaff);

// Admin: Batched schedule lookup (current + future bookings) for staff-picker UIs —
// ?ids=uuid1,uuid2,... — used to show scheduling conflicts before assigning/swapping staff
router.get(
  '/schedules',
  protect,
  requirePermission('VIEW_USER_MANAGEMENT'),
  staffController.getStaffSchedules
);

// Public: Get all staff members with current_status as 'available'
router.get('/available-staff', staffController.getAvailableStaff);

// Get staff by role
router.get('/role/:role', staffController.getStaffByRole);

// Get staff members who are willing to live in with clients
router.get('/willing-to-live-in', staffController.getStaffWillingToLiveIn);

router.get(
  '/gender/:gender',  
  staffController.getStaffByGender
);

// Create staff profile with file upload support
router.post('/proxy-create', uploadApplicationFiles, protect, requirePermission('STAFF_PROXY_CREATE'), staffController.createStaffProfile);

// Admin: Staff salaries overview (all staff with outstanding payables)
router.get(
  '/salaries/overview',
  protect,
  requirePermission('VIEW_USER_MANAGEMENT'),
  staffController.getStaffSalariesOverview
);

// Admin: Bulk payout for multiple staff
router.post(
  '/salaries/bulk-payouts',
  protect,
  requirePermission('STAFF_CREATE_PAYOUT'),
  staffController.bulkStaffPayouts
);

// Admin: Full export data for Excel download
router.get(
  '/salaries/full-export',
  protect,
  requirePermission('STAFF_EXPORT_SALARY'),
  staffController.getStaffSalariesExportData
);

// Admin: Salary sheet PDF ledger
router.get(
  '/salary-sheets/ledger',
  protect,
  requirePermission('VIEW_USER_MANAGEMENT'),
  staffController.getSalarySheetLedger
);

// Admin: Bulk resend salary sheet notifications (must be before /:id route)
router.post(
  '/salary-sheets/bulk-send-notifications',
  protect,
  requirePermission('STAFF_NOTIFY_SALARY'),
  staffController.bulkResendSalarySheetNotifications
);

// Admin: Resend WhatsApp + SMS for a single salary sheet payout
router.post(
  '/salary-sheets/:staff_payment_id/send-notification',
  protect,
  requirePermission('STAFF_NOTIFY_SALARY'),
  staffController.resendSalarySheetNotification
);

// Admin: Per-booking salary breakdown for a staff member
router.get(
  '/:staff_profile_id/booking-salary-breakdown',
  protect,
  requirePermission('VIEW_USER_MANAGEMENT'),
  staffController.getStaffBookingSalaryBreakdown
);

// Admin: Monthly earnings breakdown for a staff member (Pay Modal preview)
router.get(
  '/:staff_profile_id/monthly-earnings',
  protect,
  requirePermission('VIEW_USER_MANAGEMENT'),
  staffController.getStaffMonthlyEarnings
);

router.get(
    '/:staff_profile_id/assignments',
    protect,
    staffController.getStaffAssignments
);

// Admin: aggregated staff detail for admin UI
router.get(
  '/:staff_profile_id/admin-detail',
  protect,
  requirePermission('VIEW_USER_MANAGEMENT'),
  staffController.getAdminStaffDetail
);

// Get current active booking for staff (admin view)
router.get(
  '/:staff_profile_id/current-booking',
  protect,
  requirePermission('VIEW_USER_MANAGEMENT'),
  staffController.getCurrentBooking
);

// Booking history (assignment-centric) for staff (admin view)
router.get(
  '/:staff_profile_id/booking-history',
  protect,
  requirePermission('VIEW_USER_MANAGEMENT'),
  staffController.getBookingHistory
);

// Future-dated (SCHEDULED) assignments for staff (admin view)
router.get(
  '/:staff_profile_id/future-bookings',
  protect,
  requirePermission('VIEW_USER_MANAGEMENT'),
  staffController.getFutureBookings
);

// Full attendance calendar (assignment spans + per-day attendance) for staff
// Admins can view any staff member's calendar; staff can only view their own (enforced in controller).
// NOTE: shared with staff self-service — deliberately NOT gated by requirePermission,
// since those roles have no staff_permissions row.
router.get(
  '/:staff_profile_id/attendance-calendar',
  protect,
  restrictTo('SUPER_ADMIN', 'COORDINATOR', 'ACCOUNTS', 'STAFF', 'NURSE', 'CARETAKER', 'NANNY', 'NURSING_ASSISTANT', 'PHYSIOTHERAPIST', 'COUNSELLOR'),
  staffController.getAttendanceCalendar
);

// Soft deactivate/reactivate staff account
router.patch(
  '/:staff_profile_id/deactivate',
  protect,
  requirePermission('STAFF_DEACTIVATE'),
  staffController.deactivateStaffAccount
);

router.patch(
  '/:staff_profile_id/reactivate',
  protect,
  requirePermission('STAFF_REACTIVATE'),
  staffController.reactivateStaffAccount
);

// Staff bank accounts management (list/create/update/delete).
// NOTE: shared with staff self-service (managing their own payout bank account) —
// deliberately NOT gated by requirePermission, since those roles have no staff_permissions row.
router.get(
  '/:staff_profile_id/bank-accounts',
  protect,
  restrictTo('SUPER_ADMIN', 'COORDINATOR', 'ACCOUNTS', 'NANNY', 'NURSE', 'CARETAKER', 'NURSING_ASSISTANT', 'PHYSIOTHERAPIST', 'COUNSELLOR'),
  staffController.getStaffBankAccounts
);

router.post(
  '/:staff_profile_id/bank-accounts',
  protect,
  restrictTo('SUPER_ADMIN', 'COORDINATOR', 'ACCOUNTS', 'NANNY', 'NURSE', 'CARETAKER', 'NURSING_ASSISTANT', 'PHYSIOTHERAPIST', 'COUNSELLOR'),
  staffController.createStaffBankAccount
);

router.put(
  '/:staff_profile_id/bank-accounts/:staff_bank_account_id',
  protect,
  restrictTo('SUPER_ADMIN', 'COORDINATOR', 'ACCOUNTS', 'NANNY', 'NURSE', 'CARETAKER', 'NURSING_ASSISTANT', 'PHYSIOTHERAPIST', 'COUNSELLOR'),
  staffController.updateStaffBankAccount
);

router.delete(
  '/:staff_profile_id/bank-accounts/:staff_bank_account_id',
  protect,
  restrictTo('SUPER_ADMIN', 'COORDINATOR', 'ACCOUNTS', 'NANNY', 'NURSE', 'CARETAKER', 'NURSING_ASSISTANT', 'PHYSIOTHERAPIST', 'COUNSELLOR'),
  staffController.deleteStaffBankAccount
);

// Payouts history and summary for staff (admin view)
router.get(
  '/:staff_profile_id/payouts/summary',
  protect,
  requirePermission('VIEW_USER_MANAGEMENT'),
  staffController.getPayoutsSummary
);

router.get(
  '/:staff_profile_id/payouts',
  protect,
  requirePermission('VIEW_USER_MANAGEMENT'),
  staffController.getPayouts
);

// Earnings summary and transactions for staff (admin view)
router.get(
  '/:staff_profile_id/earnings-summary',
  protect,
  requirePermission('VIEW_USER_MANAGEMENT'),
  staffController.getEarningsSummary
);

router.get(
  '/:staff_profile_id/earnings-transactions',
  protect,
  requirePermission('VIEW_USER_MANAGEMENT'),
  staffController.getEarningsTransactions
);

// Earnings breakdown pages
router.get(
  '/:staff_profile_id/total-earnings-breakdown',
  protect,
  requirePermission('VIEW_USER_MANAGEMENT'),
  staffController.getTotalEarningsBreakdown
);

router.get(
  '/:staff_profile_id/current-earnings-breakdown',
  protect,
  requirePermission('VIEW_USER_MANAGEMENT'),
  staffController.getCurrentEarningsBreakdown
);

// Admin: Record a payout to a staff member (company -> staff personal bank)
router.post(
  '/:staff_profile_id/payouts',
  protect,
  requirePermission('STAFF_CREATE_PAYOUT'),
  staffController.createStaffPayout
);

// Deductions
router.get(
  '/:staff_profile_id/deductions',
  protect,
  requirePermission('VIEW_USER_MANAGEMENT'),
  staffController.getStaffDeductions
);

router.post(
  '/:staff_profile_id/deductions',
  protect,
  requirePermission('STAFF_APPLY_DEDUCTION'),
  staffController.createStaffDeduction
);

// Admin Notes (multiple notes per staff, shown as a carousel on the staff detail page)
router.get(
  '/:staff_profile_id/admin-notes',
  protect,
  requirePermission('VIEW_USER_MANAGEMENT'),
  staffController.getStaffAdminNotes
);
router.post(
  '/:staff_profile_id/admin-notes',
  protect,
  requirePermission('STAFF_ADD_NOTE'),
  staffController.createStaffAdminNote
);
router.put(
  '/:staff_profile_id/admin-notes/:note_id',
  protect,
  requirePermission('STAFF_EDIT_NOTE'),
  staffController.updateStaffAdminNote
);
router.delete(
  '/:staff_profile_id/admin-notes/:note_id',
  protect,
  requirePermission('STAFF_DELETE_NOTE'),
  staffController.deleteStaffAdminNote
);

// Update staff status to unavailable
router.put('/:staff_profile_id/unavailable', protect, staffController.updateStaffToUnavailable);

// Update staff status (general)
router.put('/:staff_profile_id/status', protect, staffController.updateStaffStatus);

// Admin Only: Send the Independent Contractor Agreement PDF via WhatsApp (Staff Detail > Documents tab)
router.post('/:staff_profile_id/send-agreement', protect, requirePermission('APPLICATION_SEND_AGREEMENT'), staffAppController.sendApplicationAgreementByStaffId);

// Admin Only: Send the compliance-document upload request via WhatsApp (Staff Detail > Documents tab)
router.post('/:staff_profile_id/send-document-request', protect, requirePermission('STAFF_DOC_SEND_REQUEST'), staffDocUploadController.sendDocumentRequestByStaffId);

// Admin Only: update years of experience. Staff profile changes are admin-dashboard-only.
router.patch(
  '/:staff_profile_id/experience-level',
  protect,
  requirePermission('STAFF_EDIT'),
  staffController.updateStaffExperienceLevel
);

// Get staff by user_id (must be before catch-all)
router.get('/user/:user_id', protect, staffController.getStaffByUserID);

// Update staff profile (handle file uploads from proxy management)
router.put('/:staff_profile_id', uploadApplicationFiles, protect, requirePermission('STAFF_EDIT'), staffController.updateStaffProfile);

// Delete staff profile
router.delete('/:staff_profile_id', protect, staffController.deleteStaffProfile);

// Get staff profile associated with a client profile (helper for testing connections)
router.get('/by-client/:client_profile_id', protect, async (req, res) => {
  const { client_profile_id } = req.params;
  
  try {
    const query = `
      SELECT sp.staff_profile_id, sp.full_name, cp.full_name as client_name
      FROM staff_profiles sp
      JOIN users u ON sp.user_id = u.user_id
      JOIN client_profiles cp ON u.user_id = cp.user_id
      WHERE cp.client_profile_id = $1
    `;
    
    const result = await db.query(query, [client_profile_id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ 
        message: "No staff profile found associated with this client profile" 
      });
    }
    
    res.json({
      message: "Staff profile found associated with client profile",
      data: result.rows[0]
    });
    
  } catch (error) {
    console.error("Error finding staff profile for client:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// Public: Get staff by ID (for landing page profiles)
router.get('/:staff_id', staffController.getStaffByID);

module.exports = router;