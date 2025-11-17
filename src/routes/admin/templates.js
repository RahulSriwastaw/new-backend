import express from 'express';
import mongoose from 'mongoose';
import Template from '../../models/Template.js';

const router = express.Router();

// Get all templates
router.get('/', async (req, res) => {
  try {
    // Check MongoDB connection first
    if (mongoose.connection.readyState !== 1) {
      console.warn('MongoDB not connected, returning empty array');
      return res.json([]);
    }

    // Load from MongoDB with timeout
    const queryPromise = Template.find().sort({ createdAt: -1 }).maxTimeMS(5000);
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Query timeout')), 5000)
    );
    
    const templates = await Promise.race([queryPromise, timeoutPromise]);
    
    // Format templates for admin panel
    const formattedTemplates = templates.map(t => ({
      id: t._id.toString(),
      title: t.title || '',
      description: t.description || '',
      demoImage: t.demoImage || '',
      category: t.category || '',
      subCategory: t.subCategory || '',
      tags: t.tags || [],
      creatorId: (t.creatorId && t.creatorId.toString()) || null,
      creatorName: t.creatorName || 'Admin',
      creatorVerified: t.creatorVerified || false,
      hiddenPrompt: t.hiddenPrompt || '',
      visiblePrompt: t.visiblePrompt || '',
      negativePrompt: t.negativePrompt || '',
      isPremium: t.isPremium || false,
      pointsCost: t.pointsCost || 0,
      usageCount: t.usageCount || 0,
      likeCount: t.likeCount || 0,
      saveCount: t.saveCount || 0,
      rating: t.rating || 0,
      ratingCount: t.ratingCount || 0,
      ageGroup: t.ageGroup || 'all',
      state: t.state || 'all',
      status: t.status || 'approved',
      isActive: t.isActive !== undefined ? t.isActive : true,
      exampleImages: t.exampleImages || [],
      creatorBio: t.creatorBio || '',
      createdAt: t.createdAt ? (t.createdAt instanceof Date ? t.createdAt.toISOString() : t.createdAt) : new Date().toISOString(),
      updatedAt: t.updatedAt ? (t.updatedAt instanceof Date ? t.updatedAt.toISOString() : t.updatedAt) : new Date().toISOString(),
    }));
    
    res.json(formattedTemplates);
  } catch (error) {
    console.error('Error loading templates:', error);
    // Return empty array instead of error
    res.json([]);
  }
});

