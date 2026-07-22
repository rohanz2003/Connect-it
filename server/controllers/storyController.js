const Story = require("../models/Story");
const Message = require("../models/Message");
const ChatRequest = require("../models/ChatRequest");
const { normalizeEmail } = require("../utils/socketAuth");

exports.createStory = async (req, res) => {
  try {
    const { mediaUrl, mediaType, privacy, caption } = req.body;
    const user = normalizeEmail(req.user.email);

    if (!mediaUrl || !mediaType) {
      return res.status(400).json({ error: "mediaUrl and mediaType are required" });
    }

    const story = await Story.create({
      user,
      mediaUrl,
      mediaType,
      privacy: privacy || "public",
      caption: caption || "",
    });

    const io = req.app.get("io");
    if (io) {
      const connectedUserIds = Object.keys(io.sockets?.adapter?.rooms || {});
      if (privacy === "public") {
        io.emit("new-story", { user });
      } else {
        const acceptedChats = await ChatRequest.find({
          $or: [{ from: user, status: "accepted" }, { to: user, status: "accepted" }],
        }).lean();
        const partners = acceptedChats.map(c => normalizeEmail(c.from === user ? c.to : c.from));
        partners.forEach(partner => {
          io.to(partner).emit("new-story", { user });
        });
      }
    }

    res.status(201).json({ success: true, story });
  } catch (err) {
    console.error("createStory error:", err.message);
    res.status(500).json({ error: "Failed to create story" });
  }
};

exports.getStories = async (req, res) => {
  try {
    const user = normalizeEmail(req.user.email);
    const Stories = await Story.find({ expiresAt: { $gt: new Date() } })
      .sort({ createdAt: -1 })
      .lean();

    const acceptedChats = await ChatRequest.find({
      $or: [{ from: user, status: "accepted" }, { to: user, status: "accepted" }],
    }).lean();
    const acceptedPartners = acceptedChats.map(c => normalizeEmail(c.from === user ? c.to : c.from));

    const filtered = Stories.filter(s => {
      if (s.user === user) return true;
      if (s.privacy === "public") return true;
      return acceptedPartners.includes(s.user);
    });

    const grouped = {};
    filtered.forEach(s => {
      if (!grouped[s.user]) grouped[s.user] = [];
      grouped[s.user].push(s);
    });

    const result = Object.entries(grouped).map(([storyUser, stories]) => ({
      user: storyUser,
      stories: stories.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)),
      hasUnseen: stories.some(s => !s.views?.some(v => v.viewer === user)),
    }));

    res.json({ success: true, stories: result });
  } catch (err) {
    console.error("getStories error:", err.message);
    res.status(500).json({ error: "Failed to fetch stories" });
  }
};

exports.viewStory = async (req, res) => {
  try {
    const { storyId } = req.params;
    const viewer = normalizeEmail(req.user.email);

    const story = await Story.findById(storyId);
    if (!story) return res.status(404).json({ error: "Story not found" });

    const alreadyViewed = story.views.some(v => v.viewer === viewer);
    if (!alreadyViewed) {
      story.views.push({ viewer, viewedAt: new Date() });
      await story.save();
    }

    res.json({ success: true, views: story.views });
  } catch (err) {
    console.error("viewStory error:", err.message);
    res.status(500).json({ error: "Failed to record view" });
  }
};

exports.reactToStory = async (req, res) => {
  try {
    const { storyId } = req.params;
    const { reaction } = req.body;
    const viewer = normalizeEmail(req.user.email);

    if (!reaction) return res.status(400).json({ error: "reaction is required" });

    const story = await Story.findById(storyId);
    if (!story) return res.status(404).json({ error: "Story not found" });

    const existingView = story.views.find(v => v.viewer === viewer);
    if (existingView) {
      existingView.reaction = reaction;
    } else {
      story.views.push({ viewer, viewedAt: new Date(), reaction });
    }
    await story.save();

    res.json({ success: true, views: story.views });
  } catch (err) {
    console.error("reactToStory error:", err.message);
    res.status(500).json({ error: "Failed to add reaction" });
  }
};

exports.commentOnStory = async (req, res) => {
  try {
    const { storyId } = req.params;
    const { text } = req.body;
    const user = normalizeEmail(req.user.email);

    if (!text || !text.trim()) return res.status(400).json({ error: "text is required" });

    const story = await Story.findById(storyId);
    if (!story) return res.status(404).json({ error: "Story not found" });

    story.comments.push({ user, text: text.trim(), createdAt: new Date() });
    await story.save();

    // Send a chat message to the story owner
    try {
      const msg = await Message.create({
        sender: user,
        receiver: story.user,
        text: text.trim(),
        type: "story-comment",
        timestamp: new Date(),
        status: "sent",
      });

      const io = req.app.get("io");
      if (io) {
        io.to(story.user).emit("receive-message", {
          _id: msg._id,
          sender: user,
          receiver: story.user,
          text: text.trim(),
          type: "story-comment",
          timestamp: msg.timestamp,
          status: "sent",
        });
      }
    } catch (msgErr) {
      console.warn("Failed to send story-comment message:", msgErr.message);
    }

    res.json({ success: true, comments: story.comments });
  } catch (err) {
    console.error("commentOnStory error:", err.message);
    res.status(500).json({ error: "Failed to add comment" });
  }
};

exports.deleteStory = async (req, res) => {
  try {
    const { storyId } = req.params;
    const user = normalizeEmail(req.user.email);

    const story = await Story.findById(storyId);
    if (!story) return res.status(404).json({ error: "Story not found" });
    if (story.user !== user) return res.status(403).json({ error: "Unauthorized" });

    await Story.findByIdAndDelete(storyId);
    res.json({ success: true });
  } catch (err) {
    console.error("deleteStory error:", err.message);
    res.status(500).json({ error: "Failed to delete story" });
  }
};
