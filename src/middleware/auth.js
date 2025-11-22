import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import logger from '../config/logger.js';

export const verifyToken = async (req, res, next) => {
    try {
        let token;
        if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
            token = req.headers.authorization.split(' ')[1];
        }

        if (!token) {
            return res.status(401).json({ error: 'Not authorized to access this route' });
        }

        // Handle "token_" prefix for legacy/dev tokens
        if (token.startsWith('token_')) {
            const userId = token.replace('token_', '');
            req.user = await User.findById(userId);
            if (!req.user) {
                return res.status(401).json({ error: 'User not found' });
            }
            return next();
        }

        // Verify JWT
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            req.user = await User.findById(decoded.id);
            if (!req.user) {
                return res.status(401).json({ error: 'User not found' });
            }
            next();
        } catch (err) {
            return res.status(401).json({ error: 'Not authorized to access this route' });
        }
    } catch (error) {
        logger.error('Auth middleware error:', { error: error.message });
        res.status(500).json({ error: 'Server Error' });
    }
};

export const authorize = (...roles) => {
    return (req, res, next) => {
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({
                error: `User role ${req.user.role} is not authorized to access this route`
            });
        }
        next();
    };
};
