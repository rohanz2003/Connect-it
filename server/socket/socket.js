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

  io.on("connection", (socket) => {
    handlePresence(io, socket, users, userProfiles);
    handleTyping(io, socket, users);
    handleMessages(io, socket, users);

    socket.on("disconnect", () => {
      const disconnectedUser = unregisterSocket(socket.id);
      for (let userId in users) {
        const entry = users[userId];
        if (entry && typeof entry.delete === "function") {
          if (entry.has(socket.id)) {
            entry.delete(socket.id);
            if (entry.size === 0) {
              delete users[userId];
            }
          }
        } else if (entry === socket.id) {
          delete users[userId];
        }
      }
      io.emit("online-users", Object.keys(users));
      if (disconnectedUser) {
        updateLastSeen(disconnectedUser);
        io.emit("last-seen", { userId: disconnectedUser, time: new Date().toISOString() });
      }
    });
  });

  return io;
};

module.exports = initSocket;
