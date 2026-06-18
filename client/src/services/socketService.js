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

let connectInProgress = false;
let connectResolve = null;
let connectReject = null;

socket.on("connect", () => {
  console.log("✅ Socket Connected:", socket.id);
  if (connectResolve) {
    connectResolve(socket);
    connectResolve = null;
    connectReject = null;
    connectInProgress = false;
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
    socket.disconnect();
    let newToken = getAccessToken();
    if (!newToken) {
      newToken = await getAuthToken(true);
    }
    if (newToken) {
      socket.auth = { ...socket.auth, token: newToken };
      setTimeout(() => {
        socket.connect();
      }, 1000);
    }
  }
  if (connectReject && !socket.connected) {
    connectReject(error);
    connectResolve = null;
    connectReject = null;
    connectInProgress = false;
  }
});

export const connectSocket = async () => {
  if (socket.connected) return socket;
  if (connectInProgress) {
    return new Promise((resolve, reject) => {
      const check = setInterval(() => {
        if (socket.connected) {
          clearInterval(check);
          resolve(socket);
        }
      }, 100);
      setTimeout(() => {
        clearInterval(check);
        reject(new Error("Socket connection timeout"));
      }, 15000);
    });
  }
  connectInProgress = true;
  let token = getAccessToken();
  if (!token) {
    const firebaseToken = await getAuthToken(true);
    if (!firebaseToken) {
      connectInProgress = false;
      throw new Error("No auth token available for socket connection");
    }
    token = firebaseToken;
  }
  const deviceInfo = getDeviceInfo();
  socket.auth = { token, deviceInfo };
  socket.connect();
  return new Promise((resolve, reject) => {
    connectResolve = resolve;
    connectReject = reject;
    setTimeout(() => {
      if (connectInProgress) {
        connectInProgress = false;
        connectResolve = null;
        connectReject && connectReject(new Error("Socket connection timed out"));
        connectReject = null;
      }
    }, 15000);
  });
};

export const disconnectSocket = () => {
  connectInProgress = false;
  socket.removeAllListeners();
  socket.disconnect();
};

export default socket;