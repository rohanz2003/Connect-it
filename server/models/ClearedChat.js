const mongoose = require("mongoose");

const clearedChatSchema = new mongoose.Schema({
  user: { type: String, required: true, lowercase: true, trim: true },
  partner: { type: String, required: true, lowercase: true, trim: true },
  clearedAt: { type: Date, default: Date.now },
});

clearedChatSchema.index({ user: 1, partner: 1 }, { unique: true });

module.exports = mongoose.model("ClearedChat", clearedChatSchema);
