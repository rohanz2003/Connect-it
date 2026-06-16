const User = require("../modules/User");

const ROLES = {
  USER: "user",
  MODERATOR: "moderator",
  ADMIN: "admin",
};

const ROLE_HIERARCHY = {
  [ROLES.USER]: 0,
  [ROLES.MODERATOR]: 1,
  [ROLES.ADMIN]: 2,
};

/**
 * Middleware: authorizeRole
 * Checks that the authenticated user has at least the specified role.
 * Must be used AFTER authenticateUser middleware.
 * Usage: router.get("/admin", authenticateUser, authorizeRole("admin"), handler)
 */
const authorizeRole = (...allowedRoles) => {
  return async (req, res, next) => {
    try {
      if (!req.user || !req.user.email) {
        return res.status(401).json({ error: "Authentication required." });
      }

      // Fetch user from database to get current role
      const user = await User.findOne({ email: req.user.email }).lean();
      if (!user) {
        // Allow basic access for new users (default role: user)
        req.user.role = ROLES.USER;
        return next();
      }

      const userRole = user.role || ROLES.USER;
      req.user.role = userRole;
      req.user.userId = user._id;

      // Check if user's role meets the minimum required level
      const userLevel = ROLE_HIERARCHY[userRole] ?? -1;
      const hasAccess = allowedRoles.some((role) => {
        const requiredLevel = ROLE_HIERARCHY[role] ?? -1;
        return userLevel >= requiredLevel;
      });

      if (!hasAccess) {
        return res.status(403).json({
          error: "Insufficient permissions.",
          required: allowedRoles,
          userRole,
        });
      }

      next();
    } catch (err) {
      console.error("❌ authorizeRole error:", err.message);
      return res.status(500).json({ error: "Authorization error." });
    }
  };
};

/**
 * Middleware: authorizeAdmin
 * Shortcut for admin-only routes.
 */
const authorizeAdmin = authorizeRole(ROLES.ADMIN);

/**
 * Middleware: authorizeModerator
 * Shortcut for moderator+ routes.
 */
const authorizeModerator = authorizeRole(ROLES.MODERATOR, ROLES.ADMIN);

module.exports = { authorizeRole, authorizeAdmin, authorizeModerator, ROLES };
