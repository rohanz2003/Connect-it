// Admin Controller - Get all data from database
const admin = require("firebase-admin");
const mongoose = require("mongoose");
const Message = require("../models/Message");
const Feedback = require("../models/Feedback");
const User = require("../modules/User");
const ClearedChat = require("../models/ClearedChat");
const ChatRequest = require("../models/ChatRequest");
const PushSubscription = require("../models/PushSubscription");
const Device = require("../models/Device");
const { decryptMessageDoc } = require("../utils/messageCrypto");
const { sendPushNotification, broadcastPush } = require("../services/pushService");
const { sendNotificationEmail } = require("../services/emailService");

// Get all messages with sender details
exports.getAllMessages = async (req, res) => {
  try {
    const messages = await Message.find().sort({ createdAt: -1 }).limit(1000).lean();
    res.json(messages.map(decryptMessageDoc));
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch messages", details: error.message });
  }
};

// Get all feedback
exports.getAllFeedback = async (req, res) => {
  try {
    const feedback = await Feedback.find().sort({ createdAt: -1 });
    res.json(feedback);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch feedback", details: error.message });
  }
};

// Get all users
exports.getAllUsers = async (req, res) => {
  try {
    const users = await User.find().sort({ lastSeen: -1 });
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch users", details: error.message });
  }
};

