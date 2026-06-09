const mongoose = require("mongoose");

const aiConversationSchema = new mongoose.Schema({
  userId: { type: String, required: true, lowercase: true, index: true },
  messages: [
    {
      role: { type: String, enum: ["user", "assistant", "system"], required: true },
      content: { type: String, required: true },
      timestamp: { type: Date, default: Date.now },
    },
  ],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

aiConversationSchema.pre("save", function (next) {
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.model("AiConversation", aiConversationSchema);
