const express = require('express');
const router = express.Router();
const { protect, restrictTo, requirePermission } = require('../middleware/authMiddleware');
const ctrl = require('../controllers/recruiterController');

/**
 * Recruiter crediting routes.
 * Recruiters are internal_staff. A staff hire is credited once (permanently)
 * to the recruiter who brought them in; the "current" recruiter is a
 * switchable pointer that does not affect that count.
 */

router.use(protect);

// Recruiter directory + aggregates
router.get('/', requirePermission('VIEW_RECRUITERS'), ctrl.listRecruiters);

// Audit trail for one recruiter
router.get('/:recruiter_id/staff', requirePermission('VIEW_RECRUITERS'), ctrl.getRecruiterStaff);

// Per-staff current/origin/history
router.get('/staff/:staff_profile_id', requirePermission('VIEW_RECRUITERS'), ctrl.getStaffRecruiterHandler);

// Credit (initial) and switch (pointer-only)
router.post('/staff/:staff_profile_id/credit', requirePermission('RECRUITER_CREDIT'), ctrl.creditHandler);
router.put('/staff/:staff_profile_id/switch', requirePermission('RECRUITER_CREDIT'), ctrl.switchHandler);

module.exports = router;
