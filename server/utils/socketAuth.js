const normalizeEmail = (email) => typeof email === "string" ? email.toLowerCase().trim() : "";

const socketToUser = new Map();

const registerSocket = (socketId, email) => {
  const normalized = normalizeEmail(email);
  if (normalized) socketToUser.set(socketId, normalized);
};

const unregisterSocket = (socketId) => {
  const email = socketToUser.get(socketId);
  socketToUser.delete(socketId);
  return email || null;
};

// Only connection-time registration after token verification establishes identity.
const getAuthenticatedEmail = (socket) => socketToUser.get(socket.id) || null;

const getRoomId = (user1, user2) => {
  return [normalizeEmail(user1), normalizeEmail(user2)].sort().join("_");
};

module.exports = {
  normalizeEmail,
  getAuthenticatedEmail,
  getRoomId,
  registerSocket,
  unregisterSocket,
};
