require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bodyParser = require('body-parser');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const { 
  User, CreatorApplication, Transaction, AIModel, Template, 
  PointsPackage, PaymentGateway, FinanceConfig, Admin, Notification, Generation, ToolConfig 
} = require('./models');

const app = express();
const PORT = process.env.PORT || 5000;
// Simple in-memory recent logs buffer (last 100 entries)
const recentLogs = [];

// --- Middleware ---
const envOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:3002',
  'http://localhost:5000',
  'http://localhost:5001',
  'http://localhost:5002',
  ...envOrigins.map(o => o.replace(/`/g, '').trim()),
];
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) callback(null, true);
    else callback(new Error('Not allowed by CORS'));
  },
  credentials: true
}));
app.use((req, res, next) => {
  if (req.url.startsWith('/api/v1/')) {
    req.url = req.url.replace('/api/v1/', '/api/');
  }
  next();
});
app.use(bodyParser.json({ limit: '25mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '25mb' }));
// Request logging middleware
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

// --- Database Connection ---
mongoose.connect(process.env.MONGODB_URI)
  .then(() => {
    console.log('✅ MongoDB Connected Successfully');
    recentLogs.push({ ts: new Date().toISOString(), method: 'SYSTEM', path: 'MONGODB_CONNECTED', status: 200, ms: 0 });
  })
  .catch(err => {
    console.error('❌ MongoDB Connection Error:', err);
    recentLogs.push({ ts: new Date().toISOString(), method: 'SYSTEM', path: 'MONGODB_ERROR', status: 500, ms: 0 });
  });

// --- Auth Middleware ---
const authUser = (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ msg: 'No token, authorization denied' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret');
    req.user = decoded.user;
    next();
  } catch (err) {
    res.status(401).json({ msg: 'Token is not valid' });
  }
};

// --- Seed Initial Data ---
const seedDatabase = async () => {
  try {
    const adminCount = await Admin.countDocuments();
    if (adminCount === 0) {
      console.log('🌱 Seeding Super Admin...');
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
      console.log('🌱 Seeding Default AI Model (Pollinations)...');
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
      console.log('🌱 Seeding Templates...');
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
    const toolCfgCount = await ToolConfig.countDocuments();
    if (toolCfgCount === 0) {
      console.log('🌱 Seeding Quick Tools Config...');
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
};
seedDatabase();

// ==========================================
// USER APP ROUTES
// ==========================================

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
    const token = jwt.sign(payload, process.env.JWT_SECRET || 'secret', { expiresIn: '7d' });

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
    const token = jwt.sign(payload, process.env.JWT_SECRET || 'secret', { expiresIn: '7d' });

    res.json({ token, user: { id: user.id, name: user.name, email: user.email, points: user.points, role: user.role } });
  } catch (err) {
    res.status(500).send('Server Error');
  }
});

app.post('/api/auth/social-login', async (req, res) => {
  try {
    const { provider = 'google', email, name } = req.body;
    const finalEmail = email && String(email).trim() ? email : `${provider}_user_${Date.now()}@example.com`;
    let user = await User.findOne({ email: finalEmail });
    if (!user) {
      user = await User.create({ name: name || provider.charAt(0).toUpperCase() + provider.slice(1) + ' User', email: finalEmail, role: 'user', points: 100, status: 'active' });
    }
    const payload = { user: { id: user.id, role: user.role } };
    const token = jwt.sign(payload, process.env.JWT_SECRET || 'secret', { expiresIn: '7d' });
    res.json({ token, user: { id: user.id, name: user.name, email: user.email, points: user.points, role: user.role } });
  } catch (err) {
    res.status(500).send('Server Error');
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

// Unified Generation API compatible with frontend services
app.post('/api/generation/generate', authUser, async (req, res) => {
  try {
    const { templateId, userPrompt, prompt, negativePrompt, uploadedImages = [], quality = 'HD', aspectRatio = '1:1' } = req.body;
    const user = await User.findById(req.user.id);

    // Use active AI model cost
    const activeModel = await AIModel.findOne({ isActive: true }).select('+apiKey');
    const cost = activeModel?.costPerImage ?? 1;

    if (user.points < cost) return res.status(400).json({ error: 'Insufficient points' });

    const finalPrompt = prompt || userPrompt || '';

    // Provider-based generation: OpenAI (if configured), otherwise fallback to Pollinations
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
      } catch {}
    }

    // Sanitize uploaded image data URIs to avoid oversized MongoDB documents
    const safeUploadedImages = (Array.isArray(uploadedImages) ? uploadedImages : [])
      .slice(0, 5)
      .map((img) => {
        if (typeof img === 'string' && img.startsWith('data:')) {
          return img.slice(0, 200);
        }
        return img;
      });

    // Persist generation
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

    // Deduct points and log transaction
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
      userId: String(user._id),
      templateId: template ? String(template._id) : undefined,
      templateName: gen.templateName,
      prompt: gen.prompt,
      negativePrompt: gen.negativePrompt,
      uploadedImages: gen.uploadedImages,
      generatedImage: gen.generatedImage,
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

// Compatibility route for older path
app.post('/api/generate', authUser, async (req, res) => {
  req.url = '/api/generation/generate';
  app._router.handle(req, res);
});

app.get('/api/generation/history', authUser, async (req, res) => {
  const page = parseInt(req.query.page || '1', 10);
  const limit = parseInt(req.query.limit || '20', 10);
  const skip = (page - 1) * limit;
  const list = await Generation.find({ userId: req.user.id }).sort({ createdAt: -1 }).skip(skip).limit(limit);
  res.json({ generations: list.map(g => ({
    id: String(g._id),
    userId: String(g.userId),
    templateId: g.templateId ? String(g.templateId) : undefined,
    templateName: g.templateName,
    prompt: g.prompt,
    negativePrompt: g.negativePrompt,
    uploadedImages: g.uploadedImages,
    generatedImage: g.generatedImage,
    quality: g.quality,
    aspectRatio: g.aspectRatio,
    pointsSpent: g.pointsSpent,
    status: g.status,
    createdAt: g.createdAt.toISOString(),
    isFavorite: g.isFavorite,
    downloadCount: g.downloadCount,
    shareCount: g.shareCount
  })) });
});

app.get('/api/generation/:id', authUser, async (req, res) => {
  const g = await Generation.findOne({ _id: req.params.id, userId: req.user.id });
  if (!g) return res.status(404).json({ error: 'Not found' });
  res.json({
    id: String(g._id),
    userId: String(g.userId),
    templateId: g.templateId ? String(g.templateId) : undefined,
    templateName: g.templateName,
    prompt: g.prompt,
    negativePrompt: g.negativePrompt,
    uploadedImages: g.uploadedImages,
    generatedImage: g.generatedImage,
    quality: g.quality,
    aspectRatio: g.aspectRatio,
    pointsSpent: g.pointsSpent,
    status: g.status,
    createdAt: g.createdAt.toISOString(),
    isFavorite: g.isFavorite,
    downloadCount: g.downloadCount,
    shareCount: g.shareCount
  });
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

// ==========================================
// ADMIN API ROUTES (Full Implementation)
// ==========================================

// --- Admin Auth ---
app.post('/api/auth/admin-login', async (req, res) => {
  const { email, password } = req.body;
  try {
    if (email === process.env.SUPER_ADMIN_ID && password === process.env.SUPER_ADMIN_PASSWORD) {
       const payload = { user: { id: 'super_admin_env', role: 'super_admin' } };
       const token = jwt.sign(payload, process.env.JWT_SECRET || 'secret', { expiresIn: '12h' });
       return res.json({
         success: true, token,
         user: { name: 'Rahul Malik', role: 'super_admin', permissions: ['manage_users', 'manage_creators', 'manage_templates', 'manage_finance', 'manage_ai', 'manage_settings', 'view_reports'] }
       });
    }
    const admin = await Admin.findOne({ email }).select('+password');
    if (!admin || !(await bcrypt.compare(password, admin.password))) return res.status(400).json({ msg: 'Invalid Credentials' });
    
    admin.lastActive = new Date();
    await admin.save();
    const token = jwt.sign({ user: { id: admin.id, role: admin.role } }, process.env.JWT_SECRET || 'secret', { expiresIn: '12h' });
    res.json({ success: true, token, user: { name: admin.name, role: admin.role, permissions: admin.permissions } });
  } catch (err) { res.status(500).send('Server Error'); }
});

// --- Dashboard & Users ---
app.get('/api/admin/metrics', async (req, res) => {
  const activeUsers = await User.countDocuments({ status: 'active' });
  const totalRevenue = (await Transaction.aggregate([{ $match: { type: 'credit', status: 'success' } }, { $group: { _id: null, total: { $sum: '$amount' } } }]))[0]?.total || 0;
  res.json({ cpu: 15, memory: 40, requests: 1200, latency: 45, activeUsers, revenue: totalRevenue });
});

app.get('/api/admin/users', async (req, res) => {
  const users = await User.find().sort({ joinedDate: -1 }).limit(100);
  res.json(users.map(u => ({...u._doc, id: u._id})));
});

app.put('/api/admin/users/:id/status', async (req, res) => {
  await User.findByIdAndUpdate(req.params.id, { status: req.body.status });
  res.json({ success: true });
});

app.post('/api/admin/users/:id/temp-password', async (req, res) => {
  try {
    const { tempPassword } = req.body;
    if (!tempPassword || String(tempPassword).length < 6) {
      return res.status(400).json({ error: 'Invalid password' });
    }
    const hashed = await bcrypt.hash(String(tempPassword), 10);
    await User.findByIdAndUpdate(req.params.id, { password: hashed });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Server Error' });
  }
});

// --- Creator Management ---
app.get('/api/admin/creators/applications', async (req, res) => {
  const apps = await CreatorApplication.find().sort({ appliedDate: -1 });
  res.json(apps.map(a => ({...a._doc, id: a._id})));
});

app.post('/api/admin/creators/applications/:id/approve', async (req, res) => {
  const app = await CreatorApplication.findByIdAndUpdate(req.params.id, { status: 'approved' });
  await User.findByIdAndUpdate(app.userId, { role: 'creator' });
  res.json({ success: true });
});

app.post('/api/admin/creators/applications/:id/reject', async (req, res) => {
  await CreatorApplication.findByIdAndUpdate(req.params.id, { status: 'rejected' });
  res.json({ success: true });
});

// --- Finance ---
app.get('/api/admin/finance/transactions', async (req, res) => {
  const txns = await Transaction.find().sort({ date: -1 }).limit(100);
  res.json(txns.map(t => ({...t._doc, id: t._id})));
});

app.get('/api/admin/finance/packages', async (req, res) => {
  const pkgs = await PointsPackage.find();
  res.json(pkgs.map(p => ({...p._doc, id: p._id})));
});

app.post('/api/admin/finance/packages', async (req, res) => {
  const pkg = await PointsPackage.create(req.body);
  res.json({...pkg._doc, id: pkg._id});
});

app.put('/api/admin/finance/packages/:id', async (req, res) => {
  await PointsPackage.findByIdAndUpdate(req.params.id, req.body);
  res.json({ success: true });
});

app.delete('/api/admin/finance/packages/:id', async (req, res) => {
  await PointsPackage.findByIdAndDelete(req.params.id);
  res.json({ success: true });
});

app.get('/api/admin/finance/gateways', async (req, res) => {
  const gws = await PaymentGateway.find();
  res.json(gws.map(g => ({...g._doc, id: g._id})));
});

app.put('/api/admin/finance/gateways/:id', async (req, res) => {
  await PaymentGateway.findByIdAndUpdate(req.params.id, req.body);
  res.json({ success: true });
});

app.get('/api/admin/finance/config', async (req, res) => {
  let config = await FinanceConfig.findOne();
  if (!config) config = await FinanceConfig.create({});
  res.json(config);
});

app.put('/api/admin/finance/config', async (req, res) => {
  const config = await FinanceConfig.findOneAndUpdate({}, req.body, { new: true, upsert: true });
  res.json(config);
});

// --- Payments (Simulated) ---
app.post('/api/payment/create-order', authUser, async (req, res) => {
  const { packageId, gateway = 'razorpay' } = req.body;
  const pkg = await PointsPackage.findOne({ $or: [{ _id: packageId }, { name: packageId }] });
  if (!pkg) return res.status(404).json({ error: 'Package not found' });
  const orderId = `order_${Date.now()}`;
  let key = process.env.RAZORPAY_KEY || 'rzp_test_key';
  try {
    const gwCfg = await PaymentGateway.findOne({ $or: [ { name: new RegExp(`^${gateway}$`, 'i') }, { provider: new RegExp(`^${gateway}$`, 'i') } ] });
    if (gwCfg && gwCfg.isActive && gwCfg.publicKey) {
      key = gwCfg.publicKey;
    }
  } catch {}
  res.json({ key, amount: pkg.price, currency: 'INR', orderId, gateway });
});

app.post('/api/payment/verify-razorpay', authUser, async (req, res) => {
  const { packageId } = req.body;
  const pkg = await PointsPackage.findOne({ $or: [{ _id: packageId }, { name: packageId }] });
  if (!pkg) return res.status(404).json({ error: 'Package not found' });
  const user = await User.findById(req.user.id);
  const add = (pkg.points || 0) + (pkg.bonusPoints || 0);
  user.points += add;
  await user.save();
  await Transaction.create({ userId: user._id, amount: pkg.price, type: 'credit', description: `Purchased ${pkg.name}`, gateway: 'Razorpay', status: 'success', date: new Date() });
  res.json({ success: true, newBalance: user.points });
});

// --- Templates ---
app.get('/api/admin/templates', async (req, res) => {
  const templates = await Template.find().sort({ _id: -1 });
  const mapped = templates.map(t => ({
    ...t._doc,
    id: t._id,
    imageUrl: (t.imageUrl && t.imageUrl.trim()) ? t.imageUrl : `https://image.pollinations.ai/prompt/${encodeURIComponent(t.prompt || t.title || 'beautiful portrait, soft lighting')}?width=768&height=768&nologo=true`
  }));
  res.json(mapped);
});

