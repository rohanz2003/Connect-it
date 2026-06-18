const express = require("express");
const router = express.Router();
const { sendFeedback } = require("../controllers/feedbackController");
const { feedbackLimiter } = require("../middleware/security");

router.post("/send", feedbackLimiter, sendFeedback);

module.exports = router;
