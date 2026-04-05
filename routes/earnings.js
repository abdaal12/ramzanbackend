// ============================================
// earnings.js - Earnings Routes
// All routes are Owner only
// ============================================

const express = require('express');
const router  = express.Router();

// ✅ Import controller functions
const {
  getEarningsSummary,
  getEarningsByDate,
  getDailyEarnings,
  getMonthlyEarnings,
  getTopProducts,
  getDashboardData,
} = require('../controllers/earningsController');

// ✅ Import auth middleware
const { protect, authorize } = require('../middleware/auth');

// ============================================
// ALL EARNINGS ROUTES - Owner only
// ============================================

// GET /api/earnings/dashboard
// Get all dashboard data in one call
router.get(
  '/dashboard',
  protect,
  authorize('owner'),
  getDashboardData
);

// GET /api/earnings/summary
// Get all time + today + week + month summary
router.get(
  '/summary',
  protect,
  authorize('owner'),
  getEarningsSummary
);

// GET /api/earnings/daily
// Get daily earnings for chart
// Query: ?days=30
router.get(
  '/daily',
  protect,
  authorize('owner'),
  getDailyEarnings
);

// GET /api/earnings/monthly
// Get monthly earnings for chart
router.get(
  '/monthly',
  protect,
  authorize('owner'),
  getMonthlyEarnings
);

// GET /api/earnings/top-products
// Get top selling products
// Query: ?limit=5
router.get(
  '/top-products',
  protect,
  authorize('owner'),
  getTopProducts
);

// GET /api/earnings
// Get earnings by date range
// Query: ?start=2026-01-01&end=2026-01-31
router.get(
  '/',
  protect,
  authorize('owner'),
  getEarningsByDate
);

module.exports = router;