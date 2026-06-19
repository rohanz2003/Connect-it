const express = require("express");
const router = express.Router();
const { getMessages, getRecentChats, getAcceptedChats, clearChat } = require("../controllers/messageController");

router.get("/", getMessages);
router.get("/recent", getRecentChats);
router.get("/accepted", getAcceptedChats);
router.post("/clear", clearChat);

module.exports = router;