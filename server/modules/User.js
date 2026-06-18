const mongoose = require("mongoose");

const publicKeySchema = new mongoose.Schema(
  {
    kty: { type: String, enum: ["EC"], required: true },
    crv: { type: String, enum: ["P-256"], required: true },
    x: { type: String, required: true },
    y: { type: String, required: true },
    key_ops: [{ type: String }],
    ext: { type: Boolean, default: true },
  },
  { _id: false, strict: true }
);

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
      index: true,
    },
    displayName: { type: String, default: null, trim: true, maxlength: 80 },
    bio: { type: String, default: null, trim: true, maxlength: 500 },
    avatarUrl: { type: String, default: null },
    role: {
      type: String,
      enum: ["user", "moderator", "admin"],
      default: "user",
      index: true,
    },
    phone: { type: String, default: null, trim: true },
    phoneVerified: { type: Boolean, default: false },
    publicKey: { type: publicKeySchema, default: null },
    publicKeyUpdatedAt: { type: Date, default: null },
    blockedUsers: [{ type: String, lowercase: true, trim: true }],
    privacy: {
      hideLastSeen: { type: Boolean, default: false },
      hideOnlineStatus: { type: Boolean, default: false },
      hideReadReceipts: { type: Boolean, default: false },
      disappearingMessages: {
        enabled: { type: Boolean, default: false },
        durationSeconds: {
          type: Number,
          enum: [0, 86400, 604800, 7776000],
          default: 0,
        },
      },
    },
    lastSeen: Date,
  },
  { timestamps: true, strict: true }
);

userSchema.index({ "privacy.hideOnlineStatus": 1 });

module.exports = mongoose.model("User", userSchema);
