const express = require("express");
const router = express.Router();
const firebaseAuth = require("../middleware/firebaseAuth");
const {
  createStory,
  getStories,
  viewStory,
  reactToStory,
  commentOnStory,
  deleteStory,
} = require("../controllers/storyController");

router.post("/", firebaseAuth, createStory);
router.get("/", firebaseAuth, getStories);
router.post("/:storyId/view", firebaseAuth, viewStory);
router.post("/:storyId/react", firebaseAuth, reactToStory);
router.post("/:storyId/comment", firebaseAuth, commentOnStory);
router.delete("/:storyId", firebaseAuth, deleteStory);

module.exports = router;
