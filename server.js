// ============================================
// server.js - Main Entry Point
// This is where our Express app starts
// It connects to MongoDB and starts the server
// ============================================

const express  = require('express');
const mongoose = require('mongoose');
const cors     = require('cors');
const dotenv   = require('dotenv');

//  Load environment variables from .env file
dotenv.config();

//  Import database connection function
const connectDB = require('./config/db');

//  Import all route files
const authRoutes      = require('./routes/auth');
const productRoutes   = require('./routes/products');
const cartRoutes      = require('./routes/cart');
const orderRoutes     = require('./routes/orders');
const earningsRoutes  = require('./routes/earnings');
const locationRoutes  = require('./routes/locations');

// Import error handler middleware
const errorHandler = require('./middleware/errorHandler');

// ============================================
// Connect to MongoDB
// ============================================
connectDB();

// ============================================
// Initialize Express App
// ============================================
const app = express();

// ============================================
// MIDDLEWARE
// ============================================

//  CORS - Allow frontend to talk to backend
// Only allows requests from our React app
app.use(cors({
  origin:      process.env.CLIENT_URL || 'http://localhost:3000',
  credentials: true,
  methods:     ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

//  Parse incoming JSON requests
// Needed to read req.body in controllers
app.use(express.json());

//  Parse URL encoded data
app.use(express.urlencoded({ extended: true }));

// ============================================
// ROUTES
// All API routes start with /api/
// ============================================

//  Auth routes - login, register, profile
app.use('/api/auth', authRoutes);

//  Product routes - CRUD products
app.use('/api/products', productRoutes);

//  Cart routes - add, update, remove items
app.use('/api/cart', cartRoutes);

//  Order routes - place & manage orders
app.use('/api/orders', orderRoutes);

//  Earnings routes - owner earnings
app.use('/api/earnings', earningsRoutes);

//  Location routes - cities & delivery check
app.use('/api/locations', locationRoutes);

// ============================================
// DEFAULT ROUTE
// Just to check if server is running
// Visit: http://localhost:5000/
// ============================================
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: ' FreshChicken API is running!',
    version: '1.0.0',
    endpoints: {
      auth:      '/api/auth',
      products:  '/api/products',
      cart:      '/api/cart',
      orders:    '/api/orders',
      earnings:  '/api/earnings',
      locations: '/api/locations',
    }
  });
});

// ============================================
// 404 HANDLER
// If no route matches, return 404
// ============================================
app.use((req, res, next) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.originalUrl} not found`
  });
});

// ============================================
// GLOBAL ERROR HANDLER
// Must be last middleware
// Catches all errors from controllers
// ============================================
app.use(errorHandler);

// ============================================
// START SERVER
// ============================================
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log('==========================================');
  console.log(` FreshChicken Server Running!`);
  console.log(` URL: http://localhost:${PORT}`);
  console.log(` Environment: ${process.env.NODE_ENV}`);
  console.log('==========================================');
});