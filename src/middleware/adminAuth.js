import Admin from '../models/Admin.js';
import logger from '../config/logger.js';

export const verifyAdmin = async (req, res, next) => {
    try {
        const token = req.headers.authorization?.replace('Bearer ', '') ||
            req.headers['x-admin-token'];

        if (!token) {
            return res.status(401).json({ error: 'Admin token required' });
        }

        // Handle "admin_token_" prefix
        if (token.startsWith('admin_token_')) {
            const parts = token.split('_');
            // Format: admin_token_{userId}_{timestamp}
            if (parts.length < 3) {
                return res.status(401).json({ error: 'Invalid token format' });
            }

            const adminId = parts[2];
            const admin = await Admin.findById(adminId);

            if (!admin) {
                return res.status(401).json({ error: 'Admin not found' });
            }

            if (!admin.isActive) {
                return res.status(403).json({ error: 'Admin account is deactivated' });
            }

            req.admin = admin;
            return next();
        }

        // TODO: Add JWT support if we switch to JWT for admins

        return res.status(401).json({ error: 'Invalid token' });
    } catch (error) {
        logger.error('Admin auth middleware error:', { error: error.message });
        res.status(500).json({ error: 'Server Error' });
    }
};

export const checkPermission = (resource, action) => {
    return (req, res, next) => {
        if (!req.admin) {
            return res.status(401).json({ error: 'Admin not authenticated' });
        }

        // Super admin has all permissions
        if (req.admin.role === 'super_admin') {
            return next();
        }

        // Check specific permission
        if (req.admin.permissions &&
            req.admin.permissions[resource] &&
            req.admin.permissions[resource][action]) {
            return next();
        }

        return res.status(403).json({
            error: `Permission denied: Cannot ${action} ${resource}`
        });
    };
};
