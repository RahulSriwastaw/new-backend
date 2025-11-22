import express from 'express';
import Transaction from '../models/Transaction.js';
import User from '../models/User.js';
import { verifyToken } from '../middleware/auth.js';
import logger from '../config/logger.js';

const router = express.Router();

router.use(verifyToken);

router.get('/balance', async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Calculate total earned (sum of 'earning' type transactions)
    const earnings = await Transaction.aggregate([
      { $match: { userId: user._id, type: 'earning', status: 'success' } },
      { $group: { _id: null, total: { $sum: '$points' } } }
    ]);

    // Calculate total spent (sum of 'generation' type transactions)
    const spending = await Transaction.aggregate([
      { $match: { userId: user._id, type: 'generation', status: 'success' } },
      { $group: { _id: null, total: { $sum: { $abs: '$points' } } } }
    ]);

    res.json({
      balance: user.pointsBalance,
      totalEarned: earnings[0]?.total || 0,
      totalSpent: spending[0]?.total || 0,
    });
  } catch (error) {
    logger.error('Wallet balance error:', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

router.get('/transactions', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    const type = req.query.type; // Optional filter by type

    const query = { userId: req.user.id };
    if (type) {
      query.type = type;
    }

    const transactions = await Transaction.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Transaction.countDocuments(query);

    res.json({
      transactions,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    logger.error('Wallet transactions error:', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

export default router;

