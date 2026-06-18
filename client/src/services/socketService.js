import { io } from "socket.io-client";
import { getAuthToken } from "./authToken";
import { getAccessToken } from "./refreshTokenService";
import { getDeviceInfo } from "../utils/deviceDetector";

const SOCKET_URL = process.env.REACT_APP_SOCKET_URL || "http://localhost:5000";

const socket = io(SOCKET_URL, {
  autoConnect: false,
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  reconnectionAttempts: Infinity,
  transports: ["websocket", "polling"],
});

let connectResolve = null;
let connectReject = null;

const freshToken = async () => {
  let t = getAccessToken();
  if (!t) t = await getAuthToken(true);
  return t;
};

socket.on("connect", () => {
  console.log("✅ Socket Connected:", socket.id);
  if (connectResolve) {
    connectResolve(socket);
    connectResolve = null;
    connectReject = null;
  }
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
    const newToken = await freshToken();
    if (newToken) {
      socket.auth = { ...socket.auth, token: newToken };
    }
  }
  if (connectReject) {
    connectReject(error);
    connectResolve = null;
    connectReject = null;
  }
});

export const connectSocket = async () => {
  if (socket.connected) return socket;
  if (connectResolve) {
    return new Promise((resolve, reject) => {
      const origReject = connectReject;
      connectReject = (err) => { origReject && origReject(err); reject(err); };
      const origResolve = connectResolve;
      connectResolve = (s) => { origResolve && origResolve(s); resolve(s); };
    });
  }
  if (!socket.auth?.token) {
    const token = await freshToken();
    socket.auth = { token, deviceInfo: getDeviceInfo() };
  }
  socket.connect();
  return new Promise((resolve, reject) => {
    connectResolve = resolve;
    connectReject = reject;
    setTimeout(() => {
      if (connectReject) {
        connectReject(new Error("Socket connection timed out"));
        connectResolve = null;
        connectReject = null;
      }
    }, 10000);
  });
};

export const disconnectSocket = () => {
  connectResolve = null;
  connectReject = null;
  socket.removeAllListeners();
  socket.disconnect();
};

export default socket;