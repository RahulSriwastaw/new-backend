import { v2 as cloudinary } from 'cloudinary';
import dotenv from 'dotenv';

dotenv.config();

// Cloudinary Account 1 - User Image Uploads
const cloudinaryUserConfig = {
  cloud_name: process.env.CLOUDINARY_USER_CLOUD_NAME || 'dno47zdrh',
  api_key: process.env.CLOUDINARY_USER_API_KEY || '323385711182591',
  api_secret: process.env.CLOUDINARY_USER_API_SECRET || 'V7O-ktZe4h1QCQsECBJjfa8f-XE',
};

// Cloudinary Account 2 - Creator Demo Images
const cloudinaryCreatorConfig = {
  cloud_name: process.env.CLOUDINARY_CREATOR_CLOUD_NAME || 'dmbrs338o',
  api_key: process.env.CLOUDINARY_CREATOR_API_KEY || '943571584978134',
  api_secret: process.env.CLOUDINARY_CREATOR_API_SECRET || 'xLvXUL573laZHjFTwbpZboBBhNA',
};

// Cloudinary Account 3 - Generated Images Storage
const cloudinaryGeneratedConfig = {
  cloud_name: process.env.CLOUDINARY_GENERATED_CLOUD_NAME || 'dkeigiajt',
  api_key: process.env.CLOUDINARY_GENERATED_API_KEY || '683965962197886',
  api_secret: process.env.CLOUDINARY_GENERATED_API_SECRET || 'kJzq7XRNTFB33FKKsIK-Pj90T50',
};

// Initialize default (Account 1)
cloudinary.config(cloudinaryUserConfig);

// Helper functions for each account
export const uploadUserImage = async (file, folder = 'user-uploads') => {
  cloudinary.config(cloudinaryUserConfig);
  return new Promise((resolve, reject) => {
    cloudinary.uploader.upload(file, {
      folder,
      resource_type: 'auto',
    }, (error, result) => {
      if (error) reject(error);
      else resolve(result);
    });
  });
};

export const uploadCreatorDemo = async (file, folder = 'creator-demos') => {
  cloudinary.config(cloudinaryCreatorConfig);
  return new Promise((resolve, reject) => {
    cloudinary.uploader.upload(file, {
      folder,
      resource_type: 'auto',
    }, (error, result) => {
      if (error) reject(error);
      else resolve(result);
    });
  });
};

export const uploadGeneratedImage = async (file, folder = 'generated-images') => {
  cloudinary.config(cloudinaryGeneratedConfig);
  return new Promise((resolve, reject) => {
    cloudinary.uploader.upload(file, {
      folder,
      resource_type: 'auto',
    }, (error, result) => {
      if (error) reject(error);
      else resolve(result);
    });
  });
};

export default cloudinary;

