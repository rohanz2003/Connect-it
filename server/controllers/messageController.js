const Message = require("../models/Message");
const ClearedChat = require("../models/ClearedChat");
const { decryptMessageDoc } = require("../utils/messageCrypto");
const { normalizeEmail } = require("../utils/socketAuth");

const getClearedAt = async (user, partner) => {
  const record = await ClearedChat.findOne({
    user: normalizeEmail(user),
    partner: normalizeEmail(partner),
  }).lean();
  return record?.clearedAt || null;
};

exports.getMessages = async (req, res) => {
  try {
    const { user1, user2 } = req.query;
    if (!user1 || !user2) {
      return res.status(400).json({ error: "user1 and user2 are required" });
    }

    const u1 = normalizeEmail(user1);
    const u2 = normalizeEmail(user2);

    const clearedAt = await getClearedAt(u1, u2);
    const query = {
      $or: [
        { sender: u1, receiver: u2 },
        { sender: u2, receiver: u1 },
      ],
    };

    if (clearedAt) {
      query.timestamp = { $gt: clearedAt };
    }

    const messages = await Message.find(query)
      .sort({ timestamp: 1 })
      .limit(500)
      .lean();

    res.json(messages.map(decryptMessageDoc));
  } catch (error) {
    console.error("getMessages error:", error);
    res.status(500).json({ error: "Failed to fetch messages", details: error.message });
  }
};

exports.getRecentChats = async (req, res) => {
  try {
    const { userEmail } = req.query;
    if (!userEmail) {
      return res.status(400).json({ error: "userEmail is required" });
    }

    const normalizedEmail = normalizeEmail(userEmail);

    // Get all users this person has chatted with, and the last message from each
    const conversations = await Message.aggregate([
      {
        $match: {
          $or: [{ sender: normalizedEmail }, { receiver: normalizedEmail }],
        },
      },
      { $sort: { timestamp: -1 } },
      {
        $group: {
          _id: {
            $cond: [
              { $eq: ["$sender", normalizedEmail] },
              "$receiver",
              "$sender",
            ],
          },
          lastMessage: { $first: "$text" },
          timestamp: { $first: "$timestamp" },
          type: { $first: "$type" },
          messageId: { $first: "$_id" },
        },
      },
      { $sort: { timestamp: -1 } },
    ]);

    // Get cleared chat records to filter out hidden conversations
    const clearedRecords = await ClearedChat.find({ user: normalizedEmail }).lean();
    const clearedMap = Object.fromEntries(
      clearedRecords.map((r) => [r.partner, r.clearedAt])
    );

    const recentChats = conversations
      .filter((conv) => {
        const clearedAt = clearedMap[conv._id];
        if (!clearedAt) return true;
        return new Date(conv.timestamp) > new Date(clearedAt);
      })
      .map((conv) => {
        const decrypted = decryptMessageDoc(conv);
        const preview =
          decrypted.type === "media"
            ? "[Media]"
            : typeof decrypted.lastMessage === "string"
            ? decrypted.lastMessage
            : "[Message]";

        return {
          userEmail: conv._id,
          lastMessage: preview,
          timestamp: conv.timestamp,
          type: conv.type,
          messageId: conv.messageId,
        };
      });

    res.json(recentChats);
  } catch (error) {
    console.error("Error fetching recent chats:", error);
    res.status(500).json({ error: "Failed to fetch recent chats" });
  }
};
