require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const { Template, Category } = require('./models');

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
      } catch {}
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
      const list = await Template.find({ status: 'active' }).sort({ useCount: -1 }).limit(100);
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

app.get(['/api/admin/templates/categories','/api/v1/admin/templates/categories'], async (req, res) => {
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

app.get('/favicon.ico', (req, res) => {
  res.status(204).end();
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
