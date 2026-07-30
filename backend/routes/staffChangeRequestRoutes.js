const express = require('express');
const router = express.Router();
const { protect, restrictTo, requirePermission } = require('../middleware/authMiddleware');
const ctrl = require('../controllers/staffChangeRequestController');

const STAFF_ROLES = ['NURSE', 'CARETAKER', 'NANNY', 'NURSING_ASSISTANT', 'PHYSIOTHERAPIST', 'COUNSELLOR'];
const INTERNAL_ROLES = ['SUPER_ADMIN', 'COORDINATOR', 'ACCOUNTS'];

// Staff-facing
router.post('/', protect, restrictTo(...STAFF_ROLES), ctrl.submitChangeRequest);
router.get('/my', protect, restrictTo(...STAFF_ROLES), ctrl.getMyChangeRequests);

// Admin/internal staff
router.get('/', protect, requirePermission('VIEW_CHANGE_REQUESTS'), ctrl.getAllChangeRequests);
router.patch('/:id/claim', protect, requirePermission('CHANGE_REQUEST_CLAIM'), ctrl.claimChangeRequest);
// NOTE: resolveChangeRequest handles both approve and reject via body.action — a single
// permission key can't distinguish them without a controller/route split, so this is
// gated on CHANGE_REQUEST_APPROVE as the umbrella "can resolve claimed requests" key.
router.patch('/:id/resolve', protect, requirePermission('CHANGE_REQUEST_APPROVE'), ctrl.resolveChangeRequest);
router.get('/:id/logs', protect, requirePermission('VIEW_CHANGE_REQUESTS'), ctrl.getChangeRequestLogs);

module.exports = router;
