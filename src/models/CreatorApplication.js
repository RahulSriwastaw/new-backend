import mongoose from 'mongoose';

const creatorApplicationSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  name: {
    type: String,
    required: true,
  },
  email: {
    type: String,
    required: true,
  },
  requestedUsername: {
    type: String,
    required: true,
  },
  socialLinks: {
    facebook: String,
    youtube: String,
    instagram: String,
    telegram: String,
    whatsapp: String,
  },
  demoTemplates: [{
    image: String,
    prompt: String,
  }],
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending',
  },
  rejectionReason: {
    type: String,
  },
  rejectedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin',
  },
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin',
  },
  reapplyDate: {
    type: Date,
  },
}, {
  timestamps: true,
});

creatorApplicationSchema.index({ userId: 1 });
creatorApplicationSchema.index({ status: 1 });
creatorApplicationSchema.index({ createdAt: -1 });

export default mongoose.model('CreatorApplication', creatorApplicationSchema);

