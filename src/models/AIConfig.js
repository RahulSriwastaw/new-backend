import mongoose from 'mongoose';

const aiConfigSchema = new mongoose.Schema({
  provider: {
    type: String,
    enum: ['openai', 'stability', 'google_gemini', 'minimax', 'minimax_i2i', 'dalle', 'custom', 'quick_tools'],
    required: true,
  },
  name: {
    type: String,
    required: true,
  },
  apiKey: {
    type: String,
    required: true,
  },
  apiSecret: {
    type: String,
  },
  endpoint: {
    type: String,
  },
  organizationId: {
    type: String,
  },
  projectId: {
    type: String,
  },
  isActive: {
    type: Boolean,
    default: false,
  },
  modelVersion: {
    type: String,
  },
  strength: {
    type: Number,
    default: 0.6,
  },
  settings: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },
  costPerImage: {
    type: Number,
    default: 0,
  },
  maxRetries: {
    type: Number,
    default: 3,
  },
  timeout: {
    type: Number,
    default: 30000,
  },
  createdBy: {
    type: String,
  },
  lastTested: {
    type: Date,
  },
  testStatus: {
    type: String,
    enum: ['success', 'failed', 'pending'],
    default: 'pending',
  },
  testError: {
    type: String,
  },
}, {
  timestamps: true,
});

aiConfigSchema.index({ provider: 1, isActive: 1 });

export default mongoose.model('AIConfig', aiConfigSchema);

