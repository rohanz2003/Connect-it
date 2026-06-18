const Message = require("../models/Message");
const ClearedChat = require("../models/ClearedChat");
const { normalizeEmail } = require("../utils/socketAuth");
const { writeAuditLog } = require("../services/auditService");

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
    if (req.user?.email !== u1 && req.user?.email !== u2) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const clearedAt = await getClearedAt(u1, u2);
    const query = {
      $or: [
        { sender: u1, receiver: u2 },
        { sender: u2, receiver: u1 },
      ],
      deletedFor: { $ne: req.user.email },
      deletedForEveryone: { $ne: true },
    };

    if (clearedAt) {
      query.timestamp = { $gt: clearedAt };
    }
    query.$and = [
      {
        $or: [
          { expiresAt: null },
          { expiresAt: { $gt: new Date() } },
        ],
      },
    ];

    const messages = await Message.find(query)
      .sort({ timestamp: 1 })
      .limit(500)
      .lean();

    res.json(messages);
  } catch (error) {
    console.error("getMessages error:", error);
    res.status(500).json({ error: "Failed to fetch messages", details: error.message });
  }
};

exports.clearChat = async (req, res) => {
  try {
    const { user, partner } = req.body;
    if (!user || !partner) {
      return res.status(400).json({ error: "user and partner are required" });
    }
    const normalizedUser = normalizeEmail(user);
    if (req.user?.email !== normalizedUser) {
      return res.status(403).json({ error: "Forbidden" });
    }
    await ClearedChat.findOneAndUpdate(
      { user: normalizedUser, partner: normalizeEmail(partner) },
      { clearedAt: new Date() },
      { upsert: true, new: true }
    );
    await writeAuditLog({
      actor: normalizedUser,
      action: "chat_deleted",
      target: normalizeEmail(partner),
      req,
    });
    res.json({ success: true });
  } catch (error) {
    console.error("Error clearing chat:", error);
    res.status(500).json({ error: "Failed to clear chat" });
  }
};

exports.getRecentChats = async (req, res) => {
  try {
    const { userEmail } = req.query;
    if (!userEmail) {
      return res.status(400).json({ error: "userEmail is required" });
    }

    const normalizedEmail = normalizeEmail(userEmail);
    if (req.user?.email !== normalizedEmail) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const clearedRecords = await ClearedChat.find({ user: normalizedEmail }).lean();
    const clearedMap = Object.fromEntries(
      clearedRecords.map((r) => [r.partner, r.clearedAt])
    );

    const messages = await Message.find({
      $or: [{ sender: normalizedEmail }, { receiver: normalizedEmail }],
      deletedFor: { $ne: normalizedEmail },
      deletedForEveryone: { $ne: true },
      $and: [
        {
          $or: [
            { expiresAt: null },
            { expiresAt: { $gt: new Date() } },
          ],
        },
      ],
    })
      .sort({ timestamp: -1 })
      .limit(1000)
      .lean();

    const conversations = {};

    for (const msg of messages) {
      const otherUser =
        msg.sender === normalizedEmail ? msg.receiver : msg.sender;
      const clearedAt = clearedMap[otherUser];
      const msgTime = msg.timestamp || msg.createdAt;

      if (clearedAt && new Date(msgTime) <= new Date(clearedAt)) {
        continue;
      }

      if (!conversations[otherUser]) {
        conversations[otherUser] = {
          userEmail: otherUser,
          lastMessage: msg.type === "media" ? "[Encrypted media]" : "[Encrypted message]",
          encrypted: true,
          text: msg.text,
          timestamp: msgTime,
          type: msg.type,
          messageId: msg._id,
          sender: msg.sender,
          receiver: msg.receiver,
          status: msg.status,
        };
      }
    }

    const recentChats = Object.values(conversations).sort(
      (a, b) => new Date(b.timestamp) - new Date(a.timestamp)
    );

    res.json(recentChats);
  } catch (error) {
    console.error("Error fetching recent chats:", error);
    res.status(500).json({ error: "Failed to fetch recent chats" });
  }
};
