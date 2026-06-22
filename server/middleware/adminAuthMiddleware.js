const jwt = require("jsonwebtoken");

const adminAuthMiddleware = (req, res, next) => {
  const token = req.header("Authorization");

  if (!token) {
    return res.status(401).json({ message: "No token, authorization denied" });
  }

  const tokenParts = token.split(" ");
  if (tokenParts.length !== 2 || tokenParts[0] !== "Bearer") {
    return res.status(401).json({ message: "Token format is 'Bearer TOKEN'" });
  }
  const actualToken = tokenParts[1];

  try {
    const decoded = jwt.verify(actualToken, process.env.JWT_SECRET, {
      algorithms: ["HS256"],
    });

    const adminEmail = (process.env.ADMIN_EMAIL || "").toLowerCase().trim();
    if (!adminEmail) {
      return res.status(500).json({ message: "Server configuration error" });
    }

    if (!decoded.email || decoded.email.toLowerCase().trim() !== adminEmail) {
      return res.status(403).json({ message: "Not authorized as admin" });
    }

    req.adminEmail = decoded.email;
    next();
  } catch (err) {
    console.error("JWT verification failed:", err.message);
    res.status(401).json({ message: "Token is not valid or expired" });
  }
};

module.exports = adminAuthMiddleware;