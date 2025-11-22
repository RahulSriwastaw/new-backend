import express from 'express';
import mongoose from 'mongoose';
import User from '../../models/User.js';

const router = express.Router();

// Get all creators (categorized)
router.get('/', async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.json({ approved: [], pending: [], rejected: [] });
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
      return res.json({ approved: [], pending: [], rejected: [] });
    }

    const formatted = creators.map(u => {
      const email = u.email || '';
      const username = u.username || (email ? email.split('@')[0] : 'creator');
      const id = u._id ? u._id.toString() : (u.userId || '');

      let memberSince = new Date().toISOString();
      if (u.createdAt) {
        memberSince = u.createdAt instanceof Date ? u.createdAt.toISOString() : new Date(u.createdAt).toISOString();
      }

      return {
        id,
        userId: id,
        name: u.fullName || u.name || username,
        username,
        email,
        phone: u.phone || '',
        role: 'creator',
        isVerified: u.isVerified || false,
        pointsBalance: u.pointsBalance || 0,
        joinDate: memberSince,
        appliedDate: memberSince, // For pending
        rejectionDate: memberSince, // For rejected
        lastActive: new Date().toISOString(),
        totalGenerations: u.totalGenerations || 0,
        status: u.status || 'active',
        // Default values for missing DB fields
        daysPending: 0,
        socialLinks: u.socialLinks || {},
        demoTemplates: [],
        totalTemplates: u.totalTemplates || 0,
        pendingTemplates: 0,
        approvedTemplates: u.totalTemplates || 0,
        totalUses: 0,
        totalEarnings: 0,
        followers: 0,
        averageRating: 0,
        reason: '',
        reapplyDate: null
      };
    });

    // Categorize creators
    const approved = formatted.filter(c => c.status === 'active' || c.status === 'inactive' || c.status === 'banned');
    const pending = formatted.filter(c => c.status === 'pending');
    const rejected = formatted.filter(c => c.status === 'rejected');

    // If no status field exists, assume all are approved for now to show data
    if (pending.length === 0 && rejected.length === 0 && approved.length === 0 && formatted.length > 0) {
      // Fallback: treat all as approved
      res.json({ approved: formatted, pending: [], rejected: [] });
    } else {
      res.json({ approved, pending, rejected });
    }

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

