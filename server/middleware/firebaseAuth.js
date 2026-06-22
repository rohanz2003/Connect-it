const { verifyFirebaseToken } = require("../config/firebase");
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
