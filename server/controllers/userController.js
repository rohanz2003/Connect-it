const User = require("../modules/User");
const Report = require("../models/Report");
const { writeAuditLog } = require("../services/auditService");
const { normalizeEmail } = require("../utils/socketAuth");

const sanitizePublicUser = (user, requesterEmail = null) => {
  if (!user) return null;
  const plain = typeof user.toObject === "function" ? user.toObject() : user;
  const isSelf = normalizeEmail(requesterEmail) === normalizeEmail(plain.email);
  return {
    email: plain.email,
    displayName: plain.displayName || null,
    bio: plain.bio || null,
    avatarUrl: plain.avatarUrl || null,
    lastSeen: plain.privacy?.hideLastSeen && !isSelf ? null : plain.lastSeen || null,
    privacy: isSelf ? plain.privacy : undefined,
    publicKey: plain.publicKey || null,
    publicKeyUpdatedAt: plain.publicKeyUpdatedAt || null,
  };
};

exports.createOrUpdateUser = async (req, res) => {
  try {
    const { email, lastSeen } = req.body;
    if (!email) return res.status(400).json({ error: "email is required" });
    const normalizedEmail = normalizeEmail(email);
    if (req.user?.email !== normalizedEmail) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const user = await User.findOneAndUpdate(
      { email: normalizedEmail },
      { lastSeen: lastSeen || new Date(), email: normalizedEmail },
      { upsert: true, new: true }
    );

    res.json({ success: true, user: sanitizePublicUser(user, normalizedEmail) });
  } catch (err) {
    console.error("Error creating/updating user:", err.message);
    res.status(500).json({ error: "Failed to create/update user" });
  }
};

exports.updateAvatar = async (req, res) => {
  try {
    const { email, avatarUrl } = req.body;
    if (!email) return res.status(400).json({ error: "email is required" });
    const normalizedEmail = normalizeEmail(email);
    if (req.user?.email !== normalizedEmail) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const update = { avatarUrl: avatarUrl || null };
    const user = await User.findOneAndUpdate(
      { email: normalizedEmail },
      update,
      { upsert: true, new: true }
    );

    await writeAuditLog({ actor: normalizedEmail, action: "account_changed", req });
    res.json({ success: true, user: sanitizePublicUser(user, normalizedEmail) });
  } catch (err) {
    console.error("Error updating avatar:", err.message);
    res.status(500).json({ error: "Failed to update avatar" });
  }
};

exports.updateProfile = async (req, res) => {
  try {
    const { email, displayName, bio, avatarUrl } = req.body;
    if (!email) return res.status(400).json({ error: "email is required" });
    const normalizedEmail = normalizeEmail(email);
    if (req.user?.email !== normalizedEmail) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const update = {};
    if (displayName !== undefined) update.displayName = displayName;
    if (bio !== undefined) update.bio = bio;
    if (avatarUrl !== undefined) update.avatarUrl = avatarUrl;

    const user = await User.findOneAndUpdate(
      { email: normalizedEmail },
      { $set: update },
      { upsert: true, new: true }
    );

    await writeAuditLog({ actor: normalizedEmail, action: "account_changed", req });
    res.json({ success: true, user: sanitizePublicUser(user, normalizedEmail) });
  } catch (err) {
    console.error("Error updating profile:", err.message);
    res.status(500).json({ error: "Failed to update profile" });
  }
};

exports.getProfile = async (req, res) => {
  try {
    const { email } = req.query;
    if (!email) return res.status(400).json({ error: "email is required" });

    const user = await User.findOne({ email: normalizeEmail(email) }).select("email displayName bio avatarUrl lastSeen privacy publicKey publicKeyUpdatedAt");
    if (!user) return res.json({ success: true, user: null });

    res.json({ success: true, user: sanitizePublicUser(user, req.user?.email) });
  } catch (err) {
    console.error("Error fetching profile:", err.message);
    res.status(500).json({ error: "Failed to fetch profile" });
  }
};

