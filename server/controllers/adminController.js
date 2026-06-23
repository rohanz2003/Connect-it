// Admin Controller - Get all data from database
const admin = require("firebase-admin");
const Message = require("../models/Message");
const Feedback = require("../models/Feedback");
const User = require("../modules/User");
const ClearedChat = require("../models/ClearedChat");
const ChatRequest = require("../models/ChatRequest");
const PushSubscription = require("../models/PushSubscription");
const Device = require("../models/Device");
const { decryptMessageDoc } = require("../utils/messageCrypto");

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
