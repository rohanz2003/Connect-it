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
      return false;
    }
    await webpush.sendNotification(sub.subscription, JSON.stringify(payload));
    console.log("🔔 Push sent to " + userId);
    return true;
  } catch (err) {
    if (err.statusCode === 410 || err.statusCode === 404) {
      await PushSubscription.deleteOne({ userId });
    }
    return false;
  }
};

// Send push to ALL subscriptions (broadcast)
const broadcastPush = async (payload) => {
  const subscriptions = await PushSubscription.find({}).lean();
  let sent = 0;
  let failed = 0;

  const results = await Promise.allSettled(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(sub.subscription, JSON.stringify(payload));
        sent++;
      } catch (err) {
        failed++;
        if (err.statusCode === 410 || err.statusCode === 404) {
          await PushSubscription.deleteOne({ userId: sub.userId });
        }
      }
    })
  );

  return { sent, failed, total: subscriptions.length };
};

module.exports = { initPush, sendPushNotification, broadcastPush, getVapidConfig };
