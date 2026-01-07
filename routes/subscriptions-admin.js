const express = require('express');
const router = express.Router();

// Import models with error handling
let SubscriptionPlan, UserSubscription, User, PaymentGateway;
try {
  const models = require('../models');
  SubscriptionPlan = models.SubscriptionPlan;
  UserSubscription = models.UserSubscription;
  User = models.User;
  PaymentGateway = models.PaymentGateway;
  
  console.log('Models loaded:', {
    SubscriptionPlan: !!SubscriptionPlan,
    UserSubscription: !!UserSubscription,
    User: !!User,
    PaymentGateway: !!PaymentGateway
  });
  
  if (!SubscriptionPlan || !UserSubscription || !User) {
    console.error('Required models not found in models.js');
    console.error('Available models:', Object.keys(models));
  }
} catch (error) {
  console.error('Error importing models:', error);
  console.error('Error stack:', error.stack);
}

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

// Test route to check model availability (before auth)
router.get('/test', (req, res) => {
  res.json({
    success: true,
    models: {
      SubscriptionPlan: !!SubscriptionPlan,
      UserSubscription: !!UserSubscription,
      User: !!User,
      PaymentGateway: !!PaymentGateway
    },
    message: 'Admin subscription routes are working'
  });
});

// Health check route (before auth)
router.get('/health', (req, res) => {
  res.json({ success: true, message: 'Admin subscription routes are accessible' });
});

// All admin routes require auth
router.use(authUser);

// Log route registration
console.log('Admin subscription routes registered:', {
  '/test': 'GET (no auth)',
  '/health': 'GET (no auth)',
  '/plans': 'GET (auth + admin)',
  '/': 'GET (auth + admin)'
});

// Helper to check admin role
const checkAdmin = async (req, res, next) => {
  try {
    if (!User) {
      console.error('User model is not defined');
      return res.status(500).json({ success: false, error: 'User model not found' });
    }
    
    const userId = req.user?.id || req.user?.userId || req.user?._id;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'User ID not found in token' });
    }
    
    // Validate ObjectId format
    const mongoose = require('mongoose');
    let user;
    
    // Special handling for admin environment identifiers
    if (userId === 'super_admin_env' || userId === 'admin' || userId === 'super_admin' || userId.includes('_env')) {
      console.log('Special admin identifier detected:', userId);
      // Find any admin user as fallback (for development/testing)
      user = await User.findOne({ role: 'admin' }).sort({ _id: 1 }); // Get first admin user
      if (user) {
        console.log('Using fallback admin user:', user.email, user._id);
      } else {
        // If no admin user found, try to find any user with admin-like role
        user = await User.findOne({ 
          $or: [
            { role: 'admin' },
            { role: 'super_admin' },
            { email: { $regex: /admin/i } }
          ]
        });
        if (user) {
          console.log('Using alternative admin user:', user.email, user._id);
        }
      }
    } else if (mongoose.Types.ObjectId.isValid(userId)) {
      // Valid ObjectId, use findById
      user = await User.findById(userId);
    } else {
      // Not a valid ObjectId, try to find by email or other identifier
      console.log('Invalid ObjectId format, trying alternative lookup for:', userId);
      
      // Try to find by email if userId looks like an email
      if (userId.includes('@')) {
        user = await User.findOne({ email: userId });
      } else {
        // Try to find by username or other field
        user = await User.findOne({ 
          $or: [
            { username: userId },
            { email: userId },
            { name: userId }
          ]
        });
      }
    }
    
    if (!user) {
      console.error('User not found for ID:', userId);
      console.error('Attempted lookups: ObjectId, email, username, name, admin fallback');
      
      // For special admin identifiers, if no admin user exists, allow access (for initial setup)
      if (userId === 'super_admin_env' || userId === 'admin' || userId === 'super_admin' || userId.includes('_env')) {
        console.log('No admin user found in database, but special identifier detected. Allowing access for initial setup.');
        // Set a temporary user object to allow access
        req.adminBypass = true;
        return next();
      }
      
      return res.status(404).json({ success: false, error: 'User not found. Please ensure you are logged in with a valid admin account.' });
    }
    
    // Check if user has admin role
    if (user.role !== 'admin' && user.role !== 'super_admin') {
      console.error('User does not have admin role:', user.email, user.role);
      return res.status(403).json({ success: false, error: 'Admin access required. Your role: ' + user.role });
    }
    
    next();
  } catch (error) {
    console.error('Error in checkAdmin:', error);
    console.error('Error details:', {
      userId: req.user?.id || req.user?.userId || req.user?._id,
      errorName: error.name,
      errorMessage: error.message
    });
    return res.status(500).json({ success: false, error: 'Failed to verify admin access: ' + error.message });
  }
};

