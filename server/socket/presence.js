const UserProfile = require("../models/UserProfile");

module.exports = (io, socket, users, userProfiles) => {
  socket.on("join", async (data) => {
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
    
    // Join a personal room named after the email
    socket.join(userId);

    // Fetch profile from DB on join to sync
    try {
      const dbProfile = await UserProfile.findOne({ email: userId });
      if (dbProfile) {
        userProfiles[userId] = {
          displayName: dbProfile.displayName,
          profilePic: dbProfile.profilePic,
          bio: dbProfile.bio
        };
        // Send existing profile info back to the user
        socket.emit("user-profile-update", {
          email: userId,
          displayName: dbProfile.displayName,
          profilePic: dbProfile.profilePic,
          bio: dbProfile.bio
        });
      } else if (displayName || profilePic) {
        // Create initial profile if it doesn't exist
        await UserProfile.create({
          email: userId,
          displayName: displayName || userId.split('@')[0],
          profilePic: profilePic
        });
      }
    } catch (err) {
      console.error("Error syncing profile from DB:", err.message);
    }

    // Update status in DB
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

    console.log(`✅ ${userId} is online`);
    
    // Broadcast to all clients the updated online users list
    io.emit("online-users", Object.keys(users));
    io.emit("user-status-change", { userId, isOnline: true });

    // Send all existing profile metadata to the newly joined user
    try {
      const allProfiles = await UserProfile.find({}, 'email displayName profilePic bio');
      const profileMap = {};
      allProfiles.forEach(p => {
        profileMap[p.email.toLowerCase()] = {
          displayName: p.displayName,
          profilePic: p.profilePic,
          bio: p.bio
        };
      });
      socket.emit("all-user-metadata", profileMap);
    } catch (err) {
      console.error("Error fetching all profiles:", err.message);
    }
  });

  socket.on("update-profile", async (data) => {
    const { email, displayName, profilePic, bio } = data;
    if (!email) return;

    const userId = email.toLowerCase().trim();
    
    try {
      // Persist to MongoDB Atlas
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

      // Update in-memory cache
      userProfiles[userId] = {
        displayName: updatedProfile.displayName,
        profilePic: updatedProfile.profilePic,
        bio: updatedProfile.bio
      };

      console.log(`👤 Profile updated and saved to DB for ${userId}`);

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
      console.log(`❌ ${userId} is offline (leave event)`);
      await handleOffline(userId);
    } else {
      console.log(`🔁 ${userId} left one session, remaining connections: ${Array.from(users[userId]).join(", ")}`);
    }
  });

  socket.on("disconnect", async () => {
    for (const userId in users) {
      if (users[userId].has(socket.id)) {
        users[userId].delete(socket.id);
        if (users[userId].size === 0) {
          delete users[userId];
          console.log(`❌ ${userId} is offline (disconnect)`);
          await handleOffline(userId);
        }
        break;
      }
    }
  });
};