const ChatRequest = require("../models/ChatRequest");

const handleRequests = (io, socket, users) => {
  socket.on("send-request", async (data, callback) => {
    try {
      const { from, to } = data;
      if (!from || !to) {
        if (callback) callback({ error: "from and to are required" });
        return;
      }

      const existing = await ChatRequest.findOne({
        from: from.toLowerCase(),
        to: to.toLowerCase(),
        status: "pending",
      });
      if (existing) {
        if (callback) callback({ error: "Request already sent" });
        return;
      }

      const request = await ChatRequest.create({
        from: from.toLowerCase(),
        to: to.toLowerCase(),
      });

      io.to(to.toLowerCase()).emit("new-request", request);
      if (callback) callback({ success: true, request });
    } catch (err) {
      console.error("Socket send-request error:", err.message);
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

      const request = await ChatRequest.findByIdAndUpdate(
        requestId,
        { status: action, respondedAt: new Date() },
        { new: true }
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

      if (callback) callback({ success: true, request });
    } catch (err) {
      console.error("Socket respond-request error:", err.message);
      if (callback) callback({ error: err.message });
    }
  });
};

module.exports = handleRequests;
