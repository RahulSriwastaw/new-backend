const express = require('express');
const router = express.Router();
const { Popup, Offer, PromoCode, AdLog } = require('../models-monetization');
const { User, PointsPackage, Transaction, AdsConfig } = require('../models');
const mongoose = require('mongoose');

// ============================================
// MODULE 1: POPUP NOTIFICATION SYSTEM
// ============================================

// Get active popups for user (Frontend API) - NO AUTH REQUIRED (public endpoint)
router.get('/popups/active', async (req, res) => {
  try {
    // Try to get userId from token if available, but don't require it
    const token = req.header('Authorization')?.replace('Bearer ', '');
    let userId = null;
    let user = null;
    
    if (token) {
      try {
        const jwt = require('jsonwebtoken');
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'RupantarAI_Secure_Secret_2025');
        userId = decoded.user?.id || decoded.user?.userId || decoded.user?._id;
        if (userId) {
          user = await User.findById(userId).lean();
        }
      } catch (tokenError) {
        // Token invalid or missing - continue without user context
        console.log('No valid token for popup request, showing to all users');
      }
    }
    
    const now = new Date();
    
    console.log('📢 Fetching active popups:', {
      userId,
      hasUser: !!user,
      now: now.toISOString()
    });
    
    // Get all active popups within time window
    const popups = await Popup.find({
      isEnabled: true,
      startTime: { $lte: now },
      endTime: { $gte: now }
    }).sort({ priority: 1 }).lean();

    console.log(`Found ${popups.length} active popups`);

    if (popups.length === 0) {
      return res.json({ success: true, popup: null });
    }

    // Filter by target users
    const filteredPopups = popups.filter(popup => {
      if (popup.targetUsers === 'all') return true;
      if (!user) {
        // If no user, only show 'all' popups
        return popup.targetUsers === 'all';
      }
      
      if (popup.targetUsers === 'new') {
        const joinedDate = user.createdAt || user.joinedDate || new Date();
        const daysSinceJoin = (now.getTime() - new Date(joinedDate).getTime()) / (1000 * 60 * 60 * 24);
        return daysSinceJoin <= 7; // New user = joined within 7 days
      }
      
      if (popup.targetUsers === 'low_balance') {
        return (user.points || 0) < 50; // Low balance = less than 50 points
      }
      
      if (popup.targetUsers === 'inactive') {
        // Inactive = no generation in last 30 days (would need Generation model check)
        return true; // Simplified for now
      }
      
      return true;
    });

    console.log(`Filtered to ${filteredPopups.length} popups for user`);

    // Return highest priority popup only
    const topPopup = filteredPopups[0] || null;
    
    if (topPopup) {
      // Track impression
      await Popup.updateOne({ _id: topPopup._id }, { $inc: { impressions: 1 } });
      console.log('✅ Returning popup:', topPopup._id, topPopup.title);
    } else {
      console.log('No popup matches user criteria');
    }

    res.json({ success: true, popup: topPopup });
  } catch (error) {
    console.error('❌ Error fetching active popups:', error);
    res.status(500).json({ error: 'Failed to fetch popups', message: error.message });
  }
});

