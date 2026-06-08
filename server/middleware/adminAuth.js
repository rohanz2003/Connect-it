// Admin Authentication Middleware
require("dotenv").config();

const verifyAdminToken = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  const adminToken = process.env.ADMIN_TOKEN;

  if (!token || token !== adminToken) {
    return res.status(401).json({ error: "Unauthorized: Invalid or missing admin token" });
  }

  next();
};

module.exports = { verifyAdminToken };
