const normalizeEmail = (email) => (email || "").toLowerCase().trim();

const getAuthenticatedEmail = (socket, users) => {
  const match = Object.keys(users).find((key) => {
    const entry = users[key];
    return entry instanceof Set ? entry.has(socket.id) : entry === socket.id;
  });
  return match ? normalizeEmail(match) : null;
};

const getRoomId = (user1, user2) => {
  return [normalizeEmail(user1), normalizeEmail(user2)].sort().join("_");
};

module.exports = {
  normalizeEmail,
  getAuthenticatedEmail,
  getRoomId,
};
