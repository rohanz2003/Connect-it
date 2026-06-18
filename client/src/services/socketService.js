import { io } from "socket.io-client";
import { getAuthToken } from "./authToken";
import { getDeviceInfo } from "../utils/deviceDetector";

const SOCKET_URL = process.env.REACT_APP_SOCKET_URL || "http://localhost:5000";

const socket = io(SOCKET_URL, {
  autoConnect: false,
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  reconnectionAttempts: 5,
  transports: ["websocket", "polling"],
});

socket.on("connect", () => {
  console.log("✅ Socket Connected:", socket.id);
});

socket.on("disconnect", (reason) => {
  console.log("❌ Socket Disconnected:", reason);
});

socket.on("connect_error", async (error) => {
  console.error("❌ Connection Error:", error.message);
  if (
    error.message === "Unauthorized socket" ||
    error.message === "Socket identity mismatch"
  ) {
    const newToken = await getAuthToken(true);
    if (newToken) {
      socket.auth = { ...socket.auth, token: newToken };
      socket.connect();
    }
  }
});

export const connectSocket = async () => {
  const token = await getAuthToken();
  const deviceInfo = getDeviceInfo();
  socket.auth = { token, deviceInfo };
  socket.connect();
  return socket;
};

export const disconnectSocket = () => {
  socket.removeAllListeners();
  socket.disconnect();
};

export default socket;