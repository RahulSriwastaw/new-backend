import express from 'express';
import mongoose from 'mongoose';
import Admin from '../../models/Admin.js';
import crypto from 'crypto';

const router = express.Router();

// Create super admin endpoint (for initial setup)
router.post('/create-super-admin', async (req, res) => {
  try {
    // Check MongoDB connection
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ error: 'Database not connected. Please wait for MongoDB connection.' });
    }

    const SUPER_ADMIN = {
      email: 'Rahul@Malik',
      password: 'Rupantramalik@rahul',
      name: 'Rahul Malik',
      role: 'super_admin',
    };

    // Check if super admin already exists
    const existingAdmin = await Admin.findOne({ email: SUPER_ADMIN.email.toLowerCase() });
    
    if (existingAdmin) {
      // Update existing admin
      const hashedPassword = crypto.createHash('sha256').update(SUPER_ADMIN.password).digest('hex');
      existingAdmin.password = hashedPassword;
      existingAdmin.role = 'super_admin';
      existingAdmin.isActive = true;
      existingAdmin.name = SUPER_ADMIN.name;
      await existingAdmin.save();
      return res.json({ message: 'Super admin updated successfully', admin: existingAdmin });
    } else {
      // Create new super admin
      const hashedPassword = crypto.createHash('sha256').update(SUPER_ADMIN.password).digest('hex');
      
      const superAdmin = new Admin({
        email: SUPER_ADMIN.email.toLowerCase(),
        password: hashedPassword,
        name: SUPER_ADMIN.name,
        role: SUPER_ADMIN.role,
        isActive: true,
        permissions: {
          users: { view: true, edit: true, delete: true },
          templates: { view: true, edit: true, approve: true },
          creators: { view: true, approve: true },
          transactions: { view: true, refund: true },
          moderation: { view: true, action: true },
          wallet: { view: true, adjust: true },
          aiConfig: { view: true, edit: true },
          finance: { view: true, export: true },
          reports: { view: true, export: true },
          settings: { view: true, edit: true },
          admins: { view: true, create: true },
        },
      });

      await superAdmin.save();
      return res.json({ message: 'Super admin created successfully', admin: superAdmin });
    }
  } catch (error) {
    console.error('Create super admin error:', error);
    res.status(500).json({ error: error.message || 'Failed to create super admin' });
  }
});

// Admin login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    console.log('=== Admin Login Request ===');
    console.log('Email received:', email);
    console.log('Password received:', password ? '***' : 'missing');
    console.log('MongoDB Connection State:', mongoose.connection.readyState);

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    // Check MongoDB connection
    if (mongoose.connection.readyState !== 1) {
      console.error('MongoDB not connected');
      return res.status(503).json({ error: 'Database not connected. Please wait for MongoDB connection.' });
    }

    // Normalize email to lowercase
    const normalizedEmail = email.toLowerCase();
    console.log('Searching for admin with email:', normalizedEmail);

    // Find admin by email (include password field)
    const admin = await Admin.findOne({ email: normalizedEmail }).select('+password');

    if (!admin) {
      console.log('Admin not found with email:', normalizedEmail);
      // Auto-create super admin if credentials match
      if (normalizedEmail === 'rahul@malik' && password === 'Rupantramalik@rahul') {
        console.log('Super admin not found. Auto-creating super admin...');
        try {
          const hashedPassword = crypto.createHash('sha256').update(password).digest('hex');
          const newSuperAdmin = new Admin({
            email: normalizedEmail,
            password: hashedPassword,
            name: 'Rahul Malik',
            role: 'super_admin',
            isActive: true,
            permissions: {
              users: { view: true, edit: true, delete: true },
              templates: { view: true, edit: true, approve: true },
              creators: { view: true, approve: true },
              transactions: { view: true, refund: true },
              moderation: { view: true, action: true },
              wallet: { view: true, adjust: true },
              aiConfig: { view: true, edit: true },
              finance: { view: true, export: true },
              reports: { view: true, export: true },
              settings: { view: true, edit: true },
              admins: { view: true, create: true },
            },
          });
          await newSuperAdmin.save();
          console.log('✅ Super admin auto-created successfully');
          // Use the newly created admin
          const adminResponse = {
            id: newSuperAdmin._id.toString(),
            email: newSuperAdmin.email,
            name: newSuperAdmin.name,
            role: newSuperAdmin.role,
            permissions: newSuperAdmin.permissions,
            isActive: newSuperAdmin.isActive,
            createdAt: newSuperAdmin.createdAt ? (newSuperAdmin.createdAt instanceof Date ? newSuperAdmin.createdAt.toISOString() : newSuperAdmin.createdAt) : new Date().toISOString(),
          };
          const token = `admin_token_${newSuperAdmin._id}_${Date.now()}`;
          return res.json({ admin: adminResponse, token });
        } catch (createError) {
          console.error('Error auto-creating super admin:', createError);
          return res.status(500).json({ error: 'Failed to create super admin. Please try again.' });
        }
      }
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    console.log('Admin found:', {
      id: admin._id,
      email: admin.email,
      name: admin.name,
      role: admin.role,
      isActive: admin.isActive,
      hasPassword: !!admin.password
    });

    // Check if admin is active
    if (!admin.isActive) {
      console.log('Admin account is deactivated');
      return res.status(403).json({ error: 'Admin account is deactivated' });
    }

    // Hash the provided password and compare
    const hashedPassword = crypto.createHash('sha256').update(password).digest('hex');
    console.log('Password comparison:', {
      providedHash: hashedPassword.substring(0, 20) + '...',
      storedHash: admin.password ? admin.password.substring(0, 20) + '...' : 'null',
      match: admin.password === hashedPassword
    });
    
    if (admin.password !== hashedPassword) {
      console.log('Password mismatch');
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    console.log('Login successful for:', admin.email);

    // Update last login
    admin.lastLogin = new Date();
    admin.lastLoginIp = req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    await admin.save();

    // Return admin data (without password)
    const adminResponse = {
      id: admin._id.toString(),
      email: admin.email,
      name: admin.name,
      role: admin.role,
      permissions: admin.permissions,
      isActive: admin.isActive,
      createdAt: admin.createdAt ? (admin.createdAt instanceof Date ? admin.createdAt.toISOString() : admin.createdAt) : new Date().toISOString(),
    };

    // Generate token
    const token = `admin_token_${admin._id}_${Date.now()}`;

    res.json({ admin: adminResponse, token });
  } catch (error) {
    console.error('Admin login error:', error);
    res.status(500).json({ error: error.message || 'Login failed' });
  }
});

export default router;
