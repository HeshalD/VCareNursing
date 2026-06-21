const express = require('express');
const router = express.Router();
const { protect, restrictTo } = require('../middleware/authMiddleware');
const ctrl = require('../controllers/salespersonController');

/**
 * Salesperson crediting routes.
 * Salespersons are internal_staff. The booking's paid amount + a booking count are
 * credited once (permanently) to the salesperson who brought the booking in; the
 * "current" salesperson is a switchable pointer that does not affect those metrics.
 */

router.use(protect);
router.use(restrictTo('SUPER_ADMIN', 'COORDINATOR'));

// Salesperson directory + aggregates
router.get('/', ctrl.listSalespersons);

// Audit trail for one salesperson
router.get('/:salesperson_id/bookings', ctrl.getSalespersonBookings);

// Per-booking current/origin/history
router.get('/booking/:booking_id', ctrl.getBookingSalespersonHandler);

// Credit (initial) and switch (pointer-only)
router.post('/booking/:booking_id/credit', ctrl.creditHandler);
router.put('/booking/:booking_id/switch', ctrl.switchHandler);

module.exports = router;
