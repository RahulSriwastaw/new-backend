/**
 * Rupantar AI Backend Server
 * 
 * IMPORTANT: You MUST whitelist 0.0.0.0/0 in MongoDB Atlas Network Access
 * Go to: https://cloud.mongodb.com → Network Access → Add IP Address → Allow Access from Anywhere
 */

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import connectDB from './config/database.js';
import paymentRoutes from './routes/payment.js';
import templateRoutes from './routes/templates.js';
import generationRoutes from './routes/generation.js';
import authRoutes from './routes/auth.js';
import walletRoutes from './routes/wallet.js';
import creatorRoutes from './routes/creator.js';
import adminRoutes from './routes/admin.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8080;

// ============================================
// MIDDLEWARE (Order matters!)
// ============================================

// CORS - Allow all origins for development and Vercel deployments
app.use(cors({ 
  origin: true, 
  credentials: true,
  optionsSuccessStatus: 200
}));

// Body parsers
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: false, limit: '10mb' }));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`📥 ${req.method} ${req.path} - ${new Date().toISOString()}`);
  next();
});

// ============================================
// BASIC ROUTES (Must work even if other routes fail)
// ============================================

// Root route for Railway health check (responds immediately)
app.get('/', (req, res) => {
  res.status(200).send('Backend is running successfully!');
});

// Health check endpoint (fast response for Railway)
app.get('/health', (req, res) => {
  const dbStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
  res.status(200).json({ 
    status: 'ok', 
    message: 'Backend is running', 
    database: dbStatus,
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
    port: PORT
  });
});

// Simple API test route (responds immediately)
app.get('/api', (req, res) => {
  res.status(200).json({ 
    message: 'API is working', 
    status: 'ok',
    timestamp: new Date().toISOString()
  });
});

// Connection test endpoint
app.get('/api/test-connections', async (req, res) => {
  try {
    const results = {
      mongodb: {
        status: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
        readyState: mongoose.connection.readyState,
        states: {
          0: 'disconnected',
          1: 'connected',
          2: 'connecting',
          3: 'disconnecting'
        }
      },
      cloudinary: {
        status: 'configured',
        accounts: {
          user: process.env.CLOUDINARY_USER_CLOUD_NAME || 'dno47zdrh',
          creator: process.env.CLOUDINARY_CREATOR_CLOUD_NAME || 'dmbrs338o',
          generated: process.env.CLOUDINARY_GENERATED_CLOUD_NAME || 'dkeigiajt',
        }
      },
      firebase: {
        status: 'configured',
        projectId: process.env.FIREBASE_PROJECT_ID || 'rupantra-ai',
      }
    };
    
    res.json(results);
  } catch (error) {
    res.status(500).json({ error: 'Failed to check connections', message: error.message });
  }
});

// ============================================
// MOUNT API ROUTES
// ============================================

try {
  app.use('/api/auth', authRoutes);
  app.use('/api/payment', paymentRoutes);
  app.use('/api/templates', templateRoutes);
  app.use('/api/generation', generationRoutes);
  app.use('/api/wallet', walletRoutes);
  app.use('/api/creator', creatorRoutes);
  app.use('/api/admin', adminRoutes);
  console.log('✅ All API routes mounted successfully');
} catch (error) {
  console.error('❌ Error mounting routes:', error.message);
  console.error('Stack:', error.stack);
}

// Debug: List all registered routes (development only)
if (process.env.NODE_ENV === 'development') {
  app.get('/api/routes', (req, res) => {
    const routes = [];
    app._router.stack.forEach((middleware) => {
      if (middleware.route) {
        routes.push({
          path: middleware.route.path,
          methods: Object.keys(middleware.route.methods)
        });
      } else if (middleware.name === 'router') {
        middleware.handle.stack.forEach((handler) => {
          if (handler.route) {
            routes.push({
              path: middleware.regexp.source.replace(/\\\//g, '/').replace(/\^|\$|\?/g, '') + handler.route.path,
              methods: Object.keys(handler.route.methods)
            });
          }
        });
      }
    });
    res.json({ routes });
  });
}

// ============================================
// ERROR HANDLING
// ============================================

// 404 handler (must be after all routes)
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found', path: req.path });
});

// Error handling middleware (must be last)
app.use((err, req, res, next) => {
  console.error('Error:', err.stack);
  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({ 
    error: err.message || 'Something went wrong!',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// ============================================
// PROCESS ERROR HANDLERS
// ============================================

process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  console.error('Stack:', error.stack);
  console.warn('⚠️  Server will continue running despite uncaught exception');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise);
  console.error('Reason:', reason);
  console.warn('⚠️  Server will continue running despite unhandled rejection');
});

// ============================================
// DATABASE CONNECTION (Non-blocking)
// ============================================

// Connect to MongoDB (non-blocking - server will start even if MongoDB fails)
connectDB().catch((err) => {
  console.error('⚠️  Failed to connect to MongoDB:', err.message);
  console.error('⚠️  Server will continue but database operations may fail.');
  console.error('⚠️  Please check:');
  console.error('   1. MongoDB Atlas IP whitelist (add 0.0.0.0/0 for all IPs)');
  console.error('   2. MongoDB connection string in Railway variables (MONGODB_URI)');
  console.error('   3. Internet connection');
});

// ============================================
// START SERVER
// ============================================

console.log(`🚀 Starting server on port ${PORT}...`);
console.log(`📝 Environment: ${process.env.NODE_ENV || 'development'}`);
console.log(`🌐 PORT from env: ${process.env.PORT || 'not set (using default 8080)'}`);

const server = app.listen(PORT, '0.0.0.0', () => {
  const address = server.address();
  console.log(`✅ Server Running successfully!`);
  console.log(`✅ Port: ${PORT}`);
  console.log(`✅ Address: ${address ? `${address.address}:${address.port}` : 'unknown'}`);
  console.log(`✅ Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`✅ Health check: http://0.0.0.0:${PORT}/health`);
  console.log(`✅ Root endpoint: http://0.0.0.0:${PORT}/`);
  console.log(`✅ API endpoint: http://0.0.0.0:${PORT}/api`);
  console.log(`✅ Server is ready to accept connections`);
  
  if (server.listening) {
    console.log(`✅ Server is listening and ready`);
  } else {
    console.error(`❌ Server is NOT listening!`);
  }
});

// Ensure server stays alive
server.keepAliveTimeout = 65000;
server.headersTimeout = 66000;

// Server error handler
server.on('error', (error) => {
  console.error('❌ Server error:', error);
  if (error.code === 'EADDRINUSE') {
    console.error(`⚠️  Port ${PORT} is already in use`);
  }
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

