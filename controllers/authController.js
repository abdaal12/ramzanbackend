// ============================================
// authController.js - Auth Controller
// Login/Register with Phone + Password only
// Email is optional - can add from profile
// ============================================

const User = require('../models/User');

// ============================================
// HELPER - Send Token Response
// ✅ next added as parameter to catch errors
// from generateToken() if it fails
// ============================================
const sendTokenResponse = (
  user, statusCode, res, message, next
) => {
  try {
    // Generate JWT token using User model method
    const token = user.generateToken();

    // Remove password from response object
    user.password = undefined;

    res.status(statusCode).json({
      success: true,
      message,
      token,
      user: {
        _id:        user._id,
        firstName:  user.firstName,
        lastName:   user.lastName,
        name:       user.name,
        phone:      user.phone,
        email:      user.email || null,
        role:       user.role,
        profilePic: user.profilePic,
        address:    user.address,

        // ✅ Owner specific fields
        // Only included when role is owner
        ...(user.role === 'owner' && {
          shopName:        user.shopName,
          shopDescription: user.shopDescription,
          shopAddress:     user.shopAddress,
          isShopOpen:      user.isShopOpen,
          shopHours:       user.shopHours,
          shopRating:      user.shopRating,
          totalOrders:     user.totalOrders,
        }),
      }
    });

  } catch (error) {
    // ✅ Catch errors from generateToken()
    // and pass to global error handler
    next(error);
  }
};

// ============================================
// @desc    Register new user
//          Only requires: name, phone, password
//          Email & address optional
//          Can be added from profile later
// @route   POST /api/auth/register
// @access  Public
// ============================================
const register = async (req, res, next) => {
  try {

    const {
      firstName,
      lastName,
      name,
      phone,
      password,
      role,
      shopName, // Owner only - optional
    } = req.body;

    // -----------------------------------------------
    // ✅ VALIDATE REQUIRED FIELDS
    // -----------------------------------------------

    // First name required
    if (!firstName?.trim()) {
      return res.status(400).json({
        success: false,
        message: 'First name is required'
      });
    }

    // Last name required
    if (!lastName?.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Last name is required'
      });
    }

    // Phone required
    if (!phone?.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Phone number is required'
      });
    }

    // Phone format validation
    // Must be valid Indian mobile number
    const phoneRegex = /^[6-9]\d{9}$/;
    if (!phoneRegex.test(phone.trim())) {
      return res.status(400).json({
        success: false,
        message: 'Please enter valid 10-digit mobile number'
      });
    }

    // Password required and min length
    if (!password || password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters'
      });
    }

    // -----------------------------------------------
    // ✅ CHECK PHONE UNIQUENESS
    // Phone is the primary login identifier
    // Must be unique across all users
    // -----------------------------------------------
    const existingPhone = await User.findOne({
      phone: phone.trim()
    });

    if (existingPhone) {
      return res.status(409).json({
        success: false,
        message: 'An account with this phone already exists'
      });
    }

    // -----------------------------------------------
    // ✅ BUILD USER DATA
    // Minimal data at registration
    // No email, no address required
    // -----------------------------------------------
    const userData = {
      firstName:  firstName.trim(),
      lastName:   lastName.trim(),

      // Full name - use provided or combine first+last
      name: name?.trim() ||
            `${firstName.trim()} ${lastName.trim()}`,

      phone:    phone.trim(),
      password, // Will be hashed in pre-save hook
      role:     role || 'customer',

      // Email is null by default
      // User can add from profile later
    };

    // -----------------------------------------------
    // Owner: Save shop name if provided
    // Shop address added later from owner profile
    // -----------------------------------------------
    if (role === 'owner' && shopName?.trim()) {
      userData.shopName = shopName.trim();
    }

    // -----------------------------------------------
    // ✅ CREATE USER IN DATABASE
    // Password is automatically hashed
    // by pre-save hook in User model
    // -----------------------------------------------
    const user = await User.create(userData);

    // Send token response with user data
    sendTokenResponse(
      user,
      201,
      res,
      '🎉 Account created successfully!',
      next  // ✅ Pass next for error handling
    );

  }  catch (error) {
  console.error('REGISTER ERROR NAME:', error.name);
  console.error('REGISTER ERROR MSG:', error.message);
  console.error('REGISTER ERROR FULL:', error);
  next(error);
}
};

