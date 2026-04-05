// ============================================
// productController.js - Product Controller
// Handles:
// - Get all products (with proximity sorting)
// - Get single product
// - Create product (owner only)
// - Update product (owner only)
// - Delete product (owner only)
// - Get owner's own products
// ============================================

const Product = require('../models/Product');
const User    = require('../models/User');

// ============================================
// @desc    Get all products
//          Sorted by proximity to customer
//          Same pincode first, then city etc
// @route   GET /api/products
// @access  Public
// Query params:
//   - pincode  : customer pincode
//   - sector   : customer sector
//   - city     : customer city
//   - state    : customer state
//   - category : filter by category
//   - search   : search by name
//   - minPrice : minimum price
//   - maxPrice : maximum price
//   - minRating: minimum rating
//   - sort     : price-low, price-high, rating
//   - page     : page number (pagination)
//   - limit    : items per page
// ============================================
const getAllProducts = async (req, res, next) => {
  try {
    const {
      // Customer location for proximity sorting
      pincode,
      sector,
      city,
      state,

      // Filters
      category,
      search,
      minPrice,
      maxPrice,
      minRating,

      // Sort & Pagination
      sort  = 'proximity',
      page  = 1,
      limit = 12,
    } = req.query;

    // -----------------------------------------------
    // BUILD MATCH FILTER
    // Basic filters applied before proximity sort
    // -----------------------------------------------
    const matchFilter = {
      isAvailable: true,
    };

    // Category filter
    if (category && category !== 'All') {
      matchFilter.category = category;
    }

    // Search filter - searches name & description
    if (search) {
      matchFilter.$or = [
        { name:        { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { category:    { $regex: search, $options: 'i' } },
      ];
    }

    // Price range filter
    if (minPrice || maxPrice) {
      matchFilter.price = {};
      if (minPrice) matchFilter.price.$gte = Number(minPrice);
      if (maxPrice) matchFilter.price.$lte = Number(maxPrice);
    }

    // Rating filter
    if (minRating) {
      matchFilter.rating = { $gte: Number(minRating) };
    }

    // -----------------------------------------------
    // BUILD AGGREGATION PIPELINE
    // Step 1: Match basic filters
    // Step 2: Add proximity score
    // Step 3: Filter by proximity score
    // Step 4: Sort by proximity + rating
    // Step 5: Populate owner details
    // Step 6: Paginate results
    // -----------------------------------------------
    const pipeline = [

      // Step 1: Apply basic filters
      { $match: matchFilter },

      // Step 2 & 3 & 4: Add proximity score
      // Uses static method from Product model
      // Returns sorted pipeline stages
      ...Product.getProximityPipeline(
        pincode || '',
        sector  || '',
        city    || '',
        state   || ''
      ),
    ];

    // -----------------------------------------------
    // OVERRIDE SORT if user selects manual sort
    // Replace proximity sort with user preference
    // -----------------------------------------------
    if (sort === 'price-low') {
      // Remove last $sort stage from pipeline
      pipeline.pop();
      pipeline.push({ $sort: { price: 1 } });
    } else if (sort === 'price-high') {
      pipeline.pop();
      pipeline.push({ $sort: { price: -1 } });
    } else if (sort === 'rating') {
      pipeline.pop();
      pipeline.push({ $sort: { rating: -1 } });
    } else if (sort === 'newest') {
      pipeline.pop();
      pipeline.push({ $sort: { createdAt: -1 } });
    }

    // -----------------------------------------------
    // If no location provided show all products
    // sorted by rating (fallback)
    // -----------------------------------------------
    if (!pincode && !city) {
      // Remove proximity filter stage
      // Keep all products regardless of location
      const matchIndex = pipeline.findIndex(
        stage => stage.$match?.proximityScore
      );
      if (matchIndex !== -1) {
        pipeline.splice(matchIndex, 1);
      }
    }

    // Step 5: Populate owner details
    pipeline.push({
      $lookup: {
        from:         'users',
        localField:   'owner',
        foreignField: '_id',
        as:           'ownerDetails',
        pipeline: [
          {
            $project: {
              shopName:    1,
              shopRating:  1,
              isShopOpen:  1,
              shopHours:   1,
              phone:       1,
            }
          }
        ]
      }
    });

    // Flatten ownerDetails array to object
    pipeline.push({
      $addFields: {
        owner: { $arrayElemAt: ['$ownerDetails', 0] }
      }
    });

    // Remove ownerDetails array
    pipeline.push({
      $project: { ownerDetails: 0 }
    });

    // -----------------------------------------------
    // PAGINATION
    // -----------------------------------------------
    const pageNum   = Number(page);
    const limitNum  = Number(limit);
    const skipNum   = (pageNum - 1) * limitNum;

    // Count total before pagination
    const countPipeline = [...pipeline, { $count: 'total' }];
    const countResult   = await Product.aggregate(countPipeline);
    const total         = countResult[0]?.total || 0;

    // Add pagination stages
    pipeline.push({ $skip:  skipNum  });
    pipeline.push({ $limit: limitNum });

    // Execute pipeline
    const products = await Product.aggregate(pipeline);

    // -----------------------------------------------
    // SEND RESPONSE
    // -----------------------------------------------
    res.status(200).json({
      success: true,
      total,
      page:       pageNum,
      pages:      Math.ceil(total / limitNum),
      count:      products.length,
      products,
    });

  } catch (error) {
    next(error);
  }
};

// ============================================
// @desc    Get single product by ID
// @route   GET /api/products/:id
// @access  Public
// ============================================
const getProductById = async (req, res, next) => {
  try {
    const product = await Product
      .findById(req.params.id)
      .populate('owner', 'shopName shopRating isShopOpen shopHours phone');

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    res.status(200).json({
      success: true,
      product,
    });

  } catch (error) {
    next(error);
  }
};

// ============================================
// @desc    Create new product
//          Location AUTO-FILLED from owner profile
// @route   POST /api/products
// @access  Private (Owner only)
// ============================================
const createProduct = async (req, res, next) => {
  try {
    const {
      name,
      description,
      price,
      unit,
      weights,
      category,
      stock,
      badge,
      images,
    } = req.body;

    // -----------------------------------------------
    // Get owner's shop location data
    // This will AUTO-FILL product location
    // Owner never fills location manually
    // -----------------------------------------------
    const owner = await User.findById(req.user._id);

    if (!owner) {
      return res.status(404).json({
        success: false,
        message: 'Owner not found'
      });
    }

    // -----------------------------------------------
    // Check if owner has filled shop address
    // Cannot list products without shop location
    // -----------------------------------------------
    if (!owner.shopAddress?.pincode) {
      return res.status(400).json({
        success: false,
        message: 'Please complete your shop address in profile before listing products'
      });
    }

    // -----------------------------------------------
    // Get location data from owner profile
    // Using getShopLocationData() method
    // defined in User model
    // -----------------------------------------------
    const locationData = owner.getShopLocationData();

    // -----------------------------------------------
    // Create product with auto-filled location
    // -----------------------------------------------
    const product = await Product.create({
      // Owner fills these fields:
      name,
      description,
      price:    Number(price),
      unit:     unit     || 'kg',
      weights:  weights  || ['500g', '1 kg'],
      category,
      stock:    Number(stock) || 100,
      badge:    badge    || 'Fresh',
      images:   images   || [],
      owner:    req.user._id,

      // ✅ Location AUTO-FILLED from owner profile
      pincode:         locationData.pincode,
      sector:          locationData.sector,
      phase:           locationData.phase,
      city:            locationData.city,
      state:           locationData.state,
      shopFullAddress: locationData.fullAddress,
      coordinates:     locationData.coordinates,
      geoLocation:     locationData.geoLocation,

      // Delivery settings from owner profile
      deliveryRadiusKm:   locationData.deliveryRadiusKm,
      deliveryTimeByZone: locationData.deliveryTimeByZone,
    });

    res.status(201).json({
      success: true,
      message: 'Product listed successfully!',
      product,
    });

  } catch (error) {
    next(error);
  }
};

// ============================================
// @desc    Update product
// @route   PUT /api/products/:id
// @access  Private (Owner only - own products)
// ============================================
const updateProduct = async (req, res, next) => {
  try {
    let product = await Product.findById(req.params.id);

    // Check product exists
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    // -----------------------------------------------
    // Check ownership
    // Owner can only update their own products
    // -----------------------------------------------
    if (product.owner.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'You can only update your own products'
      });
    }

    // -----------------------------------------------
    // Build update data
    // Note: Location fields are NOT updatable
    // They sync automatically from shop profile
    // -----------------------------------------------
    const {
      name,
      description,
      price,
      unit,
      weights,
      category,
      stock,
      badge,
      images,
      isAvailable,
    } = req.body;

    const updateData = {};
    if (name)                    updateData.name        = name;
    if (description)             updateData.description = description;
    if (price)                   updateData.price       = Number(price);
    if (unit)                    updateData.unit        = unit;
    if (weights)                 updateData.weights     = weights;
    if (category)                updateData.category    = category;
    if (stock !== undefined)     updateData.stock       = Number(stock);
    if (badge)                   updateData.badge       = badge;
    if (images)                  updateData.images      = images;
    if (isAvailable !== undefined) {
      updateData.isAvailable = isAvailable;
    }

    // Update product
    product = await Product.findByIdAndUpdate(
      req.params.id,
      { $set: updateData },
      { new: true, runValidators: true }
    );

    res.status(200).json({
      success: true,
      message: 'Product updated successfully',
      product,
    });

  } catch (error) {
    next(error);
  }
};

