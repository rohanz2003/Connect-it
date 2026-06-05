const mongoose = require("mongoose");

const replyToSchema = new mongoose.Schema(
  {
    id: String,
    text: String,
    sender: String,
  },
  { _id: false }
);

const messageSchema = new mongoose.Schema({
  sender: { type: String, required: true, lowercase: true, trim: true },
  receiver: { type: String, required: true, lowercase: true, trim: true },
  text: mongoose.Schema.Types.Mixed,
  type: {
    type: String,
    enum: ["text", "media"],
    default: "text",
  },
  mediaType: String,
  tempId: { type: String, index: true, sparse: true },
  replyTo: replyToSchema,
  timestamp: { type: Date, default: Date.now, index: true },
  seen: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
});

messageSchema.index({ sender: 1, receiver: 1, timestamp: 1 });
messageSchema.index({ receiver: 1, sender: 1, timestamp: 1 });
messageSchema.index({ createdAt: 1 });

module.exports = mongoose.model("Message", messageSchema);
