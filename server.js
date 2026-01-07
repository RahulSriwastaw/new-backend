require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const { Template, Category, User, PointsPackage, PaymentGateway, Transaction } = require('./models');

const app = express();
app.enable('trust proxy');
const PORT = process.env.PORT || 5000;

// CORS for frontend/admin
const envOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:3005',
  'https://rupantara-fronted.vercel.app',
  'https://new-admin-pannel-nine.vercel.app',
  ...envOrigins,
];
app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    if (allowedOrigins.includes(origin)) return cb(null, true);
    return cb(null, false);
  },
  credentials: true,
}));
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));
app.use((req, res, next) => {
  if (req.url.startsWith('/api/v1/')) {
    req.url = req.url.replace('/api/v1/', '/api/');
  }
  next();
});

// Non-blocking MongoDB connection
const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
if (mongoUri) {
  mongoose
    .connect(mongoUri, { serverSelectionTimeoutMS: 5000 })
    .then(async () => {
      console.log('MongoDB connected (server.js)');
      try {
        const tCount = await Template.countDocuments();
        if (tCount === 0) {
          await Template.insertMany([
            {
              title: 'Vintage Portrait',
              imageUrl: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=500&auto=format&fit=crop&q=60',
              category: 'Portrait',
              prompt: 'vintage portrait soft lighting',
              status: 'active',
              useCount: 120,
              isPremium: false,
              source: 'manual'
            }
          ]);
        }
        const cCount = await Category.countDocuments();
        if (cCount === 0) {
          await Category.insertMany([
            { name: 'Wedding', subCategories: ['wedding'] },
            { name: 'Fashion', subCategories: ['fashion'] },
            { name: 'Portrait', subCategories: ['portrait'] },
            { name: 'Business', subCategories: ['business'] },
          ]);
        }
      } catch { }
    })
    .catch(err => console.error('MongoDB connection error:', err));
} else {
  console.warn('MONGODB_URI not set; skipping DB connection');
}

app.get('/', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Minimal placeholder API endpoints to avoid 404s
app.get(['/api', '/api/v1'], (req, res) => {
  res.status(200).json({ status: 'ok' });
});
app.get(['/api/templates', '/api/v1/templates'], async (req, res) => {
  try {
    const useDb = mongoose.connection && mongoose.connection.readyState === 1;
    if (useDb) {
      // CRITICAL: Only show approved + live templates to users
      const list = await Template.find({ 
        status: 'active',
        approvalStatus: 'approved',
        isPaused: false
      }).sort({ useCount: -1 }).limit(100);
      return res.json(list.map(t => ({
        id: t._id,
        title: t.title,
        description: t.prompt,
        demoImage: t.imageUrl,
        additionalImages: [],
        category: t.category,
        subCategory: t.subCategory,
        tags: [],
        creatorId: t.creatorId || null,
        creatorName: 'Creator',
        creatorVerified: true,
        hiddenPrompt: t.prompt,
        visiblePrompt: t.prompt,
        negativePrompt: '',
        isFree: !t.isPremium,
        pointsCost: t.isPremium ? 10 : 0,
        usageCount: t.useCount || 0,
        likeCount: t.likeCount || 0,
        saveCount: 0,
        rating: 4.5,
        ratingCount: 8,
        ageGroup: 'adult',
        state: 'IN',
        status: t.status
      })));
    }
    return res.json([]);
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch templates' });
  }
});
app.get(['/api/user', '/api/v1/user'], (req, res) => {
  res.status(200).json({});
});

// Category endpoints (support multiple paths for frontend, admin, and v1 API)
app.get(['/api/categories', '/api/v1/categories', '/api/admin/categories'], async (req, res) => {
  try {
    const useDb = mongoose.connection && mongoose.connection.readyState === 1;
    if (useDb) {
      const cats = await Category.find({ isActive: true });
      return res.json({
        success: true,
        count: cats.length,
        categories: cats.map(c => ({
          id: c._id,
          name: c.name,
          subCategories: c.subCategories || [],
          icon: c.icon || '',
          description: c.description || '',
          order: c.order || 0,
          isActive: c.isActive !== false
        }))
      });
    }
    return res.json({ success: true, count: 0, categories: [] });
  } catch (e) {
    res.status(500).json({ success: false, error: 'Failed to fetch categories' });
  }
});

// Legacy endpoint for backward compatibility
app.get(['/api/admin/templates/categories', '/api/v1/admin/templates/categories'], async (req, res) => {
  try {
    const useDb = mongoose.connection && mongoose.connection.readyState === 1;
    if (useDb) {
      const cats = await Category.find();
      return res.json(cats.map(c => ({ id: c._id, name: c.name, subCategories: c.subCategories || [] })));
    }
    return res.json([]);
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

// Import and mount Creator Template routes
const jwt = require('jsonwebtoken');

// Simple auth middleware for creator routes
const authUser = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '') || req.headers['x-auth-token'];
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secure-local-secret-key-12345');
    const user = await User.findById(decoded.id || decoded.userId);
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }
    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

// Import and mount Creator Template routes
try {
  const creatorTemplateRoutes = require('./routes/creatorTemplates')(authUser);
  app.use('/api/v1/creator/templates', creatorTemplateRoutes);
  app.use('/api/creator/templates', creatorTemplateRoutes); // Also support without /v1
  console.log('Creator template routes mounted');
} catch (error) {
  console.error('Failed to load creator template routes:', error.message);
}

// Packages endpoint for frontend
app.get(['/api/packages', '/api/v1/packages'], async (req, res) => {
  try {
    const useDb = mongoose.connection && mongoose.connection.readyState === 1;
    if (useDb) {
      const pkgs = await PointsPackage.find({ isActive: true }).sort({ price: 1 });
      return res.json(pkgs.map(p => ({
        id: String(p._id),
        name: p.name,
        price: p.price,
        points: p.points,
        bonusPoints: p.bonusPoints || 0,
        isPopular: p.isPopular || false,
        isActive: p.isActive !== false,
        tag: p.tag || ''
      })));
    }
    return res.json([]);
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch packages' });
  }
});

// Payment endpoints
app.get(['/api/payment/active-gateway', '/api/v1/payment/active-gateway'], async (req, res) => {
  try {
    const useDb = mongoose.connection && mongoose.connection.readyState === 1;
    if (useDb) {
      const active = await PaymentGateway.findOne({ isActive: true });
      return res.json({ provider: active ? active.provider.toLowerCase() : 'razorpay' });
    }
    return res.json({ provider: 'razorpay' });
  } catch (e) {
    return res.json({ provider: 'razorpay' });
  }
});

app.get('/favicon.ico', (req, res) => {
  res.status(204).end();
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
