const mongoose = require("mongoose");

const deviceSchema = new mongoose.Schema({
  deviceId: { type: String, required: true, unique: true },
  userId: { type: String, required: true, lowercase: true, trim: true, index: true },
  socketId: { type: String, default: null },
  deviceName: { type: String, default: "Unknown Device" },
  deviceType: { type: String, default: "desktop" },
  browser: { type: String, default: "Unknown" },
  os: { type: String, default: "Unknown" },
  pushSubscription: Object,
  isActive: { type: Boolean, default: false },
  lastSeen: { type: Date, default: Date.now },
  loggedInAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Device", deviceSchema);
