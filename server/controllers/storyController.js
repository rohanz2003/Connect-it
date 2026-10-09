const Story = require("../models/Story");
const Message = require("../models/Message");
const ChatRequest = require("../models/ChatRequest");
const { normalizeEmail } = require("../utils/socketAuth");

const getAcceptedPartners = async (user) => {
  const acceptedChats = await ChatRequest.find({
    status: "accepted",
    $or: [{ from: user }, { to: user }],
  }).lean();
  return [...new Set(acceptedChats.map(c => normalizeEmail(c.from === user ? c.to : c.from)))];
};

const getAccessibleStory = async (storyId, user) => {
  const story = await Story.findById(storyId);
  // MongoDB's TTL cleanup is asynchronous; enforce expiration on reads too.
  if (!story || !(story.expiresAt > new Date())) return null;
  if (story.user === user || story.privacy === "public") return story;
  if (story.privacy !== "private") return null;
  const accepted = await ChatRequest.exists({
    status: "accepted",
    $or: [{ from: user, to: story.user }, { from: story.user, to: user }],
  });
  return accepted ? story : null;
};

// Replies are also direct messages. Only the owner sees everyone's replies/views.
const visibleViews = (story, user) => story.user === user
  ? story.views || []
  : (story.views || []).filter(v => v.viewer === user);
const visibleComments = (story, user) => story.user === user
  ? story.comments || []
  : (story.comments || []).filter(c => c.user === user);

exports.createStory = async (req, res) => {
  try {
    const { mediaUrl, mediaType, privacy = "public", caption = "" } = req.body || {};
    const user = normalizeEmail(req.user.email);

    if (typeof mediaUrl !== "string" || !mediaUrl.trim() || !["image", "video"].includes(mediaType)) {
      return res.status(400).json({ error: "mediaUrl and an image or video mediaType are required" });
    }
    if (!["public", "private"].includes(privacy) || typeof caption !== "string") {
      return res.status(400).json({ error: "privacy must be public or private and caption must be text" });
    }

    const story = await Story.create({
      user,
      mediaUrl,
      mediaType,
      privacy,
      caption,
    });

    const io = req.app.get("io");
    if (io) {
      try {
        if (story.privacy === "public") {
          io.emit("new-story", { user });
        } else {
          const partners = await getAcceptedPartners(user);
          new Set([user, ...partners]).forEach(partner => {
            io.to(partner).emit("new-story", { user });
          });
        }
      } catch (notificationErr) {
        console.warn("Failed to notify about new story:", notificationErr.message);
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
    const acceptedPartners = await getAcceptedPartners(user);
    const stories = await Story.find({
      expiresAt: { $gt: new Date() },
      $or: [
        { user },
        { privacy: "public" },
        { privacy: "private", user: { $in: acceptedPartners } },
      ],
    })
      .sort({ createdAt: -1 })
      .lean();

    const grouped = Object.create(null);
    stories.forEach(s => {
      if (!grouped[s.user]) grouped[s.user] = [];
      grouped[s.user].push({ ...s, views: visibleViews(s, user), comments: visibleComments(s, user) });
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

    const story = await getAccessibleStory(storyId, viewer);
    if (!story) return res.status(404).json({ error: "Story not found" });

    const alreadyViewed = story.views.some(v => v.viewer === viewer);
    if (!alreadyViewed) {
      story.views.push({ viewer, viewedAt: new Date() });
      await story.save();
    }

    res.json({ success: true, views: visibleViews(story, viewer) });
  } catch (err) {
    console.error("viewStory error:", err.message);
    res.status(500).json({ error: "Failed to record view" });
  }
};

exports.reactToStory = async (req, res) => {
  try {
    const { storyId } = req.params;
    const { reaction } = req.body || {};
    const viewer = normalizeEmail(req.user.email);

    if (typeof reaction !== "string" || !reaction.trim()) {
      return res.status(400).json({ error: "reaction must be non-empty text" });
    }

    const story = await getAccessibleStory(storyId, viewer);
    if (!story) return res.status(404).json({ error: "Story not found" });

    const existingView = story.views.find(v => v.viewer === viewer);
    if (existingView) {
      existingView.reaction = reaction;
    } else {
      story.views.push({ viewer, viewedAt: new Date(), reaction });
    }
    await story.save();

    res.json({ success: true, views: visibleViews(story, viewer) });
  } catch (err) {
    console.error("reactToStory error:", err.message);
    res.status(500).json({ error: "Failed to add reaction" });
  }
};

exports.commentOnStory = async (req, res) => {
  try {
    const { storyId } = req.params;
    const { text } = req.body || {};
    const user = normalizeEmail(req.user.email);

    if (typeof text !== "string" || !text.trim()) return res.status(400).json({ error: "text is required" });

    const story = await getAccessibleStory(storyId, user);
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

    res.json({ success: true, comments: visibleComments(story, user) });
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
