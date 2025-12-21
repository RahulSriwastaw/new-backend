/**
 * Google Gemini (Imagen) AI Provider
 * Supports: Imagen 2 & 3 for image generation
 * Documentation: https://ai.google.dev/api/generate-image
 */

async function generateWithGemini({ prompt, negativePrompt, uploadedImages, apiKey, modelConfig }) {
    console.log("🤖 Google Gemini Provider Initialized");

    // Gemini uses different models for different tasks
    const model = modelConfig?.model || "imagen-3.0-generate-001";

    if (uploadedImages && uploadedImages.length > 0) {
        // IMAGE-TO-IMAGE: Imagen Edit
        return await generateImageToImage({ prompt, uploadedImages, apiKey, model });
    } else {
        // TEXT-TO-IMAGE: Imagen Generate
        return await generateTextToImage({ prompt, negativePrompt, apiKey, model });
    }
}

/**
 * Gemini Text-to-Image (Imagen Generate)
 */
async function generateTextToImage({ prompt, negativePrompt, apiKey, model }) {
    console.log("🖼️  Gemini T2I: Imagen Generate");

    // Build prompt with negative if provided
    let fullPrompt = prompt;
    if (negativePrompt) {
        fullPrompt += `. Avoid: ${negativePrompt}`;
    }

    const body = {
        prompt: fullPrompt,
        number_of_images: 1,
        aspect_ratio: "1:1", // Options: 1:1, 3:4, 4:3, 9:16, 16:9
        safety_filter_level: "block_some", // block_none, block_some, block_most
        person_generation: "allow_adult" // allow_adult, allow_all
    };

    const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateImage?key=${apiKey}`,
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        }
    );

    if (!response.ok) {
        const errorText = await response.text();
        console.error("❌ Gemini T2I Error:", errorText);

        let errorMessage = 'API Error';
        try {
            const errorJson = JSON.parse(errorText);
            errorMessage = errorJson.error?.message || errorJson.error?.status || 'Unknown error';
        } catch {
            errorMessage = errorText.substring(0, 200);
        }

        throw new Error(`Gemini T2I: ${errorMessage}`);
    }

    const data = await response.json();

    // Gemini returns base64 encoded images
    if (data.generatedImages && data.generatedImages[0]?.bytesBase64Encoded) {
        console.log("✅ Gemini T2I: Image generated successfully");
        return `data:image/png;base64,${data.generatedImages[0].bytesBase64Encoded}`;
    }

    throw new Error('Gemini T2I: No image in response');
}

/**
 * Gemini Image-to-Image (Imagen Edit)
 */
async function generateImageToImage({ prompt, uploadedImages, apiKey, model }) {
    console.log("📸 Gemini I2I: Imagen Edit");

    // Fetch reference image
    let imageBase64;
    try {
        const imgResponse = await fetch(uploadedImages[0]);
        if (!imgResponse.ok) {
            throw new Error(`Image fetch failed: ${imgResponse.status}`);
        }
        const imageBuffer = await imgResponse.arrayBuffer();
        imageBase64 = Buffer.from(imageBuffer).toString('base64');
    } catch (error) {
        console.error("❌ Image fetch error:", error);
        throw new Error(`Failed to fetch image: ${error.message}`);
    }

    const body = {
        prompt: prompt,
        reference_image: {
            image: {
                bytesBase64Encoded: imageBase64
            }
        },
        number_of_images: 1,
        safety_filter_level: "block_some",
        person_generation: "allow_adult"
    };

    // Use edit model for I2I
    const editModel = model.includes('edit') ? model : 'imagen-3.0-capability-001';

    const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${editModel}:editImage?key=${apiKey}`,
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        }
    );

    if (!response.ok) {
        const errorText = await response.text();
        console.error("❌ Gemini I2I Error:", errorText);

        let errorMessage = 'API Error';
        try {
            const errorJson = JSON.parse(errorText);
            errorMessage = errorJson.error?.message || errorJson.error?.status || 'Unknown error';
        } catch {
            errorMessage = errorText.substring(0, 200);
        }

        throw new Error(`Gemini I2I: ${errorMessage}`);
    }

    const data = await response.json();

    if (data.generatedImages && data.generatedImages[0]?.bytesBase64Encoded) {
        console.log("✅ Gemini I2I: Image generated successfully");
        return `data:image/png;base64,${data.generatedImages[0].bytesBase64Encoded}`;
    }

    throw new Error('Gemini I2I: No image in response');
}

module.exports = { generateWithGemini };
