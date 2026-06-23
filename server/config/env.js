const path = require("path");

// Load server/.env in local dev. On Render, variables come from the dashboard (not .env file).
require("dotenv").config({
  path: path.join(__dirname, "..", ".env"),
  quiet: Boolean(process.env.RENDER),
});

const getEmailPassword = () =>
  process.env.SMTP_PASS ||
  process.env.EMAIL_PASS ||
  process.env.EMAIL_PASSWORD ||
  process.env.GMAIL_APP_PASSWORD;

const hasAnyEmailConfig = () => {
  const user = process.env.SMTP_USER || process.env.EMAIL_USER;
  const pass = getEmailPassword();
  return Boolean(user && pass);
};

const getFrontendUrl = () =>
  process.env.FRONTEND_URL || process.env.CLIENT_URL || "";

const getCorsOrigins = () => {
  const origins = new Set([
    "http://localhost:3000",
    "https://connect-it-frontend.vercel.app",
    "https://connect-it.vercel.app",
  ]);

  const frontend = getFrontendUrl();
  if (frontend) origins.add(frontend.replace(/\/$/, ""));

  return Array.from(origins).filter(Boolean);
};

const logEnvironmentDiagnostics = () => {
  console.log("=== Environment Loaded ===");
  console.log("Mongo URI Exists:", Boolean(process.env.MONGO_URI));
  console.log("JWT Exists:", Boolean(process.env.JWT_SECRET));
  const emailUser = process.env.SMTP_USER || process.env.EMAIL_USER;
  const emailPass = getEmailPassword();
  console.log("Email User:", emailUser || "NOT SET");
  console.log("Email Password:", emailPass ? "set ✅" : "NOT SET ❌");
  console.log("Email Provider:", hasAnyEmailConfig() ? "Gmail SMTP ✅" : "NONE (log-only) ❌");
  console.log("Admin Email:", process.env.ADMIN_EMAIL || "NOT SET");
  console.log("Frontend URL:", getFrontendUrl() || "(not set)");
  console.log("Render Deploy:", process.env.RENDER === "true");
  console.log("Port:", process.env.PORT || "(default 5000)");
};

const validateRequiredEnv = () => {
  const missing = [];
  if (!process.env.MONGO_URI) missing.push("MONGO_URI");
  if (!process.env.JWT_SECRET) missing.push("JWT_SECRET");
  if (!hasAnyEmailConfig()) missing.push("EMAIL config (set SMTP_USER + SMTP_PASS in .env)");
  if (!process.env.ADMIN_EMAIL) missing.push("ADMIN_EMAIL");

  if (missing.length > 0) {
    console.error("❌ CRITICAL: Missing environment variables:", missing.join(", "));
    console.warn("💡 TIP: Add these in your Render Dashboard -> Environment tab!");
    return false;
  }
  console.log("✅ All required environment variables are present.");
  return true;
};

module.exports = {
  getEmailPassword,
  getFrontendUrl,
  getCorsOrigins,
  logEnvironmentDiagnostics,
  validateRequiredEnv,
};
