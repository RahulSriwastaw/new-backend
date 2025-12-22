require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bodyParser = require('body-parser');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const admin = require('firebase-admin');
const Razorpay = require('razorpay');
const Stripe = require('stripe');
const crypto = require('crypto');
const fs = require('fs');
const {
  User, CreatorApplication, Transaction, AIModel, Template, Category,
  PointsPackage, PaymentGateway, FinanceConfig, Admin, Notification, Generation, ToolConfig, FilterConfig, AdsConfig,
  Withdrawal, CreatorNotification, CreatorEarning, GenerationGuardRule
} = require('./models');

// AI Providers (Modular System)
const { generateWithStability } = require('./providers/stability');
const { generateWithReplicate } = require('./providers/replicate');
const { generateWithMiniMax } = require('./providers/minimax');
const { generateWithOpenAI } = require('./providers/openai');
const { generateWithGemini } = require('./providers/gemini');


const app = express();
const PORT = process.env.PORT || 5000;
const recentLogs = [];
let globalRequestCount = 0;
const memoryCreatorApps = [];
const memoryCategories = [
  { id: 'CAT_wedding', name: 'Wedding', subCategories: ['wedding'] },
  { id: 'CAT_fashion', name: 'Fashion', subCategories: ['fashion'] },
  { id: 'CAT_business', name: 'Business', subCategories: ['business'] },
  { id: 'CAT_cinematic', name: 'Cinematic', subCategories: ['cinematic'] },
  { id: 'CAT_festival', name: 'Festival', subCategories: ['festival'] },
  { id: 'CAT_portrait', name: 'Portrait', subCategories: ['portrait'] },
  { id: 'CAT_couple', name: 'Couple', subCategories: ['couple'] },
  { id: 'CAT_traditional', name: 'Traditional', subCategories: ['traditional'] },
  { id: 'CAT_modern', name: 'Modern', subCategories: ['modern'] },
  { id: 'CAT_cartoon', name: 'Cartoon', subCategories: ['cartoon'] },
];
const useMemory = () => !(mongoose.connection && mongoose.connection.readyState === 1);

const envOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:3002',
  'http://localhost:3005',
  'http://localhost:5000',
  'http://localhost:5001',
  'http://localhost:5002',
  'https://new-admin-pannel-nine.vercel.app',
  'https://rupantara-fronted.vercel.app',
  ...envOrigins.map(o => o.replace(/`/g, '').trim()),
];
// CORS Configuration with better error handling
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);

    // Check if origin is in allowed list
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    // Allow Vercel preview URLs (e.g., *.vercel.app)
    if (origin.includes('.vercel.app') || origin.includes('vercel.app')) {
      return callback(null, true);
    }

    // Allow localhost for development
    if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
      return callback(null, true);
    }

    // In production, log blocked origins for debugging
    if (process.env.NODE_ENV === 'production') {
      console.warn(`⚠️ CORS blocked origin: ${origin}`);
    }

    // For development, allow all origins
    if (process.env.NODE_ENV === 'development') {
      return callback(null, true);
    }

    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  optionsSuccessStatus: 200,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

app.use(bodyParser.json({ limit: '25mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '25mb' }));

// ... (request logging middleware remains same)

// Image Proxy for CORS Bypass
app.get(['/api/proxy', '/api/v1/proxy'], async (req, res) => {
  const { url } = req.query;
  console.log("Create Proxy Request for:", url);
  if (!url) return res.status(400).send('No URL provided');
  try {
    const fetch = global.fetch;
    const targetUrl = decodeURIComponent(url);
    const resp = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; RupantarAI/1.0)'
      }
    });

    if (!resp.ok) {
      console.error("Proxy Upstream Error:", resp.status, targetUrl);
      return res.status(404).send(`Image fetch failed: ${resp.status}`);
    }

    const contentType = resp.headers.get('content-type');
    if (contentType) res.setHeader('Content-Type', contentType);
    res.setHeader('Access-Control-Allow-Origin', '*');

    const arrayBuffer = await resp.arrayBuffer();
    res.send(Buffer.from(arrayBuffer));
  } catch (e) {
    console.error("Proxy Error:", e);
    res.status(500).send("Proxy failed");
  }
});

// Firebase Google Login - Verify ID Token
app.post('/api/auth/firebase-login', async (req, res) => {
  console.log('👉 /api/auth/firebase-login called');
  try {
    const { idToken } = req.body;

    if (!idToken) {
      console.log('❌ No idToken provided');
      return res.status(400).json({ msg: 'ID token required' });
    }

    console.log('🔑 verifying idToken of length:', idToken.length);

    // Verify the ID token with Firebase Admin
    let decodedToken;
    try {
      decodedToken = await admin.auth().verifyIdToken(idToken);
    } catch (tokenErr) {
      console.error('❌ verifyIdToken failed:', tokenErr);
      return res.status(401).json({ msg: 'Invalid Token Signature', error: tokenErr.message });
    }

    const { uid, email, name, picture } = decodedToken;
    console.log('✅ Token Verified. UID:', uid, 'Email:', email, 'Name in Token:', name);

    if (!email) {
      return res.status(400).json({ msg: 'Email not found in token' });
    }

    // Explicitly derive name to ensure it is never empty
    let finalName = 'User';
    if (name && typeof name === 'string' && name.trim().length > 0) {
      finalName = name.trim();
    } else if (email) {
      finalName = email.split('@')[0] || 'User';
    }

    // Find or create user
    let user = await User.findOne({ firebaseUid: uid }) || await User.findOne({ email });

    if (!user) {
      console.log('Creating new user with name:', finalName);
      // Create new user
      user = await User.create({
        name: finalName,
        email,
        firebaseUid: uid,
        photoURL: picture || '',
        role: 'user',
        points: 50,
        status: 'active',
      });
      console.log('✅ New user created via Firebase:', email);
    } else {
      // Update existing user with Firebase UID if missing
      let changed = false;
      if (!user.firebaseUid) {
        user.firebaseUid = uid;
        changed = true;
      }
      if (picture && !user.photoURL) {
        user.photoURL = picture;
        changed = true;
      }
      // Fix for legacy users with missing name causing validation error
      if (!user.name) {
        user.name = finalName;
        changed = true;
      }

      if (changed) {
        await user.save();
        console.log('✅ Existing user updated via Firebase:', email);
      } else {
        console.log('✅ Existing user logged in (no changes):', email);
      }
    }

    // Generate JWT token
    const payload = { user: { id: user.id, role: user.role } };
    const token = jwt.sign(payload, process.env.JWT_SECRET || 'RupantarAI_Secure_Secret_2025', { expiresIn: '7d' });

    res.json({
      token,
      user: {
        id: user.id,
        _id: user._id,
        name: user.name,
        email: user.email,
        points: user.points,
        role: user.role,
        photoURL: user.photoURL,
        joinedDate: user.joinedDate,
      },
    });
  } catch (err) {
    console.error('❌ Firebase login error:', err);
    res.status(500).json({ error: 'Firebase authentication failed', msg: err.message, stack: err.stack });
  }
});
app.use((req, res, next) => {
  if (req.url.startsWith('/api/v1/')) {
    req.url = req.url.replace('/api/v1/', '/api/');
  }
  next();
});

app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    recentLogs.push({
      ts: new Date().toISOString(),
      method: req.method,
      path: req.originalUrl || req.url,
      status: res.statusCode,
      ms: Date.now() - start
    });
    globalRequestCount++;
    if (recentLogs.length > 100) recentLogs.shift();
  });
  next();
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason);
});
const mongoUri =
  process.env.MONGODB_URI ||
  process.env.MONGO_URI ||
  process.env.MONGO_URL ||
  process.env.MONGODB_URL;

if (!mongoUri) {
  console.warn('⚠️  MongoDB URI not set (MONGODB_URI/MONGO_URI/MONGO_URL/MONGODB_URL); running in memory mode');
  recentLogs.push({ ts: new Date().toISOString(), method: 'SYSTEM', path: 'MONGODB_URI_MISSING', status: 500, ms: 0 });
} else {
  mongoose
    .connect(mongoUri, { serverSelectionTimeoutMS: 8000 })
    .then(() => {
      console.log('✅ MongoDB Connected Successfully');
      recentLogs.push({ ts: new Date().toISOString(), method: 'SYSTEM', path: 'MONGODB_CONNECTED', status: 200, ms: 0 });
      // Seed only when DB is available (prevents buffering timeouts when running without Mongo)
      seedDatabase().catch(err => console.log('Seeding Error:', err));
    })
    .catch(err => {
      console.error('❌ MongoDB Connection Error:', err);
      recentLogs.push({ ts: new Date().toISOString(), method: 'SYSTEM', path: 'MONGODB_ERROR', status: 500, ms: 0 });
    });
}

const authUser = (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ msg: 'No token, authorization denied' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'RupantarAI_Secure_Secret_2025');
    req.user = decoded.user;
    next();
  } catch (err) {
    console.error('❌ authUser Failed:', err.message);
    const usedSecret = process.env.JWT_SECRET ? 'Using Env Var' : 'Using Fallback';
    console.log(`Debug: Token Prefix: ${token.substring(0, 10)}... | Secret: ${usedSecret}`);
    res.status(401).json({ msg: 'Token is not valid', error: err.message });
  }
};

// Firebase Admin initialization for production token verification
let adminInitialized = false;
try {
  if (!admin.apps.length) {
    let serviceAccount = null;

    // Preferred: full service account JSON in one env var
    if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
      serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    } else if (
      process.env.FIREBASE_PROJECT_ID &&
      process.env.FIREBASE_CLIENT_EMAIL &&
      process.env.FIREBASE_PRIVATE_KEY
    ) {
      // Fallback: construct service account from individual env vars
      serviceAccount = {
        project_id: process.env.FIREBASE_PROJECT_ID,
        client_email: process.env.FIREBASE_CLIENT_EMAIL,
        private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      };
    }

    if (serviceAccount) {
      admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    } else {
      // Final fallback to application default credentials (GCP)
      admin.initializeApp({ credential: admin.credential.applicationDefault() });
    }
  }
  adminInitialized = true;
  recentLogs.push({ ts: new Date().toISOString(), method: 'SYSTEM', path: 'FIREBASE_ADMIN_INIT', status: 200, ms: 0 });
} catch (e) {
  console.error('Firebase Admin init failed:', e);
  recentLogs.push({ ts: new Date().toISOString(), method: 'SYSTEM', path: 'FIREBASE_ADMIN_ERROR', status: 500, ms: 0 });
}

const verifyFirebaseIdToken = async (idToken) => {
  if (!adminInitialized) throw new Error('Firebase Admin not initialized');
  const decoded = await admin.auth().verifyIdToken(idToken);
  return decoded;
};

// Production-safe Firebase login using verified ID token


async function seedDatabase() {
  try {
    const adminCount = await Admin.countDocuments();
    if (adminCount === 0) {
      const hashedPassword = await bcrypt.hash(process.env.SUPER_ADMIN_PASSWORD || 'admin123', 10);
      await Admin.create({
        name: 'Super Admin',
        email: process.env.SUPER_ADMIN_ID || 'admin@rupantar.ai',
        password: hashedPassword,
        role: 'super_admin',
        permissions: ['manage_users', 'manage_creators', 'manage_templates', 'manage_finance', 'manage_ai', 'manage_settings', 'view_reports']
      });
    }
    const modelCount = await AIModel.countDocuments();
    if (modelCount === 0) {
      await AIModel.create({
        name: 'Pollinations Images',
        provider: 'Pollinations',
        costPerImage: 1,
        isActive: true,
        apiKey: ''
      });
    }
    const templateCount = await Template.countDocuments();
    if (templateCount === 0) {
      await Template.insertMany([
        {
          title: 'Vintage Portrait',
          imageUrl: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=500&auto=format&fit=crop&q=60',
          category: 'Portrait',
          prompt: 'vintage portrait soft lighting',
          status: 'active',
          useCount: 890,
          isPremium: false,
          source: 'manual'
        },
        {
          title: 'Cyberpunk Warrior',
          imageUrl: 'https://images.unsplash.com/photo-1620712943543-bcc4688e7485?w=500&auto=format&fit=crop&q=60',
          category: 'Sci-Fi',
          prompt: 'cyberpunk street samurai neon lights',
          status: 'active',
          useCount: 1250,
          isPremium: true,
          source: 'manual'
        },
        {
          title: 'Fantasy Landscape',
          imageUrl: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=500&auto=format&fit=crop&q=60',
          category: 'Landscape',
          prompt: 'floating islands waterfalls magical clouds',
          status: 'active',
          useCount: 350,
          isPremium: true,
          source: 'manual'
        }
      ]);
    }
    const packagesCount = await PointsPackage.countDocuments();
    if (packagesCount === 0) {
      await PointsPackage.insertMany([
        { name: 'Starter', price: 199, points: 100, bonusPoints: 0, isPopular: false, isActive: true, tag: 'Best for Trial' },
        { name: 'Pro', price: 799, points: 500, bonusPoints: 50, isPopular: true, isActive: true, tag: 'Most Popular' },
        { name: 'Ultimate', price: 1499, points: 1200, bonusPoints: 200, isPopular: false, isActive: true, tag: 'Best Value' }
      ]);
    }
    // Force update/create Razorpay Gateway to ensure it is Active
    await PaymentGateway.findOneAndUpdate(
      { provider: 'razorpay' },
      {
        name: 'Razorpay',
        provider: 'razorpay',
        isActive: true,
        isTestMode: true,
        publicKey: process.env.RAZORPAY_KEY_ID || '',
        secretKey: process.env.RAZORPAY_KEY_SECRET || ''
      },
      { upsert: true, new: true }
    );
    const toolCfgCount = await ToolConfig.countDocuments();
    if (toolCfgCount === 0) {
      await ToolConfig.create({
        tools: [
          { key: 'remove-bg', name: 'BG Remove', cost: 0, isActive: true },
          { key: 'enhance', name: 'Enhance', cost: 5, isActive: true },
          { key: 'face-enhance', name: 'Face Fix', cost: 8, isActive: true },
          { key: 'upscale', name: 'Upscale', cost: 10, isActive: true },
          { key: 'colorize', name: 'Colorize', cost: 10, isActive: true },
          { key: 'style', name: 'Style', cost: 8, isActive: true }
        ]
      });
    }
  } catch (err) {
    console.log('Seeding Error:', err);
  }
}

app.get('/', (req, res) => {
  res.status(200).json({ status: 'ok', ts: new Date().toISOString() });
});

app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, fullName, email, password } = req.body;
    const finalName = (name || fullName || (email ? String(email).split('@')[0] : 'User')).trim();
    let user = await User.findOne({ email });
    if (user) return res.status(400).json({ msg: 'User already exists' });
    const hashedPassword = await bcrypt.hash(password, 10);
    user = new User({ name: finalName, email, password: hashedPassword, role: 'user', points: 50 });
    await user.save();
    const payload = { user: { id: user.id, role: user.role } };
    const token = jwt.sign(payload, process.env.JWT_SECRET || 'RupantarAI_Secure_Secret_2025', { expiresIn: '7d' });
    res.json({ token, user: { id: user.id, name: user.name, email: user.email, points: user.points, role: user.role } });
  } catch (err) {
    res.status(500).send('Server Error');
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (email === process.env.SUPER_ADMIN_ID) return res.status(400).json({ msg: 'Please use Admin Login' });
    const user = await User.findOne({ email }).select('+password');
    if (!user || !(await bcrypt.compare(String(password), String(user.password)))) {
      return res.status(400).json({ msg: 'Invalid Credentials' });
    }
    const payload = { user: { id: user.id, role: user.role } };
    const token = jwt.sign(payload, process.env.JWT_SECRET || 'RupantarAI_Secure_Secret_2025', { expiresIn: '7d' });
    res.json({ token, user: { id: user.id, name: user.name, email: user.email, points: user.points, role: user.role } });
  } catch (err) {
    res.status(500).send('Server Error');
  }
});

app.post('/api/auth/social-login', async (req, res) => {
  try {
    const { provider = 'google', email, name, uid, photoURL } = req.body;
    const finalEmail = email && String(email).trim();
    if (!finalEmail) return res.status(400).json({ msg: 'Email required' });
    let user = await User.findOne({ firebaseUid: uid }) || await User.findOne({ email: finalEmail });
    if (!user) {
      user = await User.create({
        name: name || String(finalEmail).split('@')[0],
        email: finalEmail,
        firebaseUid: uid,
        photoURL: photoURL || '',
        role: 'user',
        points: 100,
        status: 'active'
      });
    } else if (uid && !user.firebaseUid) {
      user.firebaseUid = uid;
      if (photoURL) user.photoURL = photoURL;
      await user.save();
    }
    const payload = { user: { id: user.id, role: user.role } };
    const token = jwt.sign(payload, process.env.JWT_SECRET || 'RupantarAI_Secure_Secret_2025', { expiresIn: '7d' });
    res.json({ token, user: { id: user.id, name: user.name, email: user.email, points: user.points, role: user.role } });
  } catch (err) {
    res.status(500).send('Server Error');
  }
});

// Firebase Google Login - Verify ID Token
app.post('/api/auth/firebase-login', async (req, res) => {
  try {
    const { idToken } = req.body;

    if (!idToken) {
      return res.status(400).json({ msg: 'ID token required' });
    }

    // Verify the ID token with Firebase Admin
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const { uid, email, name, picture } = decodedToken;

    if (!email) {
      return res.status(400).json({ msg: 'Email not found in token' });
    }

    // Find or create user
    let user = await User.findOne({ firebaseUid: uid }) || await User.findOne({ email });

    if (!user) {
      // Create new user
      user = await User.create({
        name: name || email.split('@')[0],
        email,
        firebaseUid: uid,
        photoURL: picture || '',
        role: 'user',
        points: 50,
        status: 'active',
      });
      console.log('✅ New user created via Firebase:', email);
    } else {
      // Update existing user with Firebase UID if missing
      if (!user.firebaseUid) {
        user.firebaseUid = uid;
      }
      if (picture && !user.photoURL) {
        user.photoURL = picture;
      }
      await user.save();
      console.log('✅ Existing user logged in via Firebase:', email);
    }

    // Generate JWT token
    const payload = { user: { id: user.id, role: user.role } };
    const token = jwt.sign(payload, process.env.JWT_SECRET || 'RupantarAI_Secure_Secret_2025', { expiresIn: '7d' });

    res.json({
      token,
      user: {
        id: user.id,
        _id: user._id,
        name: user.name,
        email: user.email,
        points: user.points,
        role: user.role,
        photoURL: user.photoURL,
        joinedDate: user.joinedDate,
      },
    });
  } catch (err) {
    console.error('❌ Firebase login error:', err);
    res.status(500).json({ error: 'Firebase authentication failed', msg: err.message });
  }
});


app.get('/api/user/me', authUser, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    res.json(user);
  } catch (err) {
    res.status(500).send('Server Error');
  }
});

// Backward-compatible alias used by the frontend client
app.get('/api/auth/me', authUser, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    res.json(user);
  } catch (err) {
    res.status(500).send('Server Error');
  }
});

// Wallet APIs (used by user app)


app.post('/api/creator/apply', authUser, async (req, res) => {
  try {
    const { name, socialLinks = [], bio, demoTemplates = [] } = req.body;
    const finalName = (name || '').toString().replace(/^@/, '').trim();
    if (!finalName) {
      return res.status(400).json({ error: 'Name is required' });
    }
    const links = Array.isArray(socialLinks)
      ? socialLinks.filter(Boolean).map(l => String(l).trim()).filter(l => l.length > 0)
      : [];
    if (useMemory()) {
      const doc = {
        id: String(Date.now()),
        userId: String(req.user.id),
        name: finalName,
        socialLinks: links,
        bio,
        demoTemplates,
        status: 'pending',
        appliedDate: new Date()
      };
      memoryCreatorApps.push(doc);
      return res.json({
        id: doc.id,
        userId: doc.userId,
        name: doc.name,
        socialLinks: doc.socialLinks,
        bio: doc.bio,
        demoTemplates: doc.demoTemplates,
        status: doc.status,
        appliedDate: doc.appliedDate.toISOString()
      });
    } else {
      const appDoc = await CreatorApplication.create({
        userId: req.user.id,
        name: finalName,
        socialLinks: links,
        bio,
        demoTemplates
      });
      return res.json({
        id: String(appDoc._id),
        userId: String(appDoc.userId),
        name: appDoc.name,
        bio: appDoc.bio,
        demoTemplates: appDoc.demoTemplates || [],
        socialLinks: appDoc.socialLinks || [],
        status: appDoc.status,
        appliedDate: appDoc.appliedDate ? appDoc.appliedDate.toISOString() : new Date().toISOString()
      });
    }
  } catch (err) {
    res.status(500).json({ error: 'Server Error' });
  }
});

app.get('/api/creator/application', authUser, async (req, res) => {
  try {
    if (useMemory()) {
      const app = memoryCreatorApps.find(a => String(a.userId) === String(req.user.id));
      if (!app) return res.status(404).json({ status: 'none' });
      return res.json({ id: app.id, userId: app.userId, name: app.name, status: app.status, appliedDate: app.appliedDate });
    } else {
      const app = await CreatorApplication.findOne({ userId: req.user.id }).sort({ appliedDate: -1 });
      if (!app) return res.status(404).json({ status: 'none' });
      return res.json({ ...app._doc, id: app._id });
    }
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch application status' });
  }
});

app.get('/api/v1/creator/application', authUser, async (req, res) => {
  try {
    if (useMemory()) {
      const app = memoryCreatorApps.find(a => String(a.userId) === String(req.user.id));
      if (!app) return res.status(404).json({ status: 'none' });
      return res.json({ id: app.id, userId: app.userId, name: app.name, status: app.status, appliedDate: app.appliedDate });
    } else {
      const app = await CreatorApplication.findOne({ userId: req.user.id }).sort({ appliedDate: -1 });
      if (!app) return res.status(404).json({ status: 'none' });
      return res.json({ ...app._doc, id: app._id });
    }
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch application status' });
  }
});

app.post('/api/generation/generate', authUser, async (req, res) => {
  try {

    const { templateId, userPrompt, prompt, negativePrompt, uploadedImages: reqUploadedImages = [], quality = 'HD', aspectRatio = '1:1', modelId, strength, variations = 1 } = req.body;
    let uploadedImages = reqUploadedImages;

    // Validate User
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Determine Logic/Cost
    // Use selected model if provided, otherwise use active model
    let activeModel = null;
    if (modelId) {
      activeModel = await AIModel.findById(modelId).select('+apiKey +config.apiKey');
      if (!activeModel) {
        // Fallback to active model if selected model not found
        activeModel = await AIModel.findOne({ active: true }).select('+apiKey +config.apiKey');
        if (!activeModel) activeModel = await AIModel.findOne({ isActive: true }).select('+apiKey +config.apiKey');
      }
    } else {
      activeModel = await AIModel.findOne({ active: true }).select('+apiKey +config.apiKey');
      if (!activeModel) activeModel = await AIModel.findOne({ isActive: true }).select('+apiKey +config.apiKey');
    }
    const cost = activeModel?.costPerImage ?? 1;
    if (user.points < cost) return res.status(400).json({ error: 'Insufficient points' });

    // Resolve Template safely and EARLY to use its prompt
    let template = null;
    if (templateId && String(templateId).match(/^[0-9a-fA-F]{24}$/)) {
      try { template = await Template.findById(templateId); } catch (ex) { }
    }

    // Determine Final Prompt
    let finalPrompt = prompt || userPrompt || '';
    if (template && template.prompt) {
      // If user provided a prompt, append it to template prompt, otherwise use template prompt
      if (finalPrompt) {
        finalPrompt = `${template.prompt}, ${finalPrompt}`;
      } else {
        finalPrompt = template.prompt;
      }
    }

    // Fallback if still empty
    if (!finalPrompt) finalPrompt = "high quality, artistic image";

    // === AI GUARD SYSTEM LOGIC ===
    let executionPrompt = finalPrompt;
    try {
      const activeRules = await GenerationGuardRule.find({ enabled: true }).sort({ priority: 1 });
      const isI2I = uploadedImages && uploadedImages.length > 0;
      const mode = isI2I ? 'image_to_image' : 'text_to_image';

      const systemPrompts = [];
      const safetyNegativePrompts = [];

      activeRules.forEach(rule => {
        // Check coverage: 'image' covers all image generations
        if (rule.applyTo.includes(mode) || rule.applyTo.includes('image')) {
          if (rule.ruleType === 'negative_prompt') {
            if (rule.hiddenPrompt) safetyNegativePrompts.push(rule.hiddenPrompt);
          } else {
            if (rule.hiddenPrompt) systemPrompts.push(rule.hiddenPrompt);
          }
        }
      });

      // 1. Prepend System Prompts (Priority Ordered)
      if (systemPrompts.length > 0) {
        executionPrompt = `${systemPrompts.join(' ')} . ${finalPrompt}`;
      }

      // 2. Append Safety Negative Prompts
      let finalNegativePromptRaw = negativePrompt || "";
      if (safetyNegativePrompts.length > 0) {
        const safetyStr = safetyNegativePrompts.join(', ');
        finalNegativePromptRaw = finalNegativePromptRaw ? `${finalNegativePromptRaw}, ${safetyStr}` : safetyStr;
      }
      var finalNegativePrompt = finalNegativePromptRaw; // Ensure var scope
    } catch (err) {
      console.error("Guard Rule Error:", err);
      // Fallback to basic passthrough if Guard DB fails
      var finalNegativePrompt = negativePrompt || "";
    }
    let imageUrl = '';

    // Try External Providers
    // Try External Providers
    let apiKey = activeModel?.config?.apiKey || activeModel?.apiKey;
    let providerError = '';

    if (activeModel && apiKey) {
      try {
        let provider = (activeModel.provider || '').toLowerCase();
        const isI2I = uploadedImages && uploadedImages.length > 0;

        // === ALL PROVIDERS NOW SUPPORT BOTH T2I AND I2I ===
        // Gemini, Stability, MiniMax all handle both modes via their providers
        console.log(`🎯 Using ${activeModel.name} for ${isI2I ? 'I2I' : 'T2I'} generation`);

        // === MODULAR AI PROVIDER SYSTEM ===
        // Each provider has its own file in /providers/
        // Easy to debug, maintain, and extend

        if (provider.includes('stability')) {
          imageUrl = await generateWithStability({
            prompt: executionPrompt,
            negativePrompt: finalNegativePrompt,
            uploadedImages,
            aspectRatio,
            apiKey,
            modelConfig: activeModel.config,
            strength: strength || 0.35 // Use provided strength or default
          });

        } else if (provider.includes('replicate')) {
          imageUrl = await generateWithReplicate({
            prompt: executionPrompt,
            negativePrompt: finalNegativePrompt,
            uploadedImages,
            aspectRatio,
            apiKey,
            modelId: activeModel.config?.model
          });

        } else if (provider.includes('minimax')) {
          imageUrl = await generateWithMiniMax({
            prompt: executionPrompt,
            uploadedImages,
            apiKey,
            modelConfig: activeModel.config,
            aspectRatio
          });

        } else if (provider.includes('openai')) {
          imageUrl = await generateWithOpenAI({
            prompt: executionPrompt,
            apiKey
          });

        } else if (provider.includes('gemini') || provider.includes('google')) {
          imageUrl = await generateWithGemini({
            prompt: executionPrompt,
            negativePrompt: finalNegativePrompt,
            uploadedImages,
            apiKey,
            modelConfig: { ...activeModel.config, aspectRatio }
          });

        } else {
          throw new Error(`Unsupported provider: ${provider}`);
        }
      } catch (e) {
        console.error("AI Generation External API Error:", e);
        providerError = `Exception: ${e.message}`;

        // === FAILOVER LOGIC ===
        // If I2I and the current provider failed, try to switch to another compatible provider
        const isI2I = uploadedImages && uploadedImages.length > 0;
        if (isI2I && !imageUrl) {
          const currentProvider = (activeModel.provider || '').toLowerCase();
          let failoverProviderRegex = null;

          // Logic: If Stability failed, try MiniMax. If MiniMax failed, try Stability.
          if (currentProvider.includes('stability')) {
            console.log("⚠️ Stability Failed. Attempting Failover to MiniMax...");
            failoverProviderRegex = /minimax/i;
          } else if (currentProvider.includes('minimax')) {
            console.log("⚠️ MiniMax Failed. Attempting Failover to Stability...");
            failoverProviderRegex = /stability/i;
          }

          if (failoverProviderRegex) {
            try {
              const failoverModel = await AIModel.findOne({
                provider: { $regex: failoverProviderRegex }
              }).select('+apiKey +config.apiKey');

              if (failoverModel) {
                const failoverApiKey = failoverModel.config?.apiKey || failoverModel.apiKey;

                if (failoverProviderRegex.source.includes('minimax')) {
                  imageUrl = await generateWithMiniMax({
                    prompt: executionPrompt,
                    uploadedImages,
                    apiKey: failoverApiKey,
                    modelConfig: failoverModel.config,
                    aspectRatio
                  });
                } else if (failoverProviderRegex.source.includes('stability')) {
                  imageUrl = await generateWithStability({
                    prompt: executionPrompt,
                    negativePrompt: finalNegativePrompt,
                    uploadedImages,
                    aspectRatio,
                    apiKey: failoverApiKey,
                    modelConfig: failoverModel.config
                  });
                }

                if (imageUrl) {
                  console.log("✅ Failover Success!");
                  providerError = ''; // Clear error
                }
              }
            } catch (failoverErr) {
              console.error("❌ Failover Failed:", failoverErr);
              providerError += ` | Failover Exception: ${failoverErr.message}`;
            }
          }
        }
      }
    }

    // Force HTTPS to prevent Mixed Content errors on frontend
    if (imageUrl && imageUrl.startsWith('http://')) {
      imageUrl = imageUrl.replace(/^http:\/\//i, 'https://');
    }

    // Check if generation succeeded
    if (!imageUrl) {
      return res.status(500).json({
        error: `Generation Failed: ${providerError || 'No provider active'}. DB State: [${allModelsDebug.map(m => `${m.provider}(${m.key}):${m.active}:Key=${!!(m.config?.apiKey || m.apiKey)}`).join('|')}]`
      });
    }

    // Handle Uploaded Images safely
    let safeUploadedImages = [];
    if (Array.isArray(uploadedImages)) {
      safeUploadedImages = uploadedImages.slice(0, 5).map(img => {
        if (typeof img === 'string' && img.length > 5000000) return null; // Skip insane sizes
        if (typeof img === 'string' && img.startsWith('data:')) {
          return img.slice(0, 500); // Store truncated preview or full? truncated for safety if just logging
        }
        return img; // Store full link if it's a URL
      }).filter(Boolean);
    }




    // Create Record
    const gen = await Generation.create({

      userId: user._id,
      templateId: template?._id,
      templateName: template?.title,
      prompt: finalPrompt,
      negativePrompt: negativePrompt || '',
      uploadedImages: safeUploadedImages,
      generatedImage: imageUrl,
      quality,
      aspectRatio,
      pointsSpent: cost,
      status: 'completed'
    });

    // Deduct Points
    user.points -= cost;
    user.usesCount = (user.usesCount || 0) + 1;
    await user.save();

    await Transaction.create({
      userId: user._id,
      amount: cost,
      type: 'debit',
      description: `Image generation (${quality})`,
      gateway: 'System',
      status: 'success',
      date: new Date()
    });

    if (template) {
      template.useCount = (template.useCount || 0) + 1;
      await template.save();

      // Track creator earnings if template has a creator
      if (template.creatorId) {
        const financeConfig = await FinanceConfig.findOne() || { creatorPayoutPerPoint: 0.10 };
        const creatorEarning = cost * financeConfig.creatorPayoutPerPoint;

        if (creatorEarning > 0) {
          await CreatorEarning.create({
            creatorId: template.creatorId,
            templateId: template._id,
            amount: creatorEarning,
            usageCount: 1,
            date: new Date()
          });

          // Send notification to creator
          await CreatorNotification.create({
            creatorId: template.creatorId,
            type: 'earning',
            title: 'New Earning!',
            message: `You earned $${creatorEarning.toFixed(2)} from "${template.title}" usage.`,
            relatedId: template._id
          });
        }
      }
    }

    const response = {
      id: String(gen._id),
      generatedImage: gen.generatedImage,
      visiblePrompt: template ? (template.title || 'AI Generated Image') : 'AI Generated Image',
      quality: gen.quality,
      aspectRatio: gen.aspectRatio,
      pointsSpent: gen.pointsSpent,
      status: gen.status,
      createdAt: gen.createdAt.toISOString(),
      isFavorite: gen.isFavorite,
      downloadCount: gen.downloadCount,
      shareCount: gen.shareCount
    };
    res.json(response);
  } catch (err) {
    const errorMsg = String(err && err.message ? err.message : String(err));
    console.error("❌ Generation Error:", err);
    recentLogs.push({ ts: new Date().toISOString(), method: 'POST', path: '/api/generation/generate', status: 500, ms: 0, error: errorMsg });

    // Better error messages for common issues
    let userFriendlyError = 'Image generation failed. Please try again.';
    if (errorMsg.includes('Insufficient points')) {
      userFriendlyError = 'Insufficient points. Please purchase more points.';
    } else if (errorMsg.includes('API key') || errorMsg.includes('authentication')) {
      userFriendlyError = 'AI service configuration error. Please contact support.';
    } else if (errorMsg.includes('timeout') || errorMsg.includes('Timeout')) {
      userFriendlyError = 'Request timed out. Please try again.';
    } else if (errorMsg.includes('rate limit') || errorMsg.includes('quota')) {
      userFriendlyError = 'Service temporarily unavailable. Please try again later.';
    }

    // Return user-friendly error message
    res.status(500).json({
      error: userFriendlyError,
      ...(process.env.NODE_ENV === 'development' && { details: errorMsg })
    });
  }
});


// Admin - Get Creator Detailed Profile
app.get('/api/admin/creators/:id/profile', authUser, async (req, res) => {
  try {
    const { id } = req.params;

    // Resolve userId: Check if ID matches a CreatorApplication first, otherwise assume it's a UserId
    let userId = id;
    let application = await CreatorApplication.findById(id);

    if (application) {
      userId = application.userId;
    } else {
      // Fallback: Try to find application by userId
      application = await CreatorApplication.findOne({ userId: id });
    }

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const templates = await Template.find({ creatorId: userId }).sort({ createdAt: -1 });
    const earnings = await CreatorEarning.find({ creatorId: userId }).sort({ date: 1 });
    const withdrawals = await Withdrawal.find({ creatorId: userId }).sort({ requestedAt: -1 });

    // Calculate Stats
    const totalEarnings = earnings.reduce((acc, curr) => acc + curr.amount, 0);
    const totalLikes = templates.reduce((acc, curr) => acc + (curr.likeCount || 0), 0);
    const totalUses = templates.reduce((acc, curr) => acc + (curr.useCount || 0), 0);
    const totalSaves = templates.reduce((acc, curr) => acc + (curr.saveCount || 0), 0);

    // Prepare Graph Data (Last 30 days earnings)
    const last30Days = [...Array(30)].map((_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (29 - i));
      return d.toISOString().split('T')[0];
    });

    const earningsMap = {};
    earnings.forEach(e => {
      const date = e.date.toISOString().split('T')[0];
      earningsMap[date] = (earningsMap[date] || 0) + e.amount;
    });

    const growthStats = last30Days.map(date => ({
      date,
      earnings: earningsMap[date] || 0
    }));

    res.json({
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        avatar: user.photoURL,
        role: user.role,
        status: user.status,
        joinedDate: user.joinedDate,
        followers: user.followersCount || 0,
        walletBalance: user.points
      },
      application: application ? {
        bio: application.bio,
        socialLinks: application.socialLinks,
        status: application.status
      } : null,
      stats: {
        totalEarnings,
        totalLikes,
        totalUses,
        totalSaves
      },
      templates,
      earnings,
      withdrawals,
      growthStats
    });
  } catch (err) {
    console.error('Error fetching creator profile:', err);
    res.status(500).json({ error: 'Server Error' });
  }
});

app.get('/api/admin/creators/:id/followers', authUser, async (req, res) => {
  try {
    const { id } = req.params;
    // Resolve userId like profile endpoint
    let userId = id;
    let application = await CreatorApplication.findById(id);
    if (application) {
      userId = application.userId;
    } else {
      application = await CreatorApplication.findOne({ userId: id });
    }

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Simulate Growth Data (last 30 days)
    const growthData = [];
    const today = new Date();
    let currentFollowers = user.followersCount || 0;

    // Create a smooth-ish curve backward
    for (let i = 0; i < 30; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      growthData.unshift({
        date: d.toISOString().split('T')[0],
        count: Math.max(0, currentFollowers - Math.floor(Math.random() * i * 0.5))
      });
    }

    // Simulate Top Followers (Mock data since we don't have a Followers collection)
    const topFollowers = [
      { id: '1', name: 'Alice Smith', username: 'alice_s', avatar: '' },
      { id: '2', name: 'Bob Jones', username: 'bobj', avatar: '' },
      { id: '3', name: 'Charlie Day', username: 'charlie_d', avatar: '' },
      { id: '4', name: 'Diana Prince', username: 'wonder_d', avatar: '' },
      { id: '5', name: 'Evan Wright', username: 'evan_w', avatar: '' }
    ];

    res.json({
      totalFollowers: user.followersCount || 0,
      growthData,
      topFollowers: user.followersCount > 0 ? topFollowers.slice(0, Math.min(5, user.followersCount)) : []
    });

  } catch (err) {
    console.error('Error fetching creator followers:', err);
    res.status(500).json({ error: 'Server Error' });
  }
});

app.post('/api/generate', authUser, async (req, res) => {
  req.url = '/api/generation/generate';
  app._router.handle(req, res);
});

// --- Quick Tools Routes ---
app.post('/api/tools/:action', authUser, async (req, res) => {
  try {
    const { action } = req.params; // remove-bg, upscale, face-enhance, compress
    const { imageUrl } = req.body;
    if (!imageUrl) return res.status(400).json({ error: 'Image URL required' });

    const toolCfg = await ToolConfig.findOne();
    const tool = toolCfg?.tools.find(t => t.key === action);
    if (!tool || !tool.isActive) return res.status(400).json({ error: 'Tool not active' });

    const user = await User.findById(req.user.id);
    const cost = tool.cost || 0;
    if (user.points < cost) return res.status(400).json({ error: `Insufficient points (Need ${cost})` });

    // Implementation for Stability AI (Covers RemoveBG, Upscale)
    // For specific tools, add more providers here
    let resultUrl = imageUrl;
    let success = false;

    // Use Tool API Key if set, otherwise active Model key? 
    // Usually tools have dedicated keys in ToolConfig.
    // If not, we might check generic AI Model key if provider matches.
    let apiKey = tool.apiKey;
    if (!apiKey && tool.provider === 'Stability') {
      const activeModel = await AIModel.findOne({ provider: 'Stability' }).select('+apiKey');
      apiKey = activeModel?.apiKey;
    }

    if (tool.provider === 'Stability' || (['remove-bg', 'upscale', 'enhance'].includes(action) && apiKey)) {
      // Fetch source image
      const imgRes = await fetch(imageUrl);
      if (!imgRes.ok) throw new Error('Failed to fetch source image');
      const blob = await imgRes.blob();

      const formData = new FormData();
      formData.append('image', blob);
      formData.append('output_format', 'png');

      let apiPath = '';
      if (action === 'remove-bg') apiPath = 'https://api.stability.ai/v2beta/stable-image/edit/remove-background';
      else if (action === 'upscale') apiPath = 'https://api.stability.ai/v2beta/stable-image/upscale/conservative';
      else if (action === 'face-enhance' || action === 'enhance') apiPath = 'https://api.stability.ai/v2beta/stable-image/upscale/creative'; // Approximation

      if (apiPath) {
        const sRes = await fetch(apiPath, {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}`, Accept: 'image/*' },
          body: formData
        });

        if (sRes.ok) {
          const outBlob = await sRes.blob();
          const buf = await outBlob.arrayBuffer();
          const b64 = Buffer.from(buf).toString('base64');
          resultUrl = `data:image/png;base64,${b64}`;
          success = true;
        } else {
          const errTxt = await sRes.text();
          console.error(`Stability API Error (${action}):`, errTxt);
        }
      }
    } else {
      // Placeholder for System/Mock
      // In real deployment this would use a python service or other API
      // For now, if no provider configured, we return original
      success = true;
    }

    if (success) {
      if (cost > 0) {
        user.points -= cost;
        await user.save();
        await Transaction.create({
          userId: user._id,
          amount: cost,
          type: 'debit',
          description: `Tool used: ${tool.name}`,
          gateway: 'System',
          status: 'success'
        });
      }
      res.json({ result: resultUrl, points: user.points });
    } else {
      res.status(500).json({ error: 'Tool processing failed' });
    }

  } catch (err) {
    console.error("Tool Error:", err);
    res.status(500).json({ error: 'Server Error' });
  }
});


