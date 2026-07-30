const express = require('express');
const router = express.Router();
const { protect, requirePermission } = require('../middleware/authMiddleware');
const permissionsController = require('../controllers/permissionsController');

// All routes require authentication.
router.use(protect);

// Any logged-in admin fetches their own permissions (frontend uses this after login).
router.get('/my-permissions', permissionsController.getMyPermissions);

// Everything below requires PERMISSIONS_MANAGE (SUPER_ADMIN has it by default).
router.use(requirePermission('PERMISSIONS_MANAGE'));

router.get('/admin-users', permissionsController.listAdminUsers);
router.get('/registry', permissionsController.getRegistry);
router.get('/users/:userId', permissionsController.getUserPermissions);
router.put('/users/:userId', permissionsController.setUserPermissions);
router.post('/users/:userId/:key', permissionsController.grantPermission);
router.delete('/users/:userId/:key', permissionsController.revokePermission);

module.exports = router;
