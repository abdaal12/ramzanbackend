// ============================================
// earningsController.js - Earnings Controller
// Handles:
// - Get earnings summary
// - Get earnings by date range
// - Get daily earnings chart data
// - Get monthly earnings
// - Get top selling products
// ============================================

const Earnings = require('../models/Earnings');
const Order    = require('../models/Order');
const Product  = require('../models/Product');

// ============================================
// @desc    Get earnings summary
//          Total earnings, commission, net
// @route   GET /api/earnings/summary
// @access  Private (Owner only)
// ============================================
const getEarningsSummary = async (req, res, next) => {
  try {

    // -----------------------------------------------
    // Get all time summary for this owner
    // -----------------------------------------------
    const allTimeSummary = await Earnings.aggregate([
      {
        // Filter by owner
        $match: { owner: req.user._id }
      },
      {
        // Calculate totals
        $group: {
          _id:            null,
          totalEarnings:  { $sum: '$amount'    },
          totalCommission:{ $sum: '$commission' },
          totalNet:       { $sum: '$netAmount'  },
          totalOrders:    { $sum: 1             },
        }
      }
    ]);

    // -----------------------------------------------
    // Get this month's summary
    // -----------------------------------------------
    const startOfMonth = new Date(
      new Date().getFullYear(),
      new Date().getMonth(),
      1  // First day of month
    );

    const monthSummary = await Earnings.aggregate([
      {
        $match: {
          owner: req.user._id,
          date:  { $gte: startOfMonth },
        }
      },
      {
        $group: {
          _id:           null,
          monthEarnings: { $sum: '$amount'   },
          monthNet:      { $sum: '$netAmount' },
          monthOrders:   { $sum: 1           },
        }
      }
    ]);

    // -----------------------------------------------
    // Get today's summary
    // -----------------------------------------------
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const todaySummary = await Earnings.aggregate([
      {
        $match: {
          owner: req.user._id,
          date:  { $gte: startOfDay },
        }
      },
      {
        $group: {
          _id:          null,
          todayEarnings:{ $sum: '$amount'   },
          todayNet:     { $sum: '$netAmount' },
          todayOrders:  { $sum: 1           },
        }
      }
    ]);

    // -----------------------------------------------
    // Get this week summary
    // -----------------------------------------------
    const startOfWeek = new Date();
    startOfWeek.setDate(
      startOfWeek.getDate() - startOfWeek.getDay()
    );
    startOfWeek.setHours(0, 0, 0, 0);

    const weekSummary = await Earnings.aggregate([
      {
        $match: {
          owner: req.user._id,
          date:  { $gte: startOfWeek },
        }
      },
      {
        $group: {
          _id:          null,
          weekEarnings: { $sum: '$amount'   },
          weekNet:      { $sum: '$netAmount' },
          weekOrders:   { $sum: 1           },
        }
      }
    ]);

    // -----------------------------------------------
    // Format response
    // -----------------------------------------------
    const summary = {
      allTime: {
        totalEarnings:   allTimeSummary[0]?.totalEarnings   || 0,
        totalCommission: allTimeSummary[0]?.totalCommission || 0,
        totalNet:        allTimeSummary[0]?.totalNet        || 0,
        totalOrders:     allTimeSummary[0]?.totalOrders     || 0,
      },
      thisMonth: {
        earnings: monthSummary[0]?.monthEarnings || 0,
        net:      monthSummary[0]?.monthNet      || 0,
        orders:   monthSummary[0]?.monthOrders   || 0,
      },
      thisWeek: {
        earnings: weekSummary[0]?.weekEarnings || 0,
        net:      weekSummary[0]?.weekNet      || 0,
        orders:   weekSummary[0]?.weekOrders   || 0,
      },
      today: {
        earnings: todaySummary[0]?.todayEarnings || 0,
        net:      todaySummary[0]?.todayNet      || 0,
        orders:   todaySummary[0]?.todayOrders   || 0,
      },
    };

    res.status(200).json({
      success: true,
      summary,
    });

  } catch (error) {
    next(error);
  }
};

