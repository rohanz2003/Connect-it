const mongoose = require("mongoose");

const auditLogSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
    index: true,
  },
  action: {
    type: String,
    required: true,
    enum: [
      "LOGIN",
      "LOGOUT",
      "LOGIN_FAILED",
      "MESSAGE_SENT",
      "MESSAGE_DELETED",
      "CHAT_CLEARED",
      "ACCOUNT_DELETED",
      "PROFILE_UPDATED",
      "AVATAR_UPDATED",
      "DEVICE_CONNECTED",
      "DEVICE_DISCONNECTED",
      "DEVICE_REVOKED",
      "BLOCK_USER",
      "UNBLOCK_USER",
      "REPORT_USER",
      "SETTINGS_CHANGED",
      "PASSWORD_CHANGED",
      "ROLE_CHANGED",
      "BACKUP_CREATED",
      "BACKUP_RESTORED",
      "DISAPPEARING_MESSAGES_CHANGED",
      "ADMIN_ACTION",
    ],
  },
  details: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },
  ip: {
    type: String,
    default: "unknown",
  },
  userAgent: {
    type: String,
    default: "unknown",
  },
  severity: {
    type: String,
    enum: ["info", "warning", "error", "critical"],
    default: "info",
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true,
  },
});

// Compound indexes for efficient querying
auditLogSchema.index({ userId: 1, timestamp: -1 });
auditLogSchema.index({ action: 1, timestamp: -1 });
auditLogSchema.index({ timestamp: -1 });
auditLogSchema.index({ severity: 1, timestamp: -1 });

// TTL index: auto-delete logs older than 90 days
auditLogSchema.index(
  { timestamp: 1 },
  { expireAfterSeconds: 90 * 24 * 60 * 60 }
);

module.exports = mongoose.model("AuditLog", auditLogSchema);
