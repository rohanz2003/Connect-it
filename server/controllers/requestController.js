const ChatRequest = require("../models/ChatRequest");
const Message = require("../models/Message");
const User = require("../modules/User");
const { sendPushNotification } = require("../services/pushService");

const normalizeEmail = (value) => {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+$/.test(email) ? email : null;
};
const validRequestId = (value) => typeof value === "string" && /^[a-f\d]{24}$/i.test(value);
const authenticatedActor = (req, res, claimed, field) => {
  const actor = normalizeEmail(req.user?.email);
  if (!actor) {
    res.status(401).json({ error: "Authentication required" });
    return null;
  }
  if (field) {
    const email = normalizeEmail(claimed);
    if (!email) {
      res.status(400).json({ error: `${field} must be a valid email` });
      return null;
    }
    if (email !== actor) {
      res.status(403).json({ error: "Cannot act on behalf of another user" });
      return null;
    }
  }
  return actor;
};
const requestPair = (from, to) => ({ $or: [{ from, to }, { from: to, to: from }] });

exports.sendRequest = async (req, res) => {
  try {
    const normalizedFrom = authenticatedActor(req, res, req.body?.from, "from");
    if (!normalizedFrom) return;
    const normalizedTo = normalizeEmail(req.body?.to);
    if (!normalizedTo) return res.status(400).json({ error: "to must be a valid email" });
    if (normalizedFrom === normalizedTo) return res.status(400).json({ error: "Cannot send a request to yourself" });

    const existing = await ChatRequest.findOne({
      ...requestPair(normalizedFrom, normalizedTo),
      status: { $in: ["pending", "accepted"] },
    });
    if (existing) return res.status(400).json({ error: "Request already exists" });

    // Clear only inactive records, including a previous request in reverse.
    await ChatRequest.deleteMany({
      ...requestPair(normalizedFrom, normalizedTo),
      status: { $in: ["rejected", "removed"] },
    });

    const request = await ChatRequest.create({
      from: normalizedFrom,
      to: normalizedTo,
    });

    const populated = await ChatRequest.findById(request._id).lean();

    const io = req.app.get("io");
    if (io) {
      io.to(normalizedTo).emit("new-request", {
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
    const actor = authenticatedActor(req, res);
    if (!actor) return;
    const requestId = req.params?.requestId;
    if (!validRequestId(requestId)) return res.status(400).json({ error: "Invalid requestId" });
    const request = await ChatRequest.findOneAndDelete({ _id: requestId, from: actor, status: "pending" });
    if (!request) return res.status(404).json({ error: "Request not found" });

    // Notify the recipient that the request was cancelled
    const io = req.app.get("io");
    if (io) {
      io.to(request.to).emit("request-unsent", {
        requestId,
        from: request.from,
      });
    }

    res.json({ success: true });
  } catch (err) {
    console.error("Error unsending request:", err.message);
    res.status(500).json({ error: "Failed to unsend request" });
  }
};

exports.getPendingRequests = async (req, res) => {
  try {
    const actor = authenticatedActor(req, res, req.params?.email, "email");
    if (!actor) return;

    const requests = await ChatRequest.find({
      to: actor,
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
    const actor = authenticatedActor(req, res, req.params?.email, "email");
    if (!actor) return;

    const requests = await ChatRequest.find({
      from: actor,
    }).sort({ createdAt: -1 }).lean();

    res.json({ success: true, requests });
  } catch (err) {
    console.error("Error fetching sent requests:", err.message);
    res.status(500).json({ error: "Failed to fetch sent requests" });
  }
};

exports.respondToRequest = async (req, res) => {
  try {
    const actor = authenticatedActor(req, res);
    if (!actor) return;
    const { requestId, action } = req.body || {};
    if (!validRequestId(requestId)) return res.status(400).json({ error: "Invalid requestId" });
    if (!["accepted", "rejected"].includes(action)) return res.status(400).json({ error: "action must be 'accepted' or 'rejected'" });

    const request = await ChatRequest.findOneAndUpdate(
      { _id: requestId, to: actor, from: { $ne: actor }, status: "pending" },
      { status: action, respondedAt: new Date() },
      { returnDocument: "after" }
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
    const normalized = authenticatedActor(req, res, req.params?.email, "email");
    if (!normalized) return;

    const requests = await ChatRequest.find({
      $or: [{ from: normalized, status: "accepted" }, { to: normalized, status: "accepted" }],
    }).sort({ respondedAt: -1 }).lean();

    const partners = [...new Set(requests.map((r) =>
      r.from === normalized ? r.to : r.from
    ))];

    res.json({ success: true, partners });
  } catch (err) {
    console.error("Error fetching accepted chats:", err.message);
    res.status(500).json({ error: "Failed to fetch accepted chats" });
  }
};

exports.removeFriend = async (req, res) => {
  try {
    const normalizedUser = authenticatedActor(req, res, req.body?.user, "user");
    if (!normalizedUser) return;
    const normalizedFriend = normalizeEmail(req.body?.friend);
    if (!normalizedFriend) return res.status(400).json({ error: "friend must be a valid email" });
    if (normalizedUser === normalizedFriend) return res.status(400).json({ error: "Cannot remove yourself as a friend" });

    // Delete all chat request records between the two users
    await ChatRequest.deleteMany(requestPair(normalizedUser, normalizedFriend));

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
    const normalized = authenticatedActor(req, res, req.params?.email, "email");
    if (!normalized) return;

    const requests = await ChatRequest.find({
      $or: [{ from: normalized }, { to: normalized }],
    }).sort({ createdAt: -1 }).lean();

    const statusMap = {};
    // Legacy reversed records may coexist. Accepted wins over pending, and the
    // newest record wins among equal statuses (the query is newest-first).
    const priority = { accepted: 3, pending: 2, rejected: 1, removed: 0 };
    for (const req of requests) {
      const other = req.from === normalized ? req.to : req.from;
      if (statusMap[other] && priority[statusMap[other].status] >= priority[req.status]) continue;
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
