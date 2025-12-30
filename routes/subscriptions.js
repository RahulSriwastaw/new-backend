const express = require('express');
const router = express.Router();
const { SubscriptionPlan, UserSubscription, SubscriptionPayment, User, Transaction } = require('../models');
const { PaymentGateway } = require('../models');
const mongoose = require('mongoose');

// Auth middleware helper
const authUser = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }
    
    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'RupantarAI_Secure_Secret_2025');
    req.user = decoded.user || decoded;
    next();
  } catch (error) {
    return res.status(401).json({ success: false, error: 'Invalid or expired token' });
  }
};

// Helper function to calculate billing cycle dates
function calculateBillingDates(billingCycle) {
  const startDate = new Date();
  const endDate = new Date();
  const nextBillingDate = new Date();
  
  if (billingCycle === 'monthly') {
    endDate.setMonth(endDate.getMonth() + 1);
    nextBillingDate.setMonth(nextBillingDate.getMonth() + 1);
  } else if (billingCycle === 'quarterly') {
    endDate.setMonth(endDate.getMonth() + 3);
    nextBillingDate.setMonth(nextBillingDate.getMonth() + 3);
  } else if (billingCycle === 'yearly') {
    endDate.setFullYear(endDate.getFullYear() + 1);
    nextBillingDate.setFullYear(nextBillingDate.getFullYear() + 1);
  }
  
  return { startDate, endDate, nextBillingDate };
}

// Helper function to allocate credits
async function allocateCredits(userId, credits, subscriptionId) {
  try {
    const user = await User.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }
    
    // Add credits to user
    user.points = (user.points || 0) + credits;
    await user.save();
    
    // Update subscription
    const subscription = await UserSubscription.findById(subscriptionId);
    if (subscription) {
      subscription.creditsAllocated = (subscription.creditsAllocated || 0) + credits;
      subscription.lastCreditsAllocation = new Date();
      await subscription.save();
    }
    
    // Create transaction record
    await Transaction.create({
      userId: userId,
      amount: credits,
      type: 'credit',
      description: `Subscription credits allocation`,
      gateway: 'Subscription',
      status: 'success',
      date: new Date()
    });
    
    console.log(`✅ Allocated ${credits} credits to user ${userId}`);
    return true;
  } catch (error) {
    console.error('Error allocating credits:', error);
    throw error;
  }
}

// GET /api/subscriptions/plans - Get all active subscription plans (PUBLIC - no auth required)
router.get('/plans', async (req, res) => {
  try {
    console.log('Public /plans route hit - fetching active subscription plans');
    const plans = await SubscriptionPlan.find({ isActive: true })
      .sort({ displayOrder: 1 })
      .lean();
    
    console.log(`Found ${plans.length} active subscription plans`);
    
    const formattedPlans = plans.map(plan => ({
      id: plan._id.toString(),
      _id: plan._id.toString(),
      name: plan.name,
      slug: plan.slug,
      tagline: plan.tagline,
      tag: plan.tag,
      tagColor: plan.tagColor,
      pricing: plan.pricing,
      features: plan.features,
      displayOrder: plan.displayOrder,
      isActive: plan.isActive !== undefined ? plan.isActive : true
    }));
    
    console.log('Returning plans:', formattedPlans.length);
    
    res.json({
      success: true,
      plans: formattedPlans
    });
  } catch (error) {
    console.error('Error fetching subscription plans:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ success: false, error: 'Failed to fetch subscription plans' });
  }
});

// GET /api/subscriptions/current - Get user's current subscription
router.get('/current', authUser, async (req, res) => {
  try {
    const userId = req.user?.id || req.user?.userId || req.user?._id;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'User not authenticated' });
    }
    
    const subscription = await UserSubscription.findOne({ userId, status: 'active' })
      .populate('planId')
      .lean();
    
    if (!subscription) {
      return res.json({ success: true, subscription: null });
    }
    
    // Check if subscription is expired
    if (new Date() > new Date(subscription.endDate)) {
      await UserSubscription.findByIdAndUpdate(subscription._id, { status: 'expired' });
      return res.json({ success: true, subscription: null });
    }
    
    res.json({
      success: true,
      subscription: {
        id: subscription._id.toString(),
        planId: subscription.planId?._id?.toString(),
        planName: subscription.planName,
        billingCycle: subscription.billingCycle,
        status: subscription.status,
        startDate: subscription.startDate,
        endDate: subscription.endDate,
        nextBillingDate: subscription.nextBillingDate,
        creditsAllocated: subscription.creditsAllocated,
        creditsUsed: subscription.creditsUsed,
        autoRenew: subscription.autoRenew,
        plan: subscription.planId
      }
    });
  } catch (error) {
    console.error('Error fetching current subscription:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch subscription' });
  }
});

