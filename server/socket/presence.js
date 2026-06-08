const UserProfile = require("../models/UserProfile");

const HEARTBEAT_INTERVAL = 30000;
const OFFLINE_THRESHOLD = 70000;

module.exports = (io, socket, users, userProfiles) => {
  let heartbeatTimer = null;

  const startHeartbeat = () => {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    heartbeatTimer = setInterval(async () => {
      const userId = getUserIdFromSocket(socket, users);
      if (userId) {
        try {
          await UserProfile.findOneAndUpdate(
            { email: userId },
            { $set: { lastActivity: new Date(), isOnline: true } }
          );
        } catch (err) {
          console.error("Heartbeat update error:", err.message);
        }
      }
    }, HEARTBEAT_INTERVAL);
  };

  const stopHeartbeat = () => {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
  };

  const getUserIdFromSocket = (socket, users) => {
    for (const userId in users) {
      if (users[userId].has(socket.id)) {
        return userId;
      }
    }
    return null;
  };

  socket.on("join", async (data) => {
    let userId = typeof data === 'string' ? data : data?.email;
    const profilePic = typeof data === 'object' ? data?.profilePic : null;
    const displayName = typeof data === 'object' ? data?.displayName : null;
    
    if (!userId || userId.trim() === "") {
      console.log("Invalid userId received");
      return;
    }
    userId = userId.trim().toLowerCase();

    if (!users[userId]) {
      users[userId] = new Set();
    }
    users[userId].add(socket.id);
    
    socket.join(userId);

    try {
      const dbProfile = await UserProfile.findOne({ email: userId });
      if (dbProfile) {
        userProfiles[userId] = {
          displayName: dbProfile.displayName,
          profilePic: dbProfile.profilePic,
          bio: dbProfile.bio
        };
        socket.emit("user-profile-update", {
          email: userId,
          displayName: dbProfile.displayName,
          profilePic: dbProfile.profilePic,
          bio: dbProfile.bio
        });
      } else if (displayName || profilePic) {
        await UserProfile.create({
          email: userId,
          displayName: displayName || userId.split('@')[0],
          profilePic: profilePic
        });
      }
    } catch (err) {
      console.error("Error syncing profile from DB:", err.message);
    }

    try {
      await UserProfile.findOneAndUpdate(
        { email: userId },
        { 
          $set: { 
            isOnline: true,
            lastActivity: new Date()
          } 
        },
        { upsert: true }
      );
    } catch (err) {
      console.error("Error updating online status:", err.message);
    }

    console.log(`${userId} is online`);
    
    io.emit("online-users", Object.keys(users));
    io.emit("user-status-change", { userId, isOnline: true });

    try {
      const allProfiles = await UserProfile.find({}, 'email displayName profilePic bio lastSeen isOnline');
      const profileMap = {};
      allProfiles.forEach(p => {
        profileMap[p.email.toLowerCase()] = {
          displayName: p.displayName,
          profilePic: p.profilePic,
          bio: p.bio,
          lastSeen: p.lastSeen,
          isOnline: p.isOnline
        };
      });
      socket.emit("all-user-metadata", profileMap);
    } catch (err) {
      console.error("Error fetching all profiles:", err.message);
    }

    startHeartbeat();
  });

  socket.on("update-profile", async (data) => {
    const { email, displayName, profilePic, bio } = data;
    if (!email) return;

    const userId = email.toLowerCase().trim();
    
    try {
      const updatedProfile = await UserProfile.findOneAndUpdate(
        { email: userId },
        { 
          $set: { 
            displayName: displayName || userId.split('@')[0], 
            profilePic: profilePic, 
            bio: bio 
          } 
        },
        { upsert: true, new: true }
      );

      userProfiles[userId] = {
        displayName: updatedProfile.displayName,
        profilePic: updatedProfile.profilePic,
        bio: updatedProfile.bio
      };

      console.log(`Profile updated and saved to DB for ${userId}`);

      io.emit("user-profile-update", {
        email: userId,
        displayName: updatedProfile.displayName,
        profilePic: updatedProfile.profilePic,
        bio: updatedProfile.bio
      });
    } catch (err) {
      console.error("Error saving profile to DB:", err.message);
    }
  });

  const handleOffline = async (userId) => {
    try {
      const now = new Date();
      await UserProfile.findOneAndUpdate(
        { email: userId },
        { 
          $set: { 
            isOnline: false,
            lastSeen: now,
            lastActivity: now
          } 
        }
      );
      io.emit("user-status-change", { userId, isOnline: false, lastSeen: now });
      io.emit("online-users", Object.keys(users));
      stopHeartbeat();
    } catch (err) {
      console.error("Error updating offline status:", err.message);
    }
  };

  socket.on("leave", async (data) => {
    const userIdRaw = typeof data === 'string' ? data : data?.email;
    if (!userIdRaw) return;

    const userId = userIdRaw.toLowerCase().trim();
    if (!users[userId]) return;

    users[userId].delete(socket.id);
    socket.leave(userId);

    if (users[userId].size === 0) {
      delete users[userId];
      console.log(`${userId} is offline (leave event)`);
      await handleOffline(userId);
    }
  });

  socket.on("disconnect", async () => {
    stopHeartbeat();
    for (const userId in users) {
      if (users[userId].has(socket.id)) {
        users[userId].delete(socket.id);
        if (users[userId].size === 0) {
          delete users[userId];
          console.log(`${userId} is offline (disconnect)`);
          await handleOffline(userId);
        }
        break;
      }
    }
  });
};