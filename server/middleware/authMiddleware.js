const jwt = require("jsonwebtoken");
const admin = require("firebase-admin");
const User = require("../models/User");
const Device = require("../models/Device");
const AuditLog = require("../models/AuditLog");

// Initialize Firebase Admin SDK conditionally if configuration exists
if (!admin.apps.length && process.env.FIREBASE_PROJECT_ID) {
  try {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        // Support replacement of escaped newlines in env configurations
        privateKey: process.env.FIREBASE_PRIVATE_KEY ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') : undefined,
      }),
    });
    console.log("Firebase Admin Initialized Successfully ✅");
  } catch (err) {
    console.error("Firebase Admin initialization error:", err.message);
  }
}

/**
 * Access Token Generation Helper
 */
const generateAccessToken = (userPayload) => {
  return jwt.sign(userPayload, process.env.JWT_SECRET || "fallback_access_secret_production_ready", {
    expiresIn: "15m",
  });
};

/**
 * Refresh Token Generation Helper
 */
const generateRefreshToken = (userPayload) => {
  return jwt.sign(userPayload, process.env.JWT_REFRESH_SECRET || "fallback_refresh_secret_production_ready", {
    expiresIn: "7d",
  });
};

/**
 * Authentication Middleware
 * Enforces JWT access tokens or triggers automatic silent token refresh via cookies.
 */
async function authenticateUser(req, res, next) {
  try {
    let token = null;
    if (req.headers.authorization && req.headers.authorization.startsWith("Bearer ")) {
      token = req.headers.authorization.split(" ")[1];
    }

    if (!token) {
      // Try fallback to cookies for background API calls or downloads
      token = req.cookies ? req.cookies.accessToken : null;
    }

    if (!token) {
      // If access token is missing completely, check for refresh token to run silent recovery
      return handleTokenRefresh(req, res, next);
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || "fallback_access_secret_production_ready");
      
      // Attach verified identity payload to request context
      req.user = decoded;

      // Verify device session status
      if (decoded.deviceId) {
        const activeDevice = await Device.findOne({ deviceId: decoded.deviceId, isActive: true });
        if (!activeDevice) {
          return res.status(401).json({ error: "Session revoked. Please authenticate again." });
        }
        activeDevice.lastSeen = new Date();
        await activeDevice.save();
      }

      return next();
    } catch (err) {
      if (err.name === "TokenExpiredError") {
        return handleTokenRefresh(req, res, next);
      }
      return res.status(401).json({ error: "Invalid security session credentials." });
    }
  } catch (error) {
    console.error("Authentication middleware failure:", error.message);
    res.status(500).json({ error: "Internal security context failure." });
  }
}

/**
 * Handles Automatic Token Refresh using HttpOnly secure cookies
 */
async function handleTokenRefresh(req, res, next) {
  const refreshToken = req.cookies ? req.cookies.refreshToken : null;
  if (!refreshToken) {
    return res.status(401).json({ error: "Session expired or missing authentication context." });
  }

  try {
    const decodedRefresh = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET || "fallback_refresh_secret_production_ready");
    
    // Fetch authoritative account from database to verify active status and roles
    const currentAccount = await User.findOne({ email: decodedRefresh.email.toLowerCase().trim() });
    if (!currentAccount) {
      return res.status(401).json({ error: "Account reference no longer exists." });
    }

    // Check device session status
    if (decodedRefresh.deviceId) {
      const activeDevice = await Device.findOne({ deviceId: decodedRefresh.deviceId, isActive: true });
      if (!activeDevice) {
        return res.status(401).json({ error: "Device session has been explicitly revoked." });
      }
    }

    const simplePayload = {
      email: currentAccount.email,
      role: currentAccount.role,
      deviceId: decodedRefresh.deviceId
    };

    const newAccessToken = generateAccessToken(simplePayload);

    // Set refreshed token inside response header for frontend catch
    res.setHeader("x-new-access-token", newAccessToken);
    
    // Persist as temporary cookie as well
    res.cookie("accessToken", newAccessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 15 * 60 * 1000 // 15 minutes
    });

    req.user = simplePayload;
    return next();
  } catch (refreshErr) {
    return res.status(401).json({ error: "Refresh lifecycle invalid. Re-authentication required." });
  }
}

/**
 * Role-Based Access Control (RBAC) Authorizer
 */
function authorizeRoles(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: "Access denied: insufficient elevated security clearances." });
    }
    next();
  };
}

// Shortcuts for convenience
const authorizeAdmin = authorizeRoles("Admin");
const authorizeModerator = authorizeRoles("Moderator", "Admin");

module.exports = {
  authenticateUser,
  authorizeAdmin,
  authorizeModerator,
  authorizeRoles,
  generateAccessToken,
  generateRefreshToken
};
