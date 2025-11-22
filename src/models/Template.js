import mongoose from 'mongoose';

const templateSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
  },
  description: {
    type: String,
  },
  category: {
    type: String,
    required: true,
  },
  subCategory: {
    type: String,
  },
  tags: [{
    type: String,
  }],
  demoImage: {
    type: String,
    required: true,
  },
  exampleImages: [{
    type: String,
  }],
  hiddenPrompt: {
    type: String,
    required: true,
  },
  visiblePrompt: {
    type: String,
  },
  negativePrompt: {
    type: String,
  },
  isPremium: {
    type: Boolean,
    default: false,
  },
  pointsCost: {
    type: Number,
    default: 2,
  },
  creatorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Creator',
  },
  creatorName: {
    type: String,
    required: true,
  },
  creatorBio: {
    type: String,
  },
  creatorVerified: {
    type: Boolean,
    default: false,
  },
  usageCount: {
    type: Number,
    default: 0,
  },
  likeCount: {
    type: Number,
    default: 0,
  },
  saveCount: {
    type: Number,
    default: 0,
  },
  rating: {
    type: Number,
    default: 0,
  },
  ratingCount: {
    type: Number,
    default: 0,
  },
  ageGroup: {
    type: String,
    default: 'all',
  },
  state: {
    type: String,
    default: 'all',
  },
  status: {
    type: String,
    enum: ['approved', 'pending', 'rejected'],
    default: 'pending',
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  rejectedReason: {
    type: String,
  },
  createdBy: {
    type: String,
  },
}, {
  timestamps: true,
});

templateSchema.index({ category: 1, status: 1, usageCount: -1 }); // Popular templates in category
templateSchema.index({ creatorId: 1, status: 1 }); // Creator's public templates
templateSchema.index({ tags: 1, status: 1 }); // Tag search
templateSchema.index({ isPremium: 1, status: 1 }); // Premium filter
templateSchema.index({ status: 1, createdAt: -1 }); // Newest approved templates

export default mongoose.model('Template', templateSchema);

