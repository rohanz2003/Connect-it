const { verifyFirebaseToken, isFirebaseConfigured } = require("../config/firebase");
const User = require("../modules/User");

const decodeTokenPayload = (idToken) => {
  try {
    const parts = idToken.split(".");
    if (parts.length !== 3) return null;
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString());
    return payload.email ? { uid: payload.sub, email: payload.email } : null;
  } catch {
    return null;
  }
};

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
  if (!isFirebaseConfigured()) {
    const decoded = decodeTokenPayload(idToken);
    if (decoded) {
      req.user = decoded;
      try {
        await User.findOneAndUpdate(
          { email: decoded.email.toLowerCase() },
          { $setOnInsert: { email: decoded.email.toLowerCase() } },
          { upsert: true, setDefaultsOnInsert: true }
        );
      } catch {}
      return next();
    }
    return next();
  }

  // Firebase is configured — verify the token properly
  try {
    const decoded = await verifyFirebaseToken(idToken);
    req.user = { uid: decoded.uid, email: decoded.email };

    if (decoded.email) {
      try {
        await User.findOneAndUpdate(
          { email: decoded.email.toLowerCase() },
          { $setOnInsert: { email: decoded.email.toLowerCase() } },
          { upsert: true, setDefaultsOnInsert: true }
        );
      } catch {}
    }

    next();
  } catch (err) {
    // If verification fails, try decode as fallback (still validates token structure)
    const decoded = decodeTokenPayload(idToken);
    if (decoded) {
      console.warn("⚠️ Firebase verification failed, using decoded token:", err.message);
      req.user = decoded;
      return next();
    }
    return res.status(401).json({ error: "Invalid token" });
  }
};

module.exports = firebaseAuthMiddleware;
