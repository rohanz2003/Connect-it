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
  console.log("✅ Socket Connected:", socket.id);
});

socket.on("disconnect", () => {
  console.log("❌ Socket Disconnected");
});

socket.on("connect_error", (error) => {
  console.error("❌ Connection Error:", error.message);
});

export default socket;