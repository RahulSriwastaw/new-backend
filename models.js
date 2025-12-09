const mongoose = require('mongoose');

// 1. User Schema
const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  role: { type: String, enum: ['user', 'creator', 'admin'], default: 'user' },
  points: { type: Number, default: 0 },
  status: { type: String, enum: ['active', 'banned', 'pending'], default: 'active' },
  joinedDate: { type: Date, default: Date.now }
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
  prompt: { type: String },
  status: { type: String, enum: ['active', 'draft'], default: 'active' },
  useCount: { type: Number, default: 0 },
  isPremium: { type: Boolean, default: false },
  source: { type: String, default: 'manual' }
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

module.exports = {
  User: mongoose.model('User', userSchema),
  CreatorApplication: mongoose.model('CreatorApplication', creatorAppSchema),
  Transaction: mongoose.model('Transaction', transactionSchema),
  AIModel: mongoose.model('AIModel', aiModelSchema),
  Template: mongoose.model('Template', templateSchema),
  PointsPackage: mongoose.model('PointsPackage', pointsPackageSchema),
  PaymentGateway: mongoose.model('PaymentGateway', gatewaySchema),
  FinanceConfig: mongoose.model('FinanceConfig', financeConfigSchema),
  Admin: mongoose.model('Admin', adminSchema),
  Notification: mongoose.model('Notification', notificationSchema)
};