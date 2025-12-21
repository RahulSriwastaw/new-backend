/**
 * Stability AI Official API Provider
 * SDXL 1.0 - Requires multipart/form-data for image-to-image
 * Documentation: https://platform.stability.ai/docs/api-reference
 */

const FormData = require('form-data');

async function generateWithStability({ prompt, negativePrompt, uploadedImages, aspectRatio, apiKey }) {
    console.log("🎨 Stability AI Provider Initialized");

    if (uploadedImages && uploadedImages.length > 0) {
        // IMAGE-TO-IMAGE: MUST use multipart/form-data
        return await generateImageToImage({ prompt, negativePrompt, uploadedImages, apiKey });
    } else {
        // TEXT-TO-IMAGE: JSON is fine
        return await generateTextToImage({ prompt, negativePrompt, aspectRatio, apiKey });
    }
}

/**
 * SDXL Image-to-Image (Face Preservation)
 * MUST use multipart/form-data (not JSON)
 */
async function generateImageToImage({ prompt, negativePrompt, uploadedImages, apiKey }) {
    console.log("📸 Stability SDXL I2I: Face Preservation Mode (Multipart)");

    // Fetch image
    let imageBuffer;
    try {
        const imgResponse = await fetch(uploadedImages[0]);
        if (!imgResponse.ok) {
            throw new Error(`Image fetch failed: ${imgResponse.status}`);
        }
        imageBuffer = Buffer.from(await imgResponse.arrayBuffer());
    } catch (error) {
        console.error("❌ Image fetch error:", error);
        throw new Error(`Failed to fetch image: ${error.message}`);
    }

    // Create proper multipart/form-data
    const formData = new FormData();

    // Required: Image file
    formData.append('init_image', imageBuffer, {
        filename: 'input.png',
        contentType: 'image/png'
    });

    // Required: Image mode
    formData.append('init_image_mode', 'IMAGE_STRENGTH');

    // Required: Strength (0-1, lower = more preservation)
    formData.append('image_strength', '0.35'); // 65% preservation

    // Text prompts
    formData.append('text_prompts[0][text]', prompt);
    formData.append('text_prompts[0][weight]', '1');

    if (negativePrompt) {
        formData.append('text_prompts[1][text]', negativePrompt);
        formData.append('text_prompts[1][weight]', '-1');
    }

    // Optional parameters
    formData.append('cfg_scale', '7');
    formData.append('samples', '1');
    formData.append('steps', '30');

    // Call Stability API
    const response = await fetch(
        'https://api.stability.ai/v1/generation/stable-diffusion-xl-1024-v1-0/image-to-image',
        {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Accept': 'application/json',
                ...formData.getHeaders() // Critical: Get correct Content-Type with boundary
            },
            body: formData
        }
    );

    if (!response.ok) {
        const errorText = await response.text();
        console.error("❌ Stability I2I Error:", errorText);

        let errorMessage = 'Unknown error';
        try {
            const errorJson = JSON.parse(errorText);
            errorMessage = errorJson.message || errorJson.name || JSON.stringify(errorJson);
        } catch {
            errorMessage = errorText.substring(0, 200);
        }

        throw new Error(`Stability I2I: ${errorMessage}`);
    }

    const data = await response.json();

    if (data.artifacts && data.artifacts[0] && data.artifacts[0].base64) {
        console.log("✅ Stability SDXL I2I: Success");
        return `data:image/png;base64,${data.artifacts[0].base64}`;
    }

    throw new Error('Stability I2I: No image in response');
}

/**
 * SDXL Text-to-Image
 * JSON format is fine for T2I
 */
async function generateTextToImage({ prompt, negativePrompt, aspectRatio, apiKey }) {
    console.log("🖼️  Stability SDXL T2I: Text-to-Image Mode");

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

    const response = await fetch(
        'https://api.stability.ai/v1/generation/stable-diffusion-xl-1024-v1-0/text-to-image',
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify(body)
        }
    );

    if (!response.ok) {
        const errorText = await response.text();
        console.error("❌ Stability T2I Error:", errorText);

        let errorMessage = 'Unknown error';
        try {
            const errorJson = JSON.parse(errorText);
            errorMessage = errorJson.message || errorJson.name || JSON.stringify(errorJson);
        } catch {
            errorMessage = errorText.substring(0, 200);
        }

        throw new Error(`Stability T2I: ${errorMessage}`);
    }

    const data = await response.json();

    if (data.artifacts && data.artifacts[0] && data.artifacts[0].base64) {
        console.log("✅ Stability SDXL T2I: Success");
        return `data:image/png;base64,${data.artifacts[0].base64}`;
    }

    throw new Error('Stability T2I: No image in response');
}

module.exports = { generateWithStability };
