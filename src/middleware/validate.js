import { validationResult } from 'express-validator';
import logger from '../config/logger.js';

export const validate = (validations) => {
    return async (req, res, next) => {
        // Run all validations
        await Promise.all(validations.map(validation => validation.run(req)));

        const errors = validationResult(req);
        if (errors.isEmpty()) {
            return next();
        }

        const extractedErrors = errors.array().map(err => ({
            field: err.path,
            message: err.msg
        }));

        logger.warn('Validation failed', {
            path: req.path,
            errors: extractedErrors,
            ip: req.ip
        });

        return res.status(400).json({
            error: 'Validation failed',
            details: extractedErrors
        });
    };
};
