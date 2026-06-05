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

    // Fetch profile from DB on join to sync (Non-blocking)
    UserProfile.findOne({ email: userId }).then(dbProfile => {
      if (dbProfile) {
        userProfiles[userId] = {
          displayName: dbProfile.displayName,
          profilePic: dbProfile.profilePic,
          bio: dbProfile.bio
        };
        io.emit("user-profile-update", {
          email: userId,
          displayName: dbProfile.displayName,
          profilePic: dbProfile.profilePic,
          bio: dbProfile.bio
        });
      } else if (displayName || profilePic) {
        const newProfile = {
          email: userId,
          displayName: displayName || userId.split('@')[0],
          profilePic: profilePic
        };
        UserProfile.create(newProfile).catch(err => console.error(err));
        io.emit("user-profile-update", newProfile);
      }
    }).catch(err => console.error("Error fetching profile on join:", err.message));

    // Non-blocking update online status
    UserProfile.findOneAndUpdate(
      { email: userId },
      { 
        $set: { 
          isOnline: true,
          lastActivity: new Date()
        } 
      },
      { upsert: true }
    ).catch(err => console.error("Error updating online status:", err.message));

    console.log(`✅ ${userId} is online`);
    
    // Broadcast to all clients the updated online users list
    io.emit("online-users", Object.keys(users));
    io.emit("user-status-change", { userId, isOnline: true });
    
    // --- Automatic Delivery Update ---
    const deliverPendingMessages = async (targetUserId) => {
      try {
        const Message = require("../models/Message");
        const pendingMessages = await Message.find({ receiver: targetUserId, status: "sent" });
        if (pendingMessages.length > 0) {
          const now = new Date();
          await Message.updateMany(
            { receiver: targetUserId, status: "sent" },
            { $set: { status: "delivered", deliveredAt: now } }
          );

          // Notify the newly online user to update their local states
          socket.emit("bulk-delivered", { receiver: targetUserId });

          // Notify senders
          const senders = [...new Set(pendingMessages.map(m => m.sender))];
          senders.forEach(sender => {
            io.to(sender).emit("messageDelivered", { receiver: targetUserId, deliveredAt: now });
            io.to(sender).emit("message-delivered", { receiver: targetUserId, deliveredAt: now });
          });

          // Legacy/compatibility broadcast
          socket.broadcast.emit("user-came-online", { userId: targetUserId });
        }
      } catch (err) {
        console.error("Error auto-delivering messages:", err.message);
      }
    };

    deliverPendingMessages(userId);

    // Send all existing profile metadata to the newly joined user (Non-blocking)
    UserProfile.find({}, 'email displayName profilePic bio lastSeen isOnline').then(allProfiles => {
      const profileMap = {};
      allProfiles.forEach(p => {
        const emailKey = p.email.toLowerCase();
        profileMap[emailKey] = {
          displayName: p.displayName,
          profilePic: p.profilePic,
          bio: p.bio,
          lastSeen: p.lastSeen,
          isOnline: p.isOnline
        };
      });
      socket.emit("all-user-metadata", profileMap);
    }).catch(err => console.error("Error fetching all profiles:", err.message));
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

  const handleOffline = (userId) => {
    const now = new Date();
    UserProfile.findOneAndUpdate(
      { email: userId },
      { 
        $set: { 
          isOnline: false,
          lastSeen: now,
          lastActivity: now
        } 
      }
    ).catch(err => console.error("Error updating offline status:", err.message));
    
    io.emit("user-status-change", { userId, isOnline: false, lastSeen: now });
    io.emit("online-users", Object.keys(users));
  };

  socket.on("userOnline", async (data) => {
    let userId = typeof data === 'string' ? data : data?.email;
    if (!userId || userId.trim() === "") return;
    userId = userId.trim().toLowerCase();

    console.log(`📡 userOnline received for ${userId}`);

    if (!users[userId]) {
      users[userId] = new Set();
    }
    users[userId].add(socket.id);
    socket.join(userId);

    // Sync online status in database
    UserProfile.findOneAndUpdate(
      { email: userId },
      { $set: { isOnline: true, lastActivity: new Date() } },
      { upsert: true }
    ).catch(err => console.error("Error updating status on userOnline:", err.message));

    // Broadcast status change
    io.emit("online-users", Object.keys(users));
    io.emit("user-status-change", { userId, isOnline: true });

    // Update pending messages to delivered
    try {
      const Message = require("../models/Message");
      const pendingMessages = await Message.find({ receiver: userId, status: "sent" });
      if (pendingMessages.length > 0) {
        const now = new Date();
        await Message.updateMany(
          { receiver: userId, status: "sent" },
          { $set: { status: "delivered", deliveredAt: now } }
        );

        // Notify each sender
        const senders = [...new Set(pendingMessages.map(m => m.sender))];
        senders.forEach(sender => {
          io.to(sender).emit("messageDelivered", { receiver: userId, deliveredAt: now });
          io.to(sender).emit("message-delivered", { receiver: userId, deliveredAt: now });
        });
        
        socket.emit("bulk-delivered", { receiver: userId });
        socket.broadcast.emit("user-came-online", { userId });
      }
    } catch (err) {
      console.error("Error delivering pending messages for userOnline:", err.message);
    }
  });

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
      handleOffline(userId);
    } else {
      console.log(`🔁 ${userId} left one session, remaining connections: ${Array.from(users[userId]).join(", ")}`);
    }
  });

  socket.on("disconnect", () => {
    for (const userId in users) {
      if (users[userId].has(socket.id)) {
        users[userId].delete(socket.id);
        if (users[userId].size === 0) {
          delete users[userId];
          console.log(`❌ ${userId} is offline (disconnect)`);
          handleOffline(userId);
        }
        break;
      }
    }
  });
};