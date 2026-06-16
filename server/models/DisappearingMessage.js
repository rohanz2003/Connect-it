const mongoose = require("mongoose");

const disappearingMessageSchema = new mongoose.Schema({
  messageId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Message",
    required: true,
    unique: true,
    index: true,
  },
  chatPartner: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
    index: true,
  },
  timer: {
    type: Number,
    required: true,
    enum: [0, 86400, 604800, 7776000], // 0=off, 24h, 7d, 90d (in seconds)
    default: 0,
  },
  deleteAt: {
    type: Date,
    required: true,
    index: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// TTL index: MongoDB auto-deletes when deleteAt is reached
disappearingMessageSchema.index({ deleteAt: 1 }, { expireAfterSeconds: 0 });

// Compound index for querying by user
disappearingMessageSchema.index({ chatPartner: 1, deleteAt: 1 });

module.exports = mongoose.model("DisappearingMessage", disappearingMessageSchema);