// ============================================
// @desc    Delete product
// @route   DELETE /api/products/:id
// @access  Private (Owner only - own products)
// ============================================
const deleteProduct = async (req, res, next) => {
  try {
    const product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    // Check ownership
    if (product.owner.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'You can only delete your own products'
      });
    }

    await product.deleteOne();

    res.status(200).json({
      success: true,
      message: 'Product deleted successfully',
    });

  } catch (error) {
    next(error);
  }
};

// ============================================
// @desc    Get owner's own products
// @route   GET /api/products/owner/myproducts
// @access  Private (Owner only)
// ============================================
const getOwnerProducts = async (req, res, next) => {
  try {
    const {
      page     = 1,
      limit    = 10,
      category,
      isAvailable,
    } = req.query;

    // Build filter
    const filter = { owner: req.user._id };

    if (category)                 filter.category    = category;
    if (isAvailable !== undefined) {
      filter.isAvailable = isAvailable === 'true';
    }

    const pageNum  = Number(page);
    const limitNum = Number(limit);
    const skipNum  = (pageNum - 1) * limitNum;

    // Get total count
    const total = await Product.countDocuments(filter);

    // Get products
    const products = await Product
      .find(filter)
      .sort({ createdAt: -1 })
      .skip(skipNum)
      .limit(limitNum);

    res.status(200).json({
      success: true,
      total,
      page:     pageNum,
      pages:    Math.ceil(total / limitNum),
      count:    products.length,
      products,
    });

  } catch (error) {
    next(error);
  }
};

