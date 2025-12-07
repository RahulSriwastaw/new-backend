import admin from 'firebase-admin';
import dotenv from 'dotenv';

dotenv.config();

// Service account credentials
const serviceAccount = {
  type: "service_account",
  project_id: process.env.FIREBASE_PROJECT_ID || "rupantra-ai",
  private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID || "1ace185ef545b93a608a5658b799cf0d089a4abf",
  private_key: (process.env.FIREBASE_PRIVATE_KEY || `-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQCt8SVa2XrPIZ4Z
TVCDtJ7s++Y0MYhx28+Q0rZhR4uuGgCwbeSmUx/lxWMYS+CmbteEgmBmu8ZSTFV/
I8KLi7DFvA0uPURR35RMARjruq2VHpf6dAKQEhmQPl5vnHdvPCa0HXJestt+xgC2
DG1JbxSQNFhydh1NRRCBp0H8sEvf6/n/bCldIpmvthUh0cuZFXMxHeH6FsOOi5vk
hB6kWLAWNiqysATfsOSQjbG9Q+Q5EV5io9A6ejof7b5151XdHQZyQS8Ap96HvJ7S
WiiRR/pniP7ANMRfjH9R+eHTzEay4jJletsdwgxtFUISrfBYgS92VIz6tY2bRTvI
TKBJNdRfAgMBAAECggEAAqNXZ0Pa798WCLR9bkKx1QVuV77gYcrU12btw2AIK/XY
5zWhLcxoRtHi2J/SK5ofO1GuUCIWKfghjMXZEdTUS/DEJUQxqFohfBRHOp9ys778
zLTm9HoJatXpmvAGa7HL5c7yC9MP2aHXCxyLhLo3jlY9qbzXzx2U5KZP2FHepj9B
CXlN88eUqI+XPWU903lekTbV7LkHVjitDyL/IcSgB0PLKNHpyD5HOx3pQ/HeZcPP
UJQ6slNM1DgHee310hqPT1ZoooCiBlf/wWBM4FW56TcIZnctlInPz8d175T4DyDT
4rUdTJQYqGDcEjoIU1rTwB4zCTGOmlpn1btvFBT5cQKBgQDT9BqgHe1SkNGmR/mk
VkR74EaKj8txeqFQELTGMlX9K+MKJsVKUDqaMITzU0cmltvhfi5jbbJgDlZvm+ct
lku4QTriq3dJ+HnPNasOlT3Rt/MyEeqVqtVtL4Buc1nPea9dpYXs1blGAa5e6w0Z
wINYwuiza7drEB4TvkYA01BFZwKBgQDSFtU453Cfvs7mB7NW0q3nL0RmVRag7JRF
9syESm8MVBReus97Jg5vGqc6LUeNhAJPvoTYIdY8PHfOGHyopYA0AiXjA7uM1sH7
bD+ysADMi2HSrCqNabnpdceD1lKYtJXmvTjDzVjmh13w5LwVPWoiCD6HdLdfCy5x
Nhv/+R1mSQKBgDZKeaN35vlWNQ1ltFFe843Thd4qNQ9tPPK4RMXb0ODXpAFOqwx8
/nXOZc+6DiiZTds1qgY37A/kvEk8YvvvWpfoxX+YMicVaYYlFhrXKY2Vk8rIghEy
QBcGqtwf2epmHgBbzLE8kYeYGKUhiiqFgF91FYwX1FStPTcLbvz5I7+TAoGBALJl
5yvKBC3yVjipQ1Wv0zJkRd3r1SpTmtkKaMLRfhjm8OE8GuGFAG7CIEzblE4MUfYr
Xx01JnnCEy30Ry7iUspXJJrwWXuQBesdEb4HjLYkia3euseYhuFDPWerQDoh5sSn
26MRJbOkMVZUtY4Ht68sdwSJTQktMoO6Ie6sOJXZAoGAI4xdrYP8i2LbILrfXHMb
ISPaLEcey/M6QLol1Blauw83iFYObLnxuAWdinWQJZNxvg0CX6CinbxUenFSRjGC
3c7gAP8iw7PEJj4gKYYHyfldx4+QmEm0y09XtBo/Wv+bSBcVOTFp5Ko30WLNcFbD
DdCM7wufgu5dMlTNJiSy2uY=
-----END PRIVATE KEY-----`).replace(/\\n/g, '\n'),
  client_email: process.env.FIREBASE_CLIENT_EMAIL || "firebase-adminsdk-fbsvc@rupantra-ai.iam.gserviceaccount.com",
  client_id: process.env.FIREBASE_CLIENT_ID || "107747358782493789631",
  auth_uri: "https://accounts.google.com/o/oauth2/auth",
  token_uri: "https://oauth2.googleapis.com/token",
  auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
  client_x509_cert_url: "https://www.googleapis.com/robot/v1/metadata/x509/firebase-adminsdk-fbsvc%40rupantra-ai.iam.gserviceaccount.com",
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
    
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccountWithFormattedKey),
      projectId: serviceAccount.project_id,
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET || 'rupantra-ai.firebasestorage.app',
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

