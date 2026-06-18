const mongoose = require("mongoose");

const reportSchema = new mongoose.Schema(
  {
    reporter: { type: String, required: true, lowercase: true, trim: true, index: true },
    reportedUser: { type: String, required: true, lowercase: true, trim: true, index: true },
    messageId: { type: String, default: null },
    reason: { type: String, required: true, maxlength: 1000, trim: true },
    status: {
      type: String,
      enum: ["open", "reviewing", "closed"],
      default: "open",
      index: true,
    },
  },
  { timestamps: true }
);

reportSchema.index({ reporter: 1, reportedUser: 1, createdAt: -1 });

module.exports = mongoose.model("Report", reportSchema);
