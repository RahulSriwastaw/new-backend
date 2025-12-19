/**
 * Creator Profile Management API Routes
 * Provides comprehensive admin access to creator profiles, earnings, withdrawals, etc.
 */

const express = require('express');
const router = express.Router();
const {
    User,
    Template,
    CreatorEarning,
    Withdrawal,
    CreatorApplication,
    CreatorStatsCache,
    Follower,
    TemplateSave,
    AdminActionLog,
    FinanceConfig
} = require('./models');

// Helper function to calculate creator stats
async function calculateCreatorStats(creatorId) {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);

    // Get all templates by creator
    const templates = await Template.find({ creatorId });
    const templateIds = templates.map(t => t._id);

    // Calculate totals
    const totalTemplates = templates.length;
    const totalUses = templates.reduce((sum, t) => sum + (t.useCount || 0), 0);
    const totalLikes = templates.reduce((sum, t) => sum + (t.likeCount || 0), 0);
    const totalSaves = templates.reduce((sum, t) => sum + (t.savesCount || 0), 0);

    // Get earnings
    const allEarnings = await CreatorEarning.find({ creatorId });
    const totalEarnings = allEarnings.reduce((sum, e) => sum + (e.pointsEarned || 0), 0);

    const thisMonthEarnings = allEarnings
        .filter(e => new Date(e.date) >= startOfMonth)
        .reduce((sum, e) => sum + (e.pointsEarned || 0), 0);

    const lastMonthEarnings = allEarnings
        .filter(e => new Date(e.date) >= startOfLastMonth && new Date(e.date) <= endOfLastMonth)
        .reduce((sum, e) => sum + (e.pointsEarned || 0), 0);

    // Get pending withdrawals
    const pendingWithdrawals = await Withdrawal.find({ creatorId, status: 'pending' });
    const pendingWithdrawal = pendingWithdrawals.reduce((sum, w) => sum + w.amount, 0);

    // Get followers
    const totalFollowers = await Follower.countDocuments({ followingId: creatorId });

    // Get finance config for INR conversion
    const financeConfig = await FinanceConfig.findOne() || { creatorPayoutPerPoint: 0.10 };
    const totalEarningsINR = totalEarnings * financeConfig.creatorPayoutPerPoint;

    return {
        totalTemplates,
        totalUses,
        totalFollowers,
        totalLikes,
        totalSaves,
        totalEarnings,
        totalEarningsINR,
        thisMonthEarnings: thisMonthEarnings * financeConfig.creatorPayoutPerPoint,
        lastMonthEarnings: lastMonthEarnings * financeConfig.creatorPayoutPerPoint,
        pendingWithdrawal,
        rank: 0, // TODO: Calculate based on earnings ranking
        lastUpdated: new Date()
    };
}

// Log admin action
async function logAdminAction(adminId, adminName, targetType, targetId, action, details, metadata = {}) {
    try {
        await AdminActionLog.create({
            adminId,
            adminName,
            targetType,
            targetId,
            action,
            details,
            metadata,
            timestamp: new Date()
        });
    } catch (err) {
        console.error('Failed to log admin action:', err);
    }
}

