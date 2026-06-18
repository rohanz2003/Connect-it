const express = require("express");
const router = express.Router();
const {
  blockUser,
  createOrUpdateUser,
  deleteAccount,
  exchangePublicKeys,
  getBlockedUsers,
  getLastSeen,
  getProfile,
  getProfiles,
  getPublicKey,
  heartbeat,
  reportUser,
  unblockUser,
  updateAvatar,
  updatePrivacy,
  updateProfile,
  updatePublicKey,
} = require("../controllers/userController");
const { requireAuth } = require("../middleware/auth");
const {
  blockRules,
  emailParamRules,
  lastSeenRules,
  privacyRules,
  profileRules,
  publicKeyRules,
  reportRules,
} = require("../middleware/validators");

// Health check
router.get("/", (req, res) => {
  res.send("Users route working");
});

// Create or update user (upsert)
router.post("/", requireAuth, createOrUpdateUser);

// Heartbeat - update lastSeen
router.post("/heartbeat", requireAuth, heartbeat);

// Update user avatar/profile picture
router.put("/avatar", requireAuth, profileRules, updateAvatar);

// Update full profile (displayName, bio, avatarUrl)
router.put("/profile", requireAuth, profileRules, updateProfile);

// Get single user profile
router.get("/profile", requireAuth, getProfile);

// Get multiple user profiles by emails
router.get("/profiles", requireAuth, getProfiles);

router.put("/public-key", requireAuth, publicKeyRules, updatePublicKey);
router.post("/exchange-keys", requireAuth, exchangePublicKeys);
router.get("/:email/public-key", requireAuth, emailParamRules, getPublicKey);

router.put("/privacy", requireAuth, privacyRules, updatePrivacy);
router.post("/block", requireAuth, blockRules, blockUser);
router.post("/unblock", requireAuth, blockRules, unblockUser);
router.get("/blocked", requireAuth, getBlockedUsers);
router.post("/report", requireAuth, reportRules, reportUser);

// Delete user account and all associated data
router.delete("/delete-account", requireAuth, deleteAccount);

// Get last seen for a user by email
router.get("/:id/lastseen", requireAuth, lastSeenRules, getLastSeen);

module.exports = router;
