const ChatRequest = require("../models/ChatRequest");
const User = require("../modules/User");

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