// ============================================
// 1. GET Creator Full Profile
// ============================================
router.get('/:creatorId/profile', async (req, res) => {
    try {
        const { creatorId } = req.params;

        // Fetch creator user data
        const creator = await User.findById(creatorId);
        if (!creator) {
            return res.status(404).json({ error: 'Creator not found' });
        }

        // Get or calculate stats
        let stats = await CreatorStatsCache.findOne({ creatorId });
        if (!stats || (new Date() - new Date(stats.lastUpdated)) > 3600000) {
            // Recalculate if cache is old (> 1 hour)
            const calculatedStats = await calculateCreatorStats(creatorId);
            stats = await CreatorStatsCache.findOneAndUpdate(
                { creatorId },
                calculatedStats,
                { upsert: true, new: true }
            );
        }

        // Get payment details from application
        const application = await CreatorApplication.findOne({ userId: creatorId });
        const paymentDetails = application?.paymentDetails || null;

        // Get recent activity (last 10 actions)
        const recentActivity = await AdminActionLog.find({
            targetType: 'creator',
            targetId: creatorId
        })
            .sort({ timestamp: -1 })
            .limit(10);

        res.json({
            creator: {
                id: creator._id,
                name: creator.name,
                email: creator.email,
                username: creator.username || creator.email.split('@')[0],
                photoURL: creator.photoURL,
                status: creator.status,
                isVerified: creator.isVerified,
                isWalletFrozen: creator.isWalletFrozen,
                joinedDate: creator.joinedDate,
                suspensionReason: creator.suspensionReason,
                suspendedUntil: creator.suspendedUntil
            },
            stats: {
                totalTemplates: stats.totalTemplates,
                totalUses: stats.totalUses,
                totalFollowers: stats.totalFollowers,
                totalLikes: stats.totalLikes,
                totalSaves: stats.totalSaves,
                totalEarnings: stats.totalEarnings,
                totalEarningsINR: stats.totalEarningsINR,
                thisMonthEarnings: stats.thisMonthEarnings,
                lastMonthEarnings: stats.lastMonthEarnings,
                pendingWithdrawal: stats.pendingWithdrawal,
                rank: stats.rank
            },
            paymentDetails,
            recentActivity: recentActivity.map(log => ({
                date: log.timestamp,
                action: log.action,
                details: log.details,
                adminName: log.adminName
            }))
        });
    } catch (err) {
        console.error('Error fetching creator profile:', err);
        res.status(500).json({ error: 'Server error', message: err.message });
    }
});

