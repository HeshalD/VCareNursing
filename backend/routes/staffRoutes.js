const express = require('express');
const router = express.Router();
const staffAppController = require('../controllers/staffAppController');
const staffController = require('../controllers/staffController');
const { uploadApplicationFiles } = require('../middleware/uploadMiddleware');
const { protect, restrictTo } = require('../middleware/authMiddleware');
const db = require('../config/db');

// Public: Apply to join VCare
router.post('/apply', uploadApplicationFiles, staffAppController.submitApplication);

// Public: Verify phone OTP after application submission
router.post('/verify-otp', staffAppController.verifyStaffApplicationOtp);

// Public: Resend phone OTP for application
router.post('/resend-otp', staffAppController.resendStaffApplicationOtp);

// Admin Only: View all applications
router.get('/applications', protect, restrictTo('SUPER_ADMIN'), async (req, res) => {
  const apps = await db.query('SELECT * FROM staff_applications ORDER BY applied_at DESC');
  res.status(200).json(apps.rows);
});

// Admin Only: Get single application by ID (includes staff_profile_id if accepted)
router.get('/applications/:applicationId', protect, restrictTo('SUPER_ADMIN'), async (req, res) => {
  try {
    const result = await db.query(`
      SELECT sa.*, sp.staff_profile_id
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
router.put('/applications/:applicationId', protect, restrictTo('SUPER_ADMIN'), staffAppController.updateApplication);

// Admin Only: Accept Application
router.post(
  '/accept',
  protect,
  restrictTo('SUPER_ADMIN'),
  staffAppController.acceptApplication
);

// Admin Only: Reject Application
router.post(
  '/reject',
  protect,
  restrictTo('SUPER_ADMIN'),
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
router.post('/proxy-create', uploadApplicationFiles, protect, restrictTo('SUPER_ADMIN', 'COORDINATOR'), staffController.createStaffProfile);

router.get(
    '/:staff_profile_id/assignments', 
    protect, 
    staffController.getStaffAssignments
);

// Admin: aggregated staff detail for admin UI
router.get(
  '/:staff_profile_id/admin-detail',
  protect,
  restrictTo('SUPER_ADMIN', 'COORDINATOR', 'ACCOUNTS'),
  staffController.getAdminStaffDetail
);

// Get current active booking for staff (admin view)
router.get(
  '/:staff_profile_id/current-booking',
  protect,
  restrictTo('SUPER_ADMIN', 'COORDINATOR', 'ACCOUNTS'),
  staffController.getCurrentBooking
);

// Booking history (assignment-centric) for staff (admin view)
router.get(
  '/:staff_profile_id/booking-history',
  protect,
  restrictTo('SUPER_ADMIN', 'COORDINATOR', 'ACCOUNTS'),
  staffController.getBookingHistory
);

// Soft deactivate/reactivate staff account
router.patch(
  '/:staff_profile_id/deactivate',
  protect,
  restrictTo('SUPER_ADMIN', 'COORDINATOR', 'ACCOUNTS'),
  staffController.deactivateStaffAccount
);

router.patch(
  '/:staff_profile_id/reactivate',
  protect,
  restrictTo('SUPER_ADMIN', 'COORDINATOR', 'ACCOUNTS'),
  staffController.reactivateStaffAccount
);

// Staff bank accounts management (list/create/update/delete)
router.get(
  '/:staff_profile_id/bank-accounts',
  protect,
  restrictTo('SUPER_ADMIN', 'COORDINATOR', 'ACCOUNTS', 'NANNY', 'NURSE', 'CARETAKER'),
  staffController.getStaffBankAccounts
);

router.post(
  '/:staff_profile_id/bank-accounts',
  protect,
  restrictTo('SUPER_ADMIN', 'COORDINATOR', 'ACCOUNTS', 'NANNY', 'NURSE', 'CARETAKER'),
  staffController.createStaffBankAccount
);

router.put(
  '/:staff_profile_id/bank-accounts/:staff_bank_account_id',
  protect,
  restrictTo('SUPER_ADMIN', 'COORDINATOR', 'ACCOUNTS', 'NANNY', 'NURSE', 'CARETAKER'),
  staffController.updateStaffBankAccount
);

router.delete(
  '/:staff_profile_id/bank-accounts/:staff_bank_account_id',
  protect,
  restrictTo('SUPER_ADMIN', 'COORDINATOR', 'ACCOUNTS', 'NANNY', 'NURSE', 'CARETAKER'),
  staffController.deleteStaffBankAccount
);

// Payouts history and summary for staff (admin view)
router.get(
  '/:staff_profile_id/payouts/summary',
  protect,
  restrictTo('SUPER_ADMIN', 'COORDINATOR', 'ACCOUNTS'),
  staffController.getPayoutsSummary
);

router.get(
  '/:staff_profile_id/payouts',
  protect,
  restrictTo('SUPER_ADMIN', 'COORDINATOR', 'ACCOUNTS'),
  staffController.getPayouts
);

// Earnings summary and transactions for staff (admin view)
router.get(
  '/:staff_profile_id/earnings-summary',
  protect,
  restrictTo('SUPER_ADMIN', 'COORDINATOR', 'ACCOUNTS'),
  staffController.getEarningsSummary
);

router.get(
  '/:staff_profile_id/earnings-transactions',
  protect,
  restrictTo('SUPER_ADMIN', 'COORDINATOR', 'ACCOUNTS'),
  staffController.getEarningsTransactions
);

// Earnings breakdown pages
router.get(
  '/:staff_profile_id/total-earnings-breakdown',
  protect,
  restrictTo('SUPER_ADMIN', 'COORDINATOR', 'ACCOUNTS'),
  staffController.getTotalEarningsBreakdown
);

router.get(
  '/:staff_profile_id/current-earnings-breakdown',
  protect,
  restrictTo('SUPER_ADMIN', 'COORDINATOR', 'ACCOUNTS'),
  staffController.getCurrentEarningsBreakdown
);

// Admin: Record a payout to a staff member (company -> staff personal bank)
router.post(
  '/:staff_profile_id/payouts',
  protect,
  restrictTo('SUPER_ADMIN', 'ACCOUNTS'),
  staffController.createStaffPayout
);

// Update staff status to unavailable
router.put('/:staff_profile_id/unavailable', protect, staffController.updateStaffToUnavailable);

// Update staff status (general)
router.put('/:staff_profile_id/status', protect, staffController.updateStaffStatus);

// Get staff by user_id (must be before catch-all)
router.get('/user/:user_id', protect, staffController.getStaffByUserID);

// Update staff profile (handle file uploads from proxy management)
router.put('/:staff_profile_id', uploadApplicationFiles, protect, restrictTo('SUPER_ADMIN', 'COORDINATOR'), staffController.updateStaffProfile);

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