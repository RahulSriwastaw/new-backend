import express from 'express';
import mongoose from 'mongoose';
import User from '../../models/User.js';
import Template from '../../models/Template.js';
import Creator from '../../models/Creator.js';
import Transaction from '../../models/Transaction.js';
import Generation from '../../models/Generation.js';

const router = express.Router();

// Get dashboard stats
router.get('/dashboard', async (req, res) => {
  try {
    // Check MongoDB connection
    if (mongoose.connection.readyState !== 1) {
      return res.json({
        totalUsers: 0,
        activeUsers: 0,
        newUsersToday: 0,
        totalCreators: 0,
        pendingCreators: 0,
        totalTemplates: 0,
        pendingTemplates: 0,
        totalGenerations: 0,
        monthlyRevenue: 0,
        userGrowth: [],
        generationData: [],
      });
    }

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Get counts from database
    const [
      totalUsers,
      activeUsers,
      newUsersToday,
      totalCreators,
      pendingCreators,
      totalTemplates,
      pendingTemplates,
      totalGenerations,
      monthlyRevenue,
      userGrowthData,
      generationData
    ] = await Promise.all([
      User.countDocuments().maxTimeMS(5000).catch(() => 0),
      User.countDocuments({ lastActiveAt: { $gte: thirtyDaysAgo } }).maxTimeMS(5000).catch(() => 0),
      User.countDocuments({ createdAt: { $gte: todayStart } }).maxTimeMS(5000).catch(() => 0),
      Creator.countDocuments({ status: 'active' }).maxTimeMS(5000).catch(() => 0),
      Creator.countDocuments({ status: 'pending' }).maxTimeMS(5000).catch(() => 0),
      Template.countDocuments({ isActive: true }).maxTimeMS(5000).catch(() => 0),
      Template.countDocuments({ status: 'pending' }).maxTimeMS(5000).catch(() => 0),
      Generation.countDocuments().maxTimeMS(5000).catch(() => 0),
      Transaction.aggregate([
        { $match: { type: 'purchase', status: 'success', createdAt: { $gte: monthStart } } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]).allowDiskUse(true).then(result => result[0]?.total || 0).catch(() => 0),
      // User growth data for last 30 days
      User.aggregate([
        {
          $match: {
            createdAt: { $gte: thirtyDaysAgo }
          }
        },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            count: { $sum: 1 }
          }
        },
        { $sort: { _id: 1 } }
      ]).option({ maxTimeMS: 5000 }).catch(() => []),
      // Generation data by template (top 3)
      Generation.aggregate([
        {
          $group: {
            _id: '$templateId',
            count: { $sum: 1 }
          }
        },
        { $sort: { count: -1 } },
        { $limit: 3 }
      ]).option({ maxTimeMS: 5000 }).catch(() => [])
    ]);

    // Format user growth data
    const userGrowth = userGrowthData.map(item => ({
      day: item._id,
      value: item.count || 0
    }));

    // Format generation data
    const formattedGenerationData = generationData.map((item, index) => ({
      name: `Template ${index + 1}`,
      value: item.count || 0
    }));

    // If no generation data, provide default
    if (formattedGenerationData.length === 0) {
      formattedGenerationData.push(
        { name: 'Image Generation', value: Math.floor(totalGenerations * 0.6) },
        { name: 'Template Usage', value: Math.floor(totalGenerations * 0.3) },
        { name: 'Other', value: Math.floor(totalGenerations * 0.1) }
      );
    }

    res.json({
      totalUsers,
      activeUsers,
      newUsersToday,
      totalCreators,
      pendingCreators,
      totalTemplates,
      pendingTemplates,
      totalGenerations,
      monthlyRevenue,
      userGrowth,
      generationData: formattedGenerationData,
    });
  } catch (error) {
    console.error('Dashboard stats error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get revenue analytics
router.get('/revenue', async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.json([]);
    }

    const { period = 'monthly' } = req.query;
    const now = new Date();
    let startDate;

    if (period === 'daily') {
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30);
    } else if (period === 'weekly') {
      startDate = new Date(now.getFullYear(), now.getMonth() - 12);
    } else {
      startDate = new Date(now.getFullYear(), now.getMonth() - 12);
    }

    const revenueData = await Transaction.aggregate([
      {
        $match: {
          type: 'purchase',
          status: 'success',
          createdAt: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: period === 'daily' 
            ? { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }
            : period === 'weekly'
            ? { $dateToString: { format: '%Y-W%V', date: '$createdAt' } }
            : { $dateToString: { format: '%Y-%m', date: '$createdAt' } },
          amount: { $sum: '$amount' }
        }
      },
      { $sort: { _id: 1 } }
    ]).option({ maxTimeMS: 5000 });

    const formatted = revenueData.map(item => ({
      date: item._id,
      amount: item.amount || 0,
    }));

    res.json(formatted);
  } catch (error) {
    console.error('Revenue analytics error:', error);
    res.json([]);
  }
});

// Get user growth
router.get('/users', async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.json([]);
    }

    const { period = 'monthly' } = req.query;
    const now = new Date();
    const startDate = new Date(now.getFullYear(), now.getMonth() - 12);

    const userGrowth = await User.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: period === 'daily' 
            ? { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }
            : period === 'weekly'
            ? { $dateToString: { format: '%Y-W%V', date: '$createdAt' } }
            : { $dateToString: { format: '%Y-%m', date: '$createdAt' } },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]).option({ maxTimeMS: 5000 });

    const formatted = userGrowth.map(item => ({
      date: item._id,
      count: item.count || 0,
    }));

    res.json(formatted);
  } catch (error) {
    console.error('User growth error:', error);
    res.json([]);
  }
});

// Get template performance
router.get('/templates', async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.json([]);
    }

    const templates = await Template.find({ isActive: true })
      .sort({ usageCount: -1 })
      .limit(10)
      .select('_id title usageCount')
      .maxTimeMS(5000)
      .lean();

    const formatted = templates.map(t => ({
      templateId: t._id.toString(),
      templateName: t.title,
      uses: t.usageCount || 0,
    }));

    res.json(formatted);
  } catch (error) {
    console.error('Template performance error:', error);
    res.json([]);
  }
});

// Get creator performance
router.get('/creators', async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.json([]);
    }

    const creators = await Creator.find({ status: 'active' })
      .sort({ totalEarnings: -1 })
      .limit(10)
      .select('_id name totalEarnings')
      .maxTimeMS(5000)
      .lean();

    const formatted = creators.map(c => ({
      creatorId: c._id.toString(),
      creatorName: c.name,
      earnings: c.totalEarnings || 0,
    }));

    res.json(formatted);
  } catch (error) {
    console.error('Creator performance error:', error);
    res.json([]);
  }
});

export default router;

