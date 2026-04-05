// ============================================
// upload.js - Multer + Cloudinary Upload
// Handles image upload middleware
// Images go directly to Cloudinary
// No local storage needed
// ============================================

const multer                  = require('multer');
const { CloudinaryStorage }   = require('multer-storage-cloudinary');
const cloudinary              = require('../config/cloudinary');

// ============================================
// CLOUDINARY STORAGE CONFIG
// Defines where and how images are stored
// ============================================
const storage = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => {
    return {
      // Folder in Cloudinary
      // Products go in freshchicken/products folder
      folder: `${
        process.env.CLOUDINARY_FOLDER || 'freshchicken'
      }/products`,

      // Allowed image formats
      allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],

      // Transformation applied on upload
      // Resize to max 800x800 and optimize quality
      transformation: [
        {
          width:   800,
          height:  800,
          crop:    'limit',    // Don't upscale
          quality: 'auto',     // Auto optimize quality
          fetch_format: 'auto' // Auto best format
        }
      ],

      // Generate unique filename
      // Uses product owner id + timestamp
      public_id: `product_${
        req.user?._id || 'unknown'
      }_${Date.now()}`,
    };
  },
});

// ============================================
// FILE FILTER
// Only allow image files
// Reject other file types
// ============================================
const fileFilter = (req, file, cb) => {
  // Check file mimetype
  if (file.mimetype.startsWith('image/')) {
    // ✅ Accept file
    cb(null, true);
  } else {
    // ❌ Reject file
    cb(
      new Error('Only image files are allowed!'),
      false
    );
  }
};

// ============================================
// MULTER UPLOAD INSTANCE
// ============================================
const upload = multer({
  storage,
  fileFilter,
  limits: {
    // Max file size: 5MB per image
    fileSize: 5 * 1024 * 1024,
  },
});

// ============================================
// EXPORT UPLOAD MIDDLEWARE
//
// Usage in routes:
// Single image:   upload.single('image')
// Multiple:       upload.array('images', 5)
// ============================================
module.exports = upload;