const GeminiAdapter = require('../adapters/geminiAdapter');
const MiniMaxAdapter = require('../adapters/minimaxAdapter');
const StabilityAdapter = require('../adapters/stabilityAdapter');

/**
 * AI ROUTER
 * 
 * Central service that:
 * 1. Fetches active AI from database
 * 2. Routes to correct adapter
 * 3. Handles errors and fallback
 * 4. Updates stats
 */
class AIRouter {
  constructor(AIModel) {
    this.AIModel = AIModel;
  }

  /**
   * Get active AI configuration from database
   */
  async getActiveAI() {
    try {
      const activeAI = await this.AIModel.findOne({ active: true }).select('+config.apiKey');

      if (!activeAI) {
        throw new Error('No active AI configured. Please activate an AI in admin panel.');
      }

      return activeAI;
    } catch (error) {
      console.error('Error fetching active AI:', error);
      throw error;
    }
  }

  /**
   * Main generation function - routes to correct AI adapter
   */
  async generateImage(payload) {
    const startTime = Date.now();
    let activeAI = null;

    try {
      // 1. Get active AI (all providers support both T2I and I2I)
      activeAI = await this.getActiveAI();

      const hasUploadedImages = payload.referenceImages && payload.referenceImages.length > 0;
      const generationType = hasUploadedImages ? 'image_to_image' : 'text_to_image';

      console.log(`🎯 Using ${activeAI.name} for ${generationType} generation`);

      // 2. APPLY AI GUARD SYSTEM - Merge prompts
      const AIGuardService = require('./aiGuardService');
      const { GenerationGuardRule } = require('../models');
      const guardService = new AIGuardService(GenerationGuardRule);

      const { executionPrompt, negativePrompt, userPrompt } = await guardService.buildExecutionPrompt({
        userPrompt: payload.prompt,
        templatePrompt: payload.templatePrompt || null,
        generationType: generationType
      });

      // Merge with any user-provided negative prompt
      const finalNegativePrompt = [
        negativePrompt,
        payload.negativePrompt || ''
      ].filter(Boolean).join(', ');

      console.log(`✅ Guard System Applied - Final prompt ready`);

      // 3. Create appropriate adapter
      let adapter;
      const apiKey = activeAI.config.apiKey;

      if (!apiKey) {
        throw new Error(`API key not configured for ${activeAI.name}`);
      }

      switch (activeAI.key) {
        case 'gemini':
          adapter = new GeminiAdapter(apiKey, activeAI.config.model);
          break;

        case 'minimax':
          adapter = new MiniMaxAdapter(apiKey);
          break;

        case 'stability':
          adapter = new StabilityAdapter(apiKey, activeAI.config.model);
          break;

        default:
          throw new Error(`Unknown AI key: ${activeAI.key}`);
      }

      // 4. Generate image with EXECUTION PROMPT (includes guard rules)
      const result = await adapter.generate({
        prompt: executionPrompt,           // Hidden rules merged
        referenceImages: payload.referenceImages || [],
        aspectRatio: payload.aspectRatio || '1:1',
        quality: payload.quality || 'HD',
        negativePrompt: finalNegativePrompt,
        strength: payload.strength || 0.35
      });

      // 5. Update success stats
      const generationTime = Date.now() - startTime;
      await this.updateStats(activeAI._id, true, generationTime);

      return {
        ...result,
        aiUsed: activeAI.name,
        aiKey: activeAI.key,
        generationTime,
        userPrompt: userPrompt  // Return clean prompt for saving to DB
      };

    } catch (error) {
      // Update failure stats
      if (activeAI) {
        await this.updateStats(activeAI._id, false, 0);
      }

      console.error('AI Router Error:', error);
      throw error;
    }
  }

  /**
   * Update AI model statistics
   */
  async updateStats(aiId, success, generationTime) {
    try {
      const ai = await this.AIModel.findById(aiId);
      if (!ai) return;

      // Update total generations
      ai.stats.totalGenerations = (ai.stats.totalGenerations || 0) + 1;

      // Update success rate
      const totalAttempts = ai.stats.totalGenerations;
      const currentSuccessCount = Math.round((ai.stats.successRate / 100) * (totalAttempts - 1));
      const newSuccessCount = currentSuccessCount + (success ? 1 : 0);
      ai.stats.successRate = (newSuccessCount / totalAttempts) * 100;

      // Update average time
      if (success && generationTime > 0) {
        const currentAvg = ai.stats.averageTime || 0;
        ai.stats.averageTime = ((currentAvg * (totalAttempts - 1)) + generationTime) / totalAttempts;
      }

      await ai.save();
    } catch (error) {
      console.error('Error updating AI stats:', error);
      // Don't throw - stats update failure shouldn't break generation
    }
  }

  /**
   * Optional: Get fallback AI if primary fails
   */
  async getFallbackAI(excludeKey) {
    try {
      const fallbackAI = await this.AIModel.findOne({
        key: { $ne: excludeKey },
        active: false  // Get non-active as fallback
      })
        .sort({ priority: -1 })
        .select('+config.apiKey');

      return fallbackAI;
    } catch (error) {
      console.error('Error getting fallback AI:', error);
      return null;
    }
  }
}

module.exports = AIRouter;