// ============================================
// 2. GET Creator Templates (Paginated)
// ============================================
router.get('/:creatorId/templates', async (req, res) => {
    try {
        const { creatorId } = req.params;
        const { page = 1, limit = 20, status, sort = '-createdAt' } = req.query;

        const query = { creatorId };
        if (status && status !== 'all') {
            if (status === 'paused') {
                query.isPaused = true;
            } else {
                query.approvalStatus = status;
            }
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const templates = await Template.find(query)
            .sort(sort)
            .skip(skip)
            .limit(parseInt(limit));

        const total = await Template.countDocuments(query);

        res.json({
            templates: templates.map(t => ({
                id: t._id,
                title: t.title,
                imageUrl: t.imageUrl,
                category: t.category,
                isPremium: t.isPremium,
                pointsCost: t.pointsCost,
                useCount: t.useCount,
                likeCount: t.likeCount,
                savesCount: t.savesCount,
                earningsGenerated: t.earningsGenerated,
                approvalStatus: t.approvalStatus,
                isPaused: t.isPaused,
                status: t.status,
                createdAt: t.createdAt,
                rejectionReason: t.rejectionReason,
                adminNotes: t.adminNotes
            })),
            pagination: {
                total,
                page: parseInt(page),
                pages: Math.ceil(total / parseInt(limit)),
                limit: parseInt(limit)
            }
        });
    } catch (err) {
        console.error('Error fetching creator templates:', err);
        res.status(500).json({ error: 'Server error', message: err.message });
    }
});

// ============================================
// 3. GET Creator Earnings Analytics
// ============================================
router.get('/:creatorId/earnings', async (req, res) => {
    try {
        const { creatorId } = req.params;

        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);

        // Get all earnings
        const allEarnings = await CreatorEarning.find({ creatorId }).sort({ date: 1 });

        // Calculate totals
        const financeConfig = await FinanceConfig.findOne() || { creatorPayoutPerPoint: 0.10 };
        const totalLifetime = allEarnings.reduce((sum, e) => sum + (e.pointsEarned || 0), 0) * financeConfig.creatorPayoutPerPoint;

        const thisMonth = allEarnings
            .filter(e => new Date(e.date) >= startOfMonth)
            .reduce((sum, e) => sum + (e.pointsEarned || 0), 0) * financeConfig.creatorPayoutPerPoint;

        const lastMonth = allEarnings
            .filter(e => new Date(e.date) >= startOfLastMonth && new Date(e.date) <= endOfLastMonth)
            .reduce((sum, e) => sum + (e.pointsEarned || 0), 0) * financeConfig.creatorPayoutPerPoint;

        // Get pending withdrawals
        const pendingWithdrawals = await Withdrawal.find({ creatorId, status: 'pending' });
        const pendingWithdrawal = pendingWithdrawals.reduce((sum, w) => sum + w.amount, 0);

        // Daily earnings for chart (last 30 days)
        const last30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        const dailyEarnings = {};
        allEarnings
            .filter(e => new Date(e.date) >= last30Days)
            .forEach(e => {
                const dateKey = new Date(e.date).toISOString().split('T')[0];
                dailyEarnings[dateKey] = (dailyEarnings[dateKey] || 0) + (e.pointsEarned || 0) * financeConfig.creatorPayoutPerPoint;
            });

        const chartData = {
            daily: Object.keys(dailyEarnings).map(date => ({
                date,
                earnings: dailyEarnings[date]
            }))
        };

        // Template-wise breakdown
        const templateEarnings = {};
        allEarnings.forEach(e => {
            const tid = e.templateId.toString();
            if (!templateEarnings[tid]) {
                templateEarnings[tid] = {
                    templateId: e.templateId,
                    templateName: e.templateName || 'Unknown',
                    uses: 0,
                    pointsEarned: 0
                };
            }
            templateEarnings[tid].uses += e.usageCount || 1;
            templateEarnings[tid].pointsEarned += e.pointsEarned || 0;
        });

        const templateBreakdown = Object.values(templateEarnings).map(t => {
            const earnedINR = t.pointsEarned * financeConfig.creatorPayoutPerPoint;
            const platformCommission = earnedINR * 0.20; // Assuming 20% commission
            return {
                templateId: t.templateId,
                templateName: t.templateName,
                uses: t.uses,
                pointsEarned: t.pointsEarned,
                platformCommission,
                netEarnings: earnedINR - platformCommission
            };
        });

        res.json({
            summary: {
                totalLifetime,
                thisMonth,
                lastMonth,
                pendingWithdrawal
            },
            chartData,
            templateBreakdown: templateBreakdown.sort((a, b) => b.netEarnings - a.netEarnings)
        });
    } catch (err) {
        console.error('Error fetching creator earnings:', err);
        res.status(500).json({ error: 'Server error', message: err.message });
    }
});

// ============================================
// 4. GET Creator Withdrawals
// ============================================
router.get('/:creatorId/withdrawals', async (req, res) => {
    try {
        const { creatorId } = req.params;

        const withdrawals = await Withdrawal.find({ creatorId })
            .populate('processedBy', 'name email')
            .sort({ requestedAt: -1 });

        const stats = {
            totalRequests: withdrawals.length,
            pending: withdrawals.filter(w => w.status === 'pending').length,
            processing: withdrawals.filter(w => w.status === 'processing').length,
            completed: withdrawals.filter(w => w.status === 'completed').length,
            rejected: withdrawals.filter(w => w.status === 'rejected').length,
            totalWithdrawn: withdrawals
                .filter(w => w.status === 'completed')
                .reduce((sum, w) => sum + w.amount, 0)
        };

        res.json({
            withdrawals: withdrawals.map(w => ({
                id: w._id,
                amount: w.amount,
                method: w.method,
                status: w.status,
                requestedAt: w.requestedAt,
                processedAt: w.processedAt,
                transactionId: w.transactionId,
                utr: w.utr,
                remarks: w.remarks,
                adminNotes: w.adminNotes,
                proofOfPayment: w.proofOfPayment,
                bankDetails: w.method === 'bank' ? w.bankDetails : null,
                upiId: w.method === 'upi' ? w.upiId : null,
                processedBy: w.processedBy ? {
                    id: w.processedBy._id,
                    name: w.processedBy.name,
                    email: w.processedBy.email
                } : null
            })),
            stats
        });
    } catch (err) {
        console.error('Error fetching withdrawals:', err);
        res.status(500).json({ error: 'Server error', message: err.message });
    }
});

