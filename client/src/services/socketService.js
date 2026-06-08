import { io } from "socket.io-client";

const SOCKET_URL = process.env.REACT_APP_SOCKET_URL || process.env.REACT_APP_API_URL || "http://localhost:5000";

const socket = io(SOCKET_URL, {
  autoConnect: true,
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  reconnectionAttempts: Infinity,
  transports: ["websocket", "polling"],
  credentials: true,
});

socket.on("connect", () => {
  console.log("Socket Connected:", socket.id);
});

socket.on("disconnect", (reason) => {
  console.log("Socket Disconnected:", reason);
});

socket.on("connect_error", (error) => {
  console.error("Socket Connection Error:", error.message);
});

socket.on("reconnect", (attempt) => {
  console.log("Socket Reconnected after", attempt, "attempts");
});

export default socket;