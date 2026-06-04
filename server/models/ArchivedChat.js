const mongoose = require("mongoose");

const archivedChatSchema = new mongoose.Schema({
  user: { type: String, required: true, lowercase: true, trim: true },
  partner: { type: String, required: true, lowercase: true, trim: true },
  archivedAt: { type: Date, default: Date.now },
});

archivedChatSchema.index({ user: 1, partner: 1 }, { unique: true });

module.exports = mongoose.model("ArchivedChat", archivedChatSchema);