app.get('/api/generation/history', authUser, async (req, res) => {
  const page = parseInt(req.query.page || '1', 10);
  const limit = parseInt(req.query.limit || '20', 10);
  const skip = (page - 1) * limit;
  const list = await Generation.find({ userId: req.user.id }).sort({ createdAt: -1 }).skip(skip).limit(limit);
  res.json({
    generations: list.map(g => ({
      id: String(g._id),
      generatedImage: g.generatedImage,
      visiblePrompt: g.templateName || 'AI Generated Image',
      quality: g.quality,
      aspectRatio: g.aspectRatio,
      pointsSpent: g.pointsSpent,
      createdAt: g.createdAt.toISOString(),
      isFavorite: g.isFavorite,
      downloadCount: g.downloadCount,
      shareCount: g.shareCount
    }))
  });
});

app.get('/api/generation/:id', authUser, async (req, res) => {
  const g = await Generation.findOne({ _id: req.params.id, userId: req.user.id });
  if (!g) return res.status(404).json({ error: 'Not found' });
  res.json({
    id: String(g._id),
    generatedImage: g.generatedImage,
    visiblePrompt: g.templateName || 'AI Generated Image',
    quality: g.quality,
    aspectRatio: g.aspectRatio,
    createdAt: g.createdAt.toISOString(),
    isFavorite: g.isFavorite,
    downloadCount: g.downloadCount,
    shareCount: g.shareCount
  });
});

app.post('/api/generation/:id/download', authUser, async (req, res) => {
  await Generation.findOneAndUpdate(
    { _id: req.params.id, userId: req.user.id },
    { $inc: { downloadCount: 1 } }
  );
  res.json({ success: true });
});

app.post('/api/generation/:id/share', authUser, async (req, res) => {
  await Generation.findOneAndUpdate(
    { _id: req.params.id, userId: req.user.id },
    { $inc: { shareCount: 1 } }
  );
  res.json({ success: true });
});
app.patch('/api/generation/:id/favorite', authUser, async (req, res) => {
  const g = await Generation.findOneAndUpdate({ _id: req.params.id, userId: req.user.id }, { $bit: { isFavorite: { xor: 1 } } }, { new: true });
  if (!g) return res.status(404).json({ error: 'Not found' });
  res.json({ success: true, isFavorite: g.isFavorite });
});

app.delete('/api/generation/:id', authUser, async (req, res) => {
  await Generation.deleteOne({ _id: req.params.id, userId: req.user.id });
  res.json({ success: true });
});

app.get('/api/packages', async (req, res) => {
  try {
    const pkgs = await PointsPackage.find({ isActive: true });
    res.json(pkgs);
  } catch (err) {
    res.status(500).send('Server Error');
  }
});

app.post('/api/auth/admin-login', async (req, res) => {
  const { email, password } = req.body;
  try {
    if (email === process.env.SUPER_ADMIN_ID && password === process.env.SUPER_ADMIN_PASSWORD) {
      const payload = { user: { id: 'super_admin_env', role: 'super_admin' } };
      const token = jwt.sign(payload, process.env.JWT_SECRET || 'RupantarAI_Secure_Secret_2025', { expiresIn: '12h' });
      return res.json({
        success: true, token,
        user: { name: 'Rahul Malik', role: 'super_admin', permissions: ['manage_users', 'manage_creators', 'manage_templates', 'manage_finance', 'manage_ai', 'manage_settings', 'view_reports'] }
      });
    }
    const admin = await Admin.findOne({ email }).select('+password');
    if (!admin || !(await bcrypt.compare(password, admin.password))) return res.status(400).json({ msg: 'Invalid Credentials' });

    admin.lastActive = new Date();
    await admin.save();
    const token = jwt.sign({ user: { id: admin.id, role: admin.role } }, process.env.JWT_SECRET || 'RupantarAI_Secure_Secret_2025', { expiresIn: '12h' });
    res.json({ success: true, token, user: { id: admin.id, name: admin.name, email: admin.email, role: admin.role } });
  } catch (err) {
    res.status(500).json({ msg: 'Server Error' });
  }
});

app.get('/api/admin/creators', authUser, async (req, res) => {
  if (useMemory()) return res.json(memoryCreatorApps);

  try {
    const apps = await CreatorApplication.find().sort({ appliedDate: -1 }).populate('userId');
    const list = apps.map(a => {
      const u = a.userId || {};
      return {
        ...a._doc,
        id: String(a._id),
        followers: u.followersCount || 0,
        likes: u.likesCount || 0,
        uses: u.usesCount || 0,
        points: u.points || 0,
        userEmail: u.email,
        avatar: u.photoURL || ''
      };
    });
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch creators' });
  }
});

app.post('/api/admin/creators', async (req, res) => {
  try {
    const { userId, name, socialLinks = [], status = 'approved' } = req.body;
    const appDoc = await CreatorApplication.create({
      userId,
      name,
      socialLinks,
      status,
      appliedDate: new Date()
    });

    // Auto-update user role if approved
    if (status === 'approved') {
      await User.findByIdAndUpdate(userId, { role: 'creator' });
    }

    const u = await User.findById(userId);

    res.json({
      ...appDoc._doc,
      id: String(appDoc._id),
      userEmail: u ? u.email : '',
      avatar: u ? u.photoURL : ''
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to add creator' });
  }
});

app.patch('/api/admin/creators/:id/status', async (req, res) => {
  const { status } = req.body;
  if (useMemory()) {
    const idx = memoryCreatorApps.findIndex(a => a.id === req.params.id);
    if (idx < 0) return res.status(404).json({ error: 'Not found' });
    memoryCreatorApps[idx].status = status;
    return res.json({ success: true });
  } else {
    const appDoc = await CreatorApplication.findByIdAndUpdate(req.params.id, { status }, { new: true });
    if (!appDoc) return res.status(404).json({ error: 'Not found' });
    return res.json({ success: true, id: String(appDoc._id), status: appDoc.status });
  }
});

// Detailed Creator Profile for Admin
app.get('/api/admin/creators/:id/profile', authUser, async (req, res) => {
  if (useMemory()) {
    return res.json({
      user: {
        id: req.params.id,
        name: 'Mock Creator',
        email: 'creator@example.com',
        role: 'creator',
        points: 500,
        status: 'active',
        joinedDate: new Date(),
        avatar: '',
        followers: 12,
        likes: 45,
        uses: 10,
        isVerified: true
      },
      application: {
        status: 'approved',
        appliedDate: new Date(),
        paymentDetails: { bankName: 'Mock Bank', accountNumber: 'XXXX1234' }
      },
      templates: [],
      earnings: [],
      withdrawals: [],
      activityLogs: [],
      stats: { totalEarnings: 1500, totalLikes: 45, totalUses: 10, totalSaves: 5 },
      growthStats: []
    });
  }

  try {
    const userId = req.params.id;
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const application = await CreatorApplication.findOne({ userId });
    const templates = await Template.find({ creatorId: userId }).sort({ createdAt: -1 });
    const earnings = await CreatorEarning.find({ creatorId: userId }).sort({ date: -1 }).limit(100);
    const withdrawals = await Withdrawal.find({ creatorId: userId }).sort({ requestedAt: -1 });

    const activityLogs = recentLogs.filter(l => l.path.includes(userId) || (l.method === 'POST' && l.path.includes('create')));

    // Calculate Stats
    const totalEarnings = earnings.reduce((sum, e) => sum + e.amount, 0);
    const monthlyEarnings = earnings
      .filter(e => new Date(e.date).getMonth() === new Date().getMonth())
      .reduce((sum, e) => sum + e.amount, 0);

    const totalWithdrawals = withdrawals
      .filter(w => w.status === 'completed')
      .reduce((sum, w) => sum + w.amount, 0);

    // Group earnings by date for growth chart (last 30 days)
    let stats = [];
    if (mongoose.Types.ObjectId.isValid(userId)) {
      stats = await CreatorEarning.aggregate([
        { $match: { creatorId: new mongoose.Types.ObjectId(userId) } },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$date" } },
            amount: { $sum: "$amount" },
            count: { $sum: "$usageCount" }
          }
        },
        { $sort: { _id: 1 } },
        { $limit: 30 }
      ]);
    }

    res.json({
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        points: user.points,
        status: user.status,
        joinedDate: user.joinedDate,
        avatar: user.photoURL,
        followers: user.followersCount || 0,
        likes: user.likesCount || 0,
        uses: user.usesCount || 0,
        isVerified: user.isVerified || false,
        isWalletFrozen: user.isWalletFrozen || false
      },
      application: application ? {
        ...application._doc,
        paymentDetails: application.paymentDetails || {}
      } : null,
      templates,
      earnings: earnings.slice(0, 100),
      withdrawals,
      activityLogs: activityLogs.slice(0, 20),
      stats: {
        totalEarnings,
        totalLikes: user.likesCount || 0,
        totalUses: user.usesCount || 0,
        totalSaves: templates.reduce((sum, t) => sum + (t.savesCount || 0), 0)
      },
      growthStats: stats.map(s => ({
        date: s._id,
        earnings: s.amount
      }))
    });
  } catch (err) {
    console.error('Creator Profile Error:', err);
    res.status(500).json({ error: 'Failed to fetch creator profile' });
  }
});

