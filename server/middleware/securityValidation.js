const rateLimit = require("express-rate-limit");
const { body, param, validationResult } = require("express-validator");

/**
 * Enterprise Rate Limiter configurations modeled after WhatsApp security limits.
 */
exports.loginRateLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute window
  max: 5,                  // Max 5 attempts
  message: { error: "Too many authentication attempts. Please retry after a minute." },
  standardHeaders: true,
  legacyHeaders: false
});

exports.messageRateLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute window
  max: 60,                 // Max 60 messages per minute
  message: { error: "Message dispatch rate limit exceeded. Slow down operations." },
  standardHeaders: true,
  legacyHeaders: false
});

exports.generalApiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 100,
  message: { error: "Request quota filled. Please hold." }
});

/**
 * Validation Result Inspector Interceptor
 */
exports.validateFieldsHook = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: "Malformed payload parameter formats.", reasons: errors.array() });
  }
  next();
};

/**
 * Parameter Validation Rules sets
 */
exports.messageInputValidator = [
  body("receiverId").isEmail().withMessage("Receiver ID must be a legitimate email structure.").normalizeEmail(),
  body("roomId").isString().notEmpty().withMessage("Room ID must be an un-empty segment trace."),
  body("ciphertext").isString().notEmpty().withMessage("E2EE encrypted payload required."),
  body("iv").isString().notEmpty().withMessage("Initialization vector parameters mandatory.")
];

exports.userPrivacyValidator = [
  body("hideLastSeen").optional().isBoolean(),
  body("hideOnlineStatus").optional().isBoolean(),
  body("hideReadReceipts").optional().isBoolean()
];

/**
 * File Binary Upload Mime Signature and Size Interceptor
 */
exports.enforceFileUploadSecurity = (req, res, next) => {
  if (!req.body || !req.body.fileUrl) {
    // No attachment to scan, safely bypass
    return next();
  }

  const { fileType, fileName, base64Data } = req.body;
  
  // Whitelisted media and Document families
  const allowedMimeTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp", "application/pdf"];
  const blockedExtensions = [".exe", ".apk", ".js", ".bat", ".sh", ".cmd", ".vbs"];

  if (fileType && !allowedMimeTypes.includes(fileType)) {
    return res.status(400).json({ error: "File type disallowed. Platforms allow JPG, PNG, WEBP, and PDF only." });
  }

  if (fileName) {
    const lowerName = fileName.toLowerCase();
    const hasMaliciousExt = blockedExtensions.some(ext => lowerName.endsWith(ext));
    if (hasMaliciousExt) {
      return res.status(400).json({ error: "Malicious executable or scripting file extension blocked." });
    }
  }

  // 10MB payload constraint threshold verification (assuming base64 transport structure overhead)
  if (base64Data) {
    const estimatedSizeBytes = (base64Data.length * 3) / 4;
    const maxBytes = 10 * 1024 * 1024; // 10 Megabytes
    if (estimatedSizeBytes > maxBytes) {
      return res.status(400).json({ error: "File attachment size capacity bounds exceeded. Limit: 10MB." });
    }
  }

  next();
};
