import express from 'express';
import mongoose from 'mongoose';
import User from '../../models/User.js';

const router = express.Router();

// Get all users
router.get('/', async (req, res) => {
  try {
    // Check if MongoDB is connected
    if (mongoose.connection.readyState !== 1) {
      console.warn('MongoDB not connected. ReadyState:', mongoose.connection.readyState);
      // Return empty array instead of error - admin panel can still work
      return res.json([]);
    }

    // Fetch ALL users from MongoDB (including Google OAuth users)
    // Use lean() for better performance and to ensure all users are returned
    console.log('Starting user query...');
    console.log('MongoDB connection state:', mongoose.connection.readyState);
    console.log('Database name:', mongoose.connection.name);
    
    // First, check what collections exist and try different collection names
    try {
      const collections = await mongoose.connection.db.listCollections().toArray();
      console.log('📋 Available collections:', collections.map(c => c.name));
      
      // Try different possible collection names
      const possibleCollectionNames = ['users', 'Users', 'user', 'User'];
      let foundCollection = null;
      
      for (const collName of possibleCollectionNames) {
        const collection = collections.find(c => c.name.toLowerCase() === collName.toLowerCase());
        if (collection) {
          foundCollection = collection.name;
          console.log(`✅ Found collection: "${foundCollection}"`);
          
          // Get count directly from collection
          try {
            const directCount = await mongoose.connection.db.collection(foundCollection).countDocuments({});
            console.log(`📊 Direct collection count from "${foundCollection}": ${directCount}`);
            
            // If count > 0, get sample users
            if (directCount > 0) {
              const sampleUsers = await mongoose.connection.db.collection(foundCollection).find({}).limit(3).toArray();
              console.log(`📊 Sample users from "${foundCollection}":`, sampleUsers.map(u => ({
                _id: u._id,
                email: u.email,
                firebaseUid: u.firebaseUid
              })));
            }
          } catch (countError) {
            console.error(`Error counting "${foundCollection}":`, countError);
          }
          break;
        }
      }
      
      if (!foundCollection) {
        console.warn('⚠️  No users collection found!');
        console.warn('Available collections:', collections.map(c => c.name));
        console.warn('Trying to use "users" collection anyway...');
        
        // If no users collection exists, it means no users have been created yet
        // This is normal if Firebase users haven't been synced
        console.log('💡 Tip: Use POST /api/auth/syncAllFirebaseUsers to sync Firebase users to MongoDB');
      }
    } catch (colError) {
      console.error('Error listing collections:', colError);
    }
    
    // Check count using Mongoose model
    let userCount = 0;
    try {
      userCount = await User.countDocuments({}).maxTimeMS(5000);
      console.log(`📊 Mongoose model count: ${userCount}`);
      
      // If count > 0 but we're not finding users, try different approaches
      if (userCount > 0) {
        console.log('⚠️  Count shows users exist, but query might be failing');
        console.log('🔍 Trying to find users with different queries...');
        
        // Try 1: Simple find without any options
        try {
          const simpleFind = await User.find({}).limit(1).lean();
          console.log(`📊 Simple find() returned ${simpleFind.length} users`);
          if (simpleFind.length > 0) {
            console.log('✅ Found user with simple find():', {
              _id: simpleFind[0]._id,
              email: simpleFind[0].email
            });
          }
        } catch (simpleError) {
          console.error('❌ Simple find() error:', simpleError.message);
        }
        
        // Try 2: Direct MongoDB collection query without any filters
        try {
          const db = mongoose.connection.db;
          const directUsers = await db.collection('users').find({}).limit(5).toArray();
          console.log(`📊 Direct MongoDB collection('users').find() returned ${directUsers.length} users`);
          if (directUsers.length > 0) {
            console.log('✅ Found users with direct MongoDB query:', directUsers.map(u => ({
              _id: u._id,
              email: u.email,
              firebaseUid: u.firebaseUid
            })));
          }
        } catch (directError) {
          console.error('❌ Direct MongoDB query error:', directError.message);
        }
        
        // Try 3: Check if there's a filter issue by trying to get all documents
        try {
          const allDocs = await mongoose.connection.db.collection('users').countDocuments({});
          console.log(`📊 Direct countDocuments() on 'users' collection: ${allDocs}`);
        } catch (countError) {
          console.error('❌ Direct countDocuments() error:', countError.message);
        }
      }
    } catch (countError) {
      console.error('Error counting users:', countError);
      // Continue anyway to try fetching
    }
    
    // Now fetch users - try multiple methods
    let users = [];
    
    // Method 1: Try Mongoose model query
    try {
      console.log('🔍 Attempting Mongoose User.find() query...');
      console.log('Database name:', mongoose.connection.name);
      console.log('Collection name (expected): users');
      
      // First, try the simplest possible query
      users = await User.find({})
        .lean()
        .maxTimeMS(15000)
        .exec();
      
      console.log(`✅ Mongoose query returned ${users ? users.length : 0} users`);
      
      // If no users found, try without lean() to see if that's the issue
      if (!users || users.length === 0) {
        console.log('🔍 Trying Mongoose query without lean()...');
        const usersWithoutLean = await User.find({})
          .maxTimeMS(15000)
          .exec();
        console.log(`📊 Query without lean() returned ${usersWithoutLean ? usersWithoutLean.length : 0} users`);
        if (usersWithoutLean && usersWithoutLean.length > 0) {
          users = usersWithoutLean.map(u => u.toObject());
          console.log('✅ Found users without lean(), converting to objects');
        }
      }
      
      // If still no users, try with sort
      if (!users || users.length === 0) {
        console.log('🔍 Trying Mongoose query with sort...');
        users = await User.find({})
          .sort({ createdAt: -1 })
          .lean()
          .maxTimeMS(15000)
          .exec();
        console.log(`📊 Query with sort returned ${users ? users.length : 0} users`);
      }
    } catch (queryError) {
      console.error('❌ Mongoose query error:', queryError);
      console.error('Error name:', queryError.name);
      console.error('Error message:', queryError.message);
      console.error('Error stack:', queryError.stack);
      
      // If query fails, try a simpler query
      try {
        console.log('🔍 Trying simplest Mongoose query (no options)...');
        users = await User.find({}).exec();
        console.log(`✅ Simplest Mongoose query returned ${users ? users.length : 0} users`);
      } catch (simpleError) {
        console.error('❌ Simplest Mongoose query also failed:', simpleError);
      }
    }
    
    // Method 2: If Mongoose fails, try direct MongoDB collection query with different collection names
    if (!users || users.length === 0) {
      const possibleCollectionNames = ['users', 'Users', 'user', 'User'];
      
      for (const collName of possibleCollectionNames) {
        try {
          console.log(`🔍 Trying direct MongoDB collection query on "${collName}"...`);
          const directUsers = await mongoose.connection.db.collection(collName)
            .find({})
            .sort({ createdAt: -1 })
            .limit(1000)
            .toArray();
          
          if (directUsers && directUsers.length > 0) {
            console.log(`✅ Direct MongoDB query on "${collName}" returned ${directUsers.length} users`);
            // Convert to Mongoose format
            users = directUsers;
            break; // Found users, stop trying other collection names
          } else {
            console.log(`⚠️  Direct MongoDB query on "${collName}" returned 0 users`);
          }
        } catch (directError) {
          console.error(`❌ Direct MongoDB query error on "${collName}":`, directError.message);
          // Continue to next collection name
        }
      }
    }
    
    // If count shows users but query returns empty, log warning (only if count > 0)
    if (userCount > 0 && (!users || users.length === 0)) {
      console.warn('⚠️  Count shows users exist but query returned empty array!');
      console.warn('This might indicate a query issue or collection name mismatch');
      console.warn('Trying to list collections...');
      
      // Try to check collection name
      try {
        const collections = await mongoose.connection.db.listCollections().toArray();
        console.log('Available collections:', collections.map(c => c.name));
      } catch (colError) {
        console.error('Error listing collections:', colError);
      }
    }
    
    console.log(`Found ${users ? users.length : 0} total users in database`);
    
    // Log sample of user emails for debugging (only if users found)
    if (users && users.length > 0) {
      console.log('Sample users:', users.slice(0, 3).map(u => ({ 
        email: u.email, 
        firebaseUid: u.firebaseUid, 
        createdAt: u.createdAt,
        _id: u._id 
      })));
    } else if (userCount === 0) {
      // Only log this if count is actually 0 (collection doesn't exist or is empty)
      console.log('ℹ️  No users found in database. Collection may not exist yet.');
      console.log('💡 Tip: Users will be created automatically when they register or sync from Firebase.');
    }
    
    // If no users found, return empty array
    if (!users || users.length === 0) {
      console.log('No users found in database (query returned empty)');
      return res.json([]);
    }
    
    // Format users for admin panel (including Google OAuth users)
    const formattedUsers = users.map(user => {
      try {
        const email = user.email || '';
        const username = user.username || (email ? email.split('@')[0] : 'user') || 'user';
        const userId = user._id ? user._id.toString() : (user.userId || '');
        
        // Handle dates properly
        let memberSince = new Date().toISOString();
        if (user.createdAt) {
          memberSince = user.createdAt instanceof Date ? user.createdAt.toISOString() : new Date(user.createdAt).toISOString();
        } else if (user.memberSince) {
          memberSince = user.memberSince instanceof Date ? user.memberSince.toISOString() : new Date(user.memberSince).toISOString();
        }
        
        let lastActive = new Date().toISOString();
        if (user.lastActive) {
          lastActive = user.lastActive instanceof Date ? user.lastActive.toISOString() : new Date(user.lastActive).toISOString();
        } else if (user.updatedAt) {
          lastActive = user.updatedAt instanceof Date ? user.updatedAt.toISOString() : new Date(user.updatedAt).toISOString();
        }
        
        return {
          id: userId,
          userId: userId,
          username: username,
          email: email,
          phone: user.phone || '',
          fullName: user.fullName || 'User',
          role: (user.isCreator || user.role === 'creator') ? 'creator' : 'user',
          isVerified: user.isVerified || false,
          pointsBalance: user.pointsBalance || 0,
          memberSince: memberSince,
          lastActive: lastActive,
          totalGenerations: user.totalGenerations || 0,
          status: user.status === 'banned' ? 'banned' : user.status === 'inactive' ? 'inactive' : 'active',
        };
      } catch (userError) {
        console.error('Error formatting user:', userError);
        console.error('User data:', JSON.stringify(user, null, 2));
        // Return a minimal user object if formatting fails
        return {
          id: user._id ? user._id.toString() : 'unknown',
          userId: user._id ? user._id.toString() : (user.userId || 'unknown'),
          username: 'user',
          email: user.email || '',
          phone: '',
          fullName: user.fullName || 'User',
          role: 'user',
          isVerified: false,
          pointsBalance: 0,
          memberSince: new Date().toISOString(),
          lastActive: new Date().toISOString(),
          totalGenerations: 0,
          status: 'active',
        };
      }
    });
    
    console.log(`Successfully fetched ${formattedUsers.length} users`);
    res.json(formattedUsers);
  } catch (error) {
    console.error('Error fetching users:', error);
    console.error('Error name:', error.name);
    console.error('Error message:', error.message);
    if (error.stack) {
      console.error('Error stack:', error.stack);
    }
    
    // More specific error messages
    let errorMessage = 'Failed to fetch users';
    if (error.name === 'MongoServerError') {
      errorMessage = 'Database error occurred';
    } else if (error.name === 'MongooseError') {
      errorMessage = 'Database connection error';
    } else if (error.message) {
      errorMessage = error.message;
    }
    
    // Return empty array instead of 500 error for better UX
    console.warn('Returning empty array due to error:', errorMessage);
    res.json([]);
  }
});

