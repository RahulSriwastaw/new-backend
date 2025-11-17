import express from 'express';
import { generateImage } from '../services/aiService.js';

const router = express.Router();

router.post('/generate', async (req, res) => {
  try {
    const { prompt, templateId, uploadedImages, quality, aspectRatio, creativity, detailLevel, negativePrompt } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    const generationId = `gen_${Date.now()}`;
    
    try {
      const result = await generateImage(prompt, {
        negativePrompt,
        quality: quality || 'HD',
        aspectRatio: aspectRatio || '1:1',
        uploadedImages: uploadedImages || [],
        templateId: templateId || null,
      });

      const pointsSpent = quality === 'UHD' || quality === '4K' || quality === '8K' ? 30 : 
                         quality === '2K' ? 25 : 
                         quality === 'HD' ? 20 : 15;
      
      res.json({
        id: generationId,
        userId: req.user?.id || 'current_user',
        templateId: templateId || null,
        prompt,
        uploadedImages: uploadedImages || [],
        generatedImage: result.imageUrl,
        quality: quality || 'HD',
        aspectRatio: aspectRatio || '1:1',
        pointsSpent,
        status: 'completed',
        createdAt: new Date().toISOString(),
        isFavorite: false,
        downloadCount: 0,
        shareCount: 0,
        provider: result.provider,
        model: result.model,
      });
    } catch (aiError) {
      console.error('AI generation error:', aiError);
      res.status(500).json({ 
        error: aiError.message || 'Image generation failed',
        details: 'Please check AI configuration in admin panel'
      });
    }
  } catch (error) {
    console.error('Generation route error:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/status/:id', async (req, res) => {
  try {
    res.json({
      id: req.params.id,
      status: 'completed',
      imageUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=800',
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;