app.get('/api/admin/categories', async (req, res) => {
  const list = useMemory()
    ? memoryCategories
    : (await Category.find()).map(c => ({ ...c._doc, id: c._id }));
  res.json(list);
});
app.post('/api/admin/categories', async (req, res) => {
  if (useMemory()) {
    const doc = { id: String(Date.now()), name: String(req.body.name || '').trim(), subCategories: Array.isArray(req.body.subCategories) ? req.body.subCategories.filter(Boolean) : [] };
    memoryCategories.push(doc);
    return res.json(doc);
  } else {
    const c = await Category.create({ name: req.body.name, subCategories: req.body.subCategories || [] });
    return res.json({ ...c._doc, id: c._id });
  }
});

// Admin panel uses PUT for category updates
app.put('/api/admin/categories/:id', async (req, res) => {
  if (useMemory()) {
    const idx = memoryCategories.findIndex(c => c.id === req.params.id);
    if (idx < 0) return res.status(404).json({ error: 'Not found' });
    if (req.body.name !== undefined) memoryCategories[idx].name = String(req.body.name).trim();
    if (req.body.subCategories !== undefined) {
      memoryCategories[idx].subCategories = Array.isArray(req.body.subCategories) ? req.body.subCategories.filter(Boolean) : [];
    }
    return res.json(memoryCategories[idx]);
  }

  const updated = await Category.findByIdAndUpdate(req.params.id, req.body, { new: true });
  if (!updated) return res.status(404).json({ error: 'Not found' });
  return res.json({ ...updated._doc, id: updated._id });
});

app.delete('/api/admin/categories/:id', async (req, res) => {
  if (useMemory()) {
    const idx = memoryCategories.findIndex(c => c.id === req.params.id);
    if (idx >= 0) memoryCategories.splice(idx, 1);
    return res.json({ success: true });
  } else {
    await Category.findByIdAndDelete(req.params.id);
    return res.json({ success: true });
  }
});
app.get('/api/admin/templates/categories', async (req, res) => {
  const list = useMemory()
    ? memoryCategories
    : (await Category.find()).map(c => ({ ...c._doc, id: c._id }));
  res.json(list);
});

app.get('/api/admin/templates', async (req, res) => {
  const list = await Template.find().sort({ useCount: -1 });
  res.json(list.map(t => ({ ...t._doc, id: t._id })));
});
app.post('/api/admin/templates', async (req, res) => {
  try {
    // ADMIN templates are auto-approved
    const templateData = {
      ...req.body,
      type: 'Official',
      source: 'admin',
      isOfficial: true,
      approvalStatus: 'approved', // Auto-approve admin templates
      approvedAt: new Date(),
      isPaused: false
    };
    const t = await Template.create(templateData);
    res.json({ ...t._doc, id: t._id });
  } catch (e) {
    res.status(500).json({ error: 'Failed to create template', message: e.message });
  }
});
app.patch('/api/admin/templates/:id', async (req, res) => {
  try {
    const existing = await Template.findById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Not found' });
    
    // If editing an approved template, reset to pending (unless it's admin template)
    const updates = { ...req.body };
    if (existing.approvalStatus === 'approved' && existing.source === 'creator') {
      updates.approvalStatus = 'pending';
      updates.approvedAt = null;
    }
    
    const t = await Template.findByIdAndUpdate(req.params.id, updates, { new: true });
    res.json({ ...t._doc, id: t._id });
  } catch (e) {
    res.status(500).json({ error: 'Failed to update template', message: e.message });
  }
});

// Admin panel uses PUT for template updates
app.put('/api/admin/templates/:id', async (req, res) => {
  try {
    const existing = await Template.findById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Not found' });
    
    // If editing an approved template, reset to pending (unless it's admin template)
    const updates = { ...req.body };
    if (existing.approvalStatus === 'approved' && existing.source === 'creator') {
      updates.approvalStatus = 'pending';
      updates.approvedAt = null;
    }
    
    const t = await Template.findByIdAndUpdate(req.params.id, updates, { new: true });
    res.json({ ...t._doc, id: t._id });
  } catch (e) {
    res.status(500).json({ error: 'Failed to update template', message: e.message });
  }
});

// Bulk update helper used by the Admin UI
app.put('/api/admin/templates/bulk-update', async (req, res) => {
  const ids = Array.isArray(req.body.ids) ? req.body.ids : [];
  const updates = req.body.updates || {};
  if (!ids.length) return res.json({ success: true, modifiedCount: 0 });
  const result = await Template.updateMany({ _id: { $in: ids } }, updates);
  res.json({ success: true, modifiedCount: result.modifiedCount ?? 0 });
});

app.delete('/api/admin/templates/:id', async (req, res) => {
  await Template.findByIdAndDelete(req.params.id);
  res.json({ success: true });
});

// ============================================
// ADMIN TEMPLATE APPROVAL ENDPOINTS
// ============================================

// Get all pending templates for admin review
app.get('/api/admin/templates/pending', async (req, res) => {
  try {
    const pendingTemplates = await Template.find({ approvalStatus: 'pending' })
      .populate('creatorId', 'name username email photoURL isVerified')
      .sort({ submittedAt: -1 })
      .limit(100);

    const templates = pendingTemplates.map(t => ({
      ...t.toObject(),
      id: t._id,
      creatorName: t.creatorId?.name || t.creatorId?.username || 'Unknown',
      creatorAvatar: t.creatorId?.photoURL || '',
      creatorVerified: t.creatorId?.isVerified || false
    }));

    res.json({ templates, count: templates.length });
  } catch (e) {
    console.error('Failed to fetch pending templates:', e);
    res.status(500).json({ error: 'Failed to fetch pending templates' });
  }
});

// Approve a template
app.post('/api/admin/templates/:id/approve', async (req, res) => {
  try {
    const template = await Template.findByIdAndUpdate(
      req.params.id,
      {
        approvalStatus: 'approved',
        approvedAt: new Date(),
        status: 'active', // Make it active
        isPaused: false, // Unpause it
        approvedBy: req.user?._id || null
      },
      { new: true }
    );

    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    console.log(`✅ Template approved: ${template.title}`);

    res.json({ 
      success: true, 
      message: 'Template approved successfully',
      template 
    });
  } catch (e) {
    console.error('Failed to approve template:', e);
    res.status(500).json({ error: 'Failed to approve template' });
  }
});

// Reject a template
app.post('/api/admin/templates/:id/reject', async (req, res) => {
  try {
    const { reason } = req.body;
    if (!reason || !reason.trim()) {
      return res.status(400).json({ error: 'Rejection reason is required' });
    }

    const template = await Template.findByIdAndUpdate(
      req.params.id,
      {
        approvalStatus: 'rejected',
        rejectionReason: reason.trim(),
        rejectedAt: new Date(),
        isPaused: true // Pause rejected templates
      },
      { new: true }
    );

    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    console.log(`❌ Template rejected: ${template.title} - Reason: ${reason}`);

    res.json({ 
      success: true, 
      message: 'Template rejected',
      template 
    });
  } catch (e) {
    console.error('Failed to reject template:', e);
    res.status(500).json({ error: 'Failed to reject template' });
  }
});

// Toggle template pause status (only for approved templates)
app.post('/api/admin/templates/:id/toggle-pause', async (req, res) => {
  try {
    const template = await Template.findById(req.params.id);
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    // Only allow pausing approved templates
    if (template.approvalStatus !== 'approved') {
      return res.status(400).json({ error: 'Can only pause approved templates' });
    }

    template.isPaused = !template.isPaused;
    await template.save();

    res.json({ 
      success: true, 
      isPaused: template.isPaused,
      message: template.isPaused ? 'Template paused' : 'Template resumed'
    });
  } catch (e) {
    console.error('Failed to toggle pause status:', e);
    res.status(500).json({ error: 'Failed to toggle pause status' });
  }
});

app.get('/api/templates', async (req, res) => {
  try {
    const { category, subCategory, gender, state, ageGroup, isPremium, sort, search, tags, page, limit } = req.query;

    // CRITICAL SECURITY: Only show approved and non-paused templates to users
    const query = {
      status: 'active',
      approvalStatus: 'approved',
      isPaused: false
    };

    // 1. Filters
    if (category && category !== 'All') query.category = category;
    if (subCategory) query.subCategory = subCategory;
    if (gender && gender !== 'All') {
      query.gender = Array.isArray(gender) ? { $in: gender } : gender;
    }
    // For state, support checking "India" or specific states if implemented
    if (state && state !== 'All') {
      query.state = Array.isArray(state) ? { $in: state } : state;
    }
    if (ageGroup && ageGroup !== 'All') {
      query.ageGroup = Array.isArray(ageGroup) ? { $in: ageGroup } : ageGroup;
    }

    // Premium Filter
    if (isPremium === 'true') query.isPremium = true;
    else if (isPremium === 'false') query.isPremium = false;

    // Search Filter
    if (search) {
      const re = new RegExp(String(search).trim(), 'i');
      query.$or = [
        { title: re },
        { description: re },
        { category: re },
        { tags: { $in: [re] } }
      ];
    }

    // Tags Filter (Comma separated)
    if (tags) {
      const tagList = tags.split(',').map(t => t.trim()).filter(Boolean);
      if (tagList.length > 0) {
        query.tags = { $in: tagList };
      }
    }

    // 2. Sorting
    let sortOption = { useCount: -1 }; // Default: Trending
    if (sort === 'Latest') sortOption = { createdAt: -1 };
    else if (sort === 'Oldest') sortOption = { createdAt: 1 };
    else if (sort === 'Popular' || sort === 'Top Rated') sortOption = { likeCount: -1 };
    else if (sort === 'Trending') sortOption = { useCount: -1 };

    // 3. Pagination
    const pageNum = parseInt(page || '1');
    const limitNum = parseInt(limit || '50');
    const skip = (pageNum - 1) * limitNum;

    const list = await Template.find(query)
      .populate('creatorId', 'name username email photoURL isVerified')
      .sort(sortOption)
      .skip(skip)
      .limit(limitNum);

    // Map and include creator info
    const templatesWithCreator = list.map(t => {
      const template = t.toObject();
      return {
        ...template,
        id: t._id,
        creatorName: t.creatorId?.name || t.creatorId?.username || t.creatorId?.email?.split('@')[0] || 'Creator',
        creatorAvatar: t.creatorId?.photoURL || '',
        creatorVerified: t.creatorId?.isVerified || false
      };
    });

    // Return mapped result
    res.json(templatesWithCreator);

  } catch (e) {
    console.error("Template Fetch Error:", e);
    res.status(500).json({ error: 'Failed to fetch templates' });
  }
});
app.get('/api/templates/:id', async (req, res) => {
  try {
    const t = await Template.findById(req.params.id)
      .populate('creatorId', 'name username email photoURL isVerified');
    if (!t) return res.status(404).json({ error: 'Not found' });

    // CRITICAL: Only show approved + live templates to users
    if (t.approvalStatus !== 'approved' || t.isPaused) {
      return res.status(404).json({ error: 'Template not available' });
    }

    const template = {
      ...t.toObject(),
      id: t._id,
      creatorName: t.creatorId?.name || t.creatorId?.username || t.creatorId?.email?.split('@')[0] || 'Creator',
      creatorAvatar: t.creatorId?.photoURL || '',
      creatorVerified: t.creatorId?.isVerified || false
    };

    res.json(template);

  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch template' });
  }
});
app.get('/api/templates/search', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    if (!q) return res.json([]);
    const re = new RegExp(q, 'i');
    // CRITICAL: Only search approved + live templates
    const list = await Template.find({ 
      $or: [{ title: re }, { prompt: re }, { description: re }],
      approvalStatus: 'approved',
      isPaused: false
    }).limit(50);
    res.json(list.map(t => ({ ...t._doc, id: t._id })));
  } catch (e) {
    res.status(500).json({ error: 'Search failed' });
  }
});

app.post('/api/templates/:id/view', async (req, res) => {
  try {
    await Template.findByIdAndUpdate(req.params.id, { $inc: { viewCount: 1 } });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Error' });
  }
});

app.post('/api/templates/:id/like', authUser, async (req, res) => {
  try {
    const template = await Template.findByIdAndUpdate(req.params.id, { $inc: { likeCount: 1 } }, { new: true });
    if (template && template.creatorId) {
      await User.findByIdAndUpdate(template.creatorId, { $inc: { likesCount: 1 } });
    }
    res.json({ success: true, likes: template ? template.likeCount : 0 });
  } catch (e) {
    res.status(500).json({ error: 'Error' });
  }
});

app.post('/api/user/follow/:id', authUser, async (req, res) => {
  try {
    const targetId = req.params.id;
    if (targetId === req.user.id) return res.status(400).json({ msg: 'Cannot follow self' });

    await User.findByIdAndUpdate(targetId, { $inc: { followersCount: 1 } });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Error' });
  }
});
const cloudinary = require('cloudinary').v2;

// ... existing code ...

// Upload demo image for template preview (Admin) - Uses Cloudinary Account 2
const upload = multer({ storage: multer.memoryStorage() });
app.post('/api/admin/upload/template-demo', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file' });

    // Configure Cloudinary for Account 2 (Creator Demo Images)
    cloudinary.config({
      cloud_name: 'dmbrs338o',
      api_key: '943571584978134',
      api_secret: 'xLvXUL573laZHjFTwbpZboBBhNA'
    });

    // Use upload_stream for memory buffer
    const stream = cloudinary.uploader.upload_stream(
      { folder: 'template_demos', resource_type: 'image' },
      (error, result) => {
        if (error) {
          console.error('Cloudinary Upload Error:', error);
          return res.status(500).json({ error: 'Upload failed' });
        }
        res.json({ url: result.secure_url });
      }
    );

    // Create stream from buffer
    const { Readable } = require('stream');
    const bufferStream = new Readable();
    bufferStream.push(req.file.buffer);
    bufferStream.push(null);
    bufferStream.pipe(stream);

  } catch (e) {
    console.error("Upload Endpoint Error:", e);
    res.status(500).json({ error: 'Server Error during upload' });
  }
});

