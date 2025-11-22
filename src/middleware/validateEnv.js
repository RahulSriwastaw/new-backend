import logger from '../config/logger.js';

const requiredEnvVars = [
    'MONGODB_URI',
    'FIREBASE_PROJECT_ID',
    'FIREBASE_CLIENT_EMAIL',
    'FIREBASE_PRIVATE_KEY',
    'CLOUDINARY_USER_CLOUD_NAME',
    'CLOUDINARY_USER_API_KEY',
    'CLOUDINARY_USER_API_SECRET',
    'CLOUDINARY_CREATOR_CLOUD_NAME',
    'CLOUDINARY_CREATOR_API_KEY',
    'CLOUDINARY_CREATOR_API_SECRET',
    'CLOUDINARY_GENERATED_CLOUD_NAME',
    'CLOUDINARY_GENERATED_API_KEY',
    'CLOUDINARY_GENERATED_API_SECRET'
];

export const validateEnv = () => {
    const missingVars = requiredEnvVars.filter(envVar => !process.env[envVar]);

    if (missingVars.length > 0) {
        const errorMessage = `❌ Missing required environment variables: ${missingVars.join(', ')}`;
        logger.error(errorMessage);
        logger.warn('⚠️  Server will start but some features may not work properly.');
        logger.warn('⚠️  Please configure missing environment variables in Railway.');

        // Don't crash the server - just warn
        // This allows the health check to pass even if some features are misconfigured
    } else {
        logger.info('✅ Environment variables validated successfully');
    }
};
