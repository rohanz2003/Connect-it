const admin = require("firebase-admin");
const User = require("../models/User");
const Device = require("../models/Device");
const AuditLog = require("../models/AuditLog");
const { generateAccessToken, generateRefreshToken } = require("../middleware/authMiddleware");

/**
 * Verifies Firebase ID Token, logs session metadata, and provisions access tokens.
 */
exports.verifyAndLoginUser = async (req, res) => {
  try {
    const { firebaseToken, deviceId, platform, browser, displayName, profilePic } = req.body;
    
    if (!firebaseToken || !deviceId) {
      return res.status(400).json({ error: "Missing required parameters: firebaseToken and deviceId." });
    }

    let decodedToken;
    try {
      decodedToken = await admin.auth().verifyIdToken(firebaseToken);
    } catch (tokenErr) {
      console.error("Firebase token validation failed:", tokenErr.message);
      return res.status(401).json({ error: "Invalid Firebase identity token." });
    }

    const email = decodedToken.email ? decodedToken.email.toLowerCase().trim() : null;
    if (!email) {
      return res.status(400).json({ error: "Firebase token does not expose valid user email context." });
    }

    // Provision or match user account authority
    let user = await User.findOne({ email });
    if (!user) {
      user = new User({
        email,
        displayName: displayName || decodedToken.name || email.split("@")[0],
        profilePic: profilePic || decodedToken.picture || "",
        role: "User" // Default starting role
      });
      await user.save();
    }

    const ipAddress = req.ip || req.headers["x-forwarded-for"] || "127.0.0.1";

    // Register active device session tracking
    await Device.findOneAndUpdate(
      { deviceId },
      {
        userId: email,
        platform: platform || "Unknown",
        browser: browser || "Unknown",
        ipAddress,
        isActive: true,
        lastSeen: new Date()
      },
      { upsert: true, new: true }
    );

    // Track Audit event
    const audit = new AuditLog({
      userId: email,
      action: "LOGIN",
      ipAddress,
      deviceInfo: `${platform || "Unknown"} | ${browser || "Unknown"}`,
      details: `Successful verification on device: ${deviceId}`
    });
    await audit.save();

    // Construct tokens
    const tokenPayload = { email: user.email, role: user.role, deviceId };
    const accessToken = generateAccessToken(tokenPayload);
    const refreshToken = generateRefreshToken(tokenPayload);

    // Secure HttpOnly 7-day Cookie for Refreshing
    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    // Short-lived cookie fallback context
    res.cookie("accessToken", accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 15 * 60 * 1000 // 15 minutes
    });

    return res.json({
      success: true,
      accessToken,
      user: {
        email: user.email,
        displayName: user.displayName,
        profilePic: user.profilePic,
        role: user.role,
        publicKeyBase64: user.publicKeyBase64,
        hideLastSeen: user.hideLastSeen,
        hideOnlineStatus: user.hideOnlineStatus,
        hideReadReceipts: user.hideReadReceipts
      }
    });

  } catch (err) {
    console.error("Login verification loop failure:", err.message);
    res.status(500).json({ error: "System authentication exception occurred." });
  }
};

/**
 * Registers user identity public key for End-to-End Encryption coordinating.
 */
