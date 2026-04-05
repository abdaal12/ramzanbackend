// ============================================
// orderController.js - Order Controller
// Handles:
// - Place new order (customer)
// - Get customer orders
// - Get single order
// - Get owner orders
// - Update order status (owner)
// - Cancel order (customer)
// ============================================

const Order    = require('../models/Order');
const Cart     = require('../models/Cart');
const Product  = require('../models/Product');
const User     = require('../models/User');
const Earnings = require('../models/Earnings');

// ============================================
// @desc    Place new order
// @route   POST /api/orders
// @access  Private (Customer only)
// ============================================
const placeOrder = async (req, res, next) => {
  try {
    const {
      items,
      subtotal,
      deliveryCharge,
      platformFee,
      discount,
      total,
      couponCode,
      deliveryAddress,
      paymentMethod,
    } = req.body;

    // -----------------------------------------------
    // Validate items exist
    // -----------------------------------------------
    if (!items || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No items in order'
      });
    }

    // -----------------------------------------------
    // Validate delivery address
    // -----------------------------------------------
    if (!deliveryAddress || !deliveryAddress.pincode) {
      return res.status(400).json({
        success: false,
        message: 'Please provide delivery address'
      });
    }

    // -----------------------------------------------
    // Get customer info for address fallback
    // -----------------------------------------------
    const customer = await User.findById(req.user._id);

    // Use provided address or fall back to profile
    const finalAddress = {
      houseNo:     deliveryAddress.houseNo     || customer.address.houseNo,
      street:      deliveryAddress.street      || customer.address.street,
      sector:      deliveryAddress.sector      || customer.address.sector,
      phase:       deliveryAddress.phase       || customer.address.phase,
      landmark:    deliveryAddress.landmark    || customer.address.landmark,
      city:        deliveryAddress.city        || customer.address.city,
      state:       deliveryAddress.state       || customer.address.state,
      pincode:     deliveryAddress.pincode     || customer.address.pincode,
      fullAddress: deliveryAddress.fullAddress || customer.address.fullAddress,
    };

    // -----------------------------------------------
    // Validate each product & find owner
    // All items must be from same shop
    // (For now - can extend to multi-shop later)
    // -----------------------------------------------
    let ownerId = null;

    for (const item of items) {
      const product = await Product.findById(item.productId);

      if (!product) {
        return res.status(404).json({
          success: false,
          message: `Product ${item.name} not found`
        });
      }

      if (!product.isAvailable) {
        return res.status(400).json({
          success: false,
          message: `${product.name} is currently unavailable`
        });
      }

      if (product.stock < item.quantity) {
        return res.status(400).json({
          success: false,
          message: `Only ${product.stock} units of ${product.name} available`
        });
      }

      // Set owner from first product
      if (!ownerId) {
        ownerId = product.owner;
      }
    }

    // -----------------------------------------------
    // Calculate estimated delivery time
    // Based on proximity of customer to shop
    // -----------------------------------------------
    const shop = await User.findById(ownerId);

    let estimatedMinutes = 40; // default

    if (shop) {
      if (finalAddress.pincode === shop.shopAddress.pincode) {
        // Same pincode - fastest
        estimatedMinutes =
          shop.shopAddress.deliveryTimeByZone.samePincode || 15;
      } else if (
        finalAddress.city   === shop.shopAddress.city &&
        finalAddress.sector === shop.shopAddress.sector
      ) {
        // Same sector
        estimatedMinutes =
          shop.shopAddress.deliveryTimeByZone.sameSector || 25;
      } else if (finalAddress.city === shop.shopAddress.city) {
        // Same city
        estimatedMinutes =
          shop.shopAddress.deliveryTimeByZone.sameCity || 40;
      }
    }

    // Calculate estimated delivery datetime
    const estimatedDelivery = new Date(
      Date.now() + estimatedMinutes * 60 * 1000
    );

    // -----------------------------------------------
    // Create order in database
    // -----------------------------------------------
    const order = await Order.create({
      customer:       req.user._id,
      owner:          ownerId,
      items:          items.map(item => ({
        product:  item.productId,
        name:     item.name,
        price:    item.price,
        quantity: item.quantity,
        weight:   item.weight || '1 kg',
      })),

      // Price breakdown
      subtotal:       Number(subtotal),
      deliveryCharge: Number(deliveryCharge) || 0,
      platformFee:    Number(platformFee)    || 10,
      discount:       Number(discount)       || 0,
      total:          Number(total),

      couponCode:      couponCode     || null,
      deliveryAddress: finalAddress,
      paymentMethod:   paymentMethod  || 'COD',

      // Order starts as pending
      status: 'pending',

      // Initial status history entry
      statusHistory: [{
        status:    'pending',
        updatedAt: new Date(),
        note:      'Order placed successfully',
      }],

      estimatedDelivery,
    });

    // -----------------------------------------------
    // Update product stock after order
    // Reduce stock for each ordered item
    // -----------------------------------------------
    for (const item of items) {
      await Product.findByIdAndUpdate(
        item.productId,
        { $inc: { stock: -item.quantity } }
      );
    }

    // -----------------------------------------------
    // Clear customer cart after order placed
    // -----------------------------------------------
    await Cart.findOneAndUpdate(
      { user: req.user._id },
      { $set: { items: [] } }
    );

    // -----------------------------------------------
    // Update owner total orders count
    // -----------------------------------------------
    await User.findByIdAndUpdate(
      ownerId,
      { $inc: { totalOrders: 1 } }
    );

    // Populate order details for response
    const populatedOrder = await Order
      .findById(order._id)
      .populate('customer', 'name email phone')
      .populate('owner',    'shopName phone shopAddress');

    res.status(201).json({
      success: true,
      message: 'Order placed successfully! 🎉',
      order:   populatedOrder,
      estimatedDeliveryMinutes: estimatedMinutes,
    });

  } catch (error) {
    next(error);
  }
};