// Create new template
router.post('/', async (req, res) => {
  try {
    console.log('=== Template Creation Request ===');
    console.log('MongoDB Connection State:', mongoose.connection.readyState);
    
    // Safely log request body
    try {
      console.log('Request Body:', JSON.stringify(req.body, null, 2));
    } catch (e) {
      console.log('Request Body (could not stringify):', req.body);
    }
    console.log('Request Body Keys:', Object.keys(req.body || {}));
    
    // Check if req.body exists
    if (!req.body) {
      console.error('Request body is missing or not parsed');
      return res.status(400).json({ error: 'Request body is missing. Make sure Content-Type is application/json' });
    }
    
    // Check MongoDB connection first
    if (mongoose.connection.readyState !== 1) {
      console.error('MongoDB not connected. ReadyState:', mongoose.connection.readyState);
      return res.status(503).json({ 
        error: 'Database not connected. Please wait for MongoDB connection.',
        readyState: mongoose.connection.readyState
      });
    }

    const {
      title,
      description,
      category,
      subCategory,
      tags,
      demoImage,
      exampleImages,
      prompt,
      visiblePrompt,
      negativePrompt,
      isPremium,
      pointsCost,
      templateType,
      creatorName,
      creatorId,
      ageGroup,
      state,
      isActive,
    } = req.body;

    console.log('Received fields:', {
      hasTitle: !!title,
      hasCategory: !!category,
      hasDemoImage: !!demoImage,
      hasPrompt: !!prompt,
      titleLength: (title && title.length) || 0,
      categoryValue: category,
      demoImageLength: (demoImage && demoImage.length) || 0,
      promptLength: (prompt && prompt.length) || 0,
    });

    // Validate required fields
    if (!title || !category || !demoImage || !prompt) {
      const missing = [];
      if (!title) missing.push('title');
      if (!category) missing.push('category');
      if (!demoImage) missing.push('demoImage');
      if (!prompt) missing.push('prompt');
      console.error('Missing required fields:', missing);
      return res.status(400).json({ 
        error: `Missing required fields: ${missing.join(', ')}`,
        missing
      });
    }

    // Check if creatorId is a valid MongoDB ObjectId
    // If it's an admin ID (like "admin_1", "owner_1"), set it to null
    let validCreatorId = null;
    if (creatorId) {
      // Check if it's a valid MongoDB ObjectId
      if (mongoose.Types.ObjectId.isValid(creatorId) && creatorId.toString().match(/^[0-9a-fA-F]{24}$/)) {
        validCreatorId = creatorId;
      }
      // If it's not a valid ObjectId (like "admin_1"), leave it as null
      // Admin-created templates don't need a creatorId
    }

    // Normalize ageGroup - convert "All Ages" to "all" to match schema default
    let normalizedAgeGroup = ageGroup || 'all';
    if (normalizedAgeGroup === 'All Ages') {
      normalizedAgeGroup = 'all';
    }

    // Create new template in MongoDB
    const templateData = {
      title: title.trim(),
      description: (description || '').trim(),
      category: category.trim(),
      subCategory: (subCategory || '').trim(),
      tags: Array.isArray(tags) ? tags.filter(t => t && t.trim()) : [],
      demoImage: demoImage.trim(),
      exampleImages: Array.isArray(exampleImages) ? exampleImages.filter(img => img && img.trim()) : [],
      hiddenPrompt: prompt.trim(),
      visiblePrompt: (visiblePrompt || '').trim(),
      negativePrompt: (negativePrompt || '').trim(),
      isPremium: isPremium || (templateType === 'premium'),
      pointsCost: pointsCost || (templateType === 'premium' ? 25 : 0),
      creatorName: (creatorName || 'Admin').trim(),
      creatorId: validCreatorId, // null for admin-created templates
      creatorBio: creatorName ? `${creatorName.trim()} (Admin Created)` : 'Admin Created Template',
      creatorVerified: false,
      ageGroup: normalizedAgeGroup,
      state: (state || 'all').toLowerCase(),
      status: 'approved', // Admin created templates are auto-approved
      isActive: isActive !== undefined ? isActive : true,
      createdBy: creatorId || 'admin',
    };

    console.log('Creating template with data:', {
      title: templateData.title,
      category: templateData.category,
      hasDemoImage: !!templateData.demoImage,
      hasPrompt: !!templateData.hiddenPrompt,
      creatorName: templateData.creatorName,
    });

    const newTemplate = new Template(templateData);

    // Validate before saving
    try {
      const validationError = newTemplate.validateSync();
      if (validationError) {
        console.error('Template validation error:', validationError);
        const errors = Object.values(validationError.errors || {}).map((e) => e.message).join(', ');
        return res.status(400).json({ error: `Validation failed: ${errors}` });
      }
    } catch (validationErr) {
      console.error('Validation check error:', validationErr);
      return res.status(400).json({ error: `Validation error: ${validationErr.message}` });
    }

    // Save template with error handling
    let savedTemplate;
    try {
      savedTemplate = await newTemplate.save();
      console.log('Template saved successfully, ID:', savedTemplate._id);
    } catch (saveError) {
      console.error('Save error details:', {
        name: saveError.name,
        message: saveError.message,
        code: saveError.code,
        keyPattern: saveError.keyPattern,
        keyValue: saveError.keyValue,
      });
      throw saveError;
    }
    
    // Log for debugging
    console.log('Template created successfully:', {
      id: savedTemplate._id,
      title: savedTemplate.title,
      status: savedTemplate.status,
      isActive: savedTemplate.isActive,
      createdAt: savedTemplate.createdAt
    });
    
    // Convert to frontend format for consistency
    const formattedTemplate = {
      id: savedTemplate._id.toString(),
      title: savedTemplate.title,
      description: savedTemplate.description || '',
      demoImage: savedTemplate.demoImage,
      category: savedTemplate.category,
      subCategory: savedTemplate.subCategory || '',
      tags: savedTemplate.tags || [],
      creatorId: (savedTemplate.creatorId && savedTemplate.creatorId.toString()) || 'admin',
      creatorName: savedTemplate.creatorName,
      creatorVerified: savedTemplate.creatorVerified || false,
      creatorBio: savedTemplate.creatorBio || '',
      hiddenPrompt: savedTemplate.hiddenPrompt,
      visiblePrompt: savedTemplate.visiblePrompt || '',
      negativePrompt: savedTemplate.negativePrompt || '',
      isFree: !savedTemplate.isPremium,
      pointsCost: savedTemplate.pointsCost || 0,
      usageCount: savedTemplate.usageCount || 0,
      likeCount: savedTemplate.likeCount || 0,
      saveCount: savedTemplate.saveCount || 0,
      rating: savedTemplate.rating || 0,
      ratingCount: savedTemplate.ratingCount || 0,
      ageGroup: savedTemplate.ageGroup || 'all',
      state: savedTemplate.state || 'all',
      createdAt: savedTemplate.createdAt ? (savedTemplate.createdAt instanceof Date ? savedTemplate.createdAt.toISOString() : savedTemplate.createdAt) : new Date().toISOString(),
      status: savedTemplate.status || 'approved',
      isActive: savedTemplate.isActive !== undefined ? savedTemplate.isActive : true,
      exampleImages: savedTemplate.exampleImages || [],
    };
    
    res.status(201).json(formattedTemplate);
  } catch (error) {
    console.error('Error creating template:', error);
    console.error('Error name:', error.name);
    console.error('Error message:', error.message);
    if (error.stack) {
      console.error('Error stack:', error.stack);
    }
    
    // Provide more helpful error messages
    let errorMessage = 'Failed to create template';
    let statusCode = 500;
    
    if (error.name === 'ValidationError') {
      statusCode = 400;
      const errors = Object.values(error.errors || {}).map((e) => e.message).join(', ');
      errorMessage = `Validation failed: ${errors}`;
    } else if (error.name === 'MongoServerError') {
      statusCode = 500;
      if (error.code === 11000) {
        errorMessage = 'Template with this title already exists';
      } else {
        errorMessage = 'Database error occurred';
      }
    } else if (error.name === 'MongooseError') {
      statusCode = 503;
      errorMessage = 'Database connection error';
    } else if (error.message) {
      errorMessage = error.message;
    }
    
    res.status(statusCode).json({ 
      error: errorMessage,
      details: process.env.NODE_ENV === 'development' ? {
        name: error.name,
        message: error.message,
        stack: error.stack
      } : undefined
    });
  }
});

