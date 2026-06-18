const jwt = require("jsonwebtoken");
const { getFirebaseAdmin } = require("../config/firebaseAdmin");
const { normalizeEmail } = require("../utils/socketAuth");
const RefreshToken = require("../models/RefreshToken");
const User = require("../modules/User");

const getBearerToken = (req) => {
  const header = req.headers.authorization || "";
  if (!header.startsWith("Bearer ")) return null;
  return header.slice("Bearer ".length).trim();
};

const mapFirebaseUser = (decoded) => ({
  uid: decoded.uid,
  email: normalizeEmail(decoded.email),
  emailVerified: decoded.email_verified !== false,
  authProvider: "firebase",
});

const mapLocalUser = (decoded) => ({
  uid: decoded.uid || decoded.sub || decoded.email,
  email: normalizeEmail(decoded.email || decoded.sub),
  emailVerified: decoded.emailVerified !== false,
  authProvider: "local-jwt",
});

const issueRefreshToken = async (user, req) => {
  const refreshTokenDoc = await RefreshToken.createForUser({
    userId: user.email,
    deviceId: req.body?.deviceId || req.headers["x-device-id"] || null,
    userAgent: req.headers["user-agent"] || null,
    ip: req.ip || req.connection?.remoteAddress || null,
  });
  return refreshTokenDoc.token;
};

const verifyUserToken = async (token) => {
  if (!token) {
    const err = new Error("Missing bearer token");
    err.statusCode = 401;
    throw err;
  }

  const firebaseAdmin = getFirebaseAdmin();
  if (firebaseAdmin) {
    try {
      const decoded = await firebaseAdmin.auth().verifyIdToken(token, true);
      const user = mapFirebaseUser(decoded);
      if (!user.email) {
        const err = new Error("Authenticated token does not contain an email");
        err.statusCode = 401;
        throw err;
      }
      return user;
    } catch (firebaseErr) {
      if (!process.env.JWT_SECRET) {
        firebaseErr.statusCode = 401;
        throw firebaseErr;
      }
    }
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = mapLocalUser(decoded);
    if (!user.email) {
      const err = new Error("Authenticated token does not contain an email");
      err.statusCode = 401;
      throw err;
    }
    return user;
  } catch (jwtErr) {
    jwtErr.statusCode = 401;
    throw jwtErr;
  }
};

const requireAuth = async (req, res, next) => {
  try {
    const user = await verifyUserToken(getBearerToken(req));
    if (!user.emailVerified) {
      return res.status(403).json({ error: "Email verification required" });
    }
    req.user = user;
    next();
  } catch (err) {
    res.status(err.statusCode || 401).json({ error: "Unauthorized" });
  }
};

const requireSelf = (emailGetter) => (req, res, next) => {
  const requestedEmail = normalizeEmail(emailGetter(req));
  if (!requestedEmail || requestedEmail !== req.user?.email) {
    return res.status(403).json({ error: "Forbidden" });
  }
  next();
};

const issueAppToken = (user) => {
  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET is required to issue app tokens");
  }
  return jwt.sign(
    {
      sub: user.uid || user.email,
      uid: user.uid,
      email: user.email,
      emailVerified: user.emailVerified,
      role: user.role || "user",
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || "15m" }
  );
};

const issueAppTokenPair = async (user, req) => {
  const accessToken = issueAppToken(user);
  const refreshToken = await issueRefreshToken(user, req);
  return { accessToken, refreshToken };
};

const refreshAccessToken = async (refreshTokenValue) => {
  const stored = await RefreshToken.findOne({
    token: refreshTokenValue,
    revokedAt: null,
    expiresAt: { $gt: new Date() },
  });
  if (!stored) {
    const err = new Error("Invalid or expired refresh token");
    err.statusCode = 401;
    throw err;
  }
  const newRefreshTokenValue = RefreshToken.generateToken();
  stored.replacedBy = newRefreshTokenValue;
  stored.revokedAt = new Date();
  await stored.save();
  await RefreshToken.create({
    token: newRefreshTokenValue,
    userId: stored.userId,
    deviceId: stored.deviceId,
    userAgent: stored.userAgent,
    ip: stored.ip,
    expiresAt: new Date(
      Date.now() +
        (parseInt(process.env.JWT_REFRESH_EXPIRES_IN_MS, 10) ||
          7 * 24 * 60 * 60 * 1000)
    ),
  });
  const user = await User.findOne({
    email: stored.userId,
  }).select("email uid role");
  const accessToken = issueAppToken({
    uid: user?.email || stored.userId,
    email: stored.userId,
    emailVerified: true,
    role: user?.role || "user",
  });
  return { accessToken, refreshToken: newRefreshTokenValue };
};

module.exports = {
  getBearerToken,
  issueAppToken,
  issueAppTokenPair,
  issueRefreshToken,
  refreshAccessToken,
  requireAuth,
  requireSelf,
  verifyUserToken,
};
