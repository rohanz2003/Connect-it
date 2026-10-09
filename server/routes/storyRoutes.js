const express = require("express");
const router = express.Router();
const firebaseAuth = require("../middleware/firebaseAuth");
const { isDatabaseConnected } = require("../config/database");
const {
  createStory,
  getStories,
  viewStory,
  reactToStory,
  commentOnStory,
  deleteStory,
} = require("../controllers/storyController");

router.use((req, res, next) => {
  if (!isDatabaseConnected()) {
    return res.status(503).json({ error: "Database unavailable" });
  }
  next();
});

router.param("storyId", (req, res, next, storyId) => {
  if (!/^[a-f\d]{24}$/i.test(storyId)) {
    return res.status(400).json({ error: "Invalid story ID" });
  }
  next();
});

router.post("/", firebaseAuth, createStory);
router.get("/", firebaseAuth, getStories);
router.post("/:storyId/view", firebaseAuth, viewStory);
router.post("/:storyId/react", firebaseAuth, reactToStory);
router.post("/:storyId/comment", firebaseAuth, commentOnStory);
router.delete("/:storyId", firebaseAuth, deleteStory);

module.exports = router;
