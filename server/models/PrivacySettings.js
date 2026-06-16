const mongoose = require("mongoose");

const privacySettingsSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    index: true,
  },
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
    enum: [0, 86400, 604800, 7776000], // 0=off, 24h, 7d, 90d
    default: 0,
  },
  allowUnknownMessages: {
    type: Boolean,
    default: true,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model("PrivacySettings", privacySettingsSchema);
