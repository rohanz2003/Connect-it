const express = require("express");
const router = express.Router();
const { sendFeedback } = require("../controllers/feedbackController");

// Route to send feedback
router.post("/send", sendFeedback);

module.exports = router;