// POST /api/subscriptions/subscribe - Create subscription (with payment)
router.post('/subscribe', authUser, async (req, res) => {
  try {
    const userId = req.user?.id || req.user?.userId || req.user?._id;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'User not authenticated' });
    }
    
    const { planId, billingCycle = 'monthly', gateway = 'razorpay', promoCode } = req.body;
    
    if (!planId) {
      return res.status(400).json({ success: false, error: 'Plan ID is required' });
    }
    
    // Check if user already has any subscription (due to unique userId constraint)
    const existingSubscription = await UserSubscription.findOne({ userId });
    if (existingSubscription) {
      // If active, require cancellation first
      if (existingSubscription.status === 'active') {
        return res.status(400).json({ 
          success: false, 
          error: 'You already have an active subscription. Please cancel it first.' 
        });
      }
      // If pending, cancelled, or expired, delete the old one and create a new one
      console.log(`Deleting existing ${existingSubscription.status} subscription for user ${userId} to create new one`);
      await UserSubscription.findByIdAndDelete(existingSubscription._id);
    }
    
    // Get plan
    const plan = await SubscriptionPlan.findById(planId);
    if (!plan || !plan.isActive) {
      return res.status(404).json({ success: false, error: 'Plan not found or inactive' });
    }
    
    // Get pricing for billing cycle
    const pricing = plan.pricing[billingCycle];
    if (!pricing || !pricing.price) {
      return res.status(400).json({ success: false, error: 'Invalid billing cycle' });
    }
    
    let finalAmount = pricing.price;
    let discountAmount = 0;
    
    // Apply promo code if provided
    if (promoCode && promoCode.trim()) {
      try {
        const { PromoCode } = require('../models-monetization');
        const now = new Date();
        const promo = await PromoCode.findOne({ 
          code: promoCode.toUpperCase().trim(), 
          isEnabled: true,
          startTime: { $lte: now },
          endTime: { $gte: now }
        });
        
        if (promo) {
          if (promo.usageLimit && promo.totalUses >= promo.usageLimit) {
            return res.status(400).json({ success: false, error: 'Promo code usage limit reached' });
          }
          
          const userUsageCount = promo.usedBy.filter(u => String(u.userId) === String(userId)).length;
          if (userUsageCount >= promo.perUserLimit) {
            return res.status(400).json({ success: false, error: 'You have already used this promo code' });
          }
          
          if (promo.discountType === 'percentage') {
            discountAmount = (finalAmount * promo.discountValue) / 100;
            finalAmount = Math.max(0, finalAmount - discountAmount);
          } else if (promo.discountType === 'flat') {
            discountAmount = promo.discountValue;
            finalAmount = Math.max(0, finalAmount - discountAmount);
          }
        } else {
          return res.status(400).json({ success: false, error: 'Invalid or expired promo code' });
        }
      } catch (promoError) {
        console.error('Promo code validation error:', promoError);
        return res.status(400).json({ success: false, error: 'Failed to validate promo code' });
      }
    }
    
    // Calculate billing dates
    const { startDate, endDate, nextBillingDate } = calculateBillingDates(billingCycle);
    
    // Create subscription record (pending status)
    const subscription = await UserSubscription.create({
      userId,
      planId: plan._id,
      planName: plan.name,
      billingCycle,
      status: 'pending',
      paymentGateway: gateway,
      startDate,
      endDate,
      nextBillingDate
    });
    
    // Create payment order based on gateway
    if (gateway === 'razorpay') {
      const config = await PaymentGateway.findOne({ provider: { $regex: /^razorpay$/i } })
        .select('+secretKey')
        .sort({ isActive: -1, _id: -1 });
      
      if (!config || !config.isActive) {
        await UserSubscription.findByIdAndDelete(subscription._id);
        return res.status(400).json({ success: false, error: 'Razorpay gateway is not available' });
      }
      
      const Razorpay = require('razorpay');
      const razorpay = new Razorpay({
        key_id: process.env.RAZORPAY_KEY_ID || config.publicKey,
        key_secret: process.env.RAZORPAY_KEY_SECRET || config.secretKey
      });
      
      // For Razorpay, we'll use order-based payment for subscriptions
      // Razorpay subscriptions require pre-created plans, so we'll handle recurring manually
      // Create a Razorpay order for the first payment
      const amountInPaise = Math.round(finalAmount * 100);
      
      console.log('Creating Razorpay order for subscription:', {
        amount: amountInPaise,
        subscriptionId: subscription._id.toString(),
        planName: plan.name,
        billingCycle: billingCycle
      });
      
      const order = await razorpay.orders.create({
        amount: amountInPaise,
        currency: 'INR',
        receipt: `sub_${subscription._id.toString().slice(-12)}_${Date.now()}`,
        notes: {
          userId: userId.toString(),
          subscriptionId: subscription._id.toString(),
          planId: plan._id.toString(),
          planName: plan.name,
          billingCycle: billingCycle,
          type: 'subscription'
        }
      });
      
      console.log('Razorpay order created:', order.id);
      
      // Update subscription with order ID (will be used for payment verification)
      subscription.paymentId = order.id;
      await subscription.save();
      
      res.json({
        success: true,
        subscriptionId: subscription._id.toString(),
        orderId: order.id,
        id: order.id,
        key: process.env.RAZORPAY_KEY_ID || config.publicKey,
        keyId: process.env.RAZORPAY_KEY_ID || config.publicKey,
        amount: amountInPaise, // In paise
        currency: 'INR',
        subscription: subscription._id.toString() // Also include as 'subscription' for compatibility
      });
      
    } else if (gateway === 'stripe') {
      const config = await PaymentGateway.findOne({ provider: { $regex: /^stripe$/i } })
        .select('+secretKey')
        .sort({ isActive: -1, _id: -1 });
      
      if (!config || !config.isActive) {
        await UserSubscription.findByIdAndDelete(subscription._id);
        return res.status(400).json({ success: false, error: 'Stripe gateway is not available' });
      }
      
      const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY || config.secretKey);
      
      // Get or create customer
      const user = await User.findById(userId);
      let customerId = user.stripeCustomerId;
      
      if (!customerId) {
        const customer = await stripe.customers.create({
          email: user.email,
          name: user.name,
          metadata: { userId: userId.toString() }
        });
        customerId = customer.id;
        user.stripeCustomerId = customerId;
        await user.save();
      }
      
      // Create Stripe subscription
      const stripeSubscription = await stripe.subscriptions.create({
        customer: customerId,
        items: [{
          price_data: {
            currency: 'inr',
            product_data: {
              name: `${plan.name} - ${billingCycle}`,
              description: plan.tagline
            },
            unit_amount: Math.round(finalAmount * 100), // Amount in paise
            recurring: {
              interval: billingCycle === 'monthly' ? 'month' : billingCycle === 'quarterly' ? 'month' : 'year',
              interval_count: billingCycle === 'quarterly' ? 3 : 1
            }
          }
        }],
        metadata: {
          userId: userId.toString(),
          subscriptionId: subscription._id.toString(),
          planName: plan.name
        }
      });
      
      // Update subscription with Stripe subscription ID
      subscription.subscriptionId = stripeSubscription.id;
      await subscription.save();
      
      res.json({
        success: true,
        subscriptionId: subscription._id.toString(),
        stripeSubscriptionId: stripeSubscription.id,
        url: stripeSubscription.latest_invoice?.hosted_invoice_url || null
      });
    } else {
      await UserSubscription.findByIdAndDelete(subscription._id);
      return res.status(400).json({ success: false, error: 'Invalid payment gateway' });
    }
  } catch (error) {
    console.error('Error creating subscription:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to create subscription' });
  }
});

