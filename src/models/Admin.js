import mongoose from 'mongoose';

const adminSchema = new mongoose.Schema({
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
  },
  password: {
    type: String,
    required: true,
    select: false,
  },
  name: {
    type: String,
    required: true,
  },
  role: {
    type: String,
    enum: ['owner', 'super_admin', 'admin', 'moderator', 'support'],
    required: true,
  },
  permissions: {
    users: { view: Boolean, edit: Boolean, delete: Boolean },
    templates: { view: Boolean, edit: Boolean, approve: Boolean },
    creators: { view: Boolean, approve: Boolean },
    transactions: { view: Boolean, refund: Boolean },
    moderation: { view: Boolean, action: Boolean },
    wallet: { view: Boolean, adjust: Boolean },
    aiConfig: { view: Boolean, edit: Boolean },
    finance: { view: Boolean, export: Boolean },
    reports: { view: Boolean, export: Boolean },
    settings: { view: Boolean, edit: Boolean },
    admins: { view: Boolean, create: Boolean },
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin',
  },
  lastLogin: {
    type: Date,
  },
  lastLoginIp: {
    type: String,
  },
}, {
  timestamps: true,
});

adminSchema.index({ role: 1 });
adminSchema.index({ isActive: 1 });

export default mongoose.model('Admin', adminSchema);

