const express = require("express");
const router = express.Router();
const firebaseAuth = require("../middleware/firebaseAuth");
const { getMessages, getRecentChats, getAcceptedChats, clearChat } = require("../controllers/messageController");

router.get("/", firebaseAuth, getMessages);
router.get("/recent", firebaseAuth, getRecentChats);
router.get("/accepted", firebaseAuth, getAcceptedChats);
router.post("/clear", firebaseAuth, clearChat);

module.exports = router;