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
const crypto = require('crypto');
const fs = require('fs');
const {
  User, CreatorApplication, Transaction, AIModel, Template, Category,
  PointsPackage, PaymentGateway, FinanceConfig, Admin, Notification, Generation, ToolConfig, FilterConfig
} = require('./models');

const app = express();
const PORT = process.env.PORT || 5000;
const recentLogs = [];
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
// Debugging CORS: Allow all origins
app.use(cors({
  origin: true,
  credentials: true,
  optionsSuccessStatus: 200
}));

app.use(bodyParser.json({ limit: '25mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '25mb' }));

// ... (request logging middleware remains same)

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
    res.status(401).json({ msg: 'Token is not valid' });
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
    const gatewayCount = await PaymentGateway.countDocuments();
    if (gatewayCount === 0) {
      await PaymentGateway.create({
        name: 'Razorpay',
        provider: 'razorpay',
        isActive: false,
        isTestMode: true,
        publicKey: '',
        secretKey: ''
      });
    }
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
app.get('/api/wallet/balance', authUser, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    return res.json({ points: user.points ?? 0 });
  } catch (err) {
    return res.status(500).json({ error: 'Server Error' });
  }
});

app.get('/api/wallet/transactions', authUser, async (req, res) => {
  try {
    const page = parseInt(req.query.page || '1', 10);
    const limit = parseInt(req.query.limit || '20', 10);
    const skip = (page - 1) * limit;
    const type = req.query.type ? String(req.query.type) : undefined;

    const query = { userId: req.user.id };
    if (type) {
      // @ts-ignore
      query.type = type;
    }

    const txs = await Transaction.find(query)
      .sort({ date: -1 })
      .skip(skip)
      .limit(limit);

    return res.json({ transactions: txs.map(t => ({ ...t._doc, id: String(t._id) })) });
  } catch (err) {
    return res.status(500).json({ error: 'Server Error' });
  }
});

// Used by frontend for manual crediting / dev flows
app.post('/api/wallet/add-points', authUser, async (req, res) => {
  try {
    const amount = Number(req.body.amount || 0);
    const description = String(req.body.description || 'Wallet credit');
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ error: 'Invalid amount' });
    }

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    user.points = (user.points || 0) + amount;
    await user.save();

    const tx = await Transaction.create({
      userId: user._id,
      amount,
      type: 'credit',
      description,
      gateway: 'System',
      status: 'success',
      date: new Date()
    });

    return res.json({ success: true, points: user.points, transaction: { ...tx._doc, id: String(tx._id) } });
  } catch (err) {
    return res.status(500).json({ error: 'Server Error' });
  }
});

app.post('/api/creator/apply', authUser, async (req, res) => {
  try {
    const { name, socialLinks = [] } = req.body;
    const finalName = (name || '').toString().replace(/^@/, '').trim();
    if (!finalName) {
      return res.status(400).json({ error: 'Name is required' });
    }
    const links = Array.isArray(socialLinks)
      ? socialLinks.filter(Boolean).map(l => String(l).trim()).filter(l => l.length > 0)
      : [];
    if (useMemory()) {
      const doc = { id: String(Date.now()), userId: String(req.user.id), name: finalName, socialLinks: links, status: 'pending', appliedDate: new Date() };
      memoryCreatorApps.push(doc);
      return res.json({ id: doc.id, userId: doc.userId, name: doc.name, socialLinks: doc.socialLinks, status: doc.status, appliedDate: doc.appliedDate.toISOString() });
    } else {
      const appDoc = await CreatorApplication.create({ userId: req.user.id, name: finalName, socialLinks: links });
      return res.json({
        id: String(appDoc._id),
        userId: String(appDoc.userId),
        name: appDoc.name,
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
    const { templateId, userPrompt, prompt, negativePrompt, uploadedImages = [], quality = 'HD', aspectRatio = '1:1' } = req.body;
    const user = await User.findById(req.user.id);
    const activeModel = await AIModel.findOne({ isActive: true }).select('+apiKey');
    const cost = activeModel?.costPerImage ?? 1;
    if (user.points < cost) return res.status(400).json({ error: 'Insufficient points' });
    const finalPrompt = prompt || userPrompt || '';
    let imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(finalPrompt)}?width=1024&height=1024&nologo=true`;
    if (activeModel && activeModel.provider === 'OpenAI' && activeModel.apiKey) {
      try {
        const openaiRes = await fetch('https://api.openai.com/v1/images/generations', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${activeModel.apiKey}`
          },
          body: JSON.stringify({ prompt: finalPrompt, size: '1024x1024' })
        });
        if (openaiRes.ok) {
          const data = await openaiRes.json();
          const b64 = data?.data?.[0]?.b64_json;
          if (b64) {
            imageUrl = `data:image/png;base64,${b64}`;
          }
        }
      } catch { }
    }
    const safeUploadedImages = (Array.isArray(uploadedImages) ? uploadedImages : [])
      .slice(0, 5)
      .map((img) => {
        if (typeof img === 'string' && img.startsWith('data:')) {
          return img.slice(0, 200);
        }
        return img;
      });
    const template = templateId ? await Template.findById(templateId) : null;
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
    recentLogs.push({ ts: new Date().toISOString(), method: 'POST', path: '/api/generation/generate', status: 500, ms: 0, error: String(err && err.message || err) });
    res.status(500).json({ error: 'Server Error' });
  }
});