exports.getProfiles = async (req, res) => {
  try {
    const { emails } = req.query;
    if (!emails) return res.status(400).json({ error: "emails query param is required" });

    const emailList = emails.split(",").map(e => normalizeEmail(e)).filter(Boolean).slice(0, 100);
    const users = await User.find({ email: { $in: emailList } })
      .select("email displayName bio avatarUrl lastSeen privacy publicKey publicKeyUpdatedAt")
      .lean();

    const profileMap = {};
    users.forEach(u => {
      profileMap[u.email] = sanitizePublicUser(u, req.user?.email);
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
      { email: normalizeEmail(userId) },
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

    const user = await User.findOne({ email: normalizeEmail(id) }).select("email lastSeen privacy");
    if (!user) return res.json({ success: true, lastSeen: null });
    if (user.privacy?.hideLastSeen && req.user?.email !== user.email) {
      return res.json({ success: true, lastSeen: null });
    }

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

    const normalizedEmail = normalizeEmail(email);
    if (req.user?.email !== normalizedEmail) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const Message = require("../models/Message");
    const ClearedChat = require("../models/ClearedChat");
    const Feedback = require("../models/Feedback");
    const PushSubscription = require("../models/PushSubscription");
    const DeviceModel = require("../models/Device");

    await Promise.all([
      User.deleteOne({ email: normalizedEmail }),
      Message.deleteMany({
        $or: [{ sender: normalizedEmail }, { receiver: normalizedEmail }],
      }),
      ClearedChat.deleteMany({
        $or: [{ user: normalizedEmail }, { partner: normalizedEmail }],
      }),
      Feedback.deleteMany({ email: normalizedEmail }),
      PushSubscription.deleteMany({ userId: normalizedEmail }),
      DeviceModel.deleteMany({ userId: normalizedEmail }),
    ]);

    await writeAuditLog({ actor: normalizedEmail, action: "account_changed", req });
    res.json({ success: true, message: "Account data deleted" });
  } catch (err) {
    console.error("Error deleting account:", err.message);
    res.status(500).json({ error: "Failed to delete account" });
  }
};

exports.heartbeat = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "email is required" });
    const normalizedEmail = normalizeEmail(email);
    if (req.user?.email !== normalizedEmail) {
      return res.status(403).json({ error: "Forbidden" });
    }

    await User.findOneAndUpdate(
      { email: normalizedEmail },
      { lastSeen: new Date() },
      { upsert: true }
    );

    res.json({ success: true });
  } catch (err) {
    console.error("Error updating heartbeat:", err.message);
    res.status(500).json({ error: "Failed to update heartbeat" });
  }
};

exports.updatePublicKey = async (req, res) => {
  try {
    const email = req.user.email;
    const user = await User.findOneAndUpdate(
      { email },
      {
        $set: {
          email,
          publicKey: req.body.publicKey,
          publicKeyUpdatedAt: new Date(),
        },
      },
      { upsert: true, new: true }
    );
    await writeAuditLog({ actor: email, action: "account_changed", req, metadata: { field: "publicKey" } });
    res.json({ success: true, publicKey: user.publicKey, publicKeyUpdatedAt: user.publicKeyUpdatedAt });
  } catch (err) {
    console.error("Error updating public key:", err.message);
    res.status(500).json({ error: "Failed to update public key" });
  }
};

exports.getPublicKey = async (req, res) => {
  try {
    const email = normalizeEmail(req.params.email);
    const user = await User.findOne({ email }).select("email publicKey publicKeyUpdatedAt").lean();
    if (!user?.publicKey) {
      return res.status(404).json({ error: "Public key not found" });
    }
    res.json({
      success: true,
      email: user.email,
      publicKey: user.publicKey,
      publicKeyUpdatedAt: user.publicKeyUpdatedAt,
    });
  } catch (err) {
    console.error("Error fetching public key:", err.message);
    res.status(500).json({ error: "Failed to fetch public key" });
  }
};

