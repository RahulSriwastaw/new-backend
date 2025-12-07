/**
 * Rupantar AI Backend Server
 * 
 * IMPORTANT: You MUST whitelist 0.0.0.0/0 in MongoDB Atlas Network Access
 * Go to: https://cloud.mongodb.com → Network Access → Add IP Address → Allow Access from Anywhere
 */

// Add immediate console output to verify script is running
console.log('🚀 Starting Rupantar AI Backend...');
console.log('📍 Node version:', process.version);
console.log('📍 Environment:', process.env.NODE_ENV || 'development');

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import mongoose from 'mongoose';

console.log('✅ Core modules imported');

dotenv.config();
console.log('✅ dotenv configured');

// Import with error handling
let connectDB, paymentRoutes, templateRoutes, generationRoutes, authRoutes, walletRoutes, creatorRoutes, adminRoutes, toolsRoutes;
let limiter, corsOptions, helmetConfig, logger, validateEnv;

try {
  console.log('📦 Importing database config...');
  const dbModule = await import('./config/database.js');
  connectDB = dbModule.default;
  console.log('✅ Database config imported');

  console.log('📦 Importing routes...');
  paymentRoutes = (await import('./routes/payment.js')).default;
  templateRoutes = (await import('./routes/templates.js')).default;
  generationRoutes = (await import('./routes/generation.js')).default;
  authRoutes = (await import('./routes/auth.js')).default;
  walletRoutes = (await import('./routes/wallet.js')).default;
  creatorRoutes = (await import('./routes/creator.js')).default;
  adminRoutes = (await import('./routes/admin.js')).default;
  toolsRoutes = (await import('./routes/tools.js')).default;
  console.log('✅ All routes imported');

  console.log('📦 Importing security config...');
  const securityModule = await import('./config/security.js');
  limiter = securityModule.limiter;
  corsOptions = securityModule.corsOptions;
  helmetConfig = securityModule.helmetConfig;
  console.log('✅ Security config imported');

  console.log('📦 Importing logger...');
  logger = (await import('./config/logger.js')).default;
  console.log('✅ Logger imported');

  console.log('📦 Importing validation middleware...');
  const validateModule = await import('./middleware/validateEnv.js');
  validateEnv = validateModule.validateEnv;
  console.log('✅ Validation middleware imported');

} catch (importError) {
  console.error('❌ Failed to import one or more modules:', importError?.message || importError);
  console.error('Stack:', importError?.stack);

  const noop = (req, res, next) => next();
  const simpleLogger = {
    info: (...args) => console.log('[INFO]', ...args),
    error: (...args) => console.error('[ERROR]', ...args),
    warn: (...args) => console.warn('[WARN]', ...args),
  };

  logger = simpleLogger;
  validateEnv = () => {};
  helmetConfig = noop;
  limiter = noop;
  corsOptions = { origin: true, credentials: true };

  const { Router } = await import('express');
  const makeFallback = (name) => {
    const r = Router();
    r.all('*', (req, res) => {
      res.status(503).json({ error: `${name} service temporarily unavailable` });
    });
    return r;
  };

  paymentRoutes = makeFallback('payment');
  templateRoutes = makeFallback('templates');
  generationRoutes = makeFallback('generation');
  authRoutes = makeFallback('auth');
  walletRoutes = makeFallback('wallet');
  creatorRoutes = makeFallback('creator');
  adminRoutes = makeFallback('admin');
  toolsRoutes = makeFallback('tools');

  connectDB = async () => null;

  console.warn('⚠️  Starting server in degraded mode (minimal endpoints only)');
}

console.log('🔍 Validating environment variables...');
try {
  validateEnv();
  console.log('✅ Environment validation complete');
} catch (envError) {
  console.error('⚠️  Environment validation had warnings:', envError.message);
}

const app = express();
const PORT = process.env.BACKEND_PORT || process.env.PORT || 8080;
console.log(`📍 Server will listen on port: ${PORT}`);

// ============================================
// MIDDLEWARE (Order matters!)
// ============================================

// Security Middleware
app.use(helmetConfig);
app.use(limiter);
app.use(cors(corsOptions));

// Body parsers
app.use(express.json({ limit: '1mb' })); // Reduced from 10mb for security
app.use(express.urlencoded({ extended: false, limit: '1mb' }));

