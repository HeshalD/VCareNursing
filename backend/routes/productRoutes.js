const express = require('express');
const router = express.Router();
const productController = require('../controllers/productController');
const { upload } = require('../config/cloudinaryConfig');
const { protect, restrictTo } = require('../middleware/authMiddleware');

const ADMIN_ROLES = ['SUPER_ADMIN', 'COORDINATOR', 'ACCOUNTS'];

// Public route to browse the catalog (client portal + admin both use this)
router.get('/', productController.getAllProducts);

router.get('/categories', productController.getCategories);
router.post('/categories', protect, restrictTo(...ADMIN_ROLES), productController.createCategory);

// Client portal: the logged-in client's own purchased/rented products + deposits.
// Must be registered before the '/:id' catch-all route below.
router.get('/mine', protect, productController.getMyOrders);

router.get('/:id', productController.getProduct);

router.get(
  '/:id/purchase-history',
  protect,
  restrictTo(...ADMIN_ROLES),
  productController.getProductPurchaseHistory
);

// Admin only: Create product with image upload.
// Field name must be "image" — that's the fieldname folderMap in
// config/cloudinaryConfig.js routes to the vcare_products/ S3 folder.
router.post(
  '/',
  protect,
  restrictTo(...ADMIN_ROLES),
  upload.single('image'),
  productController.createProduct
);

router.put(
  '/:id',
  protect,
  restrictTo(...ADMIN_ROLES),
  upload.single('image'),
  productController.updateProduct
);

router.patch(
  '/:id/deactivate',
  protect,
  restrictTo(...ADMIN_ROLES),
  productController.deactivateProduct
);

module.exports = router;
