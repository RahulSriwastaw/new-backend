import admin from 'firebase-admin';
import dotenv from 'dotenv';

dotenv.config();

// Service account credentials
const serviceAccount = {
  type: "service_account",
  project_id: process.env.FIREBASE_PROJECT_ID,
  private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
  private_key: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
  client_email: process.env.FIREBASE_CLIENT_EMAIL,
  client_id: process.env.FIREBASE_CLIENT_ID,
  auth_uri: "https://accounts.google.com/o/oauth2/auth",
  token_uri: "https://oauth2.googleapis.com/token",
  auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
  client_x509_cert_url: process.env.FIREBASE_CLIENT_X509_CERT_URL,
  universe_domain: "googleapis.com"
};

// Initialize Firebase Admin SDK
let firebaseAdmin = null;
let initializationError = null;

try {
  if (!admin.apps.length) {
    const formattedPrivateKey = typeof serviceAccount.private_key === 'string' 
      ? serviceAccount.private_key.replace(/\\n/g, '\n')
      : serviceAccount.private_key;
    
    const serviceAccountWithFormattedKey = {
      ...serviceAccount,
      private_key: formattedPrivateKey
    };
    
    if (!serviceAccount.project_id || !serviceAccount.private_key || !serviceAccount.client_email) {
      throw new Error('Missing Firebase Admin credentials. Set FIREBASE_PROJECT_ID, FIREBASE_PRIVATE_KEY, FIREBASE_CLIENT_EMAIL.');
    }
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccountWithFormattedKey),
      projectId: serviceAccount.project_id,
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
    });
    
    firebaseAdmin = admin;
    console.log('✅ Firebase Admin SDK initialized successfully with service account');
    console.log(`   Project ID: ${serviceAccount.project_id}`);
    console.log(`   Client Email: ${serviceAccount.client_email}`);
  } else {
    firebaseAdmin = admin;
    console.log('✅ Firebase Admin SDK already initialized');
  }
} catch (error) {
  console.error('❌ Firebase Admin initialization error:', error.message);
  console.error('Error stack:', error.stack);
  firebaseAdmin = null;
  initializationError = error;
  console.warn('⚠️  Server will continue without Firebase Admin SDK. Token verification will fail.');
}

export const verifyFirebaseToken = async (idToken) => {
  if (!firebaseAdmin) {
    if (initializationError) {
      throw new Error(`Firebase Admin not initialized: ${initializationError.message}`);
    }
    throw new Error('Firebase Admin not initialized. Please check server logs.');
  }
  
  try {
    const decodedToken = await firebaseAdmin.auth().verifyIdToken(idToken);
    
    const userInfo = {
      uid: decodedToken.uid,
      email: decodedToken.email || '',
      name: decodedToken.name || null,
      picture: decodedToken.picture || null,
      email_verified: decodedToken.email_verified || false,
      phone_number: decodedToken.phone_number || null,
      firebase_claims: decodedToken,
    };
    
    return userInfo;
  } catch (error) {
    if (error.code === 'auth/id-token-expired') {
      throw new Error('Firebase token has expired. Please login again.');
    } else if (error.code === 'auth/id-token-revoked') {
      throw new Error('Firebase token has been revoked. Please login again.');
    } else if (error.code === 'auth/argument-error') {
      throw new Error('Invalid Firebase token format.');
    } else if (error.code === 'auth/invalid-id-token') {
      throw new Error('Invalid Firebase token.');
    }
    
    throw new Error(`Token verification failed: ${error.message}`);
  }
};

export const getUserByEmail = async (email) => {
  if (!firebaseAdmin) {
    throw new Error('Firebase Admin not initialized');
  }
  try {
    const user = await firebaseAdmin.auth().getUserByEmail(email);
    return user;
  } catch (error) {
    throw new Error(`Failed to get user: ${error.message}`);
  }
};

export const createUser = async (email, password, displayName = null) => {
  if (!firebaseAdmin) {
    throw new Error('Firebase Admin not initialized');
  }
  try {
    const userRecord = await firebaseAdmin.auth().createUser({
      email,
      password,
      displayName,
      emailVerified: false,
    });
    return userRecord;
  } catch (error) {
    throw new Error(`Failed to create user: ${error.message}`);
  }
};

export const sendNotification = async (token, notification) => {
  if (!firebaseAdmin) {
    throw new Error('Firebase Admin not initialized');
  }
  try {
    const message = {
      notification: {
        title: notification.title,
        body: notification.body,
      },
      token,
    };
    const response = await firebaseAdmin.messaging().send(message);
    return response;
  } catch (error) {
    throw new Error(`Failed to send notification: ${error.message}`);
  }
};

export { firebaseAdmin };
export default firebaseAdmin;

