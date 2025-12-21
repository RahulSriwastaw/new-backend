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

    // Fetch and prepare image
    let imageBuffer;
    try {
        const imgResponse = await fetch(uploadedImages[0]);
        if (!imgResponse.ok) {
            throw new Error(`Image fetch failed: ${imgResponse.status}`);
        }
        imageBuffer = await imgResponse.arrayBuffer();
    } catch (error) {
        console.error("❌ Image fetch error:", error);
        throw new Error(`Failed to fetch reference image: ${error.message}`);
    }

    // Create multipart/form-data
    const FormData = globalThis.FormData || require('form-data');
    const formData = new FormData();

    // Required parameters
    formData.append('init_image', new Blob([imageBuffer], { type: 'image/png' }), 'input.png');
    formData.append('init_image_mode', 'IMAGE_STRENGTH'); // REQUIRED for SDXL I2I
    formData.append('image_strength', '0.35'); // 0-1: Lower = more like original (0.35 = preserve 65%)

    // Text prompts (SDXL format)
    formData.append('text_prompts[0][text]', prompt);
    formData.append('text_prompts[0][weight]', '1');

    if (negativePrompt) {
        formData.append('text_prompts[1][text]', negativePrompt);
        formData.append('text_prompts[1][weight]', '-1');
    }

    // Optional parameters
    formData.append('cfg_scale', '7'); // Prompt adherence (7 = balanced)
    formData.append('samples', '1');
    formData.append('steps', '30');

    // Call Stability SDXL API
    const response = await fetch('https://api.stability.ai/v1/generation/stable-diffusion-xl-1024-v1-0/image-to-image', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Accept': 'application/json'
            // DO NOT set Content-Type - let FormData handle it with boundary
        },
        body: formData
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
