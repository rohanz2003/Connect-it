const { Server } = require("socket.io");
const handlePresence = require("./presence");
const handleTyping = require("./typing");
const handleMessages = require("./message");

const initSocket = (server) => {
  const io = new Server(server, {
    cors: { 
      origin: [
        "http://localhost:3000",
        process.env.FRONTEND_URL,
        "https://connect-it-frontend.vercel.app"
      ].filter(Boolean),
      methods: ["GET", "POST"],
      credentials: true
    },
    transports: ["websocket", "polling"],
  });

  // Global users tracking
  const users = {};
  const userProfiles = {};

  io.on("connection", (socket) => {
    console.log("✅ User connected:", socket.id);

    handlePresence(io, socket, users, userProfiles);
    handleTyping(io, socket, users);
    handleMessages(io, socket, users);

    // Handle disconnect
    socket.on("disconnect", () => {
      for (let userId in users) {
        const entry = users[userId];
        // If we stored a Set of socket ids (new behavior)
        if (entry && typeof entry.delete === "function") {
          if (entry.has(socket.id)) {
            entry.delete(socket.id);
            if (entry.size === 0) {
              delete users[userId];
              console.log(`❌ ${userId} is offline`);
            } else {
              console.log(`🔁 ${userId} disconnected a socket, remaining connections: ${Array.from(entry).join(", ")}`);
            }
          }
        } else {
          // Legacy single-socket entry
          if (entry === socket.id) {
            delete users[userId];
            console.log(`❌ ${userId} is offline`);
          }
        }
      }
      console.log("📊 Current online users:", Object.keys(users));
      io.emit("online-users", Object.keys(users));
    });
  });
};

module.exports = initSocket;