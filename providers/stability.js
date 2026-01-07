/**
 * Stability AI Official API Provider
 * SDXL 1.0 - Requires multipart/form-data for image-to-image
 * Documentation: https://platform.stability.ai/docs/api-reference
 */

const FormData = require('form-data');

async function generateWithStability({ prompt, negativePrompt, uploadedImages, aspectRatio, apiKey, modelConfig, strength }) {
    console.log("🎨 Stability AI Provider Initialized");

    if (uploadedImages && uploadedImages.length > 0) {
        // IMAGE-TO-IMAGE: MUST use multipart/form-data
        return await generateImageToImage({ prompt, negativePrompt, uploadedImages, apiKey, strength });
    } else {
        // TEXT-TO-IMAGE: JSON is fine
        return await generateTextToImage({ prompt, negativePrompt, aspectRatio, apiKey, modelConfig, strength });
    }
}

/**
 * SDXL Image-to-Image (Face Preservation)
 * MUST use multipart/form-data (not JSON)
 */
async function generateImageToImage({ prompt, negativePrompt, uploadedImages, apiKey, strength }) {
    console.log("📸 Stability SDXL I2I: Face Preservation Mode (Multipart)");

    // Fetch image
    let imageBuffer;
    let contentType = 'image/png';
    let filename = 'input.png';

    try {
        console.log(`⬇️ Fetching image for Stability I2I: ${uploadedImages[0]}`);
        const imgResponse = await fetch(uploadedImages[0]);
        if (!imgResponse.ok) {
            throw new Error(`Image fetch failed: ${imgResponse.status}`);
        }
        
        // Detect Content-Type from headers
        const type = imgResponse.headers.get('content-type');
        if (type) {
            contentType = type;
            if (type.includes('jpeg') || type.includes('jpg')) filename = 'input.jpg';
            else if (type.includes('webp')) filename = 'input.webp';
        }

        const arrayBuffer = await imgResponse.arrayBuffer();
        imageBuffer = Buffer.from(arrayBuffer);
        
        console.log(`✅ Image fetched: ${imageBuffer.length} bytes, Type: ${contentType}`);

        if (imageBuffer.length < 100) {
             throw new Error("Fetched image is too small (invalid)");
        }

    } catch (error) {
        console.error("❌ Image fetch error:", error);
        throw new Error(`Failed to fetch image: ${error.message}`);
    }

    // Create proper multipart/form-data
    const formData = new FormData();

    // Required: Image file
    formData.append('init_image', imageBuffer, {
        filename: filename,
        contentType: contentType
    });

    // Required: Image mode
    formData.append('init_image_mode', 'IMAGE_STRENGTH');

    // Required: Strength (0-1, lower = more preservation)
    const imageStrength = strength !== undefined ? String(strength) : '0.35'; // Use provided strength or default
    formData.append('image_strength', imageStrength);

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
async function generateTextToImage({ prompt, negativePrompt, aspectRatio, apiKey, modelConfig, strength }) {
    console.log("🖼️  Stability SDXL T2I: Text-to-Image Mode");

    // Default to SDXL 1.0 if not specified
    const modelEngine = modelConfig?.model || 'stable-diffusion-xl-1024-v1-0';
    const url = `https://api.stability.ai/v1/generation/${modelEngine}/text-to-image`;

    // Map Aspect Ratio to Width/Height (SDXL 1.0 Optimized)
    let width = 1024;
    let height = 1024;

    if (aspectRatio === '16:9') { width = 1344; height = 768; }
    else if (aspectRatio === '9:16') { width = 768; height = 1344; }
    else if (aspectRatio === '4:3') { width = 1152; height = 896; }
    else if (aspectRatio === '3:4') { width = 896; height = 1152; }
    else if (aspectRatio === '21:9') { width = 1536; height = 640; } // Cinematic
    else if (aspectRatio === '9:21') { width = 640; height = 1536; } // Vertical Cinematic

    const body = {
        text_prompts: [
            { text: prompt, weight: 1 }
        ],
        width,
        height,
        cfg_scale: 7,
        samples: 1,
        steps: 30
    };

    if (negativePrompt) {
        body.text_prompts.push({ text: negativePrompt, weight: -1 });
    }

    const response = await fetch(
        url,
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
