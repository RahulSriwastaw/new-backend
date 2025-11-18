import express from 'express'
import { removeBackground, upscaleImage, faceEnhance, compressImage } from '../services/quickToolsService.js'

const router = express.Router()

router.post('/remove-bg', async (req, res) => {
  try {
    const { imageUrl } = req.body || {}
    if (!imageUrl) return res.status(400).json({ error: 'imageUrl is required' })
    const resultUrl = await removeBackground(imageUrl)
    res.json({ success: true, imageUrl: resultUrl })
  } catch (error) {
    res.status(500).json({ error: error.message || 'remove-bg failed' })
  }
})

router.post('/upscale', async (req, res) => {
  try {
    const { imageUrl } = req.body || {}
    if (!imageUrl) return res.status(400).json({ error: 'imageUrl is required' })
    const resultUrl = await upscaleImage(imageUrl)
    res.json({ success: true, imageUrl: resultUrl })
  } catch (error) {
    res.status(500).json({ error: error.message || 'upscale failed' })
  }
})

router.post('/face-enhance', async (req, res) => {
  try {
    const { imageUrl } = req.body || {}
    if (!imageUrl) return res.status(400).json({ error: 'imageUrl is required' })
    const resultUrl = await faceEnhance(imageUrl)
    res.json({ success: true, imageUrl: resultUrl })
  } catch (error) {
    res.status(500).json({ error: error.message || 'face-enhance failed' })
  }
})

router.post('/compress', async (req, res) => {
  try {
    const { imageUrl } = req.body || {}
    if (!imageUrl) return res.status(400).json({ error: 'imageUrl is required' })
    const resultUrl = await compressImage(imageUrl)
    res.json({ success: true, imageUrl: resultUrl })
  } catch (error) {
    res.status(500).json({ error: error.message || 'compress failed' })
  }
})

export default router