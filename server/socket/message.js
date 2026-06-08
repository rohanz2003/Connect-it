const Message = require("../models/Message");
const ClearedChat = require("../models/ClearedChat");
const { encryptPayload, decryptMessageDoc } = require("../utils/messageCrypto");
const { normalizeEmail, getAuthenticatedEmail, getRoomId } = require("../utils/socketAuth");
const { isDatabaseConnected } = require("../config/database");

const roomUsers = {};
const unreadMessages = {};

const isUserOnline = (users, email) => {
  const entry = users[normalizeEmail(email)];
  return entry instanceof Set ? entry.size > 0 : Boolean(entry);
};

module.exports = (io, socket, users) => {
  socket.on("join-room", ({ user1, user2 }) => {
    const authUser = getAuthenticatedEmail(socket, users);
    const normalizedUser1 = normalizeEmail(user1);
    const normalizedUser2 = normalizeEmail(user2);

    if (!authUser || authUser !== normalizedUser1) {
      console.warn(`⚠️ Unauthenticated join-room attempt: ${socket.id} (auth: ${authUser}, requested: ${normalizedUser1})`);
      return;
    }

    const roomId = getRoomId(normalizedUser1, normalizedUser2);

    // Only leave other chat rooms, keep personal and socket-id rooms
    for (const room of socket.rooms) {
      if (room !== socket.id && room !== normalizedUser1 && room.includes('_')) {
        socket.leave(room);
      }
    }

    socket.join(roomId);
    console.log(`✅ ${normalizedUser1} joined room: ${roomId}`);

    if (!roomUsers[roomId]) roomUsers[roomId] = [];
    if (!roomUsers[roomId].includes(normalizedUser1)) {
      roomUsers[roomId].push(normalizedUser1);
    }

    const unreadKey = `${normalizedUser2}_${normalizedUser1}`;
    if (unreadMessages[unreadKey]) {
      unreadMessages[unreadKey] = 0;
      if (isUserOnline(users, normalizedUser1)) {
        io.to(normalizedUser1).emit("unread-update", unreadMessages);
      }
    }
  });

  socket.on("send-message", async (data, callback) => {
    try {
      let authSender = getAuthenticatedEmail(socket, users);
      if (!authSender && data?.sender) {
        authSender = normalizeEmail(data.sender);
        // Auto-join this socket to the user's online sockets if it wasn't already
        if (!users[authSender]) {
          users[authSender] = new Set();
        }
        users[authSender].add(socket.id);
        socket.join(authSender);
        console.log(`📡 Auto-authenticated socket ${socket.id} for ${authSender}`);
      }

      if (!authSender) {
        console.warn(`❌ Message send blocked: Unauthenticated socket ${socket.id}. Data sender: ${data?.sender}`);
        if (callback) callback({ ok: false, error: "Not authenticated. Reconnecting..." });
        return;
      }

      if (!isDatabaseConnected()) {
        console.error("❌ Message send blocked: Database not connected");
        if (callback) callback({ ok: false, error: "Database not connected" });
        socket.emit("message-error", { tempId: data?.tempId, error: "Database not connected" });
        return;
      }

      const {
        sender,
        receiver,
        text,
        type,
        mediaType,
        tempId,
        timestamp,
        replyTo,
      } = data || {};

      const normalizedSender = normalizeEmail(sender);
      const normalizedReceiver = normalizeEmail(receiver);

      if (authSender !== normalizedSender) {
        console.warn(`❌ Message send blocked: Sender mismatch. Auth: ${authSender}, Data: ${normalizedSender}`);
        if (callback) callback({ ok: false, error: "Sender mismatch" });
        return;
      }

      if (!normalizedReceiver || !text) {
        if (callback) callback({ ok: false, error: "Invalid message payload" });
        return;
      }

      const roomId = getRoomId(normalizedSender, normalizedReceiver);
      const msgTimestamp = timestamp ? new Date(timestamp) : new Date();

      if (tempId) {
        const existing = await Message.findOne({ tempId }).lean();
        if (existing) {
          const decrypted = decryptMessageDoc(existing);
          // Emit to both room and receiver personal room for duplicates too
          io.to(roomId).to(normalizedReceiver).emit("receive-message", decrypted);
          io.to(roomId).to(normalizedReceiver).emit("message-saved", {
            tempId,
            _id: existing._id,
            timestamp: existing.timestamp,
          });
          if (callback) callback({ ok: true, _id: existing._id, duplicate: true });
          return;
        }
      }

      let encryptedText;
      try {
        encryptedText = encryptPayload(text);
      } catch (encErr) {
        console.error("❌ Encryption failed:", encErr.message);
        if (callback) callback({ ok: false, error: "Message encryption failed" });
        return;
      }

      const optimisticMessage = {
        _id: tempId || `temp-${Date.now()}`,
        sender: normalizedSender,
        receiver: normalizedReceiver,
        text,
        type: type || "text",
        mediaType: mediaType || null,
        tempId: tempId || null,
        replyTo: replyTo || null,
        timestamp: msgTimestamp,
        seen: false,
        pending: true,
      };

      io.to(roomId).to(normalizedReceiver).emit("receive-message", optimisticMessage);

      const unreadKey = `${normalizedSender}_${normalizedReceiver}`;
      unreadMessages[unreadKey] = (unreadMessages[unreadKey] || 0) + 1;

      if (isUserOnline(users, normalizedReceiver)) {
        io.to(normalizedReceiver).emit("unread-update", unreadMessages);
      }

      if (callback) callback({ ok: true, pending: true, tempId });

      try {
        const saved = await Message.create({
          sender: normalizedSender,
          receiver: normalizedReceiver,
          text: encryptedText,
          type: type || "text",
          mediaType: mediaType || null,
          tempId: tempId || undefined,
          replyTo: replyTo || undefined,
          timestamp: msgTimestamp,
          seen: false,
        });

        io.to(roomId).to(normalizedReceiver).emit("message-saved", {
          tempId: tempId || null,
          _id: saved._id,
          timestamp: saved.timestamp,
        });
      } catch (dbErr) {
        console.error(`❌ Failed to save message from ${normalizedSender} to ${normalizedReceiver}:`, dbErr.message);
        socket.emit("message-error", {
          tempId,
          error: "Failed to save message",
          details: dbErr.message
        });
      }
    } catch (err) {
      console.error("❌ Error sending message:", err.message);
      if (callback) callback({ ok: false, error: err.message });
    }
  });

  socket.on("delete-message", async ({ messageId, sender, receiver }) => {
    try {
      const authUser = getAuthenticatedEmail(socket, users);
      const normalizedSender = normalizeEmail(sender);
      if (!authUser || authUser !== normalizedSender) return;

      await Message.deleteOne({
        $or: [{ _id: messageId }, { tempId: messageId }],
        sender: normalizedSender,
      });

      const roomId = getRoomId(normalizedSender, normalizeEmail(receiver));
      io.to(roomId).emit("message-deleted", {
        messageId,
        sender: normalizedSender,
        receiver: normalizeEmail(receiver),
      });
    } catch (err) {
      console.error("❌ Error deleting message:", err.message);
    }
  });

  socket.on("mark-as-read", ({ user1, user2 }) => {
    const authUser = getAuthenticatedEmail(socket, users);
    const normalizedUser1 = normalizeEmail(user1);
    const normalizedUser2 = normalizeEmail(user2);
    if (!authUser || authUser !== normalizedUser1) return;

    const unreadKey = `${normalizedUser2}_${normalizedUser1}`;
    unreadMessages[unreadKey] = 0;

    Message.updateMany(
      { sender: normalizedUser2, receiver: normalizedUser1, seen: false },
      { seen: true }
    ).catch((err) => console.warn("mark-as-read DB update failed:", err.message));

    if (isUserOnline(users, normalizedUser1)) {
      io.to(normalizedUser1).emit("unread-update", unreadMessages);
    }
  });

  socket.on("seen-message", async ({ sender, receiver }) => {
    try {
      const authUser = getAuthenticatedEmail(socket, users);
      const normalizedReceiver = normalizeEmail(receiver);
      if (!authUser || authUser !== normalizedReceiver) return;

      await Message.updateMany(
        { sender: normalizeEmail(sender), receiver: normalizedReceiver, seen: false },
        { seen: true }
      );

      const roomId = getRoomId(sender, receiver);
      io.to(roomId).emit("message-seen", {
        sender: normalizeEmail(sender),
        receiver: normalizedReceiver,
      });
    } catch (err) {
      console.warn("seen-message failed:", err.message);
    }
  });

  // Per-user soft clear (WhatsApp-style): only hides for the requesting user
  socket.on("clear-chat", async ({ user1, user2 }, callback) => {
    try {
      const authUser = getAuthenticatedEmail(socket, users);
      const normalizedUser1 = normalizeEmail(user1);
      const normalizedUser2 = normalizeEmail(user2);

      if (!authUser || authUser !== normalizedUser1) {
        if (callback) callback({ ok: false, error: "Unauthorized" });
        return;
      }

      const clearedAt = new Date();
      await ClearedChat.findOneAndUpdate(
        { user: normalizedUser1, partner: normalizedUser2 },
        { clearedAt },
        { upsert: true, new: true }
      );

      io.to(normalizedUser1).emit("chat-cleared", {
        user1: normalizedUser1,
        user2: normalizedUser2,
        clearedAt,
        scope: "self",
      });

      if (callback) callback({ ok: true, clearedAt });
    } catch (err) {
      console.error("❌ Error clearing chat:", err.message);
      if (callback) callback({ ok: false, error: err.message });
    }
  });

  socket.on("disconnect", () => {
    for (const roomId in roomUsers) {
      roomUsers[roomId] = roomUsers[roomId].filter((user) => {
        const userEntry = users[normalizeEmail(user)];
        return userEntry instanceof Set ? !userEntry.has(socket.id) : userEntry !== socket.id;
      });
      if (roomUsers[roomId].length === 0) delete roomUsers[roomId];
    }
  });
};
