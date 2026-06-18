const express = require("express");
const router = express.Router();
const messageController = require("../controllers/messageController");
const { authenticateUser } = require("../middleware/authMiddleware");
const { messageRateLimiter, messageInputValidator, validateFieldsHook, enforceFileUploadSecurity, generalApiLimiter } = require("../middleware/securityValidation");

// Apply authoritative authentication guards onto every single messaging route context
router.use(authenticateUser);
router.use(generalApiLimiter);

router.post("/send", messageRateLimiter, messageInputValidator, validateFieldsHook, enforceFileUploadSecurity, messageController.sendMessage);
router.get("/history/:roomId", messageController.getMessages);
router.delete("/node/:messageId", messageController.deleteMessage);
router.delete("/thread/:roomId", messageController.deleteChatHistory);
router.get("/backup/export", messageController.exportEncryptedBackup);

module.exports = router;
