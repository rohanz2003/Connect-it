const mongoose = require("mongoose");
const crypto = require("crypto");

const refreshTokenSchema = new mongoose.Schema(
  {
    token: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    userId: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    deviceId: {
      type: String,
      default: null,
    },
    userAgent: {
      type: String,
      default: null,
    },
    ip: {
      type: String,
      default: null,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: { expireAfterSeconds: 0 },
    },
    revokedAt: {
      type: Date,
      default: null,
    },
    replacedBy: {
      type: String,
      default: null,
    },
  },
  { timestamps: true }
);

refreshTokenSchema.statics.generateToken = function () {
  return crypto.randomBytes(48).toString("hex");
};

refreshTokenSchema.statics.createForUser = async function ({
  userId,
  deviceId,
  userAgent,
  ip,
}) {
  const token = this.generateToken();
  const expiresAt = new Date(
    Date.now() +
      (parseInt(process.env.JWT_REFRESH_EXPIRES_IN_MS, 10) || 7 * 24 * 60 * 60 * 1000)
  );
  return this.create({
    token,
    userId,
    deviceId,
    userAgent,
    ip,
    expiresAt,
  });
};

refreshTokenSchema.statics.revokeAllForUser = async function (userId) {
  return this.updateMany(
    { userId, revokedAt: null, expiresAt: { $gt: new Date() } },
    { revokedAt: new Date() }
  );
};

refreshTokenSchema.statics.revokeAllExcept = async function (userId, excludeToken) {
  return this.updateMany(
    {
      userId,
      token: { $ne: excludeToken },
      revokedAt: null,
      expiresAt: { $gt: new Date() },
    },
    { revokedAt: new Date() }
  );
};

module.exports = mongoose.model("RefreshToken", refreshTokenSchema);
