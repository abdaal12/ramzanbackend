// ============================================
// cart.js - Cart Routes
// ============================================

const express = require('express');
const router  = express.Router();

// ✅ Import controller functions
const {
  getCart,
  addToCart,
  updateCartItem,
  removeFromCart,
  clearCart,
} = require('../controllers/cartController');

// ✅ Import auth middleware
const { protect, authorize } = require('../middleware/auth');

// ============================================
// ALL CART ROUTES - Customer only
// All routes require login
// ============================================

// GET /api/cart
// Get current user cart with totals
router.get(
  '/',
  protect,
  authorize('customer'),
  getCart
);

// POST /api/cart
// Add item to cart
// Body: { productId, quantity, weight }
router.post(
  '/',
  protect,
  authorize('customer'),
  addToCart
);

// PUT /api/cart/:productId
// Update item quantity
// Body: { quantity }
router.put(
  '/:productId',
  protect,
  authorize('customer'),
  updateCartItem
);

// DELETE /api/cart/clear
// Clear entire cart
// Must be before /:productId route
router.delete(
  '/clear',
  protect,
  authorize('customer'),
  clearCart
);

// DELETE /api/cart/:productId
// Remove single item from cart
router.delete(
  '/:productId',
  protect,
  authorize('customer'),
  removeFromCart
);

module.exports = router;