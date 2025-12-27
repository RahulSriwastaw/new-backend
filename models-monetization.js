const mongoose = require('mongoose');

// Popup Notification Schema (Monetization Module 1)
const popupSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String, required: true },
  image: { type: String }, // Cloudinary URL
  ctaText: { type: String, default: 'Get Started' },
  ctaAction: { 
    type: String, 
    enum: ['buy_pack', 'watch_ad', 'apply_offer', 'custom_url'], 
    default: 'buy_pack' 
  },
  ctaUrl: { type: String }, // For custom_url action
  popupType: { 
    type: String, 
    enum: ['full_screen', 'center_modal', 'bottom_sheet', 'toast', 'exit_intent'], 
    default: 'center_modal' 
  },
  targetUsers: { 
    type: String, 
    enum: ['all', 'new', 'low_balance', 'inactive'], 
    default: 'all' 
  },
  frequency: { 
    type: String, 
    enum: ['once_per_session', 'once_per_day', 'once_per_hour', 'once_per_X_hours'], 
    default: 'once_per_day' 
  },
  frequencyHours: { type: Number, default: 24 }, // For 'once_per_X_hours'
  priority: { type: Number, default: 0 }, // Lower = higher priority
  startTime: { type: Date, required: true },
  endTime: { type: Date, required: true },
  isEnabled: { type: Boolean, default: true },
  // Analytics
  impressions: { type: Number, default: 0 },
  clicks: { type: Number, default: 0 },
  closes: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Offer Schema (Monetization Module 2)
const offerSchema = new mongoose.Schema({
  name: { type: String, required: true },
  offerType: { 
    type: String, 
    enum: ['festival', 'first_time_user', 'flash_sale', 'low_balance'], 
    required: true 
  },
  discountType: { 
    type: String, 
    enum: ['percentage', 'flat', 'bonus_points'], 
    required: true 
  },
  discountValue: { type: Number, required: true }, // % or amount or points
  applicablePacks: [{ type: mongoose.Schema.Types.ObjectId, ref: 'PointsPackage' }], // Empty = all packs
  autoApply: { type: Boolean, default: false },
  usageLimit: { type: Number }, // Total usage limit (null = unlimited)
  perUserLimit: { type: Number, default: 1 }, // How many times a user can use this
  dailyLimit: { type: Number }, // Daily usage limit (null = unlimited)
  countdownTimer: { type: Boolean, default: true },
  startTime: { type: Date, required: true },
  endTime: { type: Date, required: true },
  targetUsers: { 
    type: String, 
    enum: ['all', 'new', 'low_balance', 'inactive'], 
    default: 'all' 
  },
  isEnabled: { type: Boolean, default: true },
  // Analytics
  totalUses: { type: Number, default: 0 },
  totalRevenue: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Promo Code Schema (Monetization Module 2)
const promoCodeSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true, uppercase: true },
  discountType: { 
    type: String, 
    enum: ['percentage', 'flat', 'bonus_points'], 
    required: true 
  },
  discountValue: { type: Number, required: true },
  applicablePacks: [{ type: mongoose.Schema.Types.ObjectId, ref: 'PointsPackage' }], // Empty = all packs
  minPurchaseAmount: { type: Number, default: 0 },
  usageLimit: { type: Number }, // Total usage limit (null = unlimited)
  perUserLimit: { type: Number, default: 1 },
  dailyLimit: { type: Number }, // Daily usage limit (null = unlimited)
  startTime: { type: Date, required: true },
  endTime: { type: Date, required: true },
  isEnabled: { type: Boolean, default: true },
  // Analytics
  totalUses: { type: Number, default: 0 },
  totalRevenue: { type: Number, default: 0 },
  usedBy: [{ 
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    usedAt: { type: Date, default: Date.now },
    orderId: { type: String }
  }],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Ad Log Schema (Monetization Module 3)
const adLogSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  adType: { type: String, enum: ['rewarded_video', 'interstitial', 'banner'], default: 'rewarded_video' },
  pointsRewarded: { type: Number, default: 0 },
  watchedFull: { type: Boolean, default: false }, // Fraud detection
  skipped: { type: Boolean, default: false },
  adProvider: { type: String, default: 'google_admob' },
  watchedAt: { type: Date, default: Date.now },
  deviceInfo: { type: String },
  ipAddress: { type: String }
});

// Indexes for performance
popupSchema.index({ isEnabled: 1, startTime: 1, endTime: 1, priority: 1 });
offerSchema.index({ isEnabled: 1, startTime: 1, endTime: 1 });
promoCodeSchema.index({ code: 1, isEnabled: 1 });
promoCodeSchema.index({ 'usedBy.userId': 1 });
adLogSchema.index({ userId: 1, watchedAt: -1 });
adLogSchema.index({ userId: 1, watchedAt: 1 }); // For daily limit queries

module.exports = {
  Popup: mongoose.model('Popup', popupSchema),
  Offer: mongoose.model('Offer', offerSchema),
  PromoCode: mongoose.model('PromoCode', promoCodeSchema),
  AdLog: mongoose.model('AdLog', adLogSchema)
};

