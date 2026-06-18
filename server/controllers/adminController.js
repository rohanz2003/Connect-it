// Admin Controller - Get all data from database
const Message = require("../models/Message");
const Feedback = require("../models/Feedback");
const User = require("../modules/User");

// Get all messages with sender details
exports.getAllMessages = async (req, res) => {
  try {
    const messages = await Message.find().sort({ createdAt: -1 }).limit(1000).lean();
    res.json(messages);
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
