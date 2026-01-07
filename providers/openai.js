/**
 * OpenAI DALL-E Provider
 * Supports: DALL-E 3
 */

async function generateWithOpenAI({ prompt, apiKey }) {
    console.log("🎨 OpenAI DALL-E Provider Initialized");

    const response = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            prompt,
            size: '1024x1024',
            model: 'dall-e-3',
            response_format: 'b64_json'
        })
    });

    if (!response.ok) {
        const errorText = await response.text();
        console.error("❌ OpenAI Error:", errorText);
        throw new Error(`OpenAI: ${errorText.substring(0, 150)}`);
    }

    const data = await response.json();
    const base64 = data?.data?.[0]?.b64_json;

    if (base64) {
        console.log("✅ OpenAI: Image generated successfully");
        return `data:image/png;base64,${base64}`;
    }

    throw new Error('OpenAI: No image in response');
}

module.exports = { generateWithOpenAI };
