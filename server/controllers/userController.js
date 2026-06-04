const User = require("../models/UserProfile");

// Create or update a user record (e.g., update lastSeen)
exports.createOrUpdateUser = async (req, res) => {
  try {
    const { email, lastSeen, displayName, profilePic } = req.body;
    if (!email) return res.status(400).json({ error: "email is required" });

    const user = await User.findOneAndUpdate(
      { email: email.toLowerCase() },
      { 
        lastSeen: lastSeen || new Date(), 
        email: email.toLowerCase(),
        displayName: displayName,
        profilePic: profilePic
      },
      { upsert: true, new: true }
    );

    res.json({ success: true, user });
  } catch (err) {
    console.error("Error creating/updating user:", err.message);
    res.status(500).json({ error: "Failed to create/update user" });
  }
};

// Update user's avatar/profile picture URL
exports.updateAvatar = async (req, res) => {
  try {
    const { email, profilePic } = req.body;
    if (!email || !profilePic) return res.status(400).json({ error: "email and profilePic are required" });

    const user = await User.findOneAndUpdate(
      { email: email.toLowerCase() },
      { profilePic },
      { upsert: true, new: true }
    );

    res.json({ success: true, user });
  } catch (err) {
    console.error("Error updating avatar:", err.message);
    res.status(500).json({ error: "Failed to update avatar" });
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