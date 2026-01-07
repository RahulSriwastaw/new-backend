const fetch = require('node-fetch');
const cloudinary = require('cloudinary').v2;

/**
 * MINIMAX I2I ADAPTER
 * 
 * Accepts Cloudinary URLs directly - no base64 conversion needed
 */
class MiniMaxAdapter {
    constructor(apiKey) {
        this.apiKey = apiKey;
        this.baseUrl = 'https://api.minimax.chat/v1/image_generation';
    }

    /**
     * Generate image using MiniMax I2I API
     * Sends Cloudinary URLs directly
     */
    async generate({ prompt, referenceImages = [], aspectRatio = '1:1', quality = 'HD' }) {
        try {
            // Build subject_reference array
            const subjectReferences = [];

            if (referenceImages && referenceImages.length > 0) {
                // First image is character reference, rest are style references
                subjectReferences.push({
                    type: 'character',
                    image_url: referenceImages[0]  // Send Cloudinary URL directly
                });

                // Additional images as style references
                for (let i = 1; i < referenceImages.length; i++) {
                    subjectReferences.push({
                        type: 'style',
                        image_url: referenceImages[i]
                    });
                }
            }

            // Map aspect ratio
            const aspectRatioMap = {
                '1:1': '1:1',
                '16:9': '16:9',
                '9:16': '9:16',
                '4:3': '4:3',
                '3:4': '3:4'
            };

            // Build request payload
            const requestBody = {
                model: 'image-01',
                prompt: prompt,
                aspect_ratio: aspectRatioMap[aspectRatio] || '1:1',
                n: 1,
                response_format: 'url'
            };

            // Add subject references if any
            if (subjectReferences.length > 0) {
                requestBody.subject_reference = subjectReferences;
            }

            // Call MiniMax API
            const response = await fetch(this.baseUrl, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(`MiniMax API Error: ${JSON.stringify(error)}`);
            }

            const result = await response.json();

            // Get generated image URL
            const generatedImageUrl = result.data?.[0]?.url;
            if (!generatedImageUrl) {
                throw new Error('No image URL returned from MiniMax');
            }

            // Download image from MiniMax URL
            const imageResponse = await fetch(generatedImageUrl);
            if (!imageResponse.ok) {
                throw new Error('Failed to download generated image from MiniMax');
            }
            const imageBuffer = await imageResponse.buffer();

            // Upload to Cloudinary (Account 3)
            const cloudinaryUrl = await this.uploadToCloudinary(imageBuffer);

            return {
                success: true,
                imageUrl: cloudinaryUrl,
                provider: 'minimax'
            };

        } catch (error) {
            console.error('MiniMax Adapter Error:', error);
            throw error;
        }
    }

    /**
     * Upload generated image to Cloudinary
     */
    async uploadToCloudinary(imageBuffer) {
        return new Promise((resolve, reject) => {
            const uploadStream = cloudinary.uploader.upload_stream(
                {
                    folder: 'generations',
                    resource_type: 'image',
                    public_id: `minimax_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
                },
                (error, result) => {
                    if (error) reject(error);
                    else resolve(result.secure_url);
                }
            );
            uploadStream.end(imageBuffer);
        });
    }
}

module.exports = MiniMaxAdapter;
