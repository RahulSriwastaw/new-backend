import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    unique: true,
  },
  firebaseUid: {
    type: String,
    unique: true,
    sparse: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
  },
  phone: {
    type: String,
    sparse: true,
  },
  fullName: {
    type: String,
    required: true,
  },
  username: {
    type: String,
    unique: true,
    sparse: true,
  },
  profileImage: {
    type: String,
  },
  password: {
    type: String,
    select: false,
  },
  role: {
    type: String,
    enum: ['user', 'creator'],
    default: 'user',
  },
  isVerified: {
    type: Boolean,
    default: false,
  },
  isCreator: {
    type: Boolean,
    default: false,
  },
  pointsBalance: {
    type: Number,
    default: 100,
  },
  memberSince: {
    type: Date,
    default: Date.now,
  },
  lastActive: {
    type: Date,
    default: Date.now,
  },
  totalGenerations: {
    type: Number,
    default: 0,
  },
  status: {
    type: String,
    enum: ['active', 'inactive', 'banned'],
    default: 'active',
  },
  fcmToken: {
    type: String,
  },
  referralCode: {
    type: String,
    unique: true,
    sparse: true,
  },
  referredBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
}, {
  timestamps: true,
});

userSchema.index({ role: 1 });
userSchema.index({ status: 1 });
userSchema.index({ createdAt: -1 });
userSchema.index({ lastActive: -1 });

export default mongoose.model('User', userSchema);

