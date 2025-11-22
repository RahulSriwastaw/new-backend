import express from 'express';
import crypto from 'crypto';
import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import { check } from 'express-validator';
import User from '../models/User.js';
import { verifyFirebaseToken } from '../config/firebaseAdmin.js';
import logger from '../config/logger.js';
import { validate } from '../middleware/validate.js';
import { authLimiter } from '../config/security.js';

const router = express.Router();

// Validation rules
const registerValidation = [
  check('email').isEmail().withMessage('Please provide a valid email'),
  check('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  check('fullName').notEmpty().withMessage('Full name is required'),
  check('phone').optional().isMobilePhone().withMessage('Please provide a valid phone number')
];

const loginValidation = [
  check('email').isEmail().withMessage('Please provide a valid email'),
  check('password').notEmpty().withMessage('Password is required')
];

router.post('/register', authLimiter, validate(registerValidation), async (req, res) => {
  try {
    logger.info('=== User Registration Request ===');

    if (mongoose.connection.readyState !== 1) {
      logger.error('MongoDB not connected. ReadyState:', { state: mongoose.connection.readyState });
      return res.status(503).json({ error: 'Database not connected. Please wait for MongoDB connection.' });
    }

    const { email, password, fullName, phone, photoURL, firebaseUid } = req.body;
    const normalizedEmail = email.toLowerCase();

    // Check for existing user
    let query;
    if (firebaseUid) {
      query = {
        $or: [
          { email: normalizedEmail },
          { firebaseUid: firebaseUid }
        ]
      };
    } else {
      query = { email: normalizedEmail };
    }

    let existingUser = await User.findOne(query).maxTimeMS(10000);

    if (existingUser) {
      logger.info('Updating existing user on registration', { userId: existingUser._id });
      existingUser.lastActive = new Date();
      if (photoURL && photoURL !== existingUser.profileImage) {
        existingUser.profileImage = photoURL;
      }
      if (firebaseUid && !existingUser.firebaseUid) {
        existingUser.firebaseUid = firebaseUid;
      }
      await existingUser.save();

      return res.status(200).json({
        user: formatUserResponse(existingUser),
        token: `token_${existingUser._id}`
      });
    }

    // Hash password if provided
    let hashedPassword = null;
    if (password) {
      hashedPassword = await bcrypt.hash(password, 10);
    }

    const userId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const newUser = new User({
      userId,
      email: normalizedEmail,
      fullName,
      phone: phone || '',
      profileImage: photoURL || null,
      password: hashedPassword,
      firebaseUid: firebaseUid || null,
      isCreator: false,
      isVerified: false,
      pointsBalance: 100,
      status: 'active',
      totalGenerations: 0,
      lastActive: new Date(),
    });

    await newUser.save();
    logger.info(`✅ New user created: ${newUser.email}`, { userId: newUser._id, googleAuth: !!firebaseUid });

    res.status(201).json({
      user: formatUserResponse(newUser),
      token: `token_${newUser._id}`
    });

  } catch (error) {
    handleAuthError(error, res);
  }
});

router.post('/firebase-login', authLimiter, async (req, res) => {
  try {
    logger.info('=== Firebase Login Request ===');
    const { firebaseToken, fullName, phone } = req.body;

    if (!firebaseToken) {
      return res.status(400).json({ error: 'Firebase token is required' });
    }

    return await syncFirebaseUserToMongoDB(req, res, firebaseToken, fullName, phone);
  } catch (error) {
    logger.error('Firebase login error:', { error: error.message });
    res.status(500).json({ error: error.message || 'Login failed' });
  }
});

async function syncFirebaseUserToMongoDB(req, res, firebaseToken, fullName, phone) {
  try {
    if (mongoose.connection.readyState !== 1) {
      logger.error('MongoDB not connected');
      return res.status(503).json({ error: 'Database not connected' });
    }

    let userInfo;
    try {
      userInfo = await verifyFirebaseToken(firebaseToken);
      logger.info('✅ Firebase token verified', { uid: userInfo.uid });
    } catch (error) {
      logger.error('❌ Firebase token verification failed:', { error: error.message });
      return res.status(401).json({
        error: 'Invalid Firebase token',
        details: error.message
      });
    }

    const firebaseUid = userInfo.uid;
    const email = userInfo.email || '';
    const displayName = fullName || userInfo.name || userInfo.email?.split('@')[0] || 'User';
    const photoURL = userInfo.picture || null;
    const emailVerified = userInfo.email_verified || false;
    const phoneNumber = phone || userInfo.phone_number || null;

    if (!email) {
      return res.status(400).json({ error: 'Email is required from Firebase token' });
    }

    const normalizedEmail = email.toLowerCase();

    let existingUser = await User.findOne({
      $or: [
        { firebaseUid: firebaseUid },
        { email: normalizedEmail }
      ]
    }).maxTimeMS(10000);

    if (existingUser) {
      existingUser.firebaseUid = firebaseUid;
      existingUser.email = normalizedEmail;
      existingUser.fullName = displayName;
      existingUser.lastActive = new Date();

      if (photoURL && photoURL !== existingUser.profileImage) {
        existingUser.profileImage = photoURL;
      }

      if (phoneNumber && phoneNumber !== existingUser.phone) {
        existingUser.phone = phoneNumber;
      }

      if (emailVerified && !existingUser.isVerified) {
        existingUser.isVerified = true;
      }

      await existingUser.save();
      logger.info('✅ User updated in MongoDB', { email: existingUser.email });

      return res.json({
        user: formatUserResponse(existingUser),
        token: `token_${existingUser._id}`,
        isNewUser: false
      });
    } else {
      const userId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const username = email.split('@')[0] + '_' + Date.now().toString().slice(-6);

      const newUser = new User({
        userId,
        firebaseUid: firebaseUid,
        email: normalizedEmail,
        fullName: displayName,
        username: username,
        phone: phoneNumber || '',
        profileImage: photoURL || null,
        password: null,
        role: 'user',
        isCreator: false,
        isVerified: emailVerified,
        pointsBalance: 100,
        status: 'active',
        totalGenerations: 0,
        lastActive: new Date(),
      });

      await newUser.save();
      logger.info('✅ New user created in MongoDB', { email: newUser.email });

      return res.status(201).json({
        user: formatUserResponse(newUser),
        token: `token_${newUser._id}`,
        isNewUser: true
      });
    }
  } catch (error) {
    logger.error('Sync Firebase user error:', { error: error.message });
    throw error;
  }
}

router.post('/login', authLimiter, validate(loginValidation), async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email: email.toLowerCase() }).select('+password');

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Check password
    let isMatch = false;
    if (user.password) {
      // Try bcrypt first
      isMatch = await bcrypt.compare(password, user.password);

      // Fallback for legacy SHA256 passwords (temporary migration)
      if (!isMatch) {
        const legacyHash = crypto.createHash('sha256').update(password).digest('hex');
        if (user.password === legacyHash) {
          isMatch = true;
          // Upgrade to bcrypt
          user.password = await bcrypt.hash(password, 10);
          await user.save();
          logger.info('Upgraded user password to bcrypt', { userId: user._id });
        }
      }
    }

    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    user.lastActive = new Date();
    await user.save();

    res.json({
      user: formatUserResponse(user),
      token: `token_${user._id}`
    });
  } catch (error) {
    logger.error('Login error:', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

router.post('/syncUser', async (req, res) => {
  try {
    logger.info('=== Sync User Request ===');

    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ error: 'Database not connected' });
    }

    const { firebaseToken, fullName, phone } = req.body;

    if (!firebaseToken) {
      return res.status(400).json({ error: 'Firebase token is required' });
    }

    return await syncFirebaseUserToMongoDB(req, res, firebaseToken, fullName, phone);
  } catch (error) {
    handleAuthError(error, res);
  }
});