// ============================================
// 5. POST Approve Withdrawal
// ============================================
router.post('/:creatorId/withdrawals/:withdrawalId/approve', async (req, res) => {
    try {
        const { creatorId, withdrawalId } = req.params;
        const { transactionId, utr, proofUrl, adminNotes } = req.body;
        const adminId = req.user?.id || 'admin'; // From auth middleware
        const adminName = req.user?.name || 'Admin';

        const withdrawal = await Withdrawal.findOne({ _id: withdrawalId, creatorId });
        if (!withdrawal) {
            return res.status(404).json({ error: 'Withdrawal request not found' });
        }

        if (withdrawal.status !== 'pending' && withdrawal.status !== 'processing') {
            return res.status(400).json({ error: 'Withdrawal already processed' });
        }

        // Update withdrawal
        withdrawal.status = 'completed';
        withdrawal.processedAt = new Date();
        withdrawal.transactionId = transactionId;
        withdrawal.utr = utr;
        withdrawal.proofOfPayment = proofUrl;
        withdrawal.adminNotes = adminNotes;
        withdrawal.processedBy = adminId;
        await withdrawal.save();

        // Update creator pending earnings
        const creator = await User.findById(creatorId);
        if (creator) {
            creator.pendingEarnings = Math.max(0, (creator.pendingEarnings || 0) - withdrawal.amount);
            await creator.save();
        }

        // Log action
        await logAdminAction(
            adminId,
            adminName,
            'withdrawal',
            withdrawalId,
            'approved_withdrawal',
            `Approved withdrawal of ₹${withdrawal.amount}`,
            { transactionId, utr, amount: withdrawal.amount }
        );

        res.json({ success: true, message: 'Withdrawal approved successfully', withdrawal });
    } catch (err) {
        console.error('Error approving withdrawal:', err);
        res.status(500).json({ error: 'Server error', message: err.message });
    }
});

// ============================================
// 6. POST Reject Withdrawal
// ============================================
router.post('/:creatorId/withdrawals/:withdrawalId/reject', async (req, res) => {
    try {
        const { creatorId, withdrawalId } = req.params;
        const { reason, adminNotes } = req.body;
        const adminId = req.user?.id || 'admin';
        const adminName = req.user?.name || 'Admin';

        const withdrawal = await Withdrawal.findOne({ _id: withdrawalId, creatorId });
        if (!withdrawal) {
            return res.status(404).json({ error: 'Withdrawal request not found' });
        }

        withdrawal.status = 'rejected';
        withdrawal.processedAt = new Date();
        withdrawal.remarks = reason;
        withdrawal.adminNotes = adminNotes;
        withdrawal.processedBy = adminId;
        await withdrawal.save();

        // Log action
        await logAdminAction(
            adminId,
            adminName,
            'withdrawal',
            withdrawalId,
            'rejected_withdrawal',
            `Rejected withdrawal of ₹${withdrawal.amount}: ${reason}`,
            { reason, amount: withdrawal.amount }
        );

        res.json({ success: true, message: 'Withdrawal rejected', withdrawal });
    } catch (err) {
        console.error('Error rejecting withdrawal:', err);
        res.status(500).json({ error: 'Server error', message: err.message });
    }
});

// ============================================
// 7. GET Followers & Engagement
// ============================================
router.get('/:creatorId/followers', async (req, res) => {
    try {
        const { creatorId } = req.params;

        const totalFollowers = await Follower.countDocuments({ followingId: creatorId });

        // Get follower growth (last 30 days)
        const last30Days = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const followers = await Follower.find({
            followingId: creatorId,
            followedAt: { $gte: last30Days }
        }).sort({ followedAt: 1 });

        const growthData = {};
        followers.forEach(f => {
            const dateKey = new Date(f.followedAt).toISOString().split('T')[0];
            growthData[dateKey] = (growthData[dateKey] || 0) + 1;
        });

        // Get top followers (most active users)
        const topFollowers = await Follower.find({ followingId: creatorId })
            .populate('followerId', 'name email photoURL')
            .sort({ followedAt: -1 })
            .limit(10);

        res.json({
            totalFollowers,
            growthData: Object.keys(growthData).map(date => ({
                date,
                count: growthData[date]
            })),
            topFollowers: topFollowers.map(f => f.followerId)
        });
    } catch (err) {
        console.error('Error fetching followers:', err);
        res.status(500).json({ error: 'Server error', message: err.message });
    }
});