exports.registerPublicKey = async (req, res) => {
  try {
    const { publicKeyBase64 } = req.body;
    if (!publicKeyBase64) {
      return res.status(400).json({ error: "publicKeyBase64 parameter required." });
    }

    const updatedUser = await User.findOneAndUpdate(
      { email: req.user.email },
      { publicKeyBase64, updatedAt: new Date() },
      { new: true }
    );

    return res.json({ success: true, publicKeyBase64: updatedUser.publicKeyBase64 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * Retrieves public keys for target recipient to facilitate client-side E2EE secret derivation.
 */
exports.getRecipientPublicKey = async (req, res) => {
  try {
    const targetEmail = req.params.email.toLowerCase().trim();
    const recipient = await User.findOne({ email: targetEmail });
    
    if (!recipient) {
      return res.status(404).json({ error: "Recipient profile context not found." });
    }

    return res.json({
      email: recipient.email,
      publicKeyBase64: recipient.publicKeyBase64,
      hideLastSeen: recipient.hideLastSeen,
      hideOnlineStatus: recipient.hideOnlineStatus
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * Fetches all registered users for communication targeting.
 */
exports.getAllUsers = async (req, res) => {
  try {
    const users = await User.find({}, "email displayName profilePic publicKeyBase64 role hideOnlineStatus").lean();
    return res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * Updates User Privacy configurations.
 */
exports.updatePrivacySettings = async (req, res) => {
  try {
    const { hideLastSeen, hideOnlineStatus, hideReadReceipts } = req.body;
    const updates = {};
    if (typeof hideLastSeen !== "undefined") updates.hideLastSeen = hideLastSeen;
    if (typeof hideOnlineStatus !== "undefined") updates.hideOnlineStatus = hideOnlineStatus;
    if (typeof hideReadReceipts !== "undefined") updates.hideReadReceipts = hideReadReceipts;
    updates.updatedAt = new Date();

    const user = await User.findOneAndUpdate({ email: req.user.email }, updates, { new: true });
    
    // Log change
    const ipAddress = req.ip || "127.0.0.1";
    await new AuditLog({
      userId: req.user.email,
      action: "ACCOUNT_CHANGE",
      ipAddress,
      details: "Privacy parameters customized."
    }).save();

    return res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * Blocks a target user account.
 */
exports.blockUser = async (req, res) => {
  try {
    const { targetEmail } = req.body;
    if (!targetEmail) return res.status(400).json({ error: "targetEmail parameter required." });

    await User.findOneAndUpdate(
      { email: req.user.email },
      { $addToSet: { blockedUsers: targetEmail.toLowerCase().trim() } }
    );

    return res.json({ success: true, message: `Successfully blocked user: ${targetEmail}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * Reports a user account for breach or abuse.
 */
exports.reportUser = async (req, res) => {
  try {
    const { targetEmail, reason } = req.body;
    if (!targetEmail || !reason) return res.status(400).json({ error: "targetEmail and reason required." });

    await User.findOneAndUpdate(
      { email: targetEmail.toLowerCase().trim() },
      { $push: { reportedBy: { reporterId: req.user.email, reason } } }
    );

    return res.json({ success: true, message: "Report processed successfully for audit." });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * Revokes an active device session.
 */
exports.revokeDeviceSession = async (req, res) => {
  try {
    const { deviceId } = req.body;
    if (!deviceId) return res.status(400).json({ error: "deviceId required." });

    await Device.findOneAndUpdate({ deviceId }, { isActive: false });

    // Track Audit trail
    const ipAddress = req.ip || "127.0.0.1";
    await new AuditLog({
      userId: req.user.email,
      action: "DEVICE_REVOCATION",
      ipAddress,
      details: `Revoked session on device node: ${deviceId}`
    }).save();

    return res.json({ success: true, revokedId: deviceId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * Processes sign out requests.
 */
exports.logoutUser = async (req, res) => {
  try {
    if (req.user && req.user.deviceId) {
      await Device.findOneAndUpdate({ deviceId: req.user.deviceId }, { isActive: false });
      
      const ipAddress = req.ip || "127.0.0.1";
      await new AuditLog({
        userId: req.user.email,
        action: "LOGOUT",
        ipAddress,
        details: `Explicit signout on device: ${req.user.deviceId}`
      }).save();
    }

    res.clearCookie("refreshToken");
    res.clearCookie("accessToken");
    return res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * Clear all sessions for full account sign out.
 */
exports.logoutAllDevices = async (req, res) => {
  try {
    await Device.updateMany({ userId: req.user.email }, { isActive: false });

    const ipAddress = req.ip || "127.0.0.1";
    await new AuditLog({
      userId: req.user.email,
      action: "LOGOUT",
      ipAddress,
      details: "Forced account wide logout on all recorded devices."
    }).save();

    res.clearCookie("refreshToken");
    res.clearCookie("accessToken");
    return res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