// ============================================
// @desc    Toggle product availability
// @route   PUT /api/products/:id/toggle
// @access  Private (Owner only)
// ============================================
const toggleAvailability = async (req, res, next) => {
  try {
    const product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    // Check ownership
    if (product.owner.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'You can only update your own products'
      });
    }

    // Toggle availability
    product.isAvailable = !product.isAvailable;
    await product.save();

    res.status(200).json({
      success: true,
      message: `Product ${
        product.isAvailable ? 'enabled' : 'disabled'
      } successfully`,
      isAvailable: product.isAvailable,
    });

  } catch (error) {
    next(error);
  }
};

// ============================================
// @desc    Upload product main image
// @route   POST /api/products/:id/upload-image
// @access  Private (Owner only)
// ============================================
const uploadMainImage = async (req, res, next) => {
  try {
    // -----------------------------------------------
    // req.file is set by multer middleware
    // Contains cloudinary upload result
    // -----------------------------------------------
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Please select an image to upload'
      });
    }

    // Find product and verify ownership
    const product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    if (product.owner.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'You can only update your own products'
      });
    }

    // -----------------------------------------------
    // Get image URL from cloudinary upload
    // req.file.path contains the cloudinary URL
    // -----------------------------------------------
    const imageUrl = req.file.path;

    // -----------------------------------------------
    // If product already has a main image
    // Delete old image from Cloudinary to save space
    // -----------------------------------------------
    if (product.images && product.images[0]) {
      try {
        // Extract public_id from old URL
        const cloudinary = require('../config/cloudinary');
        const urlParts   = product.images[0].split('/');
        const publicId   = urlParts
          .slice(-2)
          .join('/')
          .replace(/\.[^/.]+$/, ''); // Remove extension

        await cloudinary.uploader.destroy(publicId);
      } catch (deleteErr) {
        // Don't fail if delete fails
        console.log('Could not delete old image:', deleteErr);
      }
    }

    // -----------------------------------------------
    // Update product - set new image as first image
    // index 0 = main image
    // -----------------------------------------------
    const updatedImages = [imageUrl, ...product.images.slice(1)];

    const updatedProduct = await Product.findByIdAndUpdate(
      req.params.id,
      { $set: { images: updatedImages } },
      { new: true }
    );

    return res.status(200).json({
      success:  true,
      message:  'Main image uploaded successfully!',
      imageUrl,
      product:  updatedProduct,
    });

  } catch (error) {
    return next(error);
  }
};

