const { Server } = require("socket.io");
const handlePresence = require("./presence");
const handleTyping = require("./typing");
const handleMessages = require("./message");
const handleCalls = require("./call");
const { getCorsOrigins } = require("../config/env");
const { normalizeEmail, registerSocket, unregisterSocket } = require("../utils/socketAuth");
const { updateLastSeen } = require("../controllers/userController");
const Device = require("../models/Device");
const User = require("../modules/User");
const {
  installSocketEventSecurity,
  socketAuthMiddleware,
} = require("../middleware/socketSecurity");
const { writeAuditLog } = require("../services/auditService");

const crypto = require("crypto");

const generateDeviceId = () => `dev_${crypto.randomBytes(8).toString("hex")}`;

const getVisibleOnlineUsers = async (users) => {
  const onlineIds = Object.keys(users);
  if (onlineIds.length === 0) return [];
  const hiddenUsers = await User.find({
    email: { $in: onlineIds },
    "privacy.hideOnlineStatus": true,
  })
    .select("email")
    .lean();
  const hidden = new Set(hiddenUsers.map((u) => u.email));
  return onlineIds.filter((id) => !hidden.has(id));
};

const emitOnlineUsers = async (io, users) => {
  try {
    io.emit("online-users", await getVisibleOnlineUsers(users));
  } catch (err) {
    console.warn("online user privacy filter failed:", err.message);
    io.emit("online-users", Object.keys(users));
  }
};

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
    maxHttpBufferSize: 10 * 1024 * 1024,
  });

  io.use(socketAuthMiddleware);

  const users = {};
  const userProfiles = {};
  const lastHeartbeats = {};
  const socketToDevice = {};
  const userDeviceSockets = {};

  io.on("connection", async (socket) => {
    installSocketEventSecurity(socket);
    const authenticatedEmail = normalizeEmail(socket.user.email);
    registerSocket(socket.id, authenticatedEmail);

    const auth = socket.handshake.auth || {};
    let deviceId = auth.deviceId;
    const deviceInfo = auth.deviceInfo || {};

    // Register/update device in DB
    (async () => {
      try {
        if (!deviceId) {
          deviceId = generateDeviceId();
        }
        let device = await Device.findOne({ deviceId });
        if (device?.revokedAt || (device && device.userId !== authenticatedEmail)) {
          deviceId = generateDeviceId();
          device = null;
        }
        const isNewDevice = !device;
        device = await Device.findOneAndUpdate(
          { deviceId },
          {
            userId: authenticatedEmail,
            socketId: socket.id,
            isActive: true,
            lastSeen: new Date(),
            loginTime: isNewDevice ? new Date() : device.loginTime || new Date(),
            loggedInAt: isNewDevice ? new Date() : device.loggedInAt || new Date(),
            deviceName: deviceInfo.deviceName || device?.deviceName || "Unknown Device",
            deviceType: deviceInfo.deviceType || device?.deviceType || "desktop",
            platform: deviceInfo.platform || deviceInfo.os || device?.platform || null,
            browser: deviceInfo.browser || device?.browser || "Unknown",
            os: deviceInfo.os || device?.os || "Unknown",
            userAgent: socket.handshake.headers?.["user-agent"] || null,
            revokedAt: null,
          },
          { upsert: true, new: true }
        );
        socket.emit("device-registered", { deviceId });
        socketToDevice[socket.id] = deviceId;
        await writeAuditLog({
          actor: authenticatedEmail,
          action: isNewDevice ? "device_registered" : "login",
          target: deviceId,
          socket,
          metadata: {
            browser: device.browser,
            os: device.os,
            deviceType: device.deviceType,
          },
        });

        socket.to(authenticatedEmail).emit("login-notification", {
          deviceId,
          deviceName: device.deviceName,
          browser: device.browser,
          os: device.os,
          loginTime: device.loginTime,
        });
      } catch (err) {
        console.error("Device registration error:", err.message);
        socket.disconnect(true);
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
          if (disconnectedUser) {
            await writeAuditLog({
              actor: disconnectedUser,
              action: "logout",
              target: devId,
              socket,
            });
          }
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
      emitOnlineUsers(io, users);
    });
  });

  // Periodic check for stale users (no heartbeat in 90s)
  setInterval(() => {
    const now = Date.now();
    const staleTimeout = 90000;
    Object.keys(lastHeartbeats).forEach((userId) => {
      if (now - lastHeartbeats[userId] > staleTimeout) {
        // Double check if any socket is actually still connected
        const sockets = users[userId];
        let hasActiveSocket = false;
        if (sockets instanceof Set) {
          sockets.forEach((sid) => {
            if (io.sockets.sockets.has(sid)) {
              hasActiveSocket = true;
            } else {
              sockets.delete(sid);
            }
          });
          if (sockets.size === 0) delete users[userId];
          else hasActiveSocket = true;
        }

        if (!hasActiveSocket) {
          delete users[userId];
          delete lastHeartbeats[userId];
          updateLastSeen(userId);
          emitOnlineUsers(io, users);
          io.emit("last-seen", { userId, time: new Date().toISOString() });
          console.log(`🧹 Marked user ${userId} as stale (no heartbeat)`);
        } else {
          // User still has active sockets, update their heartbeat to now to give them more time
          lastHeartbeats[userId] = now;
        }
      }
    });
  }, 30000);

  return io;
};

module.exports = initSocket;
