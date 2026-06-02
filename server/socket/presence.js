module.exports = (io, socket, users, userProfiles) => {
  socket.on("join", (data) => {
    // Handle both old string format and new object format
    let userId = typeof data === 'string' ? data : data?.email;
    const profilePic = typeof data === 'object' ? data?.profilePic : null;
    
    if (!userId || userId.trim() === "") {
      console.log("❌ Invalid userId received");
      return;
    }
    userId = userId.trim().toLowerCase();

    if (!users[userId]) {
      users[userId] = new Set();
    }
    users[userId].add(socket.id);
    
    // Join a personal room named after the email to handle multiple tabs/reconnects
    socket.join(userId);

    // Store profile picture if provided
    if (profilePic) {
      userProfiles[userId] = profilePic;
      console.log(`👤 ${userId} profile picture updated`);
    }

    console.log(`✅ ${userId} is online`);
    console.log(`📊 Current online users: ${Object.keys(users).join(", ")}`);
    
    // Broadcast profile picture update to all clients
    if (profilePic) {
      io.emit("user-profile-update", {
        email: userId,
        profilePic: profilePic
      });
    }
    
    // Broadcast to all clients the updated online users list
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
      console.log(`❌ ${userId} is offline (leave event)`);
    } else {
      console.log(`🔁 ${userId} left one session, remaining connections: ${Array.from(users[userId]).join(", ")}`);
    }

    io.emit("online-users", Object.keys(users));
  });
};