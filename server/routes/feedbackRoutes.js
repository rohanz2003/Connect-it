const express = require("express");
const router = express.Router();
const { sendFeedback, respondToFeedback, deleteFeedback } = require("../controllers/feedbackController");
const adminAuthMiddleware = require("../middleware/adminAuthMiddleware");

router.post("/send", sendFeedback);
router.put("/respond", adminAuthMiddleware, respondToFeedback);
router.delete("/:id", adminAuthMiddleware, deleteFeedback);

module.exports = router;