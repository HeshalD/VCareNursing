const express = require('express');
const router = express.Router();
const staffAppController = require('../controllers/staffAppController');
const staffController = require('../controllers/staffController');
const { uploadApplicationFiles } = require('../middleware/uploadMiddleware');
const { protect, restrictTo } = require('../middleware/authMiddleware');
const db = require('../config/db');

// Public: Apply to join VCare
router.post('/apply', uploadApplicationFiles, staffAppController.submitApplication);

// Admin Only: View all applications
router.get('/applications', protect, restrictTo('SUPER_ADMIN'), async (req, res) => {
  const apps = await db.query('SELECT * FROM staff_applications ORDER BY applied_at DESC');
  res.status(200).json(apps.rows);
});

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

// Update staff status to unavailable
router.put('/:staff_profile_id/unavailable', protect, staffController.updateStaffToUnavailable);

// Update staff status (general)
router.put('/:staff_profile_id/status', protect, staffController.updateStaffStatus);

// Get staff by user_id (must be before catch-all)
router.get('/user/:user_id', protect, staffController.getStaffByUserID);

// Update staff profile (handle file uploads and self-updates)
router.put('/:staff_profile_id', uploadApplicationFiles, protect, restrictTo('SUPER_ADMIN', 'COORDINATOR', 'NURSE', 'CARETAKER', 'NANNY'), staffController.updateStaffProfile);

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