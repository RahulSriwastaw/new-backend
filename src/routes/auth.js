import express from 'express';
import crypto from 'crypto';
import mongoose from 'mongoose';
import User from '../models/User.js';
import { verifyFirebaseToken } from '../config/firebaseAdmin.js';

const router = express.Router();

router.post('/register', async (req, res) => {
  try {
    console.log('=== User Registration Request ===');
    console.log('MongoDB Connection State:', mongoose.connection.readyState);
    console.log('Request Body:', JSON.stringify(req.body, null, 2));
    
    if (mongoose.connection.readyState !== 1) {
      console.error('MongoDB not connected. ReadyState:', mongoose.connection.readyState);
      return res.status(503).json({ error: 'Database not connected. Please wait for MongoDB connection.' });
    }

    const { email, password, fullName, phone, photoURL, firebaseUid } = req.body;

    if (!email || !fullName) {
      console.error('Missing required fields:', { hasEmail: !!email, hasFullName: !!fullName });
      return res.status(400).json({ error: 'Email and full name are required' });
    }

    if (password && password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const normalizedEmail = email.toLowerCase();
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
      existingUser.lastActive = new Date();
      if (photoURL && photoURL !== existingUser.profileImage) {
        existingUser.profileImage = photoURL;
      }
      if (firebaseUid && !existingUser.firebaseUid) {
        existingUser.firebaseUid = firebaseUid;
      }
      await existingUser.save();
      
      const userResponse = {
        id: existingUser._id.toString(),
        email: existingUser.email,
        fullName: existingUser.fullName,
        phone: existingUser.phone || '',
        isCreator: existingUser.isCreator || false,
        isVerified: existingUser.isVerified || false,
        memberSince: existingUser.memberSince || existingUser.createdAt,
        pointsBalance: existingUser.pointsBalance || 100,
        profilePicture: existingUser.profileImage || photoURL || null,
      };
      return res.status(200).json({ user: userResponse, token: `token_${existingUser._id}` });
    }

    const userId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const newUser = new User({
      userId,
      email: normalizedEmail,
      fullName,
      phone: phone || '',
      profileImage: photoURL || null,
      password: password ? crypto.createHash('sha256').update(password).digest('hex') : null,
      firebaseUid: firebaseUid || null,
      isCreator: false,
      isVerified: false,
      pointsBalance: 100,
      status: 'active',
      totalGenerations: 0,
      lastActive: new Date(),
    });

    try {
      await newUser.save();
      console.log(`✅ New user created: ${newUser.email} (${newUser._id}) - Google OAuth: ${!!firebaseUid}`);
    } catch (saveError) {
      console.error('Error saving new user:', saveError);
      throw saveError;
    }

    const userResponse = {
      id: newUser._id.toString(),
      email: newUser.email,
      fullName: newUser.fullName,
      phone: newUser.phone || '',
      isCreator: newUser.isCreator || false,
      isVerified: newUser.isVerified || false,
      memberSince: newUser.memberSince || newUser.createdAt,
      pointsBalance: newUser.pointsBalance || 100,
      profilePicture: newUser.profileImage || photoURL || null,
    };
    
    res.status(201).json({ user: userResponse, token: `token_${newUser._id}` });
  } catch (error) {
    console.error('Registration error:', error);
    console.error('Error name:', error.name);
    console.error('Error message:', error.message);
    if (error.stack) {
      console.error('Error stack:', error.stack);
    }
    
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
      error: error.message || 'Registration failed',
      ...(process.env.NODE_ENV === 'development' && { 
        details: {
          name: error.name,
          stack: error.stack
        }
      })
    });
  }
});

router.post('/firebase-login', async (req, res) => {
  try {
    console.log('=== Firebase Login Request ===');
    const { firebaseToken, fullName, phone } = req.body;

    if (!firebaseToken) {
      return res.status(400).json({ error: 'Firebase token is required' });
    }

    return await syncFirebaseUserToMongoDB(req, res, firebaseToken, fullName, phone);
  } catch (error) {
    console.error('Firebase login error:', error);
    res.status(500).json({ error: error.message || 'Login failed' });
  }
});