// ============================================
// 8. GET Engagement Metrics
// ============================================
router.get('/:creatorId/engagement', async (req, res) => {
    try {
        const { creatorId } = req.params;

        const templates = await Template.find({ creatorId });

        // Calculate engagement rate
        const totalViews = templates.reduce((sum, t) => sum + (t.viewCount || 0), 0);
        const totalEngagements = templates.reduce((sum, t) =>
            sum + (t.likeCount || 0) + (t.savesCount || 0) + (t.useCount || 0), 0
        );
        const engagementRate = totalViews > 0 ? (totalEngagements / totalViews * 100).toFixed(2) : 0;

        // Top performing templates
        const topPerformingTemplates = templates
            .map(t => ({
                id: t._id,
                title: t.title,
                imageUrl: t.imageUrl,
                useCount: t.useCount,
                likeCount: t.likeCount,
                savesCount: t.savesCount,
                viewCount: t.viewCount,
                score: (t.useCount * 3) + (t.likeCount * 2) + t.savesCount
            }))
            .sort((a, b) => b.score - a.score)
            .slice(0, 10);

        res.json({
            engagementRate: parseFloat(engagementRate),
            topPerformingTemplates
        });
    } catch (err) {
        console.error('Error fetching engagement:', err);
        res.status(500).json({ error: 'Server error', message: err.message });
    }
});

// ============================================
// 9. GET Activity Logs
// ============================================
router.get('/:creatorId/activity-logs', async (req, res) => {
    try {
        const { creatorId } = req.params;
        const { type, limit = 50 } = req.query;

        const query = {
            $or: [
                { targetType: 'creator', targetId: creatorId },
                { targetType: 'user', targetId: creatorId }
            ]
        };

        const logs = await AdminActionLog.find(query)
            .sort({ timestamp: -1 })
            .limit(parseInt(limit));

        // Also get creator's own activities
        const templates = await Template.find({ creatorId }).select('_id createdAt title');
        const withdrawals = await Withdrawal.find({ creatorId }).select('_id requestedAt amount status');
        const earnings = await CreatorEarning.find({ creatorId }).select('_id date templateName pointsEarned');

        const activities = [];

        // Add admin actions
        logs.forEach(log => {
            activities.push({
                date: log.timestamp,
                type: 'admin_action',
                description: `Admin ${log.adminName}: ${log.details || log.action}`,
                metadata: log.metadata
            });
        });

        // Add template uploads
        templates.forEach(t => {
            activities.push({
                date: t.createdAt,
                type: 'template_upload',
                description: `Uploaded new template: ${t.title}`,
                metadata: { templateId: t._id }
            });
        });

        // Add withdrawal requests
        withdrawals.forEach(w => {
            activities.push({
                date: w.requestedAt,
                type: 'withdrawal_request',
                description: `Requested withdrawal of ₹${w.amount} (${w.status})`,
                metadata: { withdrawalId: w._id, amount: w.amount, status: w.status }
            });
        });

        // Sort all activities by date
        activities.sort((a, b) => new Date(b.date) - new Date(a.date));

        res.json({
            logs: activities.slice(0, parseInt(limit))
        });
    } catch (err) {
        console.error('Error fetching activity logs:', err);
        res.status(500).json({ error: 'Server error', message: err.message });
    }
});

