import express from 'express';

const router = express.Router();

// Get settings
router.get('/', async (req, res) => {
  try {
    const settings = {
      appName: 'Rupantar AI',
      maintenanceMode: false,
    };
    res.json(settings);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update settings
router.put('/', async (req, res) => {
  try {
    const settings = req.body;
    res.json({ success: true, message: 'Settings updated', settings });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;