// ============================================
// @desc    Login user
//          Uses Phone + Password only
//          No email needed
// @route   POST /api/auth/login
// @access  Public
// ============================================
const login = async (req, res, next) => {
  try {

    const { phone, password, role } = req.body;

    // -----------------------------------------------
    // ✅ VALIDATE INPUTS
    // -----------------------------------------------
    if (!phone?.trim() || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide phone number and password'
      });
    }

    // -----------------------------------------------
    // ✅ FIND USER BY PHONE
    // Include password field
    // (excluded by default with select: false)
    // -----------------------------------------------
    const user = await User
      .findOne({ phone: phone.trim() })
      .select('+password');

    // User not found
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Account not found. Please register first.'
      });
    }

    // -----------------------------------------------
    // ✅ CHECK ROLE MATCHES
    // Customer cannot login as owner & vice versa
    // -----------------------------------------------
    if (role && user.role !== role) {
      return res.status(403).json({
        success: false,
        message: `This account is not registered as ${role}.`
      });
    }

    // -----------------------------------------------
    // ✅ CHECK ACCOUNT IS ACTIVE
    // -----------------------------------------------
    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: 'Your account is deactivated. Contact support.'
      });
    }

    // -----------------------------------------------
    // ✅ VERIFY PASSWORD
    // Uses matchPassword method from User model
    // Compares entered password with hashed password
    // -----------------------------------------------
    const isMatch = await user.matchPassword(password);

    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid phone number or password'
      });
    }

    // Send token response
    sendTokenResponse(
      user,
      200,
      res,
      'Login successful!',
      next  // ✅ Pass next for error handling
    );

  } catch (error) {
    next(error);
  }
};

// ============================================
// @desc    Get current logged in user profile
// @route   GET /api/auth/profile
// @access  Private (requires login)
// ============================================
const getProfile = async (req, res, next) => {
  try {

    // req.user is set by protect middleware
    // after verifying JWT token
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.status(200).json({
      success: true,
      user,
    });

  } catch (error) {
    next(error);
  }
};