// ============================================
// 10. POST Suspend Creator
// ============================================
router.post('/:creatorId/suspend', async (req, res) => {
    try {
        const { creatorId } = req.params;
        const { reason, duration } = req.body; // duration in days
        const adminId = req.user?.id || 'admin';
        const adminName = req.user?.name || 'Admin';

        const creator = await User.findById(creatorId);
        if (!creator) {
            return res.status(404).json({ error: 'Creator not found' });
        }

        creator.status = 'suspended';
        creator.suspensionReason = reason;
        if (duration) {
            creator.suspendedUntil = new Date(Date.now() + duration * 24 * 60 * 60 * 1000);
        }
        await creator.save();

        await logAdminAction(
            adminId,
            adminName,
            'creator',
            creatorId,
            'suspended_creator',
            `Suspended creator: ${reason}`,
            { reason, duration }
        );

        res.json({ success: true, message: 'Creator suspended', creator });
    } catch (err) {
        console.error('Error suspending creator:', err);
        res.status(500).json({ error: 'Server error', message: err.message });
    }
});

// ============================================
// 11. POST Unsuspend Creator
// ============================================
router.post('/:creatorId/unsuspend', async (req, res) => {
    try {
        const { creatorId } = req.params;
        const adminId = req.user?.id || 'admin';
        const adminName = req.user?.name || 'Admin';

        const creator = await User.findById(creatorId);
        if (!creator) {
            return res.status(404).json({ error: 'Creator not found' });
        }

        creator.status = 'active';
        creator.suspensionReason = null;
        creator.suspendedUntil = null;
        await creator.save();

        await logAdminAction(
            adminId,
            adminName,
            'creator',
            creatorId,
            'unsuspended_creator',
            'Creator account restored'
        );

        res.json({ success: true, message: 'Creator unsuspended', creator });
    } catch (err) {
        console.error('Error unsuspending creator:', err);
        res.status(500).json({ error: 'Server error', message: err.message });
    }
});

// ============================================
// 12. POST Verify Creator
// ============================================
router.post('/:creatorId/verify', async (req, res) => {
    try {
        const { creatorId } = req.params;
        const adminId = req.user?.id || 'admin';
        const adminName = req.user?.name || 'Admin';

        const creator = await User.findById(creatorId);
        if (!creator) {
            return res.status(404).json({ error: 'Creator not found' });
        }

        creator.isVerified = true;
        await creator.save();

        await logAdminAction(
            adminId,
            adminName,
            'creator',
            creatorId,
            'verified_creator',
            'Creator verified with blue badge'
        );

        res.json({ success: true, message: 'Creator verified', creator });
    } catch (err) {
        console.error('Error verifying creator:', err);
        res.status(500).json({ error: 'Server error', message: err.message });
    }
});

// ============================================
// 13. POST Unverify Creator
// ============================================
router.post('/:creatorId/unverify', async (req, res) => {
    try {
        const { creatorId } = req.params;
        const adminId = req.user?.id || 'admin';
        const adminName = req.user?.name || 'Admin';

        const creator = await User.findById(creatorId);
        if (!creator) {
            return res.status(404).json({ error: 'Creator not found' });
        }

        creator.isVerified = false;
        await creator.save();

        await logAdminAction(
            adminId,
            adminName,
            'creator',
            creatorId,
            'unverified_creator',
            'Creator verification removed'
        );

        res.json({ success: true, message: 'Creator unverified', creator });
    } catch (err) {
        console.error('Error unverifying creator:', err);
        res.status(500).json({ error: 'Server error', message: err.message });
    }
});

// ============================================
// 14. POST Freeze Wallet
// ============================================
router.post('/:creatorId/freeze-wallet', async (req, res) => {
    try {
        const { creatorId } = req.params;
        const { reason } = req.body;
        const adminId = req.user?.id || 'admin';
        const adminName = req.user?.name || 'Admin';

        const creator = await User.findById(creatorId);
        if (!creator) {
            return res.status(404).json({ error: 'Creator not found' });
        }

        creator.isWalletFrozen = true;
        await creator.save();

        await logAdminAction(
            adminId,
            adminName,
            'creator',
            creatorId,
            'froze_wallet',
            `Froze creator wallet: ${reason}`,
            { reason }
        );

        res.json({ success: true, message: 'Wallet frozen', creator });
    } catch (err) {
        console.error('Error freezing wallet:', err);
        res.status(500).json({ error: 'Server error', message: err.message });
    }
});

