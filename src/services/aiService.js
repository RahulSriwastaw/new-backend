import AIConfig from '../models/AIConfig.js';
import { uploadGeneratedImage, uploadUserImage } from '../config/cloudinary.js';

export async function getActiveAIConfig() {
  try {
    const config = await AIConfig.findOne({ isActive: true });
    if (!config) {
      throw new Error('No active AI configuration found. Please configure an AI provider in admin panel.');
    }
    return config;
  } catch (error) {
    throw new Error(`Failed to get AI config: ${error.message}`);
  }
}

export async function generateImage(prompt, options = {}) {
  const {
    negativePrompt = '',
    quality = 'HD',
    aspectRatio = '1:1',
    uploadedImages = [],
    templateId = null,
    faceImageUrl = '',
    provider: forcedProvider,
    strength,
  } = options;

  try {
    const config = await getActiveAIConfig();

    let generatedImageUrl;

    const providerToUse = forcedProvider || config.provider;
    switch (providerToUse) {
      case 'openai':
      case 'dalle':
        generatedImageUrl = await generateWithOpenAI(config, prompt, negativePrompt, quality, aspectRatio);
        break;
      
      case 'stability':
        generatedImageUrl = await generateWithStabilityAI(config, prompt, negativePrompt, quality, aspectRatio);
        break;
      
      case 'google_gemini':
        generatedImageUrl = await generateWithGoogleGemini(config, prompt, negativePrompt, quality, aspectRatio);
        break;
      
      case 'minimax':
        generatedImageUrl = await generateWithMiniMax(config, prompt, negativePrompt, quality, aspectRatio);
        break;
      case 'minimax_i2i':
        generatedImageUrl = await generateWithMiniMaxI2I(config, prompt, negativePrompt, faceImageUrl, strength);
        break;
      
      case 'custom':
        generatedImageUrl = await generateWithCustomAPI(config, prompt, negativePrompt, quality, aspectRatio);
        break;
      
      default:
        throw new Error(`Unsupported AI provider: ${config.provider}`);
    }

    const cloudinaryResult = await uploadGeneratedImage(generatedImageUrl, 'generated-images');
    
    return {
      imageUrl: cloudinaryResult.secure_url,
      publicId: cloudinaryResult.public_id,
      provider: providerToUse,
      model: config.name,
    };
  } catch (error) {
    console.error('Image generation error:', error);
    throw new Error(`Image generation failed: ${error.message}`);
  }
}

async function generateWithOpenAI(config, prompt, negativePrompt, quality, aspectRatio) {
  const { apiKey, organizationId, modelVersion = 'dall-e-3' } = config;
  
  const sizeMap = {
    '1:1': '1024x1024',
    '16:9': '1792x1024',
    '9:16': '1024x1792',
    '4:3': '1024x1024',
    '3:4': '1024x1024',
  };

  const qualityMap = {
    'SD': 'standard',
    'HD': 'hd',
    'UHD': 'hd',
    '2K': 'hd',
    '4K': 'hd',
    '8K': 'hd',
  };

  const headers = {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };

  if (organizationId) {
    headers['OpenAI-Organization'] = organizationId;
  }

  const response = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: modelVersion,
      prompt: prompt,
      n: 1,
      size: sizeMap[aspectRatio] || '1024x1024',
      quality: qualityMap[quality] || 'hd',
      response_format: 'url',
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'OpenAI API error');
  }

  const data = await response.json();
  return data.data[0].url;
}

async function generateWithStabilityAI(config, prompt, negativePrompt, quality, aspectRatio) {
  const { apiKey, modelVersion = 'stable-diffusion-xl-1024-v1-0' } = config;
  
  const sizeMap = {
    '1:1': { width: 1024, height: 1024 },
    '16:9': { width: 1344, height: 768 },
    '9:16': { width: 768, height: 1344 },
    '4:3': { width: 1024, height: 768 },
    '3:4': { width: 768, height: 1024 },
  };

  const response = await fetch(`https://api.stability.ai/v1/generation/${modelVersion}/text-to-image`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text_prompts: [
        { text: prompt, weight: 1 },
        ...(negativePrompt ? [{ text: negativePrompt, weight: -1 }] : []),
      ],
      cfg_scale: 7,
      height: sizeMap[aspectRatio]?.height || 1024,
      width: sizeMap[aspectRatio]?.width || 1024,
      steps: quality === 'UHD' || quality === '4K' || quality === '8K' ? 50 : 30,
      samples: 1,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Stability AI API error');
  }

  const data = await response.json();
  const imageBase64 = data.artifacts[0].base64;
  return `data:image/png;base64,${imageBase64}`;
}

async function generateWithGoogleGemini(config, prompt, negativePrompt, quality, aspectRatio) {
  const { apiKey, projectId } = config;
  
  if (!projectId) {
    throw new Error('Project ID is required for Google Gemini');
  }

  const sizeMap = {
    '1:1': '1024x1024',
    '16:9': '1024x576',
    '9:16': '576x1024',
    '4:3': '1024x768',
    '3:4': '768x1024',
  };

  const url = `https://us-central1-aiplatform.googleapis.com/v1/projects/${projectId}/locations/us-central1/publishers/google/models/imagegeneration:predict`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      instances: [{
        prompt: prompt,
        ...(negativePrompt && { negative_prompt: negativePrompt }),
      }],
      parameters: {
        sampleCount: 1,
        aspectRatio: sizeMap[aspectRatio] || '1:1',
        safetyFilterLevel: 'block_some',
        personGeneration: 'allow_all',
      },
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'Google Gemini API error');
  }

  const data = await response.json();
  return data.predictions[0].bytesBase64Encoded 
    ? `data:image/png;base64,${data.predictions[0].bytesBase64Encoded}`
    : data.predictions[0].imageUri;
}

