const express = require('express');
const router = express.Router();
const { TopBanner } = require('../models-monetization');
const { User } = require('../models');
const mongoose = require('mongoose');

// ============================================
// TOP PROMOTIONAL BANNER SYSTEM
// ============================================

// Get active top banner for user (Frontend API)
router.get('/active', async (req, res) => {
  try {
    // Try to get userId from token if available
    const token = req.header('Authorization')?.replace('Bearer ', '');
    let userId = null;
    let user = null;
    let userAgent = req.headers['user-agent'] || '';
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);
    const deviceType = isMobile ? 'mobile' : 'desktop';
    
    if (token) {
      try {
        const jwt = require('jsonwebtoken');
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'RupantarAI_Secure_Secret_2025');
        userId = decoded.user?.id || decoded.user?.userId || decoded.user?._id;
        if (userId) {
          user = await User.findById(userId).lean();
        }
      } catch (tokenError) {
        // Token invalid - continue without user context
      }
    }
    
    const now = new Date();
    
    // Get all active banners within time window
    const banners = await TopBanner.find({
      status: 'active',
      startAt: { $lte: now },
      endAt: { $gte: now }
    })
    .sort({ priority: -1 })
    .lean();

    if (banners.length === 0) {
      return res.json({ success: true, banner: null });
    }

    // Filter by device targeting
    const deviceFilteredBanners = banners.filter(banner => {
      return banner.deviceTargeting.includes('both') || banner.deviceTargeting.includes(deviceType);
    });

    if (deviceFilteredBanners.length === 0) {
      return res.json({ success: true, banner: null });
    }

    // Filter by user segments
    const filteredBanners = deviceFilteredBanners.filter(banner => {
      const segments = banner.allowedUserSegments || ['all'];
      
      if (segments.includes('all')) return true;
      if (!user) {
        // If no user, only show 'all' banners
        return segments.includes('all');
      }
      
      if (segments.includes('logged_in')) return true;
      
      if (segments.includes('new')) {
        const joinedDate = user.createdAt || new Date();
        const daysSinceJoin = (now.getTime() - new Date(joinedDate).getTime()) / (1000 * 60 * 60 * 24);
        return daysSinceJoin <= 7; // New user = joined within 7 days
      }
      
      if (segments.includes('low_balance')) {
        return (user.points || 0) < 50; // Low balance = less than 50 points
      }
      
      if (segments.includes('premium')) {
        // Check if user has active premium subscription
        return user.role === 'premium' || (user.points || 0) > 1000;
      }
      
      return true;
    });

    // Return highest priority banner only
    const topBanner = filteredBanners[0] || null;
    
    if (topBanner) {
      // Track view
      await TopBanner.updateOne({ _id: topBanner._id }, { $inc: { views: 1 } });
    }

    res.json({ success: true, banner: topBanner });
  } catch (error) {
    console.error('❌ Error fetching active top banner:', error);
    res.status(500).json({ error: 'Failed to fetch banner', message: error.message });
  }
});

// Track banner view
router.post('/track/view', async (req, res) => {
  try {
    const { bannerId } = req.body;
    if (bannerId) {
      await TopBanner.updateOne({ _id: bannerId }, { $inc: { views: 1 } });
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to track view' });
  }
});

// Track banner click
router.post('/track/click', async (req, res) => {
  try {
    const { bannerId } = req.body;
    if (bannerId) {
      await TopBanner.updateOne({ _id: bannerId }, { $inc: { clicks: 1 } });
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to track click' });
  }
});

// Track banner dismiss
router.post('/track/dismiss', async (req, res) => {
  try {
    const { bannerId } = req.body;
    if (bannerId) {
      await TopBanner.updateOne({ _id: bannerId }, { $inc: { dismissals: 1 } });
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to track dismiss' });
  }
});

// ============================================
// ADMIN ROUTES
// ============================================

// Get all banners (Admin)
router.get('/admin/banners', async (req, res) => {
  try {
    const banners = await TopBanner.find().sort({ priority: -1, createdAt: -1 }).lean();
    res.json({ success: true, banners });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch banners' });
  }
});

// Create banner (Admin)
router.post('/admin/banners', async (req, res) => {
  try {
    console.log('📤 Creating top banner:', {
      titleText: req.body.titleText,
      priority: req.body.priority,
      startAt: req.body.startAt,
      endAt: req.body.endAt
    });

    // Validate required fields
    if (!req.body.titleText || !req.body.startAt || !req.body.endAt) {
      return res.status(400).json({ 
        error: 'Missing required fields', 
        message: 'titleText, startAt, and endAt are required' 
      });
    }

    // Convert date strings to Date objects
    const bannerData = {
      ...req.body,
      startAt: new Date(req.body.startAt),
      endAt: new Date(req.body.endAt),
      createdAt: new Date(),
      updatedAt: new Date()
    };

    // Validate dates
    if (isNaN(bannerData.startAt.getTime()) || isNaN(bannerData.endAt.getTime())) {
      return res.status(400).json({ 
        error: 'Invalid dates', 
        message: 'startAt and endAt must be valid dates' 
      });
    }

    const banner = new TopBanner(bannerData);
    await banner.save();
    
    console.log('✅ Top banner created successfully:', banner._id);
    res.json({ success: true, banner });
  } catch (error) {
    console.error('❌ Error creating top banner:', error);
    res.status(500).json({ 
      error: 'Failed to create banner', 
      message: error.message,
      details: error.name === 'ValidationError' ? error.errors : undefined
    });
  }
});

// Update banner (Admin)
router.put('/admin/banners/:id', async (req, res) => {
  try {
    const updateData = {
      ...req.body,
      updatedAt: new Date()
    };

    // Convert dates if provided
    if (updateData.startAt) updateData.startAt = new Date(updateData.startAt);
    if (updateData.endAt) updateData.endAt = new Date(updateData.endAt);
    if (updateData.countdownEndDate) updateData.countdownEndDate = new Date(updateData.countdownEndDate);

    const banner = await TopBanner.findByIdAndUpdate(req.params.id, updateData, { new: true });
    if (!banner) {
      return res.status(404).json({ error: 'Banner not found' });
    }
    res.json({ success: true, banner });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update banner', message: error.message });
  }
});

// Delete banner (Admin)
router.delete('/admin/banners/:id', async (req, res) => {
  try {
    await TopBanner.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete banner' });
  }
});

module.exports = router;

