# Railway Deployment Setup for Rupantar AI Backend

## 🚀 Quick Setup Guide

### 1. Database Setup - MongoDB Atlas

**Important:** You MUST whitelist Railway's IP addresses in MongoDB Atlas:

1. Go to [MongoDB Atlas](https://cloud.mongodb.com)
2. Navigate to **Network Access** (left sidebar)
3. Click **Add IP Address**
4. Click **Allow Access from Anywhere** (0.0.0.0/0)
5. Click **Confirm**

### 2. Railway Environment Variables

Copy the following environment variables to your Railway project:

#### Required Variables:

```bash
# Database
MONGODB_URI=mongodb+srv://rahulsriwastaw7643_db_user:CTcZrJJxXuFWnpcN@cluster0.hxxkael.mongodb.net/rupantar_ai?retryWrites=true&w=majority

# Server
NODE_ENV=production
PORT=8080
BACKEND_PORT=8080

# Security
JWT_SECRET=rupantar-ai-production-secret-key-2024-minimum-32-characters-long-secure
ALLOWED_ORIGINS=https://rupantara-fronted.vercel.app,https://new-admin-pannel.vercel.app

# Firebase Admin SDK (Optional - Add your Firebase credentials)
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_PRIVATE_KEY_ID=your-private-key-id
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYOUR_PRIVATE_KEY_HERE\n-----END PRIVATE KEY-----"
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@your-project.iam.gserviceaccount.com
FIREBASE_CLIENT_ID=your-client-id

# Cloudinary (Optional - Add your Cloudinary credentials)
CLOUDINARY_USER_CLOUD_NAME=your-cloud-name
CLOUDINARY_USER_API_KEY=your-api-key
CLOUDINARY_USER_API_SECRET=your-api-secret

CLOUDINARY_CREATOR_CLOUD_NAME=your-cloud-name
CLOUDINARY_CREATOR_API_KEY=your-api-key
CLOUDINARY_CREATOR_API_SECRET=your-api-secret

CLOUDINARY_GENERATED_CLOUD_NAME=your-cloud-name
CLOUDINARY_GENERATED_API_KEY=your-api-key
CLOUDINARY_GENERATED_API_SECRET=your-api-secret
```

### 3. How to Add Variables in Railway

1. Go to your Railway project dashboard
2. Select your backend service
3. Go to **Variables** tab
4. Click **+ New Variable**
5. Add each variable name and value
6. Click **Add** after each variable

### 4. Deploy to Railway

Railway will automatically deploy when you push to GitHub:

```bash
git add .
git commit -m "Add database configuration"
git push origin main
```

### 5. Verify Deployment

After deployment, check these endpoints:

- **Health Check:** `https://new-backend-production-c886.up.railway.app/health`
- **API Test:** `https://new-backend-production-c886.up.railway.app/api`
- **Connection Test:** `https://new-backend-production-c886.up.railway.app/api/test-connections`

### 6. Common Issues & Solutions

#### Database Connection Failed
- ✅ Verify MongoDB IP whitelist includes `0.0.0.0/0`
- ✅ Check MONGODB_URI is correct in Railway variables
- ✅ Ensure database user has read/write permissions

#### 404 Routes Not Found
- ✅ Backend server must be fully deployed
- ✅ Check Railway logs for any startup errors
- ✅ Verify domain name matches in frontend/admin panel

#### CORS Errors
- ✅ Add your frontend domains to ALLOWED_ORIGINS variable
- ✅ Include both Vercel preview and production URLs

## 📊 Current Backend URL

**Production:** `https://new-backend-production-c886.up.railway.app`

## 🔗 Related Links

- **Frontend:** https://github.com/RahulSriwastaw/Rupantara-fronted.git
- **Admin Panel:** https://github.com/RahulSriwastaw/new-admin-pannel.git
- **Backend:** https://github.com/RahulSriwastaw/new-backend.git

## ✅ API Routes Available

### Admin Routes (Requires Authentication)
- `GET /api/v1/admin/creators` - Get all creators
- `GET /api/v1/admin/templates` - Get all templates
- `GET /api/v1/admin/users` - Get all users
- `GET /api/v1/admin/analytics/dashboard` - Get dashboard analytics
- `POST /api/v1/admin/templates` - Create new template
- And many more...

### Public Routes
- `GET /health` - Health check
- `GET /api` - API status
- `POST /api/v1/auth/login` - User login
- `POST /api/v1/auth/register` - User registration

## 🔧 Local Development

To run locally with the production database:

```bash
# Install dependencies
npm install

# Copy environment variables
cp .env.example .env

# Edit .env with your values
# (The .env file is already configured with the production database)

# Run development server
npm run dev

# Or run production mode
npm start
```

The server will start on `http://localhost:4000` (dev) or `http://localhost:8080` (production)
