const express = require("express");
const router = express.Router();
const { getMessages, getRecentChats, clearChat } = require("../controllers/messageController");
const { requireAuth } = require("../middleware/auth");
const { messageLimiter } = require("../middleware/security");
const {
  clearChatRules,
  messageQueryRules,
  recentChatRules,
} = require("../middleware/validators");

router.get("/", requireAuth, messageLimiter, messageQueryRules, getMessages);
router.get("/recent", requireAuth, messageLimiter, recentChatRules, getRecentChats);
router.post("/clear", requireAuth, messageLimiter, clearChatRules, clearChat);

module.exports = router;