// GET /api/admin/subscriptions/plans - Get all subscription plans (admin)
router.get('/plans', checkAdmin, async (req, res) => {
  try {
    console.log('GET /plans route hit');
    
    // Check if model exists
    if (!SubscriptionPlan) {
      console.error('SubscriptionPlan model is not defined');
      return res.status(500).json({ success: false, error: 'SubscriptionPlan model not found' });
    }
    
    console.log('Fetching subscription plans...');
    const plans = await SubscriptionPlan.find().sort({ displayOrder: 1 }).lean();
    console.log(`Found ${plans.length} subscription plans`);
    
    res.json({
      success: true,
      plans: plans.map(plan => ({
        _id: plan._id.toString(),
        name: plan.name,
        slug: plan.slug,
        tagline: plan.tagline,
        tag: plan.tag,
        tagColor: plan.tagColor,
        pricing: plan.pricing,
        features: plan.features,
        displayOrder: plan.displayOrder,
        isActive: plan.isActive,
        createdAt: plan.createdAt,
        updatedAt: plan.updatedAt
      }))
    });
  } catch (error) {
    console.error('Error fetching subscription plans (admin):', error);
    console.error('Error stack:', error.stack);
    console.error('Error name:', error.name);
    console.error('Error message:', error.message);
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to fetch subscription plans',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// POST /api/admin/subscriptions/plans - Create subscription plan
router.post('/plans', checkAdmin, async (req, res) => {
  try {
    const plan = await SubscriptionPlan.create(req.body);
    res.json({ success: true, plan });
  } catch (error) {
    console.error('Error creating subscription plan:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to create plan' });
  }
});

// PUT /api/admin/subscriptions/plans/:id - Update subscription plan
router.put('/plans/:id', checkAdmin, async (req, res) => {
  try {
    const plan = await SubscriptionPlan.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!plan) {
      return res.status(404).json({ success: false, error: 'Plan not found' });
    }

    res.json({ success: true, plan });
  } catch (error) {
    console.error('Error updating subscription plan:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to update plan' });
  }
});

// DELETE /api/admin/subscriptions/plans/:id - Delete subscription plan
router.delete('/plans/:id', checkAdmin, async (req, res) => {
  try {
    await SubscriptionPlan.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting subscription plan:', error);
    res.status(500).json({ success: false, error: 'Failed to delete plan' });
  }
});

// GET /api/admin/subscriptions - Get all user subscriptions
router.get('/', checkAdmin, async (req, res) => {
  try {
    const { status } = req.query;
    const query = status && status !== 'all' ? { status } : {};
    
    const subscriptions = await UserSubscription.find(query)
      .populate('userId', 'name email')
      .populate('planId')
      .sort({ createdAt: -1 })
      .lean();

    res.json({
      success: true,
      subscriptions: subscriptions.map(sub => ({
        _id: sub._id.toString(),
        userId: sub.userId?._id?.toString(),
        planId: sub.planId?._id?.toString(),
        planName: sub.planName,
        billingCycle: sub.billingCycle,
        status: sub.status,
        paymentGateway: sub.paymentGateway,
        startDate: sub.startDate,
        endDate: sub.endDate,
        nextBillingDate: sub.nextBillingDate,
        creditsAllocated: sub.creditsAllocated,
        creditsUsed: sub.creditsUsed,
        autoRenew: sub.autoRenew,
        user: sub.userId ? {
          name: sub.userId.name,
          email: sub.userId.email
        } : null
      }))
    });
  } catch (error) {
    console.error('Error fetching subscriptions (admin):', error);
    res.status(500).json({ success: false, error: 'Failed to fetch subscriptions' });
  }
});

// POST /api/admin/subscriptions/:id/cancel - Cancel user subscription (admin)
router.post('/:id/cancel', checkAdmin, async (req, res) => {
  try {
    const subscription = await UserSubscription.findById(req.params.id);
    if (!subscription) {
      return res.status(404).json({ success: false, error: 'Subscription not found' });
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

    subscription.status = 'cancelled';
    subscription.cancelledAt = new Date();
    subscription.autoRenew = false;
    await subscription.save();

    res.json({ success: true, message: 'Subscription cancelled successfully' });
  } catch (error) {
    console.error('Error cancelling subscription (admin):', error);
    res.status(500).json({ success: false, error: 'Failed to cancel subscription' });
  }
});

module.exports = router;

