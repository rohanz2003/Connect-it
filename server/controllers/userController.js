const User = require("../modules/User");

exports.createOrUpdateUser = async (req, res) => {
  try {
    const { email, lastSeen } = req.body;
    if (!email) return res.status(400).json({ error: "email is required" });

    const user = await User.findOneAndUpdate(
      { email: email.toLowerCase() },
      { lastSeen: lastSeen || new Date(), email: email.toLowerCase() },
      { upsert: true, new: true }
    );

    res.json({ success: true, user });
  } catch (err) {
    console.error("Error creating/updating user:", err.message);
    res.status(500).json({ error: "Failed to create/update user" });
  }
};

exports.updateAvatar = async (req, res) => {
  try {
    const { email, avatarUrl } = req.body;
    if (!email) return res.status(400).json({ error: "email is required" });

    const update = { avatarUrl: avatarUrl || null };
    const user = await User.findOneAndUpdate(
      { email: email.toLowerCase() },
      update,
      { upsert: true, new: true }
    );

    res.json({ success: true, user });
  } catch (err) {
    console.error("Error updating avatar:", err.message);
    res.status(500).json({ error: "Failed to update avatar" });
  }
};

exports.updateProfile = async (req, res) => {
  try {
    const { email, displayName, bio, avatarUrl } = req.body;
    if (!email) return res.status(400).json({ error: "email is required" });

    const update = {};
    if (displayName !== undefined) update.displayName = displayName;
    if (bio !== undefined) update.bio = bio;
    if (avatarUrl !== undefined) update.avatarUrl = avatarUrl;

    const user = await User.findOneAndUpdate(
      { email: email.toLowerCase() },
      { $set: update },
      { upsert: true, new: true }
    );

    res.json({ success: true, user });
  } catch (err) {
    console.error("Error updating profile:", err.message);
    res.status(500).json({ error: "Failed to update profile" });
  }
};

exports.getProfile = async (req, res) => {
  try {
    const { email } = req.query;
    if (!email) return res.status(400).json({ error: "email is required" });

    const user = await User.findOne({ email: email.toLowerCase() }).select("email displayName bio avatarUrl lastSeen");
    if (!user) return res.json({ success: true, user: null });

    res.json({ success: true, user });
  } catch (err) {
    console.error("Error fetching profile:", err.message);
    res.status(500).json({ error: "Failed to fetch profile" });
  }
};

exports.getProfiles = async (req, res) => {
  try {
    const { emails } = req.query;
    if (!emails) return res.status(400).json({ error: "emails query param is required" });

    const emailList = emails.split(",").map(e => e.toLowerCase().trim());
    const users = await User.find({ email: { $in: emailList } })
      .select("email displayName bio avatarUrl lastSeen")
      .lean();

    const profileMap = {};
    users.forEach(u => {
      profileMap[u.email] = {
        displayName: u.displayName || null,
        bio: u.bio || null,
        avatarUrl: u.avatarUrl || null,
        lastSeen: u.lastSeen || null,
      };
    });

    res.json({ success: true, profiles: profileMap });
  } catch (err) {
    console.error("Error fetching profiles:", err.message);
    res.status(500).json({ error: "Failed to fetch profiles" });
  }
};

exports.updateLastSeen = async (userId) => {
  try {
    await User.findOneAndUpdate(
      { email: userId },
      { lastSeen: new Date() },
      { upsert: true }
    );
  } catch (err) {
    console.error("Error updating lastSeen:", err.message);
  }
};

exports.getLastSeen = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ error: "User id is required" });

    const user = await User.findOne({ email: id.toLowerCase() }).select("email lastSeen");
    if (!user) return res.json({ success: true, lastSeen: null });

    res.json({ success: true, lastSeen: user.lastSeen || null });
  } catch (err) {
    console.error("Error fetching lastSeen:", err.message);
    res.status(500).json({ error: "Failed to fetch lastSeen" });
  }
};

exports.deleteAccount = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "email is required" });

    const normalizedEmail = email.toLowerCase();

    const Message = require("../models/Message");
    const ClearedChat = require("../models/ClearedChat");
    const Feedback = require("../models/Feedback");
    const PushSubscription = require("../models/PushSubscription");
    const DeviceModel = require("../models/Device");
    const ChatRequestModel = require("../models/ChatRequest");

    await Promise.all([
      User.deleteOne({ email: normalizedEmail }),
      Message.deleteMany({
        $or: [{ sender: normalizedEmail }, { receiver: normalizedEmail }],
      }),
      ClearedChat.deleteMany({
        $or: [{ user: normalizedEmail }, { partner: normalizedEmail }],
      }),
      ChatRequestModel.deleteMany({
        $or: [{ from: normalizedEmail }, { to: normalizedEmail }],
      }),
      Feedback.deleteMany({ email: normalizedEmail }),
      PushSubscription.deleteMany({ userId: normalizedEmail }),
      DeviceModel.deleteMany({ userId: normalizedEmail }),
    ]);

    res.json({ success: true, message: "Account data deleted" });
  } catch (err) {
    console.error("Error deleting account:", err.message);
    res.status(500).json({ error: "Failed to delete account" });
  }
};

exports.getAllUsers = async (req, res) => {
  try {
    const users = await User.find({})
      .select("email displayName bio avatarUrl lastSeen")
      .lean();
    res.json({ success: true, users });
  } catch (err) {
    console.error("Error fetching all users:", err.message);
    res.status(500).json({ error: "Failed to fetch users" });
  }
};

exports.heartbeat = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "email is required" });

    await User.findOneAndUpdate(
      { email: email.toLowerCase() },
      { lastSeen: new Date() },
      { upsert: false }
    );

    res.json({ success: true });
  } catch (err) {
    console.error("Error updating heartbeat:", err.message);
    res.status(500).json({ error: "Failed to update heartbeat" });
  }
};
