// ============================================
// Earnings.js - Owner Earnings Model
// Created/updated when an order is delivered
// Tracks daily earnings for shop owners
// ============================================

const mongoose = require('mongoose');

const earningsSchema = new mongoose.Schema({

  // Reference to Owner
  owner: {
    type:     mongoose.Schema.Types.ObjectId,
    ref:      'User',
    required: true,
  },

  // Reference to Order
  order: {
    type:     mongoose.Schema.Types.ObjectId,
    ref:      'Order',
    required: true,
  },

  // Earnings amount from this order
  amount: {
    type:     Number,
    required: true,
    min:      0,
  },

  // Platform commission deducted
  // e.g. 10% of order value
  commission: {
    type:    Number,
    default: 0,
  },

  // Net amount after commission
  netAmount: {
    type:     Number,
    required: true,
  },

  // Date of earning
  date: {
    type:    Date,
    default: Date.now,
  },

  // Payment status to owner
  isPaidToOwner: {
    type:    Boolean,
    default: false,
  },

}, {
  timestamps: true,
});

// ============================================
// INDEX
// ============================================
earningsSchema.index({ owner: 1, date: -1 });

module.exports = mongoose.model('Earnings', earningsSchema);