// System metrics for Admin dashboard
app.get('/api/admin/metrics', async (req, res) => {
  try {
    const users = await User.countDocuments();
    const templates = await Template.countDocuments();
    res.json({
      cpu: 12,
      memory: 45,
      requests: 1450,
      latency: 120,
      activeUsers: users,
      revenue: 45600,
      templates
    });
  } catch {
    res.json({
      cpu: 12,
      memory: 45,
      requests: 1450,
      latency: 120,
      activeUsers: 842,
      revenue: 45600
    });
  }
});

// Admin Users management
app.get('/api/admin/users', async (req, res) => {
  const list = await User.find().sort({ joinedDate: -1 });
  res.json(list.map(u => ({
    id: u._id,
    name: u.name,
    email: u.email,
    role: u.role,
    points: u.points,
    status: u.status,
    joinedDate: u.joinedDate,
    avatar: u.photoURL || '',
    followersCount: u.followersCount || 0,
    likesCount: u.likesCount || 0,
    usesCount: u.usesCount || 0,
    followers: u.followersCount || 0,
    likes: u.likesCount || 0,
    uses: u.usesCount || 0
  })));
});
app.post('/api/admin/users', async (req, res) => {
  const { name, email, password, role = 'user', points = 0, status = 'active' } = req.body || {};
  const hashed = password ? await bcrypt.hash(password, 10) : undefined;
  const u = await User.create({ name, email, password: hashed, role, points, status });
  res.json({
    id: u._id,
    name: u.name,
    email: u.email,
    role: u.role,
    points: u.points,
    status: u.status,
    joinedDate: u.joinedDate,
    avatar: ''
  });
});
app.put('/api/admin/users/:id', async (req, res) => {
  const u = await User.findByIdAndUpdate(req.params.id, req.body, { new: true });
  if (!u) return res.status(404).json({ error: 'Not found' });
  res.json({
    id: u._id,
    name: u.name,
    email: u.email,
    role: u.role,
    points: u.points,
    status: u.status,
    joinedDate: u.joinedDate,
    avatar: u.photoURL || '',
    isVerified: u.isVerified || false,
    isWalletFrozen: u.isWalletFrozen || false
  });
});

