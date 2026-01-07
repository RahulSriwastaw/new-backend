/**
 * Replicate API Provider
 * Supports: Various models (SDXL, Flux, MiniMax, etc.)
 * Uses Official Replicate SDK
 */

const Replicate = require("replicate");

// Convert aspect ratio string to width/height
function getDimensionsFromAspectRatio(aspectRatio) {
    const ratios = {
        '1:1': { width: 768, height: 768 },
        '16:9': { width: 1024, height: 576 },
        '9:16': { width: 576, height: 1024 },
        '4:3': { width: 768, height: 576 },
        '3:4': { width: 576, height: 768 },
        '21:9': { width: 1344, height: 576 },
    };
    return ratios[aspectRatio] || ratios['1:1'];
}

async function generateWithReplicate({ prompt, negativePrompt, uploadedImages, aspectRatio, apiKey, modelId, quality = 'HD' }) {
    console.log("🔄 Replicate Provider Initialized");
    console.log("📦 Model:", modelId);

    if (!apiKey) {
        throw new Error("Replicate API key not configured");
    }

    if (!modelId) {
        throw new Error("Replicate model ID not configured");
    }

    // Initialize Replicate client
    const replicate = new Replicate({
        auth: apiKey,
    });

    // Get dimensions from aspect ratio
    const { width, height } = getDimensionsFromAspectRatio(aspectRatio || '1:1');

    // Build input object - start with minimal required fields
    const input = {
        prompt: prompt || "A beautiful image",
    };

    // Add image for I2I if available (must be before other params)
    if (uploadedImages && uploadedImages.length > 0) {
        // Use first uploaded image
        const imageData = uploadedImages[0];
        
        // Replicate accepts data URLs directly for image input
        if (imageData.startsWith('data:')) {
            input.image = imageData;
        } else if (imageData.startsWith('http://') || imageData.startsWith('https://')) {
            // If it's a URL, use it directly
            input.image = imageData;
        } else {
            // Assume it's a base64 string, add data URL prefix
            input.image = `data:image/png;base64,${imageData}`;
        }
        
        // Add prompt strength for I2I (0.0 to 1.0) - only for models that support it
        input.prompt_strength = 0.8;
        input.num_inference_steps = 30; // More steps for I2I
        
        console.log("📸 Replicate I2I: Image input attached");
    } else {
        // Text-to-image parameters
        input.width = width;
        input.height = height;
        input.num_outputs = 1;
        input.guidance_scale = 7.5;
        input.num_inference_steps = quality === 'UHD' || quality === '4K' || quality === '8K' ? 50 : 25;
        input.scheduler = "K_EULER";
        input.apply_watermark = false;
    }

    // Add negative prompt if available (not all models support this)
    if (negativePrompt) {
        input.negative_prompt = negativePrompt;
    }

    // Handle different model formats
    let modelIdentifier = modelId;
    
    // If modelId is just a key like "sdxl", convert to full identifier
    if (!modelId.includes('/') && !modelId.includes(':')) {
        // Default to SDXL if no specific model
        modelIdentifier = "stability-ai/sdxl:7762fd07cf82c948538e41f63f77d685e02b063e37e496e96eefd46c929f9bdc";
    }

    try {
        console.log("🚀 Starting Replicate generation...");
        console.log("📝 Model Identifier:", modelIdentifier);
        console.log("📝 Input Keys:", Object.keys(input));
        // Don't log full input if it contains large base64 images
        const logInput = { ...input };
        if (logInput.image && logInput.image.length > 100) {
            logInput.image = logInput.image.substring(0, 100) + '... (truncated)';
        }
        console.log("📝 Input:", JSON.stringify(logInput, null, 2));

        // Run the model - Replicate SDK handles polling automatically
        const output = await replicate.run(modelIdentifier, { input });

        console.log("📦 Replicate Output Type:", typeof output);
        console.log("📦 Replicate Output:", Array.isArray(output) ? `Array[${output.length}]` : output);

        // Handle output - can be array or single URL
        let imageUrl = null;

        if (Array.isArray(output)) {
            imageUrl = output[0];
        } else if (typeof output === 'string') {
            imageUrl = output;
        } else if (output && output.url) {
            imageUrl = output.url;
        }

        if (!imageUrl) {
            throw new Error("Replicate: No image URL in output");
        }

        console.log("✅ Replicate: Image generated successfully");
        console.log("🖼️  Image URL:", imageUrl);

        return imageUrl;

    } catch (error) {
        console.error("❌ Replicate Generation Error:", error);
        console.error("Error Details:", {
            message: error.message,
            status: error.status,
            statusText: error.statusText,
            body: error.body
        });

        // Provide more helpful error messages
        if (error.message) {
            throw new Error(`Replicate: ${error.message}`);
        } else if (error.status) {
            throw new Error(`Replicate: HTTP ${error.status} - ${error.statusText || 'Unknown error'}`);
        } else {
            throw new Error(`Replicate: ${error.toString()}`);
        }
    }
}

module.exports = { generateWithReplicate };