// ============================================
// @desc    Upload extra product images
// @route   POST /api/products/:id/upload-extra
// @access  Private (Owner only)
// Max 4 extra images (index 1-4)
// ============================================
const uploadExtraImages = async (req, res, next) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Please select images to upload'
      });
    }

    const product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    if (product.owner.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'You can only update your own products'
      });
    }

    // -----------------------------------------------
    // Get URLs of all uploaded extra images
    // -----------------------------------------------
    const newImageUrls = req.files.map(f => f.path);

    // -----------------------------------------------
    // Keep main image (index 0) + add new extra images
    // Max total 5 images (1 main + 4 extra)
    // -----------------------------------------------
    const mainImage    = product.images[0] || null;
    const extraImages  = [
      ...product.images.slice(1),
      ...newImageUrls,
    ].slice(0, 4); // Max 4 extra

    const updatedImages = mainImage
      ? [mainImage, ...extraImages]
      : extraImages;

    const updatedProduct = await Product.findByIdAndUpdate(
      req.params.id,
      { $set: { images: updatedImages } },
      { new: true }
    );

    return res.status(200).json({
      success:   true,
      message:   `${newImageUrls.length} extra image(s) uploaded!`,
      imageUrls: newImageUrls,
      product:   updatedProduct,
    });

  } catch (error) {
    return next(error);
  }
};

// ============================================
// @desc    Delete a product image
// @route   DELETE /api/products/:id/image
// @access  Private (Owner only)
// Body: { imageUrl }
// ============================================
const deleteProductImage = async (req, res, next) => {
  try {
    const { imageUrl } = req.body;

    if (!imageUrl) {
      return res.status(400).json({
        success: false,
        message: 'Please provide image URL to delete'
      });
    }

    const product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    if (product.owner.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'You can only update your own products'
      });
    }

    // -----------------------------------------------
    // Delete image from Cloudinary
    // -----------------------------------------------
    try {
      const cloudinary = require('../config/cloudinary');
      const urlParts   = imageUrl.split('/');
      const publicId   = urlParts
        .slice(-2)
        .join('/')
        .replace(/\.[^/.]+$/, '');

      await cloudinary.uploader.destroy(publicId);
    } catch (deleteErr) {
      console.log('Cloudinary delete error:', deleteErr);
    }

    // -----------------------------------------------
    // Remove image URL from product
    // -----------------------------------------------
    const updatedImages = product.images.filter(
      img => img !== imageUrl
    );

    const updatedProduct = await Product.findByIdAndUpdate(
      req.params.id,
      { $set: { images: updatedImages } },
      { new: true }
    );

    return res.status(200).json({
      success: true,
      message: 'Image deleted successfully',
      product: updatedProduct,
    });

  } catch (error) {
    return next(error);
  }
};


module.exports = {
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
};