// Get user by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    // Mock data
    res.json({ id, email: 'user@example.com', fullName: 'User Name' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Ban user
router.post('/:id/ban', async (req, res) => {
  try {
    const { id } = req.params;
    const user = await User.findById(id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    user.status = 'banned';
    await user.save();
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Unban user
router.post('/:id/unban', async (req, res) => {
  try {
    const { id } = req.params;
    const user = await User.findById(id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    user.status = 'active';
    await user.save();
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Verify user
router.post('/:id/verify', async (req, res) => {
  try {
    const { id } = req.params;
    const user = await User.findById(id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    user.isVerified = true;
    await user.save();
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Add points
router.post('/:id/points', async (req, res) => {
  try {
    const { id } = req.params;
    const { points } = req.body;
    const user = await User.findById(id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const inc = parseInt(points, 10) || 0;
    user.pointsBalance = (user.pointsBalance || 0) + inc;
    await user.save();
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete user
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await User.findByIdAndDelete(id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Test endpoint to check database and create a test user
router.get('/test', async (req, res) => {
  try {
    console.log('=== User Query Test ===');
    
    // Check MongoDB connection
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ error: 'Database not connected' });
    }
    
    const results = {
      connection: {
        state: mongoose.connection.readyState,
        database: mongoose.connection.name,
        host: mongoose.connection.host
      },
      collections: [],
      mongooseCount: 0,
      directCount: 0,
      sampleUsers: []
    };
    
    // List all collections
    try {
      const collections = await mongoose.connection.db.listCollections().toArray();
      results.collections = collections.map(c => ({
        name: c.name,
        type: c.type
      }));
    } catch (colError) {
      console.error('Error listing collections:', colError);
    }
    
    // Mongoose count
    try {
      results.mongooseCount = await User.countDocuments({});
    } catch (countError) {
      console.error('Mongoose count error:', countError);
    }
    
    // Direct MongoDB count
    try {
      results.directCount = await mongoose.connection.db.collection('users').countDocuments({});
    } catch (directCountError) {
      console.error('Direct count error:', directCountError);
    }
    
    // Get sample users
    try {
      const sample = await mongoose.connection.db.collection('users').find({}).limit(3).toArray();
      results.sampleUsers = sample.map(u => ({
        _id: u._id,
        email: u.email,
        firebaseUid: u.firebaseUid,
        fullName: u.fullName
      }));
    } catch (sampleError) {
      console.error('Sample users error:', sampleError);
    }
    
    res.json(results);
  } catch (error) {
    console.error('Test endpoint error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;

router.post('/', async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ error: 'Database not connected' });
    }
    const {
      email,
      fullName,
      phone,
      username,
      pointsBalance,
      isCreator,
      isVerified,
      firebaseUid
    } = req.body || {};
    if (!email || !fullName) {
      return res.status(400).json({ error: 'Email and fullName required' });
    }
    const normalizedEmail = String(email).toLowerCase();
    let user = await User.findOne({ email: normalizedEmail });
    if (user) {
      user.fullName = fullName;
      if (phone !== undefined) user.phone = phone;
      if (username) user.username = username;
      if (typeof pointsBalance === 'number') user.pointsBalance = pointsBalance;
      if (typeof isCreator === 'boolean') user.isCreator = isCreator;
      if (typeof isVerified === 'boolean') user.isVerified = isVerified;
      if (firebaseUid) user.firebaseUid = firebaseUid;
      user.lastActive = new Date();
      await user.save();
    } else {
      const userId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      user = new User({
        userId,
        email: normalizedEmail,
        fullName,
        phone: phone || '',
        username: username || normalizedEmail.split('@')[0],
        pointsBalance: typeof pointsBalance === 'number' ? pointsBalance : 100,
        isCreator: !!isCreator,
        isVerified: !!isVerified,
        firebaseUid: firebaseUid || null,
        status: 'active',
        lastActive: new Date(),
      });
      await user.save();
    }
    res.status(201).json({ id: user._id.toString() });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ error: 'Database not connected' });
    }
    const { id } = req.params;
    const updates = req.body || {};
    const user = await User.findById(id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const allowed = ['fullName','email','phone','username','role','status','pointsBalance','isCreator','isVerified'];
    for (const k of allowed) {
      if (updates[k] !== undefined) user[k] = updates[k];
    }
    if (updates.email) user.email = String(updates.email).toLowerCase();
    user.lastActive = new Date();
    await user.save();
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/:id/promote', async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ error: 'Database not connected' });
    }
    const { id } = req.params;
    const user = await User.findById(id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    user.isCreator = true;
    user.role = 'creator';
    await user.save();
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

