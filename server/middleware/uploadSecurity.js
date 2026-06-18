const crypto = require("crypto");
const path = require("path");
const multer = require("multer");

const MAX_FILE_SIZE = 10 * 1024 * 1024;

const allowedTypes = new Map([
  ["image/jpeg", [".jpg", ".jpeg"]],
  ["image/png", [".png"]],
  ["image/webp", [".webp"]],
  ["application/pdf", [".pdf"]],
]);

const blockedExtensions = new Set([".exe", ".apk", ".js", ".bat", ".cmd", ".sh", ".ps1", ".msi"]);

const randomFileName = (originalName) => {
  const ext = path.extname(originalName || "").toLowerCase();
  return `${crypto.randomUUID()}${ext}`;
};

const validateFileType = (file) => {
  const ext = path.extname(file.originalname || "").toLowerCase();
  if (blockedExtensions.has(ext)) {
    return false;
  }
  const allowedExts = allowedTypes.get(file.mimetype);
  return Boolean(allowedExts && allowedExts.includes(ext));
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE, files: 1 },
  fileFilter(req, file, callback) {
    if (!validateFileType(file)) {
      return callback(new Error("Unsupported or unsafe file type"));
    }
    callback(null, true);
  },
});

module.exports = {
  MAX_FILE_SIZE,
  allowedTypes,
  randomFileName,
  upload,
  validateFileType,
};
