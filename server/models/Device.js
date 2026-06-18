const mongoose = require("mongoose");

const deviceSchema = new mongoose.Schema(
  {
    deviceId: { type: String, required: true, unique: true },
    userId: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
      index: true,
    },
    socketId: { type: String, default: null },
    deviceName: { type: String, default: "Unknown Device", maxlength: 160 },
    deviceType: { type: String, default: "desktop", maxlength: 40 },
    platform: { type: String, default: null, maxlength: 80 },
    browser: { type: String, default: "Unknown", maxlength: 80 },
    os: { type: String, default: "Unknown", maxlength: 80 },
    userAgent: { type: String, default: null, maxlength: 1000 },
    pushSubscription: Object,
    isActive: { type: Boolean, default: false, index: true },
    revokedAt: { type: Date, default: null },
    lastSeen: { type: Date, default: Date.now },
    loginTime: { type: Date, default: Date.now },
    loggedInAt: { type: Date, default: Date.now },
  },
  { timestamps: true, strict: true }
);

deviceSchema.index({ userId: 1, lastSeen: -1 });

module.exports = mongoose.model("Device", deviceSchema);
