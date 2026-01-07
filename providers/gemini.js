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
    // Add safety settings to reduce false safety blocks
    const requestBody = {
        contents: [{
            parts: [{
                text: finalPrompt
            }]
        }],
        safetySettings: [
            { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_ONLY_HIGH" },
            { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_ONLY_HIGH" },
            { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_ONLY_HIGH" },
            { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_ONLY_HIGH" }
        ]
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
        console.log("📦 Gemini T2I Response Keys:", Object.keys(data));
        console.log("📦 Gemini T2I Response Structure:", JSON.stringify(data, null, 2).substring(0, 2000));
        
        try {
            const imageUrl = extractImageFromResponse(data, 'T2I');
            console.log("✅ Gemini T2I: Image extracted successfully, length:", imageUrl?.length || 0);
            return imageUrl;
        } catch (extractError) {
            console.error("❌ Gemini T2I: Image extraction failed:", extractError.message);
            console.error("❌ Full response data:", JSON.stringify(data, null, 2));
            throw new Error(`Gemini T2I Image Extraction Failed: ${extractError.message}`);
        }

    } catch (error) {
        console.error("❌ Gemini T2I Generation Failed:", error);
        console.error("❌ Error stack:", error.stack);
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
        }],
        safetySettings: [
            { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_ONLY_HIGH" },
            { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_ONLY_HIGH" },
            { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_ONLY_HIGH" },
            { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_ONLY_HIGH" }
        ]
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
        console.log("📦 Gemini I2I Response Keys:", Object.keys(data));
        console.log("📦 Gemini I2I Response Structure:", JSON.stringify(data, null, 2).substring(0, 2000));
        
        try {
            const imageUrl = extractImageFromResponse(data, 'I2I');
            console.log("✅ Gemini I2I: Image extracted successfully, length:", imageUrl?.length || 0);
            return imageUrl;
        } catch (extractError) {
            console.error("❌ Gemini I2I: Image extraction failed:", extractError.message);
            console.error("❌ Full response data:", JSON.stringify(data, null, 2));
            throw new Error(`Gemini I2I Image Extraction Failed: ${extractError.message}`);
        }

    } catch (error) {
        console.error("❌ Gemini I2I Generation Failed:", error);
        console.error("❌ Error stack:", error.stack);
        throw error;
    }
}

/**
 * Extract generated image from Gemini API response
 * Handles multiple possible response formats from Gemini
 */
function extractImageFromResponse(responseData, mode) {
    try {
        console.log(`🔍 Extracting image from ${mode} response...`);

        // Check for safety blocks first
        if (responseData.candidates && responseData.candidates[0]?.finishReason) {
            const finishReason = responseData.candidates[0].finishReason;
            if (finishReason !== 'STOP' && finishReason !== 'MAX_TOKENS') {
                console.warn(`⚠️ Gemini ${mode}: Finish reason: ${finishReason}`);
                if (finishReason === 'SAFETY') {
                    throw new Error('Content was blocked by safety filters. Please try a different prompt.');
                }
            }
        }

        const candidates = responseData.candidates;
        if (!candidates || candidates.length === 0) {
            console.error("❌ No candidates in response");
            throw new Error('No candidates returned in response');
        }

        if (!candidates[0]?.content) {
            console.error("❌ No content in first candidate");
            throw new Error('No content in response candidate');
        }

        const parts = candidates[0].content.parts;
        if (!parts || parts.length === 0) {
            console.error("❌ No parts in response content");
            throw new Error('No parts in response');
        }

        console.log(`📊 Found ${parts.length} parts. Checking each part...`);

        // Try multiple extraction methods for different Gemini response formats
        for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            const partKeys = Object.keys(part);
            console.log(`🔎 Part ${i} keys:`, partKeys.join(', '));

            // Method 1: inline_data.data (standard snake_case format)
            if (part.inline_data && part.inline_data.data) {
                const base64Image = part.inline_data.data;
                const mimeType = part.inline_data.mime_type || 'image/png';
                console.log(`✅ Gemini ${mode}: Image found via inline_data (${base64Image.length} chars)`);
                return `data:${mimeType};base64,${base64Image}`;
            }

            // Method 2: inlineData.data (camelCase variant)
            if (part.inlineData && part.inlineData.data) {
                const base64Image = part.inlineData.data;
                const mimeType = part.inlineData.mimeType || part.inlineData.mime_type || 'image/png';
                console.log(`✅ Gemini ${mode}: Image found via inlineData (${base64Image.length} chars)`);
                return `data:${mimeType};base64,${base64Image}`;
            }

            // Method 3: Direct data field
            if (part.data && typeof part.data === 'string' && part.data.length > 1000) {
                console.log(`✅ Gemini ${mode}: Image found via direct data field (${part.data.length} chars)`);
                return `data:image/png;base64,${part.data}`;
            }

            // Method 4: text field containing base64 (fallback)
            if (part.text && part.text.length > 1000 && part.text.match(/^[A-Za-z0-9+/=]+$/)) {
                console.log(`✅ Gemini ${mode}: Image found in text field (base64, ${part.text.length} chars)`);
                return `data:image/png;base64,${part.text}`;
            }

            // Log what we found in this part for debugging
            if (part.text) {
                console.log(`  → Part ${i} contains text: ${part.text.substring(0, 100)}...`);
            }
        }

        // If no image found, log full response structure for debugging
        console.error("❌ Image extraction failed. Full response:");
        console.error("Response keys:", Object.keys(responseData));
        console.error("Candidates[0] keys:", Object.keys(candidates[0]));
        console.error("Parts details:", JSON.stringify(parts, null, 2).substring(0, 3000));
        console.error("Usage metadata:", JSON.stringify(responseData.usageMetadata, null, 2));

        throw new Error(`No image data found in ${parts.length} part(s). Check logs for response structure.`);

    } catch (error) {
        console.error("❌ Error extracting image from response:", error.message);
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
