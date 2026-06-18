const mongoose = require("mongoose");

const fileAssetSchema = new mongoose.Schema(
  {
    owner: { type: String, required: true, lowercase: true, trim: true, index: true },
    originalName: { type: String, required: true, maxlength: 255 },
    storedName: { type: String, required: true, unique: true },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true, max: 10 * 1024 * 1024 },
    sha256: { type: String, required: true, index: true },
    scanStatus: {
      type: String,
      enum: ["clean", "blocked", "pending"],
      default: "pending",
      index: true,
    },
    storagePath: { type: String, required: true },
  },
  { timestamps: true }
);

fileAssetSchema.index({ owner: 1, createdAt: -1 });

module.exports = mongoose.model("FileAsset", fileAssetSchema);
