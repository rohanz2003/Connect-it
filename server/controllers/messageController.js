const Message = require("../models/Message");
const User = require("../models/User");
const AuditLog = require("../models/AuditLog");

/**
 * Saves E2EE encrypted message payload after compliance filter validations.
 */
exports.sendMessage = async (req, res) => {
  try {
    const { receiverId, roomId, ciphertext, iv, disappearingTimer, fileUrl, fileName, fileType } = req.body;
    const senderId = req.user.email;

    if (!receiverId || !roomId || !ciphertext || !iv) {
      return res.status(400).json({ error: "Missing mandatory fields: receiverId, roomId, ciphertext, and iv required." });
    }

    // Verify recipient blocklist status
    const recipientUser = await User.findOne({ email: receiverId.toLowerCase().trim() });
    if (recipientUser && recipientUser.blockedUsers.includes(senderId.toLowerCase().trim())) {
      return res.status(403).json({ error: "Message delivery blocked by recipient." });
    }

    // Process disappearing dynamic message TTL timestamps
    let expiresAt = null;
    if (disappearingTimer && disappearingTimer > 0) {
      const hours = parseInt(disappearingTimer, 10);
      expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000);
    }

    const message = new Message({
      senderId,
      receiverId: receiverId.toLowerCase().trim(),
      roomId,
      ciphertext,
      iv,
      disappearingTimer: disappearingTimer || 0,
      expiresAt,
      fileUrl: fileUrl || null,
      fileName: fileName || null,
      fileType: fileType || null
    });

    await message.save();
    return res.status(201).json({ success: true, message });
  } catch (err) {
    console.error("sendMessage error:", err.message);
    res.status(500).json({ error: "Failed to securely save message payload." });
  }
};

/**
 * Retrieves historical encrypted conversations between sender and receiver.
 */
exports.getMessages = async (req, res) => {
  try {
    const { roomId } = req.params;
    const userEmail = req.user.email;

    // Fetch conversation thread history
    const messages = await Message.find({ roomId })
      .sort({ createdAt: 1 })
      .lean();

    return res.json(messages);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * Deletes a single message by the sender with an audit trail entry.
 */
exports.deleteMessage = async (req, res) => {
  try {
    const { messageId } = req.params;
    const userEmail = req.user.email;

    const msg = await Message.findById(messageId);
    if (!msg) return res.status(404).json({ error: "Target message node not found." });

    // Restrict removal authority to sender or administration
    if (msg.senderId !== userEmail && req.user.role !== "Admin") {
      return res.status(403).json({ error: "Unauthorized request deletion clearance." });
    }

    await Message.findByIdAndDelete(messageId);

    // Audit Logging
    const ipAddress = req.ip || "127.0.0.1";
    await new AuditLog({
      userId: userEmail,
      action: "MESSAGE_DELETION",
      ipAddress,
      details: `Deleted message node ID: ${messageId}`
    }).save();

    return res.json({ success: true, deletedId: messageId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * Erases a whole thread for privacy optimization.
 */
exports.deleteChatHistory = async (req, res) => {
  try {
    const { roomId } = req.params;
    const userEmail = req.user.email;

    // Delete matching records
    await Message.deleteMany({ roomId, $or: [{ senderId: userEmail }, { receiverId: userEmail }] });

    // Track operation
    const ipAddress = req.ip || "127.0.0.1";
    await new AuditLog({
      userId: userEmail,
      action: "MESSAGE_DELETION",
      ipAddress,
      details: `Purged complete chat log for room segment: ${roomId}`
    }).save();

    return res.json({ success: true, roomId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * Generates an offline backup of all historical messaging encrypted payloads for client utility.
 */
exports.exportEncryptedBackup = async (req, res) => {
  try {
    const userEmail = req.user.email;
    const logs = await Message.find({ $or: [{ senderId: userEmail }, { receiverId: userEmail }] })
      .sort({ createdAt: 1 })
      .lean();

    return res.json({
      exportedBy: userEmail,
      timestamp: new Date(),
      format: "E2EE-AES-GCM-BACKUP",
      recordsCount: logs.length,
      data: logs
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
