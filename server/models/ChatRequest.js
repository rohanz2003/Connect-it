const mongoose = require("mongoose");

const chatRequestSchema = new mongoose.Schema({
  from: { type: String, required: true, lowercase: true, trim: true },
  to: { type: String, required: true, lowercase: true, trim: true },
  status: { type: String, enum: ["pending", "accepted", "rejected"], default: "pending" },
  createdAt: { type: Date, default: Date.now },
  respondedAt: { type: Date, default: null },
});

chatRequestSchema.index({ from: 1, to: 1 }, { unique: true });

module.exports = mongoose.model("ChatRequest", chatRequestSchema);
