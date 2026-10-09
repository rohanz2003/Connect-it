const ChatRequest = require("../models/ChatRequest");
const Message = require("../models/Message");
const User = require("../modules/User");
const { sendPushNotification } = require("../services/pushService");
const { getAuthenticatedEmail } = require("../utils/socketAuth");

const normalizeEmail = (value) => {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+$/.test(email) ? email : null;
};
const validRequestId = (value) => typeof value === "string" && /^[a-f\d]{24}$/i.test(value);
const authenticatedActor = (socket, users, callback, claimed, field) => {
  // socketAuth resolves the identity verified by the handshake, never payloads.
  const actor = normalizeEmail(getAuthenticatedEmail(socket, users));
  if (!actor) {
    if (callback) callback({ error: "Not authenticated" });
    return null;
  }
  if (field) {
    const email = normalizeEmail(claimed);
    if (!email) {
      if (callback) callback({ error: `${field} must be a valid email` });
      return null;
    }
    if (email !== actor) {
      if (callback) callback({ error: "Cannot act on behalf of another user" });
      return null;
    }
  }
  return actor;
};
const requestPair = (from, to) => ({ $or: [{ from, to }, { from: to, to: from }] });

const handleRequests = (io, socket, users) => {
  socket.on("send-request", async (data, callback) => {
    callback = typeof callback === "function" ? callback : undefined;
    try {
      const normalizedFrom = authenticatedActor(socket, users, callback, data?.from, "from");
      if (!normalizedFrom) return;
      const normalizedTo = normalizeEmail(data?.to);
      if (!normalizedTo) {
        if (callback) callback({ error: "to must be a valid email" });
        return;
      }
      if (normalizedFrom === normalizedTo) {
        if (callback) callback({ error: "Cannot send a request to yourself" });
        return;
      }

      const existing = await ChatRequest.findOne({
        ...requestPair(normalizedFrom, normalizedTo),
        status: { $in: ["pending", "accepted"] },
      });
      if (existing) {
        if (callback) callback({ error: "Request already exists" });
        return;
      }

      // Clear only inactive records, including a previous request in reverse.
      await ChatRequest.deleteMany({
        ...requestPair(normalizedFrom, normalizedTo),
        status: { $in: ["rejected", "removed"] },
      });

      const request = await ChatRequest.create({
        from: normalizedFrom,
        to: normalizedTo,
      });

      io.to(normalizedTo).emit("new-request", {
        _id: request._id,
        from: request.from,
        to: request.to,
        status: request.status,
        createdAt: request.createdAt,
      });
      if (callback) callback({ success: true, request });
    } catch (err) {
      console.error("Socket send-request error:", err.message);
      if (callback) callback({ error: err.code === 11000 ? "Request already exists" : err.message });
    }
  });

  socket.on("unsend-request", async (data, callback) => {
    callback = typeof callback === "function" ? callback : undefined;
    try {
      const actor = authenticatedActor(socket, users, callback);
      if (!actor) return;
      const requestId = data?.requestId;
      if (!validRequestId(requestId)) {
        if (callback) callback({ error: "Invalid requestId" });
        return;
      }

      const request = await ChatRequest.findOneAndDelete({ _id: requestId, from: actor, status: "pending" });
      if (!request) {
        if (callback) callback({ error: "Request not found" });
        return;
      }

      io.to(request.to).emit("request-unsent", {
        requestId,
        from: request.from,
      });

      if (callback) callback({ success: true });
    } catch (err) {
      console.error("Socket unsend-request error:", err.message);
      if (callback) callback({ error: err.message });
    }
  });

  socket.on("remove-friend", async (data, callback) => {
    callback = typeof callback === "function" ? callback : undefined;
    try {
      const normalizedUser = authenticatedActor(socket, users, callback, data?.user, "user");
      if (!normalizedUser) return;
      const normalizedFriend = normalizeEmail(data?.friend);
      if (!normalizedFriend) {
        if (callback) callback({ error: "friend must be a valid email" });
        return;
      }
      if (normalizedUser === normalizedFriend) {
        if (callback) callback({ error: "Cannot remove yourself as a friend" });
        return;
      }

      // Delete all chat request records between the two users
      await ChatRequest.deleteMany(requestPair(normalizedUser, normalizedFriend));

      // Delete all messages between the two users
      await Message.deleteMany({
        $or: [
          { sender: normalizedUser, receiver: normalizedFriend },
          { sender: normalizedFriend, receiver: normalizedUser },
        ],
      });

      // Notify the other user
      io.to(normalizedFriend).emit("friend-removed", {
        by: normalizedUser,
      });

      // Send push notification
      const remover = await User.findOne({ email: normalizedUser }).lean();
      const removerName = remover?.displayName || normalizedUser.split("@")[0];
      sendPushNotification(normalizedFriend, {
        title: "Friend Removed",
        body: `${removerName} removed you as a friend`,
        icon: "/logo192.png",
        badge: "/favicon.ico",
        data: { by: normalizedUser, type: "friend-removed" },
      });

      if (callback) callback({ success: true });
    } catch (err) {
      console.error("Socket remove-friend error:", err.message);
      if (callback) callback({ error: err.message });
    }
  });

  socket.on("respond-request", async (data, callback) => {
    callback = typeof callback === "function" ? callback : undefined;
    try {
      const actor = authenticatedActor(socket, users, callback);
      if (!actor) return;
      const { requestId, action } = data || {};
      if (!validRequestId(requestId)) {
        if (callback) callback({ error: "Invalid requestId" });
        return;
      }

      const validActions = ["accepted", "rejected"];
      if (!validActions.includes(action)) {
        if (callback) callback({ error: "action must be 'accepted' or 'rejected'" });
        return;
      }

      const request = await ChatRequest.findOneAndUpdate(
        { _id: requestId, to: actor, from: { $ne: actor }, status: "pending" },
        { status: action, respondedAt: new Date() },
        { returnDocument: "after" }
      );

      if (!request) {
        if (callback) callback({ error: "Request not found" });
        return;
      }

      io.to(request.from).emit("request-response", {
        status: action,
        from: request.to,
        to: request.from,
        requestId: request._id,
      });

      if (action === "accepted") {
        const responder = await User.findOne({ email: request.to }).lean();
        const responderName = responder?.displayName || request.to.split("@")[0];
        sendPushNotification(request.from, {
          title: "Chat Request Accepted",
          body: `${responderName} accepted your chat request`,
          icon: "/logo192.png",
          badge: "/favicon.ico",
          data: { from: request.to, type: "request-accepted" },
        });
      }

      if (callback) callback({ success: true, request });
    } catch (err) {
      console.error("Socket respond-request error:", err.message);
      if (callback) callback({ error: err.message });
    }
  });
};

module.exports = handleRequests;