// Track popup click
router.post('/popups/:id/click', async (req, res) => {
  try {
    await Popup.updateOne({ _id: req.params.id }, { $inc: { clicks: 1 } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to track click' });
  }
});

// Track popup close
router.post('/popups/:id/close', async (req, res) => {
  try {
    await Popup.updateOne({ _id: req.params.id }, { $inc: { closes: 1 } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to track close' });
  }
});

// Admin: Get all popups
router.get('/popups', async (req, res) => {
  try {
    const popups = await Popup.find().sort({ createdAt: -1 });
    res.json({ success: true, popups });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch popups' });
  }
});

// Admin: Create popup
router.post('/popups', async (req, res) => {
  try {
    console.log('📤 Creating popup with data:', {
      title: req.body.title,
      hasImage: !!req.body.image,
      startTime: req.body.startTime,
      endTime: req.body.endTime,
      popupType: req.body.popupType
    });

    // Validate required fields
    if (!req.body.title || !req.body.description) {
      return res.status(400).json({ 
        error: 'Missing required fields', 
        message: 'Title and description are required' 
      });
    }

    // Auto-generate validity text if enabled
    if (req.body.textContent?.autoGenerateValidity && req.body.endTime) {
      const endDate = new Date(req.body.endTime);
      const day = endDate.getDate();
      const month = endDate.toLocaleString('en-US', { month: 'short' });
      const ordinalSuffix = (d) => {
        if (d > 3 && d < 21) return 'th';
        switch (d % 10) {
          case 1: return 'st';
          case 2: return 'nd';
          case 3: return 'rd';
          default: return 'th';
        }
      };
      req.body.textContent.validityText = `Limited-time offer — ends ${day}${ordinalSuffix(day)} ${month}`;
    }

    // Convert date strings to Date objects if needed
    const popupData = {
      ...req.body,
      startTime: req.body.startTime ? new Date(req.body.startTime) : undefined,
      endTime: req.body.endTime ? new Date(req.body.endTime) : undefined,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    // Clean template data for OFFER_SPLIT_IMAGE_RIGHT_CONTENT
    if (popupData.templateId === 'OFFER_SPLIT_IMAGE_RIGHT_CONTENT' && popupData.templateData) {
      if (popupData.templateData.mainHeading) {
        popupData.templateData.mainHeading = popupData.templateData.mainHeading.trim().toUpperCase();
      }
      if (popupData.templateData.subHeading) {
        popupData.templateData.subHeading = popupData.templateData.subHeading.trim().toUpperCase();
      }
      if (popupData.templateData.description) {
        popupData.templateData.description = popupData.templateData.description.trim();
      }
      if (popupData.templateData.leftOverlayText) {
        popupData.templateData.leftOverlayText = popupData.templateData.leftOverlayText.trim();
      }
      // Clean tags
      if (popupData.templateData.tags) {
        popupData.templateData.tags = popupData.templateData.tags
          .map((tag) => ({
            ...tag,
            text: tag.text?.trim() || ''
          }))
          .filter((tag) => tag.text && tag.isEnabled);
      }
      // Clean features
      if (popupData.templateData.features) {
        popupData.templateData.features = popupData.templateData.features
          .map((feature) => ({
            text: feature.text?.trim() || '',
            badgeType: feature.badgeType || 'unlimited', // Preserve badgeType, default to unlimited
            isEnabled: feature.isEnabled !== false,
            order: feature.order || 0
          }))
          .filter((feature) => feature.text && feature.isEnabled);
      }
      
      // Validate templateData.ctaAction enum
      const ALLOWED_CTA_ACTIONS = ['apply_offer', 'buy_plan', 'open_payment', 'redirect'];
      if (popupData.templateData.ctaAction && !ALLOWED_CTA_ACTIONS.includes(popupData.templateData.ctaAction)) {
        return res.status(400).json({
          success: false,
          error: 'Validation error',
          message: `Invalid templateData.ctaAction: ${popupData.templateData.ctaAction}. Allowed values: ${ALLOWED_CTA_ACTIONS.join(', ')}`
        });
      }
    }

    // Clean text content - trim and validate (for legacy templates)
    if (popupData.textContent) {
      if (popupData.textContent.mainTitle) {
        popupData.textContent.mainTitle = popupData.textContent.mainTitle.trim();
      }
      if (popupData.textContent.description) {
        popupData.textContent.description = popupData.textContent.description.trim();
      }
      // Clean tags
      if (popupData.textContent.tags) {
        popupData.textContent.tags = popupData.textContent.tags
          .map((tag) => ({
            ...tag,
            text: tag.text?.trim() || ''
          }))
          .filter((tag) => tag.text);
      }
      // Clean features
      if (popupData.textContent.features) {
        popupData.textContent.features = popupData.textContent.features
          .map((feature) => ({
            ...feature,
            text: feature.text?.trim() || ''
          }))
          .filter((feature) => feature.text);
      }
    }

    // Validate dates
    if (!popupData.startTime || isNaN(popupData.startTime.getTime())) {
      return res.status(400).json({ 
        error: 'Invalid start time', 
        message: 'Start time must be a valid date' 
      });
    }
    if (!popupData.endTime || isNaN(popupData.endTime.getTime())) {
      return res.status(400).json({ 
        error: 'Invalid end time', 
        message: 'End time must be a valid date' 
      });
    }

    const popup = new Popup(popupData);
    await popup.save();
    
    console.log('✅ Popup created successfully:', popup._id);
    res.json({ success: true, popup });
  } catch (error) {
    console.error('❌ Error creating popup:', error);
    console.error('Error details:', {
      message: error.message,
      name: error.name,
      stack: error.stack
    });
    res.status(500).json({ 
      error: 'Failed to create popup', 
      message: error.message,
      details: error.name === 'ValidationError' ? error.errors : undefined
    });
  }
});

// Admin: Get single popup by ID
router.get('/popups/:id', async (req, res) => {
  try {
    const popup = await Popup.findById(req.params.id);
    if (!popup) {
      return res.status(404).json({ error: 'Popup not found' });
    }
    res.json({ success: true, popup });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch popup', message: error.message });
  }
});

// Admin: Update popup
router.put('/popups/:id', async (req, res) => {
  try {
    console.log('📝 Updating popup:', req.params.id, {
      title: req.body.title,
      hasImage: !!req.body.image,
      isEnabled: req.body.isEnabled
    });

    // Find existing popup
    const existingPopup = await Popup.findById(req.params.id);
    if (!existingPopup) {
      return res.status(404).json({ 
        success: false,
        error: 'Popup not found',
        message: 'Popup with this ID does not exist' 
      });
    }

    // Validate required fields if provided
    if (req.body.title !== undefined && !req.body.title) {
      return res.status(400).json({ 
        success: false,
        error: 'Validation error',
        message: 'Title is required and cannot be empty' 
      });
    }

    // BACKEND SAFETY VALIDATION: Reject if multiple image fields present
    const imageFields = ['image', 'templateImage', 'templateData'];
    const imageFieldCount = imageFields.filter(field => {
      if (field === 'templateData') {
        return req.body.templateData?.leftImageUrl !== undefined;
      }
      return req.body[field] !== undefined;
    }).length;
    
    if (imageFieldCount > 1) {
      return res.status(400).json({
        success: false,
        error: 'Validation error',
        message: 'Only one image source allowed. Cannot send multiple image fields together.'
      });
    }

    // Prepare update data - only include defined fields
    const updateData = {
      updatedAt: new Date()
    };

    // Only update fields that are provided (not undefined)
    if (req.body.title !== undefined) updateData.title = req.body.title;
    if (req.body.description !== undefined) updateData.description = req.body.description;
    
    // Handle image update - ONLY if key exists in body
    if ('image' in req.body) {
      updateData.image = req.body.image; // Can be null to clear
    }
    
    // Handle templateImage update - ONLY if key exists in body
    if ('templateImage' in req.body) {
      // This will be handled in templateData section below
      if (!updateData.templateData) {
        updateData.templateData = {};
      }
      updateData.templateData.leftImageUrl = req.body.templateImage; // Can be null to clear
      console.log('🖼️ Setting templateImage (leftImageUrl):', req.body.templateImage);
    }
    
    // Handle templateData.leftImageUrl directly if provided
    if (req.body.templateData?.leftImageUrl !== undefined) {
      if (!updateData.templateData) {
        updateData.templateData = {};
      }
      updateData.templateData.leftImageUrl = req.body.templateData.leftImageUrl;
      console.log('🖼️ Setting templateData.leftImageUrl directly:', req.body.templateData.leftImageUrl);
    }
    
    // Handle full templateData object if provided (for OFFER_SPLIT_IMAGE_RIGHT_CONTENT)
    if (req.body.templateData !== undefined && typeof req.body.templateData === 'object') {
      if (!updateData.templateData) {
        updateData.templateData = {};
      }
      // Merge templateData fields
      if (req.body.templateData.mainHeading !== undefined) {
        updateData.templateData.mainHeading = req.body.templateData.mainHeading.trim().toUpperCase();
      }
      if (req.body.templateData.subHeading !== undefined) {
        updateData.templateData.subHeading = req.body.templateData.subHeading.trim().toUpperCase();
      }
      if (req.body.templateData.description !== undefined) {
        updateData.templateData.description = req.body.templateData.description.trim();
      }
      if (req.body.templateData.leftOverlayText !== undefined) {
        updateData.templateData.leftOverlayText = req.body.templateData.leftOverlayText.trim();
      }
      if (req.body.templateData.tags !== undefined) {
        updateData.templateData.tags = req.body.templateData.tags
          .map((tag) => ({
            ...tag,
            text: tag.text?.trim() || ''
          }))
          .filter((tag) => tag.text && tag.isEnabled);
      }
      if (req.body.templateData.features !== undefined) {
        updateData.templateData.features = req.body.templateData.features
          .map((feature) => ({
            text: feature.text?.trim() || '',
            badgeType: feature.badgeType || 'unlimited', // Preserve badgeType, default to unlimited
            isEnabled: feature.isEnabled !== false,
            order: feature.order || 0
          }))
          .filter((feature) => feature.text && feature.isEnabled);
      }
      if (req.body.templateData.ctaText !== undefined) {
        updateData.templateData.ctaText = req.body.templateData.ctaText.trim();
      }
      if (req.body.templateData.ctaAction !== undefined) {
        const ALLOWED_CTA_ACTIONS = ['apply_offer', 'buy_plan', 'open_payment', 'redirect'];
        if (!ALLOWED_CTA_ACTIONS.includes(req.body.templateData.ctaAction)) {
          return res.status(400).json({
            success: false,
            error: 'Validation error',
            message: `Invalid templateData.ctaAction: ${req.body.templateData.ctaAction}. Allowed values: ${ALLOWED_CTA_ACTIONS.join(', ')}`
          });
        }
        updateData.templateData.ctaAction = req.body.templateData.ctaAction;
      }
      if (req.body.templateData.ctaUrl !== undefined) {
        updateData.templateData.ctaUrl = req.body.templateData.ctaUrl.trim();
      }
      console.log('📦 Updated full templateData object');
    }
    
    // For OFFER_SPLIT_IMAGE_RIGHT_CONTENT template, ignore legacy fields
    const isTemplatePopup = req.body.templateId === 'OFFER_SPLIT_IMAGE_RIGHT_CONTENT' || existingPopup.templateId === 'OFFER_SPLIT_IMAGE_RIGHT_CONTENT';
    
    if (!isTemplatePopup) {
      // Legacy popup - handle legacy fields
      if (req.body.ctaText !== undefined) updateData.ctaText = req.body.ctaText;
      
      // Validate ctaAction enum
      const ALLOWED_CTA_ACTIONS = ['apply_offer', 'buy_plan', 'open_payment', 'redirect'];
      if (req.body.ctaAction !== undefined) {
        if (!ALLOWED_CTA_ACTIONS.includes(req.body.ctaAction)) {
          return res.status(400).json({
            success: false,
            error: 'Validation error',
            message: `Invalid ctaAction: ${req.body.ctaAction}. Allowed values: ${ALLOWED_CTA_ACTIONS.join(', ')}`
          });
        }
        updateData.ctaAction = req.body.ctaAction;
      }
      if (req.body.ctaUrl !== undefined) updateData.ctaUrl = req.body.ctaUrl || '';
      if (req.body.popupType !== undefined) updateData.popupType = req.body.popupType;
    } else {
      // Template popup - ignore legacy popupType, use templateData.ctaAction
      // Legacy ctaText/ctaAction/ctaUrl are set from templateData for backward compatibility only
      if (req.body.ctaText !== undefined) updateData.ctaText = req.body.ctaText;
      if (req.body.ctaAction !== undefined) updateData.ctaAction = req.body.ctaAction;
      if (req.body.ctaUrl !== undefined) updateData.ctaUrl = req.body.ctaUrl || '';
      // DO NOT update popupType for template popups
    }
    if (req.body.targetUsers !== undefined) updateData.targetUsers = req.body.targetUsers;
    if (req.body.frequency !== undefined) updateData.frequency = req.body.frequency;
    if (req.body.frequencyHours !== undefined) {
      updateData.frequencyHours = typeof req.body.frequencyHours === 'string' 
        ? parseInt(req.body.frequencyHours) || 24 
        : req.body.frequencyHours;
    }
    if (req.body.priority !== undefined) {
      // Convert priority to number
      const priority = typeof req.body.priority === 'string' 
        ? parseInt(req.body.priority) 
        : req.body.priority;
      if (isNaN(priority) || priority < 0) {
        return res.status(400).json({ 
          success: false,
          error: 'Validation error',
          message: 'Priority must be a non-negative number' 
        });
      }
      updateData.priority = priority;
    }
    if (req.body.isEnabled !== undefined) {
      updateData.isEnabled = req.body.isEnabled === true || req.body.isEnabled === 'true';
    }

    // Handle dates
    if (req.body.startTime !== undefined) {
      const startTime = req.body.startTime ? new Date(req.body.startTime) : null;
      if (!startTime || isNaN(startTime.getTime())) {
        return res.status(400).json({ 
          success: false,
          error: 'Validation error',
          message: 'Invalid start time format' 
        });
      }
      updateData.startTime = startTime;
    }

    if (req.body.endTime !== undefined) {
      const endTime = req.body.endTime ? new Date(req.body.endTime) : null;
      if (!endTime || isNaN(endTime.getTime())) {
        return res.status(400).json({ 
          success: false,
          error: 'Validation error',
          message: 'Invalid end time format' 
        });
      }
      updateData.endTime = endTime;
    }

    // Handle textContent updates
    if (req.body.textContent !== undefined) {
      // Auto-generate validity text if enabled
      if (req.body.textContent.autoGenerateValidity && updateData.endTime) {
        const endDate = updateData.endTime;
        const day = endDate.getDate();
        const month = endDate.toLocaleString('en-US', { month: 'short' });
        const ordinalSuffix = (d) => {
          if (d > 3 && d < 21) return 'th';
          switch (d % 10) {
            case 1: return 'st';
            case 2: return 'nd';
            case 3: return 'rd';
            default: return 'th';
          }
        };
        req.body.textContent.validityText = `Limited-time offer — ends ${day}${ordinalSuffix(day)} ${month}`;
      }

      // Clean and validate text content
      const cleanedTextContent = {};
      if (req.body.textContent.mainTitle !== undefined) {
        cleanedTextContent.mainTitle = req.body.textContent.mainTitle?.trim() || '';
      }
      if (req.body.textContent.description !== undefined) {
        cleanedTextContent.description = req.body.textContent.description?.trim() || '';
      }
      if (req.body.textContent.brandText !== undefined) {
        cleanedTextContent.brandText = req.body.textContent.brandText?.trim() || '';
      }
      if (req.body.textContent.subTitle !== undefined) {
        cleanedTextContent.subTitle = req.body.textContent.subTitle?.trim() || '';
      }
      if (req.body.textContent.validityText !== undefined) {
        cleanedTextContent.validityText = req.body.textContent.validityText?.trim() || '';
      }
      if (req.body.textContent.ctaText !== undefined) {
        cleanedTextContent.ctaText = req.body.textContent.ctaText?.trim() || '';
      }
      if (req.body.textContent.ctaSubText !== undefined) {
        cleanedTextContent.ctaSubText = req.body.textContent.ctaSubText?.trim() || '';
      }
      if (req.body.textContent.couponText !== undefined) {
        cleanedTextContent.couponText = req.body.textContent.couponText?.trim() || '';
      }
      if (req.body.textContent.showBrandText !== undefined) {
        cleanedTextContent.showBrandText = req.body.textContent.showBrandText;
      }
      if (req.body.textContent.autoUppercase !== undefined) {
        cleanedTextContent.autoUppercase = req.body.textContent.autoUppercase;
      }
      if (req.body.textContent.autoGenerateValidity !== undefined) {
        cleanedTextContent.autoGenerateValidity = req.body.textContent.autoGenerateValidity;
      }
      if (req.body.textContent.showCoupon !== undefined) {
        cleanedTextContent.showCoupon = req.body.textContent.showCoupon;
      }
      if (req.body.textContent.maxDescriptionLength !== undefined) {
        cleanedTextContent.maxDescriptionLength = req.body.textContent.maxDescriptionLength;
      }
      if (req.body.textContent.tags !== undefined) {
        cleanedTextContent.tags = req.body.textContent.tags
          .map((tag) => ({
            ...tag,
            text: tag.text?.trim() || ''
          }))
          .filter((tag) => tag.text);
      }
      if (req.body.textContent.features !== undefined) {
        cleanedTextContent.features = req.body.textContent.features
          .map((feature) => ({
            ...feature,
            text: feature.text?.trim() || ''
          }))
          .filter((feature) => feature.text);
      }

      // Merge with existing textContent
      updateData.textContent = {
        ...existingPopup.textContent,
        ...cleanedTextContent
      };
    }

    // Validate date range if both dates are being updated
    if (updateData.startTime && updateData.endTime) {
      if (updateData.startTime >= updateData.endTime) {
        return res.status(400).json({ 
          success: false,
          error: 'Validation error',
          message: 'Start time must be before end time' 
        });
      }
    } else if (updateData.startTime && existingPopup.endTime) {
      if (updateData.startTime >= existingPopup.endTime) {
        return res.status(400).json({ 
          success: false,
          error: 'Validation error',
          message: 'Start time must be before end time' 
        });
      }
    } else if (updateData.endTime && existingPopup.startTime) {
      if (existingPopup.startTime >= updateData.endTime) {
        return res.status(400).json({ 
          success: false,
          error: 'Validation error',
          message: 'Start time must be before end time' 
        });
      }
    }

    // Update popup
    const updatedPopup = await Popup.findByIdAndUpdate(
      req.params.id, 
      updateData, 
      { new: true, runValidators: true }
    );

    console.log('✅ Popup updated successfully:', updatedPopup._id);
    res.json({ success: true, popup: updatedPopup });
  } catch (error) {
    console.error('❌ Error updating popup:', error);
    if (error.name === 'ValidationError') {
      return res.status(400).json({ 
        success: false,
        error: 'Validation error',
        message: error.message,
        details: error.errors 
      });
    }
    res.status(500).json({ 
      success: false,
      error: 'Failed to update popup', 
      message: error.message 
    });
  }
});

// Admin: Delete popup
router.delete('/popups/:id', async (req, res) => {
  try {
    await Popup.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete popup' });
  }
});

// ============================================
// MODULE 2: OFFER & DISCOUNT SYSTEM
// ============================================

// Get active offers for user (Frontend API)
router.get('/offers/active', async (req, res) => {
  try {
    const userId = req.user?.id || req.user?.userId || req.user?._id;
    const now = new Date();
    
    const offers = await Offer.find({
      isEnabled: true,
      startTime: { $lte: now },
      endTime: { $gte: now }
    }).sort({ createdAt: -1 }).lean();

    // Filter by target users and usage limits
    let user = null;
    if (userId) {
      user = await User.findById(userId).lean();
    }

    const filteredOffers = offers.filter(offer => {
      // Check target users
      if (offer.targetUsers !== 'all' && user) {
        if (offer.targetUsers === 'new') {
          const daysSinceJoin = (now - new Date(user.joinedDate)) / (1000 * 60 * 60 * 24);
          if (daysSinceJoin > 7) return false;
        }
        if (offer.targetUsers === 'low_balance') {
          if ((user.points || 0) >= 50) return false;
        }
      }

      // Check usage limits (simplified - would need proper tracking)
      if (offer.usageLimit && offer.totalUses >= offer.usageLimit) return false;

      return true;
    });

    res.json({ success: true, offers: filteredOffers });
  } catch (error) {
    console.error('Error fetching active offers:', error);
    res.status(500).json({ error: 'Failed to fetch offers', message: error.message });
  }
});

// Validate and apply promo code
router.post('/promo/validate', async (req, res) => {
  try {
    const { code, packageId, amount } = req.body;
    const userId = req.user?.id || req.user?.userId || req.user?._id;
    const now = new Date();

    if (!code) {
      return res.status(400).json({ error: 'Promo code is required' });
    }

    const promoCode = await PromoCode.findOne({ 
      code: code.toUpperCase(), 
      isEnabled: true,
      startTime: { $lte: now },
      endTime: { $gte: now }
    });

    if (!promoCode) {
      return res.status(404).json({ error: 'Invalid or expired promo code' });
    }

    // Check usage limits
    if (promoCode.usageLimit && promoCode.totalUses >= promoCode.usageLimit) {
      return res.status(400).json({ error: 'Promo code usage limit reached' });
    }

    // Check per user limit
    if (userId) {
      const userUsageCount = promoCode.usedBy.filter(u => String(u.userId) === String(userId)).length;
      if (userUsageCount >= promoCode.perUserLimit) {
        return res.status(400).json({ error: 'You have already used this promo code' });
      }
    }

    // Check daily limit
    if (promoCode.dailyLimit) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayUsage = promoCode.usedBy.filter(u => new Date(u.usedAt) >= today).length;
      if (todayUsage >= promoCode.dailyLimit) {
        return res.status(400).json({ error: 'Daily usage limit reached for this promo code' });
      }
    }

    // Check applicable packs
    if (promoCode.applicablePacks && promoCode.applicablePacks.length > 0) {
      if (packageId && !promoCode.applicablePacks.some(id => String(id) === String(packageId))) {
        return res.status(400).json({ error: 'Promo code not applicable to this package' });
      }
    }

    // Check minimum purchase amount
    if (amount && amount < promoCode.minPurchaseAmount) {
      return res.status(400).json({ 
        error: `Minimum purchase amount of ₹${promoCode.minPurchaseAmount} required` 
      });
    }

    // Calculate discount
    let discountAmount = 0;
    let bonusPoints = 0;

    if (promoCode.discountType === 'percentage') {
      discountAmount = (amount * promoCode.discountValue) / 100;
    } else if (promoCode.discountType === 'flat') {
      discountAmount = promoCode.discountValue;
    } else if (promoCode.discountType === 'bonus_points') {
      bonusPoints = promoCode.discountValue;
    }

    res.json({
      success: true,
      valid: true,
      discountType: promoCode.discountType,
      discountValue: promoCode.discountValue,
      discountAmount,
      bonusPoints,
      promoCode: promoCode.code
    });
  } catch (error) {
    console.error('Error validating promo code:', error);
    res.status(500).json({ error: 'Failed to validate promo code', message: error.message });
  }
});

// Admin: Get all offers
router.get('/offers', async (req, res) => {
  try {
    const offers = await Offer.find().sort({ createdAt: -1 });
    res.json({ success: true, offers });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch offers' });
  }
});

// Admin: Create offer
router.post('/offers', async (req, res) => {
  try {
    const offer = new Offer(req.body);
    await offer.save();
    res.json({ success: true, offer });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create offer', message: error.message });
  }
});

// Admin: Update offer
router.put('/offers/:id', async (req, res) => {
  try {
    const offer = await Offer.findByIdAndUpdate(req.params.id, { ...req.body, updatedAt: new Date() }, { new: true });
    res.json({ success: true, offer });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update offer', message: error.message });
  }
});

// Admin: Delete offer
router.delete('/offers/:id', async (req, res) => {
  try {
    await Offer.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete offer' });
  }
});

// Admin: Get all promo codes
router.get('/promo-codes', async (req, res) => {
  try {
    const promoCodes = await PromoCode.find().sort({ createdAt: -1 });
    res.json({ success: true, promoCodes });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch promo codes' });
  }
});

// Admin: Create promo code
router.post('/promo-codes', async (req, res) => {
  try {
    const promoCode = new PromoCode({ ...req.body, code: req.body.code.toUpperCase() });
    await promoCode.save();
    res.json({ success: true, promoCode });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create promo code', message: error.message });
  }
});

// Admin: Update promo code
router.put('/promo-codes/:id', async (req, res) => {
  try {
    const updateData = { ...req.body, updatedAt: new Date() };
    if (updateData.code) updateData.code = updateData.code.toUpperCase();
    const promoCode = await PromoCode.findByIdAndUpdate(req.params.id, updateData, { new: true });
    res.json({ success: true, promoCode });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update promo code', message: error.message });
  }
});

// Admin: Delete promo code
router.delete('/promo-codes/:id', async (req, res) => {
  try {
    await PromoCode.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete promo code' });
  }
});

// ============================================
// MODULE 3: ADS SYSTEM (REWARDED ADS)
// ============================================

// Get ads config (Frontend API)
router.get('/ads/config', async (req, res) => {
  try {
    const config = await AdsConfig.findOne();
    if (!config || !config.isEnabled) {
      return res.json({ success: true, enabled: false });
    }

    res.json({
      success: true,
      enabled: config.isEnabled,
      maxAdsPerUser: config.maxAdsPerUser || 20,
      cooldownMinutes: config.cooldownMinutes || 3,
      rewardType: config.rewardType || 'fixed',
      fixedPoints: config.fixedPoints || 5,
      randomMin: config.randomMin || 3,
      randomMax: config.randomMax || 10
    });
  } catch (error) {
    console.error('Error fetching ads config:', error);
    res.status(500).json({ error: 'Failed to fetch ads config' });
  }
});

// Verify ad watch and reward points (Frontend API)
router.post('/ads/reward', async (req, res) => {
  try {
    const userId = req.user?.id || req.user?.userId || req.user?._id;
    if (!userId) {
      return res.status(401).json({ error: 'User authentication required' });
    }

    const { watchedFull, skipped, adType = 'rewarded_video', deviceInfo, ipAddress } = req.body;

    // Fraud detection: No reward if skipped
    if (skipped || !watchedFull) {
      await AdLog.create({
        userId,
        adType,
        pointsRewarded: 0,
        watchedFull: false,
        skipped: skipped || !watchedFull,
        deviceInfo,
        ipAddress: ipAddress || req.ip
      });
      return res.json({ success: true, pointsRewarded: 0, message: 'Ad not watched completely' });
    }

    // Get ads config
    const config = await AdsConfig.findOne();
    if (!config || !config.isEnabled) {
      return res.status(400).json({ error: 'Ads are currently disabled' });
    }

    // Check daily limit
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayAdCount = await AdLog.countDocuments({
      userId,
      watchedAt: { $gte: today },
      watchedFull: true
    });

    if (todayAdCount >= (config.maxAdsPerUser || 20)) {
      return res.status(400).json({ error: 'Daily ad limit reached' });
    }

    // Check cooldown
    const lastAd = await AdLog.findOne({
      userId,
      watchedFull: true
    }).sort({ watchedAt: -1 });

    if (lastAd) {
      const cooldownMs = (config.cooldownMinutes || 3) * 60 * 1000;
      const timeSinceLastAd = Date.now() - new Date(lastAd.watchedAt).getTime();
      if (timeSinceLastAd < cooldownMs) {
        const remainingSeconds = Math.ceil((cooldownMs - timeSinceLastAd) / 1000);
        return res.status(400).json({ 
          error: 'Please wait before watching another ad',
          cooldownSeconds: remainingSeconds
        });
      }
    }

    // Calculate reward points
    let pointsRewarded = 0;
    if (config.rewardType === 'fixed') {
      pointsRewarded = config.fixedPoints || 5;
    } else if (config.rewardType === 'random' || config.rewardType === 'range') {
      const min = config.randomMin || 3;
      const max = config.randomMax || 10;
      pointsRewarded = Math.floor(Math.random() * (max - min + 1)) + min;
    }

    // Reward user
    await User.findByIdAndUpdate(userId, { $inc: { points: pointsRewarded } });

    // Log transaction
    await Transaction.create({
      userId,
      amount: pointsRewarded,
      type: 'credit',
      description: `Rewarded ad watch - ${adType}`,
      gateway: 'Ad System',
      status: 'success'
    });

    // Log ad watch
    await AdLog.create({
      userId,
      adType,
      pointsRewarded,
      watchedFull: true,
      skipped: false,
      deviceInfo,
      ipAddress: ipAddress || req.ip
    });

    res.json({
      success: true,
      pointsRewarded,
      newBalance: (await User.findById(userId)).points
    });
  } catch (error) {
    console.error('Error processing ad reward:', error);
    res.status(500).json({ error: 'Failed to process ad reward', message: error.message });
  }
});

// Get user's ad stats (Frontend API)
router.get('/ads/stats', async (req, res) => {
  try {
    const userId = req.user?.id || req.user?.userId || req.user?._id;
    if (!userId) {
      return res.status(401).json({ error: 'User authentication required' });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayAdCount = await AdLog.countDocuments({
      userId,
      watchedAt: { $gte: today },
      watchedFull: true
    });

    const totalPointsEarned = await AdLog.aggregate([
      { $match: { userId: mongoose.Types.ObjectId(userId), watchedFull: true } },
      { $group: { _id: null, total: { $sum: '$pointsRewarded' } } }
    ]);

    const config = await AdsConfig.findOne();
    const maxAdsPerUser = config?.maxAdsPerUser || 20;

    res.json({
      success: true,
      todayAdCount,
      remainingAds: Math.max(0, maxAdsPerUser - todayAdCount),
      totalPointsEarned: totalPointsEarned[0]?.total || 0
    });
  } catch (error) {
    console.error('Error fetching ad stats:', error);
    res.status(500).json({ error: 'Failed to fetch ad stats' });
  }
});

module.exports = router;