// ============================================
// @desc    Update user profile
//          This is where email & address
//          are added after registration
// @route   PUT /api/auth/profile
// @access  Private
// ============================================
const updateProfile = async (req, res, next) => {
  try {

    const {
      firstName,
      lastName,
      email,
      profilePic,

      // Customer delivery address
      address,

      // Owner specific fields
      shopName,
      shopDescription,
      shopAddress,
      isShopOpen,
      shopHours,
    } = req.body;

    // Build update object
    // Only update fields that are provided
    const updateData = {};

    // -----------------------------------------------
    // ✅ PERSONAL INFO UPDATES
    // -----------------------------------------------
    if (firstName?.trim()) {
      updateData.firstName = firstName.trim();
    }
    if (lastName?.trim()) {
      updateData.lastName = lastName.trim();
    }
    if (firstName?.trim() && lastName?.trim()) {
      updateData.name =
        `${firstName.trim()} ${lastName.trim()}`;
    }
    if (profilePic) {
      updateData.profilePic = profilePic;
    }

    // -----------------------------------------------
    // ✅ EMAIL UPDATE - Optional
    // User can add or update email from profile
    // Check uniqueness before saving
    // -----------------------------------------------
    if (email !== undefined) {

      if (email === null || email === '') {
        // Allow removing email
        updateData.email = null;

      } else {
        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
          return res.status(400).json({
            success: false,
            message: 'Please enter a valid email address'
          });
        }

        // Check email not already used
        // by a different user
        const existingEmail = await User.findOne({
          email: email.toLowerCase(),
          _id:   { $ne: req.user._id },
        });

        if (existingEmail) {
          return res.status(409).json({
            success: false,
            message: 'This email is already in use'
          });
        }

        updateData.email = email.toLowerCase().trim();
      }
    }

    // -----------------------------------------------
    // ✅ CUSTOMER ADDRESS UPDATE
    // Added after registration from profile
    // Used for delivery proximity matching
    // -----------------------------------------------
    if (address && req.user.role === 'customer') {
      updateData.address = {
        houseNo:     address.houseNo     || '',
        street:      address.street      || '',
        sector:      address.sector      || '',
        phase:       address.phase       || '',
        landmark:    address.landmark    || '',
        city:        address.city        || '',
        state:       address.state       || '',
        pincode:     address.pincode     || '',
        fullAddress: address.fullAddress || '',
        coordinates: {
          latitude:
            address.coordinates?.latitude  || 0,
          longitude:
            address.coordinates?.longitude || 0,
        },
        geoLocation: {
          type: 'Point',
          coordinates: [
            address.coordinates?.longitude || 0,
            address.coordinates?.latitude  || 0,
          ],
        },
      };
    }

    // -----------------------------------------------
    // ✅ OWNER PROFILE UPDATES
    // -----------------------------------------------
    if (req.user.role === 'owner') {

      if (shopName) {
        updateData.shopName = shopName;
      }
      if (shopDescription) {
        updateData.shopDescription = shopDescription;
      }
      if (isShopOpen !== undefined) {
        updateData.isShopOpen = isShopOpen;
      }
      if (shopHours) {
        updateData.shopHours = shopHours;
      }

      // -----------------------------------------------
      // ✅ SHOP ADDRESS UPDATE
      // When owner updates shop address:
      // 1. Updates owner profile
      // 2. AUTO-SYNCS all their products location
      //    So products always show correct location
      // -----------------------------------------------
      if (shopAddress) {

        updateData.shopAddress = {
          shopNo:      shopAddress.shopNo      || '',
          street:      shopAddress.street      || '',
          sector:      shopAddress.sector      || '',
          phase:       shopAddress.phase       || '',
          landmark:    shopAddress.landmark    || '',
          city:        shopAddress.city        || '',
          state:       shopAddress.state       || '',
          pincode:     shopAddress.pincode     || '',
          fullAddress: shopAddress.fullAddress || '',
          coordinates: {
            latitude:
              shopAddress.coordinates?.latitude  || 0,
            longitude:
              shopAddress.coordinates?.longitude || 0,
          },
          geoLocation: {
            type: 'Point',
            coordinates: [
              shopAddress.coordinates?.longitude || 0,
              shopAddress.coordinates?.latitude  || 0,
            ],
          },
          deliveryRadiusKm:
            shopAddress.deliveryRadiusKm || 10,
          deliveryTimeByZone: {
            samePincode:
              shopAddress.deliveryTimeByZone
                ?.samePincode || 15,
            sameSector:
              shopAddress.deliveryTimeByZone
                ?.sameSector  || 25,
            sameCity:
              shopAddress.deliveryTimeByZone
                ?.sameCity    || 40,
          },
        };

        // ✅ AUTO-SYNC all products location
        // Require here to avoid circular dependency
        const Product = require('../models/Product');

        await Product.updateMany(
          // Find all products by this owner
          { owner: req.user._id },
          {
            $set: {
              // Update location fields in all products
              pincode:
                shopAddress.pincode     || '',
              sector:
                shopAddress.sector      || '',
              phase:
                shopAddress.phase       || '',
              city:
                shopAddress.city        || '',
              state:
                shopAddress.state       || '',
              shopFullAddress:
                shopAddress.fullAddress || '',
              coordinates: {
                latitude:
                  shopAddress.coordinates?.latitude  || 0,
                longitude:
                  shopAddress.coordinates?.longitude || 0,
              },
              geoLocation: {
                type: 'Point',
                coordinates: [
                  shopAddress.coordinates?.longitude || 0,
                  shopAddress.coordinates?.latitude  || 0,
                ],
              },
              deliveryRadiusKm:
                shopAddress.deliveryRadiusKm || 10,
              deliveryTimeByZone: {
                samePincode:
                  shopAddress.deliveryTimeByZone
                    ?.samePincode || 15,
                sameSector:
                  shopAddress.deliveryTimeByZone
                    ?.sameSector  || 25,
                sameCity:
                  shopAddress.deliveryTimeByZone
                    ?.sameCity    || 40,
              },
            }
          }
        );
      }
    }

    // -----------------------------------------------
    // ✅ SAVE UPDATES TO DATABASE
    // -----------------------------------------------
    const user = await User.findByIdAndUpdate(
      req.user._id,
      { $set: updateData },
      {
        returnDocument: 'after', // Return updated document
        runValidators:  true, // Run schema validators
      }
    );

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      user,
    });

  } catch (error) {
    next(error);
  }
};

// ============================================
// @desc    Logout user
// @route   POST /api/auth/logout
// @access  Private
// ============================================
const logout = async (req, res, next) => {
  try {

    // JWT is stateless
    // Just tell frontend to clear localStorage
    // Future: implement token blacklist if needed
    res.status(200).json({
      success: true,
      message: 'Logged out successfully',
    });

  } catch (error) {
    next(error);
  }
};

// ============================================
// @desc    Change password
// @route   PUT /api/auth/change-password
// @access  Private
// ============================================
const changePassword = async (req, res, next) => {
  try {

    const { currentPassword, newPassword } = req.body;

    // Validate inputs
    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Please provide current and new password'
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'New password must be at least 6 characters'
      });
    }

    // Get user with password field
    const user = await User
      .findById(req.user._id)
      .select('+password');

    // Verify current password is correct
    const isMatch = await user.matchPassword(currentPassword);

    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Current password is incorrect'
      });
    }

    // Update password
    // Pre-save hook will hash it automatically
    user.password = newPassword;
    await user.save();

    res.status(200).json({
      success: true,
      message: 'Password changed successfully'
    });

  } catch (error) {
    next(error);
  }
};

// ============================================
// EXPORT ALL CONTROLLERS
// ============================================
module.exports = {
  register,
  login,
  getProfile,
  updateProfile,
  logout,
  changePassword,
};