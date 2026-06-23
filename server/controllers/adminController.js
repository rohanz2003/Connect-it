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
const { sendPushNotification } = require("../services/pushService");
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

// System health check
exports.getSystemHealth = async (req, res) => {
  try {
    const mongoState = mongoose.connection.readyState;
    const mongoLabel = ["disconnected", "connected", "connecting", "disconnecting"][mongoState] || "unknown";

    const totalUsers = await User.countDocuments();
    const totalMessages = await Message.countDocuments();
    const totalFeedback = await Feedback.countDocuments();
    const activeDevices = await Device.countDocuments({ isActive: true });

    // Recent activity (last 24h)
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentUsers = await User.countDocuments({ lastSeen: { $gte: oneDayAgo } });
    const recentMessages = await Message.countDocuments({ createdAt: { $gte: oneDayAgo } });

    // Firebase status
    const { isFirebaseConfigured } = require("../config/firebase");
    const firebaseOk = isFirebaseConfigured();

    // Email status
    const emailConfigured = !!(process.env.RESEND_API_KEY);

    res.json({
      server: {
        uptime: Math.floor(process.uptime()),
        memoryMB: Math.floor(process.memoryUsage().heapUsed / 1024 / 1024),
        nodeVersion: process.version,
        environment: process.env.NODE_ENV || "development",
      },
      database: {
        status: mongoLabel,
        connected: mongoState === 1,
      },
      stats: {
        totalUsers,
        totalMessages,
        totalFeedback,
        activeDevices,
        recentUsers,
        recentMessages,
      },
      services: {
        firebase: firebaseOk,
        email: emailConfigured,
      },
    });
  } catch (error) {
    res.status(500).json({ error: "Health check failed" });
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

// Broadcast message to all users via push notification
exports.broadcastMessage = async (req, res) => {
  try {
    const { title, message } = req.body;
    if (!title || !message) {
      return res.status(400).json({ error: "Title and message are required" });
    }

    // Get all push subscriptions
    const subscriptions = await PushSubscription.find({}).lean();
    let sentCount = 0;
    let failedCount = 0;

    const results = await Promise.allSettled(
      subscriptions.map(async (sub) => {
        try {
          await sendPushNotification(sub.userId, {
            title: `📢 ${title}`,
            body: message,
            icon: "/logo192.png",
            url: "/",
          });
          sentCount++;
        } catch {
          failedCount++;
        }
      })
    );

    // Also send email to all users with email addresses
    const users = await User.find({}).select("email").lean();
    let emailSent = 0;
    for (const user of users) {
      try {
        await sendNotificationEmail({
          email: user.email,
          subject: `📢 ${title}`,
          html: `
            <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
              <h2 style="color:#1f2937;">${title}</h2>
              <p style="color:#374151;line-height:1.6;">${message}</p>
              <p style="color:#9ca3af;font-size:12px;margin-top:20px;">— The Connect It Team</p>
            </div>
          `,
        });
        emailSent++;
      } catch {}
    }

    console.log(`📢 Broadcast: ${sentCount} push, ${emailSent} email sent`);
    res.json({
      success: true,
      message: `Broadcast sent: ${sentCount} push notifications, ${emailSent} emails`,
      sentCount,
      emailSent,
      failedCount,
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
