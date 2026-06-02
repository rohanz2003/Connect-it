const Message = require("../models/Message");

exports.getMessages = async (req, res) => {
  const { user1, user2 } = req.query;

  const messages = await Message.find({
    $or: [
      { sender: user1, receiver: user2 },
      { sender: user2, receiver: user1 },
    ],
  }).sort({ timestamp: 1 }); // Sort by timestamp instead of createdAt for consistency

  res.json(messages);
};

// Get recent chats for a user (list of conversations with latest message)
exports.getRecentChats = async (req, res) => {
  try {
    const { userEmail } = req.query;
    
    if (!userEmail) {
      return res.status(400).json({ error: "userEmail is required" });
    }

    const normalizedEmail = userEmail.toLowerCase();

    // Find all conversations involving this user
    const messages = await Message.find({
      $or: [
        { sender: { $regex: new RegExp(`^${normalizedEmail}$`, "i") } },
        { receiver: { $regex: new RegExp(`^${normalizedEmail}$`, "i") } }
      ]
    }).sort({ timestamp: -1 });

    // Group messages by conversation partner
    const conversations = {};
    
    messages.forEach(msg => {
      const otherUser = msg.sender.toLowerCase() === normalizedEmail ? msg.receiver.toLowerCase() : msg.sender.toLowerCase();
      
      // Only keep the most recent message per conversation
      if (!conversations[otherUser]) {
        conversations[otherUser] = {
          userEmail: otherUser,
          lastMessage: msg.text,
          timestamp: msg.timestamp || msg.createdAt,
          type: msg.type,
          messageId: msg._id
        };
      }
    });

    // Convert to array and sort by timestamp descending (most recent first)
    const recentChats = Object.values(conversations)
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    res.json(recentChats);
  } catch (error) {
    console.error("Error fetching recent chats:", error);
    res.status(500).json({ error: "Failed to fetch recent chats" });
  }
};