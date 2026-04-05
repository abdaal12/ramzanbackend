// ============================================
// db.js - MongoDB Connection
// Updated for Mongoose 7+ / 8+
// Old options removed (no longer needed)
// ============================================

const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    
    const conn = await mongoose.connect(process.env.MONGO_URI);

    console.log(`MongoDB Connected: ${conn.connection.host}`);

  } catch (error) {
    console.error(`MongoDB Connection Error: ${error.message}`);
    process.exit(1);
  }
};

module.exports = connectDB;