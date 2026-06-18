const User = require("../modules/User");
const { normalizeEmail } = require("../utils/socketAuth");

const roleHierarchy = {
  user: 1,
  moderator: 2,
  admin: 3,
};

const attachUserRole = async (req, res, next) => {
  try {
    if (!req.user?.email) {
      return res.status(401).json({ error: "Authentication required" });
    }
    const user = await User.findOne({
      email: normalizeEmail(req.user.email),
    }).select("role email");
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    req.user.role = user.role || "user";
    next();
  } catch (err) {
    console.error("attachUserRole error:", err.message);
    res.status(500).json({ error: "Failed to resolve user role" });
  }
};

const authorize = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user?.role) {
      return res.status(403).json({ error: "Role not assigned" });
    }
    const userLevel = roleHierarchy[req.user.role] || 0;
    const minRequired = Math.min(
      ...allowedRoles.map((r) => roleHierarchy[r] || 0)
    );
    if (userLevel < minRequired) {
      return res
        .status(403)
        .json({ error: "Insufficient permissions" });
    }
    next();
  };
};

const authorizeAdmin = authorize("admin");
const authorizeModerator = authorize("moderator", "admin");

module.exports = {
  attachUserRole,
  authorize,
  authorizeAdmin,
  authorizeModerator,
  roleHierarchy,
};
