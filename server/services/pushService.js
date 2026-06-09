const webpush = require("web-push");
const PushSubscription = require("../models/PushSubscription");

const getVapidConfig = () => ({
  publicKey: process.env.VAPID_PUBLIC_KEY,
  privateKey: process.env.VAPID_PRIVATE_KEY,
  email: process.env.VAPID_EMAIL || "mailto:admin@example.com",
});

const initPush = () => {
  const config = getVapidConfig();
  if (config.publicKey && config.privateKey) {
    webpush.setVapidDetails(config.email, config.publicKey, config.privateKey);
    console.log("🔔 Web Push initialized");
  } else {
    console.warn("⚠️ VAPID keys not configured — push notifications disabled");
  }
};

const sendPushNotification = async (userId, payload) => {
  try {
    const sub = await PushSubscription.findOne({ userId }).lean();
    if (!sub) {
      console.log("⚠️ No push subscription for " + userId);
      return false;
    }
    await webpush.sendNotification(sub.subscription, JSON.stringify(payload));
    console.log("🔔 Push sent to " + userId + ": " + (payload.body || ""));
    return true;
  } catch (err) {
    if (err.statusCode === 410 || err.statusCode === 404) {
      console.log("🗑️ Removing expired push subscription for " + userId);
      await PushSubscription.deleteOne({ userId });
    } else {
      console.error("❌ Push error for " + userId + ": " + err.message);
    }
    return false;
  }
};

module.exports = { initPush, sendPushNotification, getVapidConfig };
