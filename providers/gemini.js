/**
 * Google Gemini / Imagen 3 AI Provider
 * STRICTLY Text-to-Image Only
 * 
 * Updates per user request:
 * - Enforces T2I only (no uploaded images)
 * - Uses Imagen 3.0 endpoint
 * - Correct payload structure
 */

const axios = require('axios'); // Ensure axios is used or fetch. The previous file used fetch. I'll stick to fetch.

async function generateWithGemini({ prompt, negativePrompt, uploadedImages, apiKey, modelConfig }) {
    console.log("🤖 Gemini/Imagen Provider Initialized");

    // 1. STRICT SAFETY CHECK: No Image-to-Image
    if (uploadedImages && uploadedImages.length > 0) {
        console.warn("⚠️ Gemini I2I Attempt Blocked. Routing should have caught this.");
        throw new Error("Gemini does not support Image-to-Image/Face-Preservation. Please use Stability or MiniMax.");
    }

    // 2. Perform Text-to-Image Generation
    return await generateTextToImage({ prompt, negativePrompt, aspectRatio: modelConfig?.aspectRatio || '1:1', apiKey, modelConfig });
}

/**
 * Imagen 3.0 Text-to-Image Generation
 */
async function generateTextToImage({ prompt, negativePrompt, aspectRatio, apiKey, modelConfig }) {
    console.log("🖼️  Imagen 3.0 T2I: Starting Generation");

    // Merge negative prompt into main prompt if needed, 
    // though Imagen 3 API doesn't have a specific 'negative_prompt' field in the simple payload shown by user.
    // User said: "prompt": { "text": "<final merged prompt>" }
    let finalPrompt = prompt;
    if (negativePrompt) {
        finalPrompt += ` . Avoid: ${negativePrompt}`;
    }

    // Use model from config or default to 'imagen-3.0'
    const modelName = modelConfig?.model || 'imagen-3.0';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateImages?key=${apiKey}`;

    // Map common aspect ratios to Gemini's supported format
    // Gemini supports: "1:1", "3:4", "4:3", "9:16", "16:9"
    let targetAspectRatio = "1:1";
    if (aspectRatio && ["1:1", "3:4", "4:3", "9:16", "16:9"].includes(aspectRatio)) {
        targetAspectRatio = aspectRatio;
    } else if (aspectRatio === "2:3") targetAspectRatio = "3:4"; // Approximation
    else if (aspectRatio === "3:2") targetAspectRatio = "4:3"; // Approximation

    const body = {
        prompt: {
            text: finalPrompt
        },
        imageGenerationConfig: {
            aspectRatio: targetAspectRatio,
            personGeneration: "ALLOW_ADULT",
            safetyFilterLevel: "BLOCK_MEDIUM_AND_ABOVE"
        }
    };

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error("❌ Imagen 3.0 API Error:", errorText);

            let errorMessage = 'API Error';
            try {
                const errorJson = JSON.parse(errorText);
                // Safely extract error message from various possible structures
                if (errorJson.error) {
                    if (typeof errorJson.error === 'string') {
                        errorMessage = errorJson.error;
                    } else if (errorJson.error.message) {
                        errorMessage = errorJson.error.message;
                    } else if (errorJson.error.details && Array.isArray(errorJson.error.details) && errorJson.error.details[0]?.message) {
                        errorMessage = errorJson.error.details[0].message;
                    } else if (errorJson.error.status) {
                        errorMessage = errorJson.error.status;
                    } else {
                        // If error object exists but doesn't have expected properties
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
            throw new Error(`Gemini API Error: ${errorMessage}`);
        }

        const data = await response.json();

        // Parse Response (User Requirement 4)
        // const base64Image = response.data.generatedImages?.[0]?.image?.imageBytes;
        // In fetch 'data' is the body.
        const base64Image = data.generatedImages?.[0]?.image?.imageBytes;

        if (base64Image) {
            console.log("✅ Imagen 3.0: Image generated successfully");
            return `data:image/png;base64,${base64Image}`;
        }

        // Handle "No image in response"
        console.error("Imagen 3.0 Full Response:", JSON.stringify(data, null, 2));
        throw new Error("Gemini text-to-image returned no image (Safety/Policy Block)");

    } catch (error) {
        console.error("❌ Gemini/Imagen Generation Exception:", error);
        throw error;
    }
}

module.exports = { generateWithGemini };
