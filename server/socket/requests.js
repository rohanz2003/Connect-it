const ChatRequest = require("../models/ChatRequest");
const Message = require("../models/Message");
const User = require("../modules/User");
const { sendPushNotification } = require("../services/pushService");

const handleRequests = (io, socket, users) => {
  socket.on("send-request", async (data, callback) => {
    try {
      const { from, to } = data;
      if (!from || !to) {
        if (callback) callback({ error: "from and to are required" });
        return;
      }

      const { getAuthenticatedEmail } = require("../utils/socketAuth");
      const authEmail = getAuthenticatedEmail(socket, users);
      if (!authEmail) {
        if (callback) callback({ error: "Not authenticated" });
        return;
      }
      const normalizedFrom = authEmail.toLowerCase();
      const normalizedTo = to.toLowerCase();

      const existing = await ChatRequest.findOne({
        from: normalizedFrom,
        to: normalizedTo,
        status: { $in: ["pending", "accepted"] },
      });
      if (existing) {
        if (callback) callback({ error: "Request already exists" });
        return;
      }

      // Delete any rejected/removed request so a fresh one can be created (unique index)
      await ChatRequest.deleteOne({
        from: normalizedFrom,
        to: normalizedTo,
      });

      const request = await ChatRequest.create({
        from: normalizedFrom,
        to: normalizedTo,
      });

      io.to(to.toLowerCase()).emit("new-request", {
        _id: request._id,
        from: request.from,
        to: request.to,
        status: request.status,
        createdAt: request.createdAt,
      });
      if (callback) callback({ success: true, request });
    } catch (err) {
      console.error("Socket send-request error:", err.message);
      if (callback) callback({ error: err.message });
    }
  });

  socket.on("unsend-request", async (data, callback) => {
    try {
      const { requestId } = data;
      if (!requestId) {
        if (callback) callback({ error: "requestId is required" });
        return;
      }

      const request = await ChatRequest.findByIdAndDelete(requestId);
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
    try {
      const { user, friend } = data;
      if (!user || !friend) {
        if (callback) callback({ error: "user and friend are required" });
        return;
      }

      const { getAuthenticatedEmail } = require("../utils/socketAuth");
      const authEmail = getAuthenticatedEmail(socket, users);
      if (!authEmail) {
        if (callback) callback({ error: "Not authenticated" });
        return;
      }
      const normalizedUser = authEmail.toLowerCase();
      const normalizedFriend = friend.toLowerCase();

      // Delete all chat request records between the two users
      await ChatRequest.deleteMany({
        $or: [
          { from: normalizedUser, to: normalizedFriend },
          { from: normalizedFriend, to: normalizedUser },
        ],
      });

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
    try {
      const { requestId, action } = data;
      if (!requestId || !action) {
        if (callback) callback({ error: "requestId and action are required" });
        return;
      }

      const validActions = ["accepted", "rejected"];
      if (!validActions.includes(action)) {
        if (callback) callback({ error: "action must be 'accepted' or 'rejected'" });
        return;
      }

      const request = await ChatRequest.findByIdAndUpdate(
        requestId,
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
