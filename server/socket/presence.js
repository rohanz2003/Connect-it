const { normalizeEmail, registerSocket } = require("../utils/socketAuth");

module.exports = (io, socket, users, userProfiles) => {
  socket.on("join", (data) => {
    let userId = typeof data === 'string' ? data : data?.email;
    const profilePic = typeof data === 'object' ? data?.profilePic : null;
    
    if (!userId || userId.trim() === "") {
      return;
    }
    userId = userId.trim().toLowerCase();

    registerSocket(socket.id, userId);

    if (!users[userId]) {
      users[userId] = new Set();
    }
    users[userId].add(socket.id);
    
    socket.join(userId);

    if (profilePic) {
      userProfiles[userId] = profilePic;
    }

    if (profilePic) {
      io.emit("user-profile-update", {
        email: userId,
        profilePic: profilePic
      });
    }
    
    io.emit("online-users", Object.keys(users));
  });

  socket.on("leave", (data) => {
    const userIdRaw = typeof data === 'string' ? data : data?.email;
    if (!userIdRaw) return;

    const userId = userIdRaw.toLowerCase().trim();
    if (!users[userId]) return;

    users[userId].delete(socket.id);
    socket.leave(userId);

    if (users[userId].size === 0) {
      delete users[userId];
    }

    io.emit("online-users", Object.keys(users));
  });
};
