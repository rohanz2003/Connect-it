const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  lastSeen: Date,
  avatarUrl: { type: String, default: null },
});

module.exports = mongoose.model("User", userSchema);