exports.exchangePublicKeys = async (req, res) => {
  try {
    const email = req.user.email;
    const peers = Array.isArray(req.body.peers) ? req.body.peers : [req.body.peerEmail].filter(Boolean);
    if (req.body.publicKey) {
      await User.findOneAndUpdate(
        { email },
        { $set: { email, publicKey: req.body.publicKey, publicKeyUpdatedAt: new Date() } },
        { upsert: true }
      );
    }

    const peerEmails = peers.map((peer) => normalizeEmail(peer)).filter(Boolean).slice(0, 50);
    const users = await User.find({ email: { $in: peerEmails } })
      .select("email publicKey publicKeyUpdatedAt")
      .lean();

    res.json({
      success: true,
      keys: Object.fromEntries(users.filter((u) => u.publicKey).map((u) => [u.email, {
        publicKey: u.publicKey,
        publicKeyUpdatedAt: u.publicKeyUpdatedAt,
      }])),
    });
  } catch (err) {
    console.error("Error exchanging public keys:", err.message);
    res.status(500).json({ error: "Failed to exchange public keys" });
  }
};

exports.updatePrivacy = async (req, res) => {
  try {
    const email = req.user.email;
    const update = {};
    ["hideLastSeen", "hideOnlineStatus", "hideReadReceipts"].forEach((field) => {
      if (req.body[field] !== undefined) {
        update[`privacy.${field}`] = Boolean(req.body[field]);
      }
    });
    if (req.body.disappearingMessages) {
      if (req.body.disappearingMessages.enabled !== undefined) {
        update["privacy.disappearingMessages.enabled"] = Boolean(req.body.disappearingMessages.enabled);
      }
      if (req.body.disappearingMessages.durationSeconds !== undefined) {
        update["privacy.disappearingMessages.durationSeconds"] = Number(req.body.disappearingMessages.durationSeconds);
      }
    }

    const user = await User.findOneAndUpdate(
      { email },
      { $set: update },
      { upsert: true, new: true }
    );

    await writeAuditLog({ actor: email, action: "privacy_changed", req, metadata: update });
    res.json({ success: true, privacy: user.privacy });
  } catch (err) {
    console.error("Error updating privacy:", err.message);
    res.status(500).json({ error: "Failed to update privacy settings" });
  }
};

exports.blockUser = async (req, res) => {
  try {
    const email = req.user.email;
    const targetEmail = normalizeEmail(req.body.targetEmail);
    await User.findOneAndUpdate(
      { email },
      { $addToSet: { blockedUsers: targetEmail }, $setOnInsert: { email } },
      { upsert: true }
    );
    await writeAuditLog({ actor: email, action: "user_blocked", target: targetEmail, req });
    res.json({ success: true });
  } catch (err) {
    console.error("Error blocking user:", err.message);
    res.status(500).json({ error: "Failed to block user" });
  }
};

exports.unblockUser = async (req, res) => {
  try {
    const email = req.user.email;
    const targetEmail = normalizeEmail(req.body.targetEmail);
    await User.updateOne({ email }, { $pull: { blockedUsers: targetEmail } });
    await writeAuditLog({ actor: email, action: "user_unblocked", target: targetEmail, req });
    res.json({ success: true });
  } catch (err) {
    console.error("Error unblocking user:", err.message);
    res.status(500).json({ error: "Failed to unblock user" });
  }
};

exports.getBlockedUsers = async (req, res) => {
  try {
    const user = await User.findOne({ email: req.user.email }).select("blockedUsers").lean();
    res.json({ success: true, blockedUsers: user?.blockedUsers || [] });
  } catch (err) {
    console.error("Error fetching blocked users:", err.message);
    res.status(500).json({ error: "Failed to fetch blocked users" });
  }
};

exports.reportUser = async (req, res) => {
  try {
    const reporter = req.user.email;
    const reportedUser = normalizeEmail(req.body.targetEmail);
    const report = await Report.create({
      reporter,
      reportedUser,
      reason: req.body.reason,
      messageId: req.body.messageId || null,
    });
    await writeAuditLog({ actor: reporter, action: "user_reported", target: reportedUser, req });
    res.status(201).json({ success: true, reportId: report._id });
  } catch (err) {
    console.error("Error reporting user:", err.message);
    res.status(500).json({ error: "Failed to report user" });
  }
};
