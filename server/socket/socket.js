const { Server } = require("socket.io");
const handlePresence = require("./presence");
const handleTyping = require("./typing");
const handleMessages = require("./message");

const { getCorsOrigins } = require("../config/env");
const { registerSocket, unregisterSocket } = require("../utils/socketAuth");
const { updateLastSeen } = require("../controllers/userController");

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

  io.on("connection", (socket) => {
    handlePresence(io, socket, users, userProfiles);
    handleTyping(io, socket, users);
    handleMessages(io, socket, users);

    socket.on("heartbeat", (email) => {
      if (!email) return;
      const normalized = email.toLowerCase().trim();
      lastHeartbeats[normalized] = Date.now();
    });

    socket.on("disconnect", () => {
      const disconnectedUser = unregisterSocket(socket.id);
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
