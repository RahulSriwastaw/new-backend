/**
 * Minimax I2I API Routes for Express
 * Add this to your server.js or routes file
 */

const MinimaxI2IService = require('./services/minimaxI2IService');
const cloudinary = require('cloudinary').v2;

// Initialize Minimax service
const minimaxService = new MinimaxI2IService(process.env.MINIMAX_API_KEY);

/**
 * Upload image to Cloudinary (helper function)
 */
async function uploadImageToCloudinary(imageUrl) {
    try {
        const uploadResult = await cloudinary.uploader.upload(imageUrl, {
            folder: 'generations/minimax',
            resource_type: 'image'
        });
        return uploadResult.secure_url;
    } catch (error) {
        console.error('Cloudinary upload error:', error);
        throw error;
    }
}

/**
 * POST /api/v1/generation/minimax-i2i
 * 
 * Generate image using Minimax I2I with character/style reference
 */
app.post('/api/v1/generation/minimax-i2i', authUser, async (req, res) => {
    try {
        const {
            prompt,
            characterImageUrl,      // User's face/character reference
            styleImageUrl,          // Optional: Style reference
            templateId,             // Optional: Template to use
            aspectRatio = '1:1',
            n = 1,
            quality = 'HD',
            seed
        } = req.body;

        const userId = req.user.id;

        // Validation
        if (!prompt || prompt.trim().length === 0) {
            return res.status(400).json({ error: 'Prompt is required' });
        }

        if (!characterImageUrl && !styleImageUrl) {
            return res.status(400).json({
                error: 'At least one reference image (character or style) is required'
            });
        }

        // Calculate cost
        const baseCost = 30;  // Base cost for Minimax I2I
        const qualityCost = quality === 'UHD' ? 20 : quality === 'HD' ? 10 : 0;
        const quantityCost = (n - 1) * 15;  // Extra 15 points per additional image
        const totalCost = baseCost + qualityCost + quantityCost;

        // Check user balance
        const user = await User.findById(userId);
        if (user.balance < totalCost) {
            return res.status(402).json({
                error: 'Insufficient points',
                required: totalCost,
                current: user.balance
            });
        }

        // Get template if provided
        let finalPrompt = prompt;
        if (templateId) {
            const template = await Template.findById(templateId);
            if (template) {
                finalPrompt = template.prompt + ' ' + prompt;
            }
        }

        // Build subject references array
        const subjectReference = [];

        if (characterImageUrl) {
            subjectReference.push({
                type: 'character',
                imageUrl: characterImageUrl
            });
        }

        if (styleImageUrl) {
            subjectReference.push({
                type: 'style',
                imageUrl: styleImageUrl
            });
        }

        // Call Minimax API
        const generationResult = await minimaxService.generateI2I({
            prompt: finalPrompt,
            subjectReference,
            aspectRatio,
            n,
            seed,
            model: 'image-01',
            responseFormat: 'url'
        });

        if (!generationResult.success || generationResult.imageUrls.length === 0) {
            return res.status(500).json({
                error: 'Image generation failed',
                details: generationResult.metadata
            });
        }

        // Upload first image to Cloudinary (can upload all if needed)
        const primaryImageUrl = await uploadImageToCloudinary(generationResult.imageUrls[0]);

        // Deduct points
        user.balance -= totalCost;
        await user.save();

        // Create transaction record
        await Transaction.create({
            userId,
            type: 'deduction',
            amount: -totalCost,
            description: `Minimax I2I generation (${quality})`,
            balanceAfter: user.balance
        });

        // Save generation to database
        const generation = await Generation.create({
            userId,
            templateId,
            prompt: finalPrompt,
            generatedImage: primaryImageUrl,
            additionalImages: generationResult.imageUrls.slice(1),  // Other generated images
            modelUsed: 'minimax-i2i',
            quality,
            aspectRatio,
            status: 'completed',
            metadata: {
                minimaxId: generationResult.id,
                characterReference: characterImageUrl,
                styleReference: styleImageUrl,
                successCount: generationResult.metadata.successCount,
                failedCount: generationResult.metadata.failedCount,
                seed
            }
        });

        res.json({
            success: true,
            generation: {
                id: generation._id,
                generatedImage: primaryImageUrl,
                additionalImages: generationResult.imageUrls.slice(1),
                prompt: finalPrompt,
                quality,
                aspectRatio,
                pointsUsed: totalCost,
                newBalance: user.balance
            }
        });

    } catch (error) {
        console.error('Minimax I2I generation error:', error);
        res.status(500).json({
            error: 'Generation failed',
            message: error.message
        });
    }
});

/**
 * POST /api/v1/generation/minimax-character
 * 
 * Simplified endpoint for character-only I2I
 */
app.post('/api/v1/generation/minimax-character', authUser, async (req, res) => {
    try {
        const { prompt, characterImageUrl, aspectRatio, templateId } = req.body;

        // Forward to main I2I endpoint
        req.body.styleImageUrl = null;
        return app.handle(req, res); // Re-use main endpoint

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/v1/generation/minimax/models
 * 
 * Get available Minimax models and aspect ratios
 */
app.get('/api/v1/generation/minimax/models', authUser, (req, res) => {
    res.json({
        models: [
            {
                id: 'image-01',
                name: 'Minimax Image 01',
                type: 'i2i',
                features: ['character-reference', 'style-reference'],
                costPoints: 30
            },
            {
                id: 'image-01-live',
                name: 'Minimax Image 01 Live',
                type: 'i2i',
                features: ['character-reference', 'style-reference'],
                costPoints: 35
            }
        ],
        aspectRatios: [
            { value: '1:1', label: 'Square (1024x1024)' },
            { value: '16:9', label: 'Landscape (1280x720)' },
            { value: '4:3', label: 'Landscape (1152x864)' },
            { value: '3:2', label: 'Landscape (1248x832)' },
            { value: '2:3', label: 'Portrait (832x1248)' },
            { value: '3:4', label: 'Portrait (864x1152)' },
            { value: '9:16', label: 'Portrait (720x1280)' },
            { value: '21:9', label: 'Ultra Wide (1344x576)' }
        ]
    });
});

module.exports = {
    minimaxService
};
