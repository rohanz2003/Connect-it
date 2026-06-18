const AuditLog = require("../models/AuditLog");

const writeAuditLog = async ({
  actor,
  action,
  target = null,
  metadata = {},
  req = null,
  socket = null,
  status = "success",
}) => {
  try {
    await AuditLog.create({
      actor,
      action,
      target,
      metadata,
      status,
      ip:
        req?.ip ||
        req?.headers?.["x-forwarded-for"] ||
        socket?.handshake?.address ||
        null,
      userAgent:
        req?.headers?.["user-agent"] ||
        socket?.handshake?.headers?.["user-agent"] ||
        null,
    });
  } catch (err) {
    console.warn("Audit log write failed:", err.message);
  }
};

module.exports = {
  writeAuditLog,
};
