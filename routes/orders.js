// ============================================
// orders.js - Order Routes
// ============================================

const express = require('express');
const router  = express.Router();

// ✅ Import controller functions
const {
  placeOrder,
  getMyOrders,
  getOrderById,
  getOwnerOrders,
  updateOrderStatus,
  cancelOrder,
  getOwnerOrderStats,
} = require('../controllers/orderController');

// ✅ Import auth middleware
const { protect, authorize } = require('../middleware/auth');

// ============================================
// CUSTOMER ROUTES
// ============================================

// POST /api/orders
// Place new order
router.post(
  '/',
  protect,
  authorize('customer'),
  placeOrder
);

// GET /api/orders/myorders
// Get customer's own orders
router.get(
  '/myorders',
  protect,
  authorize('customer'),
  getMyOrders
);

// PUT /api/orders/:id/cancel
// Cancel order (customer)
router.put(
  '/:id/cancel',
  protect,
  authorize('customer'),
  cancelOrder
);

// ============================================
// OWNER ROUTES
// ============================================

// GET /api/orders/owner/allorders
// Get all orders for owner's shop
router.get(
  '/owner/allorders',
  protect,
  authorize('owner'),
  getOwnerOrders
);

// GET /api/orders/owner/stats
// Get order statistics for dashboard
router.get(
  '/owner/stats',
  protect,
  authorize('owner'),
  getOwnerOrderStats
);

// PUT /api/orders/:id/status
// Update order status
router.put(
  '/:id/status',
  protect,
  authorize('owner'),
  updateOrderStatus
);

// ============================================
// SHARED ROUTES (Customer & Owner)
// ============================================

// GET /api/orders/:id
// Get single order details
router.get(
  '/:id',
  protect,
  getOrderById
);

module.exports = router;