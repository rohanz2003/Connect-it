const { body, param, query, validationResult } = require("express-validator");
const { normalizeEmail } = require("../utils/socketAuth");

const emailRule = (location, field) =>
  location(field)
    .isEmail()
    .withMessage(`${field} must be a valid email`)
    .bail()
    .normalizeEmail();

const safeText = (location, field, max = 2000) =>
  location(field)
    .optional({ nullable: true })
    .isString()
    .withMessage(`${field} must be a string`)
    .trim()
    .isLength({ max })
    .withMessage(`${field} is too long`)
    .custom((value) => {
      if (/<\s*script|javascript:|on\w+\s*=/i.test(value)) {
        throw new Error(`${field} contains unsafe content`);
      }
      return true;
    });

const validateRequest = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: "Validation failed",
      details: errors.array().map((err) => ({
        field: err.path,
        message: err.msg,
      })),
    });
  }
  next();
};

const encryptedPayloadRule = body("text").custom((value) => {
  const valid =
    value &&
    typeof value === "object" &&
    value.version === "v1" &&
    value.algorithm === "ECDH-AES-256-GCM" &&
    typeof value.iv === "string" &&
    typeof value.ciphertext === "string" &&
    value.senderPublicKey &&
    value.recipientPublicKey;

  if (!valid) {
    throw new Error("text must be an encrypted E2EE payload");
  }
  return true;
});

const messageQueryRules = [
  emailRule(query, "user1"),
  emailRule(query, "user2"),
  validateRequest,
];

const recentChatRules = [emailRule(query, "userEmail"), validateRequest];

const clearChatRules = [
  emailRule(body, "user"),
  emailRule(body, "partner"),
  validateRequest,
];

const profileRules = [
  emailRule(body, "email"),
  safeText(body, "displayName", 80),
  safeText(body, "bio", 500),
  body("avatarUrl").optional({ nullable: true }).isString().isLength({ max: 750000 }),
  validateRequest,
];

const publicKeyRules = [
  body("publicKey")
    .isObject()
    .withMessage("publicKey must be a JWK object")
    .custom((key) => {
      if (key.kty !== "EC" || key.crv !== "P-256" || !key.x || !key.y) {
        throw new Error("publicKey must be a P-256 ECDH public JWK");
      }
      return true;
    }),
  validateRequest,
];

const emailParamRules = [emailRule(param, "email"), validateRequest];

const lastSeenRules = [
  param("id").isEmail().withMessage("id must be a valid email").normalizeEmail(),
  validateRequest,
];

const blockRules = [
  emailRule(body, "targetEmail"),
  body("targetEmail").custom((target, { req }) => {
    if (normalizeEmail(target) === req.user?.email) {
      throw new Error("Cannot block yourself");
    }
    return true;
  }),
  validateRequest,
];

const reportRules = [
  emailRule(body, "targetEmail"),
  safeText(body, "reason", 1000),
  body("messageId").optional({ nullable: true }).isString().isLength({ max: 80 }),
  validateRequest,
];

const privacyRules = [
  body("hideLastSeen").optional().isBoolean().toBoolean(),
  body("hideOnlineStatus").optional().isBoolean().toBoolean(),
  body("hideReadReceipts").optional().isBoolean().toBoolean(),
  body("disappearingMessages.enabled").optional().isBoolean().toBoolean(),
  body("disappearingMessages.durationSeconds")
    .optional({ nullable: true })
    .isInt({ min: 0 })
    .toInt()
    .custom((value) => {
      const allowed = [0, 86400, 604800, 7776000];
      if (!allowed.includes(value)) {
        throw new Error("Disappearing message timer must be 0, 24h, 7d, or 90d");
      }
      return true;
    }),
  validateRequest,
];

const backupRules = [
  body("salt").isString().isLength({ min: 12, max: 512 }),
  body("iv").isString().isLength({ min: 12, max: 512 }),
  body("ciphertext").isString().isLength({ min: 1, max: 25 * 1024 * 1024 }),
  body("algorithm").equals("PBKDF2-AES-256-GCM"),
  validateRequest,
];

module.exports = {
  backupRules,
  blockRules,
  clearChatRules,
  emailParamRules,
  encryptedPayloadRule,
  lastSeenRules,
  messageQueryRules,
  privacyRules,
  profileRules,
  publicKeyRules,
  recentChatRules,
  reportRules,
  safeText,
  validateRequest,
};
