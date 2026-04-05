// Location fields are AUTO-FILLED from
// owner's shopAddress when product is created


const mongoose = require('mongoose');


// PRODUCT SCHEMA

const productSchema = new mongoose.Schema({

 
  // BASIC PRODUCT INFO

  name: {
    type:     String,
    required: [true, 'Product name is required'],
    trim:     true,
  },

  description: {
    type:     String,
    required: [true, 'Product description is required'],
    trim:     true,
  },

  
  price: {
    type:     Number,
    required: [true, 'Price is required'],
    min:      [1, 'Price must be greater than 0'],
  },

  // Unit of measurement
  unit: {
    type:    String,
    enum:    ['kg', 'gram', 'piece'],
    default: 'kg',
  },

  // Available weight/quantity options
  // Owner selects which sizes to offer
  weights: {
    type:    [String],
    default: ['500g', '1 kg'],
  },

 
  // CATEGORY
 
  category: {
    type:     String,
    required: [true, 'Category is required'],
    enum: [
      'Whole Chicken',
      'Breast Pieces',
      'Leg Pieces',
      'Wings',
      'Boneless',
      'Marinated',
      'Other',
    ],
  },

  
  // OWNER REFERENCE
  // Which shop/owner listed this product
  
  owner: {
    type:     mongoose.Schema.Types.ObjectId,
    ref:      'User',
    required: [true, 'Product must belong to an owner'],
    index:    true,
  },

  
  // PRODUCT IMAGES
  // URLs of product images
  
  images: {
    type:    [String],
    default: [],
  },


  // RATINGS & REVIEWS
  // Updated when customer leaves review

  rating: {
    type:    Number,
    default: 0,
    min:     0,
    max:     5,
  },

  numReviews: {
    type:    Number,
    default: 0,
  },

 
  // STOCK & AVAILABILITY

  isAvailable: {
    type:    Boolean,
    default: true,
  },

  stock: {
    type:    Number,
    default: 100,
    min:     [0, 'Stock cannot be negative'],
  },

  // Display badge on product card
  badge: {
    type:    String,
    default: 'Fresh',
    enum: [
      'Fresh',
      'Best Seller',
      'Popular',
      'New',
      'Premium',
      'Sale',
    ],
  },

  
  pincode: {
    type:    String,
    default: '',
    trim:    true,
  },

  
  sector: {
    type:    String,
    default: '',
    trim:    true,
  },

  
  phase: {
    type:    String,
    default: '',
    trim:    true,
  },

 
  city: {
    type:    String,
    default: '',
    trim:    true,
  },

  
  state: {
    type:    String,
    default: '',
    trim:    true,
  },

  
  shopFullAddress: {
    type:    String,
    default: '',
  },

  
  geoLocation: {
    type: {
      type:    String,
      enum:    ['Point'],
      default: 'Point',
    },
    // [longitude, latitude] - MongoDB format
    coordinates: {
      type:    [Number],
      default: [0, 0],
    },
  },

  // Raw coordinates for easy access
  coordinates: {
    latitude:  { type: Number, default: 0 },
    longitude: { type: Number, default: 0 },
  },

  
  // Customers outside this won't see product
  deliveryRadiusKm: {
    type:    Number,
    default: 10,
  },

  // Estimated delivery times by zone
  
  deliveryTimeByZone: {
    samePincode: { type: Number, default: 15 },
    sameSector:  { type: Number, default: 25 },
    sameCity:    { type: Number, default: 40 },
  },

  

}, {
  timestamps: true,
  // Allow virtual fields in JSON output
  toJSON:   { virtuals: true },
  toObject: { virtuals: true },
});



// 2dsphere index for GPS distance queries
// Needed for $near and $geoWithin
productSchema.index({ geoLocation: '2dsphere' });

// Compound index - pincode + availability
// Most common query: find available products
// in a specific pincode
productSchema.index({ pincode: 1, isAvailable: 1 });

// Compound index - city + availability
productSchema.index({ city: 1, isAvailable: 1 });

// Compound index - category + pincode
// Filter by category in a pincode
productSchema.index({ category: 1, pincode: 1 });

// Compound index - category + city
productSchema.index({ category: 1, city: 1 });

// Owner products index
productSchema.index({ owner: 1, isAvailable: 1 });

// ============================================
// STATIC METHOD - Get Proximity Sort Pipeline
// Used in productController.getAllProducts()
// Sorts products by proximity to customer
//
// Priority:
// 1. Same pincode  → score 100 (15 min)
// 2. Same sector   → score 75  (25 min)
// 3. Same city     → score 50  (40 min)
// 4. Same state    → score 25  (60 min)
// 5. Others        → score 0
// ============================================
productSchema.statics.getProximityPipeline = function(
  customerPincode,
  customerSector,
  customerCity,
  customerState
) {
  return [
    // -----------------------------------------------
    // Step 1: Calculate proximity score
    // Based on how close seller is to customer
    // -----------------------------------------------
    {
      $addFields: {
        proximityScore: {
          $switch: {
            branches: [
              // 🥇 Same pincode = fastest delivery
              {
                case: {
                  $eq: ['$pincode', customerPincode]
                },
                then: 100,
              },
              //  Same sector = fast delivery
              {
                case: {
                  $and: [
                    { $eq: ['$city', customerCity] },
                    { $eq: ['$sector', customerSector] },
                  ]
                },
                then: 75,
              },
              //  Same city = normal delivery
              {
                case: {
                  $eq: ['$city', customerCity]
                },
                then: 50,
              },
              // Same state = slow delivery
              {
                case: {
                  $eq: ['$state', customerState]
                },
                then: 25,
              },
            ],
            // Not in delivery range
            default: 0,
          },
        },

        // -----------------------------------------------
        // Step 2: Calculate estimated delivery time
        // Based on proximity score
        // -----------------------------------------------
        estimatedDeliveryMinutes: {
          $switch: {
            branches: [
              {
                case: { $eq: ['$pincode', customerPincode] },
                then: '$deliveryTimeByZone.samePincode',
              },
              {
                case: {
                  $and: [
                    { $eq: ['$city',   customerCity]   },
                    { $eq: ['$sector', customerSector] },
                  ]
                },
                then: '$deliveryTimeByZone.sameSector',
              },
              {
                case: { $eq: ['$city', customerCity] },
                then: '$deliveryTimeByZone.sameCity',
              },
            ],
            default: 60,
          },
        },
      },
    },

    // -----------------------------------------------
    // Step 3: Filter out products with score 0
    // Don't show products outside delivery range
    // Comment this out to show all products
    // -----------------------------------------------
    {
      $match: {
        proximityScore:  { $gt: 0 },
        isAvailable:     true,
      },
    },


    // Step 4: Sort by proximity first, then rating
    // Nearest seller shown first
    // Among equal distance, higher rated shown first
 
    {
      $sort: {
        proximityScore: -1, // Nearest first
        rating:         -1, // Higher rated first
        createdAt:      -1, // Newest first (tiebreaker)
      },
    },
  ];
};

module.exports = mongoose.model('Product', productSchema);