async function syncFirebaseUserToMongoDB(req, res, firebaseToken, fullName, phone) {
  try {
    if (mongoose.connection.readyState !== 1) {
      console.error('MongoDB not connected. ReadyState:', mongoose.connection.readyState);
      return res.status(503).json({ error: 'Database not connected. Please wait for MongoDB connection.' });
    }

    let userInfo;
    try {
      userInfo = await verifyFirebaseToken(firebaseToken);
      console.log('✅ Firebase token verified:', userInfo.uid);
    } catch (error) {
      console.error('❌ Firebase token verification failed:', error);
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
      console.log('✅ User updated in MongoDB:', existingUser.email);

      const userResponse = {
        id: existingUser._id.toString(),
        email: existingUser.email,
        fullName: existingUser.fullName,
        phone: existingUser.phone || '',
        isCreator: existingUser.isCreator || false,
        isVerified: existingUser.isVerified || false,
        memberSince: existingUser.memberSince || existingUser.createdAt,
        pointsBalance: existingUser.pointsBalance || 100,
        profilePicture: existingUser.profileImage || photoURL || null,
        firebaseUid: existingUser.firebaseUid,
        role: existingUser.role || (existingUser.isCreator ? 'creator' : 'user'),
      };

      return res.json({ 
        user: userResponse, 
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
      console.log('✅ New user created in MongoDB:', newUser.email);

      const userResponse = {
        id: newUser._id.toString(),
        email: newUser.email,
        fullName: newUser.fullName,
        phone: newUser.phone || '',
        isCreator: newUser.isCreator || false,
        isVerified: newUser.isVerified || false,
        memberSince: newUser.memberSince || newUser.createdAt,
        pointsBalance: newUser.pointsBalance || 100,
        profilePicture: newUser.profileImage || photoURL || null,
        firebaseUid: newUser.firebaseUid,
        role: newUser.role || 'user',
      };

      return res.status(201).json({ 
        user: userResponse, 
        token: `token_${newUser._id}`,
        isNewUser: true
      });
    }
  } catch (error) {
    console.error('Sync Firebase user error:', error);
    throw error;
  }
}

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    const user = await User.findOne({ email: email.toLowerCase() }).select('+password');

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const hashedPassword = crypto.createHash('sha256').update(password).digest('hex');
    if (!user.password || user.password !== hashedPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    user.lastActive = new Date();
    await user.save();

    const userResponse = {
      id: user._id.toString(),
      email: user.email,
      fullName: user.fullName,
      phone: user.phone || '',
      isCreator: user.isCreator || false,
      isVerified: user.isVerified || false,
      memberSince: user.memberSince || user.createdAt,
      pointsBalance: user.pointsBalance || 100,
      profilePicture: user.profileImage || null,
      role: user.role || (user.isCreator ? 'creator' : 'user'),
    };
    
    res.json({ user: userResponse, token: `token_${user._id}` });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/syncUser', async (req, res) => {
  try {
    console.log('=== Sync User Request ===');
    console.log('MongoDB Connection State:', mongoose.connection.readyState);
    
    if (mongoose.connection.readyState !== 1) {
      console.error('MongoDB not connected. ReadyState:', mongoose.connection.readyState);
      return res.status(503).json({ error: 'Database not connected. Please wait for MongoDB connection.' });
    }

    const { firebaseToken, fullName, phone } = req.body;

    if (!firebaseToken) {
      return res.status(400).json({ error: 'Firebase token is required' });
    }
    
    return await syncFirebaseUserToMongoDB(req, res, firebaseToken, fullName, phone);
  } catch (error) {
    console.error('Sync user error:', error);
    console.error('Error name:', error.name);
    console.error('Error message:', error.message);
    if (error.stack) {
      console.error('Error stack:', error.stack);
    }
    
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
      error: error.message || 'Failed to sync user',
      ...(process.env.NODE_ENV === 'development' && { 
        details: {
          name: error.name,
          stack: error.stack
        }
      })
    });
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

    const userResponse = {
      id: user._id.toString(),
      email: user.email,
      fullName: user.fullName,
      phone: user.phone || '',
      isCreator: user.isCreator || false,
      isVerified: user.isVerified || false,
      memberSince: user.memberSince || user.createdAt,
      pointsBalance: user.pointsBalance || 100,
      profilePicture: user.profileImage || null,
    };
    
    res.json({ user: userResponse });
  } catch (error) {
    console.error('Get me error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;

