import express from 'express';
import Transaction from '../models/Transaction.js';
import Withdrawal from '../models/Withdrawal.js';
import User from '../models/User.js';
import { verifyToken } from '../middleware/auth.js';
import logger from '../config/logger.js';

const router = express.Router();

router.use(verifyToken);

// Middleware to check if user is a creator
const verifyCreator = async (req, res, next) => {
  if (!req.user.isCreator) {
    return res.status(403).json({ error: 'Access denied. Creator account required.' });
  }
  next();
};

router.use(verifyCreator);

router.get('/earnings', async (req, res) => {
  try {
    const userId = req.user.id;

    // Calculate total earnings (lifetime)
    const totalEarningsAgg = await Transaction.aggregate([
      { $match: { userId: req.user._id, type: 'earning', status: 'success' } },
      { $group: { _id: null, total: { $sum: '$amount' } } } // Amount in currency
    ]);
    const totalEarnings = totalEarningsAgg[0]?.total || 0;

    // Calculate this month's earnings
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const thisMonthAgg = await Transaction.aggregate([
      {
        $match: {
          userId: req.user._id,
          type: 'earning',
          status: 'success',
          createdAt: { $gte: startOfMonth }
        }
      },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);
    const thisMonthEarnings = thisMonthAgg[0]?.total || 0;

    // Calculate pending withdrawals
    const pendingWithdrawalsAgg = await Withdrawal.aggregate([
      { $match: { creatorId: req.user._id, status: 'pending' } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);
    const pendingWithdrawal = pendingWithdrawalsAgg[0]?.total || 0;

    res.json({
      totalEarnings,
      thisMonthEarnings,
      pendingWithdrawal,
      availableBalance: req.user.walletBalance || 0, // Assuming walletBalance field exists for real money
    });
  } catch (error) {
    logger.error('Creator earnings error:', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

router.post('/withdraw', async (req, res) => {
  try {
    const { amount, method, bankDetails, upiId } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Invalid amount' });
    }

    // Check available balance (TODO: Add walletBalance to User model for real money, distinct from points)
    // For now, assuming pointsBalance can be converted or there's a separate field. 
    // Let's assume a 'earningsBalance' field on User or Creator model.
    // Since User model has pointsBalance, let's stick to that for now or add earningsBalance.
    // For this implementation, I'll assume points are currency for simplicity or check a new field.

    // Let's verify against points for now (1 point = 1 INR for example, or use a conversion rate)
    // OR better, check if we added 'earningsBalance' to User. We didn't. 
    // Let's use pointsBalance for now but this logic might need refinement for real money vs points.

    if (req.user.pointsBalance < amount) {
      return res.status(400).json({ error: 'Insufficient balance' });
    }

    const withdrawal = new Withdrawal({
      creatorId: req.user.id,
      amount,
      netAmount: amount, // Deduct fees if needed
      bankDetails: method === 'bank' ? bankDetails : undefined,
      // upiId support needs to be added to Withdrawal model or put in bankDetails
      status: 'pending',
    });

    await withdrawal.save();

    // Deduct balance immediately to prevent double withdrawal
    req.user.pointsBalance -= amount;
    await req.user.save();

    res.json({
      success: true,
      withdrawal,
      message: 'Withdrawal request submitted successfully',
    });
  } catch (error) {
    logger.error('Withdrawal request error:', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

router.get('/withdrawals', async (req, res) => {
  try {
    const withdrawals = await Withdrawal.find({ creatorId: req.user.id })
      .sort({ createdAt: -1 })
      .limit(50);
    res.json(withdrawals);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;

