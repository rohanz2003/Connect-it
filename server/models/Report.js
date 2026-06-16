const mongoose = require("mongoose");

const reportSchema = new mongoose.Schema({
  reporter: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
    index: true,
  },
  reportedUser: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
    index: true,
  },
  messageId: {
    type: String,
    default: null,
  },
  reason: {
    type: String,
    required: true,
    trim: true,
    maxlength: 1000,
  },
  status: {
    type: String,
    enum: ["pending", "reviewed", "dismissed", "actioned"],
    default: "pending",
    index: true,
  },
  reviewedBy: {
    type: String,
    default: null,
  },
  reviewedAt: {
    type: Date,
    default: null,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

reportSchema.index({ status: 1, createdAt: -1 });
reportSchema.index({ reportedUser: 1, status: 1 });

module.exports = mongoose.model("Report", reportSchema);
