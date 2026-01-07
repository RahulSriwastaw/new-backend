const mongoose = require('mongoose');

// 1. User Schema
const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, select: false },
  role: { type: String, enum: ['user', 'creator', 'admin'], default: 'user' },
  points: { type: Number, default: 0 },
  status: { type: String, enum: ['active', 'banned', 'pending', 'suspended'], default: 'active' },
  joinedDate: { type: Date, default: Date.now },
  followersCount: { type: Number, default: 0 },
  likesCount: { type: Number, default: 0 },
  usesCount: { type: Number, default: 0 },
  firebaseUid: { type: String, index: true },
  photoURL: { type: String },
  isVerified: { type: Boolean, default: false },
  isWalletFrozen: { type: Boolean, default: false },
  username: { type: String, unique: true, sparse: true },
  rank: { type: Number, default: 0 },
  totalEarnings: { type: Number, default: 0 },
  pendingEarnings: { type: Number, default: 0 },
  suspensionReason: { type: String },
  suspendedUntil: { type: Date }
});

// 2. Creator Application Schema
const creatorAppSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  name: { type: String, required: true },
  socialLinks: [{ type: String }],
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  appliedDate: { type: Date, default: Date.now },
  demoTemplates: [{
    image: { type: String },
    prompt: { type: String }
  }],
  bio: { type: String },
  rejectionReason: { type: String },
  paymentDetails: {
    accountHolderName: { type: String },
    bankName: { type: String },
    accountNumber: { type: String },
    ifscCode: { type: String },
    panNumber: { type: String },
    upiId: { type: String },
    lastUpdated: { type: Date }
  }
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

// 4. AI Model Config Schema (Multi-AI System)
const aiModelSchema = new mongoose.Schema({
  key: {
    type: String,
    required: true,
    unique: true
  },
  name: { type: String, required: true },
  provider: { type: String, required: true },
  active: { type: Boolean, default: false },
  supportsImageToImage: { type: Boolean, default: true },
  priority: { type: Number, default: 1 },
  costPerImage: { type: Number, default: 1.0 },
  config: {
    apiKey: { type: String, select: false },
    model: { type: String },
    defaultParams: { type: mongoose.Schema.Types.Mixed }
  },
  stats: {
    totalGenerations: { type: Number, default: 0 },
    successRate: { type: Number, default: 100 },
    averageTime: { type: Number, default: 0 }
  },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Ensure only ONE AI can be active at a time
aiModelSchema.pre('save', async function (next) {
  if (this.active) {
    await this.constructor.updateMany(
      { _id: { $ne: this._id } },
      { active: false }
    );
  }
  this.updatedAt = new Date();
  next();
});

// 5. Template Schema
const templateSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String },
  inputImage: { type: String }, // User's original photo (BEFORE)
  inputImagePosition: { type: String, default: 'center center' }, // Position for input image display
  imageUrl: { type: String, required: true }, // Generated result (AFTER)
  demoImagePosition: { type: String, default: 'center center' }, // Position for demo image display
  category: { type: String, default: 'General' },
  subCategory: { type: String, default: '' },
  prompt: { type: String },
  negativePrompt: { type: String },
  tags: [{ type: String }],
  gender: { type: String, enum: ['Male', 'Female', 'Unisex', ''], default: '' },
  ageGroup: { type: String, default: '' },
  state: { type: String, default: '' }, // For Indian filters
  status: { type: String, enum: ['active', 'draft', 'paused'], default: 'active' },
  useCount: { type: Number, default: 0 },
  viewCount: { type: Number, default: 0 },
  isPremium: { type: Boolean, default: false },
  // Template Type & Source
  type: { type: String, enum: ['Official', 'Creator'], default: 'Creator' },
  source: { type: String, enum: ['admin', 'creator'], default: 'creator' },
  isOfficial: { type: Boolean, default: false },
  creatorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now },
  likeCount: { type: Number, default: 0 },
  likedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], // Track which users liked this template
  savesCount: { type: Number, default: 0 },
  savedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], // Track which users saved this template
  shareCount: { type: Number, default: 0 },
  // Approval Workflow
  approvalStatus: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  rejectionReason: { type: String },
  approvedAt: { type: Date },
  rejectedAt: { type: Date },
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  submittedAt: { type: Date, default: Date.now },
  isFeatured: { type: Boolean, default: false },
  isPaused: { type: Boolean, default: false },
  earningsGenerated: { type: Number, default: 0 },
  adminNotes: { type: String },
  pointsCost: { type: Number, default: 0 }
});

