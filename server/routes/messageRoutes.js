const express = require("express");
const router = express.Router();
const { getMessages, getRecentChats } = require("../controllers/messageController");

router.get("/", getMessages);
router.get("/recent", getRecentChats);

module.exports = router;