// ============================================
// 15. POST Unfreeze Wallet
// ============================================
router.post('/:creatorId/unfreeze-wallet', async (req, res) => {
    try {
        const { creatorId } = req.params;
        const adminId = req.user?.id || 'admin';
        const adminName = req.user?.name || 'Admin';

        const creator = await User.findById(creatorId);
        if (!creator) {
            return res.status(404).json({ error: 'Creator not found' });
        }

        creator.isWalletFrozen = false;
        await creator.save();

        await logAdminAction(
            adminId,
            adminName,
            'creator',
            creatorId,
            'unfroze_wallet',
            'Creator wallet unfrozen'
        );

        res.json({ success: true, message: 'Wallet unfrozen', creator });
    } catch (err) {
        console.error('Error unfreezing wallet:', err);
        res.status(500).json({ error: 'Server error', message: err.message });
    }
});

// ============================================
// 16. POST Send Notification to Creator
// ============================================
router.post('/:creatorId/send-notification', async (req, res) => {
    try {
        const { creatorId } = req.params;
        const { title, message, type } = req.body;
        const adminId = req.user?.id || 'admin';
        const adminName = req.user?.name || 'Admin';

        const { CreatorNotification } = require('./models');

        const notification = await CreatorNotification.create({
            creatorId,
            type: type || 'system',
            title,
            message,
            read: false,
            createdAt: new Date()
        });

        await logAdminAction(
            adminId,
            adminName,
            'creator',
            creatorId,
            'sent_notification',
            `Sent notification: ${title}`,
            { title, message, type }
        );

        res.json({ success: true, message: 'Notification sent', notification });
    } catch (err) {
        console.error('Error sending notification:', err);
        res.status(500).json({ error: 'Server error', message: err.message });
    }
});

// ============================================
// 17. POST Login as Creator (Support Mode)
// ============================================
router.post('/:creatorId/login-as-creator', async (req, res) => {
    try {
        const { creatorId } = req.params;
        const adminId = req.user?.id || 'admin';
        const adminName = req.user?.name || 'Admin';

        const creator = await User.findById(creatorId);
        if (!creator) {
            return res.status(404).json({ error: 'Creator not found' });
        }

        const jwt = require('jsonwebtoken');
        const supportToken = jwt.sign(
            {
                user: { id: creator._id, role: creator.role },
                supportMode: true,
                adminId
            },
            process.env.JWT_SECRET || 'RupantarAI_Secure_Secret_2025',
            { expiresIn: '1h' }
        );

        await logAdminAction(
            adminId,
            adminName,
            'creator',
            creatorId,
            'login_as_creator',
            'Admin logged in as creator (support mode)'
        );

        res.json({
            success: true,
            supportToken,
            expiresIn: '1h',
            message: 'Support mode token generated'
        });
    } catch (err) {
        console.error('Error generating support token:', err);
        res.status(500).json({ error: 'Server error', message: err.message });
    }
});

// ============================================
// Template Management (within Creator Profile)
// ============================================

// 18. POST Approve Template
router.post('/templates/:templateId/approve', async (req, res) => {
    try {
        const { templateId } = req.params;
        const adminId = req.user?.id || 'admin';
        const adminName = req.user?.name || 'Admin';

        const template = await Template.findById(templateId);
        if (!template) {
            return res.status(404).json({ error: 'Template not found' });
        }

        template.approvalStatus = 'approved';
        template.rejectionReason = null;
        await template.save();

        await logAdminAction(
            adminId,
            adminName,
            'template',
            templateId,
            'approved_template',
            `Approved template: ${template.title}`
        );

        res.json({ success: true, message: 'Template approved', template });
    } catch (err) {
        console.error('Error approving template:', err);
        res.status(500).json({ error: 'Server error', message: err.message });
    }
});

