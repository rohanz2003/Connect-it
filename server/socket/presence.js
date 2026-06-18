const { normalizeEmail, registerSocket, getAuthenticatedEmail } = require("../utils/socketAuth");
const User = require("../modules/User");
const Message = require("../models/Message");
const ClearedChat = require("../models/ClearedChat");
const Device = require("../models/Device");
const { updateLastSeen } = require("../controllers/userController");
const { writeAuditLog } = require("../services/auditService");

const getVisibleOnlineUsers = async (users) => {
  const onlineIds = Object.keys(users);
  if (onlineIds.length === 0) return [];

  const hiddenUsers = await User.find({
    email: { $in: onlineIds },
    "privacy.hideOnlineStatus": true,
  })
    .select("email")
    .lean();
  const hidden = new Set(hiddenUsers.map((u) => u.email));
  return onlineIds.filter((id) => !hidden.has(id));
};

const broadcastOnlineUsers = async (io, users) => {
  try {
    io.emit("online-users", await getVisibleOnlineUsers(users));
  } catch (err) {
    console.warn("online user privacy filter failed:", err.message);
    io.emit("online-users", Object.keys(users));
  }
};

module.exports = (io, socket, users, userProfiles, socketToDevice, userDeviceSockets) => {
  socket.on("join", async (data) => {
    let userId = typeof data === "string" ? data : data?.email;
    const authUser = getAuthenticatedEmail(socket, users);
    const profilePic = typeof data === "object" ? data?.profilePic : null;
    const displayName = typeof data === "object" ? data?.displayName : null;
    const bio = typeof data === "object" ? data?.bio : null;

    userId = normalizeEmail(userId);
    if (!userId || !authUser || authUser !== userId) return;

    registerSocket(socket.id, userId);

    if (!users[userId]) {
      users[userId] = new Set();
    }
    users[userId].add(socket.id);
    socket.join(userId);

    const devId = socketToDevice[socket.id];
    if (devId) {
      if (!userDeviceSockets[userId]) {
        userDeviceSockets[userId] = {};
      }
      userDeviceSockets[userId][devId] = socket.id;

      try {
        await Device.findOneAndUpdate(
          { deviceId: devId, userId },
          { isActive: true, socketId: socket.id, lastSeen: new Date() },
          { upsert: true }
        );
      } catch (err) {
        console.error("Device active update error:", err.message);
      }
    }

    if (typeof data === "object" && data?.profilePic) {
      userProfiles[userId] = profilePic;
    }

    const profilePayload = { email: userId };
    if (typeof data === "object" && Object.prototype.hasOwnProperty.call(data, "profilePic")) {
      profilePayload.profilePic = profilePic || null;
    }
    if (displayName) profilePayload.displayName = displayName;
    if (bio) profilePayload.bio = bio;

    if (typeof data === "object" && data !== null) {
      io.emit("user-profile-update", profilePayload);

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

    await broadcastOnlineUsers(io, users);

    try {
      const clearedRecords = await ClearedChat.find({ user: userId }).lean();
      const clearedFilters = clearedRecords.map((r) => ({
        sender: r.partner,
        timestamp: { $lte: r.clearedAt },
      }));

      const query = {
        receiver: userId,
        status: "sent",
        deletedFor: { $ne: userId },
        deletedForEveryone: { $ne: true },
        $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
      };
      if (clearedFilters.length > 0) {
        query.$nor = clearedFilters;
      }

      const undelivered = await Message.find(query)
        .sort({ timestamp: 1 })
        .limit(100)
        .lean();

      if (undelivered.length > 0) {
        io.to(userId).emit("undelivered-messages", undelivered);

        const deliveredUpdate = { status: "delivered" };
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
      }
    } catch (err) {
      console.error("Failed to fetch undelivered messages:", err.message);
    }
  });

  socket.on("leave", async (data) => {
    const userId = normalizeEmail(typeof data === "string" ? data : data?.email);
    const authUser = getAuthenticatedEmail(socket, users);
    if (!userId || !authUser || authUser !== userId || !users[userId]) return;

    users[userId].delete(socket.id);
    socket.leave(userId);

    if (users[userId].size === 0) {
      delete users[userId];
      updateLastSeen(userId);
      io.emit("last-seen", { userId, time: new Date().toISOString() });
      writeAuditLog({ actor: userId, action: "logout", socket });
    }

    await broadcastOnlineUsers(io, users);
  });

  socket.on("update-profile", async (data) => {
    const email = normalizeEmail(data?.email);
    const authUser = getAuthenticatedEmail(socket, users);
    if (!email || !authUser || authUser !== email) return;

    if (Object.prototype.hasOwnProperty.call(data, "profilePic")) {
      userProfiles[email] = data.profilePic || null;
    }

    const profilePayload = { email };
    if (Object.prototype.hasOwnProperty.call(data, "profilePic")) {
      profilePayload.profilePic = data.profilePic || null;
    } else {
      profilePayload.profilePic = userProfiles[email] || null;
    }
    if (Object.prototype.hasOwnProperty.call(data, "displayName")) {
      profilePayload.displayName = data.displayName || null;
    }
    if (Object.prototype.hasOwnProperty.call(data, "bio")) {
      profilePayload.bio = data.bio || null;
    }

    try {
      const update = {};
      if (Object.prototype.hasOwnProperty.call(data, "profilePic")) {
        update.avatarUrl = data.profilePic || null;
      }
      if (Object.prototype.hasOwnProperty.call(data, "displayName")) {
        update.displayName = data.displayName || null;
      }
      if (Object.prototype.hasOwnProperty.call(data, "bio")) {
        update.bio = data.bio || null;
      }

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

    io.emit("user-profile-update", profilePayload);
    writeAuditLog({ actor: email, action: "account_changed", socket, metadata: { fields: Object.keys(profilePayload) } });
  });

  socket.on("remove-profile-pic", async (data) => {
    const email = normalizeEmail(data?.email);
    const authUser = getAuthenticatedEmail(socket, users);
    if (!email || !authUser || authUser !== email) return;

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
    });
    writeAuditLog({ actor: email, action: "account_changed", socket, metadata: { field: "avatarUrl" } });
  });
};
