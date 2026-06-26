const mongoose = require("mongoose");

const feedbackSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true },
  type: { type: String, enum: ["suggestion", "bug", "compliment", "other"], default: "suggestion" },
  message: { type: String, required: true },
  rating: { type: Number, required: true },
  reply: { type: String, default: null },
  repliedAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Feedback", feedbackSchema);
