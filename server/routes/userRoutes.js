const express = require("express");
const router = express.Router();
const userController = require("../controllers/userController");
const { authenticateUser } = require("../middleware/authMiddleware");
const { loginRateLimiter, userPrivacyValidator, validateFieldsHook, generalApiLimiter } = require("../middleware/securityValidation");

// Unauthenticated Registration / Login Route with rigid frequency guards
router.post("/verify-login", loginRateLimiter, userController.verifyAndLoginUser);

// Hardened Authenticated Session Route Actions
router.use(authenticateUser);
router.use(generalApiLimiter);

router.get("/all", userController.getAllUsers);
router.post("/keys/register", userController.registerPublicKey);
router.get("/keys/recipient/:email", userController.getRecipientPublicKey);
router.put("/privacy/settings", userPrivacyValidator, validateFieldsHook, userController.updatePrivacySettings);
router.post("/privacy/block", userController.blockUser);
router.post("/privacy/report", userController.reportUser);
router.post("/session/revoke-device", userController.revokeDeviceSession);
router.post("/auth/logout", userController.logoutUser);
router.post("/auth/logout-all", userController.logoutAllDevices);

module.exports = router;
