/**
 * CREATOR TEMPLATE ROUTES
 * Endpoints for creators to submit and manage their templates
 */

const express = require('express');
const router = express.Router();
const { Template } = require('../models');

module.exports = (authMiddleware) => {

    /**
     * POST /api/creator/templates
     * Submit a new template for review
     */
    router.post('/', authMiddleware, async (req, res) => {
        try {
            const creator = req.user;

            // Check if user is a creator
            if (!creator.isCreator && creator.role !== 'creator') {
                return res.status(403).json({
                    success: false,
                    message: 'Only creators can submit templates'
                });
            }

            const {
                title,
                description,
                demoImage,
                exampleImages,
                category,
                subCategory,
                tags,
                ageGroup,
                hiddenPrompt,
                visiblePrompt,
                negativePrompt,
                templateType,
                pointsCost,
                isActive
            } = req.body;

            // Validation
            if (!title || !description || !demoImage || !hiddenPrompt || !category) {
                return res.status(400).json({
                    success: false,
                    message: 'Missing required fields: title, description, demoImage, hiddenPrompt, category'
                });
            }

            // Create new template - map fields correctly
            // CRITICAL: Creator templates start as PENDING and are NOT active
            const newTemplate = new Template({
                title,
                description,
                inputImage: req.body.inputImage || '',
                imageUrl: demoImage, // Schema uses imageUrl, not demoImage
                category,
                subCategory: subCategory || '',
                tags: tags || [],
                ageGroup: ageGroup || 'All Ages',
                prompt: hiddenPrompt,
                negativePrompt: negativePrompt || '',
                isPremium: templateType === 'premium',
                pointsCost: templateType === 'premium' ? (pointsCost || 25) : 0,
                creatorId: creator.id || creator._id,
                type: 'Creator',
                source: 'creator',
                status: 'draft', // Draft until approved
                approvalStatus: 'pending', // Pending approval by admin
                submittedAt: new Date(),
                isPaused: true, // Paused until approved
                useCount: 0,
                likeCount: 0,
                savesCount: 0,
                earningsGenerated: 0
            });

            await newTemplate.save();

            console.log(`✅ Creator ${creator.fullName} submitted template: ${title}`);

            res.status(201).json({
                success: true,
                message: 'Template submitted successfully! It will be reviewed within 3-5 business days.',
                template: newTemplate
            });

        } catch (error) {
            console.error('Error creating creator template:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to submit template',
                error: error.message
            });
        }
    });

    /**
     * GET /api/creator/templates
     * Get all templates created by the logged-in creator
     */
    router.get('/', authMiddleware, async (req, res) => {
        try {
            const creator = req.user;

            if (!creator.isCreator && creator.role !== 'creator') {
                return res.status(403).json({
                    success: false,
                    message: 'Only creators can access this endpoint'
                });
            }

            const templates = await Template.find({ creatorId: creator.id || creator._id })
                .sort({ createdAt: -1 })
                .lean();

            res.json({
                success: true,
                count: templates.length,
                templates
            });

        } catch (error) {
            console.error('Error fetching creator templates:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch templates',
                error: error.message
            });
        }
    });

    /**
     * PUT /api/creator/templates/:id
     * Update a template (only if it's pending or rejected)
     */
    router.put('/:id', authMiddleware, async (req, res) => {
        try {
            const creator = req.user;
            const { id } = req.params;

            const template = await Template.findById(id);

            if (!template) {
                return res.status(404).json({
                    success: false,
                    message: 'Template not found'
                });
            }

            // Check ownership
            if (template.creatorId.toString() !== (creator.id || creator._id).toString()) {
                return res.status(403).json({
                    success: false,
                    message: 'You can only edit your own templates'
                });
            }

            // Only allow editing if pending or rejected
            if (template.status !== 'pending' && template.status !== 'rejected') {
                return res.status(400).json({
                    success: false,
                    message: `Cannot edit ${template.status} templates`
                });
            }

            // Update fields
            const updates = req.body;
            Object.keys(updates).forEach(key => {
                if (updates[key] !== undefined && key !== 'creatorId' && key !== 'status') {
                    template[key] = updates[key];
                }
            });

            // Reset status to pending if was rejected
            if (template.status === 'rejected') {
                template.status = 'pending';
            }

            await template.save();

            res.json({
                success: true,
                message: 'Template updated successfully',
                template
            });

        } catch (error) {
            console.error('Error updating template:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to update template',
                error: error.message
            });
        }
    });

    /**
     * DELETE /api/creator/templates/:id
     * Delete a template (only if pending or rejected)
     */
    router.delete('/:id', authMiddleware, async (req, res) => {
        try {
            const creator = req.user;
            const { id } = req.params;

            const template = await Template.findById(id);

            if (!template) {
                return res.status(404).json({
                    success: false,
                    message: 'Template not found'
                });
            }

            // Check ownership
            if (template.creatorId.toString() !== (creator.id || creator._id).toString()) {
                return res.status(403).json({
                    success: false,
                    message: 'You can only delete your own templates'
                });
            }

            await template.deleteOne();

            res.json({
                success: true,
                message: 'Template deleted successfully'
            });

        } catch (error) {
            console.error('Error deleting template:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to delete template',
                error: error.message
            });
        }
    });

    return router;
};
