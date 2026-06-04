const express = require("express");
const router = express.Router();
const { getMessages, getRecentChats, archiveChat, unarchiveChat, clearAllChats } = require("../controllers/messageController");

router.get("/", getMessages);
router.get("/recent", getRecentChats);
router.post("/archive", archiveChat);
router.post("/unarchive", unarchiveChat);
router.post("/clear-all", clearAllChats);

module.exports = router;