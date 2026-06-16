const { body, param, query, validationResult } = require("express-validator");

/**
 * Middleware: handleValidationErrors
 * Checks for validation errors and returns them in a formatted response.
 */
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: "Validation failed",
      details: errors.array().map((e) => ({
        field: e.path,
        message: e.msg,
        value: e.value,
      })),
    });
  }
  next();
};

/**
 * Validation rules for sending a message
 */
const validateMessage = [
  body("receiver")
    .notEmpty()
    .withMessage("Receiver is required")
    .isEmail()
    .withMessage("Receiver must be a valid email")
    .normalizeEmail(),
  body("text")
    .notEmpty()
    .withMessage("Message text is required")
    .isString()
    .withMessage("Message must be a string")
    .isLength({ max: 100000 })
    .withMessage("Message exceeds maximum length"),
  body("type")
    .optional()
    .isIn(["text", "media"])
    .withMessage("Type must be 'text' or 'media'"),
  handleValidationErrors,
];

/**
 * Validation rules for user email param
 */
const validateEmail = [
  param("id")
    .notEmpty()
    .withMessage("Email is required")
    .isEmail()
    .withMessage("Invalid email format")
    .normalizeEmail(),
  handleValidationErrors,
];

/**
 * Validation rules for user registration/update
 */
const validateUser = [
  body("email")
    .notEmpty()
    .withMessage("Email is required")
    .isEmail()
    .withMessage("Invalid email format")
    .normalizeEmail(),
  body("displayName")
    .optional()
    .isString()
    .withMessage("Display name must be a string")
    .isLength({ max: 50 })
    .withMessage("Display name must be under 50 characters")
    .trim()
    .escape(),
  body("bio")
    .optional()
    .isString()
    .withMessage("Bio must be a string")
    .isLength({ max: 500 })
    .withMessage("Bio must be under 500 characters")
    .trim()
    .escape(),
  handleValidationErrors,
];

/**
 * Validation rules for report
 */
const validateReport = [
  body("reportedUser")
    .notEmpty()
    .withMessage("Reported user is required")
    .isEmail()
    .withMessage("Invalid email format")
    .normalizeEmail(),
  body("reason")
    .notEmpty()
    .withMessage("Reason is required")
    .isString()
    .withMessage("Reason must be a string")
    .isLength({ min: 10, max: 1000 })
    .withMessage("Reason must be between 10 and 1000 characters"),
  body("messageId").optional().isString(),
  handleValidationErrors,
];

module.exports = {
  validateMessage,
  validateEmail,
  validateUser,
  validateReport,
  handleValidationErrors,
};
