const express = require('express');
const router = express.Router();
const { protect, requirePermission } = require('../middleware/authMiddleware');
const ctrl = require('../controllers/internalStaffSalaryController');

router.use(protect);

router.get('/my-staff-id', ctrl.getMyInternalStaffId);

router.get('/presets', requirePermission('VIEW_INTERNAL_STAFF_SALARY'), ctrl.listPresets);
router.post('/presets', requirePermission('INTERNAL_STAFF_SALARY_PRESET_MANAGE'), ctrl.createPreset);
router.put('/presets/:id', requirePermission('INTERNAL_STAFF_SALARY_PRESET_MANAGE'), ctrl.updatePreset);
router.delete('/presets/:id', requirePermission('INTERNAL_STAFF_SALARY_PRESET_MANAGE'), ctrl.deactivatePreset);

router.get('/sheets', requirePermission('VIEW_INTERNAL_STAFF_SALARY'), ctrl.listSheets);
router.get('/staff/:staffId/profile', requirePermission('VIEW_INTERNAL_STAFF_SALARY'), ctrl.getStaffProfile);
router.get('/staff/:staffId/sales-attribution', requirePermission('VIEW_INTERNAL_STAFF_SALARY'), ctrl.getSalesAttribution);
router.put('/registrations/:assignmentId/commission', requirePermission('INTERNAL_STAFF_SALARY_BUILD'), ctrl.updateRegistrationCommission);
router.get('/staff/:staffId/coordinator-work', requirePermission('VIEW_INTERNAL_STAFF_SALARY'), ctrl.getCoordinatorWork);
router.post('/staff/:staffId/sheets', requirePermission('INTERNAL_STAFF_SALARY_BUILD'), ctrl.createDraftSheet);

router.get('/sheets/:id', requirePermission('VIEW_INTERNAL_STAFF_SALARY'), ctrl.getSheet);
router.put('/sheets/:id', requirePermission('INTERNAL_STAFF_SALARY_BUILD'), ctrl.updateDraftSheet);
router.get('/sheets/:id/preview', requirePermission('INTERNAL_STAFF_SALARY_BUILD'), ctrl.previewSheet);
router.post('/sheets/:id/finalize', requirePermission('INTERNAL_STAFF_SALARY_FINALIZE'), ctrl.finalizeSheet);

// Goals
router.get('/staff/:staffId/goals', requirePermission('VIEW_INTERNAL_STAFF_SALARY'), ctrl.listGoals);
router.post('/staff/:staffId/goals', requirePermission('INTERNAL_STAFF_GOAL_MANAGE'), ctrl.createGoal);
router.put('/goals/:id', requirePermission('INTERNAL_STAFF_GOAL_MANAGE'), ctrl.updateGoal);

// Performance tiers + summary + history
router.get('/performance-tiers', requirePermission('VIEW_INTERNAL_STAFF_SALARY'), ctrl.listPerformanceTiers);
router.put('/performance-tiers', requirePermission('INTERNAL_STAFF_GOAL_MANAGE'), ctrl.upsertPerformanceTiers);
router.get('/staff/:staffId/performance-summary', requirePermission('VIEW_INTERNAL_STAFF_SALARY'), ctrl.getPerformanceSummary);
router.get('/staff/:staffId/performance-history', requirePermission('VIEW_INTERNAL_STAFF_SALARY'), ctrl.getPerformanceHistory);

// Advances
router.get('/staff/:staffId/advances', requirePermission('VIEW_INTERNAL_STAFF_SALARY'), ctrl.listAdvances);
router.post('/staff/:staffId/advances', requirePermission('INTERNAL_STAFF_ADVANCE_GIVE'), ctrl.giveAdvance);

module.exports = router;
