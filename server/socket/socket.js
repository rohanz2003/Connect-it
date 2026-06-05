const { Server } = require("socket.io");
const handlePresence = require("./presence");
const handleTyping = require("./typing");
const handleMessages = require("./message");

const { getCorsOrigins } = require("../config/env");

const initSocket = (server) => {
  const io = new Server(server, {
    cors: {
      origin: getCorsOrigins(),
      methods: ["GET", "POST"],
      credentials: true,
    },
    transports: ["websocket", "polling"],
    pingTimeout: 120000,
    pingInterval: 30000,
  });

  // Global users tracking
  const users = {};
  const userProfiles = {};

  io.on("connection", (socket) => {
    console.log("✅ User connected:", socket.id);

    handlePresence(io, socket, users, userProfiles);
    handleTyping(io, socket, users);
    handleMessages(io, socket, users);

    // General socket logging
    socket.on("disconnect", () => {
      console.log("📊 User disconnected socket:", socket.id);
    });
  });

  return io;
};

module.exports = initSocket;