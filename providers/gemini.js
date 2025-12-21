/**
 * Google Gemini AI Provider
 * Uses Gemini 2.5 Flash Image for image generation
 * Documentation: https://ai.google.dev/gemini-api/docs/image-generation
 */

async function generateWithGemini({ prompt, negativePrompt, uploadedImages, apiKey, modelConfig }) {
    console.log("🤖 Google Gemini Provider Initialized");

    // Gemini model for image generation
    const model = modelConfig?.model || "gemini-2.5-flash-image";

    if (uploadedImages && uploadedImages.length > 0) {
        // IMAGE-TO-IMAGE: Image editing with Gemini
        return await generateImageEdit({ prompt, uploadedImages, apiKey, model });
    } else {
        // TEXT-TO-IMAGE: Gemini Generate
        return await generateTextToImage({ prompt, negativePrompt, apiKey, model });
    }
}

/**
 * Gemini Text-to-Image Generation
 */
async function generateTextToImage({ prompt, negativePrompt, apiKey, model }) {
    console.log("🖼️  Gemini T2I: Image Generation");

    // Build prompt with negative if provided
    let fullPrompt = prompt;
    if (negativePrompt) {
        fullPrompt += `. Avoid: ${negativePrompt}`;
    }

    const body = {
        contents: [{
            parts: [{
                text: fullPrompt
            }]
        }]
    };

    const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
            method: 'POST',
            headers: {
                'x-goog-api-key': apiKey,
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
            errorMessage = errorJson.error?.message || 'Unknown error';
        } catch {
            errorMessage = errorText.substring(0, 200);
        }

        throw new Error(`Gemini T2I: ${errorMessage}`);
    }

    const data = await response.json();

    // Gemini returns image in inline_data as base64
    if (data.candidates && data.candidates[0]) {
        const parts = data.candidates[0].content?.parts || [];

        for (const part of parts) {
            if (part.inline_data && part.inline_data.data) {
                console.log("✅ Gemini T2I: Image generated successfully");
                const mimeType = part.inline_data.mime_type || 'image/png';
                return `data:${mimeType};base64,${part.inline_data.data}`;
            }
        }
    }

    throw new Error('Gemini T2I: No image in response');
}

/**
 * Gemini Image-to-Image Editing
 */
async function generateImageEdit({ prompt, uploadedImages, apiKey, model }) {
    console.log("📸 Gemini I2I: Image Editing");

    // Fetch reference image
    let imageBase64;
    let imageMimeType = 'image/png';

    try {
        const imgResponse = await fetch(uploadedImages[0]);
        if (!imgResponse.ok) {
            throw new Error(`Image fetch failed: ${imgResponse.status}`);
        }

        // Get MIME type from response
        const contentType = imgResponse.headers.get('content-type');
        if (contentType) {
            imageMimeType = contentType;
        }

        const imageBuffer = await imgResponse.arrayBuffer();
        imageBase64 = Buffer.from(imageBuffer).toString('base64');
    } catch (error) {
        console.error("❌ Image fetch error:", error);
        throw new Error(`Failed to fetch image: ${error.message}`);
    }

    const body = {
        contents: [{
            parts: [
                {
                    text: prompt
                },
                {
                    inline_data: {
                        mime_type: imageMimeType,
                        data: imageBase64
                    }
                }
            ]
        }]
    };

    const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
            method: 'POST',
            headers: {
                'x-goog-api-key': apiKey,
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
            errorMessage = errorJson.error?.message || 'Unknown error';
        } catch {
            errorMessage = errorText.substring(0, 200);
        }

        throw new Error(`Gemini I2I: ${errorMessage}`);
    }

    const data = await response.json();

    if (data.candidates && data.candidates[0]) {
        const parts = data.candidates[0].content?.parts || [];

        for (const part of parts) {
            if (part.inline_data && part.inline_data.data) {
                console.log("✅ Gemini I2I: Image edited successfully");
                const mimeType = part.inline_data.mime_type || 'image/png';
                return `data:${mimeType};base64,${part.inline_data.data}`;
            }
        }
    }

    throw new Error('Gemini I2I: No image in response');
}

module.exports = { generateWithGemini };