// POST /api/subscriptions/verify-payment - Verify Razorpay payment for subscription
router.post('/verify-payment', authUser, async (req, res) => {
  try {
    const userId = req.user?.id || req.user?.userId || req.user?._id;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'User not authenticated' });
    }
    
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, subscriptionId } = req.body;
    
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !subscriptionId) {
      return res.status(400).json({ success: false, error: 'Missing payment verification data' });
    }
    
    // Verify signature
    const crypto = require('crypto');
    const config = await PaymentGateway.findOne({ provider: { $regex: /^razorpay$/i } })
      .select('+secretKey')
      .sort({ isActive: -1, _id: -1 });
    
    if (!config || !config.isActive) {
      return res.status(400).json({ success: false, error: 'Razorpay gateway is not available' });
    }
    
    const secret = process.env.RAZORPAY_KEY_SECRET || config.secretKey;
    const text = `${razorpay_order_id}|${razorpay_payment_id}`;
    const generatedSignature = crypto.createHmac('sha256', secret).update(text).digest('hex');
    
    if (generatedSignature !== razorpay_signature) {
      return res.status(400).json({ success: false, error: 'Invalid payment signature' });
    }
    
    // Get subscription
    const subscription = await UserSubscription.findById(subscriptionId);
    if (!subscription) {
      return res.status(404).json({ success: false, error: 'Subscription not found' });
    }
    
    if (subscription.userId.toString() !== userId.toString()) {
      return res.status(403).json({ success: false, error: 'Unauthorized' });
    }
    
    // Get plan
    const plan = await SubscriptionPlan.findById(subscription.planId);
    if (!plan) {
      return res.status(404).json({ success: false, error: 'Plan not found' });
    }
    
    // Update subscription status
    subscription.status = 'active';
    subscription.paymentId = razorpay_payment_id;
    await subscription.save();
    
    // Allocate credits
    await allocateCredits(userId, plan.features.creditsPerMonth, subscription._id);
    
    // Record payment
    await SubscriptionPayment.create({
      userId: userId,
      subscriptionId: subscription._id,
      planId: plan._id,
      amount: plan.pricing[subscription.billingCycle].price,
      billingCycle: subscription.billingCycle,
      paymentGateway: 'razorpay',
      paymentId: razorpay_payment_id,
      orderId: razorpay_order_id,
      status: 'success',
      paidAt: new Date()
    });
    
    res.json({
      success: true,
      message: 'Payment verified and subscription activated',
      subscription: {
        id: subscription._id.toString(),
        planName: plan.name,
        credits: plan.features.creditsPerMonth
      }
    });
  } catch (error) {
    console.error('Error verifying subscription payment:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to verify payment' });
  }
});

