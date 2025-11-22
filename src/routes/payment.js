import express from 'express';
import Stripe from 'stripe';
import Razorpay from 'razorpay';
import crypto from 'crypto';
import mongoose from 'mongoose';
import Transaction from '../models/Transaction.js';
import User from '../models/User.js';
import { verifyToken } from '../middleware/auth.js';
import logger from '../config/logger.js';

const router = express.Router();

const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null;

const razorpay = (process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET)
  ? new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
  })
  : null;

// Pricing packages (TODO: Move to database or config)
const PACKAGES = {
  'basic': { amount: 499, points: 500, currency: 'INR' },
  'pro': { amount: 999, points: 1200, currency: 'INR' },
  'ultra': { amount: 1999, points: 2500, currency: 'INR' }
};

router.use(verifyToken);

router.post('/create-order', async (req, res) => {
  try {
    const { packageId, gateway = 'razorpay' } = req.body;
    const pkg = PACKAGES[packageId];

    if (!pkg) {
      return res.status(400).json({ error: 'Invalid package selected' });
    }

    if (gateway === 'razorpay') {
      if (!razorpay) return res.status(503).json({ error: 'Razorpay not configured' });

      const order = await razorpay.orders.create({
        amount: pkg.amount * 100, // Amount in paise
        currency: pkg.currency,
        receipt: `rcpt_${Date.now()}_${req.user.id.substr(-4)}`,
        notes: {
          userId: req.user.id,
          packageId: packageId,
          points: pkg.points
        }
      });

      res.json({
        orderId: order.id,
        amount: pkg.amount,
        currency: pkg.currency,
        key: process.env.RAZORPAY_KEY_ID
      });

    } else if (gateway === 'stripe') {
      if (!stripe) return res.status(503).json({ error: 'Stripe not configured' });

      const paymentIntent = await stripe.paymentIntents.create({
        amount: pkg.amount * 100, // Amount in cents
        currency: 'inr', // Stripe supports INR
        metadata: {
          userId: req.user.id,
          packageId: packageId,
          points: pkg.points
        }
      });

      res.json({ clientSecret: paymentIntent.client_secret });
    } else {
      res.status(400).json({ error: 'Invalid gateway' });
    }

  } catch (error) {
    logger.error('Create order error:', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

router.post('/verify-razorpay', async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, packageId } = req.body;
    const userId = req.user.id;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Verify signature
    const body = razorpay_order_id + '|' + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(body.toString())
      .digest('hex');

    if (expectedSignature !== razorpay_signature) {
      return res.status(400).json({ error: 'Invalid signature' });
    }

    // Check if transaction already exists
    const existingTx = await Transaction.findOne({ gatewayTransactionId: razorpay_payment_id });
    if (existingTx) {
      return res.status(200).json({ message: 'Transaction already processed', success: true });
    }

    const pkg = PACKAGES[packageId];
    if (!pkg) throw new Error('Invalid package in verification');

    // Update User Balance
    const user = await User.findByIdAndUpdate(
      userId,
      { $inc: { pointsBalance: pkg.points } },
      { session, new: true }
    );

    // Create Transaction Record
    const transaction = new Transaction({
      userId,
      type: 'purchase',
      amount: pkg.amount,
      points: pkg.points,
      paymentMethod: 'razorpay',
      gateway: 'razorpay',
      gatewayTransactionId: razorpay_payment_id,
      status: 'success',
      packageId: packageId,
      description: `Purchased ${packageId} package`,
    });

    await transaction.save({ session });

    await session.commitTransaction();
    session.endSession();

    logger.info(`✅ Payment successful for user ${userId}: ${pkg.points} points added`);

    res.json({
      success: true,
      message: 'Payment verified and points added',
      newBalance: user.pointsBalance
    });

  } catch (error) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    session.endSession();
    logger.error('Payment verification error:', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

export default router;

