const express = require('express');
const router = express.Router();
const staffAppController = require('../controllers/staffAppController');
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
  protect,
  restrictTo('SUPER_ADMIN', 'COORDINATOR'),
  staffAppController.getAvailableStaffByRole
);

// Staff Login (for new staff with temporary passwords)
router.post('/login', staffAppController.staffLogin);

// Change Password (for staff members)
router.post('/change-password', protect, staffAppController.changeStaffPassword);

module.exports = router;