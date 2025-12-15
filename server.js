require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');

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
app.get(['/api/templates', '/api/v1/templates'], (req, res) => {
  res.status(200).json([
    {
      id: 'tpl_demo_1',
      title: 'Wedding Portrait',
      description: 'Elegant wedding-style AI portrait',
      demoImage: 'https://picsum.photos/seed/wedding/600/800',
      additionalImages: ['https://picsum.photos/seed/wedding2/600/800'],
      category: 'Wedding',
      subCategory: 'wedding',
      tags: ['wedding','portrait'],
      creatorId: 'demo_creator',
      creatorName: 'Demo Creator',
      creatorVerified: true,
      hiddenPrompt: 'high quality wedding portrait',
      visiblePrompt: 'Elegant wedding portrait',
      negativePrompt: '',
      isFree: true,
      pointsCost: 0,
      usageCount: 12,
      likeCount: 5,
      saveCount: 3,
      rating: 4.5,
      ratingCount: 8,
      ageGroup: 'adult',
      state: 'IN',
      status: 'active'
    }
  ]);
});
app.get(['/api/user', '/api/v1/user'], (req, res) => {
  res.status(200).json({});
});

app.get(['/api/admin/templates/categories','/api/v1/admin/templates/categories'], (req, res) => {
  res.status(200).json([
    { id: 'CAT_wedding', name: 'Wedding', subCategories: ['wedding'] },
    { id: 'CAT_fashion', name: 'Fashion', subCategories: ['fashion'] },
    { id: 'CAT_portrait', name: 'Portrait', subCategories: ['portrait'] },
    { id: 'CAT_business', name: 'Business', subCategories: ['business'] },
  ]);
});

app.get('/favicon.ico', (req, res) => {
  res.status(204).end();
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
