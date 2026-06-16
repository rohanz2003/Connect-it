const admin = require("firebase-admin");
const { normalizeEmail } = require("../utils/socketAuth");

/**
 * Middleware: authenticateUser
 * Verifies Firebase ID token from Authorization header.
 * Attaches decoded user to req.user.
 */
const authenticateUser = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Access denied. No token provided." });
    }

    const token = authHeader.split(" ")[1];
    if (!token) {
      return res.status(401).json({ error: "Access denied. Invalid token format." });
    }

    let decoded;
    try {
      decoded = await admin.auth().verifyIdToken(token);
    } catch (firebaseErr) {
      // Token might be expired or invalid
      if (firebaseErr.code === "auth/id-token-expired") {
        return res.status(401).json({ error: "Token expired. Please refresh.", code: "TOKEN_EXPIRED" });
      }
      return res.status(401).json({ error: "Invalid token.", code: "INVALID_TOKEN" });
    }

    if (!decoded || !decoded.email) {
      return res.status(401).json({ error: "Invalid token payload." });
    }

    req.user = {
      uid: decoded.uid,
      email: normalizeEmail(decoded.email),
      emailVerified: decoded.email_verified || false,
      name: decoded.name || null,
      picture: decoded.picture || null,
      firebase: decoded,
    };

    next();
  } catch (err) {
    console.error("❌ Auth middleware error:", err.message);
    return res.status(500).json({ error: "Authentication error." });
  }
};

/**
 * Middleware: optionalAuth
 * Attaches user info if token is present, but doesn't block unauthenticated requests.
 */
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      req.user = null;
      return next();
    }

    const token = authHeader.split(" ")[1];
    if (!token) {
      req.user = null;
      return next();
    }

    const decoded = await admin.auth().verifyIdToken(token);
    if (decoded && decoded.email) {
      req.user = {
        uid: decoded.uid,
        email: normalizeEmail(decoded.email),
        emailVerified: decoded.email_verified || false,
        name: decoded.name || null,
        picture: decoded.picture || null,
      };
    } else {
      req.user = null;
    }
  } catch (err) {
    req.user = null;
  }
  next();
};

module.exports = { authenticateUser, optionalAuth };
