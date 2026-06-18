const mongoose = require("mongoose");

const auditLogSchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true, lowercase: true, trim: true },
  action: { type: String, required: true, enum: ["LOGIN", "LOGOUT", "FAILED_LOGIN", "MESSAGE_DELETION", "ACCOUNT_CHANGE", "DEVICE_REVOCATION"] },
  ipAddress: { type: String, required: true },
  deviceInfo: { type: String, default: "" },
  details: { type: String, default: "" },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("AuditLog", auditLogSchema);
