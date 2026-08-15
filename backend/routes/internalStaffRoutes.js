const express = require('express');
const router = express.Router();
const { protect, requirePermission } = require('../middleware/authMiddleware');
const ctrl = require('../controllers/internalStaffController');

router.use(protect);

router.get('/', requirePermission('VIEW_INTERNAL_STAFF'), ctrl.list);
router.get('/:id', requirePermission('VIEW_INTERNAL_STAFF'), ctrl.getOne);
router.post('/', requirePermission('INTERNAL_STAFF_CREATE'), ctrl.create);
router.put('/:id', requirePermission('INTERNAL_STAFF_EDIT'), ctrl.update);
router.delete('/:id', requirePermission('INTERNAL_STAFF_REMOVE'), ctrl.remove);

module.exports = router;
