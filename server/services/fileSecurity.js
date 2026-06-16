const crypto = require("crypto");
const path = require("path");

// ============================================================
// FILE UPLOAD SECURITY MODULE
// ============================================================

// Whitelist of allowed MIME types
const ALLOWED_MIME_TYPES = new Set([
  // Images
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/svg+xml",
  // Documents
  "application/pdf",
  // Audio
  "audio/mpeg",
  "audio/ogg",
  "audio/wav",
  "audio/webm",
  // Video
  "video/mp4",
  "video/webm",
  "video/ogg",
]);

// Whitelist of allowed file extensions
const ALLOWED_EXTENSIONS = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".gif",
  ".svg",
  ".pdf",
  ".mp3",
  ".ogg",
  ".wav",
  ".mp4",
  ".webm",
]);

// MIME type to extension mapping for validation
const MIME_TO_EXT = {
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/webp": [".webp"],
  "image/gif": [".gif"],
  "image/svg+xml": [".svg"],
  "application/pdf": [".pdf"],
  "audio/mpeg": [".mp3"],
  "audio/ogg": [".ogg"],
  "audio/wav": [".wav"],
  "audio/webm": [".webm"],
  "video/mp4": [".mp4"],
  "video/webm": [".webm"],
  "video/ogg": [".ogg"],
};

// Blocked file types (even if MIME matches)
const BLOCKED_EXTENSIONS = new Set([
  ".exe",
  ".apk",
  ".js",
  ".bat",
  ".cmd",
  ".sh",
  ".ps1",
  ".vbs",
  ".dll",
  ".msi",
  ".jar",
  ".php",
  ".py",
  ".rb",
]);

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_DOCUMENT_SIZE = 10 * 1024 * 1024; // 10MB

/**
 * Validate a file before upload
 * @param {Object} file - File object with { originalname, mimetype, size, buffer }
 * @returns {Object} { valid: boolean, error?: string }
 */
const validateFile = (file) => {
  const errors = [];

  // 1. Check file exists
  if (!file || !file.originalname || !file.mimetype) {
    return { valid: false, error: "No file provided or invalid file object." };
  }

  // 2. Check file size
  if (!file.size || file.size <= 0) {
    return { valid: false, error: "File is empty." };
  }

  if (file.size > MAX_FILE_SIZE) {
    return {
      valid: false,
      error: `File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB.`,
    };
  }

  // 3. Check file extension
  const ext = path.extname(file.originalname).toLowerCase();
  if (BLOCKED_EXTENSIONS.has(ext)) {
    return {
      valid: false,
      error: `File type "${ext}" is not allowed for security reasons.`,
    };
  }

  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return {
      valid: false,
      error: `File type "${ext}" is not supported. Allowed: ${Array.from(ALLOWED_EXTENSIONS).join(", ")}`,
    };
  }

  // 4. Validate MIME type
  if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
    return {
      valid: false,
      error: `MIME type "${file.mimetype}" is not allowed.`,
    };
  }

  // 5. Cross-validate MIME type matches extension
  const expectedExts = MIME_TO_EXT[file.mimetype];
  if (expectedExts && !expectedExts.includes(ext)) {
    return {
      valid: false,
      error: `MIME type "${file.mimetype}" does not match file extension "${ext}". Possible tampering detected.`,
    };
  }

  // 6. Size limits per type
  if (file.mimetype.startsWith("image/") && file.size > MAX_IMAGE_SIZE) {
    return { valid: false, error: "Image file too large. Maximum 10MB." };
  }

  if (file.mimetype === "application/pdf" && file.size > MAX_DOCUMENT_SIZE) {
    return { valid: false, error: "PDF file too large. Maximum 10MB." };
  }

  return { valid: true };
};

/**
 * Generate a secure random filename while preserving extension
 * @param {string} originalname - Original file name
 * @returns {string} - Secure random filename
 */
const generateSecureFilename = (originalname) => {
  const ext = path.extname(originalname).toLowerCase();
  const randomName = crypto.randomBytes(16).toString("hex");
  return `${randomName}${ext}`;
};

/**
 * Sanitize file metadata for storage
 * Removes any potentially malicious metadata
 * @param {Object} file - File object
 * @returns {Object} - Sanitized file metadata
 */
const sanitizeFileMetadata = (file) => {
  return {
    originalName: path.basename(file.originalname, path.extname(file.originalname))
      .replace(/[^a-zA-Z0-9-_ ]/g, "")
      .substring(0, 100),
    mimeType: file.mimetype,
    size: file.size,
    extension: path.extname(file.originalname).toLowerCase(),
    secureName: generateSecureFilename(file.originalname),
    uploadedAt: new Date().toISOString(),
  };
};

/**
 * Scan file for potential malware (hook for external AV API)
 * In production, integrate with ClamAV or similar
 * @param {Buffer} fileBuffer - File contents
 * @returns {Promise<{ safe: boolean, threats: string[] }>}
 */
const scanFile = async (fileBuffer) => {
  // Placeholder for antivirus/malware scanning integration
  // In production, integrate with:
  // - ClamAV (clamdscan)
  // - VirusTotal API
  // - AWS GuardDuty
  //
  // Example:
  // const result = await clamdscan(fileBuffer);
  // if (result.isInfected) { return { safe: false, threats: result.viruses }; }

  return { safe: true, threats: [] };
};

/**
 * Full file validation pipeline
 * @param {Object} file - File object
 * @returns {Promise<Object>} - Validation result with metadata if valid
 */
const processFileUpload = async (file) => {
  // Step 1: Basic validation
  const validation = validateFile(file);
  if (!validation.valid) {
    return { allowed: false, error: validation.error };
  }

  // Step 2: Malware scan
  const scanResult = await scanFile(file.buffer);
  if (!scanResult.safe) {
    return {
      allowed: false,
      error: `File flagged as potentially unsafe: ${scanResult.threats.join(", ")}`,
    };
  }

  // Step 3: Generate secure metadata
  const metadata = sanitizeFileMetadata(file);

  return {
    allowed: true,
    metadata,
    secureFilename: metadata.secureName,
  };
};

module.exports = {
  validateFile,
  generateSecureFilename,
  sanitizeFileMetadata,
  scanFile,
  processFileUpload,
  ALLOWED_MIME_TYPES,
  ALLOWED_EXTENSIONS,
  BLOCKED_EXTENSIONS,
  MAX_FILE_SIZE,
};
