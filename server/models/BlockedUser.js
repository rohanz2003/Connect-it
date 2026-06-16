const mongoose = require("mongoose");

const blockedUserSchema = new mongoose.Schema({
  blocker: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
    index: true,
  },
  blocked: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
    index: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Ensure unique block relationship
blockedUserSchema.index({ blocker: 1, blocked: 1 }, { unique: true });

// Also index for checking if user is blocked (reverse lookup)
blockedUserSchema.index({ blocked: 1, blocker: 1 });

module.exports = mongoose.model("BlockedUser", blockedUserSchema);
