const ChatRequest = require("../models/ChatRequest");
const Message = require("../models/Message");
const User = require("../modules/User");
const { sendPushNotification } = require("../services/pushService");

exports.sendRequest = async (req, res) => {
  try {
    const { from, to } = req.body;
    if (!from || !to) return res.status(400).json({ error: "from and to are required" });

    const existing = await ChatRequest.findOne({
      from: from.toLowerCase(),
      to: to.toLowerCase(),
      status: { $in: ["pending", "accepted"] },
    });
    if (existing) return res.status(400).json({ error: "Request already exists" });

    const request = await ChatRequest.create({
      from: from.toLowerCase(),
      to: to.toLowerCase(),
    });

    const populated = await ChatRequest.findById(request._id).lean();

    const io = req.app.get("io");
    if (io) {
      io.to(to.toLowerCase()).emit("new-request", {
        _id: request._id,
        from: request.from,
        to: request.to,
        status: request.status,
        createdAt: request.createdAt,
      });
    }

    res.json({ success: true, request: populated });
  } catch (err) {
    console.error("Error sending request:", err.message);
    if (err.code === 11000) return res.status(400).json({ error: "Request already exists" });
    res.status(500).json({ error: "Failed to send request" });
  }
};

exports.unsendRequest = async (req, res) => {
  try {
    const { requestId } = req.params;
    const request = await ChatRequest.findByIdAndDelete(requestId);
    if (!request) return res.status(404).json({ error: "Request not found" });
    res.json({ success: true });
  } catch (err) {
    console.error("Error unsending request:", err.message);
    res.status(500).json({ error: "Failed to unsend request" });
  }
};

exports.getPendingRequests = async (req, res) => {
  try {
    const { email } = req.params;
    if (!email) return res.status(400).json({ error: "email is required" });

    const requests = await ChatRequest.find({
      to: email.toLowerCase(),
      status: "pending",
    }).sort({ createdAt: -1 }).lean();

    res.json({ success: true, requests });
  } catch (err) {
    console.error("Error fetching pending requests:", err.message);
    res.status(500).json({ error: "Failed to fetch requests" });
  }
};

exports.getSentRequests = async (req, res) => {
  try {
    const { email } = req.params;
    if (!email) return res.status(400).json({ error: "email is required" });

    const requests = await ChatRequest.find({
      from: email.toLowerCase(),
    }).sort({ createdAt: -1 }).lean();

    res.json({ success: true, requests });
  } catch (err) {
    console.error("Error fetching sent requests:", err.message);
    res.status(500).json({ error: "Failed to fetch sent requests" });
  }
};

exports.respondToRequest = async (req, res) => {
  try {
    const { requestId, action } = req.body;
    if (!requestId || !action) return res.status(400).json({ error: "requestId and action are required" });
    if (!["accepted", "rejected"].includes(action)) return res.status(400).json({ error: "action must be 'accepted' or 'rejected'" });

    const request = await ChatRequest.findByIdAndUpdate(
      requestId,
      { status: action, respondedAt: new Date() },
      { new: true }
    );

    if (!request) return res.status(404).json({ error: "Request not found" });

    const io = req.app.get("io");
    if (io) {
      io.to(request.from).emit("request-response", {
        status: action,
        from: request.to,
        to: request.from,
        requestId: request._id,
      });
    }

    // Send push notification for acceptance
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

    res.json({ success: true, request });
  } catch (err) {
    console.error("Error responding to request:", err.message);
    res.status(500).json({ error: "Failed to respond to request" });
  }
};

exports.getAcceptedChats = async (req, res) => {
  try {
    const { email } = req.params;
    if (!email) return res.status(400).json({ error: "email is required" });

    const normalized = email.toLowerCase();
    const requests = await ChatRequest.find({
      $or: [{ from: normalized, status: "accepted" }, { to: normalized, status: "accepted" }],
    }).sort({ respondedAt: -1 }).lean();

    const partners = requests.map((r) =>
      r.from === normalized ? r.to : r.from
    );

    res.json({ success: true, partners });
  } catch (err) {
    console.error("Error fetching accepted chats:", err.message);
    res.status(500).json({ error: "Failed to fetch accepted chats" });
  }
};

exports.removeFriend = async (req, res) => {
  try {
    const { user, friend } = req.body;
    if (!user || !friend) return res.status(400).json({ error: "user and friend are required" });

    const normalizedUser = user.toLowerCase();
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

    // Notify the other user via socket
    const io = req.app.get("io");
    if (io) {
      io.to(normalizedFriend).emit("friend-removed", {
        by: normalizedUser,
      });
    }

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

    res.json({ success: true });
  } catch (err) {
    console.error("Error removing friend:", err.message);
    res.status(500).json({ error: "Failed to remove friend" });
  }
};

exports.getRequestStatuses = async (req, res) => {
  try {
    const { email } = req.params;
    if (!email) return res.status(400).json({ error: "email is required" });

    const normalized = email.toLowerCase();
    const requests = await ChatRequest.find({
      $or: [{ from: normalized }, { to: normalized }],
    }).sort({ createdAt: -1 }).lean();

    const statusMap = {};
    for (const req of requests) {
      const other = req.from === normalized ? req.to : req.from;
      if (req.status === "rejected") {
        if (!statusMap[other] || statusMap[other] === "none") {
          statusMap[other] = { status: "rejected", requestId: req._id, direction: req.from === normalized ? "sent" : "received" };
        }
        continue;
      }
      statusMap[other] = {
        status: req.status,
        direction: req.from === normalized ? "sent" : "received",
        requestId: req._id,
      };
    }

    res.json({ success: true, statuses: statusMap });
  } catch (err) {
    console.error("Error fetching request statuses:", err.message);
    res.status(500).json({ error: "Failed to fetch request statuses" });
  }
};
