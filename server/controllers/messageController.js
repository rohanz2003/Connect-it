const Message = require("../models/Message");
const ClearedChat = require("../models/ClearedChat");
const ChatRequest = require("../models/ChatRequest");
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

exports.getAcceptedChats = async (req, res) => {
  try {
    const { userEmail } = req.query;
    if (!userEmail) return res.status(400).json({ error: "userEmail is required" });

    const normalized = normalizeEmail(userEmail);

    const acceptedRequests = await ChatRequest.find({
      $or: [{ from: normalized, status: "accepted" }, { to: normalized, status: "accepted" }],
    }).sort({ respondedAt: -1 }).lean();

    const partners = acceptedRequests.map((r) =>
      r.from === normalized ? r.to : r.from
    );

    const clearedRecords = await ClearedChat.find({ user: normalized }).lean();
    const clearedMap = Object.fromEntries(
      clearedRecords.map((r) => [r.partner, r.clearedAt])
    );

    const messages = await Message.find({
      $or: [
        { sender: { $in: partners }, receiver: normalized },
        { sender: normalized, receiver: { $in: partners } },
      ],
    })
      .sort({ timestamp: -1 })
      .limit(2000)
      .lean();

    const chatMap = {};
    for (const partner of partners) {
      chatMap[partner] = { userEmail: partner, lastMessage: null, timestamp: null, unread: 0 };
    }

    for (const msg of messages) {
      const other = msg.sender === normalized ? msg.receiver : msg.sender;
      if (!chatMap[other]) continue;
      const clearedAt = clearedMap[other];
      const msgTime = msg.timestamp || msg.createdAt;

      if (clearedAt && new Date(msgTime) <= new Date(clearedAt)) continue;

      if (!chatMap[other].lastMessage) {
        const decrypted = decryptMessageDoc(msg);
        chatMap[other].lastMessage =
          decrypted.type === "media"
            ? "[Media]"
            : typeof decrypted.text === "string"
              ? decrypted.text.substring(0, 60)
              : "[Message]";
        chatMap[other].timestamp = msgTime;
      }

      if (msg.receiver === normalized && msg.status !== "read") {
        chatMap[other].unread++;
      }
    }

    const result = Object.values(chatMap).sort(
      (a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0)
    );

    res.json(result);
  } catch (error) {
    console.error("getAcceptedChats error:", error);
    res.status(500).json({ error: "Failed to fetch accepted chats" });
  }
};

exports.clearChat = async (req, res) => {
  try {
    const { user, partner } = req.body;
    if (!user || !partner) {
      return res.status(400).json({ error: "user and partner are required" });
    }
    await ClearedChat.findOneAndUpdate(
      { user: normalizeEmail(user), partner: normalizeEmail(partner) },
      { clearedAt: new Date() },
      { upsert: true, new: true }
    );
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

    const clearedRecords = await ClearedChat.find({ user: normalizedEmail }).lean();
    const clearedMap = Object.fromEntries(
      clearedRecords.map((r) => [r.partner, r.clearedAt])
    );

    const messages = await Message.find({
      $or: [{ sender: normalizedEmail }, { receiver: normalizedEmail }],
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
        const decrypted = decryptMessageDoc(msg);
        const preview =
          decrypted.type === "media"
            ? "[Media]"
            : typeof decrypted.text === "string"
              ? decrypted.text
              : "[Message]";

        conversations[otherUser] = {
          userEmail: otherUser,
          lastMessage: preview,
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