// 5b. Category Schema (Admin-managed)
const categorySchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  subCategories: [{ type: String }],
  icon: { type: String },
  description: { type: String },
  isActive: { type: Boolean, default: true },
  order: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// 6. Points Package Schema
const pointsPackageSchema = new mongoose.Schema({
  name: { type: String, required: true },
  price: { type: Number, required: true },
  points: { type: Number, required: true },
  bonusPoints: { type: Number, default: 0 },
  isPopular: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true },
  tag: String,
  historyRetentionDays: { type: Number, default: 30 } // How many days generated images stay in history for this package
});

// 7. Payment Gateway Config Schema
// Note: Credentials (publicKey, secretKey) are stored in environment variables, not in database
const gatewaySchema = new mongoose.Schema({
  name: { type: String, required: true },
  provider: { type: String, required: true },
  isActive: { type: Boolean, default: false },
  isTestMode: { type: Boolean, default: true }
  // publicKey and secretKey removed - now stored in environment variables only
});

// 8. Finance Config Schema (Singleton)
const financeConfigSchema = new mongoose.Schema({
  costPerCredit: { type: Number, default: 0.20 },
  pointsPerRupee: { type: Number, default: 5 }, // Users get 5 points for 1 Rupee
  creatorPayoutPerPoint: { type: Number, default: 0.10 }, // Creators get 0.10 Rupee per point
  currency: { type: String, default: 'INR' },
  taxRate: { type: Number, default: 18 }
});

// 8b. History Retention Config Schema (Singleton) - Admin controls for Cloudinary budget
const historyRetentionConfigSchema = new mongoose.Schema({
  defaultRetentionDays: { type: Number, default: 30 }, // Default retention for all users
  enableAutoCleanup: { type: Boolean, default: true }, // Enable automatic cleanup of old images
  cleanupSchedule: { type: String, default: 'daily' }, // 'daily', 'weekly', 'monthly'
  lastCleanupDate: { type: Date },
  totalImagesDeleted: { type: Number, default: 0 }, // Track for analytics
  updatedAt: { type: Date, default: Date.now }
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
  shareCount: { type: Number, default: 0 },
  modelUsed: { type: String }, // Track which AI model was used (e.g., "Pollinations Images", "Minimax I2I")
  modelProvider: { type: String }, // Track provider (e.g., "Pollinations", "MiniMax")
  seed: { type: Number } // Random seed for reproducibility and variation
});

// Add compound index for efficient querying by userId and createdAt (for history endpoint)
// This prevents "Sort exceeded memory limit" errors by allowing MongoDB to use the index for sorting
generationSchema.index({ userId: 1, createdAt: -1 });