app.post('/api/admin/templates', async (req, res) => {
  const t = await Template.create(req.body);
  res.json({...t._doc, id: t._id});
});

app.delete('/api/admin/templates/:id', async (req, res) => {
  await Template.findByIdAndDelete(req.params.id);
  res.json({ success: true });
});

app.get('/api/templates', async (req, res) => {
  const templates = await Template.find().sort({ _id: -1 });
  const mapped = templates.map(t => ({
    id: t._id,
    title: t.title || '',
    description: t.prompt || '',
    image: t.imageUrl && t.imageUrl.trim() ? t.imageUrl : `https://image.pollinations.ai/prompt/${encodeURIComponent(t.prompt || t.title || 'beautiful portrait, soft lighting')}?width=768&height=768&nologo=true`,
    demoImage: t.imageUrl && t.imageUrl.trim() ? t.imageUrl : `https://image.pollinations.ai/prompt/${encodeURIComponent(t.prompt || t.title || 'beautiful portrait, soft lighting')}?width=768&height=768&nologo=true`,
    additionalImages: [],
    category: 'unisex',
    subCategory: 'portrait',
    tags: (t.prompt || '').split(/\s+/).filter(Boolean).slice(0,5),
    creatorId: 'system',
    creatorName: 'Rupantar',
    creatorAvatar: '',
    creatorBio: '',
    creatorVerified: true,
    hiddenPrompt: t.prompt || '',
    visiblePrompt: t.prompt || '',
    negativePrompt: '',
    isFree: !t.isPremium,
    pointsCost: t.isPremium ? 30 : 0,
    usageCount: t.useCount || 0,
    views: 0,
    earnings: 0,
    likeCount: 0,
    saveCount: 0,
    rating: 4.5,
    ratingCount: 10,
    ageGroup: 'All Ages',
    state: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: (t.status === 'active' ? 'approved' : 'pending')
  }));
  res.json(mapped);
});

