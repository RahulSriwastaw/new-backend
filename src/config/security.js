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
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:5000',
    'https://rupantara-fronted.vercel.app',
    'https://rupantara-frontend.vercel.app',
    'https://new-admin-pannel.vercel.app',
    'https://new-admin-panel.vercel.app',
];

const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? [...defaultOrigins, ...process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())]
    : defaultOrigins;

export const corsOptions = {
    origin: (origin, callback) => {
        // Allow requests with no origin (like mobile apps, Postman, or curl requests)
        if (!origin) return callback(null, true);

        // In development, allow all origins
        if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV !== 'production') {
            return callback(null, true);
        }

        // In production, check against allowed origins
        if (allowedOrigins.some(allowed => origin === allowed || origin.startsWith(allowed))) {
            callback(null, true);
        } else {
            // Log for debugging but allow in production for now (can be tightened later)
            console.warn(`CORS: Origin not in whitelist: ${origin}`);
            callback(null, true); // Allow for now, can be changed to callback(new Error(...)) for strict mode
        }
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