// Get dashboard statistics
exports.getDashboardStats = async (req, res) => {
  try {
    const totalMessages = await Message.countDocuments();
    const totalFeedback = await Feedback.countDocuments();
    const totalUsers = await User.countDocuments();

    // Get average rating from feedback
    const feedbackRatings = await Feedback.find({}, { rating: 1 });
    const averageRating =
      feedbackRatings.length > 0
        ? (feedbackRatings.reduce((sum, fb) => sum + fb.rating, 0) / feedbackRatings.length).toFixed(2)
        : 0;

    res.json({
      totalMessages,
      totalFeedback,
      totalUsers,
      averageRating,
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch dashboard stats", details: error.message });
  }
};

// Get message statistics
exports.getMessageStats = async (req, res) => {
  try {
    const stats = await Message.aggregate([
      {
        $group: {
          _id: "$sender",
          messageCount: { $sum: 1 },
        },
      },
      { $sort: { messageCount: -1 } },
      { $limit: 10 },
    ]);
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch message stats", details: error.message });
  }
};

// Admin delete user — removes from MongoDB + Firebase Auth
exports.adminDeleteUser = async (req, res) => {
  try {
    const { email } = req.params;
    if (!email) return res.status(400).json({ error: "Email is required" });

    const normalizedEmail = email.toLowerCase();

    // Prevent admin from deleting themselves
    if (req.adminEmail && req.adminEmail.toLowerCase() === normalizedEmail) {
      return res.status(400).json({ error: "Cannot delete your own admin account" });
    }

    // Delete from all MongoDB collections
    await Promise.all([
      User.deleteOne({ email: normalizedEmail }),
      Message.deleteMany({
        $or: [{ sender: normalizedEmail }, { receiver: normalizedEmail }],
      }),
      ClearedChat.deleteMany({
        $or: [{ user: normalizedEmail }, { partner: normalizedEmail }],
      }),
      ChatRequest.deleteMany({
        $or: [{ from: normalizedEmail }, { to: normalizedEmail }],
      }),
      Feedback.deleteMany({ email: normalizedEmail }),
      PushSubscription.deleteMany({ userId: normalizedEmail }),
      Device.deleteMany({ userId: normalizedEmail }),
    ]);

    // Delete from Firebase Auth (if configured)
    let firebaseDeleted = false;
    try {
      const { initFirebase } = require("../config/firebase");
      const app = initFirebase();
      if (app) {
        const firebaseAdmin = require("firebase-admin");
        // Find user by email and delete
        const userRecord = await firebaseAdmin.auth().getUserByEmail(normalizedEmail);
        await firebaseAdmin.auth().deleteUser(userRecord.uid);
        firebaseDeleted = true;
        console.log(`🗑️ Firebase Auth user deleted: ${normalizedEmail}`);
      }
    } catch (fbErr) {
      // User may not exist in Firebase — that's okay
      if (fbErr.code === "auth/user-not-found") {
        firebaseDeleted = true; // Already gone
      } else {
        console.warn(`⚠️ Firebase Auth deletion failed for ${normalizedEmail}:`, fbErr.message);
      }
    }

    console.log(`🗑️ Admin deleted user: ${normalizedEmail}`);
    res.json({
      success: true,
      message: `User ${normalizedEmail} deleted`,
      firebaseDeleted,
    });
  } catch (error) {
    console.error("Admin delete user error:", error.message);
    res.status(500).json({ error: "Failed to delete user" });
  }
};

// System health check — real accurate data
exports.getSystemHealth = async (req, res) => {
  try {
    const mongoState = mongoose.connection.readyState;
    const mongoLabel = ["disconnected", "connected", "connecting", "disconnecting"][mongoState] || "unknown";

    const now = new Date();
    const oneHourAgo = new Date(now - 60 * 60 * 1000);
    const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);

    // Collection counts
    const [totalUsers, totalMessages, totalFeedback, totalDevices, totalPushSubs, totalChatRequests] = await Promise.all([
      User.countDocuments(),
      Message.countDocuments(),
      Feedback.countDocuments(),
      Device.countDocuments(),
      PushSubscription.countDocuments(),
      ChatRequest.countDocuments(),
    ]);

    // Active online users (active in last 5 minutes)
    const fiveMinAgo = new Date(now - 5 * 60 * 1000);
    const onlineNow = await Device.countDocuments({ isActive: true, lastSeen: { $gte: fiveMinAgo } });
    const onlineUsers = await Device.distinct("userId", { isActive: true, lastSeen: { $gte: fiveMinAgo } });

    // Active in last hour
    const activeLastHour = await User.countDocuments({ lastSeen: { $gte: oneHourAgo } });
    const activeLastDay = await User.countDocuments({ lastSeen: { $gte: oneDayAgo } });

    // Messages in time ranges
    const messagesLastHour = await Message.countDocuments({ createdAt: { $gte: oneHourAgo } });
    const messagesLastDay = await Message.countDocuments({ createdAt: { $gte: oneDayAgo } });
    const messagesLastWeek = await Message.countDocuments({ createdAt: { $gte: sevenDaysAgo } });

    // Chat request stats
    const [pendingRequests, acceptedRequests, rejectedRequests] = await Promise.all([
      ChatRequest.countDocuments({ status: "pending" }),
      ChatRequest.countDocuments({ status: "accepted" }),
      ChatRequest.countDocuments({ status: "rejected" }),
    ]);

    // Feedback stats
    const [repliedFeedback, unrepliedFeedback] = await Promise.all([
      Feedback.countDocuments({ reply: { $ne: null } }),
      Feedback.countDocuments({ reply: null }),
    ]);

    // Average feedback rating
    const feedbackAgg = await Feedback.aggregate([
      { $group: { _id: null, avg: { $avg: "$rating" }, count: { $sum: 1 } } },
    ]);
    const avgRating = feedbackAgg.length > 0 ? feedbackAgg[0].avg.toFixed(1) : "0.0";
    const totalRatings = feedbackAgg.length > 0 ? feedbackAgg[0].count : 0;

    // Message trends (last 7 days, grouped by day)
    const messageTrends = await Message.aggregate([
      { $match: { createdAt: { $gte: sevenDaysAgo } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    // Device type breakdown
    const deviceBreakdown = await Device.aggregate([
      { $group: { _id: "$deviceType", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);

    // Browser breakdown
    const browserBreakdown = await Device.aggregate([
      { $group: { _id: "$browser", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 5 },
    ]);

    // OS breakdown
    const osBreakdown = await Device.aggregate([
      { $group: { _id: "$os", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 5 },
    ]);

    // New users per day (last 7 days)
    const newUsersTrend = await User.aggregate([
      { $match: { createdAt: { $gte: sevenDaysAgo } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    // Database collection sizes
    const db = mongoose.connection.db;
    let dbStats = {};
    try {
      const collections = await db.listCollections().toArray();
      for (const col of collections) {
        const stats = await db.command({ collStats: col.name });
        dbStats[col.name] = {
          count: stats.count,
          sizeBytes: stats.size || 0,
          avgObjSize: stats.avgObjSize || 0,
        };
      }
    } catch {}

    // Server info
    const mem = process.memoryUsage();
    const { isFirebaseConfigured } = require("../config/firebase");

    res.json({
      server: {
        uptime: Math.floor(process.uptime()),
        uptimeFormatted: formatUptime(process.uptime()),
        memory: {
          heapUsed: Math.floor(mem.heapUsed / 1024 / 1024),
          heapTotal: Math.floor(mem.heapTotal / 1024 / 1024),
          rss: Math.floor(mem.rss / 1024 / 1024),
          external: Math.floor(mem.external / 1024 / 1024),
        },
        nodeVersion: process.version,
        environment: process.env.NODE_ENV || "development",
        platform: process.platform,
      },
      database: {
        status: mongoLabel,
        connected: mongoState === 1,
        collections: dbStats,
      },
      online: {
        devicesOnline: onlineNow,
        usersOnline: onlineUsers.length,
        onlineUserEmails: onlineUsers,
      },
      stats: {
        totalUsers,
        totalMessages,
        totalFeedback,
        totalDevices,
        totalPushSubs,
        totalChatRequests,
        activeLastHour,
        activeLastDay,
        messagesLastHour,
        messagesLastDay,
        messagesLastWeek,
        pendingRequests,
        acceptedRequests,
        rejectedRequests,
        repliedFeedback,
        unrepliedFeedback,
        avgRating,
        totalRatings,
      },
      trends: {
        messageTrends,
        newUsersTrend,
      },
      platforms: {
        deviceTypes: deviceBreakdown,
        browsers: browserBreakdown,
        operatingSystems: osBreakdown,
      },
      services: {
        firebase: isFirebaseConfigured(),
        email: !!(process.env.RESEND_API_KEY),
      },
    });
  } catch (error) {
    console.error("Health check error:", error.message);
    res.status(500).json({ error: "Health check failed", details: error.message });
  }
};

function formatUptime(seconds) {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  return `${m}m ${s}s`;
}

// Get recent activity feed
exports.getRecentActivity = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [recentMessages, recentFeedback, recentUsers, recentDevices] = await Promise.all([
      Message.find({ createdAt: { $gte: oneDayAgo } })
        .sort({ createdAt: -1 }).limit(limit).select("sender receiver type createdAt").lean(),
      Feedback.find({ createdAt: { $gte: oneDayAgo } })
        .sort({ createdAt: -1 }).limit(limit).select("name email rating createdAt").lean(),
      User.find({ lastSeen: { $gte: oneDayAgo } })
        .sort({ lastSeen: -1 }).limit(limit).select("email lastSeen").lean(),
      Device.find({ loggedInAt: { $gte: oneDayAgo } })
        .sort({ loggedInAt: -1 }).limit(limit).select("userId deviceName browser os loggedInAt").lean(),
    ]);

    // Merge into timeline
    const activities = [];
    recentMessages.forEach((m) => activities.push({ type: "message", detail: `${m.sender} → ${m.receiver}`, subtype: m.type, time: m.createdAt }));
    recentFeedback.forEach((f) => activities.push({ type: "feedback", detail: `${f.name} (${f.email}) rated ${f.rating}⭐`, time: f.createdAt }));
    recentUsers.forEach((u) => activities.push({ type: "login", detail: u.email, time: u.lastSeen }));
    recentDevices.forEach((d) => activities.push({ type: "device", detail: `${d.userId} on ${d.deviceName} (${d.browser})`, time: d.loggedInAt }));

    activities.sort((a, b) => new Date(b.time) - new Date(a.time));

    res.json(activities.slice(0, limit));
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch activity" });
  }
};

// Get platform stats
exports.getPlatformStats = async (req, res) => {
  try {
    const [deviceTypes, browsers, osList, topChatters] = await Promise.all([
      Device.aggregate([{ $group: { _id: "$deviceType", count: { $sum: 1 } } }]),
      Device.aggregate([{ $group: { _id: "$browser", count: { $sum: 1 } } }, { $sort: { count: -1 } }, { $limit: 10 }]),
      Device.aggregate([{ $group: { _id: "$os", count: { $sum: 1 } } }, { $sort: { count: -1 } }, { $limit: 10 }]),
      Message.aggregate([
        { $group: { _id: "$sender", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ]),
    ]);

    res.json({ deviceTypes, browsers, osList, topChatters });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch platform stats" });
  }
};

// Get user detail (profile + recent activity)
exports.getUserDetail = async (req, res) => {
  try {
    const { email } = req.params;
    if (!email) return res.status(400).json({ error: "Email is required" });

    const normalizedEmail = email.toLowerCase();
    const user = await User.findOne({ email: normalizedEmail })
      .select("email displayName bio avatarUrl lastSeen");

    if (!user) return res.status(404).json({ error: "User not found" });

    // Get user's message count
    const messageCount = await Message.countDocuments({
      $or: [{ sender: normalizedEmail }, { receiver: normalizedEmail }],
    });

    // Get user's feedback count
    const feedbackCount = await Feedback.countDocuments({ email: normalizedEmail });

    // Get user's chat requests
    const chatRequests = await ChatRequest.countDocuments({
      $or: [{ from: normalizedEmail }, { to: normalizedEmail }],
    });

    // Get user's devices
    const devices = await Device.find({ userId: normalizedEmail })
      .select("deviceName deviceType browser os isActive lastSeen");

    res.json({
      user,
      activity: {
        messageCount,
        feedbackCount,
        chatRequests,
        deviceCount: devices.length,
        devices,
      },
    });
  } catch (error) {
    console.error("Get user detail error:", error.message);
    res.status(500).json({ error: "Failed to get user detail" });
  }
};

// Broadcast message to ALL users — push + email + socket.IO
exports.broadcastMessage = async (req, res) => {
  try {
    const { title, message, audience = "all", priority = "normal", channels = {} } = req.body;
    if (!title || !message) {
      return res.status(400).json({ error: "Title and message are required" });
    }

    const channelConfig = {
      push: channels.push !== false,
      email: channels.email !== false,
      socket: channels.socket !== false,
      ...channels,
    };

    const now = new Date();
    const recipientQuery = {};
    if (audience === "active") {
      recipientQuery.lastSeen = { $gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) };
    } else if (audience === "recent") {
      recipientQuery.lastSeen = { $gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) };
    }

    const users = await User.find(recipientQuery).select("email").lean();

    let pushResult = { sent: 0, failed: 0, total: users.length };
    if (channelConfig.push) {
      try {
        pushResult = await broadcastPush({
          title: `📢 ${title}`,
          body: message,
          icon: "/logo192.png",
          url: "/",
        });
      } catch (pushErr) {
        console.error("Push broadcast error:", pushErr.message);
      }
    }

    let emailSent = 0;
    let emailFailed = 0;
    if (channelConfig.email && users.length > 0) {
      const batchSize = 10;
      for (let i = 0; i < users.length; i += batchSize) {
        const batch = users.slice(i, i + batchSize);
        const results = await Promise.allSettled(
          batch.map(async (user) => {
            await sendNotificationEmail({
              email: user.email,
              subject: `📢 ${title}`,
              html: `
                <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
                  <h2 style="color:#1f2937;">${title}</h2>
                  <p style="color:#374151;line-height:1.6;">${message}</p>
                  <p style="color:#9ca3af;font-size:12px;margin-top:20px;">Priority: ${priority}</p>
                  <p style="color:#9ca3af;font-size:12px;margin-top:4px;">— The Connect It Team</p>
                </div>
              `,
            });
          })
        );
        results.forEach((r) => {
          if (r.status === "fulfilled") emailSent++;
          else emailFailed++;
        });
      }
    }

    let socketSent = 0;
    if (channelConfig.socket) {
      try {
        const expressApp = req.app;
        const io = expressApp.get("io");
        if (io) {
          io.emit("admin-broadcast", { title, message, priority, timestamp: new Date().toISOString() });
          socketSent = io.engine.clientsCount || 0;
          console.log(`📡 Socket.IO broadcast to ${socketSent} connected clients`);
        }
      } catch (socketErr) {
        console.warn("Socket broadcast error:", socketErr.message);
      }
    }

    console.log(`📢 Broadcast complete: ${pushResult.sent} push, ${emailSent} email, ${socketSent} socket`);
    res.json({
      success: true,
      message: "Broadcast sent!",
      details: {
        recipients: { total: users.length, audience, priority },
        push: { sent: pushResult.sent, failed: pushResult.failed, total: pushResult.total },
        email: { sent: emailSent, failed: emailFailed, total: users.length },
        socket: { connected: socketSent },
      },
    });
  } catch (error) {
    console.error("Broadcast error:", error.message);
    res.status(500).json({ error: "Failed to broadcast message" });
  }
};

// Reply to feedback
exports.replyToFeedback = async (req, res) => {
  try {
    const { id } = req.params;
    const { reply } = req.body;

    if (!reply || !reply.trim()) {
      return res.status(400).json({ error: "Reply message is required" });
    }

    const feedback = await Feedback.findById(id);
    if (!feedback) {
      return res.status(404).json({ error: "Feedback not found" });
    }

    feedback.reply = reply.trim();
    feedback.repliedAt = new Date();
    await feedback.save();

    // Send reply email to the user
    try {
      await sendNotificationEmail({
        email: feedback.email,
        subject: `Reply to your feedback - Connect It`,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
            <h2 style="color:#1f2937;">We replied to your feedback</h2>
            <p style="color:#6b7280;">Hi ${feedback.name},</p>
            <p style="color:#6b7280;line-height:1.6;">Here's our response to your feedback:</p>
            <div style="background:#f9fafb;padding:15px;border-radius:8px;border-left:4px solid #3b82f6;margin:15px 0;">
              <p style="color:#374151;white-space:pre-wrap;">${reply}</p>
            </div>
            <div style="background:#eff6ff;padding:12px;border-radius:8px;margin:15px 0;">
              <p style="color:#6b7280;margin:0;font-size:14px;"><strong>Your original feedback:</strong></p>
              <p style="color:#374151;margin:5px 0 0 0;font-size:14px;">${feedback.message}</p>
            </div>
            <p style="color:#9ca3af;font-size:12px;margin-top:20px;">Thank you for using Connect It</p>
          </div>
        `,
      });
    } catch (emailErr) {
      console.warn("Failed to send reply email:", emailErr.message);
    }

    res.json({ success: true, message: "Reply sent", feedback });
  } catch (error) {
    console.error("Reply to feedback error:", error.message);
    res.status(500).json({ error: "Failed to reply to feedback" });
  }
};
