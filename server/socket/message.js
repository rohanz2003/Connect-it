const Message = require("../models/Message");
const ClearedChat = require("../models/ClearedChat");
const User = require("../modules/User");
const { normalizeEmail, getAuthenticatedEmail, getRoomId } = require("../utils/socketAuth");
const { isDatabaseConnected } = require("../config/database");
const { sendPushNotification } = require("../services/pushService");
const { writeAuditLog } = require("../services/auditService");

const roomUsers = {};
const unreadMessages = {};

const isUserOnline = (users, email) => {
  const entry = users[normalizeEmail(email)];
  return entry instanceof Set ? entry.size > 0 : Boolean(entry);
};

const getUserPrivacy = async (email) => {
  const user = await User.findOne({ email: normalizeEmail(email) })
    .select("blockedUsers privacy")
    .lean();
  return {
    blockedUsers: user?.blockedUsers || [],
    privacy: user?.privacy || {},
  };
};

const isBlocked = async (sender, receiver) => {
  const [senderState, receiverState] = await Promise.all([
    getUserPrivacy(sender),
    getUserPrivacy(receiver),
  ]);
  return (
    senderState.blockedUsers.includes(receiver) ||
    receiverState.blockedUsers.includes(sender)
  );
};

const getExpiryDate = async (sender) => {
  const { privacy } = await getUserPrivacy(sender);
  const disappearing = privacy?.disappearingMessages;
  if (!disappearing?.enabled || !disappearing.durationSeconds) return null;
  return new Date(Date.now() + disappearing.durationSeconds * 1000);
};

