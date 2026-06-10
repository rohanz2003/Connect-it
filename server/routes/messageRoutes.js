const express = require("express");
const router = express.Router();
const { getMessages, getRecentChats, clearChat } = require("../controllers/messageController");

router.get("/", getMessages);
router.get("/recent", getRecentChats);
router.post("/clear", clearChat);

module.exports = router;