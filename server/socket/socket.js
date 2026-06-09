const { Server } = require("socket.io");
const handlePresence = require("./presence");
const handleTyping = require("./typing");
const handleMessages = require("./message");

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
  });

  const users = {};
  const userProfiles = {};
  const lastHeartbeats = {};
  const socketToDevice = {};
  const userDeviceSockets = {};

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
