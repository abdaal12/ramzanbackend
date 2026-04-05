// ============================================
// auth.js - JWT Authentication Middleware
// Protects routes that require login
// Verifies JWT token from request header
// Attaches user data to req.user
// ============================================

const jwt  = require('jsonwebtoken');
const User = require('../models/User');

// ============================================
// PROTECT MIDDLEWARE
// Use this on any route that needs login
// Usage: router.get('/profile', protect, controller)
// ============================================
const protect = async (req, res, next) => {
  try {
    let token;

    // -----------------------------------------------
    // Get token from Authorization header
    // Frontend sends: "Authorization: Bearer <token>"
    // -----------------------------------------------
    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith('Bearer')
    ) {
      // Extract token after "Bearer "
      token = req.headers.authorization.split(' ')[1];
    }

    // If no token found
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. Please login first.'
      });
    }

    // -----------------------------------------------
    // Verify JWT token
    // -----------------------------------------------
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // -----------------------------------------------
    // Find user from decoded token ID
    // Attach user to request object
    // Now any controller can access req.user
    // -----------------------------------------------
    req.user = await User.findById(decoded.id).select('-password');

    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'User not found. Please login again.'
      });
    }

    next();

  } catch (error) {
    return res.status(401).json({
      success: false,
      message: 'Invalid token. Please login again.'
    });
  }
};

// ============================================
// AUTHORIZE MIDDLEWARE
// Restricts access to specific roles
// Usage: router.get('/dashboard', protect, authorize('owner'), controller)
// ============================================
const authorize = (...roles) => {
  return (req, res, next) => {
    // Check if logged in user's role is allowed
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Access denied. ${req.user.role}s cannot access this route.`
      });
    }
    next();
  };
};

module.exports = { protect, authorize };