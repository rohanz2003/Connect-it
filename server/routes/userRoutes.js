const express = require("express");
const router = express.Router();
const { createOrUpdateUser, updateAvatar } = require("../controllers/userController");

// Health check
router.get("/", (req, res) => {
  res.send("Users route working");
});

// Create or update user (upsert)
router.post("/", createOrUpdateUser);

// Update user avatar/profile picture
router.put("/avatar", updateAvatar);

// Get user profile by email
router.get("/:email", async (req, res) => {
  try {
    const User = require("../models/UserProfile");
    const user = await User.findOne({ email: req.params.email.toLowerCase() }).lean();
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch user" });
  }
});

module.exports = router;