// POST /api/subscriptions/cancel - Cancel subscription
router.post('/cancel', authUser, async (req, res) => {
  try {
    const userId = req.user?.id || req.user?.userId || req.user?._id;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'User not authenticated' });
    }
    
    const subscription = await UserSubscription.findOne({ userId, status: 'active' });
    if (!subscription) {
      return res.status(404).json({ success: false, error: 'No active subscription found' });
    }
    
    // Cancel with payment gateway
    if (subscription.paymentGateway === 'razorpay' && subscription.subscriptionId) {
      try {
        const Razorpay = require('razorpay');
        const config = await PaymentGateway.findOne({ provider: { $regex: /^razorpay$/i } })
          .select('+secretKey')
          .sort({ isActive: -1, _id: -1 });
        
        if (config && config.isActive) {
          const razorpay = new Razorpay({
            key_id: process.env.RAZORPAY_KEY_ID || config.publicKey,
            key_secret: process.env.RAZORPAY_KEY_SECRET || config.secretKey
          });
          
          await razorpay.subscriptions.cancel(subscription.subscriptionId);
        }
      } catch (razorpayError) {
        console.error('Error canceling Razorpay subscription:', razorpayError);
      }
    } else if (subscription.paymentGateway === 'stripe' && subscription.subscriptionId) {
      try {
        const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
        await stripe.subscriptions.cancel(subscription.subscriptionId);
      } catch (stripeError) {
        console.error('Error canceling Stripe subscription:', stripeError);
      }
    }
    
    // Update subscription status
    subscription.status = 'cancelled';
    subscription.cancelledAt = new Date();
    subscription.autoRenew = false;
    await subscription.save();
    
    res.json({ success: true, message: 'Subscription cancelled successfully' });
  } catch (error) {
    console.error('Error cancelling subscription:', error);
    res.status(500).json({ success: false, error: 'Failed to cancel subscription' });
  }
});

// GET /api/subscriptions/payment-history - Get payment history
router.get('/payment-history', authUser, async (req, res) => {
  try {
    const userId = req.user?.id || req.user?.userId || req.user?._id;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'User not authenticated' });
    }
    
    const payments = await SubscriptionPayment.find({ userId })
      .populate('planId', 'name slug')
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();
    
    res.json({
      success: true,
      payments: payments.map(payment => ({
        id: payment._id.toString(),
        amount: payment.amount,
        billingCycle: payment.billingCycle,
        paymentGateway: payment.paymentGateway,
        status: payment.status,
        paidAt: payment.paidAt,
        createdAt: payment.createdAt,
        plan: payment.planId ? {
          name: payment.planId.name,
          slug: payment.planId.slug
        } : null
      }))
    });
  } catch (error) {
    console.error('Error fetching payment history:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch payment history' });
  }
});

