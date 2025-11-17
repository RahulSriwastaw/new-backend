import mongoose from 'mongoose';

const adUsageSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  adType: {
    type: String,
    enum: ['rewarded', 'interstitial', 'banner'],
  },
  pointsEarned: {
    type: Number,
    default: 0,
  },
  date: {
    type: Date,
    default: Date.now,
  },
}, {
  timestamps: true,
});

adUsageSchema.index({ userId: 1 });
adUsageSchema.index({ date: 1 });

export default mongoose.model('AdUsage', adUsageSchema);

