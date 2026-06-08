import { io } from "socket.io-client";

// Use production backend URL in production, localhost in development
const SOCKET_URL = process.env.REACT_APP_SOCKET_URL || "http://localhost:5000";

console.log("🔗 Connecting to Socket Server:", SOCKET_URL);

const socket = io(SOCKET_URL, {
  autoConnect: true,
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  reconnectionAttempts: 5,
  transports: ["websocket", "polling"],
  credentials: true,
});

socket.on("connect", () => {
  console.log("✅ Socket Connected:", socket.id);
});

socket.on("disconnect", () => {
  console.log("❌ Socket Disconnected");
});

socket.on("connect_error", (error) => {
  console.error("❌ Connection Error:", error);
});

export default socket;