async function generateWithMiniMax(config, prompt, negativePrompt, quality, aspectRatio) {
  const { apiKey, endpoint = 'https://api.minimax.chat/v1/text_to_image' } = config;
  
  const sizeMap = {
    '1:1': '1:1',
    '16:9': '16:9',
    '9:16': '9:16',
    '4:3': '4:3',
    '3:4': '3:4',
  };

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'abab6.5s',
      prompt: prompt,
      negative_prompt: negativePrompt || '',
      aspect_ratio: sizeMap[aspectRatio] || '1:1',
      quality: quality === 'UHD' || quality === '4K' || quality === '8K' ? 'high' : 'standard',
    }),
  });

  if (!response.ok) {
    let errorText = '';
    try {
      const errJson = await response.json();
      errorText = errJson.error?.message || errJson.message || '';
    } catch {
      try { errorText = await response.text(); } catch { /* ignore */ }
    }
    throw new Error(errorText || 'MiniMax API error');
  }

  const contentType = (response.headers.get('content-type') || '').toLowerCase();
  if (contentType.includes('application/json')) {
    const data = await response.json();
    return data.image_url || data.data?.image_url || data.url;
  }
  if (contentType.startsWith('image/') || contentType.includes('octet-stream')) {
    const buffer = Buffer.from(await response.arrayBuffer());
    const mime = contentType.startsWith('image/') ? contentType : 'image/png';
    return `data:${mime};base64,${buffer.toString('base64')}`;
  }
  const text = await response.text().catch(() => '');
  if (text.startsWith('http://') || text.startsWith('https://') || text.startsWith('data:image')) {
    return text;
  }
  throw new Error(text || 'MiniMax response format not recognized');
}

async function generateWithMiniMaxI2I(config, prompt, negativePrompt, faceImageUrl, strengthOverride) {
  const { apiKey, endpoint = 'https://api.minimax.chat/v1/image/i2i' } = config;
  const strength = typeof strengthOverride === 'number' ? strengthOverride : (config.strength ?? 0.6);

  let referenceUrl = faceImageUrl || '';
  if (!referenceUrl) {
    throw new Error('faceImageUrl is required for MiniMax I2I');
  }
  if (!referenceUrl.startsWith('http')) {
    const uploaded = await uploadUserImage(referenceUrl, 'i2i/reference');
    referenceUrl = uploaded.secure_url;
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify({
      prompt,
      image_url: referenceUrl,
      size: '1024x1024',
      strength,
      model: 'image-01',
      negative_prompt: negativePrompt || '',
    }),
  });

  if (!response.ok) {
    let errorText = '';
    try { const errJson = await response.json(); errorText = errJson.error?.message || errJson.message || ''; }
    catch { try { errorText = await response.text(); } catch { /* ignore */ } }
    throw new Error(errorText || 'MiniMax I2I API error');
  }

  const contentType = (response.headers.get('content-type') || '').toLowerCase();
  if (contentType.includes('application/json')) {
    const data = await response.json();
    const url = data.image_url || data.url || data.data?.image_url || data.data?.url;
    if (!url) throw new Error('MiniMax I2I JSON response missing image url');
    const uploaded = await uploadGeneratedImage(url, 'generated-images/i2i');
    return uploaded.secure_url;
  }
  if (contentType.startsWith('image/') || contentType.includes('octet-stream')) {
    const buffer = Buffer.from(await response.arrayBuffer());
    const mime = contentType.startsWith('image/') ? contentType : 'image/png';
    const dataUrl = `data:${mime};base64,${buffer.toString('base64')}`;
    const uploaded = await uploadGeneratedImage(dataUrl, 'generated-images/i2i');
    return uploaded.secure_url;
  }
  const text = await response.text().catch(() => '');
  throw new Error(text || 'MiniMax I2I response format not recognized');
}

async function generateWithCustomAPI(config, prompt, negativePrompt, quality, aspectRatio) {
  const { endpoint, apiKey, settings = {} } = config;
  
  if (!endpoint) {
    throw new Error('Custom API endpoint is required');
  }

  const requestBody = {
    prompt,
    ...(negativePrompt && { negative_prompt: negativePrompt }),
    quality,
    aspect_ratio: aspectRatio,
    ...settings,
  };

  const headers = {
    'Content-Type': 'application/json',
    ...(apiKey && { 'Authorization': `Bearer ${apiKey}` }),
    ...(settings.headers || {}),
  };

  const response = await fetch(endpoint, {
    method: settings.method || 'POST',
    headers,
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Custom API error' }));
    throw new Error(error.message || 'Custom API error');
  }

  const data = await response.json();
  
  return data.image_url || data.url || data.image || data.data?.url || data.data?.image;
}