// 12. Quick Tools Config Schema
const toolConfigSchema = new mongoose.Schema({
  tools: [
    {
      key: { type: String, required: true }, // remove-bg, upscale, face-enhance, compress, colorize, style
      name: { type: String, required: true },
      cost: { type: Number, default: 1 },
      isActive: { type: Boolean, default: true },
      provider: { type: String, default: 'System' },
      apiKey: { type: String },
      modelIdentifier: { type: String } // For Replicate: e.g., 'lucataco/remove-bg'
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

// 14. Ads Config Schema (Admin-managed Ad System)
const adsConfigSchema = new mongoose.Schema({
  isEnabled: { type: Boolean, default: true },
  provider: { type: String, default: 'google_admob' }, // 'google_admob', 'custom', 'facebook_audience'

  // Reward Configuration
  rewardType: { type: String, enum: ['fixed', 'random', 'range'], default: 'fixed' },
  fixedPoints: { type: Number, default: 5 }, // Points for 'fixed' type
  randomMin: { type: Number, default: 3 }, // Min points for 'random/range' type
  randomMax: { type: Number, default: 10 }, // Max points for 'random/range' type

  // Page-wise Ad Placement (Toggle for each page)
  pages: {
    home: { type: Boolean, default: true },
    templates: { type: Boolean, default: true },
    generate: { type: Boolean, default: true },
    history: { type: Boolean, default: false },
    profile: { type: Boolean, default: false },
    wallet: { type: Boolean, default: true },
    rewards: { type: Boolean, default: true }
  },

  // Template Page Specific Settings
  templateAdsSettings: {
    showBetweenTemplates: { type: Boolean, default: true },
    frequency: { type: Number, default: 6 }, // Show ad after every N templates
  },

  // Ad Provider IDs (for different platforms)
  adIds: {
    bannerId: { type: String, default: '' },
    interstitialId: { type: String, default: '' },
    rewardedId: { type: String, default: '' },
    nativeId: { type: String, default: '' }
  },

  // Daily Limits
  maxAdsPerUser: { type: Number, default: 20 }, // Max ads a user can watch per day
  cooldownMinutes: { type: Number, default: 3 }, // Cooldown between ads

  updatedAt: { type: Date, default: Date.now }
});

// 15. Withdrawal Request Schema (Creator Payouts)
const withdrawalSchema = new mongoose.Schema({
  creatorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  amount: { type: Number, required: true },
  status: { type: String, enum: ['pending', 'processing', 'completed', 'rejected'], default: 'pending' },
  method: { type: String, enum: ['bank', 'upi'], required: true },
  bankDetails: {
    accountHolderName: { type: String },
    bankName: { type: String },
    accountNumber: { type: String },
    ifscCode: { type: String },
    accountType: { type: String, enum: ['savings', 'current'], default: 'savings' },
    panNumber: { type: String }
  },
  upiId: { type: String },
  requestedAt: { type: Date, default: Date.now },
  processedAt: { type: Date },
  transactionId: { type: String },
  remarks: { type: String },
  adminNotes: { type: String },
  proofOfPayment: { type: String },
  utr: { type: String },
  processedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' }
});

// 16. Creator Notification Schema
const creatorNotificationSchema = new mongoose.Schema({
  creatorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type: { type: String, enum: ['template', 'payment', 'system', 'earning', 'withdrawal'], required: true },
  title: { type: String, required: true },
  message: { type: String, required: true },
  read: { type: Boolean, default: false },
  relatedId: { type: mongoose.Schema.Types.ObjectId }, // Related template/withdrawal ID
  createdAt: { type: Date, default: Date.now }
});

// 17. Creator Earning Schema (Track template earnings)
const creatorEarningSchema = new mongoose.Schema({
  creatorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  templateId: { type: mongoose.Schema.Types.ObjectId, ref: 'Template', required: true },
  templateName: { type: String },
  amount: { type: Number, required: true },
  pointsEarned: { type: Number, default: 0 },
  usageCount: { type: Number, default: 1 },
  date: { type: Date, default: Date.now }
});
creatorEarningSchema.index({ creatorId: 1, date: -1 });

// 18. Admin Action Log Schema (NEW)
const adminActionLogSchema = new mongoose.Schema({
  adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true },
  adminName: { type: String },
  targetType: { type: String, enum: ['user', 'creator', 'template', 'withdrawal', 'system'], required: true },
  targetId: { type: mongoose.Schema.Types.ObjectId },
  action: { type: String, required: true },
  details: { type: String },
  metadata: { type: mongoose.Schema.Types.Mixed },
  timestamp: { type: Date, default: Date.now }
});
adminActionLogSchema.index({ targetType: 1, targetId: 1, timestamp: -1 });

// 19. Creator Stats Cache Schema (NEW)
const creatorStatsCacheSchema = new mongoose.Schema({
  creatorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  totalTemplates: { type: Number, default: 0 },
  totalUses: { type: Number, default: 0 },
  totalFollowers: { type: Number, default: 0 },
  totalLikes: { type: Number, default: 0 },
  totalSaves: { type: Number, default: 0 },
  totalEarnings: { type: Number, default: 0 },
  totalEarningsINR: { type: Number, default: 0 },
  thisMonthEarnings: { type: Number, default: 0 },
  lastMonthEarnings: { type: Number, default: 0 },
  pendingWithdrawal: { type: Number, default: 0 },
  rank: { type: Number, default: 0 },
  lastUpdated: { type: Date, default: Date.now }
});

// 20. Follower Schema (NEW)
const followerSchema = new mongoose.Schema({
  followerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  followingId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  followedAt: { type: Date, default: Date.now }
});
followerSchema.index({ followerId: 1, followingId: 1 }, { unique: true });
followerSchema.index({ followingId: 1 });

// 21. Template Saves Schema (NEW)
const templateSaveSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  templateId: { type: mongoose.Schema.Types.ObjectId, ref: 'Template', required: true },
  savedAt: { type: Date, default: Date.now }
});
templateSaveSchema.index({ userId: 1, templateId: 1 }, { unique: true });
templateSaveSchema.index({ templateId: 1 });


// 22. Generation Rules Config (NEW)
const generationRulesConfigSchema = new mongoose.Schema({
  facePreservationPrompt: { type: String, default: "ensure strong facial resemblance to the uploaded reference, maintain identity, high fidelity face" },
  globalNegativePrompt: { type: String, default: "nude, nsfw, naked, porn, distorted features, ugly, bad anatomy" },
  updatedAt: { type: Date, default: Date.now }
});

// 23. Subscription Plan Schema
const subscriptionPlanSchema = new mongoose.Schema({
  name: { type: String, required: true }, // "Standard", "Ultimate", "Creator"
  slug: { type: String, required: true, unique: true }, // "standard", "ultimate", "creator"
  tagline: { type: String, required: true },
  tag: { type: String }, // "MOST POPULAR", "SPECIAL OFFER", null
  tagColor: { type: String }, // Background color for tag

  // Pricing for different billing cycles
  pricing: {
    monthly: {
      price: { type: Number, required: true },
      originalPrice: { type: Number }, // For strikethrough
      discount: { type: Number, default: 0 } // Percentage discount
    },
    quarterly: {
      price: { type: Number, required: true },
      originalPrice: { type: Number },
      discount: { type: Number, default: 0 }
    },
    yearly: {
      price: { type: Number, required: true },
      originalPrice: { type: Number },
      discount: { type: Number, default: 0 }
    }
  },

  // Image Generation Features (based on image requirements)
  features: {
    creditsPerMonth: { type: Number, required: true }, // e.g., 8000, 16000, 100000
    imageGenerationsPerMonth: { type: Number, required: true }, // Approximate: ~1.6k, ~3.2k, ~20k
    concurrentImageGenerations: { type: Number, default: 1 }, // 8, 12, 16
    concurrentVideoGenerations: { type: Number, default: 0 }, // 3, 4, 5 (for future)
    allStylesAndModels: { type: Boolean, default: true },
    commercialTerms: { type: String, default: 'General Commercial Terms' },
    imageVisibility: { type: String, enum: ['Private', 'Public'], default: 'Private' },
    prioritySupport: { type: Boolean, default: false },
    queuePriority: { type: String, enum: ['Normal', 'High', 'Highest'], default: 'Normal' },
    unlimitedRealtimeGenerations: { type: Boolean, default: false } // Only for Creator plan
  },

  // Display order
  displayOrder: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// 24. User Subscription Schema
const userSubscriptionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  planId: { type: mongoose.Schema.Types.ObjectId, ref: 'SubscriptionPlan', required: true },
  planName: { type: String, required: true },
  billingCycle: { type: String, enum: ['monthly', 'quarterly', 'yearly'], required: true },
  status: { type: String, enum: ['active', 'cancelled', 'expired', 'pending'], default: 'pending' },

  // Payment details
  paymentGateway: { type: String, enum: ['razorpay', 'stripe'], default: 'razorpay' },
  subscriptionId: { type: String }, // Razorpay/Stripe subscription ID
  paymentId: { type: String }, // Last payment ID

  // Dates
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  nextBillingDate: { type: Date },
  cancelledAt: { type: Date },

  // Credits allocation
  creditsAllocated: { type: Number, default: 0 },
  creditsUsed: { type: Number, default: 0 },
  lastCreditsAllocation: { type: Date },

  // Auto-renewal
  autoRenew: { type: Boolean, default: true },

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});
userSubscriptionSchema.index({ userId: 1, status: 1 });
userSubscriptionSchema.index({ nextBillingDate: 1 });

// 25. Subscription Payment History Schema
const subscriptionPaymentSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  subscriptionId: { type: mongoose.Schema.Types.ObjectId, ref: 'UserSubscription', required: true },
  planId: { type: mongoose.Schema.Types.ObjectId, ref: 'SubscriptionPlan', required: true },
  amount: { type: Number, required: true },
  billingCycle: { type: String, required: true },
  paymentGateway: { type: String, required: true },
  paymentId: { type: String, required: true }, // Razorpay/Stripe payment ID
  orderId: { type: String },
  status: { type: String, enum: ['success', 'failed', 'pending'], default: 'pending' },
  paidAt: { type: Date },
  createdAt: { type: Date, default: Date.now }
});
subscriptionPaymentSchema.index({ userId: 1, createdAt: -1 });

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
  HistoryRetentionConfig: mongoose.model('HistoryRetentionConfig', historyRetentionConfigSchema),
  Admin: mongoose.model('Admin', adminSchema),
  Notification: mongoose.model('Notification', notificationSchema),
  Generation: mongoose.model('Generation', generationSchema),
  ToolConfig: mongoose.model('ToolConfig', toolConfigSchema),
  FilterConfig: mongoose.model('FilterConfig', filterConfigSchema),
  AdsConfig: mongoose.model('AdsConfig', adsConfigSchema),
  Withdrawal: mongoose.model('Withdrawal', withdrawalSchema),
  CreatorNotification: mongoose.model('CreatorNotification', creatorNotificationSchema),
  CreatorEarning: mongoose.model('CreatorEarning', creatorEarningSchema),
  AdminActionLog: mongoose.model('AdminActionLog', adminActionLogSchema),
  CreatorStatsCache: mongoose.model('CreatorStatsCache', creatorStatsCacheSchema),
  Follower: mongoose.model('Follower', followerSchema),
  TemplateSave: mongoose.model('TemplateSave', templateSaveSchema),
  GenerationGuardRule: mongoose.model('GenerationGuardRule', new mongoose.Schema({
    ruleName: { type: String, required: true },
    ruleType: { type: String, enum: ['face_preserve', 'safety_nsfw', 'negative_prompt', 'quality_control', 'custom'], required: true },
    enabled: { type: Boolean, default: true },
    priority: { type: Number, default: 0 },
    hiddenPrompt: { type: String, required: true },
    applyTo: [{ type: String, enum: ['image', 'image_to_image', 'text_to_image'], default: ['image', 'image_to_image', 'text_to_image'] }],
    createdAt: { type: Date, default: Date.now }
  })),

  // Monetization Models (from models-monetization.js)
  Popup: require('./models-monetization').Popup,
  Offer: require('./models-monetization').Offer,
  PromoCode: require('./models-monetization').PromoCode,
  AdLog: require('./models-monetization').AdLog,

  // Subscription Models
  SubscriptionPlan: mongoose.models.SubscriptionPlan || mongoose.model('SubscriptionPlan', subscriptionPlanSchema),
  UserSubscription: mongoose.models.UserSubscription || mongoose.model('UserSubscription', userSubscriptionSchema),
  SubscriptionPayment: mongoose.models.SubscriptionPayment || mongoose.model('SubscriptionPayment', subscriptionPaymentSchema)
};