app.post('/api/admin/users/:id/login-as', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const payload = { user: { id: user.id, role: user.role } };
    const token = jwt.sign(payload, process.env.JWT_SECRET || 'RupantarAI_Secure_Secret_2025', { expiresIn: '7d' });

    res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/notifications/send-to/:id', async (req, res) => {
  try {
    const { title, message, type = 'info' } = req.body;
    await CreatorNotification.create({
      creatorId: req.params.id,
      title,
      message,
      type,
      read: false,
      date: new Date()
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.put('/api/admin/users/:id/status', async (req, res) => {
  const u = await User.findByIdAndUpdate(req.params.id, { status: req.body.status }, { new: true });
  if (!u) return res.status(404).json({ error: 'Not found' });
  res.json({ success: true });
});
app.post('/api/admin/users/:id/temp-password', async (req, res) => {
  const hashed = await bcrypt.hash(String(req.body.tempPassword || ''), 10);
  await User.findByIdAndUpdate(req.params.id, { password: hashed });
  res.json({ success: true });
});
app.put('/api/admin/users/bulk', async (req, res) => {
  const { userIds = [], updates = {} } = req.body || {};
  await User.updateMany({ _id: { $in: userIds } }, updates);
  res.json({ success: true });
});

// Admin profile (used by Admin panel settings). This backend currently has no multi-admin profile
// management; keep a safe stub to avoid 404s.
app.put('/api/admin/profile', async (_req, res) => {
  res.json({ success: true });
});

// Admin - Finance
app.get('/api/admin/finance/transactions', async (req, res) => {
  try {
    const page = parseInt(req.query.page || '1', 10);
    const limit = parseInt(req.query.limit || '50', 10);
    const skip = (page - 1) * limit;
    const list = await Transaction.find().sort({ date: -1 }).skip(skip).limit(limit);
    res.json(list.map(t => ({ ...t._doc, id: String(t._id) })));
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
});

app.get('/api/admin/finance/packages', async (_req, res) => {
  const list = await PointsPackage.find().sort({ isPopular: -1, price: 1 });
  res.json(list.map(p => ({ ...p._doc, id: String(p._id) })));
});
app.post('/api/admin/finance/packages', authUser, async (req, res) => {
  try {
    const doc = await PointsPackage.create(req.body);
    res.json({ ...doc._doc, id: String(doc._id) });
  } catch (e) {
    res.status(500).json({ error: 'Failed to create package', message: e.message });
  }
});
app.put('/api/admin/finance/packages/:id', authUser, async (req, res) => {
  try {
    const doc = await PointsPackage.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!doc) return res.status(404).json({ error: 'Not found' });
    res.json({ ...doc._doc, id: String(doc._id) });
  } catch (e) {
    res.status(500).json({ error: 'Failed to update package', message: e.message });
  }
});
app.delete('/api/admin/finance/packages/:id', authUser, async (req, res) => {
  try {
    const doc = await PointsPackage.findByIdAndDelete(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Package not found' });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Failed to delete package', message: e.message });
  }
});

app.get('/api/admin/finance/gateways', async (_req, res) => {
  const list = await PaymentGateway.find().sort({ name: 1 });
  res.json(list.map(g => ({ ...g._doc, id: String(g._id) })));
});

// Admin - Tools configuration
app.get('/api/admin/tools/config', async (_req, res) => {
  const cfg = await ToolConfig.findOne() || await ToolConfig.create({
    tools: [
      { key: 'remove-bg', name: 'BG Remove', cost: 0, isActive: true },
      { key: 'enhance', name: 'Enhance', cost: 5, isActive: true },
      { key: 'face-enhance', name: 'Face Fix', cost: 8, isActive: true },
      { key: 'upscale', name: 'Upscale', cost: 10, isActive: true },
      { key: 'colorize', name: 'Colorize', cost: 10, isActive: true },
      { key: 'style', name: 'Style', cost: 8, isActive: true }
    ]
  });
  res.json({ ...cfg._doc, id: String(cfg._id) });
});
app.put('/api/admin/tools/config', async (req, res) => {
  const tools = Array.isArray(req.body.tools) ? req.body.tools : [];
  const existing = await ToolConfig.findOne();
  const cfg = existing
    ? await ToolConfig.findByIdAndUpdate(existing._id, { tools, updatedAt: new Date() }, { new: true })
    : await ToolConfig.create({ tools });
  res.json({ ...cfg._doc, id: String(cfg._id) });
});

// ==================== AI MODEL MANAGEMENT ENDPOINTS ====================

// Get all AI models
app.get(['/api/admin/ai-models', '/api/admin/config/ai'], async (req, res) => {
  try {
    const models = await AIModel.find({}).select('+config.apiKey +apiKey');
    // Map response to handle legacy schema props if needed
    res.json(models.map(m => ({
      ...m._doc,
      id: m._id,
      apiKey: m.config?.apiKey || m.apiKey,
      isActive: m.active || m.isActive
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch AI models' });
  }
});

// Get single AI model
app.get(['/api/admin/ai-models/:key', '/api/admin/config/ai/:key'], async (req, res) => {
  try {
    let model = await AIModel.findOne({ key: req.params.key }).select('+config.apiKey +apiKey');
    if (!model) {
      try { model = await AIModel.findById(req.params.key).select('+config.apiKey +apiKey'); } catch (e) { }
    }
    if (!model) return res.status(404).json({ error: 'Model not found' });

    res.json({
      ...model._doc,
      id: model._id,
      apiKey: model.config?.apiKey || model.apiKey,
      isActive: model.active || model.isActive
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch AI model' });
  }
});

// Create new AI model
app.post(['/api/admin/ai-models', '/api/admin/config/ai'], async (req, res) => {
  try {
    const { name, provider, costPerImage, key, config } = req.body;
    if (!name || !provider) return res.status(400).json({ error: 'Name and Provider are required' });

    const modelKey = key || name.toLowerCase().replace(/\s+/g, '-');
    const existing = await AIModel.findOne({ key: modelKey });
    if (existing) return res.status(400).json({ error: 'Model with this key/name already exists' });

    const newModel = await AIModel.create({
      key: modelKey,
      name,
      provider,
      costPerImage: costPerImage || 1,
      active: false,
      isActive: false,
      config: config || { apiKey: req.body.apiKey } // Handle nested or flat apiKey
    });
    res.status(201).json({ ...newModel._doc, id: newModel._id, success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Update AI Model (Combined: Cost, API Key, Details, Status)
app.put(['/api/admin/ai-models/:key', '/api/admin/config/ai/:key', '/api/admin/config/ai/:key/cost', '/api/admin/config/ai/:key/apikey', '/api/admin/config/ai/:key/details'], async (req, res) => {
  try {
    let model = await AIModel.findOne({ key: req.params.key });
    if (!model) {
      try { model = await AIModel.findById(req.params.key); } catch (e) { }
    }
    if (!model) return res.status(404).json({ error: 'Model not found' });

    // Update fields
    if (req.body.cost !== undefined) model.costPerImage = req.body.cost;
    if (req.body.costPerImage !== undefined) model.costPerImage = req.body.costPerImage;

    // Handle API Key update
    if (req.body.apiKey || req.body.config?.apiKey) {
      const newCtxKey = req.body.apiKey || req.body.config.apiKey;
      // Direct DB update to bypass Mongoose tracking issues
      await AIModel.updateOne(
        { _id: model._id },
        { $set: { "config.apiKey": newCtxKey } }
      );
      // Update local instance
      if (!model.config) model.config = {};
      model.config.apiKey = newCtxKey;
    }

    // Handle Model ID / Config update (Support for Admin Panel "Add Model" feature)
    if (req.body.config?.model || req.body.modelId) {
      const newModelId = req.body.config?.model || req.body.modelId;
      await AIModel.updateOne(
        { _id: model._id },
        { $set: { "config.model": newModelId } }
      );
      if (!model.config) model.config = {};
      model.config.model = newModelId;
    }

    if (req.body.active !== undefined) { model.active = req.body.active; model.isActive = req.body.active; }
    if (req.body.isActive !== undefined) { model.isActive = req.body.isActive; model.active = req.body.isActive; }

    await model.save();
    res.json({ success: true, ...model._doc, id: model._id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Activate AI Model
app.post(['/api/admin/ai-models/:key/activate', '/api/admin/config/ai/:key/activate'], async (req, res) => {
  try {
    const key = req.params.key;
    let model = await AIModel.findOne({ key });

    if (!model && mongoose.Types.ObjectId.isValid(key)) {
      model = await AIModel.findById(key);
    }

    if (!model) {
      return res.status(404).json({ error: 'AI Model not found' });
    }

    // 1. Deactivate all OTHERS explicitly (Safety against Hook failure or Race)
    await AIModel.updateMany({ _id: { $ne: model._id } }, { active: false, isActive: false });

    // 2. Activate this model
    model.active = true;
    model.isActive = true;
    await model.save();

    res.json({ success: true, model: { id: model._id, active: true } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Delete AI Model
app.delete(['/api/admin/ai-models/:key', '/api/admin/config/ai/:key'], async (req, res) => {
  try {
    let model = await AIModel.findOne({ key: req.params.key });
    if (!model) { try { model = await AIModel.findById(req.params.key); } catch (e) { } }

    if (!model) return res.status(404).json({ error: 'Not found' });
    if (model.active || model.isActive) return res.status(400).json({ error: 'Cannot delete active model' });

    await AIModel.deleteOne({ _id: model._id });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Test AI Model Connection
app.get(['/api/admin/ai-models/:key/test', '/api/admin/config/ai/:key/test'], async (req, res) => {
  try {
    let model = await AIModel.findOne({ key: req.params.key }).select('+config.apiKey +apiKey');
    if (!model) { try { model = await AIModel.findById(req.params.key).select('+config.apiKey +apiKey'); } catch (e) { } }

    if (!model) return res.status(404).json({ error: 'Model not found' });

    const apiKey = model.config?.apiKey || model.apiKey;
    if (!apiKey) return res.status(400).json({ error: 'No API Key configured' });

    const provider = (model.provider || '').toLowerCase();

    if (provider.includes('minimax')) {
      const resp = await fetch('https://api.minimax.io/v1/image_generation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({ prompt: "test", model: "image-01" })
      });
      if (!resp.ok) {
        const txt = await resp.text();
        return res.status(400).json({ error: `MiniMax Error: ${txt}` });
      }
    } else if (provider.includes('stability')) {
      const resp = await fetch('https://api.stability.ai/v1/user/account', {
        headers: { 'Authorization': `Bearer ${apiKey}` }
      });
      if (!resp.ok) {
        const txt = await resp.text();
        return res.status(400).json({ error: `Stability Error: ${txt}` });
      }
    } else if (provider.includes('openai')) {
      const resp = await fetch('https://api.openai.com/v1/models', {
        headers: { 'Authorization': `Bearer ${apiKey}` }
      });
      if (!resp.ok) {
        const txt = await resp.text();
        return res.status(400).json({ error: `OpenAI Error: ${txt}` });
      }
    }

    res.json({ success: true, message: 'Connection successful' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/admin/config/ai/cache', async (req, res) => {
  res.json({ success: true });
});

// --- Admin System Metrics ---
app.get('/api/admin/metrics', async (req, res) => {
  try {
    const activeUsers = await User.countDocuments({ status: 'active' });

    // Revenue Calculation (Approximate based on credit transactions)
    // We assume non-system, non-ad credits are purchases
    const revenueAgg = await Transaction.aggregate([
      {
        $match: {
          type: 'credit',
          status: 'success',
          gateway: { $nin: ['System', 'ads', 'System (Refund)'] }
        }
      },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);

    // Convert points to estimated rupees (Assuming 1 Rupee = 5 Points as per default config, or fetch config)
    const finConfig = await FinanceConfig.findOne();
    const conversionRate = finConfig?.pointsPerRupee || 5;
    const totalPointsSold = revenueAgg[0]?.total || 0;
    const estRevenue = Math.round(totalPointsSold / conversionRate);

    // Latency Calculation
    const avgLatency = recentLogs.length > 0
      ? Math.round(recentLogs.reduce((acc, log) => acc + log.ms, 0) / recentLogs.length)
      : 0;

    res.json({
      cpu: 0, // Not easily available in node without headers
      memory: Math.round(process.memoryUsage().heapUsed / 1024 / 1024), // MB
      requests: globalRequestCount,
      latency: avgLatency,
      activeUsers,
      revenue: estRevenue
    });
  } catch (e) {
    console.error('Metrics Error:', e);
    // Return zeroed metrics on error instead of 500 to keep dashboard alive
    res.json({ cpu: 0, memory: 0, requests: 0, latency: 0, activeUsers: 0, revenue: 0 });
  }
});

app.get('/api/admin/system/admins', async (req, res) => {
  const admins = await Admin.find();
  res.json(admins.map(a => ({ ...a._doc, id: a._id })));
});
app.post('/api/admin/system/admins', async (req, res) => {
  const hashedPassword = await bcrypt.hash(req.body.password, 10);
  const admin = await Admin.create({ ...req.body, password: hashedPassword });
  res.json({ ...admin._doc, id: admin._id });
});
app.delete('/api/admin/system/admins/:id', async (req, res) => {
  await Admin.findByIdAndDelete(req.params.id);
  res.json({ success: true });
});

// ====================================
// ADMIN WITHDRAWAL MANAGEMENT APIs
// ====================================

// Get all withdrawals (for admin)
app.get('/api/admin/withdrawals', async (req, res) => {
  try {
    const { status, page = 1, limit = 50 } = req.query;

    const query = {};
    if (status) query.status = status;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const withdrawals = await Withdrawal.find(query)
      .sort({ requestedAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('creatorId', 'name email');

    const total = await Withdrawal.countDocuments(query);

    res.json(withdrawals.map(w => ({
      id: String(w._id),
      creatorId: w.creatorId ? String(w.creatorId._id) : null,
      creatorName: w.creatorId?.name || 'Unknown',
      creatorEmail: w.creatorId?.email || '',
      amount: w.amount,
      method: w.method,
      status: w.status,
      bankDetails: w.method === 'bank' ? {
        bankName: w.bankDetails?.bankName,
        accountNumber: w.bankDetails?.accountNumber,
        ifscCode: w.bankDetails?.ifscCode,
        accountHolderName: w.bankDetails?.accountHolderName
      } : undefined,
      upiId: w.method === 'upi' ? w.upiId : undefined,
      requestedAt: w.requestedAt,
      processedAt: w.processedAt,
      transactionId: w.transactionId,
      remarks: w.remarks,
      total,
      page: parseInt(page),
      totalPages: Math.ceil(total / parseInt(limit))
    })));
  } catch (e) {
    console.error('Admin Withdrawals Error:', e);
    res.status(500).json({ error: 'Failed to fetch withdrawals' });
  }
});

// Get withdrawal stats for admin
app.get('/api/admin/withdrawals/stats', async (req, res) => {
  try {
    const pending = await Withdrawal.countDocuments({ status: 'pending' });
    const processing = await Withdrawal.countDocuments({ status: 'processing' });
    const completed = await Withdrawal.countDocuments({ status: 'completed' });
    const rejected = await Withdrawal.countDocuments({ status: 'rejected' });

    const pendingAmount = await Withdrawal.aggregate([
      { $match: { status: { $in: ['pending', 'processing'] } } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);

    const completedAmount = await Withdrawal.aggregate([
      { $match: { status: 'completed' } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);

    res.json({
      pending,
      processing,
      completed,
      rejected,
      pendingAmount: pendingAmount[0]?.total || 0,
      completedAmount: completedAmount[0]?.total || 0
    });
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch withdrawal stats' });
  }
});

// Process withdrawal (set to processing)
app.post('/api/admin/withdrawals/:id/process', async (req, res) => {
  try {
    const withdrawal = await Withdrawal.findByIdAndUpdate(
      req.params.id,
      { status: 'processing' },
      { new: true }
    );

    if (!withdrawal) {
      return res.status(404).json({ error: 'Withdrawal not found' });
    }

    // Notify creator
    await CreatorNotification.create({
      creatorId: withdrawal.creatorId,
      type: 'withdrawal',
      title: 'Withdrawal Processing',
      message: `Your withdrawal request of $${withdrawal.amount.toFixed(2)} is now being processed.`,
      relatedId: withdrawal._id
    });

    res.json({ success: true, status: withdrawal.status });
  } catch (e) {
    res.status(500).json({ error: 'Failed to process withdrawal' });
  }
});

// Approve withdrawal
app.post('/api/admin/withdrawals/:id/approve', async (req, res) => {
  try {
    const { transactionId } = req.body;

    const withdrawal = await Withdrawal.findByIdAndUpdate(
      req.params.id,
      {
        status: 'completed',
        processedAt: new Date(),
        transactionId: transactionId || `TXN${Date.now()}`
      },
      { new: true }
    );

    if (!withdrawal) {
      return res.status(404).json({ error: 'Withdrawal not found' });
    }

    // Notify creator
    await CreatorNotification.create({
      creatorId: withdrawal.creatorId,
      type: 'payment',
      title: 'Withdrawal Completed',
      message: `Your withdrawal of $${withdrawal.amount.toFixed(2)} has been successfully processed. Transaction ID: ${withdrawal.transactionId}`,
      relatedId: withdrawal._id
    });

    res.json({ success: true, status: withdrawal.status });
  } catch (e) {
    res.status(500).json({ error: 'Failed to approve withdrawal' });
  }
});

// Reject withdrawal
app.post('/api/admin/withdrawals/:id/reject', async (req, res) => {
  try {
    const { reason } = req.body;

    const withdrawal = await Withdrawal.findByIdAndUpdate(
      req.params.id,
      {
        status: 'rejected',
        processedAt: new Date(),
        remarks: reason || 'Rejected by admin'
      },
      { new: true }
    );

    if (!withdrawal) {
      return res.status(404).json({ error: 'Withdrawal not found' });
    }

    // Notify creator
    await CreatorNotification.create({
      creatorId: withdrawal.creatorId,
      type: 'withdrawal',
      title: 'Withdrawal Rejected',
      message: `Your withdrawal request of $${withdrawal.amount.toFixed(2)} was rejected. Reason: ${reason || 'Rejected by admin'}. The amount has been returned to your available balance.`,
      relatedId: withdrawal._id
    });

    res.json({ success: true, status: withdrawal.status });
  } catch (e) {
    res.status(500).json({ error: 'Failed to reject withdrawal' });
  }
});

// --- Admin Finance Management ---

app.get('/api/admin/finance/config', async (_req, res) => {
  const doc = await FinanceConfig.findOne() || await FinanceConfig.create({});
  res.json({ ...doc._doc, id: String(doc._id) });
});
app.put('/api/admin/finance/config', async (req, res) => {
  const existing = await FinanceConfig.findOne();
  const doc = existing
    ? await FinanceConfig.findByIdAndUpdate(existing._id, req.body, { new: true })
    : await FinanceConfig.create(req.body);
  res.json({ ...doc._doc, id: String(doc._id) });
});
// AI Guard Rules Framework
app.get('/api/admin/guard-rules', async (req, res) => {
  try {
    const rules = await GenerationGuardRule.find().sort({ priority: 1 });
    res.json(rules);
  } catch (e) { res.status(500).json({ error: "Failed to fetch rules" }); }
});

app.post('/api/admin/guard-rules', async (req, res) => {
  try {
    const count = await GenerationGuardRule.countDocuments();
    const rule = await GenerationGuardRule.create({ ...req.body, priority: req.body.priority ?? count });
    res.json(rule);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/admin/guard-rules/:id', async (req, res) => {
  try {
    const rule = await GenerationGuardRule.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json(rule);
  } catch (e) { res.status(500).json({ error: "Failed to update rule" }); }
});

app.delete('/api/admin/guard-rules/:id', async (req, res) => {
  try {
    await GenerationGuardRule.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: "Failed to delete rule" }); }
});

app.post('/api/admin/guard-rules/seed', async (req, res) => {
  // Reset/Seed Default Rules
  try {
    await GenerationGuardRule.deleteMany({});
    const defaults = [
      {
        ruleName: "Face Preservation Protocol",
        ruleType: "face_preserve",
        enabled: true,
        priority: 1,
        hiddenPrompt: "Always preserve the same facial identity as the reference image. Do not change face shape, eyes, nose, jawline, skin tone, age, or ethnicity. The generated image must represent the exact same person. No face swapping or identity drift.",
        applyTo: ["image_to_image"]
      },
      {
        ruleName: "Global Safety (NSFW Block)",
        ruleType: "safety_nsfw",
        enabled: true,
        priority: 0,
        hiddenPrompt: "Do not generate nudity, sexual content, explicit poses, exposed private parts, pornographic or adult material. Clothing must be appropriate.",
        applyTo: ["image", "image_to_image", "text_to_image"]
      },
      {
        ruleName: "Global Negative Prompt",
        ruleType: "negative_prompt",
        enabled: true,
        priority: 2,
        hiddenPrompt: "face swap, different person, distorted face, deformed anatomy, extra limbs, blurry, low quality, nude, sexual, explicit, bad anatomy, deformed",
        applyTo: ["image_to_image", "text_to_image"]
      }
    ];
    await GenerationGuardRule.insertMany(defaults);
    res.json({ success: true, message: "Default Security Rules Applied" });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/admin/finance/gateways', async (_req, res) => {
  const gateways = await PaymentGateway.find();
  res.json(gateways.map(g => ({ ...g._doc, id: String(g._id) })));
});
app.post('/api/admin/finance/gateways', async (req, res) => {
  const { provider, name, publicKey, secretKey, isActive, isTestMode } = req.body;

  // Normalize provider to prevent duplicates (e.g. Razorpay vs razorpay)
  const normProvider = provider.toLowerCase();

  let gateway = await PaymentGateway.findOne({ provider: { $regex: new RegExp(`^${normProvider}$`, 'i') } });

  if (gateway) {
    gateway.name = name || gateway.name;
    gateway.isActive = isActive !== undefined ? isActive : gateway.isActive;
    gateway.isTestMode = isTestMode !== undefined ? isTestMode : gateway.isTestMode;
    if (publicKey) gateway.publicKey = publicKey;
    if (secretKey) gateway.secretKey = secretKey;
    // Ensure provider is consistent
    gateway.provider = normProvider;
    await gateway.save();
  } else {
    gateway = await PaymentGateway.create({
      provider: normProvider,
      name,
      isActive,
      isTestMode,
      publicKey,
      secretKey
    });
  }
  res.json({ ...gateway._doc, id: String(gateway._id) });
});
app.put('/api/admin/finance/gateways/:id', async (req, res) => {
  const update = { ...req.body };
  if (!update.secretKey) delete update.secretKey;
  if (update.provider) update.provider = update.provider.toLowerCase(); // Normalize
  const gateway = await PaymentGateway.findByIdAndUpdate(req.params.id, update, { new: true });
  res.json({ ...gateway._doc, id: String(gateway._id) });
});

app.post('/api/admin/finance/gateways/:id/toggle', async (req, res) => {
  const isActive = !!req.body.isActive;
  if (isActive) {
    await PaymentGateway.updateMany({}, { isActive: false });
  }
  const doc = await PaymentGateway.findByIdAndUpdate(req.params.id, { isActive }, { new: true });
  if (!doc) return res.status(404).json({ error: 'Not found' });
  res.json({ success: true, id: String(doc._id), isActive: doc.isActive });
});

app.delete('/api/admin/finance/gateways/:id', async (req, res) => {
  try {
    const gateway = await PaymentGateway.findByIdAndDelete(req.params.id);
    if (!gateway) return res.status(404).json({ error: 'Gateway not found' });
    res.json({ success: true, message: 'Gateway deleted successfully' });
  } catch (e) {
    res.status(500).json({ error: 'Failed to delete gateway', message: e.message });
  }
});

app.get('/api/admin/fix-gateways-duplicates', async (req, res) => {
  // 1. Group by provider
  const gateways = await PaymentGateway.find();
  const map = {};
  for (const g of gateways) {
    const key = (g.provider || 'unknown').toLowerCase();
    if (!map[key]) map[key] = [];
    map[key].push(g);
  }

  // 2. Keep latest active, delete others
  let deleted = 0;
  for (const key in map) {
    const list = map[key];
    if (list.length > 1) {
      // Sort: Active first (true=-1), then latest ID (desc)
      list.sort((a, b) => {
        if (a.isActive && !b.isActive) return -1;
        if (!a.isActive && b.isActive) return 1;
        return String(b._id).localeCompare(String(a._id));
      });
      const toKeep = list[0];
      const toDelete = list.slice(1);
      for (const d of toDelete) {
        await PaymentGateway.findByIdAndDelete(d._id);
        deleted++;
      }
    }
  }
  res.json({ success: true, deletedCount: deleted });
});

app.get('/api/admin/notifications', async (req, res) => {
  try {
    const notifs = await Notification.find().sort({ sentAt: -1 });
    res.json(notifs.map(n => ({ ...n._doc, id: n._id })));
  } catch (e) {
    res.status(500).json({ error: "Failed to fetch notifications" });
  }
});

app.post('/api/admin/notifications/send', async (req, res) => {
  try {
    const { target, scheduledFor } = req.body;
    let reachCount = 0;

    // Calculate real reach count based on target
    if (target === 'all_users') {
      reachCount = await User.countDocuments({});
    } else if (target === 'active_users') {
      reachCount = await User.countDocuments({ status: 'active' });
    } else if (target === 'paid_users') {
      // Users who have at least one credit transaction (assuming purchases)
      const payingUserIds = await Transaction.distinct('userId', { type: 'credit', gateway: { $ne: 'System' } });
      reachCount = payingUserIds.length;
    } else if (target === 'all_creators') {
      reachCount = await User.countDocuments({ role: 'creator' });
    } else if (target === 'free_users') {
      // Approximation: All users minus paid users
      const total = await User.countDocuments({});
      const paid = (await Transaction.distinct('userId', { type: 'credit', gateway: { $ne: 'System' } })).length;
      reachCount = Math.max(0, total - paid);
    } else if (target === 'specific_user') {
      reachCount = 1;
    }

    const data = {
      ...req.body,
      sentAt: scheduledFor ? undefined : new Date(),
      status: scheduledFor ? 'scheduled' : 'sent',
      reachCount
    };

    const notif = await Notification.create(data);
    res.json({ ...notif._doc, id: notif._id });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to send notification" });
  }
});

app.delete('/api/admin/notifications/:id', async (req, res) => {
  try {
    await Notification.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: "Failed to delete notification" });
  }
});
// --- Wallet Routes ---
app.get('/api/wallet/balance', authUser, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ msg: 'User not found' });

    // Calculate total earned (sum of all credit transactions)
    const earned = await Transaction.aggregate([
      { $match: { userId: user._id, type: 'credit' } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);
    const totalEarned = earned.length > 0 ? earned[0].total : 0;

    // Calculate total spent (sum of all debit transactions)
    const spent = await Transaction.aggregate([
      { $match: { userId: user._id, type: 'debit' } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);
    const totalSpent = spent.length > 0 ? spent[0].total : 0;

    res.json({
      balance: user.points,
      totalEarned,
      totalSpent
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
});

app.get('/api/wallet/transactions', authUser, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const type = req.query.type;

    const query = { userId: req.user.id };
    if (type) query.type = type === 'earned' ? 'credit' : 'debit';

    const transactions = await Transaction.find(query)
      .sort({ date: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    // Transform to frontend format
    const formatted = transactions.map(t => ({
      id: t._id,
      amount: t.type === 'debit' ? -t.amount : t.amount,
      description: t.description,
      date: t.date,
      createdAt: t.date,
      type: t.type,
      balanceAfter: 0 // Ideally this should be stored in transaction or calculated
    }));

    res.json({ transactions: formatted });
  } catch (err) {
    res.status(500).send('Server Error');
  }
});

app.post('/api/wallet/add-points', authUser, async (req, res) => {
  // Logic restricted to specific scenarios or dev/test
  // For production, this should be admin only or internal logic
  try {
    const { amount, description } = req.body;
    if (!amount) return res.status(400).json({ msg: 'Amount required' });

    const user = await User.findById(req.user.id);
    user.points += parseInt(amount);
    await user.save();

    await Transaction.create({
      userId: user._id,
      amount: Math.abs(amount),
      type: amount > 0 ? 'credit' : 'debit',
      description: description || 'Manual adjustment',
      status: 'success'
    });

    res.json({ success: true, balance: user.points });
  } catch (err) {
    res.status(500).send('Server Error');
  }
});

// --- Packages Routes ---
app.get('/api/packages', async (req, res) => {
  try {
    const packages = await PointsPackage.find({ isActive: true }).sort({ price: 1 });
    // Transform to match frontend expectations if needed
    const formatted = packages.map(p => ({
      id: p._id,
      name: p.name,
      price: p.price,
      credits: p.points,
      bonus: p.bonusPoints,
      popular: p.isPopular,
      features: p.tag ? [p.tag] : []
    }));
    res.json(formatted);
  } catch (err) {
    res.status(500).send('Server Error');
  }
});

// --- Payment Routes (Razorpay) ---
// Public route to get active gateway
app.get('/api/payment/active-gateway', async (req, res) => {
  try {
    const active = await PaymentGateway.findOne({ isActive: true });
    // Default to razorpay if nothing active (historically)
    res.json({ provider: active ? active.provider.toLowerCase() : 'razorpay' });
  } catch (e) {
    res.json({ provider: 'razorpay' });
  }
});

app.post(['/api/payment/create-order', '/api/v1/payment/create-order'], authUser, async (req, res) => {
  try {
    console.log('Payment create-order request:', { packageId: req.body?.packageId, gateway: req.body?.gateway, userId: req.user?.id });
    const { packageId, gateway = 'razorpay' } = req.body || {};
    if (!packageId) {
      console.error('Package ID missing in request');
      return res.status(400).json({ msg: 'Package ID is required' });
    }
    const pkg = await PointsPackage.findById(packageId);
    if (!pkg) {
      console.error('Package not found:', packageId);
      return res.status(404).json({ msg: 'Package not found' });
    }
    if (!pkg.isActive) {
      console.error('Package is not active:', packageId);
      return res.status(400).json({ msg: 'Package is not active' });
    }
    if (!pkg.price || pkg.price <= 0) {
      console.error('Package price is invalid:', pkg.price);
      return res.status(400).json({ msg: 'Package price must be greater than 0' });
    }

    // --- STRIPE LOGIC ---
    if (gateway.toLowerCase() === 'stripe') {
      const config = await PaymentGateway.findOne({ provider: { $regex: /^stripe$/i } })
        .select('+secretKey')
        .sort({ isActive: -1, _id: -1 });

      // If config exists in DB, check if active
      if (config && !config.isActive) {
        return res.status(400).json({ msg: 'Stripe gateway is disabled in Admin Panel' });
      }

      const stripeKey = config?.secretKey || process.env.STRIPE_SECRET_KEY;
      if (!stripeKey) return res.status(500).json({ msg: 'Stripe secret key missing' });

      // Verification of mode
      if (config?.isTestMode && stripeKey.startsWith('sk_live')) {
        console.warn('⚠️ Warning: Using Stripe LIVE key while in TEST mode. Payments WILL be real!');
      }

      const stripe = Stripe(stripeKey);

      // Use Checkout Session for easier integration
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [{
          price_data: {
            currency: 'inr',
            product_data: { name: pkg.name },
            unit_amount: Math.round(pkg.price * 100),
          },
          quantity: 1,
        }],
        mode: 'payment',
        success_url: `${req.headers.origin || process.env.FRONTEND_URL || 'https://rupantara-fronted.vercel.app'}/pro?payment_success=true&session_id={CHECKOUT_SESSION_ID}&gateway=stripe`,
        cancel_url: `${req.headers.origin || process.env.FRONTEND_URL || 'https://rupantara-fronted.vercel.app'}/pro`,
        metadata: { userId: req.user.id, packageId: packageId },
      });

      return res.json({
        url: session.url,
        gateway: 'stripe'
      });
    }

    // --- RAZORPAY LOGIC (Default) ---
    if (gateway !== 'razorpay') return res.status(400).json({ msg: 'Unsupported gateway' });

    // Pkg already retrieved above

    // Get Razorpay Config (select secretKey explicitly)
    const config = await PaymentGateway.findOne({ provider: { $regex: /^razorpay$/i } })
      .select('+secretKey')
      .sort({ isActive: -1, _id: -1 });

    // If config exists in DB, check if active
    if (config && !config.isActive) {
      return res.status(400).json({ msg: 'Razorpay gateway is disabled in Admin Panel' });
    }

    // Use DB credentials if available, otherwise fallback to ENV
    const key_id = config?.publicKey || process.env.RAZORPAY_KEY_ID;
    const key_secret = config?.secretKey || process.env.RAZORPAY_KEY_SECRET;

    if (!key_id || !key_secret) {
      console.error('Razorpay credentials missing:', { hasKeyId: !!key_id, hasKeySecret: !!key_secret, configExists: !!config });
      return res.status(500).json({ msg: 'Razorpay credentials missing. Please configure in Admin Panel.' });
    }

    // Verification of mode
    if (config?.isTestMode && key_id.startsWith('rzp_live')) {
      console.warn('⚠️ Warning: Using Razorpay LIVE key while in TEST mode. Payments WILL be real!');
    }

    try {
      const instance = new Razorpay({ key_id, key_secret });

      const amountInPaise = Math.round(pkg.price * 100);
      if (amountInPaise <= 0) {
        console.error('Invalid amount calculated:', { price: pkg.price, amountInPaise });
        return res.status(400).json({ msg: 'Invalid package price. Amount must be greater than 0.' });
      }

      const options = {
        amount: amountInPaise, // Amount in paise (integer)
        currency: "INR",
        receipt: `order_${Date.now()}_${String(req.user.id)}`,
        notes: {
          userId: String(req.user.id),
          packageId: String(packageId)
        }
      };

      console.log('Creating Razorpay order with options:', { ...options, key_id: key_id.substring(0, 10) + '...' });
      const order = await instance.orders.create(options);
      console.log('Razorpay order created successfully:', order.id);
      res.json({
        orderId: order.id,
        id: order.id,
        currency: order.currency,
        amount: order.amount,
        keyId: key_id,
        key: key_id // standard name
      });
    } catch (razorpayError) {
      console.error('Razorpay order creation error:', razorpayError);
      console.error('Razorpay error details:', razorpayError.error);
      return res.status(500).json({ 
        msg: 'Failed to create Razorpay order', 
        error: razorpayError.message || 'Unknown error',
        details: razorpayError.error?.description || 'Check Razorpay credentials'
      });
    }

  } catch (err) {
    console.error('Payment Init Error:', err);
    res.status(500).json({ msg: 'Payment initialization failed', error: err.message });
  }
});

app.post('/api/payment/verify-razorpay', authUser, async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, packageId } = req.body;

    const config = await PaymentGateway.findOne({ provider: { $regex: /^razorpay$/i } })
      .select('+secretKey')
      .sort({ isActive: -1, _id: -1 });

    if (config && !config.isActive) return res.status(400).json({ msg: 'Razorpay disabled in Admin Panel' });

    const key_secret = config?.secretKey || process.env.RAZORPAY_KEY_SECRET;

    if (!key_secret) return res.status(500).json({ msg: 'Server config error: Razorpay secret missing' });

    const generated_signature = crypto
      .createHmac("sha256", key_secret)
      .update(razorpay_order_id + "|" + razorpay_payment_id)
      .digest("hex");

    if (generated_signature === razorpay_signature) {
      // Payment Success
      const pkg = await PointsPackage.findById(packageId);
      if (!pkg) return res.status(404).json({ msg: 'Package not found' });

      const pointsToAdd = pkg.points + (pkg.bonusPoints || 0);

      const user = await User.findById(req.user.id);
      user.points += pointsToAdd;
      await user.save();

      // Record Transaction
      await Transaction.create({
        userId: user._id,
        amount: pointsToAdd,
        type: 'credit',
        description: `Purchased ${pkg.name}`,
        gateway: 'razorpay',
        status: 'success',
        date: new Date()
      });

      res.json({ success: true, newBalance: user.points });
    } else {
      res.status(400).json({ msg: 'Invalid signature' });
    }
  } catch (err) {
    console.error('Payment Verify Error:', err);
    res.status(500).json({ msg: 'Verification failed' });
  }
});

// --- Stripe Verify ---
app.post('/api/payment/verify-stripe', authUser, async (req, res) => {
  try {
    const { paymentIntentId, sessionId } = req.body;

    // Get Stripe Secret Key
    const config = await PaymentGateway.findOne({ provider: { $regex: /^stripe$/i } })
      .select('+secretKey')
      .sort({ isActive: -1, _id: -1 });

    if (config && !config.isActive) return res.status(400).json({ msg: 'Stripe disabled in Admin Panel' });

    const stripeKey = config?.secretKey || process.env.STRIPE_SECRET_KEY;
    if (!stripeKey) return res.status(500).json({ msg: 'Stripe configuration missing' });

    const stripe = Stripe(stripeKey);
    let status = 'pending';
    let metadata = {};
    let paymentId = '';

    if (sessionId) {
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      status = session.payment_status === 'paid' ? 'succeeded' : session.payment_status;
      metadata = session.metadata || {};
      paymentId = session.payment_intent || session.id;
    } else if (paymentIntentId) {
      const intent = await stripe.paymentIntents.retrieve(paymentIntentId);
      status = intent.status;
      metadata = intent.metadata || {};
      paymentId = intent.id;
    } else {
      return res.status(400).json({ msg: 'Missing payment ID' });
    }

    if (status === 'succeeded') {
      const packageId = metadata.packageId;
      const userId = metadata.userId;

      if (!userId || userId !== req.user.id) {
        // Fallback: If webhook verification, userId might not match req.user (if called from server)
        // But here we are calling from frontend authUser.
        // If metadata missing, we have a problem.
        if (!userId) return res.status(400).json({ msg: 'Invalid payment metadata' });
        // Warn but allow if authenticated? No, security risk.
        return res.status(400).json({ msg: 'User mismatch' });
      }

      // Check if already processed
      const existingTxn = await Transaction.findOne({ paymentId: paymentId });
      if (existingTxn) {
        return res.json({ success: true, message: 'Already processed', newBalance: (await User.findById(userId)).points });
      }

      const pkg = await PointsPackage.findById(packageId);
      if (!pkg) return res.status(404).json({ msg: 'Package not found' });

      const user = await User.findById(userId);
      const pointsToAdd = pkg.points + (pkg.bonusPoints || 0);
      user.points += pointsToAdd;
      await user.save();

      // Log Transaction
      await Transaction.create({
        userId: user._id,
        amount: pkg.price,
        type: 'credit',
        description: `Purchased ${pkg.name} (Stripe)`,
        paymentId: paymentId,
        date: new Date()
      });

      return res.json({ success: true, newBalance: user.points });
    } else {
      return res.status(400).json({ msg: `Payment status: ${status}` });
    }
  } catch (e) {
    console.error('Stripe Verify Error:', e);
    res.status(500).json({ msg: 'Verification failed', error: e.message });
  }
});

// ============================================
// Ads Management System
// ============================================

// Get Ads Config (Public - for frontend to know what pages to show ads on)
app.get('/api/ads/config', async (req, res) => {
  try {
    let config = await AdsConfig.findOne();
    if (!config) {
      // Create default config if not exists
      config = await AdsConfig.create({});
    }
    res.json(config);
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch ads config' });
  }
});

// Admin: Get Ads Config
app.get('/api/admin/ads/config', async (req, res) => {
  try {
    let config = await AdsConfig.findOne();
    if (!config) {
      config = await AdsConfig.create({});
    }
    res.json({ ...config._doc, id: String(config._id) });
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch ads config' });
  }
});

// Admin: Update Ads Config
app.put('/api/admin/ads/config', async (req, res) => {
  try {
    let config = await AdsConfig.findOne();
    if (!config) {
      config = await AdsConfig.create(req.body);
    } else {
      Object.assign(config, req.body);
      config.updatedAt = new Date();
      await config.save();
    }
    res.json({ ...config._doc, id: String(config._id) });
  } catch (e) {
    console.error('Update Ads Config Error:', e);
    res.status(500).json({ error: 'Failed to update ads config' });
  }
});

// User: Watch Ad and Get Reward
app.post('/api/ads/watch', authUser, async (req, res) => {
  try {
    const { adType = 'rewarded', page = 'rewards' } = req.body;

    const config = await AdsConfig.findOne();
    if (!config || !config.isEnabled) {
      return res.status(400).json({ error: 'Ads are currently disabled' });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check daily limit
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayWatchCount = await Transaction.countDocuments({
      userId: user._id,
      description: { $regex: /^Ad Reward/i },
      date: { $gte: today }
    });

    if (todayWatchCount >= config.maxAdsPerUser) {
      return res.status(429).json({
        error: 'Daily ad limit reached',
        limit: config.maxAdsPerUser
      });
    }

    // Check cooldown
    const lastAdWatch = await Transaction.findOne({
      userId: user._id,
      description: { $regex: /^Ad Reward/i }
    }).sort({ date: -1 });

    if (lastAdWatch) {
      const timeSinceLastAd = Date.now() - new Date(lastAdWatch.date).getTime();
      const cooldownMs = config.cooldownMinutes * 60 * 1000;

      if (timeSinceLastAd < cooldownMs) {
        const remainingSeconds = Math.ceil((cooldownMs - timeSinceLastAd) / 1000);
        return res.status(429).json({
          error: 'Please wait before watching another ad',
          remainingSeconds
        });
      }
    }

    // Calculate reward based on config
    let pointsEarned = 0;

    if (config.rewardType === 'fixed') {
      pointsEarned = config.fixedPoints;
    } else if (config.rewardType === 'random') {
      pointsEarned = Math.floor(Math.random() * (config.randomMax - config.randomMin + 1)) + config.randomMin;
    } else if (config.rewardType === 'range') {
      // Range: pick a random value between min and max
      pointsEarned = Math.floor(Math.random() * (config.randomMax - config.randomMin + 1)) + config.randomMin;
    }

    // Add points to user
    user.points += pointsEarned;
    await user.save();

    // Record transaction
    await Transaction.create({
      userId: user._id,
      amount: pointsEarned,
      type: 'credit',
      description: `Ad Reward (${adType} on ${page})`,
      gateway: config.provider || 'ads',
      status: 'success',
      date: new Date()
    });

    res.json({
      success: true,
      pointsEarned,
      newBalance: user.points,
      watchCount: todayWatchCount + 1,
      remainingToday: config.maxAdsPerUser - (todayWatchCount + 1)
    });
  } catch (e) {
    console.error('Ad Watch Error:', e);
    res.status(500).json({ error: 'Failed to process ad reward' });
  }
});

// User: Check Ad Availability
app.get('/api/ads/availability', authUser, async (req, res) => {
  try {
    const config = await AdsConfig.findOne();
    if (!config || !config.isEnabled) {
      return res.json({ available: false, reason: 'Ads disabled' });
    }

    // Check daily limit
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayWatchCount = await Transaction.countDocuments({
      userId: req.user.id,
      description: { $regex: /^Ad Reward/i },
      date: { $gte: today }
    });

    if (todayWatchCount >= config.maxAdsPerUser) {
      return res.json({
        available: false,
        reason: 'Daily limit reached',
        watchedToday: todayWatchCount,
        maxDaily: config.maxAdsPerUser
      });
    }

    // Check cooldown
    const lastAdWatch = await Transaction.findOne({
      userId: req.user.id,
      description: { $regex: /^Ad Reward/i }
    }).sort({ date: -1 });

    if (lastAdWatch) {
      const timeSinceLastAd = Date.now() - new Date(lastAdWatch.date).getTime();
      const cooldownMs = config.cooldownMinutes * 60 * 1000;

      if (timeSinceLastAd < cooldownMs) {
        const remainingSeconds = Math.ceil((cooldownMs - timeSinceLastAd) / 1000);
        return res.json({
          available: false,
          reason: 'Cooldown active',
          remainingSeconds
        });
      }
    }

    res.json({
      available: true,
      watchedToday: todayWatchCount,
      maxDaily: config.maxAdsPerUser,
      rewardType: config.rewardType,
      estimatedReward: config.rewardType === 'fixed'
        ? config.fixedPoints
        : `${config.randomMin}-${config.randomMax}`
    });
  } catch (e) {
    console.error('Ad Availability Error:', e);
    res.status(500).json({ error: 'Failed to check ad availability' });
  }
});

// ====================================
// CREATOR DASHBOARD APIs
// ====================================

// Get Creator Dashboard Stats (Overview Page)
app.get('/api/creator/stats', authUser, async (req, res) => {
  try {
    const userId = req.user.id;

    // Check if user is a creator
    const user = await User.findById(userId);
    if (!user || user.role !== 'creator') {
      return res.status(403).json({ error: 'Not a creator account' });
    }

    // Get creator templates
    const templates = await Template.find({ creatorId: userId });
    const totalTemplates = templates.length;
    const approvedTemplates = templates.filter(t => t.status === 'active').length;
    const pendingTemplates = templates.filter(t => t.status === 'draft').length;

    // Calculate total usage, views, likes
    const totalUses = templates.reduce((sum, t) => sum + (t.useCount || 0), 0);
    const totalViews = templates.reduce((sum, t) => sum + (t.viewCount || 0), 0);
    const totalLikes = templates.reduce((sum, t) => sum + (t.likeCount || 0), 0);

    // Get earnings
    const earningsAgg = await CreatorEarning.aggregate([
      { $match: { creatorId: user._id } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);
    const totalEarnings = earningsAgg[0]?.total || 0;

    // This month earnings
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const thisMonthAgg = await CreatorEarning.aggregate([
      { $match: { creatorId: user._id, date: { $gte: startOfMonth } } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);
    const thisMonthEarnings = thisMonthAgg[0]?.total || 0;

    // Last month earnings
    const startOfLastMonth = new Date(startOfMonth);
    startOfLastMonth.setMonth(startOfLastMonth.getMonth() - 1);
    const endOfLastMonth = new Date(startOfMonth);
    endOfLastMonth.setMilliseconds(-1);

    const lastMonthAgg = await CreatorEarning.aggregate([
      { $match: { creatorId: user._id, date: { $gte: startOfLastMonth, $lte: endOfLastMonth } } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);
    const lastMonthEarnings = lastMonthAgg[0]?.total || 0;

    // Pending withdrawal
    const pendingWithdrawals = await Withdrawal.aggregate([
      { $match: { creatorId: user._id, status: { $in: ['pending', 'processing'] } } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);
    const pendingWithdrawal = pendingWithdrawals[0]?.total || 0;

    // Templates this week
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    const templatesThisWeek = templates.filter(t => new Date(t.createdAt) >= oneWeekAgo).length;

    res.json({
      totalTemplates,
      approvedTemplates,
      pendingTemplates,
      rejectedTemplates: 0,
      templatesThisWeek,
      totalUses,
      totalViews,
      totalLikes,
      followers: user.followersCount || 0,
      totalEarnings,
      thisMonthEarnings,
      lastMonthEarnings,
      pendingWithdrawal,
      availableBalance: totalEarnings - pendingWithdrawal
    });
  } catch (e) {
    console.error('Creator Stats Error:', e);
    res.status(500).json({ error: 'Failed to fetch creator stats' });
  }
});

// Get Creator Earnings with breakdown
app.get('/api/creator/earnings', authUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await User.findById(userId);

    if (!user || user.role !== 'creator') {
      return res.status(403).json({ error: 'Not a creator account' });
    }

    // Total earnings
    const earningsAgg = await CreatorEarning.aggregate([
      { $match: { creatorId: user._id } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);
    const totalEarnings = earningsAgg[0]?.total || 0;

    // This month earnings
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const thisMonthAgg = await CreatorEarning.aggregate([
      { $match: { creatorId: user._id, date: { $gte: startOfMonth } } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);
    const thisMonthEarnings = thisMonthAgg[0]?.total || 0;

    // Last month earnings
    const startOfLastMonth = new Date(startOfMonth);
    startOfLastMonth.setMonth(startOfLastMonth.getMonth() - 1);
    const endOfLastMonth = new Date(startOfMonth);
    endOfLastMonth.setMilliseconds(-1);

    const lastMonthAgg = await CreatorEarning.aggregate([
      { $match: { creatorId: user._id, date: { $gte: startOfLastMonth, $lte: endOfLastMonth } } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);
    const lastMonthEarnings = lastMonthAgg[0]?.total || 0;

    // Get pending withdrawals
    const pendingWithdrawals = await Withdrawal.aggregate([
      { $match: { creatorId: user._id, status: { $in: ['pending', 'processing'] } } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);
    const pendingWithdrawal = pendingWithdrawals[0]?.total || 0;

    // Earnings breakdown by template (top 10)
    const templateBreakdown = await CreatorEarning.aggregate([
      { $match: { creatorId: user._id } },
      {
        $group: {
          _id: '$templateId',
          totalEarnings: { $sum: '$amount' },
          totalUses: { $sum: '$usageCount' }
        }
      },
      { $sort: { totalEarnings: -1 } },
      { $limit: 10 },
      {
        $lookup: {
          from: 'templates',
          localField: '_id',
          foreignField: '_id',
          as: 'template'
        }
      },
      { $unwind: { path: '$template', preserveNullAndEmptyArrays: true } }
    ]);

    const templateEarnings = templateBreakdown.map(item => ({
      templateId: String(item._id),
      templateName: item.template?.title || 'Unknown Template',
      earnings: item.totalEarnings,
      uses: item.totalUses
    }));

    // Monthly earnings trend (last 12 months)
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

    const monthlyTrend = await CreatorEarning.aggregate([
      { $match: { creatorId: user._id, date: { $gte: oneYearAgo } } },
      {
        $group: {
          _id: { year: { $year: '$date' }, month: { $month: '$date' } },
          total: { $sum: '$amount' }
        }
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } }
    ]);

    res.json({
      totalEarnings,
      thisMonthEarnings,
      lastMonthEarnings,
      pendingWithdrawal,
      availableBalance: totalEarnings - pendingWithdrawal,
      templateEarnings,
      monthlyTrend: monthlyTrend.map(m => ({
        month: `${m._id.year}-${String(m._id.month).padStart(2, '0')}`,
        amount: m.total
      }))
    });
  } catch (e) {
    console.error('Creator Earnings Error:', e);
    res.status(500).json({ error: 'Failed to fetch earnings' });
  }
});

// Get Creator Templates
app.get('/api/creator/templates', authUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await User.findById(userId);

    if (!user || user.role !== 'creator') {
      return res.status(403).json({ error: 'Not a creator account' });
    }

    const { status, sort = 'recent', page = 1, limit = 20 } = req.query;

    const query = { creatorId: user._id };
    if (status && status !== 'all') {
      if (status === 'approved') query.status = 'active';
      else if (status === 'pending') query.status = 'draft';
      else query.status = status;
    }

    let sortOption = { createdAt: -1 };
    if (sort === 'popular') sortOption = { useCount: -1 };
    else if (sort === 'earnings') sortOption = { useCount: -1 }; // Use useCount as proxy for earnings

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const templates = await Template.find(query)
      .sort(sortOption)
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Template.countDocuments(query);

    res.json({
      templates: templates.map(t => ({
        id: String(t._id),
        title: t.title,
        description: t.description,
        image: t.imageUrl,
        demoImage: t.imageUrl,
        category: t.category,
        subCategory: t.subCategory,
        status: t.status === 'active' ? 'approved' : t.status === 'draft' ? 'pending' : t.status,
        views: t.viewCount || 0,
        usageCount: t.useCount || 0,
        likeCount: t.likeCount || 0,
        rating: 4.5, // Default rating
        earnings: (t.useCount || 0) * 0.10, // Estimate
        createdAt: t.createdAt,
        tags: t.tags || []
      })),
      total,
      page: parseInt(page),
      totalPages: Math.ceil(total / parseInt(limit))
    });
  } catch (e) {
    console.error('Creator Templates Error:', e);
    res.status(500).json({ error: 'Failed to fetch templates' });
  }
});

// Submit Withdrawal Request
app.post('/api/creator/withdraw', authUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await User.findById(userId);

    if (!user || user.role !== 'creator') {
      return res.status(403).json({ error: 'Not a creator account' });
    }

    const { amount, method, bankDetails, upiId } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Invalid withdrawal amount' });
    }

    if (!method || !['bank', 'upi'].includes(method)) {
      return res.status(400).json({ error: 'Invalid withdrawal method' });
    }

    if (method === 'upi' && (!upiId || !upiId.includes('@'))) {
      return res.status(400).json({ error: 'Invalid UPI ID' });
    }

    if (method === 'bank' && (!bankDetails || !bankDetails.accountNumber || !bankDetails.ifscCode)) {
      return res.status(400).json({ error: 'Incomplete bank details' });
    }

    // Check available balance
    const earningsAgg = await CreatorEarning.aggregate([
      { $match: { creatorId: user._id } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);
    const totalEarnings = earningsAgg[0]?.total || 0;

    const pendingWithdrawals = await Withdrawal.aggregate([
      { $match: { creatorId: user._id, status: { $in: ['pending', 'processing'] } } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);
    const pendingAmount = pendingWithdrawals[0]?.total || 0;

    const availableBalance = totalEarnings - pendingAmount;

    if (amount > availableBalance) {
      return res.status(400).json({ error: `Insufficient balance. Available: $${availableBalance.toFixed(2)}` });
    }

    // Create withdrawal request
    const withdrawal = await Withdrawal.create({
      creatorId: user._id,
      amount,
      method,
      bankDetails: method === 'bank' ? bankDetails : undefined,
      upiId: method === 'upi' ? upiId : undefined
    });

    // Create notification for creator
    await CreatorNotification.create({
      creatorId: user._id,
      type: 'withdrawal',
      title: 'Withdrawal Request Submitted',
      message: `Your withdrawal request for $${amount.toFixed(2)} to ${method === 'upi' ? upiId : bankDetails.bankName} has been submitted.`,
      relatedId: withdrawal._id
    });

    res.json({
      id: String(withdrawal._id),
      amount: withdrawal.amount,
      method: withdrawal.method,
      status: withdrawal.status,
      requestedAt: withdrawal.requestedAt
    });
  } catch (e) {
    console.error('Withdrawal Request Error:', e);
    res.status(500).json({ error: 'Failed to submit withdrawal request' });
  }
});

// Get Withdrawal History
app.get('/api/creator/withdrawals', authUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await User.findById(userId);

    if (!user || user.role !== 'creator') {
      return res.status(403).json({ error: 'Not a creator account' });
    }

    const { page = 1, limit = 20, status } = req.query;

    const query = { creatorId: user._id };
    if (status) query.status = status;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const withdrawals = await Withdrawal.find(query)
      .sort({ requestedAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Withdrawal.countDocuments(query);

    res.json({
      withdrawals: withdrawals.map(w => ({
        id: String(w._id),
        amount: w.amount,
        method: w.method,
        status: w.status,
        bankDetails: w.method === 'bank' ? {
          bankName: w.bankDetails?.bankName,
          accountNumber: w.bankDetails?.accountNumber ? '****' + w.bankDetails.accountNumber.slice(-4) : ''
        } : undefined,
        upiId: w.method === 'upi' ? w.upiId : undefined,
        requestedAt: w.requestedAt,
        processedAt: w.processedAt,
        transactionId: w.transactionId,
        remarks: w.remarks
      })),
      total,
      page: parseInt(page),
      totalPages: Math.ceil(total / parseInt(limit))
    });
  } catch (e) {
    console.error('Withdrawals List Error:', e);
    res.status(500).json({ error: 'Failed to fetch withdrawals' });
  }
});

// Get Creator Notifications
app.get('/api/creator/notifications', authUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await User.findById(userId);

    if (!user || user.role !== 'creator') {
      return res.status(403).json({ error: 'Not a creator account' });
    }

    const { page = 1, limit = 20, type } = req.query;

    const query = { creatorId: user._id };
    if (type && type !== 'all') query.type = type;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const notifications = await CreatorNotification.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await CreatorNotification.countDocuments(query);
    const unreadCount = await CreatorNotification.countDocuments({ creatorId: user._id, read: false });

    res.json({
      notifications: notifications.map(n => ({
        id: String(n._id),
        type: n.type,
        title: n.title,
        message: n.message,
        read: n.read,
        relatedId: n.relatedId ? String(n.relatedId) : null,
        createdAt: n.createdAt
      })),
      unreadCount,
      total,
      page: parseInt(page),
      totalPages: Math.ceil(total / parseInt(limit))
    });
  } catch (e) {
    console.error('Creator Notifications Error:', e);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

// Mark Notification as Read
app.patch('/api/creator/notifications/:id/read', authUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    await CreatorNotification.findOneAndUpdate(
      { _id: id, creatorId: userId },
      { read: true }
    );

    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Failed to mark notification as read' });
  }
});

// Mark All Notifications as Read
app.post('/api/creator/notifications/mark-all-read', authUser, async (req, res) => {
  try {
    const userId = req.user.id;

    await CreatorNotification.updateMany(
      { creatorId: userId, read: false },
      { read: true }
    );

    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Failed to mark notifications as read' });
  }
});

// Get Creator Transaction History
app.get('/api/creator/transactions', authUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await User.findById(userId);

    if (!user || user.role !== 'creator') {
      return res.status(403).json({ error: 'Not a creator account' });
    }

    const { page = 1, limit = 20, type } = req.query;

    // Get earnings as transactions
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const earnings = await CreatorEarning.find({ creatorId: user._id })
      .sort({ date: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('templateId', 'title');

    const withdrawals = await Withdrawal.find({ creatorId: user._id, status: 'completed' })
      .sort({ processedAt: -1 });

    // Combine and format as transactions
    const transactions = [];

    earnings.forEach(e => {
      transactions.push({
        id: String(e._id),
        type: 'creator_earning',
        amount: e.amount,
        description: `Earnings from ${e.templateId?.title || 'template usage'}`,
        relatedTemplateId: e.templateId ? String(e.templateId._id) : null,
        createdAt: e.date
      });
    });

    withdrawals.forEach(w => {
      transactions.push({
        id: String(w._id),
        type: 'withdrawal',
        amount: -w.amount,
        description: `Withdrawal to ${w.method === 'upi' ? w.upiId : w.bankDetails?.bankName}`,
        createdAt: w.processedAt || w.requestedAt
      });
    });

    // Sort by date
    transactions.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    // Calculate running balance
    let runningBalance = 0;
    const earningsTotal = await CreatorEarning.aggregate([
      { $match: { creatorId: user._id } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);
    const withdrawalsTotal = await Withdrawal.aggregate([
      { $match: { creatorId: user._id, status: 'completed' } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);

    runningBalance = (earningsTotal[0]?.total || 0) - (withdrawalsTotal[0]?.total || 0);

    res.json({
      transactions: transactions.slice(0, parseInt(limit)).map(t => ({
        ...t,
        balanceAfter: runningBalance
      })),
      currentBalance: runningBalance,
      page: parseInt(page),
      total: transactions.length
    });
  } catch (e) {
    console.error('Creator Transactions Error:', e);
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
});

// Create Template (By Creator)
app.post('/api/creator/templates', authUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await User.findById(userId);

    if (!user || user.role !== 'creator') {
      return res.status(403).json({ error: 'Not a creator account' });
    }

    const { title, description, imageUrl, category, subCategory, prompt, negativePrompt, tags, gender, isPremium } = req.body;

    if (!title || !imageUrl) {
      return res.status(400).json({ error: 'Title and image are required' });
    }

    const template = await Template.create({
      title,
      description,
      imageUrl,
      category: category || 'General',
      subCategory: subCategory || '',
      prompt,
      negativePrompt,
      tags: tags || [],
      gender: gender || '',
      isPremium: isPremium || false,
      creatorId: user._id,
      status: 'draft', // Pending approval
      source: 'creator'
    });

    // Create notification
    await CreatorNotification.create({
      creatorId: user._id,
      type: 'template',
      title: 'Template Submitted',
      message: `Your template "${title}" has been submitted for review.`,
      relatedId: template._id
    });

    res.json({
      id: String(template._id),
      title: template.title,
      status: 'pending',
      createdAt: template.createdAt
    });
  } catch (e) {
    console.error('Create Template Error:', e);
    res.status(500).json({ error: 'Failed to create template' });
  }
});

// Import and mount Creator Profile API routes
const creatorProfileRoutes = require('./creatorProfileRoutes');
app.use('/api/admin/creators', authUser, creatorProfileRoutes);

// Import and mount Category API routes (support multiple paths for compatibility)
const categoryRoutes = require('./routes/categories')(authUser);
app.use('/api/v1/categories', categoryRoutes);  // For v1 API
app.use('/api/categories', categoryRoutes);      // For public frontend
app.use('/api/admin/categories', categoryRoutes); // For admin panel (admin routes have auth middleware in routes file)

// Import and mount Creator Template routes
const creatorTemplateRoutes = require('./routes/creatorTemplates')(authUser);
app.use('/api/v1/creator/templates', creatorTemplateRoutes);
app.use('/api/creator/templates', creatorTemplateRoutes); // Also support without /v1 (for URL rewrite compatibility)

// Admin logs endpoint
app.get('/api/admin/logs', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit || '10', 10), 100);
  res.json(recentLogs.slice(-limit));
});

// API version compatibility - redirect /api/v1/* to /api/*
app.use((req, res, next) => {
  if (req.url.startsWith('/api/v1/')) {
    req.url = req.url.replace('/api/v1/', '/api/');
  }
  next();
});

// 404 Handler for undefined routes
app.use((req, res) => {
  if (req.url.startsWith('/api/')) {
    return res.status(404).json({
      error: 'Route not found',
      message: `The endpoint ${req.method} ${req.url} does not exist`,
      path: req.url
    });
  }
  res.status(404).json({ error: 'Not found', message: 'The requested resource was not found' });
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('❌ Unhandled Error:', err);
  const status = err.status || err.statusCode || 500;
  res.status(status).json({
    error: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  recentLogs.push({ ts: new Date().toISOString(), method: 'SYSTEM', path: 'SERVER_START', status: 200, ms: 0 });
});