app.get('/api/templates/:id', async (req, res) => {
  const t = await Template.findById(req.params.id);
  if (!t) return res.status(404).json({ error: 'Not found' });
  const mapped = {
    id: t._id,
    title: t.title || '',
    description: t.prompt || '',
    image: t.imageUrl && t.imageUrl.trim() ? t.imageUrl : `https://image.pollinations.ai/prompt/${encodeURIComponent(t.prompt || t.title || 'beautiful portrait, soft lighting')}?width=768&height=768&nologo=true`,
    demoImage: t.imageUrl && t.imageUrl.trim() ? t.imageUrl : `https://image.pollinations.ai/prompt/${encodeURIComponent(t.prompt || t.title || 'beautiful portrait, soft lighting')}?width=768&height=768&nologo=true`,
    additionalImages: [],
    category: 'unisex',
    subCategory: 'portrait',
    tags: (t.prompt || '').split(/\s+/).filter(Boolean).slice(0,5),
    creatorId: 'system',
    creatorName: 'Rupantar',
    creatorAvatar: '',
    creatorBio: '',
    creatorVerified: true,
    hiddenPrompt: t.prompt || '',
    visiblePrompt: t.prompt || '',
    negativePrompt: '',
    isFree: !t.isPremium,
    pointsCost: t.isPremium ? 30 : 0,
    usageCount: t.useCount || 0,
    views: 0,
    earnings: 0,
    likeCount: 0,
    saveCount: 0,
    rating: 4.5,
    ratingCount: 10,
    ageGroup: 'All Ages',
    state: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: (t.status === 'active' ? 'approved' : 'pending')
  };
  res.json(mapped);
});

