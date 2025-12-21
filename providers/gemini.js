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
    return await generateTextToImage({ prompt, negativePrompt, aspectRatio: modelConfig?.aspectRatio || '1:1', apiKey });
}

/**
 * Imagen 3.0 Text-to-Image Generation
 */
async function generateTextToImage({ prompt, negativePrompt, apiKey }) {
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

    const body = {
        prompt: {
            text: finalPrompt
        },
        imageGenerationConfig: {
            aspectRatio: "1:1",
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
                errorMessage = errorJson.error?.message || errorJson.error?.details?.[0]?.message || 'Unknown error';
            } catch (e) {
                errorMessage = errorText.substring(0, 200);
            }
            throw new Error(`Imagen 3.0 Error: ${errorMessage}`);
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
