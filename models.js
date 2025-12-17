const mongoose = require('mongoose');

// 1. User Schema
const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, select: false },
  role: { type: String, enum: ['user', 'creator', 'admin'], default: 'user' },
  points: { type: Number, default: 0 },
  status: { type: String, enum: ['active', 'banned', 'pending'], default: 'active' },
  joinedDate: { type: Date, default: Date.now },
  followersCount: { type: Number, default: 0 },
  likesCount: { type: Number, default: 0 },
  usesCount: { type: Number, default: 0 },
  firebaseUid: { type: String, index: true },
  photoURL: { type: String }
});

// 2. Creator Application Schema
const creatorAppSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  name: { type: String, required: true },
  socialLinks: [{ type: String }],
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  appliedDate: { type: Date, default: Date.now }
});

// 3. Transaction Schema
const transactionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // Can be null for system transactions
  amount: { type: Number, required: true },
  type: { type: String, enum: ['credit', 'debit'], required: true },
  description: { type: String },
  gateway: { type: String, default: 'System' },
  status: { type: String, enum: ['success', 'failed'], default: 'success' },
  date: { type: Date, default: Date.now }
});

// 4. AI Model Config Schema
const aiModelSchema = new mongoose.Schema({
  name: { type: String, required: true },
  provider: { type: String, required: true },
  costPerImage: { type: Number, default: 1.0 },
  isActive: { type: Boolean, default: false },
  apiKey: { type: String, select: false } // Hide API Key by default
});

// 5. Template Schema
const templateSchema = new mongoose.Schema({
  title: { type: String, required: true },
  imageUrl: { type: String, required: true },
  category: { type: String, default: 'General' },
  subCategory: { type: String, default: '' },
  prompt: { type: String },
  status: { type: String, enum: ['active', 'draft'], default: 'active' },
  useCount: { type: Number, default: 0 },
  viewCount: { type: Number, default: 0 },
  isPremium: { type: Boolean, default: false },
  source: { type: String, default: 'manual' },
  creatorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  likeCount: { type: Number, default: 0 }
});

// 5b. Category Schema (Admin-managed)
const categorySchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  subCategories: [{ type: String }]
});

// 6. Points Package Schema
const pointsPackageSchema = new mongoose.Schema({
  name: { type: String, required: true },
  price: { type: Number, required: true },
  points: { type: Number, required: true },
  bonusPoints: { type: Number, default: 0 },
  isPopular: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true },
  tag: String
});

// 7. Payment Gateway Config Schema
const gatewaySchema = new mongoose.Schema({
  name: { type: String, required: true },
  provider: { type: String, required: true },
  isActive: { type: Boolean, default: false },
  isTestMode: { type: Boolean, default: true },
  publicKey: { type: String, default: '' },
  secretKey: { type: String, default: '', select: false }
});

// 8. Finance Config Schema (Singleton)
const financeConfigSchema = new mongoose.Schema({
  costPerCredit: { type: Number, default: 0.20 },
  pointsPerRupee: { type: Number, default: 5 }, // Users get 5 points for 1 Rupee
  creatorPayoutPerPoint: { type: Number, default: 0.10 }, // Creators get 0.10 Rupee per point
  currency: { type: String, default: 'INR' },
  taxRate: { type: Number, default: 18 }
});

// 9. Sub Admin Schema
const adminSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true, select: false },
  role: { type: String, enum: ['super_admin', 'admin', 'moderator', 'support'], default: 'admin' },
  permissions: [{ type: String }],
  status: { type: String, enum: ['active', 'suspended'], default: 'active' },
  lastActive: { type: Date }
});

// 10. Notification Schema
const notificationSchema = new mongoose.Schema({
  title: { type: String, required: true },
  message: { type: String, required: true },
  target: { type: String, required: true },
  type: { type: String, required: true },
  status: { type: String, default: 'sent' },
  sentAt: { type: Date },
  scheduledFor: { type: Date },
  reachCount: { type: Number, default: 0 },
  imageUrl: String,
  ctaLink: String
});

// 11. Generation Schema
const generationSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  templateId: { type: mongoose.Schema.Types.ObjectId, ref: 'Template' },
  templateName: { type: String },
  prompt: { type: String, required: true },
  negativePrompt: { type: String },
  uploadedImages: [{ type: String }],
  generatedImage: { type: String, required: true },
  quality: { type: String, enum: ['SD', 'HD', 'UHD', '2K', '4K', '8K'], default: 'HD' },
  aspectRatio: { type: String, default: '1:1' },
  pointsSpent: { type: Number, default: 0 },
  status: { type: String, enum: ['pending', 'processing', 'completed', 'failed'], default: 'completed' },
  createdAt: { type: Date, default: Date.now },
  isFavorite: { type: Boolean, default: false },
  downloadCount: { type: Number, default: 0 },
  shareCount: { type: Number, default: 0 }
});

// 12. Quick Tools Config Schema
const toolConfigSchema = new mongoose.Schema({
  tools: [
    {
      key: { type: String, required: true }, // remove-bg, upscale, face-enhance, compress, colorize, style
      name: { type: String, required: true },
      cost: { type: Number, default: 1 },
      isActive: { type: Boolean, default: true },
      provider: { type: String, default: 'System' },
      apiKey: { type: String }
    }
  ],
  updatedAt: { type: Date, default: Date.now }
});

// 13. Filter Config (Admin-managed for Template Filters)
const filterConfigSchema = new mongoose.Schema({
  genders: [{ type: String }], // e.g., ['male','female','unisex']
  ageGroups: [{ type: String }], // e.g., ['18-25','25-35','35-45','45+','All Ages']
  updatedAt: { type: Date, default: Date.now }
});

module.exports = {
  User: mongoose.model('User', userSchema),
  CreatorApplication: mongoose.model('CreatorApplication', creatorAppSchema),
  Transaction: mongoose.model('Transaction', transactionSchema),
  AIModel: mongoose.model('AIModel', aiModelSchema),
  Template: mongoose.model('Template', templateSchema),
  Category: mongoose.model('Category', categorySchema),
  PointsPackage: mongoose.model('PointsPackage', pointsPackageSchema),
  PaymentGateway: mongoose.model('PaymentGateway', gatewaySchema),
  FinanceConfig: mongoose.model('FinanceConfig', financeConfigSchema),
  Admin: mongoose.model('Admin', adminSchema),
  Notification: mongoose.model('Notification', notificationSchema),
  Generation: mongoose.model('Generation', generationSchema),
  ToolConfig: mongoose.model('ToolConfig', toolConfigSchema),
  FilterConfig: mongoose.model('FilterConfig', filterConfigSchema)
};
