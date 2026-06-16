const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  },
  displayName: {
    type: String,
    default: null,
    trim: true,
    maxlength: 50,
  },
  bio: {
    type: String,
    default: null,
    trim: true,
    maxlength: 500,
  },
  avatarUrl: {
    type: String,
    default: null,
  },
  lastSeen: {
    type: Date,
    default: null,
    index: true,
  },
  // RBAC: User Role
  role: {
    type: String,
    enum: ["user", "moderator", "admin"],
    default: "user",
    index: true,
  },
  // Account status
  isActive: {
    type: Boolean,
    default: true,
    index: true,
  },
  isDeleted: {
    type: Boolean,
    default: false,
  },
  deletedAt: {
    type: Date,
    default: null,
  },
  // E2EE: Public key for end-to-end encryption
  publicKey: {
    type: String,
    default: null,
  },
  // Privacy settings (cached from PrivacySettings model for quick access)
  hideLastSeen: {
    type: Boolean,
    default: false,
  },
  hideOnlineStatus: {
    type: Boolean,
    default: false,
  },
  hideReadReceipts: {
    type: Boolean,
    default: false,
  },
  disappearingMessages: {
    type: Number,
    default: 0,
  },
  // Failed login tracking
  failedLoginAttempts: {
    type: Number,
    default: 0,
  },
  lockedUntil: {
    type: Date,
    default: null,
  },
}, {
  timestamps: true,
});

// Indexes for efficient querying
userSchema.index({ email: 1 });
userSchema.index({ role: 1, isActive: 1 });
userSchema.index({ lastSeen: -1 });

// Sanitize user output (remove sensitive fields)
userSchema.methods.toSafeObject = function () {
  const obj = this.toObject();
  delete obj.failedLoginAttempts;
  delete obj.lockedUntil;
  delete obj.__v;
  return obj;
};

module.exports = mongoose.model("User", userSchema);