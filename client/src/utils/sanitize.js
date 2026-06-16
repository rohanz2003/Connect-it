import DOMPurify from "dompurify";

/**
 * XSS Sanitization Utilities
 * Sanitizes user-generated content before rendering to prevent XSS attacks.
 * Uses DOMPurify - https://github.com/cure53/DOMPurify
 */

/**
 * Sanitize HTML content to prevent XSS
 * Strips dangerous tags, attributes, and script content.
 * @param {string} dirty - Potentially unsafe HTML string
 * @returns {string} - Sanitized safe HTML
 */
export const sanitizeHtml = (dirty) => {
  if (typeof dirty !== "string") return "";
  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS: [
      "b", "i", "em", "strong", "a", "p", "br", "span", "code", "pre",
    ],
    ALLOWED_ATTR: ["href", "target", "rel", "class"],
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel):)/,
    ALLOW_DATA_ATTR: false,
  });
};

/**
 * Sanitize plain text (strips all HTML)
 * Use for message content that should be rendered as plain text.
 * @param {string} text - Potentially unsafe text
 * @returns {string} - Safe plain text
 */
export const sanitizeText = (text) => {
  if (typeof text !== "string") return "";
  return DOMPurify.sanitize(text, { ALLOWED_TAGS: [] });
};

/**
 * Sanitize a URL to prevent javascript: injection
 * @param {string} url - Potentially unsafe URL
 * @returns {string} - Safe URL or empty string
 */
export const sanitizeUrl = (url) => {
  if (typeof url !== "string") return "";
  // Only allow safe protocols
  if (/^(https?:\/\/|mailto:|tel:)/.test(url)) {
    return DOMPurify.sanitize(url, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
  }
  return "";
};

/**
 * Sanitize a filename (strip path traversal characters)
 * @param {string} filename - Potentially unsafe filename
 * @returns {string} - Safe filename
 */
export const sanitizeFilename = (filename) => {
  if (typeof filename !== "string") return "file";
  // Remove path traversal attempts
  return filename
    .replace(/[/\\]/g, "")
    .replace(/\.\./g, "")
    .substring(0, 255);
};

/**
 * Sanitize an email string
 * @param {string} email - Potentially unsafe email
 * @returns {string} - Sanitized lowercase email
 */
export const sanitizeEmail = (email) => {
  if (typeof email !== "string") return "";
  return email.toLowerCase().trim().replace(/[<>"'()]/g, "");
};

/**
 * Sanitize an object's string fields recursively
 * @param {Object} obj - Object with potentially unsafe string fields
 * @returns {Object} - Object with sanitized string fields
 */
export const sanitizeObject = (obj) => {
  if (!obj || typeof obj !== "object") return obj;

  const sanitized = Array.isArray(obj) ? [] : {};
  for (const key of Object.keys(obj)) {
    if (typeof obj[key] === "string") {
      sanitized[key] = sanitizeText(obj[key]);
    } else if (typeof obj[key] === "object" && obj[key] !== null) {
      sanitized[key] = sanitizeObject(obj[key]);
    } else {
      sanitized[key] = obj[key];
    }
  }
  return sanitized;
};

/**
 * React hook: sanitize message before rendering
 * Use this in your message rendering pipeline.
 * @param {string} message - Raw message text from server
 * @returns {string} - Safe message to render
 */
export const sanitizeMessage = (message) => {
  if (!message || typeof message !== "string") return "";

  // If message contains HTML, sanitize it as HTML
  if (/<[a-z][\s\S]*>/i.test(message)) {
    return sanitizeHtml(message);
  }

  // Plain text - remove any HTML entities that might be dangerous
  return sanitizeText(message);
};

export default {
  sanitizeHtml,
  sanitizeText,
  sanitizeUrl,
  sanitizeFilename,
  sanitizeEmail,
  sanitizeObject,
  sanitizeMessage,
};
