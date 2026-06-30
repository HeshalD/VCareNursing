const express = require('express');
const router = express.Router();
const { protect, restrictTo } = require('../middleware/authMiddleware');
const ctrl = require('../controllers/staffChangeRequestController');

const STAFF_ROLES = ['NURSE', 'CARETAKER', 'NANNY', 'NURSING_ASSISTANT', 'PHYSIOTHERAPIST', 'COUNSELLOR'];
const INTERNAL_ROLES = ['SUPER_ADMIN', 'COORDINATOR', 'ACCOUNTS'];

// Staff-facing
router.post('/', protect, restrictTo(...STAFF_ROLES), ctrl.submitChangeRequest);
router.get('/my', protect, restrictTo(...STAFF_ROLES), ctrl.getMyChangeRequests);

// Admin/internal staff
router.get('/', protect, restrictTo(...INTERNAL_ROLES), ctrl.getAllChangeRequests);
router.patch('/:id/claim', protect, restrictTo(...INTERNAL_ROLES), ctrl.claimChangeRequest);
router.patch('/:id/resolve', protect, restrictTo(...INTERNAL_ROLES), ctrl.resolveChangeRequest);
router.get('/:id/logs', protect, restrictTo(...INTERNAL_ROLES), ctrl.getChangeRequestLogs);

module.exports = router;
