const Message = require("../models/Message");

const getRoomId = (user1, user2) => {
  return [user1.toLowerCase(), user2.toLowerCase()].sort().join("_");
};

// Track which users are in which rooms
const roomUsers = {};
// Track unread messages
const unreadMessages = {};

module.exports = (io, socket, users) => {

  // JOIN ROOM
  socket.on("join-room", ({ user1, user2 }) => {
    // Find the user whose Set of socket IDs contains this socket.id
    const authenticatedUser = Object.keys(users).find(key => 
      users[key] instanceof Set ? users[key].has(socket.id) : users[key] === socket.id
    );
    
    if (!authenticatedUser || authenticatedUser.toLowerCase() !== user1.toLowerCase()) {
      console.warn(`⚠️ Unauthenticated attempt to join room by socket ${socket.id}`);
      return;
    }

    const roomId = getRoomId(user1, user2);

    // Leave previous rooms
    for (const room of socket.rooms) {
      if (room !== socket.id) {
        socket.leave(room);
      }
    }

    // Join new room
    socket.join(roomId);
    
    // Track who is in this room
    if (!roomUsers[roomId]) {
      roomUsers[roomId] = [];
    }
    if (!roomUsers[roomId].includes(user1)) {
      roomUsers[roomId].push(user1);
    }
    
    console.log(`✅ ${user1} joined room: ${roomId}`);
    console.log(`Room users:`, roomUsers[roomId]);
    
    // Mark messages as read when user enters the room
    const key = `${user2}_${user1}`; // unread from user2 to user1
    if (unreadMessages[key]) {
      unreadMessages[key] = 0;
      console.log(`✓✓ Marked messages as read for ${user1} from ${user2}`);
      
      // Only notify the user who marked them as read
      // Use the personal room (email) instead of the users object Set
      const target = user1.toLowerCase().trim();
      if (users[target]) {
        io.to(target).emit("unread-update", unreadMessages);
      }
    }
  });

  // SEND MESSAGE
  socket.on("send-message", async (data, callback) => {
    const { sender, receiver, text, type, mediaType, tempId, timestamp } = data;
    const roomId = getRoomId(sender, receiver);

    try {
      let message = { 
        sender, 
        receiver, 
        text,
        type: type || 'text',
        mediaType: mediaType || null,
        tempId: tempId,
        timestamp: timestamp || new Date(),
        seen: false
      };
      
      // Try to save to DB
      try {
        message = await Message.create({
          sender,
          receiver,
          text,
          type: type || 'text',
          mediaType: mediaType || null,
          tempId: tempId,
          timestamp: timestamp || new Date(),
          seen: false
        });
      } catch (dbErr) {
        console.log("📝 Message not saved to DB (MongoDB offline), broadcasting in real-time only");
        message._id = Date.now().toString();
      }

      // Track unread message
      const unreadKey = `${sender}_${receiver}`;
      unreadMessages[unreadKey] = (unreadMessages[unreadKey] || 0) + 1;
      console.log(`📨 Unread from ${sender} to ${receiver}: ${unreadMessages[unreadKey]}`);

      // Send to all users in the room (this includes both sender and receiver)
      io.to(roomId).emit("receive-message", message);
      
      // Send unread count update to all clients
      // Better: Only send to the receiver
      const target = receiver.toLowerCase().trim();
      if (users[target]) {
        io.to(target).emit("unread-update", unreadMessages);
      }
      
      // Send acknowledgment back to sender
      if (callback) callback(true);
      
      console.log(`✅ Message broadcasted to room ${roomId}`);
      console.log(`   From: ${sender}, To: ${receiver}, Type: ${type}`);
      
    } catch (err) {
      console.error("❌ Error sending message:", err.message);
      socket.emit("error", { message: "Failed to send message" });
      if (callback) callback(false);
    }
  });

  // DELETE MESSAGE
  socket.on("delete-message", async ({ messageId, sender, receiver }) => {
    try {
      // Find and delete the message from DB
      await Message.deleteOne({
        $or: [
          { _id: messageId },
          { tempId: messageId }
        ]
      });

      const roomId = getRoomId(sender, receiver);
      io.to(roomId).emit("message-deleted", { messageId, sender, receiver });
    } catch (err) {
      console.error("❌ Error deleting message:", err.message);
    }
  });

  // MARK MESSAGES AS READ
  socket.on("mark-as-read", ({ user1, user2 }) => {
    const unreadKey = `${user2}_${user1}`;
    if (unreadMessages[unreadKey]) {
      unreadMessages[unreadKey] = 0;
      console.log(`✓✓ Marked messages as read for ${user1} from ${user2}`);
      
      const target = user1.toLowerCase().trim();
      if (users[target]) {
        io.to(target).emit("unread-update", unreadMessages);
      }
    }
  });

  // SEEN MESSAGE                                                                                                                                                                                                                                                                                                                                                           
  socket.on("seen-message", async ({ sender, receiver }) => {
    try {
      await Message.updateMany(
        { sender, receiver, seen: false },
        { seen: true }
      );

      const roomId = getRoomId(sender, receiver);
      io.to(roomId).emit("message-seen", { sender, receiver });
    } catch (err) {
      console.log("Could not mark as seen:", err.message);
    }
  });

  // CLEAR CHAT (Delete messages from database)
  socket.on("clear-chat", async ({ user1, user2 }, callback) => {
    try {
      // Delete all messages between these two users
      const result = await Message.deleteMany({
        $or: [
          { sender: user1, receiver: user2 },
          { sender: user2, receiver: user1 }
        ]
      });
      
      console.log(`🗑️ Deleted ${result.deletedCount} messages between ${user1} and ${user2}`);
      io.emit("chat-cleared", { user1, user2 });
      
      if (callback) callback(true);
    } catch (err) {
      console.error("❌ Error clearing chat:", err.message);
      socket.emit("error", { message: "Failed to clear chat" });
      if (callback) callback(false);
    }
  });

  // Clean up on disconnect
  socket.on("disconnect", () => {
    for (let roomId in roomUsers) {
      roomUsers[roomId] = roomUsers[roomId].filter(user => {
        const userEntry = users[user.toLowerCase().trim()];
        return userEntry instanceof Set ? !userEntry.has(socket.id) : userEntry !== socket.id;
      });
      if (roomUsers[roomId].length === 0) {
        delete roomUsers[roomId];
      }
    }
  });
};