// ============================================
// @desc    Get earnings by date range
// @route   GET /api/earnings
// @access  Private (Owner only)
// Query: ?start=2026-01-01&end=2026-01-31
// ============================================
const getEarningsByDate = async (req, res, next) => {
  try {
    const {
      start,
      end,
      page  = 1,
      limit = 10,
    } = req.query;

    // Build date filter
    const dateFilter = { owner: req.user._id };

    if (start || end) {
      dateFilter.date = {};
      if (start) dateFilter.date.$gte = new Date(start);
      if (end) {
        // Include full end day
        const endDate = new Date(end);
        endDate.setHours(23, 59, 59, 999);
        dateFilter.date.$lte = endDate;
      }
    }

    const pageNum  = Number(page);
    const limitNum = Number(limit);
    const skipNum  = (pageNum - 1) * limitNum;

    // Total count
    const total = await Earnings.countDocuments(dateFilter);

    // Get earnings with order details
    const earnings = await Earnings
      .find(dateFilter)
      .populate({
        path:   'order',
        select: 'items total status createdAt deliveryAddress',
      })
      .sort({ date: -1 })
      .skip(skipNum)
      .limit(limitNum);

    // Calculate totals for the range
    const rangeTotals = await Earnings.aggregate([
      { $match: dateFilter },
      {
        $group: {
          _id:            null,
          totalEarnings:  { $sum: '$amount'    },
          totalCommission:{ $sum: '$commission' },
          totalNet:       { $sum: '$netAmount'  },
        }
      }
    ]);

    res.status(200).json({
      success: true,
      total,
      page:   pageNum,
      pages:  Math.ceil(total / limitNum),
      count:  earnings.length,
      totals: {
        earnings:   rangeTotals[0]?.totalEarnings   || 0,
        commission: rangeTotals[0]?.totalCommission || 0,
        net:        rangeTotals[0]?.totalNet        || 0,
      },
      earnings,
    });

  } catch (error) {
    next(error);
  }
};

// ============================================
// @desc    Get daily earnings for chart
//          Last 30 days by default
// @route   GET /api/earnings/daily
// @access  Private (Owner only)
// ============================================
const getDailyEarnings = async (req, res, next) => {
  try {
    const { days = 30 } = req.query;

    // Start date = today minus N days
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - Number(days));
    startDate.setHours(0, 0, 0, 0);

    // Aggregate earnings grouped by day
    const dailyData = await Earnings.aggregate([
      {
        $match: {
          owner: req.user._id,
          date:  { $gte: startDate },
        }
      },
      {
        // Group by year + month + day
        $group: {
          _id: {
            year:  { $year:       '$date' },
            month: { $month:      '$date' },
            day:   { $dayOfMonth: '$date' },
          },
          earnings: { $sum: '$amount'    },
          net:      { $sum: '$netAmount' },
          orders:   { $sum: 1           },
        }
      },
      {
        // Sort by date ascending (for chart)
        $sort: {
          '_id.year':  1,
          '_id.month': 1,
          '_id.day':   1,
        }
      },
      {
        // Format date as readable string
        $addFields: {
          date: {
            $dateToString: {
              format: '%Y-%m-%d',
              date: {
                $dateFromParts: {
                  year:  '$_id.year',
                  month: '$_id.month',
                  day:   '$_id.day',
                }
              }
            }
          }
        }
      },
      {
        // Remove _id from output
        $project: { _id: 0, date: 1, earnings: 1, net: 1, orders: 1 }
      }
    ]);

    res.status(200).json({
      success: true,
      days:    Number(days),
      data:    dailyData,
    });

  } catch (error) {
    next(error);
  }
};

// ============================================
// @desc    Get monthly earnings for chart
//          Last 12 months
// @route   GET /api/earnings/monthly
// @access  Private (Owner only)
// ============================================
const getMonthlyEarnings = async (req, res, next) => {
  try {

    // Start from 12 months ago
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - 12);
    startDate.setDate(1);
    startDate.setHours(0, 0, 0, 0);

    const monthlyData = await Earnings.aggregate([
      {
        $match: {
          owner: req.user._id,
          date:  { $gte: startDate },
        }
      },
      {
        // Group by year and month
        $group: {
          _id: {
            year:  { $year:  '$date' },
            month: { $month: '$date' },
          },
          earnings: { $sum: '$amount'    },
          net:      { $sum: '$netAmount' },
          orders:   { $sum: 1           },
        }
      },
      {
        $sort: {
          '_id.year':  1,
          '_id.month': 1,
        }
      },
      {
        $addFields: {
          // Format month name
          monthName: {
            $let: {
              vars: {
                months: [
                  '', 'Jan', 'Feb', 'Mar', 'Apr',
                  'May', 'Jun', 'Jul', 'Aug', 'Sep',
                  'Oct', 'Nov', 'Dec'
                ]
              },
              in: {
                $arrayElemAt: ['$$months', '$_id.month']
              }
            }
          },
          year: '$_id.year',
        }
      },
      {
        $project: {
          _id: 0, monthName: 1, year: 1,
          earnings: 1, net: 1, orders: 1,
        }
      }
    ]);

    res.status(200).json({
      success: true,
      data:    monthlyData,
    });

  } catch (error) {
    next(error);
  }
};

