import AIConfig from '../models/AIConfig.js';
import { uploadGeneratedImage } from '../config/cloudinary.js';

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
  } = options;

  try {
    const config = await getActiveAIConfig();

    let generatedImageUrl;

    switch (config.provider) {
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
      provider: config.provider,
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
    const error = await response.json();
    throw new Error(error.error?.message || 'MiniMax API error');
  }

  const data = await response.json();
  return data.image_url || data.data?.image_url;
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

