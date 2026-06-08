const { normalizeEmail, registerSocket } = require("../utils/socketAuth");
const User = require("../modules/User");
const { updateLastSeen } = require("../controllers/userController");

module.exports = (io, socket, users, userProfiles) => {
  socket.on("join", async (data) => {
    let userId = typeof data === 'string' ? data : data?.email;
    const profilePic = typeof data === 'object' ? data?.profilePic : null;
    const displayName = typeof data === 'object' ? data?.displayName : null;
    const bio = typeof data === 'object' ? data?.bio : null;
    
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

    // Update lastSeen on join (login)
    updateLastSeen(userId);

    // Always store profilePic in memory (even if null, to track removal)
    if (typeof data === 'object' && data?.hasOwnProperty('profilePic')) {
      userProfiles[userId] = profilePic;
    }

    // Build profile update payload
    const profilePayload = {
      email: userId,
      profilePic: profilePic || null,
      displayName: displayName || null,
      bio: bio || null,
    };

    // Only broadcast if we have profile data
    if (typeof data === 'object' && data !== null) {
      io.emit("user-profile-update", profilePayload);

      // Persist to database
      try {
        const update = {};
        if (data.hasOwnProperty('profilePic')) update.avatarUrl = profilePic;
        if (displayName !== undefined) update.displayName = displayName;
        if (bio !== undefined) update.bio = bio;
        if (Object.keys(update).length > 0) {
          await User.findOneAndUpdate(
            { email: userId },
            { $set: update },
            { upsert: true }
          );
        }
      } catch (err) {
        console.error("Error persisting profile on join:", err.message);
      }
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
      // Update lastSeen on logout
      updateLastSeen(userId);
      io.emit("last-seen", { userId, time: new Date().toISOString() });
    }

    io.emit("online-users", Object.keys(users));
  });

  socket.on("update-profile", async (data) => {
    const email = data?.email?.toLowerCase()?.trim();
    if (!email) return;

    const profilePayload = {
      email,
      profilePic: data.profilePic !== undefined ? data.profilePic : (userProfiles[email] || null),
      displayName: data.displayName || null,
      bio: data.bio || null,
    };

    // Update in-memory profiles
    if (data.profilePic !== undefined) {
      userProfiles[email] = data.profilePic;
    }

    // Persist to database
    try {
      const update = {};
      if (data.profilePic !== undefined) update.avatarUrl = data.profilePic;
      if (data.displayName !== undefined) update.displayName = data.displayName;
      if (data.bio !== undefined) update.bio = data.bio;
      if (Object.keys(update).length > 0) {
        await User.findOneAndUpdate(
          { email },
          { $set: update },
          { upsert: true }
        );
      }
    } catch (err) {
      console.error("Error persisting profile update:", err.message);
    }

    // Broadcast to all connected clients
    io.emit("user-profile-update", profilePayload);
  });

  socket.on("remove-profile-pic", async (data) => {
    const email = data?.email?.toLowerCase()?.trim();
    if (!email) return;

    userProfiles[email] = null;

    try {
      await User.findOneAndUpdate(
        { email },
        { $set: { avatarUrl: null } },
        { upsert: true }
      );
    } catch (err) {
      console.error("Error removing profile pic:", err.message);
    }

    io.emit("user-profile-update", {
      email,
      profilePic: null,
      displayName: null,
      bio: null,
    });
  });
};
