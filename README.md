# Rupantar AI Backend

MERN Stack Backend for Rupantar AI application.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create `.env` file with the following variables:
```
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/rupantar_ai?retryWrites=true&w=majority
FIREBASE_PROJECT_ID=rupantra-ai
FIREBASE_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----
FIREBASE_PRIVATE_KEY_ID=your_key_id
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxx@rupantra-ai.iam.gserviceaccount.com
FIREBASE_CLIENT_ID=your_client_id
CLOUDINARY_USER_CLOUD_NAME=your_cloud_name
CLOUDINARY_USER_API_KEY=your_api_key
CLOUDINARY_USER_API_SECRET=your_api_secret
CLOUDINARY_CREATOR_CLOUD_NAME=your_cloud_name
CLOUDINARY_CREATOR_API_KEY=your_api_key
CLOUDINARY_CREATOR_API_SECRET=your_api_secret
CLOUDINARY_GENERATED_CLOUD_NAME=your_cloud_name
CLOUDINARY_GENERATED_API_KEY=your_api_key
CLOUDINARY_GENERATED_API_SECRET=your_api_secret
PORT=8080
NODE_ENV=production
```

3. Run the server:
```bash
npm start
```

## Railway Deployment

1. Connect your GitHub repository to Railway
2. Set all environment variables in Railway Dashboard
3. Railway will automatically detect and deploy

## Important Notes

- Make sure to whitelist `0.0.0.0/0` in MongoDB Atlas Network Access
- Ensure all environment variables are set correctly in Railway

