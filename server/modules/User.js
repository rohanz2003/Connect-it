const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  displayName: { type: String, default: null },
  bio: { type: String, default: null },
  avatarUrl: { type: String, default: null },
  lastSeen: Date,
  followersCount: { type: Number, default: 0 },
  followingCount: { type: Number, default: 0 },
  isVerified: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("User", userSchema);