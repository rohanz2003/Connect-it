const jwt = require("jsonwebtoken");
const User = require("../models/User");
const Device = require("../models/Device");

// Dedicated in-memory memory map for online sockets tracking (email -> socketId set)
const operationalOnlineUsers = new Map();

function initSocket(server) {
  const io = require("socket.io")(server, {
    cors: {
      origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(",") : "*",
      methods: ["GET", "POST"],
      credentials: true
    },
    pingTimeout: 30000,
    pingInterval: 15000
  });

  /**
   * Hardened Handshake Connection Filter Interceptor
   */
  io.use(async (socket, next) => {
    try {
      const authHeader = socket.handshake.headers.authorization;
      const queryToken = socket.handshake.query.token;
      
      let token = null;
      if (authHeader && authHeader.startsWith("Bearer ")) {
        token = authHeader.split(" ")[1];
      } else if (queryToken) {
        token = queryToken;
      }

      if (!token) {
        return next(new Error("Authentication Failure: Missing token context."));
      }

      // Verify Access Token Integrity
      let decoded;
      try {
        decoded = jwt.verify(token, process.env.JWT_SECRET || "fallback_access_secret_production_ready");
      } catch (tokenErr) {
        return next(new Error("Authentication Failure: Session signature invalid or expired."));
      }

      const email = decoded.email.toLowerCase().trim();

      // Enforce Device Session state validation
      if (decoded.deviceId) {
        const matchingDevice = await Device.findOne({ deviceId: decoded.deviceId, isActive: true });
        if (!matchingDevice) {
          return next(new Error("Authentication Failure: Device session revoked."));
        }
      }

      // Attach authoritative context onto active socket model reference
      socket.user = {
        email,
        role: decoded.role,
        deviceId: decoded.deviceId
      };

      next();
    } catch (err) {
      console.error("Socket handshake filtration failure:", err.message);
      return next(new Error("Security Handshake Filtration Exception."));
    }
  });

  io.on("connection", (socket) => {
    const userEmail = socket.user.email;
    console.log(`🔒 Secured socket node connected: ${userEmail} | Device: ${socket.user.deviceId}`);

    // Map user socket reference into active directory
    if (!operationalOnlineUsers.has(userEmail)) {
      operationalOnlineUsers.set(userEmail, new Set());
    }
    operationalOnlineUsers.get(userEmail).add(socket.id);

    // Join specialized private user broadcast room channel
    socket.join(userEmail);

    // Notify peers regarding live online presence update
    io.emit("presence_change", { email: userEmail, status: "online" });

    /**
     * Real-time E2EE Packet Delivery Interceptor Event Handler
     */
    socket.on("send_secure_message", async (packet, ack) => {
      try {
        const { receiverId, roomId, ciphertext, iv, disappearingTimer, fileUrl, fileName, fileType } = packet;
        
        if (!receiverId || !ciphertext || !iv) {
          if (ack) ack({ error: "Malformed payload structures." });
          return;
        }

        const recipientLower = receiverId.toLowerCase().trim();

        // Enforce anti-spoofing sender verification check
        const outgoingMessagePayload = {
          _id: new Date().getTime().toString(), // Transient id for interface reactivity
          senderId: userEmail,
          receiverId: recipientLower,
          roomId,
          ciphertext,
          iv,
          disappearingTimer: disappearingTimer || 0,
          fileUrl: fileUrl || null,
          fileName: fileName || null,
          fileType: fileType || null,
          createdAt: new Date()
        };

        // Deliver E2EE payload directly to target user private channel loop
        io.to(recipientLower).to(userEmail).emit("receive_secure_message", outgoingMessagePayload);

        if (ack) ack({ success: true });
      } catch (err) {
        console.error("Realtime secure packet relay failure:", err.message);
        if (ack) ack({ error: "Internal delivery channel failure." });
      }
    });

    /**
     * Dynamic Typing Indication event tracker
     */
    socket.on("typing_state", (payload) => {
      if (payload && payload.receiverId) {
        io.to(payload.receiverId.toLowerCase().trim()).emit("typing_state_broadcast", {
          senderId: userEmail,
          isTyping: !!payload.isTyping
        });
      }
    });

    /**
     * Explicit Client-Side Disconnection lifecycle routine handler
     */
    socket.on("disconnect", () => {
      console.log(`🔌 Secured socket node disconnected: ${userEmail}`);
      
      const socketSet = operationalOnlineUsers.get(userEmail);
      if (socketSet) {
        socketSet.delete(socket.id);
        if (socketSet.size === 0) {
          operationalOnlineUsers.delete(userEmail);
          
          // Broadcast offline state update to active pool
          io.emit("presence_change", { email: userEmail, status: "offline", lastSeen: new Date() });
        }
      }
    });
  });

  return io;
}

module.exports = initSocket;