// POST /api/subscriptions/webhook/razorpay - Razorpay webhook for recurring payments
router.post('/webhook/razorpay', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const crypto = require('crypto');
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET || '';
    const signature = req.headers['x-razorpay-signature'];
    
    const hash = crypto.createHmac('sha256', secret).update(JSON.stringify(req.body)).digest('hex');
    
    if (hash !== signature) {
      return res.status(400).json({ success: false, error: 'Invalid signature' });
    }
    
    const event = req.body;
    
    if (event.event === 'subscription.charged') {
      const subscriptionId = event.payload.subscription.entity.id;
      const paymentId = event.payload.payment.entity.id;
      const amount = event.payload.payment.entity.amount / 100; // Convert from paise to rupees
      
      const subscription = await UserSubscription.findOne({ subscriptionId });
      if (subscription && subscription.status === 'active') {
        // Record payment
        await SubscriptionPayment.create({
          userId: subscription.userId,
          subscriptionId: subscription._id,
          planId: subscription.planId,
          amount: amount,
          billingCycle: subscription.billingCycle,
          paymentGateway: 'razorpay',
          paymentId: paymentId,
          status: 'success',
          paidAt: new Date()
        });
        
        // Allocate credits
        const plan = await SubscriptionPlan.findById(subscription.planId);
        if (plan) {
          await allocateCredits(subscription.userId, plan.features.creditsPerMonth, subscription._id);
        }
        
        // Update next billing date
        const { nextBillingDate } = calculateBillingDates(subscription.billingCycle);
        subscription.nextBillingDate = nextBillingDate;
        await subscription.save();
      }
    } else if (event.event === 'subscription.cancelled') {
      const subscriptionId = event.payload.subscription.entity.id;
      const subscription = await UserSubscription.findOne({ subscriptionId });
      if (subscription) {
        subscription.status = 'cancelled';
        subscription.cancelledAt = new Date();
        subscription.autoRenew = false;
        await subscription.save();
      }
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Razorpay webhook error:', error);
    res.status(500).json({ success: false, error: 'Webhook processing failed' });
  }
});

// POST /api/subscriptions/webhook/stripe - Stripe webhook for recurring payments
router.post('/webhook/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    const sig = req.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    
    let event;
    try {
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (err) {
      return res.status(400).json({ success: false, error: `Webhook signature verification failed: ${err.message}` });
    }
    
    if (event.type === 'invoice.payment_succeeded') {
      const invoice = event.data.object;
      const subscriptionId = invoice.subscription;
      
      const subscription = await UserSubscription.findOne({ subscriptionId });
      if (subscription && subscription.status === 'active') {
        // Record payment
        await SubscriptionPayment.create({
          userId: subscription.userId,
          subscriptionId: subscription._id,
          planId: subscription.planId,
          amount: invoice.amount_paid / 100, // Convert from cents to rupees
          billingCycle: subscription.billingCycle,
          paymentGateway: 'stripe',
          paymentId: invoice.payment_intent,
          orderId: invoice.id,
          status: 'success',
          paidAt: new Date(invoice.created * 1000)
        });
        
        // Allocate credits
        const plan = await SubscriptionPlan.findById(subscription.planId);
        if (plan) {
          await allocateCredits(subscription.userId, plan.features.creditsPerMonth, subscription._id);
        }
        
        // Update next billing date
        const { nextBillingDate } = calculateBillingDates(subscription.billingCycle);
        subscription.nextBillingDate = nextBillingDate;
        await subscription.save();
      }
    } else if (event.type === 'customer.subscription.deleted') {
      const stripeSubscription = event.data.object;
      const subscription = await UserSubscription.findOne({ subscriptionId: stripeSubscription.id });
      if (subscription) {
        subscription.status = 'cancelled';
        subscription.cancelledAt = new Date();
        subscription.autoRenew = false;
        await subscription.save();
      }
    }
    
    res.json({ received: true });
  } catch (error) {
    console.error('Stripe webhook error:', error);
    res.status(500).json({ success: false, error: 'Webhook processing failed' });
  }
});

module.exports = router;

