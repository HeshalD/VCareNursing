const express = require('express');
const router = express.Router();
const productController = require('../controllers/productController');
const upload = require('../config/cloudinaryConfig');
const { protect, restrictTo } = require('../middleware/authMiddleware');

// Public route to view products
router.get('/', productController.getAllProducts);

// Admin only: Create product with image upload
router.post(
  '/',
  protect,
  restrictTo('SUPER_ADMIN'),
  upload.single('image'), // 'image' must match the field name in Postman
  productController.createProduct
);

module.exports = router;