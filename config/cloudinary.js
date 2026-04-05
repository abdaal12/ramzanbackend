// ============================================
// cloudinary.js - Cloudinary Configuration
// Sets up cloudinary connection using
// credentials from .env file
// ============================================

const cloudinary = require('cloudinary').v2;

// ✅ Configure cloudinary with credentials
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

module.exports = cloudinary;