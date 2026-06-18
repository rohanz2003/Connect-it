const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema({
  senderId: { type: String, required: true, index: true, lowercase: true, trim: true },
  receiverId: { type: String, required: true, index: true, lowercase: true, trim: true },
  roomId: { type: String, required: true, index: true },
  
  // E2EE Data Storage Fields
  ciphertext: { type: String, required: true },
  iv: { type: String, required: true },
  
  // Attachments
  fileUrl: { type: String, default: null },
  fileName: { type: String, default: null },
  fileType: { type: String, default: null },
  
  isRead: { type: Boolean, default: false },
  
  // Privacy & Disappearing settings
  disappearingTimer: { type: Number, default: 0 }, // 0 = disabled, or 24, 7, 90 (in hours/days)
  expiresAt: { type: Date, default: null, index: { expires: 0 } }, // Mongoose TTL index
  
  createdAt: { type: Date, default: Date.now, index: true }
});

module.exports = mongoose.model("Message", messageSchema);
