// ============================================
// Cart.js - Cart Model
// One cart per customer
// Contains array of cart items
// ============================================

const mongoose = require('mongoose');

// ============================================
// CART ITEM SCHEMA
// Each item inside the cart
// ============================================
const cartItemSchema = new mongoose.Schema({

  // Reference to Product
  product: {
    type:     mongoose.Schema.Types.ObjectId,
    ref:      'Product',
    required: true,
  },

  // Product name (saved for reference)
  name: {
    type: String,
    required: true,
  },

  // Price at time of adding to cart
  price: {
    type:     Number,
    required: true,
  },

  // Selected weight option
  // e.g. '500g', '1 kg'
  weight: {
    type:    String,
    default: '1 kg',
  },

  // Quantity of this item
  quantity: {
    type:    Number,
    required: true,
    min:     [1, 'Quantity must be at least 1'],
    default: 1,
  },
});

// ============================================
// CART SCHEMA
// ============================================
const cartSchema = new mongoose.Schema({

  // Reference to User (customer)
  user: {
    type:     mongoose.Schema.Types.ObjectId,
    ref:      'User',
    required: true,
    unique:   true, // One cart per user
  },

  // Array of cart items
  items: [cartItemSchema],

}, {
  timestamps: true,
});

// ============================================
// VIRTUAL - Calculate cart total
// Not stored in DB, computed on the fly
// ============================================
cartSchema.virtual('total').get(function() {
  return this.items.reduce(
    (sum, item) => sum + (item.price * item.quantity),
    0
  );
});

module.exports = mongoose.model('Cart', cartSchema);