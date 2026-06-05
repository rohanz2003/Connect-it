const mongoose = require("mongoose");

const userProfileSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true },
  displayName: { type: String, default: "" },
  profilePic: { type: String, default: "" }, // Base64 or URL
  bio: { type: String, default: "" },
  lastSeen: { type: Date, default: Date.now },
  isOnline: { type: Boolean, default: false },
  lastActivity: { type: Date, default: Date.now },
}, { timestamps: true });

userProfileSchema.index({ email: 1 });
userProfileSchema.index({ isOnline: 1 });
userProfileSchema.index({ lastActivity: -1 });

module.exports = mongoose.model("UserProfile", userProfileSchema);
