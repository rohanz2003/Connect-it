const express = require("express");
const router = express.Router();
const {
  createSession,
  logout,
  logoutAllDevices,
  refreshToken,
} = require("../controllers/authController");
const { requireAuth } = require("../middleware/auth");
const { loginLimiter } = require("../middleware/security");

router.post("/session", loginLimiter, requireAuth, createSession);
router.post("/refresh", requireAuth, refreshToken);
router.post("/logout", requireAuth, logout);
router.post("/logout-all", requireAuth, logoutAllDevices);

module.exports = router;
