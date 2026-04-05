// ============================================
// Order.js - Order Model
// Created when customer places an order
// ============================================

const mongoose = require('mongoose');

// ============================================
// ORDER ITEM SCHEMA
// ============================================
const orderItemSchema = new mongoose.Schema({
  product:  {
    type: mongoose.Schema.Types.ObjectId,
    ref:  'Product',
  },
  name:     { type: String,  required: true },
  price:    { type: Number,  required: true },
  quantity: { type: Number,  required: true },
  weight:   { type: String,  default: '1 kg' },
});

// ============================================
// ORDER SCHEMA
// ============================================
const orderSchema = new mongoose.Schema({

  // -----------------------------------------------
  // REFERENCES
  // -----------------------------------------------

  // Customer who placed the order
  customer: {
    type:     mongoose.Schema.Types.ObjectId,
    ref:      'User',
    required: true,
  },

  // Owner/shop receiving the order
  owner: {
    type:     mongoose.Schema.Types.ObjectId,
    ref:      'User',
    required: true,
  },

  // -----------------------------------------------
  // ORDER ITEMS
  // -----------------------------------------------
  items: [orderItemSchema],

  // -----------------------------------------------
  // PRICE BREAKDOWN
  // -----------------------------------------------
  subtotal:       { type: Number, required: true },
  deliveryCharge: { type: Number, default: 0     },
  platformFee:    { type: Number, default: 10    },
  discount:       { type: Number, default: 0     },
  total:          { type: Number, required: true },

  // Coupon code used
  couponCode: {
    type:    String,
    default: null,
  },

  // -----------------------------------------------
  // DELIVERY ADDRESS
  // Snapshot of address at time of order
  // -----------------------------------------------
  deliveryAddress: {
    houseNo:     String,
    street:      String,
    sector:      String,
    phase:       String,
    landmark:    String,
    city:        String,
    state:       String,
    pincode:     String,
    fullAddress: String,
  },

  // -----------------------------------------------
  // ORDER STATUS
  // Tracks order progress
  // -----------------------------------------------
  status: {
    type:    String,
    enum: [
      'pending',    // Just placed
      'confirmed',  // Owner confirmed
      'preparing',  // Being prepared
      'out_for_delivery', // On the way
      'delivered',  // Delivered successfully
      'cancelled',  // Cancelled
    ],
    default: 'pending',
  },

  // -----------------------------------------------
  // PAYMENT
  // -----------------------------------------------
  paymentMethod: {
    type:    String,
    enum:    ['COD', 'online'],
    default: 'COD',
  },

  isPaid: {
    type:    Boolean,
    default: false,
  },

  paidAt: {
    type: Date,
  },

  // -----------------------------------------------
  // DELIVERY TIME
  // -----------------------------------------------
  estimatedDelivery: {
    type: Date,
  },

  deliveredAt: {
    type: Date,
  },

  // -----------------------------------------------
  // STATUS HISTORY
  // Tracks every status change with timestamp
  // -----------------------------------------------
  statusHistory: [
    {
      status:    String,
      updatedAt: { type: Date, default: Date.now },
      note:      String,
    }
  ],

}, {
  timestamps: true,
});

// ============================================
// INDEX for faster queries
// ============================================
orderSchema.index({ customer: 1, createdAt: -1 });
orderSchema.index({ owner: 1,    createdAt: -1 });
orderSchema.index({ status: 1 });

module.exports = mongoose.model('Order', orderSchema);