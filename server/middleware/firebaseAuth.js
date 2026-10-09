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

  if (!isFirebaseConfigured()) {
    return res.status(503).json({ error: "Authentication service unavailable" });
  }

  // Firebase is configured — verify the token properly
  try {
    const decoded = await verifyFirebaseToken(idToken);
    if (typeof decoded?.email !== "string" || !decoded.email.trim()) {
      return res.status(401).json({ error: "Token must include an email" });
    }
    const email = decoded.email.toLowerCase().trim();
    req.user = { uid: decoded.uid, email };

    try {
      await User.findOneAndUpdate(
        { email },
        { $setOnInsert: { email } },
        { upsert: true, setDefaultsOnInsert: true }
      );
    } catch {}

    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid token" });
  }
};

module.exports = firebaseAuthMiddleware;
