const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema({
  sender: String,
  receiver: String,
  text: mongoose.Schema.Types.Mixed, // Can be string or object (for media)
  type: {
    type: String,
    enum: ['text', 'media'],
    default: 'text'
  },
  mediaType: String, // 'image', 'video', 'application'
  tempId: String, // Temporary ID to prevent duplicates
  timestamp: Date, // Add timestamp to match client
  seen: {
    type: Boolean,
    default: false,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model("Message", messageSchema);