// ============================================
// @desc    Get customer's own orders
// @route   GET /api/orders/myorders
// @access  Private (Customer only)
// ============================================
const getMyOrders = async (req, res, next) => {
  try {
    const {
      page   = 1,
      limit  = 10,
      status,
    } = req.query;

    // Build filter
    const filter = { customer: req.user._id };
    if (status) filter.status = status;

    const pageNum  = Number(page);
    const limitNum = Number(limit);
    const skipNum  = (pageNum - 1) * limitNum;

    // Get total count
    const total = await Order.countDocuments(filter);

    // Get orders - newest first
    const orders = await Order
      .find(filter)
      .populate('owner', 'shopName phone shopAddress.city')
      .sort({ createdAt: -1 })
      .skip(skipNum)
      .limit(limitNum);

    res.status(200).json({
      success: true,
      total,
      page:   pageNum,
      pages:  Math.ceil(total / limitNum),
      count:  orders.length,
      orders,
    });

  } catch (error) {
    next(error);
  }
};

// ============================================
// @desc    Get single order by ID
// @route   GET /api/orders/:id
// @access  Private (Customer or Owner)
// ============================================
const getOrderById = async (req, res, next) => {
  try {
    const order = await Order
      .findById(req.params.id)
      .populate('customer', 'name email phone address')
      .populate('owner',    'shopName phone shopAddress');

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // -----------------------------------------------
    // Check access rights
    // Customer can only see their own orders
    // Owner can only see orders for their shop
    // -----------------------------------------------
    const isCustomer =
      order.customer._id.toString() === req.user._id.toString();

    const isOwner =
      order.owner._id.toString() === req.user._id.toString();

    if (!isCustomer && !isOwner) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    res.status(200).json({
      success: true,
      order,
    });

  } catch (error) {
    next(error);
  }
};

// ============================================
// @desc    Get all orders for owner's shop
// @route   GET /api/orders/owner/allorders
// @access  Private (Owner only)
// ============================================
const getOwnerOrders = async (req, res, next) => {
  try {
    const {
      page   = 1,
      limit  = 10,
      status,
    } = req.query;

    // Build filter for owner's orders
    const filter = { owner: req.user._id };
    if (status) filter.status = status;

    const pageNum  = Number(page);
    const limitNum = Number(limit);
    const skipNum  = (pageNum - 1) * limitNum;

    const total = await Order.countDocuments(filter);

    const orders = await Order
      .find(filter)
      .populate('customer', 'name email phone address')
      .sort({ createdAt: -1 })
      .skip(skipNum)
      .limit(limitNum);

    res.status(200).json({
      success: true,
      total,
      page:   pageNum,
      pages:  Math.ceil(total / limitNum),
      count:  orders.length,
      orders,
    });

  } catch (error) {
    next(error);
  }
};

