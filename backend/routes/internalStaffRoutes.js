const express = require('express');
const router = express.Router();
const internalStaffController = require('../controllers/internalStaffController');
const { protect, restrictTo } = require('../middleware/authMiddleware');

// All internal staff routes should be protected and ideally restricted to SUPER_ADMIN
// For now we protect them with the same mechanism used in other admin routes

router.use(protect); // Ensure user is logged in
router.use(restrictTo('SUPER_ADMIN')); // Ensure user is SUPER_ADMIN

// --- STAFF CRUD ---
router.route('/')
  .get(internalStaffController.getAllStaff)
  .post(internalStaffController.createStaff);

router.route('/:id')
  .put(internalStaffController.updateStaff)
  .delete(internalStaffController.deleteStaff);

// --- TASK MANAGEMENT ---
router.route('/:id/tasks')
  .get(internalStaffController.getStaffTasks)
  .post(internalStaffController.assignTask);

router.route('/tasks/:taskId')
  .patch(internalStaffController.updateTaskStatus)
  .delete(internalStaffController.deleteTask);

// --- PAYROLL MANAGEMENT ---
router.route('/payroll/all')
  .get(internalStaffController.getAllPayroll);

router.route('/:id/payroll')
  .get(internalStaffController.getStaffPayroll)
  .post(internalStaffController.addPayrollRecord);

router.route('/payroll/:payrollId')
  .patch(internalStaffController.updatePayrollStatus);

module.exports = router;
