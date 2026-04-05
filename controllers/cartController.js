// ============================================
// cartController.js - Cart Controller
// Handles:
// - Get cart
// - Add item to cart
// - Update item quantity
// - Remove item from cart
// - Clear entire cart
// ============================================

const Cart    = require('../models/Cart');
const Product = require('../models/Product');

// ============================================
// HELPER - Calculate Cart Totals
// Reusable function to compute cart summary
// ============================================
const calculateCartTotals = (items) => {

  // Total items count
  const totalItems = items.reduce(
    (sum, item) => sum + item.quantity, 0
  );

  // Subtotal
  const subtotal = items.reduce(
    (sum, item) => sum + (item.price * item.quantity), 0
  );

  // Free delivery above ₹500
  const deliveryCharge = subtotal >= 500 ? 0 : 40;

  // Platform fee
  const platformFee = 10;

  // Grand total
  const total = subtotal + deliveryCharge + platformFee;

  return {
    totalItems,
    subtotal,
    deliveryCharge,
    platformFee,
    total,
  };
};

// ============================================
// @desc    Get current user cart
// @route   GET /api/cart
// @access  Private (Customer only)
// ============================================
const getCart = async (req, res, next) => {
  try {

    // Find cart for logged in user
    // Populate product details for each item
    let cart = await Cart
      .findOne({ user: req.user._id })
      .populate({
        path:   'items.product',
        select: 'name price images isAvailable stock category emoji',
      });

    // If no cart exists return empty cart
    if (!cart) {
      return res.status(200).json({
        success: true,
        cart: {
          items: [],
          ...calculateCartTotals([]),
        },
      });
    }

    // -----------------------------------------------
    // Filter out unavailable products
    // Product might become unavailable after
    // being added to cart
    // -----------------------------------------------
    cart.items = cart.items.filter(
      item => item.product && item.product.isAvailable
    );

    // Save filtered cart
    await cart.save();

    // Calculate totals
    const totals = calculateCartTotals(cart.items);

    res.status(200).json({
      success: true,
      cart: {
        _id:   cart._id,
        items: cart.items,
        ...totals,
      },
    });

  } catch (error) {
    next(error);
  }
};

// ============================================
// @desc    Add item to cart
// @route   POST /api/cart
// @access  Private (Customer only)
// Body: { productId, quantity, weight }
// ============================================
const addToCart = async (req, res, next) => {
  try {
    const {
      productId,
      quantity = 1,
      weight   = '1 kg',
    } = req.body;

    // -----------------------------------------------
    // Validate product exists and is available
    // -----------------------------------------------
    const product = await Product.findById(productId);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    if (!product.isAvailable) {
      return res.status(400).json({
        success: false,
        message: 'This product is currently unavailable'
      });
    }

    // Check stock availability
    if (product.stock < quantity) {
      return res.status(400).json({
        success: false,
        message: `Only ${product.stock} units available in stock`
      });
    }

    // -----------------------------------------------
    // Find or create cart for user
    // -----------------------------------------------
    let cart = await Cart.findOne({ user: req.user._id });

    if (!cart) {
      // Create new cart if doesn't exist
      cart = await Cart.create({
        user:  req.user._id,
        items: [],
      });
    }

    // -----------------------------------------------
    // Check if product already in cart
    // If yes: update quantity
    // If no:  add new item
    // -----------------------------------------------
    const existingItemIndex = cart.items.findIndex(
      item => item.product.toString() === productId
    );

    if (existingItemIndex > -1) {
      // Product already in cart - increase quantity
      cart.items[existingItemIndex].quantity += Number(quantity);

      // Check total quantity doesn't exceed stock
      if (cart.items[existingItemIndex].quantity > product.stock) {
        cart.items[existingItemIndex].quantity = product.stock;
      }

    } else {
      // New product - add to cart
      cart.items.push({
        product:  productId,
        name:     product.name,
        price:    product.price,
        weight:   weight,
        quantity: Number(quantity),
      });
    }

    // Save updated cart
    await cart.save();

    // Populate product details for response
    await cart.populate({
      path:   'items.product',
      select: 'name price images isAvailable stock category',
    });

    // Calculate totals
    const totals = calculateCartTotals(cart.items);

    res.status(200).json({
      success: true,
      message: 'Item added to cart',
      cart: {
        _id:   cart._id,
        items: cart.items,
        ...totals,
      },
    });

  } catch (error) {
    next(error);
  }
};

// ============================================
// @desc    Update cart item quantity
// @route   PUT /api/cart/:productId
// @access  Private (Customer only)
// Body: { quantity }
// ============================================
const updateCartItem = async (req, res, next) => {
  try {
    const { productId } = req.params;
    const { quantity }  = req.body;

    if (!quantity || quantity < 1) {
      return res.status(400).json({
        success: false,
        message: 'Quantity must be at least 1'
      });
    }

    // Find user cart
    const cart = await Cart.findOne({ user: req.user._id });

    if (!cart) {
      return res.status(404).json({
        success: false,
        message: 'Cart not found'
      });
    }

    // Find item in cart
    const itemIndex = cart.items.findIndex(
      item => item.product.toString() === productId
    );

    if (itemIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'Item not found in cart'
      });
    }

    // Check stock
    const product = await Product.findById(productId);
    if (product && quantity > product.stock) {
      return res.status(400).json({
        success: false,
        message: `Only ${product.stock} units available`
      });
    }

    // Update quantity
    cart.items[itemIndex].quantity = Number(quantity);
    await cart.save();

    // Populate and calculate totals
    await cart.populate({
      path:   'items.product',
      select: 'name price images isAvailable stock',
    });

    const totals = calculateCartTotals(cart.items);

    res.status(200).json({
      success: true,
      message: 'Cart updated',
      cart: {
        _id:   cart._id,
        items: cart.items,
        ...totals,
      },
    });

  } catch (error) {
    next(error);
  }
};

// ============================================
// @desc    Remove single item from cart
// @route   DELETE /api/cart/:productId
// @access  Private (Customer only)
// ============================================
const removeFromCart = async (req, res, next) => {
  try {
    const { productId } = req.params;

    const cart = await Cart.findOne({ user: req.user._id });

    if (!cart) {
      return res.status(404).json({
        success: false,
        message: 'Cart not found'
      });
    }

    // Remove item from cart items array
    cart.items = cart.items.filter(
      item => item.product.toString() !== productId
    );

    await cart.save();

    // Populate and calculate totals
    await cart.populate({
      path:   'items.product',
      select: 'name price images isAvailable stock',
    });

    const totals = calculateCartTotals(cart.items);

    res.status(200).json({
      success: true,
      message: 'Item removed from cart',
      cart: {
        _id:   cart._id,
        items: cart.items,
        ...totals,
      },
    });

  } catch (error) {
    next(error);
  }
};

// ============================================
// @desc    Clear entire cart
// @route   DELETE /api/cart/clear
// @access  Private (Customer only)
// ============================================
const clearCart = async (req, res, next) => {
  try {

    const cart = await Cart.findOne({ user: req.user._id });

    if (!cart) {
      return res.status(200).json({
        success: true,
        message: 'Cart is already empty',
      });
    }

    // Clear all items
    cart.items = [];
    await cart.save();

    res.status(200).json({
      success: true,
      message: 'Cart cleared successfully',
      cart: {
        items: [],
        ...calculateCartTotals([]),
      },
    });

  } catch (error) {
    next(error);
  }
};

module.exports = {
  getCart,
  addToCart,
  updateCartItem,
  removeFromCart,
  clearCart,
};