app.get('/api/admin/creators/stats', async (req, res) => {
  const creators = await User.find({ role: 'creator' }).select('_id followersCount likesCount usesCount');
  const stats = creators.map(c => ({
    userId: c._id,
    followers: c.followersCount || 0,
    likes: c.likesCount || 0,
    uses: c.usesCount || 0,
  }));
  res.json(stats);
});

// --- AI Configuration ---
app.get('/api/admin/config/ai', async (req, res) => {
  const models = await AIModel.find();
  res.json(models.map(m => ({...m._doc, id: m._id})));
});

app.post('/api/admin/config/ai', async (req, res) => {
  const m = await AIModel.create(req.body);
  res.json({...m._doc, id: m._id});
});

app.post('/api/admin/config/ai/:id/toggle', async (req, res) => {
  await AIModel.findByIdAndUpdate(req.params.id, { isActive: req.body.isActive });
  res.json({ success: true });
});

// --- Quick Tools Configuration (Admin) ---
app.get('/api/admin/tools/config', async (req, res) => {
  let cfg = await ToolConfig.findOne();
  if (!cfg) cfg = await ToolConfig.create({ tools: [] });
  res.json({ id: cfg._id, tools: cfg.tools });
});

app.put('/api/admin/tools/config', async (req, res) => {
  const cfg = await ToolConfig.findOneAndUpdate({}, { tools: req.body.tools, updatedAt: new Date() }, { new: true, upsert: true });
  res.json({ id: cfg._id, tools: cfg.tools });
});

