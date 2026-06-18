const mongoose = require("mongoose");

const replyToSchema = new mongoose.Schema(
  {
    id: String,
    text: { type: String, maxlength: 200 },
    sender: { type: String, lowercase: true, trim: true },
  },
  { _id: false }
);

const encryptedPayloadSchema = new mongoose.Schema(
  {
    version: { type: String, enum: ["v1"], required: true },
    algorithm: { type: String, enum: ["ECDH-AES-256-GCM"], required: true },
    iv: { type: String, required: true },
    ciphertext: { type: String, required: true },
    senderPublicKey: { type: mongoose.Schema.Types.Mixed, required: true },
    recipientPublicKey: { type: mongoose.Schema.Types.Mixed, required: true },
    senderKeyFingerprint: { type: String, default: null },
    recipientKeyFingerprint: { type: String, default: null },
  },
  { _id: false, strict: true }
);

const messageSchema = new mongoose.Schema(
  {
    sender: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
      index: true,
    },
    receiver: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
      index: true,
    },
    text: { type: encryptedPayloadSchema, required: true },
    type: {
      type: String,
      enum: ["text", "media"],
      default: "text",
    },
    mediaType: {
      type: String,
      enum: ["text", "image", "application", "file", null],
      default: null,
    },
    tempId: { type: String, index: true, sparse: true, maxlength: 120 },
    replyTo: replyToSchema,
    timestamp: { type: Date, default: Date.now, index: true },
    status: {
      type: String,
      enum: ["sent", "delivered", "read"],
      default: "sent",
    },
    deliveredDevices: [{ type: String }],
    readDevices: [{ type: String }],
    deletedFor: [{ type: String, lowercase: true, trim: true }],
    deletedForEveryone: { type: Boolean, default: false },
    expiresAt: { type: Date, default: null, index: true },
  },
  { timestamps: true, strict: true }
);

messageSchema.index({ sender: 1, receiver: 1, timestamp: 1 });
messageSchema.index({ receiver: 1, sender: 1, timestamp: 1 });
messageSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0, partialFilterExpression: { expiresAt: { $type: "date" } } });

module.exports = mongoose.model("Message", messageSchema);
