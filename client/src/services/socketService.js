import { io } from "socket.io-client";

const SOCKET_URL = process.env.REACT_APP_SOCKET_URL || "http://localhost:5000";

console.log("🔗 Socket Server:", SOCKET_URL);

const socket = io(SOCKET_URL, {
  autoConnect: true,
  reconnection: true,
  reconnectionDelay: 2000,
  reconnectionDelayMax: 10000,
  reconnectionAttempts: Infinity,
  randomizationFactor: 0.5,
  timeout: 20000,
  transports: ["websocket", "polling"],
  credentials: true,
});

socket.on("connect", () => {
  console.log("✅ Socket Connected:", socket.id, "Auth:", socket.auth?.email || "none");
});

socket.on("disconnect", (reason) => {
  console.log("❌ Socket Disconnected:", reason);
});

socket.on("connect_error", (error) => {
  console.error("❌ Connection Error:", error.message);
});

// Allow setting auth data before reconnection
// Call this when user logs in to authenticate the socket with the server
export const setSocketAuth = (email, token) => {
  socket.auth = { email, token };
  // If socket is already connected, update auth for next reconnection
  // If disconnected, reconnect with auth
  if (!socket.connected) {
    socket.connect();
  }
};

export default socket;