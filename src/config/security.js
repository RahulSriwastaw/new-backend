import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import cors from 'cors';

// Rate limiting configuration
export const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
    message: {
        status: 429,
        error: 'Too many requests, please try again later.'
    }
});

// Auth specific rate limiter (stricter)
export const authLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 10, // Limit each IP to 10 login/register attempts per hour
    message: {
        status: 429,
        error: 'Too many login attempts, please try again later.'
    }
});

// CORS configuration
const defaultOrigins = [
    'https://rupantara-fronted.vercel.app',
    'https://new-admin-pannel.vercel.app',
    'https://new-admin-pannel-nine.vercel.app',
];

const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? [...defaultOrigins, ...process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())]
    : defaultOrigins;

export const corsOptions = {
    origin: (origin, callback) => {
        if (!origin) return callback(null, true);

        if (allowedOrigins.some(allowed => origin === allowed || origin.startsWith(allowed))) {
            return callback(null, true);
        }

        console.warn(`CORS: Origin not allowed: ${origin}`);
        return callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
    exposedHeaders: ['Content-Length', 'X-Request-Id'],
    optionsSuccessStatus: 200,
    preflightContinue: false
};

// Helmet configuration for security headers
export const helmetConfig = helmet();
