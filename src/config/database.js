/**
 * MongoDB Database Connection
 * 
 * IMPORTANT: You MUST whitelist 0.0.0.0/0 in MongoDB Atlas Network Access
 * Go to: https://cloud.mongodb.com → Network Access → Add IP Address → Allow Access from Anywhere
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

// Get MONGODB_URI from environment
let MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI;

// Validate and fix connection string format
if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI environment variable is not set!');
  console.error('💡 Please set MONGODB_URI in Railway Dashboard → Variables');
  console.error('💡 Format: mongodb+srv://username:password@cluster.mongodb.net/database?retryWrites=true&w=majority');
  console.warn('⚠️  Server will start but database features will be disabled until MONGODB_URI is configured');
  console.warn('⚠️  Health checks will still pass - configure MONGODB_URI for full functionality');
} else {
  // Trim whitespace
  MONGODB_URI = MONGODB_URI.trim();

  // Validate format
  if (!MONGODB_URI.startsWith('mongodb://') && !MONGODB_URI.startsWith('mongodb+srv://')) {
    console.error('❌ Invalid MONGODB_URI format!');
    console.error('💡 Connection string must start with "mongodb://" or "mongodb+srv://"');
    console.error('💡 Current value (first 50 chars):', MONGODB_URI.substring(0, 50));
    console.error('💡 Please check Railway Dashboard → Variables → MONGODB_URI');
    console.warn('⚠️  Server will start but MongoDB connection will fail');
  } else {
    // Verify database name is included
    if (!MONGODB_URI.includes('/rupantar_ai') && !MONGODB_URI.includes('/?') && !MONGODB_URI.includes('?retryWrites')) {
      console.warn('⚠️  MONGODB_URI may be missing database name. Expected format includes /rupantar_ai');
    }
  }
}

let isConnected = false;
global.DB_CONNECTED = false;

// Configure Mongoose
mongoose.set('bufferCommands', false);
mongoose.set('strictQuery', false);

export const connectDB = async (retries = 5, delay = 2000) => {
  // If no MONGODB_URI is set, don't attempt connection
  if (!MONGODB_URI) {
    console.warn('⚠️  Skipping MongoDB connection - MONGODB_URI not configured');
    console.warn('⚠️  Server will run in limited mode without database access');
    return null;
  }

  if (isConnected && mongoose.connection.readyState === 1) {
    console.log('✅ MongoDB already connected');
    return mongoose.connection;
  }

  for (let i = 0; i < retries; i++) {
    try {
      console.log(`Attempting to connect to MongoDB (attempt ${i + 1}/${retries})...`);

      const conn = await mongoose.connect(MONGODB_URI, {
        retryWrites: true,
        w: 'majority',
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
      });

      isConnected = true;
      global.DB_CONNECTED = true;
      console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
      console.log(`✅ Database: ${conn.connection.name}`);

      // Handle connection events
      mongoose.connection.on('error', (err) => {
        console.error('MongoDB connection error:', err);
        isConnected = false;
        global.DB_CONNECTED = false;
      });

      mongoose.connection.on('disconnected', () => {
        console.log('⚠️  MongoDB disconnected - attempting to reconnect...');
        isConnected = false;
        global.DB_CONNECTED = false;
        setTimeout(() => {
          if (!isConnected) {
            connectDB(1, 5000).catch(() => {
              console.log('Reconnection attempt failed, will retry on next operation');
            });
          }
        }, 5000);
      });

      mongoose.connection.on('reconnected', () => {
        console.log('✅ MongoDB reconnected');
        isConnected = true;
        global.DB_CONNECTED = true;
      });

      return conn;
    } catch (error) {
      const errorMsg = error.message || 'Unknown error';
      console.error(`❌ MongoDB connection attempt ${i + 1} failed:`, errorMsg);

      // Provide specific error messages
      if (errorMsg.includes('Invalid scheme') || errorMsg.includes('expected connection string')) {
        console.error('🔗 Connection String Format Error:');
        console.error('   - MONGODB_URI must start with "mongodb://" or "mongodb+srv://"');
        console.error('   - Check Railway Dashboard → Variables → MONGODB_URI');
        console.error('   - Make sure there are no extra spaces or characters');
        console.error('   - Format: mongodb+srv://username:password@cluster.mongodb.net/database?retryWrites=true&w=majority');
      } else if (errorMsg.includes('bad auth') || errorMsg.includes('Authentication failed')) {
        console.error('🔐 Authentication Error:');
        console.error('   - Check MongoDB username and password in MONGODB_URI');
        console.error('   - Verify database user exists in MongoDB Atlas → Database Access');
        console.error('   - Update Railway environment variable MONGODB_URI with correct credentials');
      } else if (errorMsg.includes('IP') || errorMsg.includes('whitelist')) {
        console.error('🌐 IP Whitelist Error:');
        console.error('   - Add 0.0.0.0/0 in MongoDB Atlas → Network Access');
      }

      if (i < retries - 1) {
        console.log(`⏳ Retrying in ${delay / 1000} seconds...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        console.error('❌ All MongoDB connection attempts failed');
        console.error('💡 Please check:');
        console.error('   1. MongoDB Atlas IP whitelist (add 0.0.0.0/0 for all IPs)');
        console.error('   2. MongoDB connection string in Railway variables (MONGODB_URI)');
        console.error('   3. Database user credentials (username/password)');
        console.error('   4. Internet connection');
        console.warn('⚠️  Server will continue running in limited mode');
        isConnected = false;
        global.DB_CONNECTED = false;
        return null;
      }
    }
  }
};

export const disconnectDB = async () => {
  if (!isConnected) return;

  try {
    await mongoose.disconnect();
    isConnected = false;
    console.log('MongoDB disconnected');
  } catch (error) {
    console.error('Error disconnecting MongoDB:', error.message);
  }
};

export default connectDB;
