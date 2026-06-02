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

module.exports = router;