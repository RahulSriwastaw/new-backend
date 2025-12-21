/**
 * Replicate API Provider
 * Supports: Various models (MiniMax, Flux, SDXL, etc.)
 */

async function generateWithReplicate({ prompt, negativePrompt, uploadedImages, aspectRatio, apiKey, modelId }) {
    console.log("🔄 Replicate Provider Initialized");
    console.log("📦 Model:", modelId);

    if (!modelId) {
        throw new Error("Replicate model ID not configured");
    }

    // Determine endpoint format
    let endpoint = 'https://api.replicate.com/v1/predictions';
    const body = {
        input: {
            prompt,
            aspect_ratio: aspectRatio || "1:1"
        }
    };

    // Add negative prompt if available
    if (negativePrompt) {
        body.input.negative_prompt = negativePrompt;
    }

    // Add image for I2I if available
    if (uploadedImages && uploadedImages.length > 0) {
        body.input.image = uploadedImages[0];
        console.log("📸 Replicate I2I: Image input attached");
    }

    // Handle model ID formats
    if (modelId.includes('/') && !modelId.includes(':')) {
        const [owner, name] = modelId.split('/');
        endpoint = `https://api.replicate.com/v1/models/${owner}/${name}/predictions`;
    } else if (modelId.includes(':')) {
        body.version = modelId.split(':')[1];
    }

    // MiniMax specific fixes
    if (modelId.toLowerCase().includes('minimax')) {
        delete body.input.negative_prompt;
        body.input.prompt_optimizer = true;
        console.log("🎯 Replicate: MiniMax optimizations applied");
    }

    // Start prediction
    const startResponse = await fetch(endpoint, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
    });

    if (!startResponse.ok) {
        const errorText = await startResponse.text();
        console.error("❌ Replicate Start Error:", errorText);
        throw new Error(`Replicate: ${errorText.substring(0, 150)}`);
    }

    let prediction = await startResponse.json();

    // Poll for completion (max 60 seconds)
    const maxPolls = 60;
    let polls = 0;

    while (
        prediction.status !== 'succeeded' &&
        prediction.status !== 'failed' &&
        prediction.status !== 'canceled' &&
        polls < maxPolls
    ) {
        await new Promise(resolve => setTimeout(resolve, 1000));

        const pollResponse = await fetch(prediction.urls.get, {
            headers: { 'Authorization': `Bearer ${apiKey}` }
        });

        if (pollResponse.ok) {
            prediction = await pollResponse.json();
        }

        polls++;
    }

    // Check result
    if (prediction.status === 'succeeded') {
        let imageUrl = null;

        if (Array.isArray(prediction.output)) {
            imageUrl = prediction.output[0];
        } else if (typeof prediction.output === 'string') {
            imageUrl = prediction.output;
        }

        if (imageUrl) {
            console.log("✅ Replicate: Image generated successfully");
            return imageUrl;
        }
    }

    throw new Error(`Replicate: ${prediction.error || prediction.status || 'Failed'}`);
}

module.exports = { generateWithReplicate };
