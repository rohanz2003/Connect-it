const Message = require("../models/Message");
const ClearedChat = require("../models/ClearedChat");
const ArchivedChat = require("../models/ArchivedChat");
const { decryptMessageDoc } = require("../utils/messageCrypto");
const { normalizeEmail } = require("../utils/socketAuth");

const getClearedAt = async (user, partner) => {
  const record = await ClearedChat.findOne({
    user: normalizeEmail(user),
    partner: normalizeEmail(partner),
  }).lean();
  return record?.clearedAt || null;
};

const getArchivedPartners = async (user) => {
  const archived = await ArchivedChat.find({ user: normalizeEmail(user) }).lean();
  return archived.map(a => a.partner);
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
      clearedRecords.map((r) => [r.partner, { clearedAt: r.clearedAt, keepInRecent: r.keepInRecent }])
    );

    const archivedPartners = await getArchivedPartners(normalizedEmail);

    const recentChats = conversations
      .filter((conv) => {
        const partner = conv._id;
        // Filter out archived
        if (archivedPartners.includes(partner)) return false;

        const record = clearedMap[partner];
        if (!record) return true;
        
        // If keepInRecent is true, always show even if clearedAt is after last message
        if (record.keepInRecent) return true;

        return new Date(conv.timestamp) > new Date(record.clearedAt);
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

exports.archiveChat = async (req, res) => {
  try {
    const { user, partner } = req.body;
    await ArchivedChat.findOneAndUpdate(
      { user: normalizeEmail(user), partner: normalizeEmail(partner) },
      { archivedAt: new Date() },
      { upsert: true }
    );
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to archive chat" });
  }
};

exports.unarchiveChat = async (req, res) => {
  try {
    const { user, partner } = req.body;
    await ArchivedChat.deleteOne({
      user: normalizeEmail(user),
      partner: normalizeEmail(partner),
    });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to unarchive chat" });
  }
};

exports.clearAllChats = async (req, res) => {
  try {
    const { userEmail } = req.body;
    const normalized = normalizeEmail(userEmail);
    // For "Clear All", we essentially want to set clearedAt for all conversations
    // Get all unique partners
    const partners = await Message.distinct("sender", { receiver: normalized });
    const partners2 = await Message.distinct("receiver", { sender: normalized });
    const allPartners = [...new Set([...partners, ...partners2])];

    const now = new Date();
    const ops = allPartners.map(p => ({
      updateOne: {
        filter: { user: normalized, partner: p },
        update: { $set: { clearedAt: now } },
        upsert: true
      }
    }));

    if (ops.length > 0) {
      await ClearedChat.bulkWrite(ops);
    }

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to clear all chats" });
  }
};
