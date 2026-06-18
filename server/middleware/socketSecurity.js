const { verifyUserToken } = require("./auth");
const { normalizeEmail } = require("../utils/socketAuth");

const connectionAttempts = new Map();
const eventAttempts = new Map();

const CONNECTION_WINDOW_MS = 60 * 1000;
const MAX_CONNECTIONS_PER_WINDOW = 20;
const EVENT_WINDOW_MS = 10 * 1000;
const MAX_EVENTS_PER_WINDOW = 120;

const bumpCounter = (store, key, windowMs, max) => {
  const now = Date.now();
  const record = store.get(key) || { count: 0, resetAt: now + windowMs };
  if (now > record.resetAt) {
    record.count = 0;
    record.resetAt = now + windowMs;
  }
  record.count += 1;
  store.set(key, record);
  return record.count <= max;
};

const isEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || ""));
const isSafeString = (value, max = 2000) =>
  typeof value === "string" &&
  value.length <= max &&
  !/<\s*script|javascript:|on\w+\s*=/i.test(value);

const isEncryptedPayload = (value) =>
  value &&
  typeof value === "object" &&
  value.version === "v1" &&
  value.algorithm === "ECDH-AES-256-GCM" &&
  typeof value.iv === "string" &&
  typeof value.ciphertext === "string" &&
  value.senderPublicKey &&
  value.recipientPublicKey;

const validators = {
  join: (payload, socket) => {
    const email = typeof payload === "string" ? payload : payload?.email;
    return normalizeEmail(email) === socket.user.email;
  },
  leave: (payload, socket) => {
    const email = typeof payload === "string" ? payload : payload?.email;
    return normalizeEmail(email) === socket.user.email;
  },
  heartbeat: (payload, socket) => normalizeEmail(payload) === socket.user.email,
  "join-room": (payload, socket) =>
    normalizeEmail(payload?.user1) === socket.user.email && isEmail(payload?.user2),
  typing: (payload, socket) =>
    normalizeEmail(payload?.from) === socket.user.email && isEmail(payload?.to),
  "stop-typing": (payload, socket) =>
    normalizeEmail(payload?.from) === socket.user.email && isEmail(payload?.to),
  "send-message": (payload, socket) =>
    normalizeEmail(payload?.sender) === socket.user.email &&
    isEmail(payload?.receiver) &&
    isEncryptedPayload(payload?.text) &&
    ["text", "media"].includes(payload?.type || "text"),
  "delete-message": (payload, socket) =>
    normalizeEmail(payload?.sender) === socket.user.email &&
    isEmail(payload?.receiver) &&
    isSafeString(String(payload?.messageId || ""), 80),
  "mark-as-read": (payload, socket) =>
    normalizeEmail(payload?.user1) === socket.user.email && isEmail(payload?.user2),
  "seen-message": (payload, socket) =>
    normalizeEmail(payload?.receiver) === socket.user.email && isEmail(payload?.sender),
  "clear-chat": (payload, socket) =>
    normalizeEmail(payload?.user1) === socket.user.email && isEmail(payload?.user2),
  "update-profile": (payload, socket) =>
    normalizeEmail(payload?.email) === socket.user.email &&
    (payload?.displayName === undefined || isSafeString(payload.displayName, 80)) &&
    (payload?.bio === undefined || isSafeString(payload.bio, 500)),
  "remove-profile-pic": (payload, socket) => normalizeEmail(payload?.email) === socket.user.email,
  "call-user": (payload) => isEmail(payload?.userToCall) && ["audio", "video"].includes(payload?.type),
  "answer-call": (payload) => isEmail(payload?.to),
  "reject-call": (payload) => isEmail(payload?.to),
  "end-call": (payload) => isEmail(payload?.to),
  "ice-candidate": (payload) => isEmail(payload?.to),
};

const socketAuthMiddleware = async (socket, next) => {
  try {
    const ip = socket.handshake.address || "unknown";
    if (!bumpCounter(connectionAttempts, ip, CONNECTION_WINDOW_MS, MAX_CONNECTIONS_PER_WINDOW)) {
      return next(new Error("Connection rate limit exceeded"));
    }

    const token = socket.handshake.auth?.token;
    const user = await verifyUserToken(token);
    const requestedEmail = normalizeEmail(socket.handshake.auth?.email);

    if (requestedEmail && requestedEmail !== user.email) {
      return next(new Error("Socket identity mismatch"));
    }

    socket.user = user;
    next();
  } catch (err) {
    next(new Error("Unauthorized socket"));
  }
};

const installSocketEventSecurity = (socket) => {
  socket.use((packet, next) => {
    const [eventName, payload] = packet;
    const key = `${socket.user?.email || socket.id}:${eventName}`;

    if (!bumpCounter(eventAttempts, key, EVENT_WINDOW_MS, MAX_EVENTS_PER_WINDOW)) {
      return next(new Error("Socket event rate limit exceeded"));
    }

    const validator = validators[eventName];
    if (!validator) {
      return next(new Error("Unsupported socket event"));
    }

    if (!validator(payload, socket)) {
      return next(new Error(`Invalid ${eventName} payload`));
    }

    next();
  });
};

module.exports = {
  installSocketEventSecurity,
  isEncryptedPayload,
  socketAuthMiddleware,
};
