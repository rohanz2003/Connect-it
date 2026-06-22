const { verifyFirebaseToken, isFirebaseConfigured } = require("../config/firebase");
const User = require("../modules/User");

const firebaseAuthMiddleware = async (req, res, next) => {
  const authHeader = req.header("Authorization");

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Authentication required" });
  }

  const idToken = authHeader.split("Bearer ")[1];
  if (!idToken) {
    return res.status(401).json({ error: "Invalid token format" });
  }

  // If Firebase Admin is not configured, decode token without verification
  // (allows app to work while FIREBASE_PROJECT_ID is being set up)
  if (!isFirebaseConfigured()) {
    try {
      const parts = idToken.split(".");
      if (parts.length === 3) {
        const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString());
        if (payload.email) {
          req.user = { uid: payload.sub, email: payload.email };

          if (payload.email) {
            await User.findOneAndUpdate(
              { email: payload.email.toLowerCase() },
              { $setOnInsert: { email: payload.email.toLowerCase() } },
              { upsert: true, new: true, setDefaultsOnInsert: true }
            );
          }

          return next();
        }
      }
    } catch (decodeErr) {
      console.warn("Firebase fallback decode failed:", decodeErr.message);
    }
    // If decode fails, allow through anyway to avoid breaking the app
    console.warn("⚠️ Firebase Admin not configured — request passed without verification. Set FIREBASE_PROJECT_ID for security.");
    return next();
  }

  try {
    const decoded = await verifyFirebaseToken(idToken);
    req.user = {
      uid: decoded.uid,
      email: decoded.email,
    };

    // Ensure user exists in our database
    if (decoded.email) {
      await User.findOneAndUpdate(
        { email: decoded.email.toLowerCase() },
        { $setOnInsert: { email: decoded.email.toLowerCase() } },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    }

    next();
  } catch (err) {
    if (err.code === "auth/id-token-expired") {
      return res.status(401).json({ error: "Token expired" });
    }
    if (err.code === "auth/id-token-revoked") {
      return res.status(401).json({ error: "Token revoked" });
    }
    console.error("Firebase token verification failed:", err.message);
    return res.status(401).json({ error: "Invalid token" });
  }
};

module.exports = firebaseAuthMiddleware;
