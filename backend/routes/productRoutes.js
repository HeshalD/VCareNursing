const express = require('express');
const router = express.Router();
const productController = require('../controllers/productController');
const { upload } = require('../config/cloudinaryConfig');
const { protect, restrictTo, requirePermission } = require('../middleware/authMiddleware');

const ADMIN_ROLES = ['SUPER_ADMIN', 'COORDINATOR', 'ACCOUNTS'];

// Public route to browse the catalog (client portal + admin both use this)
router.get('/', productController.getAllProducts);

router.get('/categories', productController.getCategories);
router.post('/categories', protect, requirePermission('PRODUCT_CATEGORY_MANAGE'), productController.createCategory);

// Client portal: the logged-in client's own purchased/rented products + deposits.
// Must be registered before the '/:id' catch-all route below.
router.get('/mine', protect, productController.getMyOrders);

router.get('/:id', productController.getProduct);

router.get(
  '/:id/purchase-history',
  protect,
  requirePermission('VIEW_PRODUCTS'),
  productController.getProductPurchaseHistory
);

// Admin only: Create product with image upload.
// Field name must be "image" — that's the fieldname folderMap in
// config/cloudinaryConfig.js routes to the vcare_products/ S3 folder.
router.post(
  '/',
  protect,
  requirePermission('PRODUCT_CREATE'),
  upload.single('image'),
  productController.createProduct
);

router.put(
  '/:id',
  protect,
  requirePermission('PRODUCT_EDIT'),
  upload.single('image'),
  productController.updateProduct
);

router.patch(
  '/:id/deactivate',
  protect,
  requirePermission('PRODUCT_EDIT'),
  productController.deactivateProduct
);

module.exports = router;
