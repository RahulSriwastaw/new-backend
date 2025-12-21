/**
 * Stability AI Official API Provider
 * Supports: Text-to-Image (SDXL 1.0), Image-to-Image (SD3)
 */

async function generateWithStability({ prompt, negativePrompt, uploadedImages, aspectRatio, apiKey }) {
    console.log("🎨 Stability AI Provider Initialized");

    if (uploadedImages && uploadedImages.length > 0) {
        // IMAGE-TO-IMAGE: SD3 with multipart/form-data
        return await generateImageToImage({ prompt, negativePrompt, uploadedImages, apiKey });
    } else {
        // TEXT-TO-IMAGE: SDXL 1.0 with JSON
        return await generateTextToImage({ prompt, negativePrompt, aspectRatio, apiKey });
    }
}

/**
 * Image-to-Image Generation (Face Preservation)
 * Uses SD3 API with multipart/form-data
 */
async function generateImageToImage({ prompt, negativePrompt, uploadedImages, apiKey }) {
    console.log("📸 Stability I2I: Face Preservation Mode");

    const formData = new FormData();
    formData.append('prompt', prompt);
    formData.append('mode', 'image-to-image');
    formData.append('model', 'sd3-large');
    formData.append('strength', '0.35'); // Preserve 65% of original
    formData.append('output_format', 'png');

    if (negativePrompt) {
        formData.append('negative_prompt', negativePrompt);
    }

    // Fetch and attach image
    try {
        const imgResponse = await fetch(uploadedImages[0]);
        if (!imgResponse.ok) {
            throw new Error(`Failed to fetch image: ${imgResponse.status}`);
        }
        const imgBuffer = await imgResponse.arrayBuffer();
        formData.append('image', new Blob([imgBuffer], { type: 'image/png' }), 'reference.png');
    } catch (error) {
        console.error("❌ Image fetch failed:", error);
        throw new Error(`Image fetch failed: ${error.message}`);
    }

    // Call Stability API
    const response = await fetch('https://api.stability.ai/v2beta/stable-image/generate/sd3', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Accept': 'application/json'
        },
        body: formData
    });

    if (!response.ok) {
        const errorText = await response.text();
        console.error("❌ Stability I2I Error:", errorText);

        try {
            const errorJson = JSON.parse(errorText);
            throw new Error(`Stability I2I: ${errorJson.message || errorJson.name || 'API Error'}`);
        } catch {
            throw new Error(`Stability I2I: ${errorText.substring(0, 150)}`);
        }
    }

    const data = await response.json();

    if (data.image) {
        console.log("✅ Stability I2I: Image generated successfully");
        return `data:image/png;base64,${data.image}`;
    }

    throw new Error('Stability I2I: No image in response');
}

/**
 * Text-to-Image Generation
 * Uses SDXL 1.0 API with JSON
 */
async function generateTextToImage({ prompt, negativePrompt, aspectRatio, apiKey }) {
    console.log("🖼️  Stability T2I: Text-to-Image Mode");

    const body = {
        text_prompts: [
            { text: prompt, weight: 1 }
        ],
        samples: 1,
        steps: 30
    };

    // Add negative prompt if provided
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
        console.error("❌ Stability T2I Error:", errorText);

        try {
            const errorJson = JSON.parse(errorText);
            throw new Error(`Stability T2I: ${errorJson.message || 'API Error'}`);
        } catch {
            throw new Error(`Stability T2I: ${errorText.substring(0, 150)}`);
        }
    }

    const data = await response.json();

    if (data.artifacts && data.artifacts[0] && data.artifacts[0].base64) {
        console.log("✅ Stability T2I: Image generated successfully");
        return `data:image/png;base64,${data.artifacts[0].base64}`;
    }

    throw new Error('Stability T2I: No image in response');
}

module.exports = { generateWithStability };