// Handle OPTIONS requests for CORS preflight
app.options('*', cors(corsOptions));

// Request logging middleware
app.use((req, res, next) => {
  logger.info(`📥 ${req.method} ${req.path}`);
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
          user: process.env.CLOUDINARY_USER_CLOUD_NAME ? 'configured' : 'missing',
          creator: process.env.CLOUDINARY_CREATOR_CLOUD_NAME ? 'configured' : 'missing',
          generated: process.env.CLOUDINARY_GENERATED_CLOUD_NAME ? 'configured' : 'missing',
        }
      },
      firebase: {
        status: 'configured',
        projectId: process.env.FIREBASE_PROJECT_ID ? 'configured' : 'missing',
      }
    };

    res.json(results);
  } catch (error) {
    logger.error('Failed to check connections', { error: error.message });
    res.status(500).json({ error: 'Failed to check connections', message: error.message });
  }
});

// ============================================
// MOUNT API ROUTES
// ============================================

try {
  const apiV1 = express.Router();

  apiV1.use('/auth', authRoutes);
  apiV1.use('/payment', paymentRoutes);
  apiV1.use('/templates', templateRoutes);
  apiV1.use('/generation', generationRoutes);
  apiV1.use('/wallet', walletRoutes);
  apiV1.use('/creator', creatorRoutes);
  apiV1.use('/admin', adminRoutes);
  apiV1.use('/tools', toolsRoutes);

  // Mount v1 router
  app.use('/api/v1', apiV1);

  // Backward compatibility (optional, can be removed later)
  app.use('/api', apiV1);

  logger.info('✅ All API routes mounted successfully at /api/v1');
} catch (error) {
  logger.error('❌ Error mounting routes:', { error: error.message, stack: error.stack });
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

// 404 handler (must be after all routes)
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found', path: req.path });
});

// Error handling middleware (must be last)
import { errorHandler } from './middleware/errorHandler.js';
app.use(errorHandler);

// ============================================
// PROCESS ERROR HANDLERS
// ============================================

process.on('uncaughtException', (error) => {
  logger.error('❌ Uncaught Exception:', { error: error.message, stack: error.stack });
  logger.warn('⚠️  Server will continue running despite uncaught exception');
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('❌ Unhandled Rejection at:', { promise, reason });
  logger.warn('⚠️  Server will continue running despite unhandled rejection');
});

// ============================================
// DATABASE CONNECTION (Non-blocking)
// ============================================

// Connect to MongoDB (non-blocking - server will start even if MongoDB fails)
connectDB().catch((err) => {
  logger.error('⚠️  Failed to connect to MongoDB:', { error: err.message });
  logger.warn('⚠️  Server will continue but database operations may fail.');
  logger.warn('⚠️  Please check:');
  logger.warn('   1. MongoDB Atlas IP whitelist (add 0.0.0.0/0 for all IPs)');
  logger.warn('   2. MongoDB connection string in Railway variables (MONGODB_URI)');
  logger.warn('   3. Internet connection');
});

// ============================================
// START SERVER
// ============================================

logger.info(`🚀 Starting server on port ${PORT}...`);
logger.info(`📝 Environment: ${process.env.NODE_ENV || 'development'}`);

const server = app.listen(PORT, '0.0.0.0', () => {
  const address = server.address();
  logger.info(`✅ Server Running successfully!`);
  logger.info(`✅ Port: ${PORT}`);
  logger.info(`✅ Address: ${address ? `${address.address}:${address.port}` : 'unknown'}`);
  logger.info(`✅ Environment: ${process.env.NODE_ENV || 'development'}`);
  logger.info(`✅ Health check: http://0.0.0.0:${PORT}/health`);
  logger.info(`✅ Root endpoint: http://0.0.0.0:${PORT}/`);
  logger.info(`✅ API endpoint: http://0.0.0.0:${PORT}/api`);
  logger.info(`✅ Server is ready to accept connections`);
});

// Ensure server stays alive
server.keepAliveTimeout = 65000;
server.headersTimeout = 66000;

// Server error handler
server.on('error', (error) => {
  logger.error('❌ Server error:', { error: error.message });
  if (error.code === 'EADDRINUSE') {
    logger.error(`⚠️  Port ${PORT} is already in use`);
  }
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

