/**
 * AI GUARD RULES API ROUTES
 * Admin-only endpoints for managing safety and guard rules
 */

const express = require('express');
const router = express.Router();

module.exports = (GenerationGuardRule) => {
    const AIGuardService = require('../services/aiGuardService');
    const guardService = new AIGuardService(GenerationGuardRule);

    /**
     * GET /api/admin/guard-rules
     * Fetch all guard rules (sorted by priority)
     */
    router.get('/', async (req, res) => {
        try {
            const rules = await GenerationGuardRule.find()
                .sort({ priority: 1 })
                .lean();

            res.json({
                success: true,
                count: rules.length,
                rules
            });
        } catch (error) {
            console.error('Error fetching guard rules:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch guard rules',
                error: error.message
            });
        }
    });

    /**
     * POST /api/admin/guard-rules
     * Create a new guard rule
     */
    router.post('/', async (req, res) => {
        try {
            const { ruleName, ruleType, enabled, priority, hiddenPrompt, applyTo } = req.body;

            // Validation
            if (!ruleName || !ruleType || priority === undefined) {
                return res.status(400).json({
                    success: false,
                    message: 'Missing required fields: ruleName, ruleType, priority'
                });
            }

            const newRule = new GenerationGuardRule({
                ruleName,
                ruleType,
                enabled: enabled !== undefined ? enabled : true,
                priority,
                hiddenPrompt: hiddenPrompt || '',
                applyTo: applyTo || ['image', 'image_to_image', 'text_to_image']
            });

            await newRule.save();

            res.status(201).json({
                success: true,
                message: 'Guard rule created successfully',
                rule: newRule
            });
        } catch (error) {
            console.error('Error creating guard rule:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to create guard rule',
                error: error.message
            });
        }
    });

    /**
     * PUT /api/admin/guard-rules/:id
     * Update an existing guard rule
     */
    router.put('/:id', async (req, res) => {
        try {
            const { id } = req.params;
            const updates = req.body;

            const updatedRule = await GenerationGuardRule.findByIdAndUpdate(
                id,
                { $set: updates },
                { new: true, runValidators: true }
            );

            if (!updatedRule) {
                return res.status(404).json({
                    success: false,
                    message: 'Guard rule not found'
                });
            }

            res.json({
                success: true,
                message: 'Guard rule updated successfully',
                rule: updatedRule
            });
        } catch (error) {
            console.error('Error updating guard rule:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to update guard rule',
                error: error.message
            });
        }
    });

    /**
     * DELETE /api/admin/guard-rules/:id
     * Delete a guard rule
     */
    router.delete('/:id', async (req, res) => {
        try {
            const { id } = req.params;

            const deletedRule = await GenerationGuardRule.findByIdAndDelete(id);

            if (!deletedRule) {
                return res.status(404).json({
                    success: false,
                    message: 'Guard rule not found'
                });
            }

            res.json({
                success: true,
                message: 'Guard rule deleted successfully',
                rule: deletedRule
            });
        } catch (error) {
            console.error('Error deleting guard rule:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to delete guard rule',
                error: error.message
            });
        }
    });

    /**
     * POST /api/admin/guard-rules/seed
     * Seed default safety rules
     */
    router.post('/seed', async (req, res) => {
        try {
            const result = await guardService.seedDefaultRules();

            res.json({
                success: true,
                ...result
            });
        } catch (error) {
            console.error('Error seeding guard rules:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to seed guard rules',
                error: error.message
            });
        }
    });

    /**
     * PATCH /api/admin/guard-rules/:id/toggle
     * Toggle enabled/disabled status
     */
    router.patch('/:id/toggle', async (req, res) => {
        try {
            const { id } = req.params;

            const rule = await GenerationGuardRule.findById(id);

            if (!rule) {
                return res.status(404).json({
                    success: false,
                    message: 'Guard rule not found'
                });
            }

            rule.enabled = !rule.enabled;
            await rule.save();

            res.json({
                success: true,
                message: `Guard rule ${rule.enabled ? 'enabled' : 'disabled'} successfully`,
                rule
            });
        } catch (error) {
            console.error('Error toggling guard rule:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to toggle guard rule',
                error: error.message
            });
        }
    });

    /**
     * GET /api/admin/guard-rules/test
     * Test prompt building with current rules
     */
    router.post('/test', async (req, res) => {
        try {
            const { userPrompt, templatePrompt, generationType } = req.body;

            const result = await guardService.buildExecutionPrompt({
                userPrompt: userPrompt || 'test prompt',
                templatePrompt: templatePrompt || null,
                generationType: generationType || 'text_to_image'
            });

            res.json({
                success: true,
                ...result,
                info: 'This shows how prompts will be merged with current active rules'
            });
        } catch (error) {
            console.error('Error testing guard rules:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to test guard rules',
                error: error.message
            });
        }
    });

    return router;
};
