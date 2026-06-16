const { Server } = require("socket.io");
const handlePresence = require("./presence");
const handleTyping = require("./typing");
const handleMessages = require("./message");
const handleCalls = require("./call");
const { getCorsOrigins } = require("../config/env");
const { registerSocket, unregisterSocket } = require("../utils/socketAuth");
const { updateLastSeen } = require("../controllers/userController");
const Device = require("../models/Device");

const crypto = require("crypto");

const generateDeviceId = () => `dev_${crypto.randomBytes(8).toString("hex")}`;

const initSocket = (server) => {
  const io = new Server(server, {
    cors: {
      origin: getCorsOrigins(),
      methods: ["GET", "POST"],
      credentials: true,
    },
    transports: ["websocket", "polling"],
    pingTimeout: 60000,
    pingInterval: 25000,
    maxHttpBufferSize: 50 * 1024 * 1024, // 50MB for audio/video uploads
  });

  const users = {};
  const userProfiles = {};
  const lastHeartbeats = {};
  const socketToDevice = {};
  const userDeviceSockets = {};

  // Socket authentication middleware
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      const email = socket.handshake.auth?.email;

      if (!email) {
        return next(new Error("Authentication required: no email provided"));
      }

      // If JWT token is provided, verify it
      if (token) {
        try {
          const admin = require("firebase-admin");
          const decoded = await admin.auth().verifyIdToken(token);
          if (decoded.email && decoded.email.toLowerCase() !== email.toLowerCase()) {
            return next(new Error("Authentication failed: email mismatch"));
          }
          socket.userEmail = decoded.email.toLowerCase().trim();
          socket.userUid = decoded.uid;
        } catch (err) {
          // Token verification failed, but allow with email-only auth
          // (backward compatibility with existing clients)
          socket.userEmail = email.toLowerCase().trim();
        }
      } else {
        socket.userEmail = email.toLowerCase().trim();
      }

      next();
    } catch (err) {
      next(new Error("Authentication error"));
    }
  });

  // Connection rate limiter (per IP)
  const connectionCounts = new Map();
  io.use((socket, next) => {
    const ip = socket.handshake.address;
    const count = connectionCounts.get(ip) || 0;
    if (count > 10) {
      // Max 10 connections per IP
      return next(new Error("Too many connections from this IP"));
    }
    connectionCounts.set(ip, count + 1);
    socket.on("disconnect", () => {
      const c = connectionCounts.get(ip);
      if (c && c > 1) {
        connectionCounts.set(ip, c - 1);
      } else {
        connectionCounts.delete(ip);
      }
    });
    next();
  });

  io.on("connection", async (socket) => {
    const auth = socket.handshake.auth || {};
    let deviceId = auth.deviceId;

    // Register/update device in DB
    (async () => {
      try {
        if (!deviceId) {
          deviceId = generateDeviceId();
        }
        let device = await Device.findOne({ deviceId });
        if (device) {
          device.socketId = socket.id;
          device.isActive = true;
          device.lastSeen = new Date();
          await device.save();
        }
        socket.emit("device-registered", { deviceId });
        socketToDevice[socket.id] = deviceId;
      } catch (err) {
        console.error("Device registration error:", err.message);
      }
    })();

    handlePresence(io, socket, users, userProfiles, socketToDevice, userDeviceSockets);
    handleTyping(io, socket, users);
    handleMessages(io, socket, users, socketToDevice, userDeviceSockets);
    handleCalls(io, socket, users);

    socket.on("heartbeat", (email) => {
      if (!email) return;
      const normalized = email.toLowerCase().trim();
      lastHeartbeats[normalized] = Date.now();
    });

    socket.on("disconnect", async () => {
      const disconnectedUser = unregisterSocket(socket.id);

      // Mark device inactive
      const devId = socketToDevice[socket.id];
      if (devId) {
        try {
          await Device.findOneAndUpdate(
            { deviceId: devId },
            { isActive: false, socketId: null, lastSeen: new Date() }
          );
        } catch (err) {
          console.error("Device disconnect error:", err.message);
        }
        delete socketToDevice[socket.id];
        // Remove from userDeviceSockets
        for (const uid of Object.keys(userDeviceSockets)) {
          if (userDeviceSockets[uid][devId] === socket.id) {
            delete userDeviceSockets[uid][devId];
            if (Object.keys(userDeviceSockets[uid]).length === 0) {
              delete userDeviceSockets[uid];
            }
            break;
          }
        }
      }

      for (let userId in users) {
        const entry = users[userId];
        if (entry && typeof entry.delete === "function") {
          if (entry.has(socket.id)) {
            entry.delete(socket.id);
            if (entry.size === 0) {
              delete users[userId];
              delete lastHeartbeats[userId];
              updateLastSeen(userId);
              io.emit("last-seen", { userId, time: new Date().toISOString() });
            }
          }
        } else if (entry === socket.id) {
          delete users[userId];
          delete lastHeartbeats[userId];
          updateLastSeen(userId);
          io.emit("last-seen", { userId, time: new Date().toISOString() });
        }
      }
      io.emit("online-users", Object.keys(users));
    });
  });

  // Periodic check for stale users (no heartbeat in 30s)
  setInterval(() => {
    const now = Date.now();
    const staleTimeout = 30000;
    Object.keys(lastHeartbeats).forEach((userId) => {
      if (now - lastHeartbeats[userId] > staleTimeout) {
        const sockets = users[userId];
        if (sockets instanceof Set) {
          sockets.forEach((sid) => {
            const sock = io.sockets.sockets.get(sid);
            if (sock) {
              sock.leave(userId);
            }
          });
        }
        delete users[userId];
        delete lastHeartbeats[userId];
        updateLastSeen(userId);
        io.emit("online-users", Object.keys(users));
        io.emit("last-seen", { userId, time: new Date().toISOString() });
      }
    });
  }, 15000);

  return io;
};

module.exports = initSocket;
