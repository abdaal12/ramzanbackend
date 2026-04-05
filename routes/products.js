// ============================================
// products.js - Product Routes
// Includes image upload routes
// ============================================

const express = require('express');
const router  = express.Router();

const {
  getAllProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
  getOwnerProducts,
  toggleAvailability,
  uploadMainImage,
  uploadExtraImages,
  deleteProductImage,
} = require('../controllers/productController');

const { protect, authorize } = require('../middleware/auth');

// ✅ Import upload middleware
const upload = require('../middleware/upload');

// ============================================
// PUBLIC ROUTES
// ============================================
router.get('/', getAllProducts);
router.get('/:id', getProductById);

// ============================================
// OWNER ROUTES
// ============================================
router.get(
  '/owner/myproducts',
  protect,
  authorize('owner'),
  getOwnerProducts
);

router.post(
  '/',
  protect,
  authorize('owner'),
  createProduct
);

router.put(
  '/:id',
  protect,
  authorize('owner'),
  updateProduct
);

router.put(
  '/:id/toggle',
  protect,
  authorize('owner'),
  toggleAvailability
);

router.delete(
  '/:id',
  protect,
  authorize('owner'),
  deleteProduct
);

// ============================================
// IMAGE UPLOAD ROUTES
// ============================================

// Upload main product image (single)
router.post(
  '/:id/upload-image',
  protect,
  authorize('owner'),
  upload.single('image'), // ✅ multer middleware
  uploadMainImage
);

// Upload extra images (max 4)
router.post(
  '/:id/upload-extra',
  protect,
  authorize('owner'),
  upload.array('images', 4), // ✅ multer array
  uploadExtraImages
);

// Delete a product image
router.delete(
  '/:id/image',
  protect,
  authorize('owner'),
  deleteProductImage
);

module.exports = router;