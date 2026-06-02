const jwt = require("jsonwebtoken");

const adminAuthMiddleware = (req, res, next) => {
  // Get token from header
  const token = req.header("Authorization");

  // Check if no token
  if (!token) {
    return res.status(401).json({ message: "No token, authorization denied" });
  }

  // Expecting token in format "Bearer TOKEN"
  const tokenParts = token.split(" ");
  if (tokenParts.length !== 2 || tokenParts[0] !== "Bearer") {
    return res.status(401).json({ message: "Token format is 'Bearer TOKEN'" });
  }
  const actualToken = tokenParts[1];

  try {
    const decoded = jwt.verify(actualToken, process.env.JWT_SECRET);
    // Attach the decoded admin email to the request object
    req.adminEmail = decoded.email;
    next(); // Proceed to the next middleware or route handler
  } catch (err) {
    console.error("JWT verification failed:", err.message);
    res.status(401).json({ message: "Token is not valid or expired" });
  }
};

module.exports = adminAuthMiddleware;