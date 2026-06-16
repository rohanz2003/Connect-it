const express = require("express");
const router = express.Router();
const { getMessages, getRecentChats, clearChat } = require("../controllers/messageController");
const { authenticateUser } = require("../middleware/authenticateUser");
const { auditMiddleware } = require("../middleware/auditLogger");

// Get messages between two users (requires auth)
router.get("/", authenticateUser, getMessages);

// Get recent chats for a user (requires auth)
router.get("/recent", authenticateUser, getRecentChats);

// Clear chat between two users (requires auth)
router.post("/clear", authenticateUser, auditMiddleware("CHAT_CLEARED"), clearChat);

module.exports = router;