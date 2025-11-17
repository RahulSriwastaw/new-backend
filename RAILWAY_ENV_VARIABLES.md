# Railway Environment Variables Setup

Set these environment variables in Railway Dashboard → Variables:

## Required Variables

```
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/rupantar_ai?retryWrites=true&w=majority
NODE_ENV=production
PORT=8080
```

## Firebase Admin SDK

```
FIREBASE_PROJECT_ID=rupantra-ai
FIREBASE_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----
FIREBASE_PRIVATE_KEY_ID=your_key_id
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxx@rupantra-ai.iam.gserviceaccount.com
FIREBASE_CLIENT_ID=your_client_id
FIREBASE_STORAGE_BUCKET=rupantra-ai.firebasestorage.app
```

## Cloudinary (3 Accounts)

### Account 1 - User Uploads
```
CLOUDINARY_USER_CLOUD_NAME=your_cloud_name
CLOUDINARY_USER_API_KEY=your_api_key
CLOUDINARY_USER_API_SECRET=your_api_secret
```

### Account 2 - Creator Demos
```
CLOUDINARY_CREATOR_CLOUD_NAME=your_cloud_name
CLOUDINARY_CREATOR_API_KEY=your_api_key
CLOUDINARY_CREATOR_API_SECRET=your_api_secret
```

### Account 3 - Generated Images
```
CLOUDINARY_GENERATED_CLOUD_NAME=your_cloud_name
CLOUDINARY_GENERATED_API_KEY=your_api_key
CLOUDINARY_GENERATED_API_SECRET=your_api_secret
```

## Payment Gateways (Optional)

```
RAZORPAY_KEY_ID=your_razorpay_key_id
RAZORPAY_KEY_SECRET=your_razorpay_key_secret
STRIPE_SECRET_KEY=your_stripe_secret_key
```

## Important Notes

1. **MONGODB_URI**: 
   - Must start with `mongodb://` or `mongodb+srv://`
   - No extra spaces or quotes
   - Include database name: `/rupantar_ai`
   - Example: `mongodb+srv://user:pass@cluster.mongodb.net/rupantar_ai?retryWrites=true&w=majority`

2. **FIREBASE_PRIVATE_KEY**: 
   - Must include `\n` for line breaks OR use actual line breaks
   - Include `-----BEGIN PRIVATE KEY-----` and `-----END PRIVATE KEY-----`

3. **MongoDB Atlas**: 
   - Whitelist `0.0.0.0/0` in Network Access for Railway deployment

