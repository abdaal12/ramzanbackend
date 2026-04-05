// ============================================
// User.js - User Model (Updated)
// Auth: Phone + Password only
// Email: Optional, can add from profile
// Address: Optional, can add from profile
// ============================================

const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');

// ============================================
// CUSTOMER ADDRESS SCHEMA
// ============================================
const customerAddressSchema = new mongoose.Schema({
  houseNo:     { type: String, default: '' },
  street:      { type: String, default: '' },
  sector:      { type: String, default: '' },
  phase:       { type: String, default: '' },
  landmark:    { type: String, default: '' },
  city:        { type: String, default: '' },
  state:       { type: String, default: '' },
  pincode:     { type: String, default: '' },
  fullAddress: { type: String, default: '' },
  coordinates: {
    latitude:  { type: Number, default: 0 },
    longitude: { type: Number, default: 0 },
  },
  geoLocation: {
    type: {
      type:    String,
      enum:    ['Point'],
      default: 'Point',
    },
    coordinates: {
      type:    [Number],
      default: [0, 0],
    },
  },
}, { _id: false });

// ============================================
// SHOP ADDRESS SCHEMA
// ============================================
const shopAddressSchema = new mongoose.Schema({
  shopNo:      { type: String, default: '' },
  street:      { type: String, default: '' },
  sector:      { type: String, default: '' },
  phase:       { type: String, default: '' },
  landmark:    { type: String, default: '' },
  city:        { type: String, default: '' },
  state:       { type: String, default: '' },
  pincode:     { type: String, default: '' },
  fullAddress: { type: String, default: '' },
  coordinates: {
    latitude:  { type: Number, default: 0 },
    longitude: { type: Number, default: 0 },
  },
  geoLocation: {
    type: {
      type:    String,
      enum:    ['Point'],
      default: 'Point',
    },
    coordinates: {
      type:    [Number],
      default: [0, 0],
    },
  },
  deliveryRadiusKm: {
    type:    Number,
    default: 10,
    min:     1,
    max:     50,
  },
  deliveryTimeByZone: {
    samePincode: { type: Number, default: 15 },
    sameSector:  { type: Number, default: 25 },
    sameCity:    { type: Number, default: 40 },
  },
}, { _id: false });

// ============================================
// MAIN USER SCHEMA
// ============================================
const userSchema = new mongoose.Schema({

  // -----------------------------------------------
  // PERSONAL INFO
  // -----------------------------------------------
  firstName: {
    type:     String,
    required: [true, 'First name is required'],
    trim:     true,
  },

  lastName: {
    type:     String,
    required: [true, 'Last name is required'],
    trim:     true,
  },

  name: {
    type:     String,
    required: [true, 'Name is required'],
    trim:     true,
  },

  // -----------------------------------------------
  // 📱 PHONE - PRIMARY LOGIN IDENTIFIER
  // Required, unique - used for login
  // -----------------------------------------------
  phone: {
    type:     String,
    required: [true, 'Phone number is required'],
    unique:   true,
    trim:     true,
    match: [
      /^[6-9]\d{9}$/,
      'Please enter valid 10-digit mobile number'
    ],
  },

  // -----------------------------------------------
  // 📧 EMAIL - OPTIONAL
  // Can be added from profile later
  // Not used for login/register
  // -----------------------------------------------
  email: {
    type:      String,
    unique:    true,
    sparse:    true, // Allows multiple null values
    lowercase: true,
    trim:      true,
    match: [
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
      'Please enter a valid email address'
    ],
  },

  // -----------------------------------------------
  // PASSWORD
  // -----------------------------------------------
  password: {
    type:      String,
    required:  [true, 'Password is required'],
    minlength: [6, 'Password must be at least 6 characters'],
    select:    false,
  },

  // -----------------------------------------------
  // ROLE
  // -----------------------------------------------
  role: {
    type:     String,
    enum:     ['customer', 'owner'],
    default:  'customer',
    required: true,
  },

  // -----------------------------------------------
  // 👤 CUSTOMER ADDRESS - Optional
  // Added from profile after registration
  // -----------------------------------------------
  address: {
    type:    customerAddressSchema,
    default: () => ({}),
  },

  // -----------------------------------------------
  // 🏪 SHOP INFO - Owner only
  // -----------------------------------------------
  shopName: {
    type:    String,
    default: '',
    trim:    true,
  },

  shopDescription: {
    type:    String,
    default: '',
    trim:    true,
  },

  shopAddress: {
    type:    shopAddressSchema,
    default: () => ({}),
  },

  isShopOpen: {
    type:    Boolean,
    default: true,
  },

  shopHours: {
    open:  { type: String, default: '08:00' },
    close: { type: String, default: '22:00' },
  },

  shopRating: {
    type:    Number,
    default: 0,
    min:     0,
    max:     5,
  },

  totalOrders: {
    type:    Number,
    default: 0,
  },

  // -----------------------------------------------
  // ACCOUNT STATUS
  // -----------------------------------------------
  isActive: {
    type:    Boolean,
    default: true,
  },

  profilePic: {
    type:    String,
    default: '',
  },

  fcmToken: {
    type:    String,
    default: '',
  },

}, {
  timestamps: true,
});

// ============================================
// INDEXES
// ============================================


// 2dsphere indexes for GPS
userSchema.index({ 'address.geoLocation':     '2dsphere' });
userSchema.index({ 'shopAddress.geoLocation': '2dsphere' });

// Pincode indexes for proximity
userSchema.index({ 'address.pincode':     1 });
userSchema.index({ 'shopAddress.pincode': 1 });
userSchema.index({ 'shopAddress.city':    1 });
userSchema.index({ role: 1, isActive: 1 });

// ============================================
// PRE-SAVE - Hash Password
// ============================================
userSchema.pre('save', async function () {
  if (!this.isModified('password')) return;
  const salt    = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
});

// ============================================
// METHOD - Match Password
// ============================================
userSchema.methods.matchPassword = async function(
  enteredPassword
) {
  return await bcrypt.compare(enteredPassword, this.password);
};

// ============================================
// METHOD - Generate JWT Token
// Token now uses phone instead of email
// ============================================
userSchema.methods.generateToken = function() {
  return jwt.sign(
    {
      id:    this._id,
      role:  this.role,
      phone: this.phone,
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRE || '7d' }
  );
};

// ============================================
// METHOD - Get Shop Location Data
// Auto-fills product location from shop profile
// ============================================
userSchema.methods.getShopLocationData = function() {
  return {
    pincode:            this.shopAddress.pincode,
    sector:             this.shopAddress.sector,
    phase:              this.shopAddress.phase,
    city:               this.shopAddress.city,
    state:              this.shopAddress.state,
    fullAddress:        this.shopAddress.fullAddress,
    coordinates:        this.shopAddress.coordinates,
    geoLocation:        this.shopAddress.geoLocation,
    deliveryRadiusKm:   this.shopAddress.deliveryRadiusKm,
    deliveryTimeByZone: this.shopAddress.deliveryTimeByZone,
  };
};

module.exports = mongoose.model('User', userSchema);