module.exports = (io, socket, users, socketToDevice, userDeviceSockets) => {
  socket.on("join-room", ({ user1, user2 }) => {
    const authUser = getAuthenticatedEmail(socket, users);
    const normalizedUser1 = normalizeEmail(user1);
    const normalizedUser2 = normalizeEmail(user2);

    if (!authUser || authUser !== normalizedUser1) {
      return;
    }

    const roomId = getRoomId(normalizedUser1, normalizedUser2);

    for (const room of socket.rooms) {
      if (room !== socket.id && room !== normalizedUser1 && room.includes("_")) {
        socket.leave(room);
      }
    }

    socket.join(roomId);

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
      const authSender = getAuthenticatedEmail(socket, users);
      if (!authSender) {
        if (callback) callback({ ok: false, error: "Not authenticated" });
        return;
      }

      if (!isDatabaseConnected()) {
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
        if (callback) callback({ ok: false, error: "Sender mismatch" });
        return;
      }

      if (!normalizedReceiver || !text) {
        if (callback) callback({ ok: false, error: "Invalid message payload" });
        return;
      }

      if (await isBlocked(normalizedSender, normalizedReceiver)) {
        if (callback) callback({ ok: false, error: "Message blocked by user privacy settings" });
        return;
      }

      const roomId = getRoomId(normalizedSender, normalizedReceiver);
      const msgTimestamp = timestamp ? new Date(timestamp) : new Date();

      if (tempId) {
        const existing = await Message.findOne({ tempId }).lean();
        if (existing) {
          io.to(roomId).to(normalizedReceiver).emit("receive-message", existing);
          io.to(roomId).to(normalizedReceiver).emit("message-saved", {
            tempId,
            _id: existing._id,
            timestamp: existing.timestamp,
          });
          if (callback) callback({ ok: true, _id: existing._id, duplicate: true });
          return;
        }
      }

      const receiverOnline = isUserOnline(users, normalizedReceiver);
      const receiverDevices = userDeviceSockets[normalizedReceiver] || {};

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
        status: receiverOnline ? "delivered" : "sent",
        pending: true,
      };

      Object.values(receiverDevices).forEach((sid) => {
        io.to(sid).emit("receive-message", optimisticMessage);
      });
      io.to(normalizedReceiver).emit("receive-message", optimisticMessage);

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
          text,
          type: type || "text",
          mediaType: mediaType || null,
          tempId: tempId || undefined,
          replyTo: replyTo || undefined,
          timestamp: msgTimestamp,
          status: "sent",
          deliveredDevices: [],
          readDevices: [],
          expiresAt: await getExpiryDate(normalizedSender),
        });

        io.to(roomId).to(normalizedSender).emit("message-status-update", {
          messageId: saved._id,
          tempId: tempId || null,
          status: "sent",
        });

        const deliveredDeviceIds = Object.keys(receiverDevices);

        if (deliveredDeviceIds.length > 0) {
          await Message.updateOne(
            { _id: saved._id },
            {
              status: "delivered",
              $addToSet: { deliveredDevices: { $each: deliveredDeviceIds } },
            }
          );
          io.to(roomId).to(normalizedSender).emit("message-status-update", {
            messageId: saved._id,
            tempId: tempId || null,
            status: "delivered",
            deliveredDevices: deliveredDeviceIds,
          });
        } else {
          sendPushNotification(normalizedReceiver, {
            title: "New message",
            body: "New encrypted message",
            icon: "/logo192.png",
            badge: "/favicon.ico",
            data: {
              senderId: normalizedSender,
              messageId: saved._id,
              url: "/",
            },
          });
        }

        io.to(roomId).to(normalizedReceiver).emit("message-saved", {
          tempId: tempId || null,
          _id: saved._id,
          timestamp: saved.timestamp,
          status: deliveredDeviceIds.length > 0 ? "delivered" : "sent",
        });
      } catch (dbErr) {
        console.error(`Failed to save message from ${normalizedSender} to ${normalizedReceiver}:`, dbErr.message);
        socket.emit("message-error", {
          tempId,
          error: "Failed to save message",
          details: dbErr.message,
        });
      }
    } catch (err) {
      console.error("Error sending message:", err.message);
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

      await writeAuditLog({
        actor: normalizedSender,
        action: "message_deletion",
        target: String(messageId),
        socket,
      });

      const roomId = getRoomId(normalizedSender, normalizeEmail(receiver));
      io.to(roomId).emit("message-deleted", {
        messageId,
        sender: normalizedSender,
        receiver: normalizeEmail(receiver),
      });
    } catch (err) {
      console.error("Error deleting message:", err.message);
    }
  });

  socket.on("mark-as-read", async ({ user1, user2 }) => {
    const authUser = getAuthenticatedEmail(socket, users);
    const normalizedUser1 = normalizeEmail(user1);
    const normalizedUser2 = normalizeEmail(user2);
    if (!authUser || authUser !== normalizedUser1) return;

    const { privacy } = await getUserPrivacy(normalizedUser1);
    const unreadKey = `${normalizedUser2}_${normalizedUser1}`;
    unreadMessages[unreadKey] = 0;
    if (isUserOnline(users, normalizedUser1)) {
      io.to(normalizedUser1).emit("unread-update", unreadMessages);
    }
    if (privacy?.hideReadReceipts) return;

    const readingDeviceId = socketToDevice ? socketToDevice[socket.id] : null;
    const updateOp = { status: "read" };
    if (readingDeviceId) {
      updateOp.$addToSet = { readDevices: readingDeviceId, deliveredDevices: readingDeviceId };
    }

    Message.updateMany(
      { sender: normalizedUser2, receiver: normalizedUser1, status: { $in: ["sent", "delivered"] } },
      updateOp
    ).catch((err) => console.warn("mark-as-read DB update failed:", err.message));

    const senderDevices = userDeviceSockets ? userDeviceSockets[normalizedUser2] : null;
    if (senderDevices) {
      Object.values(senderDevices).forEach((sid) => {
        io.to(sid).emit("messages-read", {
          sender: normalizedUser2,
          receiver: normalizedUser1,
          readOnDevice: readingDeviceId,
        });
      });
    }
    io.to(normalizedUser2).emit("messages-read", {
      sender: normalizedUser2,
      receiver: normalizedUser1,
      readOnDevice: readingDeviceId,
    });
  });

  socket.on("seen-message", async ({ sender, receiver }) => {
    try {
      const authUser = getAuthenticatedEmail(socket, users);
      const normalizedReceiver = normalizeEmail(receiver);
      const normalizedSender = normalizeEmail(sender);
      if (!authUser || authUser !== normalizedReceiver) return;

      const { privacy } = await getUserPrivacy(normalizedReceiver);
      if (privacy?.hideReadReceipts) return;

      const readingDeviceId = socketToDevice ? socketToDevice[socket.id] : null;
      const updateOp = { status: "read" };
      if (readingDeviceId) {
        updateOp.$addToSet = { readDevices: readingDeviceId, deliveredDevices: readingDeviceId };
      }

      await Message.updateMany(
        { sender: normalizedSender, receiver: normalizedReceiver, status: { $in: ["sent", "delivered"] } },
        updateOp
      );

      const senderDevices = userDeviceSockets ? userDeviceSockets[normalizedSender] : null;
      if (senderDevices) {
        Object.values(senderDevices).forEach((sid) => {
          io.to(sid).emit("messages-read", {
            sender: normalizedSender,
            receiver: normalizedReceiver,
            readOnDevice: readingDeviceId,
          });
        });
      }
      io.to(normalizedSender).emit("messages-read", {
        sender: normalizedSender,
        receiver: normalizedReceiver,
        readOnDevice: readingDeviceId,
      });
    } catch (err) {
      console.warn("seen-message failed:", err.message);
    }
  });

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

      await writeAuditLog({
        actor: normalizedUser1,
        action: "chat_deleted",
        target: normalizedUser2,
        socket,
      });

      io.to(normalizedUser1).emit("chat-cleared", {
        user1: normalizedUser1,
        user2: normalizedUser2,
        clearedAt,
        scope: "self",
      });

      if (callback) callback({ ok: true, clearedAt });
    } catch (err) {
      console.error("Error clearing chat:", err.message);
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
