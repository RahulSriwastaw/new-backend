// ============================================
// ADMIN TEMPLATE APPROVAL ENDPOINTS
// ============================================

// Get all pending templates for admin review
app.get('/api/admin/templates/pending', authMiddleware, async (req, res) => {
    try {
        // Check if user is admin
        if (req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Admin access required' });
        }

        const pendingTemplates = await Template.find({ approvalStatus: 'pending' })
            .populate('creatorId', 'name username email photoURL isVerified')
            .sort({ submittedAt: -1 })
            .limit(100);

        // Map with creator info
        const templates = pendingTemplates.map(t => ({
            ...t.toObject(),
            id: t._id,
            creatorName: t.creatorId?.name || t.creatorId?.username || 'Unknown',
            creatorAvatar: t.creatorId?.photoURL || '',
            creatorVerified: t.creatorId?.isVerified || false
        }));

        res.json({
            templates,
            count: templates.length
        });
    } catch (e) {
        console.error('Failed to fetch pending templates:', e);
        res.status(500).json({ error: 'Failed to fetch pending templates' });
    }
});

// Approve a template
app.post('/api/admin/templates/:id/approve', authMiddleware, async (req, res) => {
    try {
        // Check if user is admin
        if (req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Admin access required' });
        }

        const template = await Template.findByIdAndUpdate(
            req.params.id,
            {
                approvalStatus: 'approved',
                approvedAt: new Date(),
                approvedBy: req.user._id
            },
            { new: true }
        );

        if (!template) {
            return res.status(404).json({ error: 'Template not found' });
        }

        // TODO: Send notification to creator
        console.log(`✅ Template approved: ${template.title} by admin: ${req.user.name}`);

        res.json({
            success: true,
            message: 'Template approved successfully',
            template
        });
    } catch (e) {
        console.error('Failed to approve template:', e);
        res.status(500).json({ error: 'Failed to approve template' });
    }
});

// Reject a template
app.post('/api/admin/templates/:id/reject', authMiddleware, async (req, res) => {
    try {
        // Check if user is admin
        if (req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Admin access required' });
        }

        const { reason } = req.body;
        if (!reason || !reason.trim()) {
            return res.status(400).json({ error: 'Rejection reason is required' });
        }

        const template = await Template.findByIdAndUpdate(
            req.params.id,
            {
                approvalStatus: 'rejected',
                rejectionReason: reason,
                rejectedAt: new Date()
            },
            { new: true }
        );

        if (!template) {
            return res.status(404).json({ error: 'Template not found' });
        }

        // TODO: Send notification to creator
        console.log(`❌ Template rejected: ${template.title} - Reason: ${reason}`);

        res.json({
            success: true,
            message: 'Template rejected',
            template
        });
    } catch (e) {
        console.error('Failed to reject template:', e);
        res.status(500).json({ error: 'Failed to reject template' });
    }
});

// Get all approved templates (admin view)
app.get('/api/admin/templates/approved', authMiddleware, async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Admin access required' });
        }

        const templates = await Template.find({ approvalStatus: 'approved' })
            .populate('creatorId', 'name username email')
            .sort({ approvedAt: -1 })
            .limit(100);

        res.json({ templates });
    } catch (e) {
        res.status(500).json({ error: 'Failed to fetch approved templates' });
    }
});

// Get all rejected templates (admin view)
app.get('/api/admin/templates/rejected', authMiddleware, async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Admin access required' });
        }

        const templates = await Template.find({ approvalStatus: 'rejected' })
            .populate('creatorId', 'name username email')
            .sort({ rejectedAt: -1 })
            .limit(100);

        res.json({ templates });
    } catch (e) {
        res.status(500).json({ error: 'Failed to fetch rejected templates' });
    }
});

// Toggle template pause status
app.post('/api/admin/templates/:id/toggle-pause', authMiddleware, async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Admin access required' });
        }

        const template = await Template.findById(req.params.id);
        if (!template) {
            return res.status(404).json({ error: 'Template not found' });
        }

        template.isPaused = !template.isPaused;
        await template.save();

        res.json({
            success: true,
            isPaused: template.isPaused,
            message: template.isPaused ? 'Template paused' : 'Template resumed'
        });
    } catch (e) {
        res.status(500).json({ error: 'Failed to toggle pause status' });
    }
});

// Toggle template featured status
app.post('/api/admin/templates/:id/toggle-featured', authMiddleware, async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Admin access required' });
        }

        const template = await Template.findById(req.params.id);
        if (!template) {
            return res.status(404).json({ error: 'Template not found' });
        }

        template.isFeatured = !template.isFeatured;
        await template.save();

        res.json({
            success: true,
            isFeatured: template.isFeatured,
            message: template.isFeatured ? 'Template featured' : 'Template unfeatured'
        });
    } catch (e) {
        res.status(500).json({ error: 'Failed to toggle featured status' });
    }
});

// ============================================
// END ADMIN TEMPLATE APPROVAL ENDPOINTS
// ============================================
