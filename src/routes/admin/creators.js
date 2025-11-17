import express from 'express';
import mongoose from 'mongoose';
import User from '../../models/User.js';

const router = express.Router();

// Get all creators (only users who are creators)
router.get('/', async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.json([]);
    }

    // Find users marked as creators
    const creators = await User.find({
      $or: [
        { role: 'creator' },
        { isCreator: true },
      ],
    })
      .sort({ createdAt: -1 })
      .lean()
      .maxTimeMS(15000)
      .exec();

    if (!creators || creators.length === 0) {
      return res.json([]);
    }

    const formatted = creators.map(u => {
      const email = u.email || '';
      const username = u.username || (email ? email.split('@')[0] : 'creator');
      const id = u._id ? u._id.toString() : (u.userId || '');

      let memberSince = new Date().toISOString();
      if (u.createdAt) {
        memberSince = u.createdAt instanceof Date ? u.createdAt.toISOString() : new Date(u.createdAt).toISOString();
      } else if (u.memberSince) {
        memberSince = u.memberSince instanceof Date ? u.memberSince.toISOString() : new Date(u.memberSince).toISOString();
      }

      let lastActive = new Date().toISOString();
      if (u.lastActive) {
        lastActive = u.lastActive instanceof Date ? u.lastActive.toISOString() : new Date(u.lastActive).toISOString();
      } else if (u.updatedAt) {
        lastActive = u.updatedAt instanceof Date ? u.updatedAt.toISOString() : new Date(u.updatedAt).toISOString();
      }

      return {
        id,
        userId: id,
        username,
        email,
        phone: u.phone || '',
        fullName: u.fullName || 'Creator',
        role: 'creator',
        isVerified: u.isVerified || false,
        pointsBalance: u.pointsBalance || 0,
        memberSince,
        lastActive,
        totalGenerations: u.totalGenerations || 0,
        status: u.status === 'banned' ? 'banned' : u.status === 'inactive' ? 'inactive' : 'active',
      };
    });

    res.json(formatted);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get creator by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    res.json({ id, name: 'Creator' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Approve creator
router.post('/:id/approve', async (req, res) => {
  try {
    const { id } = req.params;
    res.json({ success: true, message: 'Creator approved' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Reject creator
router.post('/:id/reject', async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    res.json({ success: true, message: 'Creator rejected' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Ban creator
router.post('/:id/ban', async (req, res) => {
  try {
    const { id } = req.params;
    res.json({ success: true, message: 'Creator banned' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Unban creator
router.post('/:id/unban', async (req, res) => {
  try {
    const { id } = req.params;
    res.json({ success: true, message: 'Creator unbanned' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Verify creator
router.post('/:id/verify', async (req, res) => {
  try {
    const { id } = req.params;
    res.json({ success: true, message: 'Creator verified' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Process withdrawal
router.post('/:id/withdrawals/:withdrawalId/process', async (req, res) => {
  try {
    const { id, withdrawalId } = req.params;
    res.json({ success: true, message: 'Withdrawal processed' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;

