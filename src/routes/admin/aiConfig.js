import express from 'express';
import AIConfig from '../../models/AIConfig.js';

const router = express.Router();

// Get all AI configurations
router.get('/', async (req, res) => {
  try {
    // Check MongoDB connection first
    const mongoose = (await import('mongoose')).default;
    if (mongoose.connection.readyState !== 1) {
      console.warn('MongoDB not connected, returning empty array');
      return res.json([]);
    }

    // Query with timeout
    const queryPromise = AIConfig.find().sort({ createdAt: -1 }).maxTimeMS(5000);
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Query timeout')), 5000)
    );
    
    const configs = await Promise.race([queryPromise, timeoutPromise]);
    res.json(configs);
  } catch (error) {
    console.error('Error loading AI configs:', error);
    // Return empty array instead of error
    res.json([]);
  }
});

// Get active AI configuration
router.get('/active', async (req, res) => {
  try {
    // Check MongoDB connection first
    const mongoose = (await import('mongoose')).default;
    if (mongoose.connection.readyState !== 1) {
      return res.status(404).json({ error: 'No active AI configuration found' });
    }

    // Query with timeout
    const queryPromise = AIConfig.findOne({ isActive: true }).maxTimeMS(5000);
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Query timeout')), 5000)
    );
    
    const config = await Promise.race([queryPromise, timeoutPromise]);
    if (!config) {
      return res.status(404).json({ error: 'No active AI configuration found' });
    }
    // Don't send sensitive data
    const safeConfig = {
      id: config._id,
      provider: config.provider,
      name: config.name,
      isActive: config.isActive,
      modelVersion: config.modelVersion,
      costPerImage: config.costPerImage,
      lastTested: config.lastTested,
      testStatus: config.testStatus,
    };
    res.json(safeConfig);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create or update AI configuration
router.post('/', async (req, res) => {
  try {
    const {
      provider,
      name,
      apiKey,
      apiSecret,
      endpoint,
      organizationId,
      projectId,
      modelVersion,
      settings,
      costPerImage,
      maxRetries,
      timeout,
    } = req.body;

    if (!provider || !name || !apiKey) {
      return res.status(400).json({ error: 'Provider, name, and API key are required' });
    }

    // If setting as active, deactivate others
    const isActive = req.body.isActive === true;
    if (isActive) {
      await AIConfig.updateMany({ provider }, { isActive: false });
    }

    // Check if config exists for this provider
    let config = await AIConfig.findOne({ provider });
    
    if (config) {
      // Update existing
      config.name = name;
      config.apiKey = apiKey;
      if (apiSecret) config.apiSecret = apiSecret;
      if (endpoint) config.endpoint = endpoint;
      if (organizationId) config.organizationId = organizationId;
      if (projectId) config.projectId = projectId;
      if (modelVersion) config.modelVersion = modelVersion;
      if (settings) config.settings = settings;
      if (costPerImage !== undefined) config.costPerImage = costPerImage;
      if (maxRetries !== undefined) config.maxRetries = maxRetries;
      if (timeout !== undefined) config.timeout = timeout;
      config.isActive = isActive;
      await config.save();
    } else {
      // Create new
      config = new AIConfig({
        provider,
        name,
        apiKey,
        apiSecret,
        endpoint,
        organizationId,
        projectId,
        modelVersion,
        settings: settings || {},
        costPerImage: costPerImage || 0,
        maxRetries: maxRetries || 3,
        timeout: timeout || 30000,
        isActive,
        createdBy: req.admin?.id || 'admin',
      });
      await config.save();
    }

    res.json(config);
  } catch (error) {
    console.error('Error saving AI config:', error);
    res.status(500).json({ error: error.message });
  }
});

// Set active configuration
router.post('/:id/activate', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Deactivate all
    await AIConfig.updateMany({}, { isActive: false });
    
    // Activate selected
    const config = await AIConfig.findByIdAndUpdate(
      id,
      { isActive: true },
      { new: true }
    );

    if (!config) {
      return res.status(404).json({ error: 'AI configuration not found' });
    }

    res.json({ success: true, config });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Test AI configuration
router.post('/:id/test', async (req, res) => {
  try {
    const { id } = req.params;
    const config = await AIConfig.findById(id);

    if (!config) {
      return res.status(404).json({ error: 'AI configuration not found' });
    }

    // Test with a simple prompt
    const testPrompt = 'A beautiful sunset over mountains';
    
    try {
      const { generateImage } = await import('../../services/aiService.js');
      const result = await generateImage(testPrompt, {
        quality: 'HD',
        aspectRatio: '1:1',
      });

      // Update test status
      config.lastTested = new Date();
      config.testStatus = 'success';
      config.testError = null;
      await config.save();

      res.json({
        success: true,
        provider: result.provider,
        model: result.model,
        imageUrl: result.imageUrl,
      });
    } catch (testError) {
      // Update test status
      config.lastTested = new Date();
      config.testStatus = 'failed';
      config.testError = testError.message;
      await config.save();

      res.status(400).json({
        success: false,
        message: 'API test failed',
        error: testError.message,
      });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete AI configuration
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const config = await AIConfig.findByIdAndDelete(id);

    if (!config) {
      return res.status(404).json({ error: 'AI configuration not found' });
    }

    res.json({ success: true, message: 'AI configuration deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;

