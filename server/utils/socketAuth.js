const normalizeEmail = (email) => (email || "").toLowerCase().trim();

const socketToUser = new Map();

const registerSocket = (socketId, email) => {
  socketToUser.set(socketId, normalizeEmail(email));
};

const unregisterSocket = (socketId) => {
  const email = socketToUser.get(socketId);
  socketToUser.delete(socketId);
  return email || null;
};

const getAuthenticatedEmail = (socket, users) => {
  if (socket.user?.email) {
    return normalizeEmail(socket.user.email);
  }

  const cached = socketToUser.get(socket.id);
  if (cached) return cached;

  const match = Object.keys(users).find((key) => {
    const entry = users[key];
    return entry instanceof Set ? entry.has(socket.id) : entry === socket.id;
  });
  if (match) {
    const normalized = normalizeEmail(match);
    socketToUser.set(socket.id, normalized);
    return normalized;
  }
  return null;
};

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
