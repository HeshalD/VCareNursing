const express = require('express');
const router = express.Router();
const { protect, requirePermission } = require('../middleware/authMiddleware');
const ctrl = require('../controllers/internalStaffSalaryController');

router.use(protect);

router.get('/presets', requirePermission('VIEW_INTERNAL_STAFF_SALARY'), ctrl.listPresets);
router.post('/presets', requirePermission('INTERNAL_STAFF_SALARY_PRESET_MANAGE'), ctrl.createPreset);
router.put('/presets/:id', requirePermission('INTERNAL_STAFF_SALARY_PRESET_MANAGE'), ctrl.updatePreset);
router.delete('/presets/:id', requirePermission('INTERNAL_STAFF_SALARY_PRESET_MANAGE'), ctrl.deactivatePreset);

router.get('/sheets', requirePermission('VIEW_INTERNAL_STAFF_SALARY'), ctrl.listSheets);
router.get('/staff/:staffId/profile', requirePermission('VIEW_INTERNAL_STAFF_SALARY'), ctrl.getStaffProfile);
router.get('/staff/:staffId/sales-attribution', requirePermission('VIEW_INTERNAL_STAFF_SALARY'), ctrl.getSalesAttribution);
router.post('/staff/:staffId/sheets', requirePermission('INTERNAL_STAFF_SALARY_BUILD'), ctrl.createDraftSheet);

router.get('/sheets/:id', requirePermission('VIEW_INTERNAL_STAFF_SALARY'), ctrl.getSheet);
router.put('/sheets/:id', requirePermission('INTERNAL_STAFF_SALARY_BUILD'), ctrl.updateDraftSheet);
router.get('/sheets/:id/preview', requirePermission('INTERNAL_STAFF_SALARY_BUILD'), ctrl.previewSheet);
router.post('/sheets/:id/finalize', requirePermission('INTERNAL_STAFF_SALARY_FINALIZE'), ctrl.finalizeSheet);

module.exports = router;
