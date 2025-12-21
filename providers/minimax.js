/**
 * MiniMax Official API Provider
 * Direct integration with MiniMax API (with async polling)
 */

async function generateWithMiniMax({ prompt, uploadedImages, apiKey, modelConfig, aspectRatio }) {
    console.log("🚀 MiniMax Official Provider Initialized");

    // MiniMax Aspect Ratio Mapping
    // Usually supports "1:1", "16:9", "9:16", "4:3", "3:4"
    let targetAspectRatio = "1:1";
    if (aspectRatio && ["16:9", "9:16", "4:3", "3:4"].includes(aspectRatio)) {
        targetAspectRatio = aspectRatio;
    }

    const body = {
        prompt,
        model: modelConfig?.model || "image-01",
        aspect_ratio: targetAspectRatio, 
        response_format: "url" // Get URLs (valid 24h)
    };

    // Add subject reference for I2I (face preservation)
    if (uploadedImages && uploadedImages.length > 0) {
        body.subject_reference = [{
            type: 'character',
            image_file: uploadedImages[0],
            strength: 0.8  // Higher strength (0.6-1.0) = better face matching
        }];

        // Add face preservation instruction to prompt
        const facePreservationPrefix = "Preserve the exact 100% same person's face, from the reference image. ";
        body.prompt = facePreservationPrefix + prompt;

        console.log("📸 MiniMax I2I: Subject reference attached with high strength (1)");
    }

    // Step 1: Submit generation task
    const submitResponse = await fetch('https://api.minimax.io/v1/image_generation', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify(body)
    });

    if (!submitResponse.ok) {
        const errorText = await submitResponse.text();
        console.error("❌ MiniMax Submit Error:", errorText);
        throw new Error(`MiniMax Submit: ${errorText.substring(0, 150)}`);
    }

    const submitData = await submitResponse.json();
    console.log("📋 MiniMax Task Submitted:", JSON.stringify(submitData).substring(0, 200));

    // Check if response contains immediate result (some endpoints return directly)
    if (submitData.data?.image_urls?.[0]) {
        console.log("✅ MiniMax: Image generated immediately");
        return submitData.data.image_urls[0];
    }

    // Step 2: Extract task ID for polling
    const taskId = submitData.id || submitData.task_id || submitData.imageId;

    if (!taskId) {
        // Try to extract image URL from various response formats
        let imageUrl = null;
        if (submitData.url) imageUrl = submitData.url;
        else if (submitData.data?.url) imageUrl = submitData.data.url;
        else if (submitData.data?.[0]?.url) imageUrl = submitData.data[0].url;
        else if (submitData.image_urls?.[0]) imageUrl = submitData.image_urls[0];
        else if (submitData.base64) imageUrl = `data:image/png;base64,${submitData.base64}`;

        if (imageUrl) {
            console.log("✅ MiniMax: Image URL found in submit response");
            return imageUrl;
        }

        throw new Error(`MiniMax: No task_id or image in response - ${JSON.stringify(submitData).substring(0, 200)}`);
    }

    // Step 3: Poll for completion
    console.log(`⏳ MiniMax: Polling for task ${taskId}`);
    const maxPolls = 60; // 60 seconds max
    let polls = 0;

    while (polls < maxPolls) {
        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second

        const pollResponse = await fetch(`https://api.minimax.io/v1/images/${taskId}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${apiKey}`
            }
        });

        if (!pollResponse.ok) {
            console.warn(`⚠️ MiniMax Poll failed (attempt ${polls + 1})`);
            polls++;
            continue;
        }

        const pollData = await pollResponse.json();
        const status = pollData.status || pollData.base_resp?.status_msg;

        console.log(`🔄 MiniMax Poll #${polls + 1}: ${status}`);

        if (status === 'success' || status === 'Success' || pollData.base_resp?.status_code === 0) {
            // Extract image URL
            let imageUrl = null;
            if (pollData.data?.image_urls?.[0]) imageUrl = pollData.data.image_urls[0];
            else if (pollData.image_urls?.[0]) imageUrl = pollData.image_urls[0];
            else if (pollData.url) imageUrl = pollData.url;
            else if (pollData.data?.url) imageUrl = pollData.data.url;
            else if (pollData.base64) imageUrl = `data:image/png;base64,${pollData.base64}`;

            if (imageUrl) {
                console.log("✅ MiniMax: Image generated successfully");
                return imageUrl;
            } else {
                throw new Error(`MiniMax: Success but no image URL - ${JSON.stringify(pollData).substring(0, 200)}`);
            }
        } else if (status === 'failed' || status === 'Failed') {
            throw new Error(`MiniMax: Generation failed - ${pollData.message || 'Unknown error'}`);
        }

        polls++;
    }

    throw new Error(`MiniMax: Timeout after ${maxPolls} seconds`);
}

module.exports = { generateWithMiniMax };

