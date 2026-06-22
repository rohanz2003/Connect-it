const { normalizeEmail, registerSocket } = require("../utils/socketAuth");
const User = require("../modules/User");
const Message = require("../models/Message");
const ClearedChat = require("../models/ClearedChat");
const Device = require("../models/Device");
const { decryptMessageDoc } = require("../utils/messageCrypto");
const { updateLastSeen } = require("../controllers/userController");

module.exports = (io, socket, users, userProfiles, socketToDevice, userDeviceSockets) => {
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

    // lastSeen is NOT updated on join — only on disconnect/leave (WhatsApp behavior)

    // Register device in userDeviceSockets mapping
    const devId = socketToDevice[socket.id];
    if (devId) {
      if (!userDeviceSockets[userId]) {
        userDeviceSockets[userId] = {};
      }
      userDeviceSockets[userId][devId] = socket.id;

      // Mark device active in DB
      try {
        await Device.findOneAndUpdate(
          { deviceId: devId },
          { $set: { isActive: true, socketId: socket.id, lastSeen: new Date(), userId } },
          { upsert: true, setDefaultsOnInsert: true }
        );
      } catch (err) {
        console.error("Device active update error:", err.message);
      }
    }

    // Only store in memory if a truthy value was provided (never overwrite with null)
    if (typeof data === 'object' && data?.profilePic) {
      userProfiles[userId] = profilePic;
    }

    // Only broadcast fields that were actually provided
    const profilePayload = {
      email: userId,
    };
    if (typeof data === 'object' && data?.hasOwnProperty('profilePic')) {
      profilePayload.profilePic = profilePic || null;
    }
    if (displayName) profilePayload.displayName = displayName;
    if (bio) profilePayload.bio = bio;

    // Only broadcast if we have profile data
    if (typeof data === 'object' && data !== null) {
      io.emit("user-profile-update", profilePayload);

      // Persist to database (only truthy values to avoid overwriting)
      try {
        const update = {};
        if (profilePic) update.avatarUrl = profilePic;
        if (displayName) update.displayName = displayName;
        if (bio) update.bio = bio;
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

    // Fetch and send undelivered messages (status: sent) to this user
    (async () => {
      try {
        // Get cleared chats to exclude messages from cleared conversations
        const clearedRecords = await ClearedChat.find({ user: userId }).lean();
        const clearedFilters = clearedRecords.map((r) => ({
          sender: r.partner,
          timestamp: { $lte: r.clearedAt },
        }));

        const query = {
          receiver: userId,
          status: "sent",
        };
        if (clearedFilters.length > 0) {
          query.$nor = clearedFilters;
        }

        const undelivered = await Message.find(query)
          .sort({ timestamp: 1 })
          .limit(100)
          .lean();

        if (undelivered.length > 0) {
          const decrypted = undelivered.map(decryptMessageDoc);
          io.to(userId).emit("undelivered-messages", decrypted);

          const deliveredUpdate = {
            status: "delivered",
          };
          if (socketToDevice[socket.id]) {
            deliveredUpdate.$addToSet = { deliveredDevices: socketToDevice[socket.id] };
          }

          await Message.updateMany(
            { _id: { $in: undelivered.map((msg) => msg._id) }, status: "sent" },
            deliveredUpdate
          );

          undelivered.forEach((msg) => {
            io.to(msg.sender).emit("message-status-update", {
              messageId: msg._id,
              tempId: msg.tempId || null,
              status: "delivered",
              deliveredDevices: socketToDevice[socket.id] ? [socketToDevice[socket.id]] : [],
            });
          });
          console.log(`📨 ${undelivered.length} undelivered message(s) sent to ${userId}`);
        }
      } catch (err) {
        console.error("❌ Failed to fetch undelivered messages:", err.message);
      }
    })();

    // Fetch and send pending chat requests to this user
    (async () => {
      try {
        const ChatRequest = require("../models/ChatRequest");
        const pendingRequests = await ChatRequest.find({
          to: userId,
          status: "pending",
        }).sort({ createdAt: -1 }).lean();

        if (pendingRequests.length > 0) {
          pendingRequests.forEach((req) => {
            io.to(userId).emit("new-request", {
              _id: req._id,
              from: req.from,
              to: req.to,
              status: req.status,
              createdAt: req.createdAt,
            });
          });
          console.log(`📨 ${pendingRequests.length} pending request(s) sent to ${userId}`);
        }
      } catch (err) {
        console.error("❌ Failed to fetch pending requests:", err.message);
      }
    })();
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
    if (!email) {
      console.warn("update-profile: email is missing");
      return;
    }

    // Update in-memory profiles
    if (data.hasOwnProperty('profilePic')) {
      userProfiles[email] = data.profilePic || null;
    }

    // Prepare profile payload for broadcasting
    const profilePayload = {
      email,
    };
    
    // Always include profilePic if it's being updated
    if (data.hasOwnProperty('profilePic')) {
      profilePayload.profilePic = data.profilePic || null;
    } else {
      // If not updating profilePic, send current value
      profilePayload.profilePic = userProfiles[email] || null;
    }
    
    if (data.hasOwnProperty('displayName')) {
      profilePayload.displayName = data.displayName || null;
    }
    
    if (data.hasOwnProperty('bio')) {
      profilePayload.bio = data.bio || null;
    }

    // Persist to database
    try {
      const update = {};
      if (data.hasOwnProperty('profilePic')) {
        update.avatarUrl = data.profilePic || null;
      }
      if (data.hasOwnProperty('displayName')) {
        update.displayName = data.displayName || null;
      }
      if (data.hasOwnProperty('bio')) {
        update.bio = data.bio || null;
      }
      
      if (Object.keys(update).length > 0) {
        await User.findOneAndUpdate(
          { email },
          { $set: update },
          { upsert: true }
        );
        console.log(`✅ Profile updated in DB for ${email}:`, Object.keys(update));
      }
    } catch (err) {
      console.error("Error persisting profile update:", err.message);
    }

    // Broadcast to ALL connected clients (including all devices of the user)
    console.log(`📡 Broadcasting profile update for ${email} to all clients`);
    io.emit("user-profile-update", profilePayload);
  });

  socket.on("remove-profile-pic", async (data) => {
    const email = data?.email?.toLowerCase()?.trim();
    if (!email) {
      console.warn("remove-profile-pic: email is missing");
      return;
    }

    // Update in-memory profiles
    userProfiles[email] = null;

    // Persist to database
    try {
      await User.findOneAndUpdate(
        { email },
        { $set: { avatarUrl: null } },
        { upsert: true }
      );
      console.log(`✅ Profile picture removed from DB for ${email}`);
    } catch (err) {
      console.error("Error removing profile pic:", err.message);
    }

    // Broadcast to ALL connected clients (including all devices of the user)
    console.log(`📡 Broadcasting profile pic removal for ${email} to all clients`);
    io.emit("user-profile-update", {
      email,
      profilePic: null,
    });
  });
};
