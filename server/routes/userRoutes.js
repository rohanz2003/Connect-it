const express = require("express");
const router = express.Router();
const { createOrUpdateUser, updateAvatar, updateProfile, getProfile, getProfiles, getLastSeen, heartbeat } = require("../controllers/userController");

// Health check
router.get("/", (req, res) => {
  res.send("Users route working");
});

// Create or update user (upsert)
router.post("/", createOrUpdateUser);

// Heartbeat - update lastSeen
router.post("/heartbeat", heartbeat);

// Update user avatar/profile picture
router.put("/avatar", updateAvatar);

// Update full profile (displayName, bio, avatarUrl)
router.put("/profile", updateProfile);

// Get single user profile
router.get("/profile", getProfile);

// Get multiple user profiles by emails
router.get("/profiles", getProfiles);

// Get last seen for a user by email
router.get("/:id/lastseen", getLastSeen);

module.exports = router;
