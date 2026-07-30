const express = require('express');
const router = express.Router();
const { protect, restrictTo, requirePermission } = require('../middleware/authMiddleware');
const ctrl = require('../controllers/salespersonController');

/**
 * Salesperson crediting routes.
 * Salespersons are internal_staff. The booking's paid amount + a booking count are
 * credited once (permanently) to the salesperson who brought the booking in; the
 * "current" salesperson is a switchable pointer that does not affect those metrics.
 */

router.use(protect);

// Salesperson directory + aggregates
router.get('/', requirePermission('VIEW_SALESPERSONS'), ctrl.listSalespersons);

// Audit trail for one salesperson
router.get('/:salesperson_id/bookings', requirePermission('VIEW_SALESPERSONS'), ctrl.getSalespersonBookings);
router.get('/:salesperson_id/clients', requirePermission('VIEW_SALESPERSONS'), ctrl.getSalespersonClients);

// Per-booking current/origin/history
router.get('/booking/:booking_id', requirePermission('VIEW_SALESPERSONS'), ctrl.getBookingSalespersonHandler);

// Credit (initial) and switch (pointer-only)
router.post('/booking/:booking_id/credit', requirePermission('SALESPERSON_CREDIT'), ctrl.creditHandler);
router.put('/booking/:booking_id/switch', requirePermission('SALESPERSON_CREDIT'), ctrl.switchHandler);

// Per-client current/origin/history (registration crediting — separate metric)
router.get('/client/:client_id', requirePermission('VIEW_SALESPERSONS'), ctrl.getClientSalespersonHandler);
router.post('/client/:client_id/credit', requirePermission('SALESPERSON_CREDIT'), ctrl.creditClientHandler);
router.put('/client/:client_id/switch', requirePermission('SALESPERSON_CREDIT'), ctrl.switchClientHandler);

module.exports = router;
