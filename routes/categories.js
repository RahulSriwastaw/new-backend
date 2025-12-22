/**
 * CATEGORY ROUTES
 * Manage template categories and sub-categories
 */

const express = require('express');
const router = express.Router();
const { Category } = require('../models');

module.exports = (authMiddleware) => {

    /**
     * GET /api/categories
     * Get all active categories (PUBLIC)
     */
    router.get('/', async (req, res) => {
        try {
            const categories = await Category.find({ isActive: true })
                .sort({ order: 1, name: 1 })
                .select('-__v')
                .lean();

            res.json({
                success: true,
                count: categories.length,
                categories
            });
        } catch (error) {
            console.error('Error fetching categories:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch categories',
                error: error.message
            });
        }
    });

    /**
     * POST /api/admin/categories/
     * Create a new category (ADMIN ONLY)
     */
    router.post('/', authMiddleware, async (req, res) => {
        try {
            const { name, subCategories, icon, description, order } = req.body;

            if (!name) {
                return res.status(400).json({
                    success: false,
                    message: 'Category name is required'
                });
            }

            const newCategory = new Category({
                name,
                subCategories: subCategories || [],
                icon,
                description,
                order: order || 0,
                isActive: true
            });

            await newCategory.save();

            res.status(201).json({
                success: true,
                message: 'Category created successfully',
                category: newCategory
            });

        } catch (error) {
            console.error('Error creating category:', error);

            if (error.code === 11000) {
                return res.status(400).json({
                    success: false,
                    message: 'Category with this name already exists'
                });
            }

            res.status(500).json({
                success: false,
                message: 'Failed to create category',
                error: error.message
            });
        }
    });

    /**
     * PUT /api/admin/categories/:id
     * Update a category (ADMIN ONLY)
     */
    router.put('/:id', authMiddleware, async (req, res) => {
        try {
            const { id } = req.params;
            const updates = req.body;

            const category = await Category.findByIdAndUpdate(
                id,
                { ...updates, updatedAt: new Date() },
                { new: true, runValidators: true }
            );

            if (!category) {
                return res.status(404).json({
                    success: false,
                    message: 'Category not found'
                });
            }

            res.json({
                success: true,
                message: 'Category updated successfully',
                category
            });

        } catch (error) {
            console.error('Error updating category:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to update category',
                error: error.message
            });
        }
    });

    /**
     * DELETE /api/admin/categories/:id
     * Delete a category (ADMIN ONLY)
     */
    router.delete('/:id', authMiddleware, async (req, res) => {
        try {
            const { id } = req.params;

            const category = await Category.findByIdAndDelete(id);

            if (!category) {
                return res.status(404).json({
                    success: false,
                    message: 'Category not found'
                });
            }

            res.json({
                success: true,
                message: 'Category deleted successfully'
            });

        } catch (error) {
            console.error('Error deleting category:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to delete category',
                error: error.message
            });
        }
    });

    /**
     * POST /api/admin/categories/seed
     * Seed default categories (ADMIN ONLY)
     */
    router.post('/admin/seed', authMiddleware, async (req, res) => {
        try {
            const defaultCategories = [
                {
                    name: 'Sci-Fi',
                    subCategories: ['Cyberpunk', 'Hacker', 'Stealth', 'Futuristic City'],
                    order: 1,
                    description: 'Science fiction and futuristic themes'
                },
                {
                    name: 'Portrait',
                    subCategories: ['Realistic', 'Anime', 'Oil Painting', 'Studio', 'Vintage'],
                    order: 2,
                    description: 'Portrait and headshot styles'
                },
                {
                    name: 'Landscape',
                    subCategories: ['Nature', 'Urban', 'Fantasy', 'Surreal'],
                    order: 3,
                    description: 'Landscape and scenery'
                },
                {
                    name: 'Abstract',
                    subCategories: ['Fluid', 'Geometric', 'Textual'],
                    order: 4,
                    description: 'Abstract and artistic designs'
                },
                {
                    name: 'Anime',
                    subCategories: ['Manga', 'Chibi', 'Mecha'],
                    order: 5,
                    description: 'Anime and manga styles'
                },
                {
                    name: 'General',
                    subCategories: ['Misc'],
                    order: 6,
                    description: 'General purpose templates'
                }
            ];

            const results = [];
            for (const catData of defaultCategories) {
                try {
                    const existing = await Category.findOne({ name: catData.name });
                    if (!existing) {
                        const cat = new Category(catData);
                        await cat.save();
                        results.push(cat);
                    }
                } catch (err) {
                    console.log(`Skipping ${catData.name}: ${err.message}`);
                }
            }

            res.json({
                success: true,
                message: `Seeded ${results.length} categories`,
                categories: results
            });

        } catch (error) {
            console.error('Error seeding categories:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to seed categories',
                error: error.message
            });
        }
    });

    return router;
};