// Get template by ID
router.get('/:id', async (req, res) => {
  try {
    // Check MongoDB connection first
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ error: 'Database not connected' });
    }

    const { id } = req.params;
    const queryPromise = Template.findById(id).maxTimeMS(5000);
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Query timeout')), 5000)
    );
    
    const template = await Promise.race([queryPromise, timeoutPromise]);
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }
    res.json(template);
  } catch (error) {
    console.error('Error loading template:', error);
    res.status(500).json({ error: error.message || 'Failed to load template' });
  }
});

// Approve template
router.post('/:id/approve', async (req, res) => {
  try {
    // Check MongoDB connection first
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ error: 'Database not connected' });
    }

    const { id } = req.params;
    const template = await Template.findByIdAndUpdate(
      id,
      { status: 'approved' },
      { new: true }
    );
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }
    res.json({ success: true, message: 'Template approved', template });
  } catch (error) {
    console.error('Error approving template:', error);
    res.status(500).json({ error: error.message || 'Failed to approve template' });
  }
});

// Reject template
router.post('/:id/reject', async (req, res) => {
  try {
    // Check MongoDB connection first
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ error: 'Database not connected' });
    }

    const { id } = req.params;
    const { reason } = req.body;
    const template = await Template.findByIdAndUpdate(
      id,
      { status: 'rejected', rejectedReason: reason },
      { new: true }
    );
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }
    res.json({ success: true, message: 'Template rejected', template });
  } catch (error) {
    console.error('Error rejecting template:', error);
    res.status(500).json({ error: error.message || 'Failed to reject template' });
  }
});

// Delete template
router.delete('/:id', async (req, res) => {
  try {
    // Check MongoDB connection first
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ error: 'Database not connected' });
    }

    const { id } = req.params;
    const template = await Template.findByIdAndDelete(id);
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }
    res.json({ success: true, message: 'Template deleted' });
  } catch (error) {
    console.error('Error deleting template:', error);
    res.status(500).json({ error: error.message || 'Failed to delete template' });
  }
});

// Bulk approve
router.post('/bulk/approve', async (req, res) => {
  try {
    // Check MongoDB connection first
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ error: 'Database not connected' });
    }

    const { ids } = req.body;
    const result = await Template.updateMany(
      { _id: { $in: ids } },
      { status: 'approved' }
    );
    res.json({ success: true, message: `${result.modifiedCount} templates approved` });
  } catch (error) {
    console.error('Error bulk approving templates:', error);
    res.status(500).json({ error: error.message || 'Failed to approve templates' });
  }
});

// Bulk reject
router.post('/bulk/reject', async (req, res) => {
  try {
    // Check MongoDB connection first
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ error: 'Database not connected' });
    }

    const { ids, reason } = req.body;
    const result = await Template.updateMany(
      { _id: { $in: ids } },
      { status: 'rejected', rejectedReason: reason }
    );
    res.json({ success: true, message: `${result.modifiedCount} templates rejected` });
  } catch (error) {
    console.error('Error bulk rejecting templates:', error);
    res.status(500).json({ error: error.message || 'Failed to reject templates' });
  }
});

// Bulk delete
router.post('/bulk/delete', async (req, res) => {
  try {
    // Check MongoDB connection first
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ error: 'Database not connected' });
    }

    const { ids } = req.body;
    const result = await Template.deleteMany({ _id: { $in: ids } });
    res.json({ success: true, message: `${result.deletedCount} templates deleted` });
  } catch (error) {
    console.error('Error bulk deleting templates:', error);
    res.status(500).json({ error: error.message || 'Failed to delete templates' });
  }
});

export default router;

