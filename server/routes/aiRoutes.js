const express = require("express");
const router = express.Router();
const {
  chat,
  getConversations,
  deleteConversation,
} = require("../controllers/aiController");

router.post("/chat", chat);
router.get("/conversations", getConversations);
router.delete("/conversations/:conversationId", deleteConversation);

module.exports = router;
