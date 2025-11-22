import express from 'express';
import mongoose from 'mongoose';
import Transaction from '../../models/Transaction.js';

const router = express.Router();

// Get all transactions with optional time filtering
router.get('/', async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.json([]);
    }

    const { period = 'monthly' } = req.query;
    const now = new Date();
    let startDate;

    if (period === 'daily') {
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30);
    } else if (period === 'weekly') {
      startDate = new Date(now.getFullYear(), now.getMonth() - 3);
    } else {
      startDate = new Date(now.getFullYear(), now.getMonth() - 12);
    }

    const transactions = await Transaction.find({
      createdAt: { $gte: startDate }
    })
    .sort({ createdAt: -1 })
    .limit(100)
    .maxTimeMS(5000)
    .lean();

    const formatted = transactions.map(t => ({
      id: t._id.toString(),
      userId: t.userId,
      userName: t.userName || 'Unknown User',
      type: t.type,
      amount: t.amount || 0,
      points: t.points || 0,
      status: t.status,
      gateway: t.gateway || 'Unknown',
      createdAt: t.createdAt.toISOString(),
    }));

    res.json(formatted);
  } catch (error) {
    console.error('Transactions error:', error);
    res.json([]);
  }
});

// Get specific transaction
router.get('/:id', async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(404).json({ error: 'Database not connected' });
    }

    const transaction = await Transaction.findById(req.params.id)
      .maxTimeMS(5000)
      .lean();

    if (!transaction) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    res.json({
      id: transaction._id.toString(),
      userId: transaction.userId,
      userName: transaction.userName || 'Unknown User',
      userEmail: transaction.userEmail || '',
      type: transaction.type,
      amount: transaction.amount || 0,
      points: transaction.points || 0,
      status: transaction.status,
      gateway: transaction.gateway || 'Unknown',
      createdAt: transaction.createdAt.toISOString(),
      details: transaction.details || {},
    });
  } catch (error) {
    console.error('Transaction detail error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Refund a transaction
router.post('/:id/refund', async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ error: 'Database not connected' });
    }

    const transaction = await Transaction.findById(req.params.id);
    if (!transaction) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    if (transaction.status !== 'success') {
      return res.status(400).json({ error: 'Only successful transactions can be refunded' });
    }

    if (transaction.type !== 'purchase') {
      return res.status(400).json({ error: 'Only purchase transactions can be refunded' });
    }

    // Update transaction status
    transaction.status = 'refunded';
    transaction.refundedAt = new Date();
    await transaction.save();

    // In a real implementation, you would also:
    // 1. Process actual refund through payment gateway
    // 2. Deduct points from user's account
    // 3. Log the refund action
    // 4. Send notification to user

    res.json({ 
      success: true,
      message: 'Transaction refunded successfully',
      transactionId: transaction._id.toString()
    });
  } catch (error) {
    console.error('Refund error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;