// ============================================
// @desc    Get top selling products
// @route   GET /api/earnings/top-products
// @access  Private (Owner only)
// ============================================
const getTopProducts = async (req, res, next) => {
  try {
    const { limit = 5 } = req.query;

    // Get delivered orders for this owner
    const topProducts = await Order.aggregate([
      {
        // Only delivered orders for this owner
        $match: {
          owner:  req.user._id,
          status: 'delivered',
        }
      },
      {
        // Unwind items array to get each item
        $unwind: '$items'
      },
      {
        // Group by product
        $group: {
          _id:          '$items.product',
          productName:  { $first: '$items.name'     },
          totalSold:    { $sum:   '$items.quantity'  },
          totalRevenue: { $sum: {
            $multiply: ['$items.price', '$items.quantity']
          }},
          orderCount:   { $sum: 1 },
        }
      },
      {
        // Sort by total sold descending
        $sort: { totalSold: -1 }
      },
      {
        $limit: Number(limit)
      },
    ]);

    res.status(200).json({
      success: true,
      data:    topProducts,
    });

  } catch (error) {
    next(error);
  }
};

// ============================================
// @desc    Get earnings dashboard data
//          All data needed for owner dashboard
// @route   GET /api/earnings/dashboard
// @access  Private (Owner only)
// ============================================
const getDashboardData = async (req, res, next) => {
  try {

    // -----------------------------------------------
    // Run all queries in parallel for speed
    // -----------------------------------------------
    const [
      summaryResult,
      dailyResult,
      topProductsResult,
      recentOrders,
    ] = await Promise.all([

      // All time + today + week + month summary
      Earnings.aggregate([
        { $match: { owner: req.user._id } },
        {
          $facet: {
            // All time totals
            allTime: [
              {
                $group: {
                  _id:            null,
                  totalEarnings:  { $sum: '$amount'    },
                  totalNet:       { $sum: '$netAmount'  },
                  totalOrders:    { $sum: 1             },
                }
              }
            ],
            // Today totals
            today: [
              {
                $match: {
                  date: {
                    $gte: new Date(new Date().setHours(0,0,0,0))
                  }
                }
              },
              {
                $group: {
                  _id:          null,
                  todayEarnings:{ $sum: '$amount'    },
                  todayNet:     { $sum: '$netAmount'  },
                  todayOrders:  { $sum: 1             },
                }
              }
            ],
          }
        }
      ]),

      // Last 7 days chart data
      Earnings.aggregate([
        {
          $match: {
            owner: req.user._id,
            date: {
              $gte: new Date(
                Date.now() - 7 * 24 * 60 * 60 * 1000
              )
            }
          }
        },
        {
          $group: {
            _id: {
              year:  { $year:       '$date' },
              month: { $month:      '$date' },
              day:   { $dayOfMonth: '$date' },
            },
            earnings: { $sum: '$amount' },
            orders:   { $sum: 1         },
          }
        },
        { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } },
      ]),

      // Top 5 products
      Order.aggregate([
        {
          $match: {
            owner:  req.user._id,
            status: 'delivered',
          }
        },
        { $unwind: '$items' },
        {
          $group: {
            _id:         '$items.product',
            productName: { $first: '$items.name'    },
            totalSold:   { $sum:   '$items.quantity' },
          }
        },
        { $sort: { totalSold: -1 } },
        { $limit: 5 },
      ]),

      // Recent 5 orders
      Order
        .find({ owner: req.user._id })
        .populate('customer', 'name phone')
        .sort({ createdAt: -1 })
        .limit(5),
    ]);

    // Format response
    const dashboard = {
      summary: {
        totalEarnings: summaryResult[0]?.allTime[0]?.totalEarnings || 0,
        totalNet:      summaryResult[0]?.allTime[0]?.totalNet      || 0,
        totalOrders:   summaryResult[0]?.allTime[0]?.totalOrders   || 0,
        todayEarnings: summaryResult[0]?.today[0]?.todayEarnings   || 0,
        todayOrders:   summaryResult[0]?.today[0]?.todayOrders     || 0,
      },
      weeklyChart:  dailyResult,
      topProducts:  topProductsResult,
      recentOrders,
    };

    res.status(200).json({
      success: true,
      dashboard,
    });

  } catch (error) {
    next(error);
  }
};

module.exports = {
  getEarningsSummary,
  getEarningsByDate,
  getDailyEarnings,
  getMonthlyEarnings,
  getTopProducts,
  getDashboardData,
};