const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  displayName: { type: String, default: null },
  bio: { type: String, default: null },
  avatarUrl: { type: String, default: null },
  lastSeen: Date,
});

module.exports = mongoose.model("User", userSchema);