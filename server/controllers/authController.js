const {
  issueAppTokenPair,
  refreshAccessToken,
} = require("../middleware/auth");
const RefreshToken = require("../models/RefreshToken");
const { writeAuditLog } = require("../services/auditService");

exports.createSession = async (req, res) => {
  try {
    const tokens = await issueAppTokenPair(req.user, req);
    await writeAuditLog({ actor: req.user.email, action: "login", req });
    res.json({
      success: true,
      token: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: {
        email: req.user.email,
        uid: req.user.uid,
      },
      expiresIn: process.env.JWT_EXPIRES_IN || "15m",
    });
  } catch (err) {
    console.error("createSession error:", err.message);
    res.status(500).json({ error: "Failed to create session" });
  }
};

exports.refreshToken = async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({ error: "Refresh token required" });
    }
    const tokens = await refreshAccessToken(refreshToken);
    const userEmail = req.user?.email || (
      await RefreshToken.findOne({ token: refreshToken })
    )?.userId;
    await writeAuditLog({
      actor: userEmail || "unknown",
      action: "token_refresh",
      req,
    });
    res.json({
      success: true,
      token: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: process.env.JWT_EXPIRES_IN || "15m",
    });
  } catch (err) {
    const status = err.statusCode || 401;
    res.status(status).json({ error: err.message || "Token refresh failed" });
  }
};

exports.logout = async (req, res) => {
  try {
    const refreshTokenValue = req.body?.refreshToken;
    if (refreshTokenValue) {
      await RefreshToken.findOneAndUpdate(
        { token: refreshTokenValue },
        { revokedAt: new Date() }
      );
    }
    await writeAuditLog({ actor: req.user.email, action: "logout", req });
    res.json({ success: true });
  } catch (err) {
    console.error("logout error:", err.message);
    res.status(500).json({ error: "Logout failed" });
  }
};

exports.logoutAllDevices = async (req, res) => {
  try {
    await RefreshToken.revokeAllForUser(req.user.email);
    await writeAuditLog({
      actor: req.user.email,
      action: "logout_all_devices",
      req,
    });
    res.json({ success: true, message: "Logged out from all devices" });
  } catch (err) {
    console.error("logoutAllDevices error:", err.message);
    res.status(500).json({ error: "Failed to logout from all devices" });
  }
};
