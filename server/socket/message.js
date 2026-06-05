const Message = require("../models/Message");
const ClearedChat = require("../models/ClearedChat");
const UserProfile = require("../models/UserProfile");
const ArchivedChat = require("../models/ArchivedChat");
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
  socket.on("join-room", async ({ user1, user2 }) => {
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

    // Non-blocking DB update
    UserProfile.findOneAndUpdate(
      { email: normalizedUser1 },
      { $set: { lastActivity: new Date(), isOnline: true } }
    ).catch(err => console.error("Error updating activity on room join:", err.message));

    if (!roomUsers[roomId]) roomUsers[roomId] = [];
    if (!roomUsers[roomId].includes(normalizedUser1)) {
      roomUsers[roomId].push(normalizedUser1);
    }

    const unreadKey = `${normalizedUser2}_${normalizedUser1}`;
    if (unreadMessages[unreadKey]) {
      unreadMessages[unreadKey] = 0;
      if (isUserOnline(users, normalizedUser1)) {
        const userUnreads = {};
        Object.keys(unreadMessages).forEach(key => {
          if (key.endsWith(`_${normalizedUser1}`)) {
            userUnreads[key] = unreadMessages[key];
          }
        });
        io.to(normalizedUser1).emit("unread-update", userUnreads);
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

      // 1. Encryption (Fast, synchronous-like)
      let encryptedText;
      try {
        encryptedText = encryptPayload(text);
      } catch (encErr) {
        console.error("❌ Encryption failed:", encErr.message);
        if (callback) callback({ ok: false, error: "Message encryption failed" });
        return;
      }

      const isReceiverOnline = isUserOnline(users, normalizedReceiver);
      const initialStatus = isReceiverOnline ? "delivered" : "sent";

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
        status: initialStatus,
        pending: true,
      };

      // 2. 🚀 INSTANT DELIVERY (Before any DB ops)
      io.to(normalizedReceiver).to(roomId).to(normalizedSender).emit("receive-message", optimisticMessage);

      // 3. Update Unread (Fast, in-memory)
      const unreadKey = `${normalizedSender}_${normalizedReceiver}`;
      unreadMessages[unreadKey] = (unreadMessages[unreadKey] || 0) + 1;

      if (isReceiverOnline) {
        const receiverUnreads = {};
        Object.keys(unreadMessages).forEach(key => {
          if (key.endsWith(`_${normalizedReceiver}`)) {
            receiverUnreads[key] = unreadMessages[key];
          }
        });
        io.to(normalizedReceiver).emit("unread-update", receiverUnreads);
      }

      if (callback) callback({ ok: true, pending: true, tempId });

      // 4. Background DB Operations (Non-blocking for the socket response)
      (async () => {
        try {
          // Parallelize independent DB tasks
          const [saved] = await Promise.all([
            Message.create({
              sender: normalizedSender,
              receiver: normalizedReceiver,
              text: encryptedText,
              type: type || "text",
              mediaType: mediaType || null,
              tempId: tempId || undefined,
              replyTo: replyTo || undefined,
              timestamp: msgTimestamp,
              seen: false,
              status: initialStatus,
              deliveredAt: initialStatus === "delivered" ? new Date() : undefined
            }),
            UserProfile.findOneAndUpdate(
              { email: normalizedSender },
              { $set: { lastActivity: new Date(), isOnline: true } }
            ),
            ArchivedChat.deleteMany({
              $or: [
                { user: normalizedSender, partner: normalizedReceiver },
                { user: normalizedReceiver, partner: normalizedSender }
              ]
            })
          ]);

          // Notify about successful save
          io.to(normalizedReceiver).to(roomId).to(normalizedSender).emit("message-saved", {
            tempId: tempId || null,
            _id: saved._id,
            timestamp: saved.timestamp,
            type: saved.type,
            mediaType: saved.mediaType,
            status: saved.status
          });
        } catch (dbErr) {
          console.error(`❌ DB Error for message from ${normalizedSender}:`, dbErr.message);
          socket.emit("message-error", { tempId, error: "Failed to save message" });
        }
      })();
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

  const handleMessageDelivered = async ({ messageId, sender, receiver }) => {
    try {
      const authUser = getAuthenticatedEmail(socket, users);
      const normalizedReceiver = normalizeEmail(receiver);
      if (!authUser || authUser !== normalizedReceiver) return;

      const now = new Date();
      await Message.updateMany(
        { 
          $or: [{ _id: messageId }, { tempId: messageId }],
          sender: normalizeEmail(sender), 
          receiver: normalizedReceiver,
          status: "sent"
        },
        { 
          $set: { 
            status: "delivered",
            deliveredAt: now
          } 
        }
      );

      const roomId = getRoomId(sender, receiver);
      const payload = {
        messageId,
        sender: normalizeEmail(sender),
        receiver: normalizedReceiver,
        deliveredAt: now
      };
      io.to(roomId).emit("message-delivered", payload);
      io.to(roomId).emit("messageDelivered", payload);
    } catch (err) {
      console.warn("messageDelivered failed:", err.message);
    }
  };

  const handleMessageRead = async (data) => {
    try {
      const author = normalizeEmail(data.sender || data.user2);
      const reader = normalizeEmail(data.receiver || data.user1);

      if (!author || !reader) return;

      const authUser = getAuthenticatedEmail(socket, users);
      if (!authUser || authUser !== reader) return;

      const unreadKey = `${author}_${reader}`;
      unreadMessages[unreadKey] = 0;

      const now = new Date();
      await Message.updateMany(
        { sender: author, receiver: reader, status: { $ne: "read" } },
        { $set: { status: "read", seen: true, readAt: now } }
      );

      const roomId = getRoomId(author, reader);
      const payload = {
        sender: author,
        receiver: reader,
        readAt: now
      };
      
      io.to(roomId).emit("messages-read", payload);
      io.to(roomId).emit("message-seen", payload);
      io.to(roomId).emit("messageRead", payload);

      if (isUserOnline(users, reader)) {
        io.to(reader).emit("unread-update", unreadMessages);
      }
    } catch (err) {
      console.warn("messageRead failed:", err.message);
    }
  };

  socket.on("message-delivered", handleMessageDelivered);
  socket.on("messageDelivered", handleMessageDelivered);
  socket.on("mark-as-read", handleMessageRead);
  socket.on("seen-message", handleMessageRead);
  socket.on("messageRead", handleMessageRead);

  // Per-user soft clear (WhatsApp-style): only hides for the requesting user
  socket.on("clear-chat", async ({ user1, user2, keepInRecent = false }, callback) => {
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
        { clearedAt, keepInRecent },
        { upsert: true, new: true }
      );

      io.to(normalizedUser1).emit("chat-cleared", {
        user1: normalizedUser1,
        user2: normalizedUser2,
        clearedAt,
        scope: "self",
        keepInRecent
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