// --- Wallet Endpoints ---
app.get('/api/wallet/balance', authUser, async (req, res) => {
  const user = await User.findById(req.user.id);
  res.json({ balance: user.points });
});

app.get('/api/wallet/transactions', authUser, async (req, res) => {
  const page = parseInt(req.query.page || '1', 10);
  const limit = parseInt(req.query.limit || '20', 10);
  const skip = (page - 1) * limit;
  const list = await Transaction.find({ userId: req.user.id }).sort({ date: -1 }).skip(skip).limit(limit);
  res.json({ transactions: list.map(t => ({
    id: String(t._id),
    userId: String(t.userId),
    type: t.type === 'credit' ? 'credit' : 'debit',
    amount: t.amount,
    balanceAfter: undefined,
    description: t.description,
    referenceId: undefined,
    relatedTemplateId: undefined,
    relatedGenerationId: undefined,
    paymentMethod: t.gateway,
    createdAt: t.date.toISOString()
  })) });
});

app.post('/api/wallet/add-points', authUser, async (req, res) => {
  const { amount, description } = req.body;
  const user = await User.findById(req.user.id);
  user.points += Number(amount || 0);
  await user.save();
  await Transaction.create({ userId: user._id, amount: Number(amount || 0), type: 'credit', description: description || 'Admin credit', gateway: 'System', status: 'success', date: new Date() });
  res.json({ success: true, balance: user.points });
});

