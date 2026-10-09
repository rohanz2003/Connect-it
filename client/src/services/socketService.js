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

let session = null;
let authAttempt = 0;
let pendingConnection = null;

const settleConnection = (error) => {
  const pending = pendingConnection;
  pendingConnection = null;
  if (!pending) return;
  if (error) pending.reject(error);
  else pending.resolve();
};

const cancelledConnection = () => {
  const error = new Error("Socket connection cancelled");
  error.name = "AbortError";
  return error;
};

// disconnect() alone emits no event while connecting. Invalidate async auth work
// and settle its callers before stopping the transport/reconnection manager.
const disconnectSocket = (error = cancelledConnection()) => {
  session = null;
  authAttempt += 1;
  settleConnection(error);
  socket.disconnect();
  socket.sendBuffer.length = 0;
  socket.receiveBuffer.length = 0;
};

// Socket.IO invokes this for every handshake, including automatic reconnection.
// Never cache a token or fall back to a client-supplied email as identity.
socket.auth = async (callback) => {
  const currentSession = session;
  const attempt = ++authAttempt;
  const isCurrentAttempt = () => session === currentSession && attempt === authAttempt;
  if (!currentSession || auth.currentUser !== currentSession.user) {
    disconnectSocket();
    return;
  }

  try {
    const idToken = await currentSession.user.getIdToken(true);
    if (!isCurrentAttempt() || !socket.active) return;
    if (auth.currentUser !== currentSession.user) {
      disconnectSocket();
      return;
    }
    if (typeof idToken !== "string" || !idToken.trim()) {
      throw new Error("Cannot authenticate socket: missing ID token");
    }
    callback({ idToken, deviceId: localStorage.getItem("deviceId") || undefined });
  } catch (error) {
    if (!isCurrentAttempt()) return;
    console.error("Failed to authenticate socket:", error.message);
    disconnectSocket(error);
  }
};

const connectSocket = async () => {
  const user = auth.currentUser;
  if (!user) {
    disconnectSocket();
    return;
  }

  // Check identity before the connected shortcut: an existing transport may
  // belong to the previous account, even when Firebase is already signed in.
  if (session?.user !== user) {
    if (session || socket.active || socket.connected) disconnectSocket();
    session = { user };
  }
  if (socket.connected) return;
  if (pendingConnection) return pendingConnection.promise;

  let resolveConnection;
  let rejectConnection;
  const promise = new Promise((resolve, reject) => {
    resolveConnection = resolve;
    rejectConnection = reject;
  });
  pendingConnection = { promise, resolve: resolveConnection, reject: rejectConnection };
  try {
    // An active socket already has a handshake or automatic retry in progress.
    if (!socket.active) socket.connect();
  } catch (error) {
    console.error("Socket connection error:", error.message);
    disconnectSocket(error);
  }
  return promise;
};

socket.on("connect", () => {
  if (!session || auth.currentUser !== session.user) {
    disconnectSocket();
    return;
  }
  settleConnection();
  console.log("Socket Connected:", socket.id);
});

socket.on("disconnect", () => {
  authAttempt += 1;
  settleConnection(new Error("Socket disconnected before connection completed"));
  if (!socket.active) session = null;
  console.log("Socket Disconnected");
});

socket.on("connect_error", (error) => {
  authAttempt += 1;
  settleConnection(error);
  console.error("Connection Error:", error.message);
});

socket.io.on("reconnect_failed", () => {
  const error = new Error("Socket reconnection attempts exhausted");
  console.error(error.message);
  disconnectSocket(error);
});

socket.on("device-registered", ({ deviceId }) => {
  localStorage.setItem("deviceId", deviceId);
});

export { connectSocket, disconnectSocket };
export default socket;
