const express = require("express");
const router = express.Router();
const { getMessages, getRecentChats, clearChat, clearAllMessages } = require("../controllers/messageController");
const { authenticateUser } = require("../middleware/authenticateUser");
const { authorizeAdmin } = require("../middleware/authorizeRole");
const { auditMiddleware } = require("../middleware/auditLogger");

// Get messages between two users (requires auth)
router.get("/", authenticateUser, getMessages);

// Get recent chats for a user (requires auth)
router.get("/recent", authenticateUser, getRecentChats);

// Clear chat between two users (requires auth)
router.post("/clear", authenticateUser, auditMiddleware("CHAT_CLEARED"), clearChat);

// Clear ALL messages from the database (requires auth - dangerous)
// WARNING: This deletes all messages permanently. Use with caution.
router.delete("/clear-all", authenticateUser, authorizeAdmin, auditMiddleware("ALL_MESSAGES_CLEARED", "warning"), clearAllMessages);

module.exports = router;