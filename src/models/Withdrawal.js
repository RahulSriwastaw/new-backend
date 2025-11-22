import mongoose from 'mongoose';

const withdrawalSchema = new mongoose.Schema({
  creatorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Creator',
    required: true,
  },
  amount: {
    type: Number,
    required: true,
  },
  platformFee: {
    type: Number,
    default: 0,
  },
  tds: {
    type: Number,
    default: 0,
  },
  netAmount: {
    type: Number,
    required: true,
  },
  bankDetails: {
    accountHolderName: String,
    bankName: String,
    accountNumber: String,
    ifscCode: String,
    panNumber: String,
  },
  status: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'rejected'],
    default: 'pending',
  },
  rejectionReason: {
    type: String,
  },
  transactionId: {
    type: String,
  },
  processedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin',
  },
  processedAt: {
    type: Date,
  },
}, {
  timestamps: true,
});

withdrawalSchema.index({ creatorId: 1, createdAt: -1 }); // Creator history
withdrawalSchema.index({ status: 1, createdAt: -1 }); // Admin processing queue

export default mongoose.model('Withdrawal', withdrawalSchema);

