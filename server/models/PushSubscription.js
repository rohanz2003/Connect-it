const mongoose = require("mongoose");

const pushSubscriptionSchema = new mongoose.Schema({
  userId: { type: String, required: true, lowercase: true, trim: true, unique: true },
  subscription: { type: Object, required: true },
  deviceInfo: String,
  updatedAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("PushSubscription", pushSubscriptionSchema);