// ============================================
// @desc    Update order status
// @route   PUT /api/orders/:id/status
// @access  Private (Owner only)
// Status flow:
// pending → confirmed → preparing
// → out_for_delivery → delivered
// Any status → cancelled
// ============================================
const updateOrderStatus = async (req, res, next) => {
  try {
    const { status, note } = req.body;

    // Valid status values
    const validStatuses = [
      'pending',
      'confirmed',
      'preparing',
      'out_for_delivery',
      'delivered',
      'cancelled',
    ];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
      });
    }

    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Verify ownership
    if (order.owner.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'You can only update your own orders'
      });
    }

    // -----------------------------------------------
    // Update status
    // -----------------------------------------------
    order.status = status;

    // Add to status history
    order.statusHistory.push({
      status,
      updatedAt: new Date(),
      note:      note || `Order ${status}`,
    });

    // -----------------------------------------------
    // If delivered - set deliveredAt time
    // Also create earnings record for owner
    // -----------------------------------------------
    if (status === 'delivered') {
      order.deliveredAt = new Date();
      order.isPaid      = order.paymentMethod === 'COD'
        ? true
        : order.isPaid;

      // ✅ Create earnings record for owner
      // Commission = 10% of order total
      const commission = Math.round(order.total * 0.10);
      const netAmount  = order.total - commission;

      await Earnings.create({
        owner:      req.user._id,
        order:      order._id,
        amount:     order.total,
        commission,
        netAmount,
        date:       new Date(),
      });
    }

    // -----------------------------------------------
    // If cancelled - restore product stock
    // -----------------------------------------------
    if (status === 'cancelled') {
      for (const item of order.items) {
        await Product.findByIdAndUpdate(
          item.product,
          { $inc: { stock: item.quantity } }
        );
      }
    }

    await order.save();

    // Populate for response
    const updatedOrder = await Order
      .findById(order._id)
      .populate('customer', 'name email phone')
      .populate('owner',    'shopName phone');

    res.status(200).json({
      success: true,
      message: `Order status updated to ${status}`,
      order:   updatedOrder,
    });

  } catch (error) {
    next(error);
  }
};

// ============================================
// @desc    Cancel order (by customer)
// @route   PUT /api/orders/:id/cancel
// @access  Private (Customer only)
// Customer can only cancel pending orders
// ============================================
const cancelOrder = async (req, res, next) => {
  try {
    const { reason } = req.body;

    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Verify it's customer's own order
    if (order.customer.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'You can only cancel your own orders'
      });
    }

    // -----------------------------------------------
    // Only allow cancellation of pending orders
    // Once confirmed/preparing cannot cancel
    // -----------------------------------------------
    if (!['pending', 'confirmed'].includes(order.status)) {
      return res.status(400).json({
        success: false,
        message: `Cannot cancel order in ${order.status} status`
      });
    }

    // Update status
    order.status = 'cancelled';
    order.statusHistory.push({
      status:    'cancelled',
      updatedAt: new Date(),
      note:      reason || 'Cancelled by customer',
    });

    // Restore product stock
    for (const item of order.items) {
      await Product.findByIdAndUpdate(
        item.product,
        { $inc: { stock: item.quantity } }
      );
    }

    await order.save();

    res.status(200).json({
      success: true,
      message: 'Order cancelled successfully',
      order,
    });

  } catch (error) {
    next(error);
  }
};

// ============================================
// @desc    Get order stats for owner dashboard
// @route   GET /api/orders/owner/stats
// @access  Private (Owner only)
// ============================================
const getOwnerOrderStats = async (req, res, next) => {
  try {

    // Count orders by status for this owner
    const stats = await Order.aggregate([
      {
        $match: { owner: req.user._id }
      },
      {
        $group: {
          _id:   '$status',
          count: { $sum: 1 },
          total: { $sum: '$total' },
        }
      }
    ]);

    // Format stats into object
    const formattedStats = {
      pending:          { count: 0, total: 0 },
      confirmed:        { count: 0, total: 0 },
      preparing:        { count: 0, total: 0 },
      out_for_delivery: { count: 0, total: 0 },
      delivered:        { count: 0, total: 0 },
      cancelled:        { count: 0, total: 0 },
    };

    stats.forEach(stat => {
      if (formattedStats[stat._id] !== undefined) {
        formattedStats[stat._id] = {
          count: stat.count,
          total: stat.total,
        };
      }
    });

    // Total revenue from delivered orders
    const totalRevenue = formattedStats.delivered.total;

    // Total orders
    const totalOrders = await Order.countDocuments({
      owner: req.user._id
    });

    res.status(200).json({
      success: true,
      stats: formattedStats,
      totalRevenue,
      totalOrders,
    });

  } catch (error) {
    next(error);
  }
};

module.exports = {
  placeOrder,
  getMyOrders,
  getOrderById,
  getOwnerOrders,
  updateOrderStatus,
  cancelOrder,
  getOwnerOrderStats,
};