import mongoose from 'mongoose';

const transactionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  type: {
    type: String,
    enum: ['purchase', 'generation', 'refund', 'withdrawal', 'earning', 'bonus', 'deduction'],
    required: true,
  },
  amount: {
    type: Number,
    required: true,
  },
  points: {
    type: Number,
    required: true,
  },
  paymentMethod: {
    type: String,
    enum: ['razorpay', 'stripe', 'paypal', 'points', 'bonus'],
  },
  gateway: {
    type: String,
  },
  gatewayTransactionId: {
    type: String,
  },
  status: {
    type: String,
    enum: ['success', 'failed', 'pending', 'refunded'],
    default: 'pending',
  },
  description: {
    type: String,
  },
  templateId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Template',
  },
  generationId: {
    type: String,
  },
  packageId: {
    type: String,
  },
  promoCode: {
    type: String,
  },
}, {
  timestamps: true,
});

transactionSchema.index({ userId: 1 });
transactionSchema.index({ type: 1 });
transactionSchema.index({ status: 1 });
transactionSchema.index({ createdAt: -1 });

export default mongoose.model('Transaction', transactionSchema);

