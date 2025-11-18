import AIConfig from '../models/AIConfig.js'
import { uploadGeneratedImage } from '../config/cloudinary.js'

async function getActiveQuickToolsConfig() {
  const config = await AIConfig.findOne({ provider: 'quick_tools', isActive: true })
  if (!config) throw new Error('No active quick_tools configuration found')
  return config
}

export async function removeBackground(imageUrl) {
  const config = await getActiveQuickToolsConfig()
  const { backgroundRemovalAPIKey, removeBgEndpoint } = config.settings || {}
  if (!removeBgEndpoint || !backgroundRemovalAPIKey) throw new Error('Quick Tools remove-bg not configured')

  const res = await fetch(removeBgEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${backgroundRemovalAPIKey}`,
    },
    body: JSON.stringify({ imageUrl }),
  })
  if (!res.ok) {
    const err = await res.text().catch(()=> 'remove-bg error')
    throw new Error(err)
  }
  const data = await res.json().catch(()=>({ imageUrl }))
  const url = data.imageUrl || data.url || imageUrl
  const uploaded = await uploadGeneratedImage(url, 'tools/remove-bg')
  return uploaded.secure_url
}

export async function upscaleImage(imageUrl) {
  const config = await getActiveQuickToolsConfig()
  const { upscaleAPIKey, upscaleEndpoint } = config.settings || {}
  if (!upscaleEndpoint || !upscaleAPIKey) throw new Error('Quick Tools upscale not configured')

  const res = await fetch(upscaleEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${upscaleAPIKey}`,
    },
    body: JSON.stringify({ imageUrl }),
  })
  if (!res.ok) {
    const err = await res.text().catch(()=> 'upscale error')
    throw new Error(err)
  }
  const data = await res.json().catch(()=>({ imageUrl }))
  const url = data.imageUrl || data.url || imageUrl
  const uploaded = await uploadGeneratedImage(url, 'tools/upscale')
  return uploaded.secure_url
}

export async function faceEnhance(imageUrl) {
  const config = await getActiveQuickToolsConfig()
  const { faceEnhanceAPIKey, faceEnhanceEndpoint } = config.settings || {}
  if (!faceEnhanceEndpoint || !faceEnhanceAPIKey) throw new Error('Quick Tools face-enhance not configured')

  const res = await fetch(faceEnhanceEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${faceEnhanceAPIKey}`,
    },
    body: JSON.stringify({ imageUrl }),
  })
  if (!res.ok) {
    const err = await res.text().catch(()=> 'face-enhance error')
    throw new Error(err)
  }
  const data = await res.json().catch(()=>({ imageUrl }))
  const url = data.imageUrl || data.url || imageUrl
  const uploaded = await uploadGeneratedImage(url, 'tools/face-enhance')
  return uploaded.secure_url
}

export async function compressImage(imageUrl) {
  const config = await getActiveQuickToolsConfig()
  const { compressionAPIKey, compressionEndpoint } = config.settings || {}
  if (!compressionEndpoint || !compressionAPIKey) throw new Error('Quick Tools compress not configured')

  const res = await fetch(compressionEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${compressionAPIKey}`,
    },
    body: JSON.stringify({ imageUrl }),
  })
  if (!res.ok) {
    const err = await res.text().catch(()=> 'compress error')
    throw new Error(err)
  }
  const data = await res.json().catch(()=>({ imageUrl }))
  const url = data.imageUrl || data.url || imageUrl
  const uploaded = await uploadGeneratedImage(url, 'tools/compress')
  return uploaded.secure_url
}

export default {
  removeBackground,
  upscaleImage,
  faceEnhance,
  compressImage,
}