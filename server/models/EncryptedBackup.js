const mongoose = require("mongoose");

const encryptedBackupSchema = new mongoose.Schema(
  {
    user: { type: String, required: true, lowercase: true, trim: true, index: true },
    algorithm: {
      type: String,
      enum: ["PBKDF2-AES-256-GCM"],
      required: true,
    },
    kdf: {
      type: String,
      enum: ["PBKDF2-SHA-256"],
      default: "PBKDF2-SHA-256",
    },
    iterations: { type: Number, default: 250000, min: 100000 },
    salt: { type: String, required: true },
    iv: { type: String, required: true },
    ciphertext: { type: String, required: true },
    size: { type: Number, default: 0 },
  },
  { timestamps: true }
);

encryptedBackupSchema.index({ user: 1, updatedAt: -1 });

module.exports = mongoose.model("EncryptedBackup", encryptedBackupSchema);
