const mongoose = require("mongoose");

const auditLogSchema = new mongoose.Schema(
  {
    actor: { type: String, lowercase: true, trim: true, index: true },
    action: {
      type: String,
      required: true,
      enum: [
        "login",
        "logout",
        "failed_login",
        "message_deletion",
        "device_registered",
        "device_revoked",
        "account_changed",
        "privacy_changed",
        "user_blocked",
        "user_unblocked",
        "user_reported",
        "backup_created",
        "backup_restored",
        "chat_deleted",
        "file_uploaded",
      ],
      index: true,
    },
    target: { type: String, lowercase: true, trim: true, default: null, index: true },
    status: { type: String, enum: ["success", "failure"], default: "success" },
    ip: { type: String, default: null },
    userAgent: { type: String, default: null },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ actor: 1, action: 1, createdAt: -1 });

module.exports = mongoose.model("AuditLog", auditLogSchema);
