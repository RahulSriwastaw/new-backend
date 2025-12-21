/**
 * Google Gemini Image Generation Provider
 * 
 * Supports BOTH:
 * 1. Text-to-Image (T2I)
 * 2. Image-to-Image / Image Editing (I2I)
 * 
 * Uses Gemini 2.5 Flash Image model via generateContent API
 * Based on official documentation: https://ai.google.dev/gemini-api/docs/image-generation
 */

const fetch = require('node-fetch');

/**
 * Main Gemini Generation Function
 * 
 * @param {Object} params - Generation parameters
 * @param {string} params.prompt - Text prompt for generation
 * @param {string} params.negativePrompt - Optional negative prompt
 * @param {Array<string>} params.uploadedImages - Optional array of base64 image strings
 * @param {string} params.apiKey - Gemini API key
 * @param {Object} params.modelConfig - Model configuration (aspectRatio, model name, etc.)
 * @returns {Promise<string>} - Base64 encoded image data URI
 */
async function generateWithGemini({ prompt, negativePrompt, uploadedImages, apiKey, modelConfig }) {
    console.log("🤖 Gemini 2.5 Flash Image Provider Initialized");

    const hasImages = uploadedImages && uploadedImages.length > 0;

    if (hasImages) {
        console.log(`🖼️  Image-to-Image Mode: ${uploadedImages.length} reference image(s) provided`);
        return await generateImageToImage({ prompt, negativePrompt, uploadedImages, apiKey, modelConfig });
    } else {
        console.log("📝 Text-to-Image Mode");
        return await generateTextToImage({ prompt, negativePrompt, apiKey, modelConfig });
    }
}

/**
 * Text-to-Image Generation (T2I)
 * Pure text prompt -> image generation
 */
async function generateTextToImage({ prompt, negativePrompt, apiKey, modelConfig }) {
    console.log("🎨 Starting Text-to-Image Generation");

    // Merge negative prompt
    let finalPrompt = prompt;
    if (negativePrompt) {
        finalPrompt += `. Avoid: ${negativePrompt}`;
    }

    // Use Gemini 2.5 Flash Image model for image generation
    const modelName = modelConfig?.model || 'gemini-2.5-flash-image';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent`;

    // Construct request payload according to Gemini API
    const requestBody = {
        contents: [{
            parts: [{
                text: finalPrompt
            }]
        }]
    };

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-goog-api-key': apiKey
            },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            const errorText = await response.text();
            const errorMessage = parseGeminiError(errorText);
            throw new Error(`Gemini T2I Error: ${errorMessage}`);
        }

        const data = await response.json();
        return extractImageFromResponse(data, 'T2I');

    } catch (error) {
        console.error("❌ Gemini T2I Generation Failed:", error);
        throw error;
    }
}

/**
 * Image-to-Image Generation (I2I)
 * Reference image(s) + text prompt -> edited/generated image
 */
async function generateImageToImage({ prompt, negativePrompt, uploadedImages, apiKey, modelConfig }) {
    console.log("🖼️  Starting Image-to-Image Generation");

    // Merge negative prompt
    let finalPrompt = prompt;
    if (negativePrompt) {
        finalPrompt += `. Avoid: ${negativePrompt}`;
    }

    // Use Gemini 2.5 Flash Image model
    const modelName = modelConfig?.model || 'gemini-2.5-flash-image';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent`;

    // Build parts array: text prompt + image(s)
    const parts = [];

    // Add text prompt first
    parts.push({ text: finalPrompt });

    // Add reference images (up to 14 images supported by Gemini)
    for (const imageData of uploadedImages.slice(0, 14)) {
        // Remove data URI prefix if present (data:image/png;base64,...)
        const base64Data = imageData.includes('base64,')
            ? imageData.split('base64,')[1]
            : imageData;

        // Detect MIME type
        let mimeType = 'image/jpeg';
        if (imageData.includes('image/png')) {
            mimeType = 'image/png';
        } else if (imageData.includes('image/webp')) {
            mimeType = 'image/webp';
        }

        parts.push({
            inline_data: {
                mime_type: mimeType,
                data: base64Data
            }
        });
    }

    const requestBody = {
        contents: [{
            parts: parts
        }]
    };

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-goog-api-key': apiKey
            },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            const errorText = await response.text();
            const errorMessage = parseGeminiError(errorText);
            throw new Error(`Gemini I2I Error: ${errorMessage}`);
        }

        const data = await response.json();
        return extractImageFromResponse(data, 'I2I');

    } catch (error) {
        console.error("❌ Gemini I2I Generation Failed:", error);
        throw error;
    }
}

/**
 * Extract generated image from Gemini API response
 * Response structure: candidates[0].content.parts[].inline_data.data
 */
function extractImageFromResponse(responseData, mode) {
    try {
        const candidates = responseData.candidates;
        if (!candidates || candidates.length === 0) {
            throw new Error('No candidates returned in response');
        }

        const parts = candidates[0].content.parts;
        if (!parts || parts.length === 0) {
            throw new Error('No parts in response');
        }

        // Find the part with image data
        for (const part of parts) {
            if (part.inline_data && part.inline_data.data) {
                const base64Image = part.inline_data.data;
                const mimeType = part.inline_data.mime_type || 'image/png';
                console.log(`✅ Gemini ${mode}: Image generated successfully`);
                return `data:${mimeType};base64,${base64Image}`;
            }
        }

        // If no image found, throw error with full response for debugging
        console.error("Full Gemini Response:", JSON.stringify(responseData, null, 2));
        throw new Error('No image data found in response (possibly blocked by safety filters)');

    } catch (error) {
        console.error("Error extracting image from response:", error);
        throw error;
    }
}

/**
 * Parse Gemini API error response
 * Safely extract meaningful error message
 */
function parseGeminiError(errorText) {
    let errorMessage = 'API Error';

    try {
        const errorJson = JSON.parse(errorText);

        // Gemini API error structure
        if (errorJson.error) {
            if (typeof errorJson.error === 'string') {
                errorMessage = errorJson.error;
            } else if (errorJson.error.message) {
                errorMessage = errorJson.error.message;
            } else if (errorJson.error.status) {
                errorMessage = errorJson.error.status;
            } else if (Array.isArray(errorJson.error.details) && errorJson.error.details[0]?.message) {
                errorMessage = errorJson.error.details[0].message;
            } else {
                errorMessage = JSON.stringify(errorJson.error).substring(0, 200);
            }
        } else if (errorJson.message) {
            errorMessage = errorJson.message;
        } else {
            errorMessage = errorText.substring(0, 200);
        }
    } catch (e) {
        errorMessage = errorText.substring(0, 200);
    }

    return errorMessage;
}

module.exports = { generateWithGemini };
