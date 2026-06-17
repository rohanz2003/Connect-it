const AuditLog = require("../models/AuditLog");
const { normalizeEmail } = require("../utils/socketAuth");

/**
 * Log a security event to the database asynchronously.
 * Never blocks the request — fire and forget.
 */
const logEvent = async ({ userId, action, details, ip, userAgent, severity = "info" }) => {
  try {
    const entry = new AuditLog({
      userId: userId ? normalizeEmail(userId) : "anonymous",
      action,
      details: details || {},
      ip: ip || "unknown",
      userAgent: userAgent || "unknown",
      severity,
      timestamp: new Date(),
    });
    await entry.save();
  } catch (err) {
    console.error("âŒ Audit log error:", err.message);
  }
};

/**
 * Middleware factory: logs API requests as audit events.
 * Usage: router.post("/message", auditMiddleware("SEND_MESSAGE"), handler)
 */
const auditMiddleware = (action, severity = "info") => {
  return (req, res, next) => {
    // Store original res.json to intercept the response
    const originalJson = res.json.bind(res);
    res.json = function (body) {
      // Log after response is sent
      logEvent({
        userId: req.user?.email || req.body?.email,
        action,
        details: {
          method: req.method,
          path: req.originalUrl,
          statusCode: res.statusCode,
          body: sanitizeBody(req.body),
        },
        ip: req.ip || req.connection?.remoteAddress,
        userAgent: req.headers["user-agent"],
        severity,
      });
      return originalJson(body);
    };
    next();
  };
};

/**
 * Strip sensitive fields before logging
 */
const sanitizeBody = (body) => {
  if (!body) return {};
  const sanitized = { ...body };
  delete sanitized.password;
  delete sanitized.token;
  delete sanitized.secret;
  delete sanitized.privateKey;
  // Truncate large fields
  if (sanitized.text && typeof sanitized.text === "string" && sanitized.text.length > 100) {
    sanitized.text = sanitized.text.substring(0, 100) + "...";
  }
  return sanitized;
};

module.exports = { logEvent, auditMiddleware };
