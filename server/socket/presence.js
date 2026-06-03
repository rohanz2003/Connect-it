module.exports = (io, socket, users, userProfiles) => {
  socket.on("join", (data) => {
    // Handle both old string format and new object format
    let userId = typeof data === 'string' ? data : data?.email;
    const profilePic = typeof data === 'object' ? data?.profilePic : null;
    const displayName = typeof data === 'object' ? data?.displayName : null;
    
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

    // Initialize or update user profile info
    if (!userProfiles[userId]) userProfiles[userId] = {};
    
    let profileChanged = false;
    if (profilePic) {
      userProfiles[userId].profilePic = profilePic;
      profileChanged = true;
    }
    if (displayName) {
      userProfiles[userId].displayName = displayName;
      profileChanged = true;
    }

    console.log(`✅ ${userId} is online`);
    
    // Broadcast profile update if anything changed
    if (profileChanged) {
      io.emit("user-profile-update", {
        email: userId,
        profilePic: userProfiles[userId].profilePic,
        displayName: userProfiles[userId].displayName
      });
    }
    
    // Broadcast to all clients the updated online users list
    io.emit("online-users", Object.keys(users));
  });

  socket.on("update-profile", (data) => {
    const { email, displayName, profilePic, bio } = data;
    if (!email) return;

    const userId = email.toLowerCase().trim();
    if (!userProfiles[userId]) userProfiles[userId] = {};

    if (displayName) userProfiles[userId].displayName = displayName;
    if (profilePic) userProfiles[userId].profilePic = profilePic;
    if (bio !== undefined) userProfiles[userId].bio = bio;

    console.log(`👤 Profile updated for ${userId}: ${displayName}`);

    io.emit("user-profile-update", {
      email: userId,
      displayName: userProfiles[userId].displayName,
      profilePic: userProfiles[userId].profilePic,
      bio: userProfiles[userId].bio
    });
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