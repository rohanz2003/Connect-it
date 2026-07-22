const mongoose = require("mongoose");

const storyViewSchema = new mongoose.Schema({
  viewer: { type: String, required: true, lowercase: true, trim: true },
  viewedAt: { type: Date, default: Date.now },
  reaction: { type: String, default: null },
}, { _id: false });

const storyCommentSchema = new mongoose.Schema({
  user: { type: String, required: true, lowercase: true, trim: true },
  text: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
}, { _id: false });

const storySchema = new mongoose.Schema({
  user: { type: String, required: true, lowercase: true, trim: true, index: true },
  mediaUrl: { type: String, required: true },
  mediaType: { type: String, enum: ["image", "video"], required: true },
  privacy: { type: String, enum: ["public", "private"], default: "public" },
  caption: { type: String, default: "" },
  views: [storyViewSchema],
  comments: [storyCommentSchema],
  createdAt: { type: Date, default: Date.now, index: true },
  expiresAt: { type: Date, default: () => new Date(Date.now() + 24 * 60 * 60 * 1000), index: { expires: 0 } },
});

storySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("Story", storySchema);
