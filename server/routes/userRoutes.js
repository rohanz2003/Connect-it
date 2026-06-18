const express = require("express");
const router = express.Router();
const { createOrUpdateUser, updateAvatar, updateProfile, getProfile, getProfiles, getLastSeen, heartbeat, deleteAccount } = require("../controllers/userController");
const { authenticateUser, optionalAuth } = require("../middleware/authenticateUser");
const { authorizeRole } = require("../middleware/authorizeRole");
const { validateUser, validateEmail, handleValidationErrors } = require("../middleware/validateRequest");
const { auditMiddleware } = require("../middleware/auditLogger");

// Health check
router.get("/", (req, res) => {
  res.send("Users route working");
});

// Create or update user (upsert) - requires auth
router.post("/", authenticateUser, validateUser, createOrUpdateUser);

// Heartbeat - update lastSeen (requires auth)
router.post("/heartbeat", authenticateUser, heartbeat);

// Update user avatar/profile picture (requires auth)
router.put("/avatar", authenticateUser, auditMiddleware("AVATAR_UPDATED"), updateAvatar);

// Update full profile (displayName, bio, avatarUrl) (requires auth)
router.put("/profile", authenticateUser, validateUser, auditMiddleware("PROFILE_UPDATED"), updateProfile);

// Get single user profile (public - minimal auth)
router.get("/profile", optionalAuth, getProfile);

// Get multiple user profiles by emails (optional auth - allows public profile lookups)
router.get("/profiles", optionalAuth, getProfiles);

// Delete user account and all associated data (requires auth)
router.delete("/delete-account", authenticateUser, auditMiddleware("ACCOUNT_DELETED", "warning"), deleteAccount);

// Get last seen for a user by email (optional auth - allows public lookups)
router.get("/:id/lastseen", optionalAuth, validateEmail, getLastSeen);

module.exports = router;