// 19. POST Reject Template
router.post('/templates/:templateId/reject', async (req, res) => {
    try {
        const { templateId } = req.params;
        const { reason } = req.body;
        const adminId = req.user?.id || 'admin';
        const adminName = req.user?.name || 'Admin';

        const template = await Template.findById(templateId);
        if (!template) {
            return res.status(404).json({ error: 'Template not found' });
        }

        template.approvalStatus = 'rejected';
        template.rejectionReason = reason;
        await template.save();

        await logAdminAction(
            adminId,
            adminName,
            'template',
            templateId,
            'rejected_template',
            `Rejected template: ${template.title} - ${reason}`,
            { reason }
        );

        res.json({ success: true, message: 'Template rejected', template });
    } catch (err) {
        console.error('Error rejecting template:', err);
        res.status(500).json({ error: 'Server error', message: err.message });
    }
});

// 20. POST Toggle Pause Template
router.post('/templates/:templateId/toggle-pause', async (req, res) => {
    try {
        const { templateId } = req.params;
        const adminId = req.user?.id || 'admin';
        const adminName = req.user?.name || 'Admin';

        const template = await Template.findById(templateId);
        if (!template) {
            return res.status(404).json({ error: 'Template not found' });
        }

        template.isPaused = !template.isPaused;
        template.status = template.isPaused ? 'paused' : 'active';
        await template.save();

        const action = template.isPaused ? 'paused' : 'unpaused';
        await logAdminAction(
            adminId,
            adminName,
            'template',
            templateId,
            `${action}_template`,
            `${action.charAt(0).toUpperCase() + action.slice(1)} template: ${template.title}`
        );

        res.json({ success: true, message: `Template ${action}`, template });
    } catch (err) {
        console.error('Error toggling template pause:', err);
        res.status(500).json({ error: 'Server error', message: err.message });
    }
});

// 21. DELETE Template
router.delete('/templates/:templateId', async (req, res) => {
    try {
        const { templateId } = req.params;
        const adminId = req.user?.id || 'admin';
        const adminName = req.user?.name || 'Admin';

        const template = await Template.findById(templateId);
        if (!template) {
            return res.status(404).json({ error: 'Template not found' });
        }

        const templateTitle = template.title;
        await template.deleteOne();

        await logAdminAction(
            adminId,
            adminName,
            'template',
            templateId,
            'deleted_template',
            `Deleted template: ${templateTitle}`
        );

        res.json({ success: true, message: 'Template deleted' });
    } catch (err) {
        console.error('Error deleting template:', err);
        res.status(500).json({ error: 'Server error', message: err.message });
    }
});

// 22. GET Template Analytics
router.get('/templates/:templateId/analytics', async (req, res) => {
    try {
        const { templateId } = req.params;

        const template = await Template.findById(templateId).populate('creatorId', 'name email');
        if (!template) {
            return res.status(404).json({ error: 'Template not found' });
        }

        // Get earnings for this template
        const earnings = await CreatorEarning.find({ templateId });
        const totalEarnings = earnings.reduce((sum, e) => sum + (e.pointsEarned || 0), 0);

        // Get saves
        const saves = await TemplateSave.countDocuments({ templateId });

        res.json({
            template: {
                id: template._id,
                title: template.title,
                imageUrl: template.imageUrl,
                category: template.category,
                creator: template.creatorId,
                createdAt: template.createdAt
            },
            analytics: {
                useCount: template.useCount,
                viewCount: template.viewCount,
                likeCount: template.likeCount,
                savesCount: saves,
                earningsGenerated: totalEarnings,
                conversionRate: template.viewCount > 0
                    ? ((template.useCount / template.viewCount) * 100).toFixed(2)
                    : 0
            },
            earningsHistory: earnings.map(e => ({
                date: e.date,
                pointsEarned: e.pointsEarned,
                usageCount: e.usageCount
            }))
        });
    } catch (err) {
        console.error('Error fetching template analytics:', err);
        res.status(500).json({ error: 'Server error', message: err.message });
    }
});

module.exports = router;
