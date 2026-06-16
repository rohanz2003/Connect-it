const express = require("express");
const router = express.Router();
const { body, param } = require("express-validator");
const { authenticateUser, optionalAuth } = require("../middleware/authenticateUser");
const { authorizeRole } = require("../middleware/authorizeRole");
const { auditMiddleware, logEvent } = require("../middleware/auditLogger");
const { validateReport, handleValidationErrors } = require("../middleware/validateRequest");
const { normalizeEmail } = require("../utils/socketAuth");
const User = require("../modules/User");
const BlockedUser = require("../models/BlockedUser");
const Report = require("../models/Report");
const PrivacySettings = require("../models/PrivacySettings");
const Device = require("../models/Device");
const DisappearingMessage = require("../models/DisappearingMessage");
const AuditLog = require("../models/AuditLog");

// ============================================================
// BLOCK / UNBLOCK
// ============================================================

// Block a user
router.post(
  "/block",
  authenticateUser,
  [
    body("blockedEmail")
      .notEmpty()
      .withMessage("Blocked user email is required")
      .isEmail()
      .withMessage("Invalid email"),
    handleValidationErrors,
  ],
  auditMiddleware("BLOCK_USER"),
  async (req, res) => {
    try {
      const blocker = req.user.email;
      const blocked = normalizeEmail(req.body.blockedEmail);

      if (blocker === blocked) {
        return res.status(400).json({ error: "Cannot block yourself." });
      }

      // Check if already blocked
      const existing = await BlockedUser.findOne({ blocker, blocked });
      if (existing) {
        return res.json({ message: "User already blocked.", blocked: true });
      }

      await BlockedUser.create({ blocker, blocked });
      res.json({ message: "User blocked successfully.", blocked: true });
    } catch (err) {
      console.error("❌ Block error:", err.message);
      res.status(500).json({ error: "Failed to block user." });
    }
  }
);

// Unblock a user
router.post(
  "/unblock",
  authenticateUser,
  [
    body("blockedEmail")
      .notEmpty()
      .withMessage("Blocked user email is required")
      .isEmail()
      .withMessage("Invalid email"),
    handleValidationErrors,
  ],
  auditMiddleware("UNBLOCK_USER"),
  async (req, res) => {
    try {
      const blocker = req.user.email;
      const blocked = normalizeEmail(req.body.blockedEmail);

      await BlockedUser.deleteOne({ blocker, blocked });
      res.json({ message: "User unblocked successfully.", blocked: false });
    } catch (err) {
      console.error("❌ Unblock error:", err.message);
      res.status(500).json({ error: "Failed to unblock user." });
    }
  }
);

// Get blocked users list
router.get("/blocked", authenticateUser, async (req, res) => {
  try {
    const blocked = await BlockedUser.find({ blocker: req.user.email })
      .sort({ createdAt: -1 })
      .lean();
    res.json({ blocked: blocked.map((b) => b.blocked) });
  } catch (err) {
    console.error("❌ Get blocked error:", err.message);
    res.status(500).json({ error: "Failed to get blocked users." });
  }
});

// Check if user is blocked (by either side)
router.get(
  "/blocked/:email",
  authenticateUser,
  async (req, res) => {
    try {
      const user1 = req.user.email;
      const user2 = normalizeEmail(req.params.email);

      const blocked = await BlockedUser.findOne({
        $or: [
          { blocker: user1, blocked: user2 },
          { blocker: user2, blocked: user1 },
        ],
      });

      res.json({
        blocked: !!blocked,
        byYou: blocked?.blocker === user1,
      });
    } catch (err) {
      console.error("❌ Check blocked error:", err.message);
      res.status(500).json({ error: "Failed to check block status." });
    }
  }
);

// ============================================================
// REPORT USER
// ============================================================

router.post(
  "/report",
  authenticateUser,
  validateReport,
  auditMiddleware("REPORT_USER"),
  async (req, res) => {
    try {
      const reporter = req.user.email;
      const reportedUser = normalizeEmail(req.body.reportedUser);

      if (reporter === reportedUser) {
        return res.status(400).json({ error: "Cannot report yourself." });
      }

      await Report.create({
        reporter,
        reportedUser,
        messageId: req.body.messageId || null,
        reason: req.body.reason,
      });

      res.json({ message: "User reported successfully. Our team will review." });
    } catch (err) {
      console.error("❌ Report error:", err.message);
      res.status(500).json({ error: "Failed to submit report." });
    }
  }
);

// ============================================================
// PRIVACY SETTINGS
// ============================================================

