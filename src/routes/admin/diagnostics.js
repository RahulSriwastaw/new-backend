import express from 'express';
import mongoose from 'mongoose';
import User from '../../models/User.js';
import firebaseAdminModule from '../../config/firebaseAdmin.js';
// Get firebaseAdmin from default export or named export
const firebaseAdmin = firebaseAdminModule.default || firebaseAdminModule.firebaseAdmin;

const router = express.Router();

// Comprehensive diagnostic endpoint to check all issues
router.get('/check-all', async (req, res) => {
  try {
    const diagnostics = {
      timestamp: new Date().toISOString(),
      mongodb: {
        connected: mongoose.connection.readyState === 1,
        readyState: mongoose.connection.readyState,
        database: mongoose.connection.name,
        host: mongoose.connection.host,
      },
      collections: {
        available: [],
        usersCollectionExists: false,
        usersCollectionName: null,
        usersCount: 0,
      },
      firebase: {
        adminSDKInitialized: !!firebaseAdmin,
        canListUsers: false,
        firebaseUsersCount: 0,
      },
      models: {
        userModelName: 'User',
        expectedCollection: 'users',
      },
      sync: {
        syncUserEndpoint: '/api/auth/syncUser',
        firebaseLoginEndpoint: '/api/auth/firebase-login',
        endpointsAvailable: true,
      },
      issues: [],
      recommendations: [],
    };

    // Check MongoDB collections
    try {
      const collections = await mongoose.connection.db.listCollections().toArray();
      diagnostics.collections.available = collections.map(c => c.name);
      
      // Check for users collection (try different names)
      const possibleNames = ['users', 'Users', 'user', 'User'];
      for (const name of possibleNames) {
        const found = collections.find(c => c.name.toLowerCase() === name.toLowerCase());
        if (found) {
          diagnostics.collections.usersCollectionExists = true;
          diagnostics.collections.usersCollectionName = found.name;
          
          // Get count
          try {
            const count = await mongoose.connection.db.collection(found.name).countDocuments({});
            diagnostics.collections.usersCount = count;
          } catch (countError) {
            diagnostics.issues.push(`Cannot count documents in ${found.name}: ${countError.message}`);
          }
          break;
        }
      }
      
      if (!diagnostics.collections.usersCollectionExists) {
        diagnostics.issues.push('❌ Users collection does not exist in MongoDB');
        diagnostics.recommendations.push('Create a user via /api/auth/firebase-login or /api/auth/syncUser to create the collection');
      }
    } catch (colError) {
      diagnostics.issues.push(`Cannot list collections: ${colError.message}`);
    }

    // Check Firebase Admin SDK
    if (firebaseAdmin) {
      try {
        const listUsersResult = await firebaseAdmin.auth().listUsers(1);
        diagnostics.firebase.canListUsers = true;
        // Get total count (this is approximate)
        diagnostics.firebase.firebaseUsersCount = listUsersResult.users.length > 0 ? '>0 (check Firebase console for exact count)' : 0;
      } catch (firebaseError) {
        diagnostics.issues.push(`Cannot list Firebase users: ${firebaseError.message}`);
      }
    } else {
      diagnostics.issues.push('❌ Firebase Admin SDK not initialized');
      diagnostics.recommendations.push('Check Firebase Admin configuration in config/firebaseAdmin.js');
    }

    // Check Mongoose model
    try {
      const userCount = await User.countDocuments({});
      diagnostics.collections.usersCount = userCount;
      
      if (userCount === 0 && diagnostics.firebase.firebaseUsersCount !== 0) {
        diagnostics.issues.push('⚠️ Firebase has users but MongoDB has 0 users - SYNC NOT HAPPENING');
        diagnostics.recommendations.push('Call /api/auth/syncAllFirebaseUsers to sync existing Firebase users');
        diagnostics.recommendations.push('Ensure frontend calls /api/auth/syncUser after every Firebase login');
      }
    } catch (modelError) {
      diagnostics.issues.push(`Cannot query User model: ${modelError.message}`);
    }

    // Final recommendations
    if (diagnostics.collections.usersCount === 0) {
      diagnostics.recommendations.push('No users in MongoDB. Users will be created when they login via Firebase.');
      diagnostics.recommendations.push('Test: POST /api/auth/firebase-login with a valid Firebase token');
    }

    res.json(diagnostics);
  } catch (error) {
    res.status(500).json({ 
      error: error.message,
      stack: error.stack 
    });
  }
});

export default router;

