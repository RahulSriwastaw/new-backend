/**
 * Minimax Image-to-Image (I2I) API Service
 * 
 * API Documentation: https://platform.minimax.io/docs/api-reference/image-generation-i2i
 * 
 * Features:
 * - Character reference (face preservation)
 * - Style reference
 * - Multiple aspect ratios
 * - Batch generation (1-9 images)
 */

const fetch = require('node-fetch');

class MinimaxI2IService {
    constructor(apiKey) {
        this.apiKey = apiKey || process.env.MINIMAX_API_KEY;
        this.baseUrl = 'https://api.minimax.io/v1';

        if (!this.apiKey) {
            throw new Error('Minimax API key is required. Set MINIMAX_API_KEY environment variable.');
        }
    }

    /**
     * Generate image using Image-to-Image with character/style reference
     * 
     * @param {Object} options - Generation options
     * @param {string} options.prompt - Text description (max 1500 chars)
     * @param {Array<Object>} options.subjectReference - Reference images for character/style
     * @param {string} options.subjectReference[].type - 'character' or 'style'
     * @param {string} options.subjectReference[].imageUrl - Image URL or base64
     * @param {string} options.aspectRatio - Aspect ratio (1:1, 16:9, 4:3, etc.)
     * @param {string} options.model - Model name ('image-01' or 'image-01-live')
     * @param {number} options.n - Number of images to generate (1-9)
     * @param {number} options.seed - Random seed for reproducibility
     * @param {boolean} options.promptOptimizer - Enable automatic prompt optimization
     * @param {string} options.responseFormat - 'url' or 'base64'
     * @param {number} options.width - Custom width (512-2048, must be divisible by 8)
     * @param {number} options.height - Custom height (512-2048, must be divisible by 8)
     * 
     * @returns {Promise<Object>} Generation response with image URLs
     */
    async generateI2I(options) {
        const {
            prompt,
            subjectReference,
            aspectRatio = '1:1',
            model = 'image-01',
            n = 1,
            seed,
            promptOptimizer = false,
            responseFormat = 'url',
            width,
            height
        } = options;

        // Validation
        if (!prompt || prompt.length > 1500) {
            throw new Error('Prompt is required and must be max 1500 characters');
        }

        if (!subjectReference || !Array.isArray(subjectReference) || subjectReference.length === 0) {
            throw new Error('At least one subject reference is required for I2I');
        }

        if (n < 1 || n > 9) {
            throw new Error('Number of images (n) must be between 1 and 9');
        }

        // Build request body
        const requestBody = {
            model,
            prompt,
            subject_reference: subjectReference.map(ref => ({
                type: ref.type, // 'character' or 'style'
                image_file: ref.imageUrl
            })),
            aspect_ratio: aspectRatio,
            n,
            response_format: responseFormat,
            prompt_optimizer: promptOptimizer
        };

        // Add optional parameters
        if (seed !== undefined) {
            requestBody.seed = seed;
        }

        if (width && height) {
            requestBody.width = width;
            requestBody.height = height;
        }

        try {
            const response = await fetch(`${this.baseUrl}/image_generation`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(`Minimax API Error: ${response.status} - ${errorData.base_resp?.status_msg || response.statusText}`);
            }

            const data = await response.json();

            // Check response status
            if (data.base_resp?.status_code !== 0) {
                throw new Error(`Generation failed: ${data.base_resp?.status_msg || 'Unknown error'}`);
            }

            return {
                success: true,
                id: data.id,
                imageUrls: data.data?.image_urls || [],
                metadata: {
                    successCount: parseInt(data.metadata?.success_count || 0),
                    failedCount: parseInt(data.metadata?.failed_count || 0)
                }
            };

        } catch (error) {
            console.error('Minimax I2I Error:', error);
            throw error;
        }
    }

    /**
     * Generate image with character reference (face preservation)
     * 
     * @param {string} prompt - Text description
     * @param {string} characterImageUrl - URL of character image
     * @param {Object} options - Additional options
     * @returns {Promise<Object>} Generation response
     */
    async generateWithCharacter(prompt, characterImageUrl, options = {}) {
        return this.generateI2I({
            prompt,
            subjectReference: [{
                type: 'character',
                imageUrl: characterImageUrl
            }],
            ...options
        });
    }

    /**
     * Generate image with style reference
     * 
     * @param {string} prompt - Text description
     * @param {string} styleImageUrl - URL of style reference image
     * @param {Object} options - Additional options
     * @returns {Promise<Object>} Generation response
     */
    async generateWithStyle(prompt, styleImageUrl, options = {}) {
        return this.generateI2I({
            prompt,
            subjectReference: [{
                type: 'style',
                imageUrl: styleImageUrl
            }],
            ...options
        });
    }

    /**
     * Generate image with both character and style references
     * 
     * @param {string} prompt - Text description
     * @param {string} characterImageUrl - URL of character image
     * @param {string} styleImageUrl - URL of style reference image
     * @param {Object} options - Additional options
     * @returns {Promise<Object>} Generation response
     */
    async generateWithCharacterAndStyle(prompt, characterImageUrl, styleImageUrl, options = {}) {
        return this.generateI2I({
            prompt,
            subjectReference: [
                {
                    type: 'character',
                    imageUrl: characterImageUrl
                },
                {
                    type: 'style',
                    imageUrl: styleImageUrl
                }
            ],
            ...options
        });
    }

    /**
     * Available aspect ratios
     */
    static get ASPECT_RATIOS() {
        return {
            SQUARE: '1:1',        // 1024x1024
            LANDSCAPE_16_9: '16:9',  // 1280x720
            LANDSCAPE_4_3: '4:3',    // 1152x864
            LANDSCAPE_3_2: '3:2',    // 1248x832
            PORTRAIT_2_3: '2:3',     // 832x1248
            PORTRAIT_3_4: '3:4',     // 864x1152
            PORTRAIT_9_16: '9:16',   // 720x1280
            ULTRA_WIDE: '21:9'       // 1344x576
        };
    }

    /**
     * Available models
     */
    static get MODELS() {
        return {
            IMAGE_01: 'image-01',
            IMAGE_01_LIVE: 'image-01-live'
        };
    }
}

module.exports = MinimaxI2IService;

// Example usage:
/*
const minimaxService = new MinimaxI2IService('your-api-key');

// Generate with character face
const result = await minimaxService.generateWithCharacter(
  'A person wearing a suit in an office',
  'https://example.com/face.jpg',
  {
    aspectRatio: MinimaxI2IService.ASPECT_RATIOS.PORTRAIT_9_16,
    n: 2
  }
);

console.log(result.imageUrls); // ['url1', 'url2']
*/