// Get privacy settings
router.get("/privacy", authenticateUser, async (req, res) => {
  try {
    let settings = await PrivacySettings.findOne({ userId: req.user.email });
    if (!settings) {
      settings = await PrivacySettings.create({ userId: req.user.email });
    }
    res.json(settings);
  } catch (err) {
    console.error("❌ Get privacy error:", err.message);
    res.status(500).json({ error: "Failed to get privacy settings." });
  }
});

// Update privacy settings
router.put(
  "/privacy",
  authenticateUser,
  [
    body("hideLastSeen").optional().isBoolean(),
    body("hideOnlineStatus").optional().isBoolean(),
    body("hideReadReceipts").optional().isBoolean(),
    body("disappearingMessages")
      .optional()
      .isIn([0, 86400, 604800, 7776000])
      .withMessage("Invalid disappearing messages timer"),
    handleValidationErrors,
  ],
  auditMiddleware("SETTINGS_CHANGED"),
  async (req, res) => {
    try {
      const settings = await PrivacySettings.findOneAndUpdate(
        { userId: req.user.email },
        {
          ...req.body,
          updatedAt: new Date(),
        },
        { upsert: true, new: true }
      );

      // Also update cached fields on User model
      await User.findOneAndUpdate(
        { email: req.user.email },
        {
          hideLastSeen: settings.hideLastSeen,
          hideOnlineStatus: settings.hideOnlineStatus,
          hideReadReceipts: settings.hideReadReceipts,
          disappearingMessages: settings.disappearingMessages,
        }
      );

      res.json(settings);
    } catch (err) {
      console.error("❌ Update privacy error:", err.message);
      res.status(500).json({ error: "Failed to update privacy settings." });
    }
  }
);

// ============================================================
// DEVICE MANAGEMENT
// ============================================================

// Get active devices
router.get("/devices", authenticateUser, async (req, res) => {
  try {
    const devices = await Device.find({ userId: req.user.email })
      .sort({ lastSeen: -1 })
      .lean();

    res.json({
      active: devices.filter((d) => d.isActive).length,
      total: devices.length,
      devices: devices.map((d) => ({
        deviceId: d.deviceId,
        deviceName: d.deviceName,
        deviceType: d.deviceType,
        browser: d.browser,
        os: d.os,
        isActive: d.isActive,
        lastSeen: d.lastSeen,
        loginTime: d.createdAt,
      })),
    });
  } catch (err) {
    console.error("❌ Devices error:", err.message);
    res.status(500).json({ error: "Failed to get devices." });
  }
});

// Revoke a device
router.post(
  "/devices/revoke",
  authenticateUser,
  [
    body("deviceId").notEmpty().withMessage("Device ID is required"),
    handleValidationErrors,
  ],
  auditMiddleware("DEVICE_REVOKED"),
  async (req, res) => {
    try {
      await Device.findOneAndUpdate(
        { userId: req.user.email, deviceId: req.body.deviceId },
        { isActive: false }
      );
      res.json({ message: "Device revoked successfully." });
    } catch (err) {
      console.error("❌ Revoke device error:", err.message);
      res.status(500).json({ error: "Failed to revoke device." });
    }
  }
);

// Revoke all devices (logout from all)
router.post(
  "/devices/revoke-all",
  authenticateUser,
  auditMiddleware("DEVICE_REVOKED", "warning"),
  async (req, res) => {
    try {
      await Device.updateMany(
        { userId: req.user.email, isActive: true },
        { isActive: false }
      );
      res.json({ message: "All devices revoked. You will be logged out from all sessions." });
    } catch (err) {
      console.error("❌ Revoke all error:", err.message);
      res.status(500).json({ error: "Failed to revoke devices." });
    }
  }
);

// ============================================================
// AUDIT LOG (for users to see their own activity)
// ============================================================

router.get("/activity", authenticateUser, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const skip = (page - 1) * limit;

    const logs = await AuditLog.find({ userId: req.user.email })
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await AuditLog.countDocuments({ userId: req.user.email });

    res.json({
      logs,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    console.error("❌ Activity log error:", err.message);
    res.status(500).json({ error: "Failed to get activity logs." });
  }
});

// ============================================================
// DISAPPEARING MESSAGES CLEANUP (admin/moderator endpoint)
// ============================================================

router.post(
  "/cleanup-expired",
  authenticateUser,
  authorizeRole("moderator", "admin"),
  async (req, res) => {
    try {
      const result = await DisappearingMessage.deleteMany({
        deleteAt: { $lte: new Date() },
      });
      res.json({ deletedCount: result.deletedCount });
    } catch (err) {
      console.error("❌ Cleanup error:", err.message);
      res.status(500).json({ error: "Failed to clean up expired messages." });
    }
  }
);

module.exports = router;
