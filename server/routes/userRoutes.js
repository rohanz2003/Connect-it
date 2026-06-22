const express = require("express");
const router = express.Router();
const firebaseAuth = require("../middleware/firebaseAuth");
const { createOrUpdateUser, updateAvatar, updateProfile, getProfile, getProfiles, getLastSeen, heartbeat, deleteAccount, getAllUsers } = require("../controllers/userController");

router.get("/", (req, res) => {
  res.send("Users route working");
});

router.post("/", createOrUpdateUser);

router.post("/heartbeat", firebaseAuth, heartbeat);

router.put("/avatar", firebaseAuth, updateAvatar);

router.put("/profile", firebaseAuth, updateProfile);

router.get("/profile", firebaseAuth, getProfile);

router.get("/profiles", firebaseAuth, getProfiles);

router.delete("/delete-account", firebaseAuth, deleteAccount);

router.get("/all", firebaseAuth, getAllUsers);

router.get("/:id/lastseen", firebaseAuth, getLastSeen);

module.exports = router;
