/**
 * MiniMax Official API Provider
 * Direct integration with MiniMax API
 */

async function generateWithMiniMax({ prompt, uploadedImages, apiKey, modelConfig }) {
    console.log("🚀 MiniMax Official Provider Initialized");

    const body = {
        prompt,
        model: modelConfig?.model || "image-01"
    };

    // Add subject reference for I2I (face preservation)
    if (uploadedImages && uploadedImages.length > 0) {
        body.subject_reference = [{
            type: 'character',
            image_file: uploadedImages[0]
        }];
        console.log("📸 MiniMax I2I: Subject reference attached");
    }

    const response = await fetch('https://api.minimax.io/v1/image_generation', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify(body)
    });

    if (!response.ok) {
        const errorText = await response.text();
        console.error("❌ MiniMax Error:", errorText);
        throw new Error(`MiniMax: ${errorText.substring(0, 150)}`);
    }

    const data = await response.json();

    // Handle various response formats
    let imageUrl = null;

    if (data.url) imageUrl = data.url;
    else if (data.data?.url) imageUrl = data.data.url;
    else if (data.data?.[0]?.url) imageUrl = data.data[0].url;
    else if (data.data?.image_urls?.[0]) imageUrl = data.data.image_urls[0];
    else if (data.image_urls?.[0]) imageUrl = data.image_urls[0];
    else if (data.base64) imageUrl = `data:image/png;base64,${data.base64}`;

    if (imageUrl) {
        console.log("✅ MiniMax: Image generated successfully");
        return imageUrl;
    }

    throw new Error(`MiniMax: Invalid response format - ${JSON.stringify(data).substring(0, 100)}`);
}

module.exports = { generateWithMiniMax };
