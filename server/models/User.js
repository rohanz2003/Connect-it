const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, index: true, lowercase: true, trim: true },
  displayName: { type: String, default: "" },
  profilePic: { type: String, default: "" },
  
  // Enterprise RBAC Roles
  role: { type: String, required: true, enum: ["User", "Moderator", "Admin"], default: "User" },
  
  // Cryptographic Public Keys for E2EE Identity
  publicKeyBase64: { type: String, default: null },
  
  // Privacy Control Sets
  hideLastSeen: { type: Boolean, default: false },
  hideOnlineStatus: { type: Boolean, default: false },
  hideReadReceipts: { type: Boolean, default: false },
  
  // Compliance & Governance Lists
  blockedUsers: [{ type: String, lowercase: true, trim: true }],
  reportedBy: [{
    reporterId: { type: String, lowercase: true, trim: true },
    reason: { type: String },
    createdAt: { type: Date, default: Date.now }
  }],
  
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("User", userSchema);
