// ============================================
// auth.js - Auth Routes
// Maps HTTP requests to controller functions
// ============================================

const express = require('express');
const router  = express.Router();

// ✅ Import controller functions
const {
  register,
  login,
  getProfile,
  updateProfile,
  logout,
  changePassword,
} = require('../controllers/authController');

// ✅ Import auth middleware
const { protect } = require('../middleware/auth');

// ============================================
// PUBLIC ROUTES
// No login required
// ============================================

// POST /api/auth/register
// Register new customer or owner
router.post('/register', register);

// POST /api/auth/login
// Login with email & password
router.post('/login', login);

// ============================================
// PRIVATE ROUTES
// Login required (protect middleware)
// ============================================

// GET /api/auth/profile
// Get logged in user profile
router.get('/profile', protect, getProfile);

// PUT /api/auth/profile
// Update logged in user profile
router.put('/profile', protect, updateProfile);

// POST /api/auth/logout
// Logout user
router.post('/logout', protect, logout);

// PUT /api/auth/change-password
// Change user password
router.put('/change-password', protect, changePassword);

module.exports = router;