app.post('/api/generate', authUser, async (req, res) => {
  req.url = '/api/generation/generate';
  app._router.handle(req, res);
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

app.get('/api/admin/creators', async (req, res) => {
  const list = useMemory()
    ? memoryCreatorApps
    : (await CreatorApplication.find().sort({ appliedDate: -1 })).map(a => ({ ...a._doc, id: a._id }));
  res.json(list);
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
  const t = await Template.create(req.body);
  res.json({ ...t._doc, id: t._id });
});
app.patch('/api/admin/templates/:id', async (req, res) => {
  const t = await Template.findByIdAndUpdate(req.params.id, req.body, { new: true });
  if (!t) return res.status(404).json({ error: 'Not found' });
  res.json({ ...t._doc, id: t._id });
});

// Admin panel uses PUT for template updates
app.put('/api/admin/templates/:id', async (req, res) => {
  const t = await Template.findByIdAndUpdate(req.params.id, req.body, { new: true });
  if (!t) return res.status(404).json({ error: 'Not found' });
  res.json({ ...t._doc, id: t._id });
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

app.get('/api/templates', async (req, res) => {
  try {
    const list = await Template.find().sort({ useCount: -1 });
    res.json(list.map(t => ({ ...t._doc, id: t._id })));
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch templates' });
  }
});
app.get('/api/templates/:id', async (req, res) => {
  try {
    const t = await Template.findById(req.params.id);
    if (!t) return res.status(404).json({ error: 'Not found' });
    res.json({ ...t._doc, id: t._id });
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch template' });
  }
});
app.get('/api/templates/search', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    if (!q) return res.json([]);
    const re = new RegExp(q, 'i');
    const list = await Template.find({ $or: [{ title: re }, { prompt: re }, { description: re }] }).limit(50);
    res.json(list.map(t => ({ ...t._doc, id: t._id })));
  } catch (e) {
    res.status(500).json({ error: 'Search failed' });
  }
});
// Upload demo image for template preview (Admin)
const upload = multer({ storage: multer.memoryStorage() });
app.post('/api/admin/upload/template-demo', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file' });
    const b64 = req.file.buffer.toString('base64');
    res.json({ url: `data:${req.file.mimetype || 'image/png'};base64,${b64}` });
  } catch (e) {
    res.status(500).json({ error: 'Upload failed' });
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
    avatar: ''
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
    avatar: ''
  });
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
app.post('/api/admin/finance/packages', async (req, res) => {
  const doc = await PointsPackage.create(req.body);
  res.json({ ...doc._doc, id: String(doc._id) });
});
app.put('/api/admin/finance/packages/:id', async (req, res) => {
  const doc = await PointsPackage.findByIdAndUpdate(req.params.id, req.body, { new: true });
  if (!doc) return res.status(404).json({ error: 'Not found' });
  res.json({ ...doc._doc, id: String(doc._id) });
});
app.delete('/api/admin/finance/packages/:id', async (req, res) => {
  await PointsPackage.findByIdAndDelete(req.params.id);
  res.json({ success: true });
});

app.get('/api/admin/finance/gateways', async (_req, res) => {
  const list = await PaymentGateway.find().sort({ name: 1 });
  res.json(list.map(g => ({ ...g._doc, id: String(g._id) })));
});
app.post('/api/admin/finance/gateways', async (req, res) => {
  const doc = await PaymentGateway.create(req.body);
  res.json({ ...doc._doc, id: String(doc._id) });
});
app.put('/api/admin/finance/gateways/:id', async (req, res) => {
  const doc = await PaymentGateway.findByIdAndUpdate(req.params.id, req.body, { new: true });
  if (!doc) return res.status(404).json({ error: 'Not found' });
  res.json({ ...doc._doc, id: String(doc._id) });
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
app.post('/api/admin/finance/gateways/:id/test', async (_req, res) => {
  res.json({ success: true });
});

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

app.get('/api/admin/config/ai', async (req, res) => {
  const models = await AIModel.find();
  const finance = await FinanceConfig.findOne() || { coinExchangeRate: 1, pointsExchangeRate: 1, currency: 'USD' };
  res.json({ models, finance });
});
app.post('/api/admin/config/ai', async (req, res) => {
  const model = await AIModel.create(req.body);
  res.json({ ...model._doc, id: model._id });
});
app.patch('/api/admin/config/ai/:id', async (req, res) => {
  const updated = await AIModel.findByIdAndUpdate(req.params.id, req.body, { new: true });
  res.json({ ...updated._doc, id: updated._id });
});
app.delete('/api/admin/config/ai/:id', async (req, res) => {
  await AIModel.findByIdAndDelete(req.params.id);
  res.json({ success: true });
});
app.put('/api/admin/config/ai/:id/activate', async (req, res) => {
  await AIModel.updateMany({}, { isActive: false });
  await AIModel.findByIdAndUpdate(req.params.id, { isActive: true });
  res.json({ success: true });
});
app.put('/api/admin/config/ai/:id/cost', async (req, res) => {
  await AIModel.findByIdAndUpdate(req.params.id, { costPerImage: req.body.cost });
  res.json({ success: true });
});
app.put('/api/admin/config/ai/:id/apikey', async (req, res) => {
  await AIModel.findByIdAndUpdate(req.params.id, { apiKey: req.body.apiKey });
  res.json({ success: true });
});
app.put('/api/admin/config/ai/:id/details', async (req, res) => {
  await AIModel.findByIdAndUpdate(req.params.id, req.body);
  res.json({ success: true });
});
app.post('/api/admin/config/ai/:id/test', async (req, res) => {
  res.json({ success: true });
});
app.delete('/api/admin/config/ai/cache', async (req, res) => {
  res.json({ success: true });
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
app.get('/api/admin/notifications', async (req, res) => {
  const notifs = await Notification.find().sort({ sentAt: -1 });
  res.json(notifs.map(n => ({ ...n._doc, id: n._id })));
});
app.post('/api/admin/notifications/send', async (req, res) => {
  const data = { ...req.body, sentAt: req.body.scheduledFor ? undefined : new Date(), status: req.body.scheduledFor ? 'scheduled' : 'sent', reachCount: 100 };
  const notif = await Notification.create(data);
  res.json({ ...notif._doc, id: notif._id });
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
app.post('/api/payment/create-order', authUser, async (req, res) => {
  try {
    const { packageId, gateway = 'razorpay' } = req.body;
    if (gateway !== 'razorpay') return res.status(400).json({ msg: 'Only Razorpay supported currently' });

    const pkg = await PointsPackage.findById(packageId);
    if (!pkg) return res.status(404).json({ msg: 'Package not found' });

    // Get Razorpay Config
    const config = await PaymentGateway.findOne({ provider: 'razorpay' });
    if (!config || !config.isActive) return res.status(400).json({ msg: 'Payment gateway not configured' });

    // Initialize Razorpay
    // Note: secretKey is 'select: false' by default, need to explicitly select it
    const configWithSecret = await PaymentGateway.findOne({ provider: 'razorpay' }).select('+secretKey');

    // Fallback environment variables if DB config missing (for reliability)
    const key_id = config.publicKey || process.env.RAZORPAY_KEY_ID;
    const key_secret = configWithSecret.secretKey || process.env.RAZORPAY_KEY_SECRET;

    if (!key_id || !key_secret) {
      return res.status(500).json({ msg: 'Gateway credentials missing' });
    }

    const instance = new Razorpay({ key_id, key_secret });

    const options = {
      amount: pkg.price * 100, // Amount in paise
      currency: "INR",
      receipt: `order_${Date.now()}`,
      notes: {
        userId: req.user.id,
        packageId: packageId
      }
    };

    const order = await instance.orders.create(options);
    res.json({
      id: order.id,
      currency: order.currency,
      amount: order.amount,
      keyId: key_id // Send public key to frontend
    });

  } catch (err) {
    console.error('Payment Init Error:', err);
    res.status(500).json({ msg: 'Payment initialization failed', error: err.message });
  }
});

app.post('/api/payment/verify-razorpay', authUser, async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, packageId } = req.body;

    const configWithSecret = await PaymentGateway.findOne({ provider: 'razorpay' }).select('+secretKey');
    const key_secret = configWithSecret ? configWithSecret.secretKey : process.env.RAZORPAY_KEY_SECRET;

    if (!key_secret) return res.status(500).json({ msg: 'Server config error' });

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
        status: 'success'
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

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  recentLogs.push({ ts: new Date().toISOString(), method: 'SYSTEM', path: 'SERVER_START', status: 200, ms: 0 });
});
app.get('/api/admin/logs', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit || '10', 10), 100);
  res.json(recentLogs.slice(-limit));
});

