// ============================================
// errorHandler.js - Global Error Handler
// ============================================

const errorHandler = (err, req, res, next) => {

  console.error('❌ Error:', err.message);

  let statusCode = err.statusCode || 500;
  let message    = err.message    || 'Internal Server Error';

  // Invalid MongoDB ObjectId
  if (err.name === 'CastError') {
    statusCode = 404;
    message    = 'Resource not found';
  }

  // Duplicate key error
  if (err.code === 11000) {
    statusCode = 409;
    const field = Object.keys(err.keyValue)[0];
    if (field === 'phone') {
      message = 'An account with this phone already exists';
    } else if (field === 'email') {
      message = 'An account with this email already exists';
    } else {
      message = `${field} already exists`;
    }
  }

  // Mongoose ValidationError
  if (err.name === 'ValidationError') {
    statusCode = 400;
    message    = Object.values(err.errors)
      .map(e => e.message)
      .join(', ');
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    message    = 'Invalid token. Please login again.';
  }

  if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    message    = 'Token expired. Please login again.';
  }

  res.status(statusCode).json({
    success: false,
    message,
    ...(process.env.NODE_ENV === 'development' && {
      stack: err.stack
    })
  });
};

module.exports = errorHandler;