const mongoose = require("mongoose");

const deviceSchema = new mongoose.Schema({
  deviceId: { type: String, required: true, unique: true, index: true },
  userId: { type: String, required: true, index: true, lowercase: true, trim: true },
  platform: { type: String, required: true },
  browser: { type: String, required: true },
  ipAddress: { type: String, required: true },
  isActive: { type: Boolean, default: true },
  loginTime: { type: Date, default: Date.now },
  lastSeen: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Device", deviceSchema);
