const express = require('express');
const router = express.Router();
const staffReviewController = require('../controllers/staffReviewController');
const { protect, restrictTo, requirePermission } = require('../middleware/authMiddleware');

// Public routes (no authentication required)
router.get('/statistics', staffReviewController.getReviewStatistics);
router.get('/staff/:staff_id', staffReviewController.getReviewsByStaffId);

// Protected routes (authentication required)
router.use(protect); // Apply authentication to all routes below

// Client routes
router.post('/', staffReviewController.createReview);
router.get('/reviewable', staffReviewController.getReviewableBookings);
router.get('/client/:client_id', staffReviewController.getReviewsByClientId);
router.get('/:review_id', staffReviewController.getReviewById);
router.put('/:review_id', staffReviewController.updateReview);
router.delete('/:review_id', staffReviewController.deleteReview);

// Admin routes
router.get('/unreviewed-bookings', requirePermission('VIEW_STAFF_REVIEWS'), staffReviewController.getUnreviewedBookings);
router.post('/send-review-request', requirePermission('REVIEW_SEND_REQUEST'), staffReviewController.sendReviewRequest);
router.patch('/:review_id/visibility', requirePermission('REVIEW_TOGGLE_VISIBILITY'), staffReviewController.toggleReviewVisibility);
router.get('/admin/reviewable/:client_id', requirePermission('VIEW_STAFF_REVIEWS'), staffReviewController.getReviewableBookingsForClient);
router.post('/admin/create', requirePermission('REVIEW_ADMIN_CREATE'), staffReviewController.adminCreateReview);
router.get('/', requirePermission('VIEW_STAFF_REVIEWS'), staffReviewController.getAllReviews);

module.exports = router;