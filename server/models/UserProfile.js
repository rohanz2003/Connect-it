const mongoose = require("mongoose");

const userProfileSchema = new mongoose.Schema({
  email: { 
    type: String, 
    required: true, 
    unique: true, 
    lowercase: true, 
    trim: true,
    index: true 
  },
  displayName: { type: String, trim: true },
  profilePic: { type: String }, // Stored as Base64 for now
  bio: { type: String, trim: true },
  lastSeen: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

userProfileSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model("UserProfile", userProfileSchema);