// --- Quick Tools Endpoints (User) ---
const performToolAndCharge = async (userId, toolKey, imageUrl) => {
  const cfg = await ToolConfig.findOne();
  const def = cfg?.tools?.find(t => t.key === toolKey);
  const cost = def ? def.cost : 1;
  const user = await User.findById(userId);
  if (user.points < cost) throw new Error('Insufficient points');
  user.points -= cost;
  user.usesCount = (user.usesCount || 0) + 1;
  await user.save();
  await Transaction.create({ userId, amount: cost, type: 'debit', description: `Quick Tool: ${toolKey}`, gateway: 'System', status: 'success', date: new Date() });
  // Simulated processed image URL marker
  const processedImage = `${imageUrl}${imageUrl.includes('?') ? '&' : '?'}tool=${encodeURIComponent(toolKey)}`;
  return { processedImage, cost, remainingPoints: user.points };
};

app.post('/api/tools/remove-bg', authUser, async (req, res) => {
  try {
    const { imageUrl } = req.body;
    const out = await performToolAndCharge(req.user.id, 'remove-bg', imageUrl);
    res.json(out);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.post('/api/tools/upscale', authUser, async (req, res) => {
  try {
    const { imageUrl } = req.body;
    const out = await performToolAndCharge(req.user.id, 'upscale', imageUrl);
    res.json(out);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.post('/api/tools/face-enhance', authUser, async (req, res) => {
  try {
    const { imageUrl } = req.body;
    const out = await performToolAndCharge(req.user.id, 'face-enhance', imageUrl);
    res.json(out);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.post('/api/tools/compress', authUser, async (req, res) => {
  try {
    const { imageUrl } = req.body;
    const out = await performToolAndCharge(req.user.id, 'compress', imageUrl);
    res.json(out);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.post('/api/tools/colorize', authUser, async (req, res) => {
  try {
    const { imageUrl } = req.body;
    const out = await performToolAndCharge(req.user.id, 'colorize', imageUrl);
    res.json(out);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.post('/api/tools/style', authUser, async (req, res) => {
  try {
    const { imageUrl } = req.body;
    const out = await performToolAndCharge(req.user.id, 'style', imageUrl);
    res.json(out);
  } catch (e) { res.status(400).json({ error: e.message }); }
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
  // Simulate test
  res.json({ success: true });
});

// --- System Maintenance ---
app.delete('/api/admin/config/ai/cache', async (req, res) => {
  res.json({ success: true });
});

// --- System & Notifications ---
app.get('/api/admin/system/admins', async (req, res) => {
  const admins = await Admin.find();
  res.json(admins.map(a => ({...a._doc, id: a._id})));
});

app.post('/api/admin/system/admins', async (req, res) => {
  const hashedPassword = await bcrypt.hash(req.body.password, 10);
  const admin = await Admin.create({ ...req.body, password: hashedPassword });
  res.json({...admin._doc, id: admin._id});
});

app.delete('/api/admin/system/admins/:id', async (req, res) => {
  await Admin.findByIdAndDelete(req.params.id);
  res.json({ success: true });
});

app.get('/api/admin/notifications', async (req, res) => {
  const notifs = await Notification.find().sort({ sentAt: -1 });
  res.json(notifs.map(n => ({...n._doc, id: n._id})));
});

app.post('/api/admin/notifications/send', async (req, res) => {
  const data = { ...req.body, sentAt: req.body.scheduledFor ? undefined : new Date(), status: req.body.scheduledFor ? 'scheduled' : 'sent', reachCount: 100 };
  const notif = await Notification.create(data);
  res.json({...notif._doc, id: notif._id});
});

// --- Server Start ---
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  recentLogs.push({ ts: new Date().toISOString(), method: 'SYSTEM', path: 'SERVER_START', status: 200, ms: 0 });
});
// --- Admin recent logs ---
app.get('/api/admin/logs', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit || '10', 10), 100);
  res.json(recentLogs.slice(-limit));
});
