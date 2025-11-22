import express from 'express';
import mongoose from 'mongoose';
import { generateImage } from '../services/aiService.js';
import Template from '../models/Template.js';
import Generation from '../models/Generation.js';
import User from '../models/User.js';
import Transaction from '../models/Transaction.js';
import { verifyToken } from '../middleware/auth.js';
import logger from '../config/logger.js';

const router = express.Router();

// Protect all generation routes
router.use(verifyToken);

router.post('/generate', async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { prompt, userPrompt, faceImageUrl, provider, templateId, uploadedImages, quality, aspectRatio, creativity, detailLevel, negativePrompt } = req.body;
    const userId = req.user.id;

    if (!prompt && !templateId) {
      return res.status(400).json({ error: 'Prompt or Template ID is required' });
    }

    // Calculate points cost
    const pointsCost = quality === 'UHD' || quality === '4K' || quality === '8K' ? 30 :
      quality === '2K' ? 25 :
        quality === 'HD' ? 20 : 15;

    // Check user balance
    const user = await User.findById(userId).session(session);
    if (!user) {
      throw new Error('User not found');
    }

    if (user.pointsBalance < pointsCost) {
      return res.status(402).json({
        error: 'Insufficient points',
        required: pointsCost,
        balance: user.pointsBalance
      });
    }

    // Deduct points
    user.pointsBalance -= pointsCost;
    user.totalGenerations += 1;
    user.lastActive = new Date();
    await user.save({ session });

    // Create transaction record
    const transaction = new Transaction({
      userId,
      type: 'generation',
      amount: 0, // No monetary amount
      points: -pointsCost,
      status: 'success',
      description: `Generated image (${quality})`,
      templateId: templateId || null,
    });
    await transaction.save({ session });

    await session.commitTransaction();
    session.endSession();

    // Proceed with generation (outside transaction to avoid locking DB during long AI call)
    try {
      let mergedPrompt = prompt;
      if (templateId) {
        try {
          const t = await Template.findById(templateId);
          if (t) {
            mergedPrompt = [t.hiddenPrompt || '', t.visiblePrompt || '', userPrompt || prompt || ''].filter(Boolean).join(', ').trim();
            // Increment template usage
            await Template.findByIdAndUpdate(templateId, { $inc: { usageCount: 1 } });
          }
        } catch (e) {
          logger.warn('Template merge failed', { error: e.message });
        }
      }

      const result = await generateImage(mergedPrompt, {
        negativePrompt,
        quality: quality || 'HD',
        aspectRatio: aspectRatio || '1:1',
        uploadedImages: uploadedImages || [],
        templateId: templateId || null,
        faceImageUrl: faceImageUrl || '',
        provider: provider || (faceImageUrl ? 'minimax_i2i' : undefined),
      });

      // Save generation record
      const generation = new Generation({
        userId,
        prompt: mergedPrompt,
        negativePrompt,
        templateId: templateId || null,
        imageUrl: result.imageUrl,
        publicId: result.publicId,
        pointsCost,
        settings: {
          quality: quality || 'HD',
          aspectRatio: aspectRatio || '1:1',
          provider: result.provider,
          model: result.model,
          faceImageUrl,
        },
        status: 'completed',
      });
      await generation.save();

      res.json({
        ...generation.toObject(),
        userBalance: user.pointsBalance // Return updated balance
      });

    } catch (aiError) {
      // Refund points if generation fails
      logger.error('AI generation failed, refunding points', { error: aiError.message });

      const refundSession = await mongoose.startSession();
      refundSession.startTransaction();
      try {
        await User.findByIdAndUpdate(userId, { $inc: { pointsBalance: pointsCost } }, { session: refundSession });

        const refundTx = new Transaction({
          userId,
          type: 'refund',
          amount: 0,
          points: pointsCost,
          status: 'success',
          description: 'Refund for failed generation',
        });
        await refundTx.save({ session: refundSession });

        await refundSession.commitTransaction();
      } catch (refundError) {
        logger.error('Refund failed!', { error: refundError.message });
      } finally {
        refundSession.endSession();
      }

      res.status(500).json({
        error: aiError.message || 'Image generation failed',
        details: 'Points have been refunded'
      });
    }

  } catch (error) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    session.endSession();
    logger.error('Generation route error:', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

router.get('/history', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const generations = await Generation.find({ userId: req.user.id })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('templateId', 'title demoImage');

    const total = await Generation.countDocuments({ userId: req.user.id });

    res.json({
      generations,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const generation = await Generation.findOne({
      _id: req.params.id,
      userId: req.user.id
    });

    if (!generation) {
      return res.status(404).json({ error: 'Generation not found' });
    }

    res.json(generation);
  } catch (error) {
    res.status(500).json({ error: error.message });
  });

// Toggle favorite status
router.patch('/:id/favorite', async (req, res) => {
  try {
    const generation = await Generation.findOne({
      _id: req.params.id,
      userId: req.user.id
    });

    if (!generation) {
      return res.status(404).json({ error: 'Generation not found' });
    }

    generation.isFavorite = !generation.isFavorite;
    await generation.save();

    res.json({
      success: true,
      isFavorite: generation.isFavorite,
      generation
    });
  } catch (error) {
    logger.error('Toggle favorite error:', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// Delete generation
router.delete('/:id', async (req, res) => {
  try {
    const generation = await Generation.findOneAndDelete({
      _id: req.params.id,
      userId: req.user.id
    });

    if (!generation) {
      return res.status(404).json({ error: 'Generation not found' });
    }

    logger.info(`Generation ${req.params.id} deleted by user ${req.user.id}`);

    res.json({
      success: true,
      message: 'Generation deleted successfully'
    });
  } catch (error) {
    logger.error('Delete generation error:', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

export default router;


