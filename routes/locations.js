// ============================================
// locations.js - Location Routes
// Handles city list & delivery check
// ============================================

const express = require('express');
const router  = express.Router();
const User    = require('../models/User');

// ============================================
// @desc    Get all available cities
// @route   GET /api/locations/cities
// @access  Public
// ============================================
router.get('/cities', async (req, res, next) => {
  try {

    // Get unique cities where shops exist
    const cities = await User.aggregate([
      {
        // Only active shop owners
        $match: {
          role:         'owner',
          isActive:     true,
          isShopOpen:   true,
          'shopAddress.city': { $ne: '' },
        }
      },
      {
        // Group by city and pincode
        $group: {
          _id:          '$shopAddress.city',
          city:         { $first: '$shopAddress.city'    },
          state:        { $first: '$shopAddress.state'   },
          pincode:      { $first: '$shopAddress.pincode' },
          totalShops:   { $sum: 1 },
        }
      },
      {
        $sort: { city: 1 }
      },
      {
        $project: {
          _id: 0, city: 1, state: 1,
          pincode: 1, totalShops: 1,
        }
      }
    ]);

    res.status(200).json({
      success: true,
      count:   cities.length,
      cities,
    });

  } catch (error) {
    next(error);
  }
});

// ============================================
// @desc    Check if delivery available
// @route   GET /api/locations/check
// @access  Public
// Query: ?pincode=125001&city=Hisar
// ============================================
router.get('/check', async (req, res, next) => {
  try {
    const { pincode, city } = req.query;

    if (!pincode && !city) {
      return res.status(400).json({
        success: false,
        message: 'Please provide pincode or city'
      });
    }

    // Build query to find shops in this area
    const query = {
      role:     'owner',
      isActive: true,
      isShopOpen: true,
    };

    if (pincode) query['shopAddress.pincode'] = pincode;
    if (city)    query['shopAddress.city']    = city;

    // Count shops in this area
    const shopCount = await User.countDocuments(query);

    // Get delivery time estimate based on location
    let estimatedTime  = null;
    let deliveryZone   = null;

    if (shopCount > 0) {
      // Find shops and get their delivery times
      const shop = await User.findOne(query).select(
        'shopAddress.deliveryTimeByZone shopAddress.deliveryRadiusKm'
      );

      if (pincode && shop) {
        estimatedTime = shop.shopAddress.deliveryTimeByZone.samePincode;
        deliveryZone  = 'Same Pincode';
      } else if (shop) {
        estimatedTime = shop.shopAddress.deliveryTimeByZone.sameCity;
        deliveryZone  = 'Same City';
      }
    }

    res.status(200).json({
      success:           true,
      deliveryAvailable: shopCount > 0,
      shopCount,
      estimatedTime,
      deliveryZone,
      message: shopCount > 0
        ? `Delivery available! ${shopCount} shop(s) near you`
        : 'Sorry, no delivery available in your area yet',
    });

  } catch (error) {
    next(error);
  }
});

module.exports = router;