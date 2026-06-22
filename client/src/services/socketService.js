import { io } from "socket.io-client";
import { auth } from "../firebase";

const SOCKET_URL = process.env.REACT_APP_SOCKET_URL || "http://localhost:5000";

const socket = io(SOCKET_URL, {
  autoConnect: false,
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  reconnectionAttempts: 10,
  transports: ["websocket", "polling"],
  credentials: true,
});

const connectSocket = async () => {
  const user = auth.currentUser;
  if (!user) {
    console.warn("Cannot connect socket: no authenticated user");
    return;
  }

  try {
    const idToken = await user.getIdToken();
    socket.auth = {
      idToken,
      email: user.email,
      deviceId: localStorage.getItem("deviceId") || undefined,
    };

    if (!socket.connected) {
      socket.connect();
    }
  } catch (err) {
    console.error("Failed to get ID token for socket:", err.message);
    socket.auth = { email: user.email };
    if (!socket.connected) {
      socket.connect();
    }
  }
};

socket.on("connect", () => {
  console.log("Socket Connected:", socket.id);
});

socket.on("disconnect", () => {
  console.log("Socket Disconnected");
});

socket.on("connect_error", (error) => {
  console.error("Connection Error:", error.message);
});

socket.on("device-registered", ({ deviceId }) => {
  localStorage.setItem("deviceId", deviceId);
});

export { connectSocket };
export default socket;