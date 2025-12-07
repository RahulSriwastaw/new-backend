import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import morgan from 'morgan';
import mongoose from 'mongoose';

import connectDB from './config/database.js';
import { helmetConfig, limiter, corsOptions } from './config/security.js';
import logger from './config/logger.js';
import paymentRoutes from './routes/payment.js';
import templateRoutes from './routes/templates.js';
import generationRoutes from './routes/generation.js';
import authRoutes from './routes/auth.js';
import walletRoutes from './routes/wallet.js';
import creatorRoutes from './routes/creator.js';
import adminRoutes from './routes/admin.js';
import toolsRoutes from './routes/tools.js';
import { errorHandler } from './middleware/errorHandler.js';
import firebaseAdmin from './config/firebaseAdmin.js';

dotenv.config();

const app = express();

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('combined'));
app.use(helmetConfig);
app.use(limiter);
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

app.get('/health', (req, res) => {
  const db = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
  res.json({ status: 'ok', time: new Date().toISOString(), pid: process.pid, db });
});

app.get('/', (req, res) => res.json({ message: 'Rupantara AI Backend - OK' }));

const apiV1 = express.Router();
apiV1.use('/auth', authRoutes);
apiV1.use('/payment', paymentRoutes);
apiV1.use('/templates', templateRoutes);
apiV1.use('/generation', generationRoutes);
apiV1.use('/wallet', walletRoutes);
apiV1.use('/creator', creatorRoutes);
apiV1.use('/admin', adminRoutes);
apiV1.use('/tools', toolsRoutes);
app.use('/api/v1', apiV1);
app.use('/api', apiV1);

app.use((req, res) => {
  res.status(404).json({ error: 'Route not found', path: req.path });
});

app.use(errorHandler);

const PORT = Number(process.env.PORT || process.env.BACKEND_PORT || 8080);
const HOST = process.env.HOST || '0.0.0.0';
const server = app.listen(PORT, HOST, () => {
  logger.info(`Server listening on http://${HOST}:${PORT}`);
});

(async function initServices() {
  try {
    try {
      if (firebaseAdmin) {
        logger.info('Firebase admin initialized');
      } else {
        logger.info('Firebase admin not initialized');
      }
    } catch (err) {
      logger.error(`Firebase init error: ${err?.message || err}`);
    }

    try {
      const ok = await connectDB();
      global.DB_CONNECTED = Boolean(ok);
      if (global.DB_CONNECTED) {
        logger.info('MongoDB connected');
      } else {
        logger.warn('MongoDB not connected — running in degraded mode');
      }
    } catch (err) {
      global.DB_CONNECTED = false;
      logger.error(`DB connection failed: ${err?.message || err}`);
    }
  } catch (err) {
    logger.error(`Service init error: ${err?.message || err}`);
  }
})();

const gracefulShutdown = async (signal) => {
  try {
    logger.warn(`Received ${signal}. Shutting down gracefully...`);
    server.close(() => {
      logger.info('HTTP server closed.');
      if (global.DB_CONNECTED && mongoose.connection.readyState === 1) {
        mongoose.disconnect().then(() => {
          logger.info('DB disconnected cleanly.');
          process.exit(0);
        }).catch(() => process.exit(1));
      } else {
        process.exit(0);
      }
    });
    setTimeout(() => { process.exit(1); }, 10000).unref();
  } catch (err) {
    logger.error(`Shutdown error: ${err}`);
    process.exit(1);
  }
};

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

