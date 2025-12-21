/**
 * Stability AI Official API Provider
 * Supports: SDXL 1.0 (Text-to-Image & Image-to-Image)
 * Documentation: https://platform.stability.ai/docs
 */

async function generateWithStability({ prompt, negativePrompt, uploadedImages, aspectRatio, apiKey }) {
    console.log("🎨 Stability AI Provider Initialized");

    if (uploadedImages && uploadedImages.length > 0) {
        // IMAGE-TO-IMAGE: SDXL 1.0 with multipart/form-data
        return await generateImageToImage({ prompt, negativePrompt, uploadedImages, apiKey });
    } else {
        // TEXT-TO-IMAGE: SDXL 1.0 with multipart/form-data
        return await generateTextToImage({ prompt, negativePrompt, aspectRatio, apiKey });
    }
}

/**
 * SDXL Image-to-Image (Face Preservation)
 * Endpoint: /v1/generation/stable-diffusion-xl-1024-v1-0/image-to-image
 * Format: multipart/form-data
 */
async function generateImageToImage({ prompt, negativePrompt, uploadedImages, apiKey }) {
    console.log("📸 Stability SDXL I2I: Face Preservation Mode");

    // Fetch and prepare image as Base64
    let base64Image;
    try {
        const imgResponse = await fetch(uploadedImages[0]);
        if (!imgResponse.ok) {
            throw new Error(`Image fetch failed: ${imgResponse.status}`);
        }
        const imageBuffer = await imgResponse.arrayBuffer();
        base64Image = Buffer.from(imageBuffer).toString('base64');
    } catch (error) {
        console.error("❌ Image fetch error:", error);
        throw new Error(`Failed to fetch reference image: ${error.message}`);
    }

    // Build request body (JSON format with Base64)
    const body = {
        text_prompts: [
            { text: prompt, weight: 1 }
        ],
        init_image: base64Image,
        init_image_mode: 'IMAGE_STRENGTH',
        image_strength: 0.35, // 65% preservation
        cfg_scale: 7,
        samples: 1,
        steps: 30
    };

    if (negativePrompt) {
        body.text_prompts.push({ text: negativePrompt, weight: -1 });
    }

    // Call Stability SDXL API
    const response = await fetch('https://api.stability.ai/v1/generation/stable-diffusion-xl-1024-v1-0/image-to-image', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
            'Accept': 'application/json'
        },
        body: JSON.stringify(body)
    });

    if (!response.ok) {
        const errorText = await response.text();
        console.error("❌ Stability SDXL I2I Error:", errorText);

        let errorMessage = 'API Error';
        try {
            const errorJson = JSON.parse(errorText);
            if (errorJson.message) {
                errorMessage = errorJson.message;
            } else if (errorJson.name) {
                errorMessage = errorJson.name;
            } else if (errorJson.errors && Array.isArray(errorJson.errors)) {
                errorMessage = errorJson.errors.join(', ');
            }
        } catch {
            errorMessage = errorText.substring(0, 200);
        }

        throw new Error(`Stability I2I: ${errorMessage}`);
    }

    const data = await response.json();

    if (data.artifacts && data.artifacts[0] && data.artifacts[0].base64) {
        console.log("✅ Stability SDXL I2I: Image generated successfully");
        return `data:image/png;base64,${data.artifacts[0].base64}`;
    }

    throw new Error('Stability I2I: No image in response');
}

/**
 * SDXL Text-to-Image
 * Endpoint: /v1/generation/stable-diffusion-xl-1024-v1-0/text-to-image
 * Format: JSON (legacy) or multipart (recommended)
 */
async function generateTextToImage({ prompt, negativePrompt, aspectRatio, apiKey }) {
    console.log("🖼️  Stability SDXL T2I: Text-to-Image Mode");

    // Using JSON for T2I (simpler, still supported)
    const body = {
        text_prompts: [
            { text: prompt, weight: 1 }
        ],
        cfg_scale: 7,
        samples: 1,
        steps: 30
    };

    if (negativePrompt) {
        body.text_prompts.push({ text: negativePrompt, weight: -1 });
    }

    const response = await fetch('https://api.stability.ai/v1/generation/stable-diffusion-xl-1024-v1-0/text-to-image', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify(body)
    });

    if (!response.ok) {
        const errorText = await response.text();
        console.error("❌ Stability SDXL T2I Error:", errorText);

        let errorMessage = 'API Error';
        try {
            const errorJson = JSON.parse(errorText);
            if (errorJson.message) {
                errorMessage = errorJson.message;
            } else if (errorJson.name) {
                errorMessage = errorJson.name;
            }
        } catch {
            errorMessage = errorText.substring(0, 200);
        }

        throw new Error(`Stability T2I: ${errorMessage}`);
    }

    const data = await response.json();

    if (data.artifacts && data.artifacts[0] && data.artifacts[0].base64) {
        console.log("✅ Stability SDXL T2I: Image generated successfully");
        return `data:image/png;base64,${data.artifacts[0].base64}`;
    }

    throw new Error('Stability T2I: No image in response');
}

module.exports = { generateWithStability };