router.get('/test-routes', (req, res) => {
  res.json({
    message: 'Auth routes are working',
    availableRoutes: [
      'POST /api/auth/register',
      'POST /api/auth/login',
      'POST /api/auth/firebase-login',
      'POST /api/auth/syncUser',
      'GET /api/auth/me',
      'GET /api/auth/test-routes'
    ]
  });
});

router.get('/me', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '') ||
      req.headers['x-auth-token'] ||
      req.query.token;

    if (!token) {
      return res.status(401).json({ error: 'Unauthorized - Token required' });
    }

    const userId = token.replace('token_', '');

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ user: formatUserResponse(user) });
  } catch (error) {
    logger.error('Get me error:', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// Helper functions
function formatUserResponse(user) {
  return {
    id: user._id.toString(),
    email: user.email,
    fullName: user.fullName,
    phone: user.phone || '',
    isCreator: user.isCreator || false,
    isVerified: user.isVerified || false,
    memberSince: user.memberSince || user.createdAt,
    pointsBalance: user.pointsBalance || 100,
    profilePicture: user.profileImage || null,
    firebaseUid: user.firebaseUid,
    role: user.role || (user.isCreator ? 'creator' : 'user'),
  };
}

function handleAuthError(error, res) {
  logger.error('Auth error:', {
    name: error.name,
    message: error.message,
    stack: error.stack
  });

  if (error.code === 11000) {
    const duplicateField = Object.keys(error.keyPattern || {})[0] || 'email';
    return res.status(400).json({
      error: `User with this ${duplicateField} already exists`,
      field: duplicateField
    });
  }

  if (error.name === 'ValidationError') {
    const errors = Object.values(error.errors || {}).map(e => e.message).join(', ');
    return res.status(400).json({ error: `Validation failed: ${errors}` });
  }

  if (error.name === 'MongooseError' || error.message?.includes('buffering')) {
    return res.status(503).json({ error: 'Database connection error. Please try again.' });
  }

  res.status(500).json({
    error: error.message || 'Authentication failed',
    ...(process.env.NODE_ENV === 'development' && {
      details: {
        name: error.name,
        stack: error.stack
      }
    })
  });
}

export default router;

