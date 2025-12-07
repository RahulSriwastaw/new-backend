import express from 'express';
import Template from '../models/Template.js';

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    if (!global.DB_CONNECTED) {
      return res.status(503).json({ error: 'Service temporarily unavailable (DB down)' });
    }
    const mongoose = (await import('mongoose')).default;
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ error: 'Service temporarily unavailable (DB down)' });
    }

    try {
      const templates = await Template.find({ 
        status: 'approved',
        $or: [
          { isActive: true },
          { isActive: { $exists: false } }
        ]
      }).sort({ createdAt: -1 }).maxTimeMS(5000);
      
      console.log(`Found ${templates.length} approved templates`);
      const formattedTemplates = templates.map(t => ({
        id: t._id.toString(),
        title: t.title,
        description: t.description,
        demoImage: t.demoImage,
        category: t.category,
        subCategory: t.subCategory,
        tags: t.tags,
        creatorId: t.creatorId?.toString() || 'admin',
        creatorName: t.creatorName,
        creatorVerified: t.creatorVerified,
        hiddenPrompt: t.hiddenPrompt,
        isFree: !t.isPremium,
        pointsCost: t.pointsCost,
        usageCount: t.usageCount,
        likeCount: t.likeCount,
        saveCount: t.saveCount,
        rating: t.rating,
        ratingCount: t.ratingCount,
        ageGroup: t.ageGroup,
        state: t.state,
        createdAt: t.createdAt,
        status: t.status,
        isActive: t.isActive,
        exampleImages: t.exampleImages || [],
        visiblePrompt: t.visiblePrompt,
        creatorBio: t.creatorBio,
      }));
      return res.json(formattedTemplates);
    } catch (mongoError) {
      console.warn('MongoDB query failed:', mongoError.message);
      return res.status(503).json({ error: 'Service temporarily unavailable (query failed)' });
    }
  } catch (error) {
    console.error('Error loading templates:', error);
    res.status(500).json({ error: 'Failed to load templates', details: error.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    if (!global.DB_CONNECTED) {
      return res.status(503).json({ error: 'Service temporarily unavailable (DB down)' });
    }
    const mongoose = (await import('mongoose')).default;
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ error: 'Service temporarily unavailable (DB down)' });
    }

    try {
      const template = await Template.findById(req.params.id).maxTimeMS(5000);
      if (!template || template.status !== 'approved' || !template.isActive) {
        return res.status(404).json({ error: 'Template not found' });
      }
      const formatted = {
        id: template._id.toString(),
        title: template.title,
        description: template.description,
        demoImage: template.demoImage,
        category: template.category,
        subCategory: template.subCategory,
        tags: template.tags,
        creatorId: template.creatorId?.toString() || 'admin',
        creatorName: template.creatorName,
        creatorVerified: template.creatorVerified,
        hiddenPrompt: template.hiddenPrompt,
        isFree: !template.isPremium,
        pointsCost: template.pointsCost,
        usageCount: template.usageCount,
        likeCount: template.likeCount,
        saveCount: template.saveCount,
        rating: template.rating,
        ratingCount: template.ratingCount,
        ageGroup: template.ageGroup,
        state: template.state,
        createdAt: template.createdAt,
        status: template.status,
        isActive: template.isActive,
        exampleImages: template.exampleImages || [],
        visiblePrompt: template.visiblePrompt,
        creatorBio: template.creatorBio,
      };
      return res.json(formatted);
    } catch (mongoError) {
      console.warn('MongoDB query failed:', mongoError.message);
      return res.status(404).json({ error: 'Template not found' });
    }
  } catch (error) {
    console.error('Error loading template:', error);
    res.status(500).json({ error: 'Failed to load template', details: error.message });
  }
});

export default router;

