const express = require('express');
const router = express.Router();
const staffReviewController = require('../controllers/staffReviewController');
const { protect, restrictTo } = require('../middleware/authMiddleware');

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
router.get('/unreviewed-bookings', restrictTo('SUPER_ADMIN'), staffReviewController.getUnreviewedBookings);
router.post('/send-review-request', restrictTo('SUPER_ADMIN'), staffReviewController.sendReviewRequest);
router.patch('/:review_id/visibility', restrictTo('SUPER_ADMIN'), staffReviewController.toggleReviewVisibility);
router.get('/', restrictTo('SUPER_ADMIN'), staffReviewController.getAllReviews);

module.exports = router;