import { verifyFirebaseToken } from '../config/firebaseAdmin.js';

export const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        error: 'Unauthorized',
        message: 'Missing or invalid Authorization header. Expected: Bearer <token>'
      });
    }
    
    const idToken = authHeader.split('Bearer ')[1];
    
    if (!idToken) {
      return res.status(401).json({ 
        error: 'Unauthorized',
        message: 'Firebase token is required'
      });
    }
    
    const userInfo = await verifyFirebaseToken(idToken);
    
    req.user = {
      uid: userInfo.uid,
      email: userInfo.email,
      name: userInfo.name,
      picture: userInfo.picture,
      email_verified: userInfo.email_verified,
      phone_number: userInfo.phone_number,
    };
    
    req.firebaseClaims = userInfo.firebase_claims;
    
    next();
  } catch (error) {
    console.error('Auth middleware error:', error.message);
    
    if (error.message.includes('expired')) {
      return res.status(401).json({ 
        error: 'Token Expired',
        message: error.message
      });
    } else if (error.message.includes('revoked') || error.message.includes('Invalid')) {
      return res.status(401).json({ 
        error: 'Invalid Token',
        message: error.message
      });
    }
    
    return res.status(401).json({ 
      error: 'Authentication Failed',
      message: error.message || 'Failed to verify Firebase token'
    });
  }
};

export const optionalAuthMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const idToken = authHeader.split('Bearer ')[1];
      
      if (idToken) {
        try {
          const userInfo = await verifyFirebaseToken(idToken);
          req.user = {
            uid: userInfo.uid,
            email: userInfo.email,
            name: userInfo.name,
            picture: userInfo.picture,
            email_verified: userInfo.email_verified,
            phone_number: userInfo.phone_number,
          };
          req.firebaseClaims = userInfo.firebase_claims;
        } catch (error) {
          console.warn('Optional auth failed:', error.message);
          req.user = null;
        }
      }
    }
    
    next();
  } catch (error) {
    console.error('Optional auth middleware error:', error.message);
    req.user = null;
    next();
  }
};

export default authMiddleware;

