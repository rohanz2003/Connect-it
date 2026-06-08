const express = require("express");
const router = express.Router();
const { createOrUpdateUser, updateAvatar, updateProfile, getProfile, getProfiles } = require("../controllers/userController");

// Health check
router.get("/", (req, res) => {
  res.send("Users route working");
});

// Create or update user (upsert)
router.post("/", createOrUpdateUser);

// Update user avatar/profile picture
router.put("/avatar", updateAvatar);

// Update full profile (displayName, bio, avatarUrl)
router.put("/profile", updateProfile);

// Get single user profile
router.get("/profile", getProfile);

// Get multiple user profiles by emails
router.get("/profiles", getProfiles);

module.exports = router;
